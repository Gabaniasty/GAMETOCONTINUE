export class Network {
  constructor() {
    this._socket = io();
    this._remotePlayers = new Map(); // id -> playerData
    this._localId = null;
    this._moveInterval = null;
    this._cameraRef = null;

    const storedName = localStorage.getItem('ng_username');
    const storedClass = localStorage.getItem('ng_class');

    this._username = storedName || ('Ghost_' + String(Math.floor(Math.random() * 9000) + 1000));
    this._class = storedClass || 'SOLDIER';

    this._socket.on('connect', () => {
      this._localId = this._socket.id;
      console.log(`[Network] Connected as ${this._localId}`);

      this._socket.emit('player:join', {
        username: this._username,
        class: this._class,
      });
    });

    this._socket.on('game:state', ({ players }) => {
      players.forEach((p) => {
        if (p.id === this._localId) return; // skip self
        this._remotePlayers.set(p.id, p);
      });
    });

    this._socket.on('player:left', ({ id }) => {
      this._remotePlayers.delete(id);
    });

    this._socket.on('disconnect', () => {
      console.log('[Network] Disconnected');
      this._remotePlayers.clear();
      if (this._moveInterval) {
        clearInterval(this._moveInterval);
        this._moveInterval = null;
      }
    });
  }

  // Call once to start sending position updates
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
    this._socket.emit('player:shoot', { origin, direction });
  }

  getLocalId() {
    return this._localId;
  }

  getRemotePlayers() {
    return Array.from(this._remotePlayers.values());
  }
}
