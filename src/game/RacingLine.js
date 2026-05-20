import * as THREE from 'three';
import { getCurvatureAt } from './Track.js';

const _tanA = new THREE.Vector3();
const _tanB = new THREE.Vector3();
const _cross = new THREE.Vector3();

/**
 * Ideal racing line for AI steering reference only.
 * Player is NOT penalised for deviating — corners punish via speed limits instead.
 */
export class RacingLine {
  constructor(curve, trackLength, trackWidth, samples = 300) {
    this.samples = samples;
    this.halfWidth = trackWidth * 0.4;
    this.data = [];

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const curvature = getCurvatureAt(curve, t, trackLength);
      const turnDir = this.getTurnDirection(curve, t);
      const cornerWeight = THREE.MathUtils.clamp(curvature * trackLength * 0.08, 0, 1);

      // Classic wide-in, tight apex, wide-out
      const apex = -turnDir * this.halfWidth * 0.75 * cornerWeight;
      this.data.push({ t, lateral: apex, curvature });
    }
  }

  getTurnDirection(curve, t) {
    const dt = 0.012;
    const tA = ((t - dt) % 1 + 1) % 1;
    const tB = (t + dt) % 1;
    curve.getTangentAt(tA, _tanA);
    curve.getTangentAt(tB, _tanB);
    _cross.crossVectors(_tanA, _tanB);
    if (Math.abs(_cross.y) < 0.0001) return 0;
    return Math.sign(_cross.y);
  }

  getIdeal(t) {
    const wrapped = ((t % 1) + 1) % 1;
    const idx = wrapped * this.samples;
    const i0 = Math.floor(idx) % this.samples;
    const i1 = (i0 + 1) % this.samples;
    const frac = idx - Math.floor(idx);
    return THREE.MathUtils.lerp(this.data[i0].lateral, this.data[i1].lateral, frac);
  }
}
