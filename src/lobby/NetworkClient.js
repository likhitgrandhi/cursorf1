const RECONNECT_DELAY_MS = 2500;
const MAX_RECONNECT = 5;

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export class NetworkClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.roomId = null;
    this.isHost = false;
    this.handlers = new Map();
    this.reconnectAttempts = 0;
    this.intentionalClose = false;
    this.connectPromise = null;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  off(type) {
    this.handlers.delete(type);
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.intentionalClose = false;
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl());
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.connectPromise = null;
        resolve();
      };

      ws.onerror = () => {
        this.connectPromise = null;
        reject(new Error('Could not connect to game server.'));
      };

      ws.onclose = () => {
        this.connectPromise = null;
        this._emit('disconnected', {});
        if (!this.intentionalClose && this.roomId && this.reconnectAttempts < MAX_RECONNECT) {
          this.reconnectAttempts += 1;
          setTimeout(() => {
            this.connect().catch(() => {});
          }, RECONNECT_DELAY_MS);
        }
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.playerId) this.playerId = msg.playerId;
        if (msg.roomId) this.roomId = msg.roomId;
        if (typeof msg.isHost === 'boolean') this.isHost = msg.isHost;
        this._emit(msg.type, msg);
        this._emit('*', msg);
      };
    });

    return this.connectPromise;
  }

  disconnect() {
    this.intentionalClose = true;
    this.ws?.close();
    this.ws = null;
    this.playerId = null;
    this.roomId = null;
    this.isHost = false;
  }

  send(msg) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  createRoom(name, laps) {
    return this.send({ type: 'create_room', name, laps });
  }

  joinRoom(roomId, name) {
    return this.send({ type: 'join_room', roomId, name });
  }

  leaveRoom() {
    this.send({ type: 'leave_room' });
    this.roomId = null;
    this.playerId = null;
    this.isHost = false;
  }

  startRace() {
    return this.send({ type: 'start_race' });
  }

  sendState(state) {
    return this.send({ type: 'state_update', ...state });
  }

  _emit(type, payload) {
    this.handlers.get(type)?.(payload);
    this.handlers.get('*')?.(payload);
  }
}
