import { NetworkClient } from './NetworkClient.js';

const TEAMS = ['audi', 'mercedes', 'ferrari', 'mclaren'];

export class Lobby {
  /**
   * @param {{ onStart: (config: object) => void, onPreviewReady?: () => void }} opts
   */
  constructor({ onStart }) {
    this.onStart = onStart;
    this.network = new NetworkClient();
    this.mode = 'bots';
    this.roomState = null;

    this.el = {
      backdrop: document.getElementById('lobby-backdrop'),
      name: document.getElementById('player-name'),
      laps: document.getElementById('lap-count'),
      status: document.getElementById('lobby-status'),
      modeBots: document.getElementById('mode-bots'),
      modeFriends: document.getElementById('mode-friends'),
      botsPanel: document.getElementById('bots-panel'),
      friendsPanel: document.getElementById('friends-panel'),
      createRoom: document.getElementById('create-room'),
      joinRoom: document.getElementById('join-room'),
      roomCode: document.getElementById('room-code'),
      roomInfo: document.getElementById('room-info'),
      playerList: document.getElementById('player-list'),
      inviteLink: document.getElementById('invite-link'),
      copyLink: document.getElementById('copy-link'),
      startRace: document.getElementById('start-race'),
      playBots: document.getElementById('play-bots'),
    };

    this._bindEvents();
    this._wireNetwork();
    this._readUrlRoom();
    this.setMode('bots');
  }

  show() {
    this.el.backdrop.classList.remove('hidden');
    document.getElementById('app')?.classList.add('lobby-open');
  }

  hide() {
    this.el.backdrop.classList.add('hidden');
    document.getElementById('app')?.classList.remove('lobby-open');
  }

  setStatus(text, isError = false) {
    this.el.status.textContent = text || '';
    this.el.status.classList.toggle('error', isError);
  }

  setMode(mode) {
    this.mode = mode;
    this.el.modeBots.classList.toggle('active', mode === 'bots');
    this.el.modeFriends.classList.toggle('active', mode === 'friends');
    this.el.botsPanel.classList.toggle('hidden', mode !== 'bots');
    this.el.friendsPanel.classList.toggle('hidden', mode !== 'friends');
    this.setStatus('');
  }

