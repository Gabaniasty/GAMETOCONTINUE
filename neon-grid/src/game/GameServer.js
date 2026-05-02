const jwt = require('jsonwebtoken');
const db  = require('../db/Database');

const SECRET = process.env.JWT_SECRET || 'neon_grid_secret_change_in_prod';

const SPAWN_POINTS = [
  { x: -30, y: 1.6, z: -30 },
  { x:  30, y: 1.6, z: -30 },
  { x: -30, y: 1.6, z:  30 },
  { x:  30, y: 1.6, z:  30 },
];

const BOUNDS = 40;
const HIT_RADIUS = 0.7;

const CLASSES = {
  SOLDIER: { hp: 100, speed: 8,  damage: 25, fireRate: 200  },
  GHOST:   { hp:  75, speed: 12, damage: 15, fireRate:  80  },
  WRAITH:  { hp: 125, speed: 5,  damage: 90, fireRate: 1500 },
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function raySphereHit(origin, dir, cx, cy, cz, r) {
  const ocx = origin.x - cx, ocy = origin.y - cy, ocz = origin.z - cz;
  const b   = ocx * dir.x + ocy * dir.y + ocz * dir.z;
  const c   = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
  return b * b - c >= 0;
}

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this._spawnIndex  = 0;
    this._tickInterval = null;
  }

  start() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on('player:join', ({ username, class: playerClass, token }) => {
        // Verify JWT if provided, fall back to guest username
        let resolvedUsername = username || `Ghost_${socket.id.slice(0, 4)}`;
        let userId = null;

        if (token) {
          try {
            const payload = jwt.verify(token, SECRET);
            resolvedUsername = payload.username;
            userId = payload.userId;
          } catch {
            // Invalid token — continue as guest
          }
        }

        const spawn = SPAWN_POINTS[this._spawnIndex % SPAWN_POINTS.length];
        this._spawnIndex++;

        const cls = CLASSES[playerClass] || CLASSES.SOLDIER;
        const player = {
          id:       socket.id,
          userId,
          username: resolvedUsername,
          class:    playerClass || 'SOLDIER',
          x: spawn.x, y: spawn.y, z: spawn.z,
          rotY: 0,
          hp:     cls.hp,
          kills:  0,
          deaths: 0,
          dead:   false,
        };

        this.players.set(socket.id, player);
        console.log(`Player joined: ${player.username} (${player.class})`);

        socket.emit('game:state', { players: this._getPlayersArray() });
        socket.broadcast.emit('game:state', { players: this._getPlayersArray() });
      });

      socket.on('player:move', ({ x, y, z, rotY }) => {
        const p = this.players.get(socket.id);
        if (!p || p.dead) return;
        p.x = clamp(x, -BOUNDS, BOUNDS);
        p.y = y;
        p.z = clamp(z, -BOUNDS, BOUNDS);
        p.rotY = rotY;
      });

      socket.on('player:shoot', ({ origin, direction, weaponClass }) => {
        const shooter = this.players.get(socket.id);
        if (!shooter || shooter.dead) return;

        const len = Math.sqrt(direction.x**2 + direction.y**2 + direction.z**2) || 1;
        const dir = { x: direction.x/len, y: direction.y/len, z: direction.z/len };
        const damage = (CLASSES[weaponClass || shooter.class] || CLASSES.SOLDIER).damage;

        for (const [tid, target] of this.players) {
          if (tid === socket.id || target.dead) continue;
          if (!raySphereHit(origin, dir, target.x, target.y, target.z, HIT_RADIUS)) continue;

          target.hp = Math.max(0, target.hp - damage);

          socket.emit('player:hit', { targetId: tid, damage, newHp: target.hp });

          const targetSocket = this.io.sockets.sockets.get(tid);
          if (targetSocket) targetSocket.emit('player:damaged', { shooterId: socket.id, damage, newHp: target.hp });

          console.log(`${shooter.username} hit ${target.username} for ${damage} (${target.hp} HP left)`);

          if (target.hp <= 0) {
            target.dead   = true;
            target.deaths++;
            shooter.kills++;

            this.io.emit('player:killed', {
              killerId:   socket.id,   killerName: shooter.username,
              victimId:   tid,         victimName: target.username,
            });

            // Persist stats to DB for authenticated players
            if (shooter.userId) {
              db.updateStats(shooter.userId, 1, 0, 100);
              const newStats = db.getStats(shooter.userId);
              if (newStats) socket.emit('player:xp_update', { xp: newStats.xp, level: newStats.level });
            }
            if (target.userId) db.updateStats(target.userId, 0, 1, 0);

            setTimeout(() => {
              if (!this.players.has(tid)) return;
              const sp  = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
              const hp  = (CLASSES[target.class] || CLASSES.SOLDIER).hp;
              Object.assign(target, { x: sp.x, y: sp.y, z: sp.z, hp, dead: false });
              this.io.emit('player:respawned', { id: tid, x: sp.x, y: sp.y, z: sp.z, hp });
            }, 3000);
          }
          break;
        }
      });

      socket.on('disconnect', () => {
        const p = this.players.get(socket.id);
        if (p) console.log(`Player left: ${p.username} (${socket.id})`);
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

  _getPlayersArray() { return Array.from(this.players.values()); }

  stop() { if (this._tickInterval) clearInterval(this._tickInterval); }
}

module.exports = { GameServer };
