const jwt = require('jsonwebtoken');
const db  = require('../db/Database');
const { calculateRPChange, getRankFromRP } = require('./RankSystem');
const { Matchmaker } = require('./Matchmaker');

const SECRET = process.env.JWT_SECRET || 'neon_grid_secret_change_in_prod';

// Team A spawns (north, z=-45) and Team B spawns (south, z=+45)
// x positions: -20, -10, 0, +10, +20 — matches TerminalMap.js _buildSpawns()
const SPAWN_POINTS = [
  // Team A — north
  { x: -20, y: 1.65, z: -45 },
  { x: -10, y: 1.65, z: -45 },
  { x:   0, y: 1.65, z: -45 },
  { x:  10, y: 1.65, z: -45 },
  { x:  20, y: 1.65, z: -45 },
  // Team B — south
  { x: -20, y: 1.65, z:  45 },
  { x: -10, y: 1.65, z:  45 },
  { x:   0, y: 1.65, z:  45 },
  { x:  10, y: 1.65, z:  45 },
  { x:  20, y: 1.65, z:  45 },
];

const BOUNDS        = 49;
const HIT_RADIUS    = 0.7;
const MAX_PLAYERS   = 10;
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes

const CLASSES = {
  SOLDIER: { hp: 100, speed: 5.5, damage: 28, fireRate:   97 },
  GHOST:   { hp:  75, speed: 8.5, damage: 16, fireRate:   67 },
  WRAITH:  { hp: 125, speed: 3.5, damage: 95, fireRate: 1333 },
};

