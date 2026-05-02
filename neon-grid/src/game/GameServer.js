const jwt = require('jsonwebtoken');
const db  = require('../db/Database');

const SECRET = process.env.JWT_SECRET || 'neon_grid_secret_change_in_prod';

const SPAWN_POINTS = [
  { x: -30, y: 1.6, z: -30 },
  { x:  30, y: 1.6, z: -30 },
  { x: -30, y: 1.6, z:  30 },
  { x:  30, y: 1.6, z:  30 },
  { x:   0, y: 1.6, z: -30 },
  { x:   0, y: 1.6, z:  30 },
  { x: -30, y: 1.6, z:   0 },
  { x:  30, y: 1.6, z:   0 },
];

const BOUNDS     = 40;
const HIT_RADIUS = 0.7;

const CLASSES = {
  SOLDIER: { hp: 100, speed: 5.5, damage: 28, fireRate:   97 },
  GHOST:   { hp:  75, speed: 8.5, damage: 16, fireRate:   67 },
  WRAITH:  { hp: 125, speed: 3.5, damage: 95, fireRate: 1333 },
};

// Arena wall/cover AABBs matching generate-arena.js output
// Each entry: { minX, maxX, minY, maxY, minZ, maxZ }
const ARENA_AABBS = [
  // Outer walls
  { minX: -40,   maxX:  40,   minY: 0, maxY: 6, minZ: -40.5, maxZ: -39.5 }, // WallN
  { minX: -40,   maxX:  40,   minY: 0, maxY: 6, minZ:  39.5, maxZ:  40.5 }, // WallS
  { minX: -40.5, maxX: -39.5, minY: 0, maxY: 6, minZ: -40,   maxZ:  40   }, // WallW
  { minX:  39.5, maxX:  40.5, minY: 0, maxY: 6, minZ: -40,   maxZ:  40   }, // WallE
  // Centre corridor walls
  { minX:  -8.5, maxX:  -7.5, minY: 0, maxY: 4, minZ: -25,   maxZ:  25   }, // CorridorL
  { minX:   7.5, maxX:   8.5, minY: 0, maxY: 4, minZ: -25,   maxZ:  25   }, // CorridorR
  // Partial cross-walls
  { minX: -31,   maxX:  -9,   minY: 0, maxY: 4, minZ: -20.5, maxZ: -19.5 }, // BlockNW
  { minX:   9,   maxX:  31,   minY: 0, maxY: 4, minZ: -20.5, maxZ: -19.5 }, // BlockNE
  { minX: -31,   maxX:  -9,   minY: 0, maxY: 4, minZ:  19.5, maxZ:  20.5 }, // BlockSW
  { minX:   9,   maxX:  31,   minY: 0, maxY: 4, minZ:  19.5, maxZ:  20.5 }, // BlockSE
  // Cover crates
  { minX: -16.5, maxX: -13.5, minY: 0, maxY: 2, minZ: -16.5, maxZ: -13.5 },
  { minX:  13.5, maxX:  16.5, minY: 0, maxY: 2, minZ: -16.5, maxZ: -13.5 },
  { minX: -16.5, maxX: -13.5, minY: 0, maxY: 2, minZ:  13.5, maxZ:  16.5 },
  { minX:  13.5, maxX:  16.5, minY: 0, maxY: 2, minZ:  13.5, maxZ:  16.5 },
  { minX:  -1.5, maxX:   1.5, minY: 0, maxY: 2, minZ: -26.5, maxZ: -23.5 },
  { minX:  -1.5, maxX:   1.5, minY: 0, maxY: 2, minZ:  23.5, maxZ:  26.5 },
  { minX: -26.5, maxX: -23.5, minY: 0, maxY: 2, minZ:  -1.5, maxZ:   1.5 },
  { minX:  23.5, maxX:  26.5, minY: 0, maxY: 2, minZ:  -1.5, maxZ:   1.5 },
  // Corner pillars
  { minX: -36,   maxX: -34,   minY: 0, maxY: 6, minZ: -36,   maxZ: -34   },
  { minX:  34,   maxX:  36,   minY: 0, maxY: 6, minZ: -36,   maxZ: -34   },
  { minX: -36,   maxX: -34,   minY: 0, maxY: 6, minZ:  34,   maxZ:  36   },
  { minX:  34,   maxX:  36,   minY: 0, maxY: 6, minZ:  34,   maxZ:  36   },
  // Elevated platforms
  { minX: -24,   maxX: -16,   minY: 0, maxY: 1, minZ: -24,   maxZ: -16   },
  { minX:  16,   maxX:  24,   minY: 0, maxY: 1, minZ:  16,   maxZ:  24   },
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Slab-method ray-AABB intersection — returns hit distance or Infinity
function rayAABBDist(ro, rd, box) {
  const invDx = 1 / (rd.x || 1e-10);
  const invDy = 1 / (rd.y || 1e-10);
  const invDz = 1 / (rd.z || 1e-10);
  const tx1 = (box.minX - ro.x) * invDx, tx2 = (box.maxX - ro.x) * invDx;
  const ty1 = (box.minY - ro.y) * invDy, ty2 = (box.maxY - ro.y) * invDy;
  const tz1 = (box.minZ - ro.z) * invDz, tz2 = (box.maxZ - ro.z) * invDz;
  const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2), Math.min(tz1, tz2));
  const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2), Math.max(tz1, tz2));
  if (tmax < 0 || tmin > tmax) return Infinity;
  return tmin < 0 ? tmax : tmin;
}

class GameServer {
  constructor(io) {
    this.io = io;
    this.players      = new Map();
    this._spawnIndex  = 0;
    this._tickInterval = null;
    this.mapAABBs     = ARENA_AABBS;
  }

