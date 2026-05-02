export class Network {
  constructor() {
    this._socket = io();
    this._remotePlayers = new Map();
    this._localId = null;
    this._moveInterval = null;
    this._cameraRef = null;
    this._playerClass = 'SOLDIER';

    // Combat callbacks — set by main.js
    this.onHit        = null;
    this.onDamaged    = null;
    this.onKilled     = null;
    this.onRespawned  = null;
    this.onXpUpdate   = null;

    // Round / lobby callbacks
    this.onLobbyState = null;

    const storedName  = localStorage.getItem('ng_username');
    const storedClass = localStorage.getItem('ng_class');

    this._username    = storedName  || ('Ghost_' + String(Math.floor(Math.random() * 9000) + 1000));
    this._playerClass = storedClass || 'SOLDIER';

    this._socket.on('connect', () => {
      this._localId = this._socket.id;
      const token = localStorage.getItem('neon_token') || null;
      this._socket.emit('player:join', {
        username: this._username,
        class: this._playerClass,
        token,
      });
    });

    this._socket.on('game:state', ({ players }) => {
      players.forEach((p) => {
        if (p.id === this._localId) return;
        this._remotePlayers.set(p.id, p);
      });
    });

    this._socket.on('player:left', ({ id }) => {
      this._remotePlayers.delete(id);
    });

    this._socket.on('player:hit', (data) => {
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

  startSendingPosition(camera) {
    this._cameraRef = camera;
    if (this._moveInterval) clearInterval(this._moveInterval);
    this._moveInterval = setInterval(() => {
      if (!this._socket.connected || !this._cameraRef) return;
      const { x, y, z } = this._cameraRef.position;
      const rotY = this._cameraRef.rotation.y;
      this._socket.emit('player:move', { x, y, z, rotY });
    }, 50);
  }

  sendStartRound() {
    this._socket.emit('game:start');
  }

  // targetId and distance are optional — only provided when a player is hit
  sendShoot(origin, direction, targetId = null, distance = 0) {
    const payload = { origin, direction, weaponClass: this._playerClass };
    if (targetId) { payload.targetId = targetId; payload.distance = distance; }
    this._socket.emit('player:shoot', payload);
  }

  getLocalId()       { return this._localId; }
  getRemotePlayers() { return Array.from(this._remotePlayers.values()); }
}
