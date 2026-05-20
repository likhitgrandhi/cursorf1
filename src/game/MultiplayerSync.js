export class MultiplayerSync {
  constructor(networkClient, localPlayerId, getLocalState) {
    this.networkClient = networkClient;
    this.localPlayerId = localPlayerId;
    this.getLocalState = getLocalState;
    this.remoteStates = new Map();
    this.sendInterval = 0.05;
    this.accum = 0;
    this.enabled = false;

    this._onPlayerState = (msg) => {
      if (msg.playerId === localPlayerId) return;
      this.remoteStates.set(msg.playerId, {
        s: msg.s,
        lateral: msg.lateral,
        v: msg.v,
        progress: msg.progress,
        lap: msg.lap,
        finishedLaps: msg.finishedLaps,
        at: performance.now(),
      });
    };

    this._onPlayerLeft = (msg) => {
      this.remoteStates.delete(msg.playerId);
    };

    networkClient.on('player_state', this._onPlayerState);
    networkClient.on('player_left', this._onPlayerLeft);
  }

  start() {
    this.enabled = true;
  }

  stop() {
    this.enabled = false;
    this.remoteStates.clear();
  }

  update(dt) {
    if (!this.enabled) return;
    this.accum += dt;
    if (this.accum < this.sendInterval) return;
    this.accum = 0;
    const state = this.getLocalState();
    if (state) this.networkClient.sendState(state);
  }

  getRemoteState(playerId) {
    return this.remoteStates.get(playerId);
  }

  dispose() {
    this.networkClient.off('player_state');
    this.networkClient.off('player_left');
    this.remoteStates.clear();
  }
}
