import * as THREE from 'three';

/** Lightweight physics holder for remote human drivers (interpolated). */
export class NetworkPhysics {
  constructor({ trackLength, trackWidth }) {
    this.trackLength = trackLength;
    this.trackWidth = trackWidth;
    this.halfWidth = trackWidth * 0.44;
    this.maxSpeed = 98;

    this.s = 0;
    this.lateral = 0;
    this.v = 0;
    this.lap = 1;
    this.finishedLaps = 0;
    this.lateralVel = 0;
    this.wallHitTimer = 0;
    this.lastWallImpact = 0;
    this.isCrashed = false;

    this._target = { s: 0, lateral: 0, v: 0, lap: 1, finishedLaps: 0 };
  }

  get progress() {
    return ((this.s % this.trackLength) + this.trackLength) % this.trackLength / this.trackLength;
  }

  get raceProgress() {
    return this.finishedLaps + this.progress;
  }

  get speedDisplay() {
    return Math.round(this.v * 3.6);
  }

  applyNetworkState(state, dt) {
    this._target.s = state.s ?? this._target.s;
    this._target.lateral = state.lateral ?? this._target.lateral;
    this._target.v = state.v ?? this._target.v;
    this._target.lap = state.lap ?? this._target.lap;
    this._target.finishedLaps = state.finishedLaps ?? this._target.finishedLaps;

    const alpha = 1 - Math.exp(-12 * dt);
    this.s = THREE.MathUtils.lerp(this.s, this._target.s, alpha);
    this.lateral = THREE.MathUtils.lerp(this.lateral, this._target.lateral, alpha);
    this.v = THREE.MathUtils.lerp(this.v, this._target.v, alpha);
    this.lap = this._target.lap;
    this.finishedLaps = this._target.finishedLaps;
  }

  update() {
    // Remote cars are driven entirely by network snapshots.
  }
}
