import * as THREE from 'three';

export class AIRacer {
  constructor({ skill = 0.9, aggression = 0.4 }) {
    this.skill = skill;
    this.aggression = aggression;
    this._steerFilter = 0;
  }

  update(dt, physics, frame, racingLine, rivals, raceActive) {
    if (!raceActive) return { throttle: 0, brake: 0, steer: 0 };

    const { curvature, turnDirection } = frame;
    const grip = physics.baseGrip + physics.downforceCoeff * physics.v * physics.v * 0.035;
    const inCorner = curvature > 0.001 && turnDirection !== 0;

    const safeCurv = Math.max(curvature, 0.0004);
    const maxCornerV = Math.sqrt(grip / safeCurv) * (0.9 + this.skill * 0.08);
    const straightCap = physics.maxSpeed * (0.94 + this.skill * 0.05);
    const targetSpeed = Math.min(straightCap, maxCornerV * (1.02 + this.skill * 0.04));

    let throttle = 0;
    let brake = 0;
    if (physics.v < targetSpeed * 0.98) {
      throttle = 0.88 + this.skill * 0.12;
    } else if (physics.v > targetSpeed * 1.03) {
      brake = 0.25 + (1 - this.skill) * 0.15;
    } else {
      throttle = 0.55 + this.skill * 0.35;
    }

    const neededSteer = inCorner ? -turnDirection : 0;
    const idealLateral = racingLine.getIdeal(physics.progress);
    const lineSteer = THREE.MathUtils.clamp(
      (idealLateral - physics.lateral) / (physics.halfWidth * 0.7),
      -1,
      1
    );
    const steerTarget = inCorner
      ? neededSteer * (0.78 + this.skill * 0.12) + lineSteer * 0.22 * this.skill
      : lineSteer * 0.45;

    let defend = 0;
    for (const rival of rivals) {
      if (rival === physics) continue;
      let pd = Math.abs(physics.progress - rival.progress);
      pd = Math.min(pd, 1 - pd);
      if (pd < 0.015 && Math.abs(physics.lateral - rival.lateral) < 4) {
        defend += Math.sign(physics.lateral || 1) * this.aggression * 0.3;
      }
    }

    const steerRate = 7 + this.skill * 4;
    this._steerFilter += (steerTarget + defend - this._steerFilter) * (1 - Math.exp(-steerRate * dt));

    return {
      throttle,
      brake,
      steer: THREE.MathUtils.clamp(this._steerFilter, -1, 1),
    };
  }
}
