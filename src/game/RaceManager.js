import * as THREE from 'three';

/** Race flow: grid → countdown → multi-lap race → finish */
export class RaceManager {
  constructor({ totalLaps, trackName, onLapComplete, onRaceFinish }) {
    this.totalLaps = totalLaps;
    this.trackName = trackName;
    this.onLapComplete = onLapComplete;
    this.onRaceFinish = onRaceFinish;

    this.state = 'grid'; // grid | countdown | racing | finished
    this.countdown = 3;
    this.countdownTimer = 0;
    this.raceStarted = false;
    this.raceStartTime = 0;
    this.lapStartTime = 0;
    this.finishedOrder = [];
  }

  armCountdown() {
    if (this.state !== 'grid') return;
    this.state = 'countdown';
    this.countdown = 3;
    this.countdownTimer = 0;
  }

  update(dt, playerPhysics) {
    if (this.state === 'countdown') {
      this.countdownTimer += dt;
      if (this.countdownTimer >= 1) {
        this.countdownTimer = 0;
        this.countdown--;
        if (this.countdown <= 0) {
          this.state = 'racing';
          this.raceStarted = true;
          this.raceStartTime = performance.now();
          this.lapStartTime = performance.now();
        }
      }
      return;
    }

    if (this.state === 'racing' && playerPhysics) {
      if (playerPhysics.lap > this._lastPlayerLap && playerPhysics.finishedLaps > 0) {
        this._lastPlayerLap = playerPhysics.lap;
        this.onLapComplete?.(playerPhysics.lap);
        if (playerPhysics.finishedLaps >= this.totalLaps) {
          this.state = 'finished';
          this.onRaceFinish?.();
        }
      }
    }
  }

  get isRacing() {
    return this.state === 'racing';
  }

  get countdownText() {
    if (this.state === 'grid') return 'Press ↑ when ready';
    if (this.state === 'countdown') {
      if (this.countdown > 0) return String(this.countdown);
      return 'GO!';
    }
    if (this.state === 'finished') return 'Race complete';
    return '';
  }

  resetLapTracking() {
    this._lastPlayerLap = 1;
  }
}