  // Check whether a straight line from `from` to `to` is unobstructed by walls
  isLineClearOfWalls(from, to) {
    const dir  = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const dist = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
    if (dist < 0.01) return true;
    const norm = { x: dir.x / dist, y: dir.y / dist, z: dir.z / dist };
    for (const box of this.mapAABBs) {
      const t = rayAABBDist(from, norm, box);
      if (t !== Infinity && t > 0.15 && t < dist - 0.15) return false;
    }
    return true;
  }

  // Pick spawn point farthest from all alive players
  _getFarthestSpawn() {
    const alive = Array.from(this.players.values()).filter(p => !p.dead);
    if (!alive.length) return SPAWN_POINTS[this._spawnIndex++ % SPAWN_POINTS.length];
    let best = SPAWN_POINTS[0], bestDist = -1;
    for (const sp of SPAWN_POINTS) {
      const minDist = Math.min(...alive.map(p => {
        const dx = sp.x - p.x, dz = sp.z - p.z;
        return Math.sqrt(dx * dx + dz * dz);
      }));
      if (minDist > bestDist) { bestDist = minDist; best = sp; }
    }
    return best;
  }

  start() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on('player:join', ({ username, class: playerClass, token }) => {
        let resolvedUsername = username || `Ghost_${socket.id.slice(0, 4)}`;
        let userId = null;

        if (token) {
          try {
            const payload = jwt.verify(token, SECRET);
            resolvedUsername = payload.username;
            userId = payload.userId;
          } catch { /* invalid token — continue as guest */ }
        }

        const spawn = this._getFarthestSpawn();
        const cls   = CLASSES[playerClass] || CLASSES.SOLDIER;
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
          spawnProtection: true,
        };

        this.players.set(socket.id, player);
        console.log(`Player joined: ${player.username} (${player.class})`);
        setTimeout(() => { if (this.players.has(socket.id)) this.players.get(socket.id).spawnProtection = false; }, 2500);

        socket.emit('game:state', { players: this._getPlayersArray() });
        socket.broadcast.emit('game:state', { players: this._getPlayersArray() });
      });

      socket.on('player:move', ({ x, y, z, rotY }) => {
        const p = this.players.get(socket.id);
        if (!p || p.dead) return;
        p.x    = clamp(x, -BOUNDS, BOUNDS);
        p.y    = y;
        p.z    = clamp(z, -BOUNDS, BOUNDS);
        p.rotY = rotY;
      });

      // ── Shoot handler (targetId-based with wall validation) ────────
      socket.on('player:shoot', ({ origin, direction, weaponClass, targetId, distance }) => {
        const shooter = this.players.get(socket.id);
        if (!shooter || shooter.dead) return;

        // No targetId — bullet missed all players (or hit a wall). Nothing to do.
        if (!targetId) return;

        const target = this.players.get(targetId);
        if (!target || target.dead || target.spawnProtection) return;

        // ── Anti-cheat checks ──────────────────────────────────────
        if (distance > 250) return;

        const posDiff = Math.sqrt(
          (shooter.x - origin.x) ** 2 +
          (shooter.y - origin.y) ** 2 +
          (shooter.z - origin.z) ** 2
        );
        if (posDiff > 6) return;

        // Wall occlusion check
        const targetCenter = { x: target.x, y: target.y + 0.8, z: target.z };
        if (!this.isLineClearOfWalls(origin, targetCenter)) return;

        // Direction dot-product check (must aim within ~32° of target)
        const toTarget = {
          x: targetCenter.x - origin.x,
          y: targetCenter.y - origin.y,
          z: targetCenter.z - origin.z,
        };
        const len = Math.sqrt(toTarget.x ** 2 + toTarget.y ** 2 + toTarget.z ** 2);
        const dot = (toTarget.x / len) * direction.x +
                    (toTarget.y / len) * direction.y +
                    (toTarget.z / len) * direction.z;
        if (dot < 0.85) return;

        // ── All checks passed — apply damage ──────────────────────
        const damage = (CLASSES[weaponClass || shooter.class] || CLASSES.SOLDIER).damage;
        target.hp    = Math.max(0, target.hp - damage);

        socket.emit('player:hit', { targetId, damage, newHp: target.hp });

        const targetSocket = this.io.sockets.sockets.get(targetId);
        if (targetSocket) {
          targetSocket.emit('player:damaged', {
            shooterId: socket.id, damage, newHp: target.hp,
            hitPos: { x: target.x, y: target.y, z: target.z },
          });
        }

        if (target.hp <= 0) {
          target.dead = true;
          target.deaths++;
          shooter.kills++;

          this.io.emit('player:killed', {
            killerId:    socket.id,   killerName:  shooter.username,
            victimId:    targetId,    victimName:  target.username,
            killerClass: shooter.class,
          });

          if (shooter.userId) {
            db.updateStats(shooter.userId, 1, 0, 100);
            const newStats = db.getStats(shooter.userId);
            if (newStats) socket.emit('player:xp_update', { xp: newStats.xp, level: newStats.level });
          }
          if (target.userId) db.updateStats(target.userId, 0, 1, 0);

          setTimeout(() => {
            if (!this.players.has(targetId)) return;
            const sp = this._getFarthestSpawn();
            const hp = (CLASSES[target.class] || CLASSES.SOLDIER).hp;
            Object.assign(target, { x: sp.x, y: sp.y, z: sp.z, hp, dead: false, spawnProtection: true });
            this.io.emit('player:respawned', {
              id: targetId, x: sp.x, y: sp.y, z: sp.z, hp, class: target.class,
            });
            setTimeout(() => {
              if (this.players.has(targetId)) this.players.get(targetId).spawnProtection = false;
            }, 2500);
          }, 3000);
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
