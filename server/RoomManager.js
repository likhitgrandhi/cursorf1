const MAX_PLAYERS = 3;
const ROOM_CODE_LEN = 6;
const IDLE_TTL_MS = 30 * 60 * 1000;

const TEAMS = ['audi', 'mercedes', 'ferrari', 'mclaren'];

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sanitizeName(name) {
  return String(name || 'Driver').trim().slice(0, 20) || 'Driver';
}

function clampLaps(laps) {
  return Math.min(10, Math.max(1, Number(laps) || 3));
}

export class RoomManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.rooms = new Map();
    /** @type {Map<string, { roomId: string, playerId: string, ws: import('ws').WebSocket }>} */
    this.clients = new Map();
  }

  createRoom({ name, laps, hostWs }) {
    let code;
    do {
      code = randomCode();
    } while (this.rooms.has(code));

    const hostId = this._newPlayerId();
    const room = {
      id: code,
      hostId,
      laps: clampLaps(laps),
      state: 'lobby',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      players: new Map([[hostId, { id: hostId, name: sanitizeName(name), team: TEAMS[0] }]]),
    };

    this.rooms.set(code, room);
    this._attachClient(hostWs, code, hostId);
    return this._roomSnapshot(room, hostId);
  }

  joinRoom({ roomId, name, ws }) {
    const room = this.rooms.get(String(roomId || '').toUpperCase());
    if (!room) return { error: 'ROOM_NOT_FOUND', message: 'Room not found. Check the code or ask for a new link.' };
    if (room.state !== 'lobby') return { error: 'RACE_STARTED', message: 'This race already started. Create a new room.' };
    if (room.players.size >= MAX_PLAYERS) return { error: 'ROOM_FULL', message: 'Room is full (max 3 players).' };

    const playerId = this._newPlayerId();
    const team = TEAMS[room.players.size] ?? TEAMS[TEAMS.length - 1];
    room.players.set(playerId, { id: playerId, name: sanitizeName(name), team });
    room.lastActivity = Date.now();
    this._attachClient(ws, room.id, playerId);

    this._broadcast(room, { type: 'room_update', ...this._roomSnapshot(room) });
    return this._roomSnapshot(room, playerId);
  }

  leaveRoom(playerId) {
    const client = this.clients.get(playerId);
    if (!client) return null;

    const room = this.rooms.get(client.roomId);
    this.clients.delete(playerId);
    if (!room) return null;

    room.players.delete(playerId);
    room.lastActivity = Date.now();

    if (room.players.size === 0) {
      this.rooms.delete(room.id);
      return { roomDeleted: true, roomId: room.id };
    }

    if (room.hostId === playerId) {
      room.hostId = room.players.keys().next().value;
    }

    if (room.state === 'lobby') {
      this._broadcast(room, { type: 'room_update', ...this._roomSnapshot(room) });
    } else {
      this._broadcast(room, {
        type: 'player_left',
        playerId,
        newHostId: room.hostId,
        players: this._playersList(room),
      });
    }

    return { roomId: room.id, newHostId: room.hostId };
  }

  startRace(playerId) {
    const client = this.clients.get(playerId);
    if (!client) return { error: 'NOT_IN_ROOM', message: 'You are not in a room.' };

    const room = this.rooms.get(client.roomId);
    if (!room) return { error: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    if (room.hostId !== playerId) return { error: 'NOT_HOST', message: 'Only the host can start the race.' };
    if (room.state !== 'lobby') return { error: 'ALREADY_STARTED', message: 'Race already started.' };
    if (room.players.size < 2) {
      return { error: 'NEED_PLAYERS', message: 'Wait for at least one friend to join before starting.' };
    }

    room.state = 'racing';
    room.lastActivity = Date.now();
    room.raceStartAt = Date.now() + 3500;

    const payload = {
      type: 'race_start',
      roomId: room.id,
      laps: room.laps,
      startAt: room.raceStartAt,
      players: this._playersList(room),
    };

    this._broadcast(room, payload);
    return payload;
  }

  relayState(playerId, state) {
    const client = this.clients.get(playerId);
    if (!client) return;

    const room = this.rooms.get(client.roomId);
    if (!room || room.state !== 'racing') return;

    room.lastActivity = Date.now();
    this._broadcast(
      room,
      { type: 'player_state', playerId, ...state },
      playerId
    );
  }

  handleDisconnect(playerId) {
    return this.leaveRoom(playerId);
  }

  cleanupIdleRooms() {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      if (now - room.lastActivity > IDLE_TTL_MS) {
        this._broadcast(room, { type: 'room_closed', reason: 'idle' });
        for (const pid of room.players.keys()) {
          this.clients.delete(pid);
        }
        this.rooms.delete(id);
      }
    }
  }

  getClient(playerId) {
    return this.clients.get(playerId);
  }

  _attachClient(ws, roomId, playerId) {
    this.clients.set(playerId, { roomId, playerId, ws });
    ws.playerId = playerId;
  }

  _newPlayerId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  _playersList(room) {
    return [...room.players.values()];
  }

  _roomSnapshot(room, forPlayerId = null) {
    const players = this._playersList(room);
    return {
      roomId: room.id,
      laps: room.laps,
      state: room.state,
      hostId: room.hostId,
      players,
      playerId: forPlayerId,
      isHost: forPlayerId === room.hostId,
      canStart: room.state === 'lobby' && room.players.size >= 2 && forPlayerId === room.hostId,
      maxPlayers: MAX_PLAYERS,
    };
  }

  _broadcast(room, message, exceptPlayerId = null) {
    for (const pid of room.players.keys()) {
      if (pid === exceptPlayerId) continue;
      const client = this.clients.get(pid);
      if (client?.ws.readyState === 1) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  send(ws, message) {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  }
}
