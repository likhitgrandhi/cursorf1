import * as THREE from 'three';

/**
 * Driver-controlled physics — no hidden auto-steer.
 *
 * Fixes for "automatic turning":
 * 1. Drift only in confirmed corners (smoothed curvature + turn direction)
 * 2. Heading changes ONLY from steer input — never from lateral velocity
 * 3. Must actively counter-steer in corners or lose speed (not auto-slide)
 */
export class CarPhysics {
  constructor({ trackLength, trackWidth, isPlayer = false, skill = 1 }) {
    this.trackLength = trackLength;
    this.trackWidth = trackWidth;
    this.halfWidth = trackWidth * 0.43;
    this.isPlayer = isPlayer;
    this.skill = skill;

    this.s = 0;
    this.v = 0;
    this.lateral = 0;
    this.lateralVel = 0;
    this.heading = 0;

    this.lap = 1;
    this.finishedLaps = 0;
    this.lastS = 0;
    this.lastSteer = 0;

    this.maxSpeed = isPlayer ? 88 : 84 + skill * 5;
    this.peakDriveForce = isPlayer ? 11000 : 9800 + skill * 1200;
    this.dragCoeff = 0.55;
    this.rollingResistance = 70;
    this.maxBrakeForce = 32000;

    this.baseGrip = 12;
    this.downforceCoeff = 0.012;
    this.driftCoeff = isPlayer ? 0.55 : 0.5 + skill * 0.06;
    this.steerAccel = isPlayer ? 50 : 44 + skill * 5;
    this.lateralDamping = 3.2;
    this.headingSteerRate = isPlayer ? 2.4 : 2.0;

    this.wallHitTimer = 0;
    this.lastWallImpact = 0;
    this.draftBoost = 1;
  }

  get progress() {
    return (this.s % this.trackLength) / this.trackLength;
  }

  get raceProgress() {
    return this.finishedLaps + this.progress;
  }

  get speedKmh() {
    return this.v * 3.618;
  }

  get speedDisplay() {
    return Math.round(this.speedKmh);
  }

  get isCrashed() {
    return this.wallHitTimer > 0;
  }

  checkLapCrossing() {
    if (this.s >= this.trackLength && this.lastS < this.trackLength) {
      this.finishedLaps++;
      this.lap = this.finishedLaps + 1;
    }
    this.lastS = this.s;
  }

  handleWallCollision(safeDt) {
    const side = Math.sign(this.lateral) || 1;
    const penetration = Math.abs(this.lateral) - this.halfWidth;
    const impact = this.v * (1 + penetration * 3);

    this.lateral = side * this.halfWidth * 0.88;
    this.lateralVel = -this.lateralVel * 0.35 - side * impact * 0.015;
    this.v *= 1 - THREE.MathUtils.clamp(impact * 0.005, 0.15, 0.65);
    this.heading += side * THREE.MathUtils.clamp(impact * 0.002, 0.05, 0.45);

    this.wallHitTimer = THREE.MathUtils.clamp(0.25 + impact * 0.003, 0.25, 0.9);
    this.lastWallImpact = impact;
  }

  update(dt, { throttle, brake, steer }, { curvature = 0, turnDirection = 0, gripMult = 1 }) {
    const safeDt = Math.min(dt, 0.05);
    this.lastSteer = steer;

    const downforce = this.downforceCoeff * this.v * this.v;
    const grip = (this.baseGrip + downforce * 0.035) * gripMult * this.draftBoost;

    if (this.wallHitTimer > 0) {
      this.wallHitTimer -= safeDt;
      throttle *= 0.35;
    }

    // Longitudinal
    let drive = 0;
    if (throttle > 0) {
      const powerBand = 1 - Math.pow(this.v / this.maxSpeed, 2.2);
      drive = throttle * this.peakDriveForce * Math.max(0.12, powerBand);
    }

    const drag = this.dragCoeff * this.v * this.v;
    let longAccel = (drive - drag - this.rollingResistance - brake * this.maxBrakeForce) / 798;
    longAccel = THREE.MathUtils.clamp(longAccel, -70, 32);

    const inCorner = curvature > 0.001 && turnDirection !== 0;
    const speedFactor = THREE.MathUtils.clamp(this.v / 40, 0.2, 1);

    // In corners: must counter-steer or lose speed (no free auto-drift slide)
    if (inCorner && this.v > 12) {
      const neededSteer = -turnDirection; // left turn needs steer left (-1)
      const steerMatch = 1 - Math.min(1, Math.abs(steer - neededSteer) / 1.5);

      // Gentle outward push only in real corners, scaled by speed
      const drift = this.v * this.v * curvature * turnDirection * this.driftCoeff * (1 - steerMatch * 0.85);
      this.lateralVel += drift * safeDt;

      // Not counter-steering = bleed speed (you feel the corner fighting you)
      if (steerMatch < 0.5) {
        this.v = Math.max(0, this.v - (1 - steerMatch) * curvature * this.v * 1.8 * safeDt);
      }
    }

    // Driver steering — only source of intentional lateral movement
    this.lateralVel += steer * this.steerAccel * speedFactor * safeDt;
    this.lateralVel *= Math.exp(-this.lateralDamping * safeDt);

    const maxLatVel = grip * 0.75;
    this.lateralVel = THREE.MathUtils.clamp(this.lateralVel, -maxLatVel, maxLatVel);
    this.lateral += this.lateralVel * safeDt;

    if (Math.abs(this.lateral) >= this.halfWidth) {
      this.handleWallCollision(safeDt);
    }
    this.lateral = THREE.MathUtils.clamp(this.lateral, -this.halfWidth, this.halfWidth);

    this.v = Math.max(0, Math.min(this.v + longAccel * safeDt, this.maxSpeed * (1 + (this.draftBoost - 1) * 0.4)));

    // Heading: ONLY from steer input — never auto-follows track
    this.heading += steer * this.headingSteerRate * speedFactor * safeDt;
    // Slow return to neutral only on straights when not steering
    if (!inCorner && Math.abs(steer) < 0.05) {
      this.heading *= 1 - 1.5 * safeDt;
    }

    this.s += this.v * safeDt;

    if (this.s >= this.trackLength) {
      this.checkLapCrossing();
      this.s %= this.trackLength;
      this.lastS = this.s;
    }
  }
}
