const SPAWN_POINTS = [
  { x: -30, y: 1.6, z: -30 },
  { x:  30, y: 1.6, z: -30 },
  { x: -30, y: 1.6, z:  30 },
  { x:  30, y: 1.6, z:  30 },
];

const BOUNDS = 40;
const HIT_RADIUS = 0.7;

const WEAPON_DAMAGE = {
  SOLDIER: 25,
  GHOST:   15,
  WRAITH:  90,
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Ray-sphere intersection — returns true if ray hits sphere
// ray: { origin:{x,y,z}, dir:{x,y,z} (unit vector) }
// sphere: { cx, cy, cz, r }
function raySphereHit(origin, dir, cx, cy, cz, r) {
  const ocx = origin.x - cx;
  const ocy = origin.y - cy;
  const ocz = origin.z - cz;

  const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
  const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
  const disc = b * b - c;
  return disc >= 0;
}

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
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
          x: spawn.x, y: spawn.y, z: spawn.z,
          rotY: 0,
          hp: 100,
          kills: 0,
          deaths: 0,
          dead: false,
        };

        this.players.set(socket.id, player);
        console.log(`Player joined: ${player.username} (${player.class})`);

        socket.emit('game:state', { players: this._getPlayersArray() });
        socket.broadcast.emit('game:state', { players: this._getPlayersArray() });
      });

      socket.on('player:move', ({ x, y, z, rotY }) => {
        const player = this.players.get(socket.id);
        if (!player || player.dead) return;
        player.x    = clamp(x, -BOUNDS, BOUNDS);
        player.y    = y;
        player.z    = clamp(z, -BOUNDS, BOUNDS);
        player.rotY = rotY;
      });

      socket.on('player:shoot', ({ origin, direction, weaponClass }) => {
        const shooter = this.players.get(socket.id);
        if (!shooter || shooter.dead) return;

        // Normalise direction
        const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2) || 1;
        const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };

        const damage = WEAPON_DAMAGE[weaponClass || shooter.class] || 25;

        for (const [tid, target] of this.players) {
          if (tid === socket.id || target.dead) continue;

          // Sphere centre is at body centre (y - 0.8 + 0.8 = player.y)
          if (!raySphereHit(origin, dir, target.x, target.y, target.z, HIT_RADIUS)) continue;

          target.hp = Math.max(0, target.hp - damage);

          // Notify shooter
          socket.emit('player:hit', {
            targetId: tid,
            damage,
            newHp: target.hp,
          });

          // Notify victim
          const targetSocket = this.io.sockets.sockets.get(tid);
          if (targetSocket) {
            targetSocket.emit('player:damaged', {
              shooterId: socket.id,
              damage,
              newHp: target.hp,
            });
          }

          console.log(`${shooter.username} hit ${target.username} for ${damage} (${target.hp} HP left)`);

          if (target.hp <= 0) {
            target.dead = true;
            target.deaths++;
            shooter.kills++;

            this.io.emit('player:killed', {
              killerId:    socket.id,
              killerName:  shooter.username,
              victimId:    tid,
              victimName:  target.username,
            });

            console.log(`${shooter.username} killed ${target.username}`);

            // Respawn after 3 seconds
            setTimeout(() => {
              if (!this.players.has(tid)) return;
              const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
              target.x    = spawn.x;
              target.y    = spawn.y;
              target.z    = spawn.z;
              target.hp   = 100;
              target.dead = false;

              this.io.emit('player:respawned', {
                id: tid,
                x: spawn.x, y: spawn.y, z: spawn.z,
                hp: 100,
              });

              console.log(`${target.username} respawned`);
            }, 3000);
          }

          break; // one hit per shot
        }
      });

      socket.on('disconnect', () => {
        const player = this.players.get(socket.id);
        if (player) console.log(`Player left: ${player.username} (${socket.id})`);
        this.players.delete(socket.id);
        this.io.emit('player:left', { id: socket.id });
      });
    });

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
