import * as THREE from 'three';
import { createCarModel, getBodyMaterials, MODEL_FORWARD, TEAM_SKINS } from './CarModelLoader.js';

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _alignQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();

export class Car {
  constructor({ name, team = 'audi', isPlayer = false }) {
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;

    const { model, skin } = createCarModel(team);
    this.skin = skin;
    this.color = new THREE.Color(skin.primary);
    this.baseEmissive = new THREE.Color(skin.emissive);

    this.physics = null;

    // Root moves with the track; model child keeps a fixed yaw offset (never overwritten).
    this.root = new THREE.Group();
    this.mesh = model;
    this.root.add(model);

    this.bodyMats = getBodyMaterials(model);

    this.displayQuat = new THREE.Quaternion();
    this.smoothPos = new THREE.Vector3();
    this.smoothForward = new THREE.Vector3();
    this.roll = 0;
    this.crashFlash = 0;

    this.trailHistory = [];
    this.maxTrail = 48;
    this.trailGroup = new THREE.Group();

    for (let side = 0; side < 2; side++) {
      const positions = new Float32Array(this.maxTrail * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const colors = new Float32Array(this.maxTrail * 4);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      line.frustumCulled = false;
      line.userData = { side, positions, colors };
      this.trailGroup.add(line);
    }
  }

  initPhysics(physics) {
    this.physics = physics;
  }

  get lap() { return this.physics?.lap ?? 1; }
  get raceProgress() { return this.physics?.raceProgress ?? 0; }
  get speed() { return this.physics?.v ?? 0; }
  get speedDisplay() { return this.physics?.speedDisplay ?? 0; }

  updateTrail(worldPos, tangent, binormal, speed) {
    const spread = 0.35;
    const left = new THREE.Vector3().copy(worldPos).addScaledVector(binormal, -spread);
    const right = new THREE.Vector3().copy(worldPos).addScaledVector(binormal, spread);
    this.trailHistory.unshift({ left, right, speed });
    if (this.trailHistory.length > this.maxTrail) this.trailHistory.pop();

    this.trailGroup.children.forEach((line) => {
      const { side, positions, colors } = line.userData;
      const count = this.trailHistory.length;
      for (let i = 0; i < count; i++) {
        const pt = side === 0 ? this.trailHistory[i].left : this.trailHistory[i].right;
        positions[i * 3] = pt.x;
        positions[i * 3 + 1] = pt.y + 0.05;
        positions[i * 3 + 2] = pt.z;
        const fade = 1 - i / count;
        colors[i * 4 + 3] = fade * fade * (0.1 + speed / 140);
        colors[i * 4] = this.color.r;
        colors[i * 4 + 1] = this.color.g;
        colors[i * 4 + 2] = this.color.b;
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.attributes.color.needsUpdate = true;
      line.geometry.setDrawRange(0, count);
    });
  }

  updateVisuals(frame, dt) {
    const { position, tangent, binormal, normal } = frame;
    const p = this.physics;

    const pos = new THREE.Vector3()
      .copy(position)
      .addScaledVector(binormal, p.lateral)
      .addScaledVector(normal, 0.05);

    if (this.smoothPos.lengthSq() === 0) {
      this.smoothPos.copy(pos);
      this.smoothForward.copy(tangent);
    }
    this.smoothPos.lerp(pos, 1 - Math.exp(-14 * dt));

    this.smoothForward.lerp(tangent, 1 - Math.exp(-8 * dt)).normalize();

    _forward.copy(this.smoothForward);
    _up.copy(normal);
    _right.crossVectors(_forward, _up).normalize();
    if (_right.lengthSq() < 0.001) _right.copy(binormal);
    _up.crossVectors(_right, _forward).normalize();

    const targetRoll = THREE.MathUtils.clamp(-p.lateralVel * 0.05, -0.15, 0.15);
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-10 * dt));

    // Align model -Z (glTF forward) to track tangent, then apply roll.
    _alignQuat.setFromUnitVectors(MODEL_FORWARD, _forward);
    _rollQuat.setFromAxisAngle(_forward, this.roll);
    _targetQuat.copy(_rollQuat).multiply(_alignQuat);

    this.displayQuat.slerp(_targetQuat, 1 - Math.exp(-14 * dt));

    this.root.position.copy(this.smoothPos);
    this.root.quaternion.copy(this.displayQuat);

    if (p.wallHitTimer > 0 && p.lastWallImpact > 0) {
      this.crashFlash = Math.max(this.crashFlash, p.wallHitTimer);
    }
    if (this.crashFlash > 0) {
      this.crashFlash -= dt;
      const flash = Math.sin(this.crashFlash * 30) * 0.5 + 0.5;
      for (const m of this.bodyMats) {
        m.emissive.setRGB(1, flash * 0.35, flash * 0.15);
        m.emissiveIntensity = 0.75 + flash * 0.5;
      }
    } else {
      const speedRatio = p.v / p.maxSpeed;
      for (const m of this.bodyMats) {
        m.emissive.copy(this.baseEmissive);
        m.emissiveIntensity = 0.14 + speedRatio * 0.22;
      }
    }

    if (p.v > 2) this.updateTrail(this.smoothPos, tangent, binormal, p.v);
  }
}

export const AI_RACERS = [
  { name: 'Hamilton', team: 'mercedes', skill: 0.88, aggression: 0.45 },
  { name: 'Leclerc', team: 'ferrari', skill: 0.91, aggression: 0.55 },
  { name: 'Norris', team: 'mclaren', skill: 0.90, aggression: 0.5 },
];

export function createPlayerCar({ name = 'You', team = 'audi' } = {}) {
  return new Car({ name, team, isPlayer: true });
}

export function createAICar({ name, team, skill = 0.9, aggression = 0.5 }) {
  const car = new Car({ name, team, isPlayer: false });
  car.aiProfile = { name, team, skill, aggression };
  return car;
}

export function createRemoteCar({ name, team, remoteId }) {
  const car = new Car({ name, team, isPlayer: false });
  car.isRemote = true;
  car.remoteId = remoteId;
  return car;
}

export function createAICars() {
  return AI_RACERS.map((r) => createAICar(r));
}

export { TEAM_SKINS };