  _bindEvents() {
    this.el.modeBots.addEventListener('click', () => this.setMode('bots'));
    this.el.modeFriends.addEventListener('click', () => this.setMode('friends'));

    this.el.playBots.addEventListener('click', () => this._startBots());

    this.el.createRoom.addEventListener('click', () => this._createRoom());
    this.el.joinRoom.addEventListener('click', () => this._joinRoom());
    this.el.copyLink.addEventListener('click', () => this._copyInvite());
    this.el.startRace.addEventListener('click', () => this._hostStart());

    this.el.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this.mode === 'bots') this._startBots();
        else if (this.roomState) this._hostStart();
        else this._joinRoom();
      }
    });
  }

  _wireNetwork() {
    this.network.on('room_created', (msg) => this._applyRoom(msg));
    this.network.on('room_joined', (msg) => this._applyRoom(msg));
    this.network.on('room_update', (msg) => this._applyRoom(msg));
    this.network.on('race_start', (msg) => this._handleRaceStart(msg));
    this.network.on('error', (msg) => this.setStatus(msg.message || 'Something went wrong.', true));
    this.network.on('disconnected', () => {
      if (this.roomState) this.setStatus('Connection lost — reconnecting…', true);
    });
    this.network.on('player_left', (msg) => {
      if (this.roomState) {
        this.roomState.players = msg.players;
        this.roomState.hostId = msg.newHostId;
        this.roomState.isHost = this.network.playerId === msg.newHostId;
        this._renderRoom(this.roomState);
        this.setStatus('A player left the room.');
      }
    });
    this.network.on('room_closed', () => {
      this.roomState = null;
      this.el.roomInfo.classList.add('hidden');
      this.setStatus('Room closed due to inactivity.', true);
    });
  }

  _readUrlRoom() {
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) {
      this.setMode('friends');
      this.el.roomCode.value = code.toUpperCase();
      this.setStatus('Enter your name and click Join Room.');
    }
  }

  _validateName() {
    const name = this.el.name.value.trim();
    if (!name) {
      this.setStatus('Enter your driver name.', true);
      this.el.name.focus();
      return null;
    }
    if (name.length > 20) {
      this.setStatus('Name must be 20 characters or less.', true);
      return null;
    }
    return name;
  }

  _getLaps() {
    return Number(this.el.laps.value) || 3;
  }

  async _ensureConnected() {
    try {
      await this.network.connect();
      return true;
    } catch {
      this.setStatus('Game server unavailable. Try again in a moment.', true);
      return false;
    }
  }

  async _startBots() {
    const name = this._validateName();
    if (!name) return;

    this.hide();
    this.onStart({
      mode: 'bots',
      playerName: name,
      totalLaps: this._getLaps(),
      players: this._soloPlayers(name),
    });
  }

  _soloPlayers(name) {
    return [
      { id: 'local', name, team: TEAMS[0], isLocal: true, isAI: false },
      { id: 'ai1', name: 'Hamilton', team: TEAMS[1], isLocal: false, isAI: true, skill: 0.88, aggression: 0.45 },
      { id: 'ai2', name: 'Leclerc', team: TEAMS[2], isLocal: false, isAI: true, skill: 0.91, aggression: 0.55 },
      { id: 'ai3', name: 'Norris', team: TEAMS[3], isLocal: false, isAI: true, skill: 0.90, aggression: 0.5 },
    ];
  }

  async _createRoom() {
    const name = this._validateName();
    if (!name) return;
    if (!(await this._ensureConnected())) return;

    this.setStatus('Creating room…');
    this.network.createRoom(name, this._getLaps());
  }

  async _joinRoom() {
    const name = this._validateName();
    if (!name) return;
    const code = this.el.roomCode.value.trim().toUpperCase();
    if (!code) {
      this.setStatus('Enter a room code or open an invite link.', true);
      return;
    }
    if (!(await this._ensureConnected())) return;

    this.setStatus('Joining room…');
    this.network.joinRoom(code, name);
  }

  _applyRoom(msg) {
    this.roomState = msg;
    this._renderRoom(msg);
    const invite = `${window.location.origin}${msg.invitePath || `/?room=${msg.roomId}`}`;
    this.el.inviteLink.value = invite;
    history.replaceState(null, '', msg.invitePath || `/?room=${msg.roomId}`);

    if (msg.isHost) {
      this.setStatus(msg.canStart ? 'Ready — start when everyone is here.' : 'Share the link and wait for friends to join.');
    } else {
      this.setStatus('Waiting for host to start the race…');
    }
  }

  _renderRoom(msg) {
    this.el.roomInfo.classList.remove('hidden');
    this.el.playerList.innerHTML = msg.players
      .map((p, i) => {
        const host = p.id === msg.hostId ? ' ★' : '';
        const you = p.id === msg.playerId ? ' (you)' : '';
        return `<li><span class="dot" style="background:${teamColor(p.team)}"></span>${i + 1}. ${escapeHtml(p.name)}${you}${host}</li>`;
      })
      .join('');

    this.el.startRace.disabled = !msg.canStart;
    this.el.startRace.classList.toggle('hidden', !msg.isHost);
    this.el.createRoom.disabled = !!msg.roomId;
  }

  _hostStart() {
    if (!this.roomState?.canStart) {
      this.setStatus('Need at least 2 players in the room.', true);
      return;
    }
    this.network.startRace();
  }

  _handleRaceStart(msg) {
    this.hide();
    const local = msg.players.find((p) => p.id === this.network.playerId);
    const roster = this._buildOnlineRoster(msg.players, local);

    this.onStart({
      mode: 'online',
      playerName: local?.name || this.el.name.value.trim(),
      totalLaps: msg.laps,
      players: roster,
      networkClient: this.network,
      localPlayerId: this.network.playerId,
      raceStartAt: msg.startAt,
    });
  }

  _buildOnlineRoster(humans, localPlayer) {
    const roster = humans.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      isLocal: p.id === localPlayer?.id,
      isAI: false,
    }));

    const aiNames = [
      { name: 'Hamilton', team: TEAMS[1], skill: 0.88, aggression: 0.45 },
      { name: 'Leclerc', team: TEAMS[2], skill: 0.91, aggression: 0.55 },
      { name: 'Norris', team: TEAMS[3], skill: 0.90, aggression: 0.5 },
    ];

    let aiIdx = 0;
    while (roster.length < 4 && aiIdx < aiNames.length) {
      const ai = aiNames[aiIdx++];
      roster.push({
        id: `ai_${aiIdx}`,
        name: ai.name,
        team: ai.team,
        isLocal: false,
        isAI: true,
        skill: ai.skill,
        aggression: ai.aggression,
      });
    }

    return roster;
  }

  async _copyInvite() {
    const link = this.el.inviteLink.value;
    try {
      await navigator.clipboard.writeText(link);
      this.setStatus('Invite link copied!');
    } catch {
      this.el.inviteLink.select();
      document.execCommand('copy');
      this.setStatus('Invite link copied!');
    }
  }
}

function teamColor(team) {
  const map = {
    audi: '#e8e8e8',
    mercedes: '#00d2be',
    ferrari: '#dc0000',
    mclaren: '#ff8000',
  };
  return map[team] || '#fff';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
