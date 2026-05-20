import * as THREE from 'three';
import { TRACKS, DEFAULT_TRACK } from './tracks/monaco.js';
import { TrackSampler } from './TrackSampler.js';

const TRACK_WIDTH_DEFAULT = 14;

export function createTrackPath(trackDef = TRACKS[DEFAULT_TRACK]) {
  // 'centripetal' avoids overshooting on tight corners (critical for hairpins)
  return new THREE.CatmullRomCurve3(trackDef.points, true, 'centripetal');
}

function createTrackSurface(curve, trackWidth) {
  const segments = 600;
  const positions = [];
  const normals = [];
  const indices = [];

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent).normalize();

    binormal.crossVectors(tangent, up).normalize();
    if (binormal.lengthSq() < 0.001) binormal.set(1, 0, 0);
    normal.crossVectors(binormal, tangent).normalize();

    left.copy(center).addScaledVector(binormal, -trackWidth / 2);
    right.copy(center).addScaledVector(binormal, trackWidth / 2);

    positions.push(left.x, left.y + 0.02, left.z);
    positions.push(right.x, right.y + 0.02, right.z);
    normals.push(normal.x, normal.y, normal.z);
    normals.push(normal.x, normal.y, normal.z);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);

  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0.15 })
  );
}

function createTrackLines(curve, group, trackWidth) {
  const segments = 600;
  const dashLen = 0.014;
  const gapLen = 0.011;

  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const centerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const edgeGeo = new THREE.BoxGeometry(0.1, 0.035, 0.85);
  const centerGeo = new THREE.BoxGeometry(0.07, 0.035, 0.5);

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const center = new THREE.Vector3();
  const pos = new THREE.Vector3();

  let dashProgress = 0;
  let drawing = true;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent).normalize();
    binormal.crossVectors(tangent, up).normalize();
    if (binormal.lengthSq() < 0.001) binormal.set(1, 0, 0);

    pos.copy(center).addScaledVector(binormal, -trackWidth / 2 + 0.25);
    const leftLine = new THREE.Mesh(edgeGeo, edgeMat);
    leftLine.position.copy(pos);
    leftLine.position.y += 0.04;
    leftLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    group.add(leftLine);

    pos.copy(center).addScaledVector(binormal, trackWidth / 2 - 0.25);
    const rightLine = new THREE.Mesh(edgeGeo, edgeMat);
    rightLine.position.copy(pos);
    rightLine.position.y += 0.04;
    rightLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    group.add(rightLine);

    if (drawing) {
      pos.copy(center);
      const dash = new THREE.Mesh(centerGeo, centerMat);
      dash.position.copy(pos);
      dash.position.y += 0.05;
      dash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      group.add(dash);
    }

    dashProgress += 1 / segments;
    if (dashProgress >= (drawing ? dashLen : gapLen)) {
      dashProgress = 0;
      drawing = !drawing;
    }
  }
}

function createArches(curve, group, trackLength) {
  const archMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.45 });
  // Place arches at roughly equal arc-length intervals
  for (const frac of [0.1, 0.3, 0.55, 0.78]) {
    const center = curve.getPointAt(frac);
    const tangent = curve.getTangentAt(frac).normalize();
    const archGroup = new THREE.Group();
    archGroup.position.copy(center);
    archGroup.position.y += 12;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(18, 0.1, 8, 48, Math.PI), archMat);
    torus.rotation.x = Math.PI / 2;
    archGroup.add(torus);
    archGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
    group.add(archGroup);
  }
}

export function createTrack(trackId = DEFAULT_TRACK) {
  const trackDef = TRACKS[trackId] ?? TRACKS[DEFAULT_TRACK];
  const trackWidth = trackDef.width ?? TRACK_WIDTH_DEFAULT;
  const curve = createTrackPath(trackDef);
  const group = new THREE.Group();
  const trackLength = curve.getLength();

  const surface = createTrackSurface(curve, trackWidth);
  surface.receiveShadow = true;
  group.add(surface);
  createTrackLines(curve, group, trackWidth);
  createArches(curve, group, trackLength);

  return { group, curve, trackWidth, trackLength, trackDef, sampler: new TrackSampler(curve, trackLength) };
}

