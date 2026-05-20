import * as THREE from 'three';
import { getCurvatureAt, getTurnDirection } from './Track.js';

/**
 * Pre-sampled & smoothed track data.
 * Raw spline curvature has spikes (up to 0.04 at chicanes) that cause violent auto-drift.
 * This removes noise on straights and caps corner values.
 */
export class TrackSampler {
  constructor(curve, trackLength, samples = 512) {
    this.samples = samples;
    this.trackLength = trackLength;
    this.raw = [];

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      this.raw.push({
        t,
        curvature: getCurvatureAt(curve, t, trackLength),
        turnDirection: getTurnDirection(curve, t, trackLength),
      });
    }

    this.data = this.smooth(this.raw, 21);
  }

  smooth(raw, windowSize) {
    const half = Math.floor(windowSize / 2);
    const out = [];

    for (let i = 0; i < raw.length; i++) {
      let curvSum = 0;
      let dirSum = 0;
      let count = 0;

      for (let j = i - half; j <= i + half; j++) {
        const idx = ((j % raw.length) + raw.length) % raw.length;
        curvSum += raw[idx].curvature;
        dirSum += raw[idx].turnDirection;
        count++;
      }

      let curvature = curvSum / count;
      let turnDirection = 0;

      // Dead zone — straights produce no drift, no auto-turn signals
      if (curvature < 0.00085) {
        curvature = 0;
      } else {
        curvature = Math.min(curvature, 0.009);
        turnDirection = Math.sign(dirSum) || 0;
      }

      out.push({ t: raw[i].t, curvature, turnDirection });
    }

    return out;
  }

  get(t) {
    const wrapped = ((t % 1) + 1) % 1;
    const idx = wrapped * this.samples;
    const i0 = Math.floor(idx) % this.samples;
    const i1 = (i0 + 1) % this.samples;
    const frac = idx - Math.floor(idx);
    const a = this.data[i0];
    const b = this.data[i1];

    return {
      curvature: THREE.MathUtils.lerp(a.curvature, b.curvature, frac),
      turnDirection: Math.abs(frac) < 0.5 ? a.turnDirection : b.turnDirection,
    };
  }
}