// TERMINAL map collision AABBs — mirrors TERMINAL_AABBS in public/js/maps/TerminalMap.js
const ARENA_AABBS = [
  // ── Outer walls (4) ──
  { minX: -50,    maxX:  50,    minY: 0, maxY: 9, minZ: -50,    maxZ: -48.5  },
  { minX: -50,    maxX:  50,    minY: 0, maxY: 9, minZ:  48.5,  maxZ:  50    },
  { minX: -50,    maxX: -48.5,  minY: 0, maxY: 9, minZ: -50,    maxZ:  50    },
  { minX:  48.5,  maxX:  50,    minY: 0, maxY: 9, minZ: -50,    maxZ:  50    },
  // ── Corridor A inner east wall ──
  { minX: -22,    maxX: -21,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -12    },
  { minX: -22,    maxX: -21,    minY: 0, maxY: 9, minZ:  12,    maxZ:  48.5  },
  // ── Corridor B inner west wall ──
  { minX:  21,    maxX:  22,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -12    },
  { minX:  21,    maxX:  22,    minY: 0, maxY: 9, minZ:  12,    maxZ:  48.5  },
  // ── Server Room (NW) east wall — doorway gap z=-38 to -30 ──
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -38    },
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ: -30,    maxZ: -27    },
  // ── Server Room (NW) south wall — doorway gap x=-33 to -29 ──
  { minX: -48.5,  maxX: -33,    minY: 0, maxY: 9, minZ: -27,    maxZ: -26    },
  // ── Control Hub (NE) west wall — doorway gap z=-38 to -30 ──
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ: -48.5,  maxZ: -38    },
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ: -30,    maxZ: -27    },
  // ── Control Hub (NE) south wall — doorway gap x=+29 to +33 ──
  { minX:  33,    maxX:  48.5,  minY: 0, maxY: 9, minZ: -27,    maxZ: -26    },
  // ── Side Room (SW) east wall — doorway gap z=+30 to +38 ──
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ:  27,    maxZ:  30    },
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ:  38,    maxZ:  48.5  },
  // ── Side Room (SW) north wall — doorway gap x=-33 to -29 ──
  { minX: -48.5,  maxX: -33,    minY: 0, maxY: 9, minZ:  26,    maxZ:  27    },
  // ── Generator Room (SE) west wall — doorway gap z=+30 to +38 ──
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ:  27,    maxZ:  30    },
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ:  38,    maxZ:  48.5  },
  // ── Generator Room (SE) north wall — doorway gap x=+29 to +33 ──
  { minX:  33,    maxX:  48.5,  minY: 0, maxY: 9, minZ:  26,    maxZ:  27    },
  // ── Side room generator box ──
  { minX: -40,    maxX: -36,    minY: 0, maxY: 3, minZ:  36.5,  maxZ:  39.5  },
  // ── Control Hub console ──
  { minX:  37,    maxX:  41,    minY: 0, maxY: 1.1, minZ: -43,  maxZ: -37    },
  // ── Main Hall columns (square approximation) ──
  { minX: -9.6,   maxX: -8.4,   minY: 0, maxY: 7.5, minZ: -6.6, maxZ: -5.4  },
  { minX:  8.4,   maxX:  9.6,   minY: 0, maxY: 7.5, minZ: -6.6, maxZ: -5.4  },
  { minX: -9.6,   maxX: -8.4,   minY: 0, maxY: 7.5, minZ:  5.4, maxZ:  6.6  },
  { minX:  8.4,   maxX:  9.6,   minY: 0, maxY: 7.5, minZ:  5.4, maxZ:  6.6  },
  // ── Server racks (NW room) — 6 racks, two rows of 3 ──
  { minX: -47.6,  maxX: -46.9,  minY: 0, maxY: 3, minZ: -45.9,  maxZ: -44.1  },
  { minX: -47.6,  maxX: -46.9,  minY: 0, maxY: 3, minZ: -40.9,  maxZ: -39.1  },
  { minX: -47.6,  maxX: -46.9,  minY: 0, maxY: 3, minZ: -35.9,  maxZ: -34.1  },
  { minX: -44.4,  maxX: -43.6,  minY: 0, maxY: 3, minZ: -45.9,  maxZ: -44.1  },
  { minX: -44.4,  maxX: -43.6,  minY: 0, maxY: 3, minZ: -40.9,  maxZ: -39.1  },
  { minX: -44.4,  maxX: -43.6,  minY: 0, maxY: 3, minZ: -35.9,  maxZ: -34.1  },
  // ── Corridor cover boxes ──
  { minX: -26,    maxX: -24,    minY: 0, maxY: 1.5, minZ: -12,   maxZ: -10    },
  { minX: -26,    maxX: -24,    minY: 0, maxY: 1.5, minZ:  10,   maxZ:  12    },
  { minX:  24,    maxX:  26,    minY: 0, maxY: 1.5, minZ: -12,   maxZ: -10    },
  { minX:  24,    maxX:  26,    minY: 0, maxY: 1.5, minZ:  10,   maxZ:  12    },
  // ── Chokepoint walls (z=+25 to +38, stops before spawn zone) ──
  { minX: -4,     maxX: -3,     minY: 0, maxY: 9, minZ:  25,    maxZ:  38    },
  { minX:  3,     maxX:  4,     minY: 0, maxY: 9, minZ:  25,    maxZ:  38    },
  // ── Chokepoint barricades ──
  { minX: -2.75,  maxX: -0.25,  minY: 0, maxY: 1.8, minZ: 28.5, maxZ: 29.5  },
  { minX:  0.25,  maxX:  2.75,  minY: 0, maxY: 1.8, minZ: 34.5, maxZ: 35.5  },
  // ── Corridor A outer west wall — mid-map z=-27 to +27 ──
  { minX: -30,    maxX: -29,    minY: 0, maxY: 9, minZ: -27,    maxZ:  27    },
  // ── Corridor B outer east wall — mid-map z=-27 to +27 ──
  { minX:  29,    maxX:  30,    minY: 0, maxY: 9, minZ: -27,    maxZ:  27    },
  // ── Catwalk (maxY=5.8 = grate mesh top, CATWALK_EYE_Y=7.45, feet=5.8) ──
  { minX: -2,     maxX:  2,     minY: 5.2, maxY: 5.8, minZ: -30, maxZ:  30   },
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
    this.io           = io;
    this.players      = new Map();
    this._spawnIndex  = 0;
    this._tickInterval = null;
    this.mapAABBs     = ARENA_AABBS;

    // ── Round system ─────────────────────────────────────────────
    this.gameState      = 'lobby';   // 'lobby' | 'playing' | 'results'
    this.hostId         = null;
    this._roundTimer    = null;
    this._currentMatchId  = null;
    this._roundStartTime  = 0;

    // ── Matchmaker ───────────────────────────────────────────────
    this.matchmaker = new Matchmaker(io);
  }

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
        // ── Max players check ────────────────────────────────────
        if (this.players.size >= MAX_PLAYERS) {
          socket.emit('game:full', { reason: 'Session is full (max 10 players).' });
          return;
        }

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

        // Assign host to first player
        if (!this.hostId) this.hostId = socket.id;

        console.log(`Player joined: ${player.username} (${player.class})`);
        setTimeout(() => {
          if (this.players.has(socket.id)) this.players.get(socket.id).spawnProtection = false;
        }, 2500);

        socket.emit('game:state', { players: this._getPlayersArray() });
        socket.broadcast.emit('game:state', { players: this._getPlayersArray() });

        this._broadcastLobbyState();

        // Auto-start when session is full
        if (this.players.size >= MAX_PLAYERS && this.gameState === 'lobby') {
          this._startRound();
        }
      });

      socket.on('player:move', ({ x, y, z, rotY }) => {
        const p = this.players.get(socket.id);
        if (!p || p.dead) return;
        p.x    = clamp(x, -BOUNDS, BOUNDS);
        p.y    = y;
        p.z    = clamp(z, -BOUNDS, BOUNDS);
        p.rotY = rotY;
      });

      // ── Shoot handler ────────────────────────────────────────────
      socket.on('player:shoot', ({ origin, direction, weaponClass, targetId, distance }) => {
        // No damage outside an active round
        if (this.gameState !== 'playing') return;

        const shooter = this.players.get(socket.id);
        if (!shooter || shooter.dead) return;

        if (!targetId) return;

        const target = this.players.get(targetId);
        if (!target || target.dead || target.spawnProtection) return;

        if (distance > 250) return;

        const posDiff = Math.sqrt(
          (shooter.x - origin.x) ** 2 +
          (shooter.y - origin.y) ** 2 +
          (shooter.z - origin.z) ** 2
        );
        if (posDiff > 6) return;

        const targetCenter = { x: target.x, y: target.y + 0.8, z: target.z };
        if (!this.isLineClearOfWalls(origin, targetCenter)) return;

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

          // Stats are committed in bulk at round end; no per-kill DB writes.

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

      // ── Matchmaking queue ────────────────────────────────────────
      socket.on('queue:join', ({ userId, username, rankPoints, playerClass }) => {
        this.matchmaker.joinQueue(socket, { userId, username, rankPoints, playerClass });
      });

      socket.on('queue:leave', () => {
        this.matchmaker.leaveQueue(socket.id);
      });

      // ── Host starts the round ────────────────────────────────────
      socket.on('game:start', () => {
        if (socket.id !== this.hostId) return;
        if (this.gameState !== 'lobby') return;
        this._startRound();
      });

      socket.on('disconnect', () => {
        this.matchmaker.leaveQueue(socket.id);
        const p = this.players.get(socket.id);
        if (p) console.log(`Player left: ${p.username} (${socket.id})`);
        this.players.delete(socket.id);
        this.io.emit('player:left', { id: socket.id });

        // Reassign host to next available player
        if (this.hostId === socket.id) {
          const next = this.players.keys().next();
          this.hostId = next.done ? null : next.value;
        }

        // Reset state if everyone left
        if (this.players.size === 0) {
          this.gameState = 'lobby';
          if (this._roundTimer) { clearTimeout(this._roundTimer); this._roundTimer = null; }
        }

        this._broadcastLobbyState();
      });
    });

    this._tickInterval = setInterval(() => {
      if (this.players.size === 0) return;
      this.io.emit('game:state', { players: this._getPlayersArray() });
    }, 50);

    console.log('GameServer started (20 tick/s)');
  }

  // ── Round lifecycle ──────────────────────────────────────────────
  _startRound() {
    this.gameState       = 'playing';
    this._roundStartTime = Date.now();

    // Create match record and register authenticated players
    try {
      this._currentMatchId = db.createMatch('ARENA', 'DEATHMATCH');
      for (const p of this.players.values()) {
        if (p.userId) db.addMatchPlayer(this._currentMatchId, p.userId);
      }
    } catch (e) {
      console.error('[DB] createMatch failed:', e.message);
      this._currentMatchId = null;
    }

    // Respawn all players with fresh stats
    for (const [, p] of this.players) {
      const sp = this._getFarthestSpawn();
      const hp = (CLASSES[p.class] || CLASSES.SOLDIER).hp;
      Object.assign(p, { x: sp.x, y: sp.y, z: sp.z, hp, dead: false, kills: 0, deaths: 0, spawnProtection: true });
      const id = p.id;
      setTimeout(() => {
        if (this.players.has(id)) this.players.get(id).spawnProtection = false;
      }, 2500);
    }

    // Tell each client to respawn
    for (const [id, p] of this.players) {
      const s = this.io.sockets.sockets.get(id);
      if (s) s.emit('player:respawned', { id, x: p.x, y: p.y, z: p.z, hp: p.hp, class: p.class });
    }

    this._broadcastLobbyState();

    if (this._roundTimer) clearTimeout(this._roundTimer);
    this._roundTimer = setTimeout(() => this._endRound(), ROUND_DURATION);
  }

  _endRound() {
    this.gameState = 'results';

    // ── Commit match stats to DB ────────────────────────────────
    const matchId = this._currentMatchId;
    if (matchId) {
      try {
        const duration = Math.round((Date.now() - this._roundStartTime) / 1000);

        // Find winner (highest kills; ties broken by fewer deaths)
        let winner = null;
        for (const p of this.players.values()) {
          if (!winner ||
              p.kills > winner.kills ||
              (p.kills === winner.kills && p.deaths < winner.deaths)) {
            winner = p;
          }
        }
        const winnerId = (winner && winner.userId) ? winner.userId : null;
        db.finalizeMatch(matchId, winnerId, duration);

        // Gather authenticated players and their current round-level rank points
        // for the RP diff calculation
        const authPlayers = Array.from(this.players.values()).filter(p => p.userId);

        const rpMap = {};
        for (const p of authPlayers) {
          const r = db.getRank(p.userId);
          rpMap[p.userId] = r ? r.rank_points : 0;
        }

        const avgRP = authPlayers.length > 0
          ? authPlayers.reduce((s, p) => s + rpMap[p.userId], 0) / authPlayers.length
          : 0;

        for (const p of authPlayers) {
          const won = (winner && p.id === winner.id);
          const placement = won ? 1 : 2;

          // RP calculation using this player's current RP vs opponents' avg
          const opponentAvgRP = authPlayers.length > 1
            ? (authPlayers.filter(op => op.userId !== p.userId)
                         .reduce((s, op) => s + rpMap[op.userId], 0) /
               (authPlayers.length - 1))
            : avgRP;

          const rpChange = calculateRPChange(
            rpMap[p.userId], opponentAvgRP, won,
            p.kills, p.deaths, 0,
          );

          db.updateStatsAfterMatch(p.userId, {
            kills: p.kills, deaths: p.deaths,
            assists: 0, headshots: 0,
            shotsFired: 0, shotsHit: 0, damage: 0,
            won, playtimeSeconds: duration,
          });
          db.updateRankPoints(p.userId, rpChange, won);
          db.updateMatchPlayer(matchId, p.userId, {
            kills: p.kills, deaths: p.deaths,
            assists: 0, headshots: 0, damage: 0,
            score: p.kills * 100,
            placement, rpChange,
          });

          // Push updated stats to the player's socket
          const sock = this.io.sockets.sockets.get(p.id);
          if (sock) {
            const newStats = db.getStats(p.userId);
            const newRank  = db.getRank(p.userId);
            sock.emit('player:stats_update', { stats: newStats, rank: newRank, rpChange });
          }
        }
      } catch (e) {
        console.error('[DB] _endRound commit failed:', e.message);
      }
      this._currentMatchId = null;
    }

    this._broadcastLobbyState();

    // Return to lobby after 12 s, resetting round stats
    setTimeout(() => {
      for (const p of this.players.values()) {
        p.kills = 0; p.deaths = 0;
        const sp = this._getFarthestSpawn();
        const hp = (CLASSES[p.class] || CLASSES.SOLDIER).hp;
        Object.assign(p, { x: sp.x, y: sp.y, z: sp.z, hp, dead: false });
      }
      this.gameState = 'lobby';
      this._broadcastLobbyState();
    }, 12000);
  }

  _broadcastLobbyState() {
    const data = {
      gameState:   this.gameState,
      hostId:      this.hostId,
      playerCount: this.players.size,
      maxPlayers:  MAX_PLAYERS,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, username: p.username, class: p.class,
        kills: p.kills, deaths: p.deaths, dead: p.dead, hp: p.hp,
      })),
    };
    this.io.emit('game:lobby_state', data);
  }

  _getPlayersArray() { return Array.from(this.players.values()); }
  stop()             { if (this._tickInterval) clearInterval(this._tickInterval); }
}

module.exports = { GameServer };
