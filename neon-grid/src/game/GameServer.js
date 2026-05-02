const SPAWN_POINTS = [
  { x: -30, y: 1.6, z: -30 },
  { x:  30, y: 1.6, z: -30 },
  { x: -30, y: 1.6, z:  30 },
  { x:  30, y: 1.6, z:  30 },
];

const BOUNDS = 40;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map(); // socketId -> playerState
    this._spawnIndex = 0;
    this._tickInterval = null;
  }

  start() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on('player:join', ({ username, class: playerClass }) => {
        const spawn = SPAWN_POINTS[this._spawnIndex % SPAWN_POINTS.length];
        this._spawnIndex++;

        const player = {
          id: socket.id,
          username: username || `Ghost_${socket.id.slice(0, 4)}`,
          class: playerClass || 'SOLDIER',
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          rotY: 0,
          hp: 100,
          kills: 0,
          deaths: 0,
        };

        this.players.set(socket.id, player);
        console.log(`Player joined: ${player.username} (${player.class})`);

        // Send full current state back to the joining player
        socket.emit('game:state', { players: this._getPlayersArray() });

        // Tell everyone else about the new player
        socket.broadcast.emit('game:state', { players: this._getPlayersArray() });
      });

      socket.on('player:move', ({ x, y, z, rotY }) => {
        const player = this.players.get(socket.id);
        if (!player) return;

        player.x = clamp(x, -BOUNDS, BOUNDS);
        player.y = y;
        player.z = clamp(z, -BOUNDS, BOUNDS);
        player.rotY = rotY;
      });

      socket.on('player:shoot', ({ origin, direction }) => {
        const player = this.players.get(socket.id);
        if (!player) return;
        console.log(`[SHOOT] ${player.username} | origin:`, origin, 'dir:', direction);
        // Phase 4: hit detection goes here
      });

      socket.on('disconnect', () => {
        const player = this.players.get(socket.id);
        if (player) {
          console.log(`Player left: ${player.username} (${socket.id})`);
        }
        this.players.delete(socket.id);
        this.io.emit('player:left', { id: socket.id });
      });
    });

    // 20 tick/sec broadcast loop
    this._tickInterval = setInterval(() => {
      if (this.players.size === 0) return;
      this.io.emit('game:state', { players: this._getPlayersArray() });
    }, 50);

    console.log('GameServer started (20 tick/s)');
  }

  _getPlayersArray() {
    return Array.from(this.players.values());
  }

  stop() {
    if (this._tickInterval) clearInterval(this._tickInterval);
  }
}

module.exports = { GameServer };