// ── Curvature (smoothed over wider window to avoid spikes) ──

const _tanA = new THREE.Vector3();
const _tanB = new THREE.Vector3();
const _cross = new THREE.Vector3();

export function getTurnDirection(curve, t) {
  const dt = 0.012;
  const wrapped = ((t % 1) + 1) % 1;
  const tA = ((wrapped - dt) % 1 + 1) % 1;
  const tB = (wrapped + dt) % 1;
  curve.getTangentAt(tA, _tanA);
  curve.getTangentAt(tB, _tanB);
  _cross.crossVectors(_tanA, _tanB);
  if (Math.abs(_cross.y) < 0.00001) return 0;
  return Math.sign(_cross.y); // +1 = track bends left, -1 = right
}

export function getCurvatureAt(curve, t, trackLength) {
  const wrapped = ((t % 1) + 1) % 1;
  const dt = 0.01; // wider sample = smoother curvature signal
  const tA = ((wrapped - dt) % 1 + 1) % 1;
  const tB = (wrapped + dt) % 1;
  curve.getTangentAt(tA, _tanA).normalize();
  curve.getTangentAt(tB, _tanB).normalize();
  const angle = _tanA.angleTo(_tanB);
  const arcDist = trackLength * dt * 2;
  return angle / Math.max(arcDist, 1);
}

/** 3-sample average for stable corner detection fed to physics */
export function getSmoothCurvature(curve, t, trackLength) {
  const dt = 0.005;
  const c0 = getCurvatureAt(curve, t, trackLength);
  const c1 = getCurvatureAt(curve, t + dt, trackLength);
  const c2 = getCurvatureAt(curve, t - dt, trackLength);
  return (c0 + c1 + c2) / 3;
}

export function getTrackFrame(curve, t, trackLength, samplerOrUp = null, maybeUp = null) {
  // Support old call signature getTrackFrame(curve, t, trackLength, up)
  let sampler = null;
  let up = new THREE.Vector3(0, 1, 0);
  if (samplerOrUp && typeof samplerOrUp.get === 'function') {
    sampler = samplerOrUp;
    up = maybeUp ?? up;
  } else if (samplerOrUp instanceof THREE.Vector3) {
    up = samplerOrUp;
  }

  const wrapped = ((t % 1) + 1) % 1;
  const position = curve.getPointAt(wrapped);
  const tangent = curve.getTangentAt(wrapped).normalize();
  const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
  if (binormal.lengthSq() < 0.001) binormal.set(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

  const sampled = sampler
    ? sampler.get(wrapped)
    : { curvature: getSmoothCurvature(curve, wrapped, trackLength), turnDirection: getTurnDirection(curve, wrapped) };

  return {
    position,
    tangent,
    binormal,
    normal,
    curvature: sampled.curvature,
    turnDirection: sampled.turnDirection,
    t: wrapped,
  };
}

/** Convert arc-length s to frame */
export function getTrackFrameAtS(curve, s, trackLength, sampler = null, up = new THREE.Vector3(0, 1, 0)) {
  const t = ((s % trackLength) + trackLength) % trackLength / trackLength;
  return getTrackFrame(curve, t, trackLength, sampler, up);
}

export function getMinimapPoints(curve, count = 160) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const p = curve.getPointAt(i / count);
    pts.push({ x: p.x, z: p.z });
  }
  return pts;
}

export function getGridPosition(trackLength, gridSlot) {
  let s = trackLength + gridSlot.tOffset * trackLength;
  s = ((s % trackLength) + trackLength) % trackLength;
  return { s, lateral: gridSlot.lateral };
}

export function sToProgress(s, trackLength) {
  return (((s % trackLength) + trackLength) % trackLength) / trackLength;
}
