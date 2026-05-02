export class Network {
  constructor() {
    this._socket = io();
    this._remotePlayers = new Map();
    this._localId = null;
    this._moveInterval = null;
    this._cameraRef = null;
    this._playerClass = 'SOLDIER';

    // Combat callbacks — set by main.js
    this.onHit        = null; // { targetId, damage, newHp }
    this.onDamaged    = null; // { shooterId, damage, newHp }
    this.onKilled     = null; // { killerId, killerName, victimId, victimName }
    this.onRespawned  = null; // { id, x, y, z, hp }
    this.onXpUpdate   = null; // { xp, level }

    const storedName  = localStorage.getItem('ng_username');
    const storedClass = localStorage.getItem('ng_class');

    this._username    = storedName  || ('Ghost_' + String(Math.floor(Math.random() * 9000) + 1000));
    this._playerClass = storedClass || 'SOLDIER';

    this._socket.on('connect', () => {
      this._localId = this._socket.id;
      console.log(`[Network] Connected as ${this._localId}`);
      this._socket.emit('player:join', {
        username: this._username,
        class: this._playerClass,
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

    // ── Combat events ────────────────────────────────────────────
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
      // Update remote player position if it's someone else
      if (data.id !== this._localId) {
        const p = this._remotePlayers.get(data.id);
        if (p) {
          p.x = data.x; p.y = data.y; p.z = data.z;
          p.hp = data.hp; p.dead = false;
        }
      }
      if (this.onRespawned) this.onRespawned(data);
    });

    this._socket.on('player:xp_update', (data) => {
      if (this.onXpUpdate) this.onXpUpdate(data);
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

  sendShoot(origin, direction) {
    this._socket.emit('player:shoot', { origin, direction, weaponClass: this._playerClass });
  }

  getLocalId()       { return this._localId; }
  getRemotePlayers() { return Array.from(this._remotePlayers.values()); }
}
