import * as THREE from 'three';

/** Race flow: grid → countdown → multi-lap race → finish */
export class RaceManager {
  constructor({ totalLaps, trackName, onLapComplete, onRaceFinish, onRaceGo }) {
    this.totalLaps = totalLaps;
    this.trackName = trackName;
    this.onLapComplete = onLapComplete;
    this.onRaceFinish = onRaceFinish;
    this.onRaceGo = onRaceGo;

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
          this.onRaceGo?.();
        }
      }
      return;
    }

    if (this.state === 'racing' && playerPhysics) {
      if (playerPhysics.finishedLaps > this._lastFinishedLaps) {
        this._lastFinishedLaps = playerPhysics.finishedLaps;
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
    this._lastFinishedLaps = 0;
  }
}
