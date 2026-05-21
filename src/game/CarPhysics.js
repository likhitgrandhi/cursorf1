import * as THREE from 'three';

const DRIVE_PROFILES = {
  assisted: {
    maxSpeed: 84,
    peakDriveForce: 10800,
    baseGrip: 14,
    driftCoeff: 0.42,
    steerAccel: 48,
    lateralDamping: 4.2,
    headingSteerRate: 2.2,
    latGripMult: 0.78,
    cornerBleed: 1.4,
    steerForgiveness: 1.6,
    headingDecay: 2.0,
  },
  raw: {
    maxSpeed: 96,
    peakDriveForce: 12500,
    baseGrip: 9.5,
    driftCoeff: 0.78,
    steerAccel: 58,
    lateralDamping: 2.2,
    headingSteerRate: 2.9,
    latGripMult: 0.58,
    cornerBleed: 3.2,
    steerForgiveness: 0.85,
    headingDecay: 0.4,
  },
};

/**
 * Driver-controlled physics with assisted or raw F1 profiles.
 * Raw mode: low forgiveness — precise counter-steer required in every corner.
 */
export class CarPhysics {
  constructor({ trackLength, trackWidth, isPlayer = false, skill = 1, driveMode = 'assisted' }) {
    this.trackLength = trackLength;
    this.trackWidth = trackWidth;
    this.halfWidth = trackWidth * 0.43;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.driveMode = isPlayer ? driveMode : 'assisted';

    const profile = DRIVE_PROFILES[this.driveMode] ?? DRIVE_PROFILES.assisted;

    this.s = 0;
    this.v = 0;
    this.lateral = 0;
    this.lateralVel = 0;
    this.heading = 0;

    this.lap = 1;
    this.finishedLaps = 0;
    this.lastS = 0;
    this.lastSteer = 0;

    this.maxSpeed = isPlayer ? profile.maxSpeed : 88 + skill * 8;
    this.peakDriveForce = isPlayer ? profile.peakDriveForce : 10500 + skill * 1800;
    this.dragCoeff = 0.55;
    this.rollingResistance = 70;
    this.maxBrakeForce = 32000;

    this.baseGrip = isPlayer ? profile.baseGrip : 12 + skill * 2;
    this.downforceCoeff = 0.012;
    this.driftCoeff = isPlayer ? profile.driftCoeff : 0.52 + skill * 0.08;
    this.steerAccel = isPlayer ? profile.steerAccel : 46 + skill * 6;
    this.lateralDamping = isPlayer ? profile.lateralDamping : 3.0;
    this.headingSteerRate = isPlayer ? profile.headingSteerRate : 2.2 + skill * 0.3;
    this.latGripMult = profile.latGripMult;
    this.cornerBleed = profile.cornerBleed;
    this.steerForgiveness = profile.steerForgiveness;
    this.headingDecay = profile.headingDecay;

    this.wallHitTimer = 0;
    this.lastWallImpact = 0;
    this.draftBoost = 1;

    this.distanceThisLap = 0;
    this.minLapDistance = trackLength * 0.88;
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
    if (this.distanceThisLap < this.minLapDistance) return false;

    if (this.s >= this.trackLength && this.lastS < this.trackLength) {
      this.finishedLaps++;
      this.lap = this.finishedLaps + 1;
      this.distanceThisLap = 0;
      return true;
    }
    return false;
  }

  resetForRaceStart() {
    this.finishedLaps = 0;
    this.lap = 1;
    this.lastS = this.s;
    this.distanceThisLap = 0;
  }

  handleWallCollision(safeDt) {
    const side = Math.sign(this.lateral) || 1;
    const penetration = Math.abs(this.lateral) - this.halfWidth;
    const impact = this.v * (1 + penetration * 3);
    const wallPenalty = this.driveMode === 'raw' ? 1.25 : 1;

    this.lateral = side * this.halfWidth * 0.88;
    this.lateralVel = -this.lateralVel * 0.35 - side * impact * 0.015 * wallPenalty;
    this.v *= 1 - THREE.MathUtils.clamp(impact * 0.005 * wallPenalty, 0.15, 0.72);
    this.heading += side * THREE.MathUtils.clamp(impact * 0.002 * wallPenalty, 0.05, 0.55);

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
      throttle *= this.driveMode === 'raw' ? 0.25 : 0.35;
    }

    let drive = 0;
    if (throttle > 0) {
      const powerBand = 1 - Math.pow(this.v / this.maxSpeed, 2.2);
      drive = throttle * this.peakDriveForce * Math.max(0.12, powerBand);
    }

    const drag = this.dragCoeff * this.v * this.v;
    let longAccel = (drive - drag - this.rollingResistance - brake * this.maxBrakeForce) / 798;
    longAccel = THREE.MathUtils.clamp(longAccel, -70, 34);

    const inCorner = curvature > 0.001 && turnDirection !== 0;
    const speedFactor = THREE.MathUtils.clamp(this.v / 40, 0.2, 1);

    if (inCorner && this.v > 12) {
      const neededSteer = -turnDirection;
      const steerMatch = 1 - Math.min(1, Math.abs(steer - neededSteer) / this.steerForgiveness);

      const drift = this.v * this.v * curvature * turnDirection * this.driftCoeff * (1 - steerMatch * 0.9);
      this.lateralVel += drift * safeDt;

      if (steerMatch < 0.55) {
        this.v = Math.max(0, this.v - (1 - steerMatch) * curvature * this.v * this.cornerBleed * safeDt);
      }
    }

    this.lateralVel += steer * this.steerAccel * speedFactor * safeDt;
    this.lateralVel *= Math.exp(-this.lateralDamping * safeDt);

    const maxLatVel = grip * this.latGripMult;
    this.lateralVel = THREE.MathUtils.clamp(this.lateralVel, -maxLatVel, maxLatVel);
    this.lateral += this.lateralVel * safeDt;

    if (Math.abs(this.lateral) >= this.halfWidth) {
      this.handleWallCollision(safeDt);
    }
    this.lateral = THREE.MathUtils.clamp(this.lateral, -this.halfWidth, this.halfWidth);

    this.v = Math.max(0, Math.min(this.v + longAccel * safeDt, this.maxSpeed * (1 + (this.draftBoost - 1) * 0.4)));

    this.heading += steer * this.headingSteerRate * speedFactor * safeDt;
    if (!inCorner && Math.abs(steer) < 0.05) {
      this.heading *= 1 - this.headingDecay * safeDt;
    }

    this.s += this.v * safeDt;
    this.distanceThisLap += this.v * safeDt;

    if (this.s >= this.trackLength) {
      this.checkLapCrossing();
      this.s %= this.trackLength;
      this.lastS = this.s;
    } else {
      this.lastS = this.s;
    }
  }
}
