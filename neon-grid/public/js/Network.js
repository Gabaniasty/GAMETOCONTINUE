export class Network {
  constructor() {
    this._socket        = io();
    this._remotePlayers = new Map();
    this._localId       = null;
    this._moveInterval  = null;
    this._cameraRef     = null;
    this._controlsRef   = null;
    this._playerClass   = 'SOLDIER';
    this._lobbyCode     = null;

    // ── Combat callbacks ──────────────────────────────────────────
    this.onHit        = null;
    this.onDamaged    = null;
    this.onKilled     = null;
    this.onRespawned  = null;
    this.onXpUpdate   = null;

    // ── Lobby / round callbacks ───────────────────────────────────
    this.onLobbyState   = null;
    this.onAnnouncement = null;
    this.onCountdown    = null;
    this.onLobbyCode    = null;   // receives the room code (host display)
    this.onLobbyError   = null;

    const storedName  = localStorage.getItem('ng_username');
    const storedClass = localStorage.getItem('ng_class');

    this._username    = storedName  || ('Ghost_' + String(Math.floor(Math.random() * 9000) + 1000));
    this._playerClass = storedClass || 'WRAITH';

    // Read lobby code from URL (?code=XXXXXX)
    const urlParams    = new URLSearchParams(window.location.search);
    this._lobbyCode    = (urlParams.get('code') || '').toUpperCase().trim();

    // ── Connect: announce self to server and enter the lobby ──────
    this._socket.on('connect', () => {
      this._localId = this._socket.id;
      const token   = localStorage.getItem('neon_token') || null;

      this._socket.emit('lobby:enter', {
        code:     this._lobbyCode,
        username: this._username,
        class:    this._playerClass,
        token,
      });
    });

    // ── Lobby events ──────────────────────────────────────────────
    this._socket.on('lobby:code', ({ code }) => {
      this._lobbyCode = code;
      if (this.onLobbyCode) this.onLobbyCode(code);
    });

    this._socket.on('lobby:error', ({ message }) => {
      if (this.onLobbyError) {
        this.onLobbyError(message);
      } else {
        alert(`Match error: ${message}`);
        window.location.href = '/';
      }
    });

    this._socket.on('lobby:left', () => {
      window.location.href = '/';
    });

    // ── Game state ────────────────────────────────────────────────
    this._socket.on('game:state', ({ players }) => {
      players.forEach((p) => {
        if (p.id === this._localId) return;
        this._remotePlayers.set(p.id, p);
      });
    });

    this._socket.on('player:left', ({ id }) => {
      this._remotePlayers.delete(id);
    });

    this._socket.on('shot:confirmed', (data) => {
      if (this.onHit) this.onHit(data);
    });

    this._socket.on('player:damaged', (data) => {
      if (this.onDamaged) this.onDamaged(data);
    });

    this._socket.on('player:killed', (data) => {
      if (this.onKilled) this.onKilled(data);
    });

    this._socket.on('player:respawned', (data) => {
      if (data.id !== this._localId) {
        const p = this._remotePlayers.get(data.id);
        if (p) { p.x = data.x; p.y = data.y; p.z = data.z; p.hp = data.hp; p.dead = false; }
      }
      if (this.onRespawned) this.onRespawned(data);
    });

    this._socket.on('player:xp_update', (data) => {
      if (this.onXpUpdate) this.onXpUpdate(data);
    });

    this._socket.on('game:lobby_state', (data) => {
      if (this.onLobbyState) this.onLobbyState(data);
    });

    this._socket.on('announcement', ({ type }) => {
      if (this.onAnnouncement) this.onAnnouncement(type);
    });

    this._socket.on('game:countdown', ({ seconds }) => {
      if (this.onCountdown) this.onCountdown(seconds);
    });

    this._socket.on('game:full', ({ reason }) => {
      alert(`Cannot join: ${reason}`);
      window.location.href = '/';
    });

    this._socket.on('disconnect', () => {
      console.log('[Network] Disconnected');
      this._remotePlayers.clear();
      if (this._moveInterval) { clearInterval(this._moveInterval); this._moveInterval = null; }
    });
  }

  startSendingPosition(camera, controls) {
    this._cameraRef   = camera;
    this._controlsRef = controls || null;
    if (this._moveInterval) clearInterval(this._moveInterval);
    this._moveInterval = setInterval(() => {
      if (!this._socket.connected || !this._cameraRef) return;
      const { x, y, z } = this._cameraRef.position;
      const rotY = this._cameraRef.rotation.y;

      let vx = 0, vy = 0, vz = 0, isADS = false, isSprinting = false;
      if (this._controlsRef) {
        const v = this._controlsRef._vel;
        vx = v.x; vy = v.y; vz = v.z;
        isADS       = !!this._controlsRef.isScoped;
        isSprinting = !!this._controlsRef.isSprinting();
      }

      this._socket.emit('player:move', { x, y, z, rotY, vx, vy, vz, isADS, isSprinting });
    }, 33);
  }

  sendStartRound()           { this._socket.emit('game:start'); }
  sendVoteMap(mapId)         { this._socket.emit('game:vote_map',      { mapId }); }
  sendSetRounds(target)      { this._socket.emit('game:set_rounds',    { target }); }
  sendSetMatchWins(target)   { this._socket.emit('game:set_match_wins', { target }); }
  leaveLobby()               { this._socket.emit('game:leave'); }

  sendShoot(origin, direction, targetId = null, distance = 0, hitZone = null) {
    const payload = { origin, direction, weaponClass: this._playerClass };
    if (targetId) {
      payload.targetId = targetId;
      payload.distance = distance;
      payload.hitZone  = hitZone || 'body';
    }
    this._socket.emit('player:shoot', payload);
  }

  getLobbyCode()     { return this._lobbyCode; }
  getLocalId()       { return this._localId; }
  getRemotePlayers() { return Array.from(this._remotePlayers.values()); }
}
