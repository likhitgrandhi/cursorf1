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
    const maxCornerV = Math.sqrt(grip / safeCurv) * (0.82 + this.skill * 0.1);
    const targetSpeed = Math.min(physics.maxSpeed * (0.9 + this.skill * 0.07), maxCornerV);

    let throttle = 0;
    let brake = 0;
    if (physics.v < targetSpeed * 0.96) throttle = 0.65 + this.skill * 0.3;
    else if (physics.v > targetSpeed * 1.05) brake = 0.4 + (1 - this.skill) * 0.25;

    // Counter-steer for corner + racing line blend
    const neededSteer = inCorner ? -turnDirection : 0;
    const idealLateral = racingLine.getIdeal(physics.progress);
    const lineSteer = THREE.MathUtils.clamp(
      (idealLateral - physics.lateral) / (physics.halfWidth * 0.75),
      -1,
      1
    );
    const steerTarget = inCorner
      ? neededSteer * 0.65 + lineSteer * 0.35 * this.skill
      : lineSteer * 0.3;

    let defend = 0;
    for (const rival of rivals) {
      if (rival === physics) continue;
      let pd = Math.abs(physics.progress - rival.progress);
      pd = Math.min(pd, 1 - pd);
      if (pd < 0.015 && Math.abs(physics.lateral - rival.lateral) < 4) {
        defend += Math.sign(physics.lateral || 1) * this.aggression * 0.25;
      }
    }

    this._steerFilter += (steerTarget + defend - this._steerFilter) * (1 - Math.exp(-5 * dt));

    return {
      throttle,
      brake,
      steer: THREE.MathUtils.clamp(this._steerFilter, -1, 1),
    };
  }
}
