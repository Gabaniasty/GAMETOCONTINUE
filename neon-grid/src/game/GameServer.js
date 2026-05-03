const jwt = require('jsonwebtoken');
const db  = require('../db/Database');
const { calculateRPChange, getRankFromRP } = require('./RankSystem');

const SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'neon_grid_secret_change_in_prod';

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

const BOUNDS_TERMINAL  = 49;
const BOUNDS_OVERWATCH = 50;
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

// ── OVERWATCH map collision AABBs ──────────────────────────────────────────
// Verbatim copy of OVERWATCH_AABBS from public/js/maps/OverwatchMap.js.
// Keep these two lists identical so server LOS raycasting matches client physics.
const OVERWATCH_AABBS = [
  // ── Ground floor (full 100×100 slab) ──
  { minX: -50, maxX: 50, minY: -0.5, maxY: 0, minZ: -50, maxZ: 50 },
  // ── Outer boundary walls (keep players in map) ──
  { minX: -50, maxX:  50, minY: 0, maxY: 3, minZ:  -50, maxZ: -48.5 },
  { minX: -50, maxX:  50, minY: 0, maxY: 3, minZ:  48.5, maxZ:  50  },
  { minX: -50, maxX: -48.5, minY: 0, maxY: 3, minZ: -50, maxZ:  50  },
  { minX:  48.5, maxX: 50, minY: 0, maxY: 3, minZ: -50, maxZ:  50   },
  // ── West building shell ──
  { minX: -30, maxX: -29, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  { minX: -11, maxX: -10, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  { minX: -30, maxX: -23, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  { minX: -17, maxX: -10, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  { minX: -23, maxX: -17, minY: 3.5, maxY: 12, minZ: -8, maxZ: -7 },
  { minX: -30, maxX: -23, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  { minX: -17, maxX: -10, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  { minX: -23, maxX: -17, minY: 3.5, maxY: 12, minZ: 7, maxZ: 8 },
  // ── West building interior ramp ──
  { minX: -22, maxX: -18, minY: 0, maxY: 4,  minZ:  2, maxZ: 7  },
  { minX: -22, maxX: -18, minY: 4, maxY: 8,  minZ: -4, maxZ: 2  },
  { minX: -22, maxX: -18, minY: 8, maxY: 12, minZ: -7, maxZ: -4 },
  // ── West rooftop slab ──
  { minX: -30, maxX: -10, minY: 12, maxY: 12.5, minZ: -8, maxZ: 8 },
  // ── West rooftop low parapet walls ──
  { minX: -30, maxX: -10,    minY: 12.5, maxY: 13.3, minZ: -8.5, maxZ: -8.0  },
  { minX: -30, maxX: -10,    minY: 12.5, maxY: 13.3, minZ:  8.0, maxZ:  8.5  },
  { minX: -30.5, maxX: -30,  minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ:  8.0  },
  { minX: -10.5, maxX: -10,  minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ: -2.5  },
  { minX: -10.5, maxX: -10,  minY: 12.5, maxY: 13.3, minZ:  2.5, maxZ:  8.0  },
  // ── East building shell (mirrored) ──
  { minX:  29, maxX:  30, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  { minX:  10, maxX:  11, minY: 0, maxY: 12, minZ: -8, maxZ: 8 },
  { minX:  10, maxX:  17, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  { minX:  23, maxX:  30, minY: 0, maxY: 12, minZ: -8, maxZ: -7 },
  { minX:  17, maxX:  23, minY: 3.5, maxY: 12, minZ: -8, maxZ: -7 },
  { minX:  10, maxX:  17, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  { minX:  23, maxX:  30, minY: 0, maxY: 12, minZ: 7, maxZ: 8 },
  { minX:  17, maxX:  23, minY: 3.5, maxY: 12, minZ: 7, maxZ: 8 },
  // ── East building interior ramp ──
  { minX:  18, maxX:  22, minY: 0, maxY: 4,  minZ:  2, maxZ: 7  },
  { minX:  18, maxX:  22, minY: 4, maxY: 8,  minZ: -4, maxZ: 2  },
  { minX:  18, maxX:  22, minY: 8, maxY: 12, minZ: -7, maxZ: -4 },
  // ── East rooftop slab ──
  { minX:  10, maxX:  30, minY: 12, maxY: 12.5, minZ: -8, maxZ: 8 },
  // ── East rooftop low parapet walls ──
  { minX:  10, maxX:  30,   minY: 12.5, maxY: 13.3, minZ: -8.5, maxZ: -8.0  },
  { minX:  10, maxX:  30,   minY: 12.5, maxY: 13.3, minZ:  8.0, maxZ:  8.5  },
  { minX:  30, maxX:  30.5, minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ:  8.0  },
  { minX:  10, maxX:  10.5, minY: 12.5, maxY: 13.3, minZ: -8.0, maxZ: -2.5  },
  { minX:  10, maxX:  10.5, minY: 12.5, maxY: 13.3, minZ:  2.5, maxZ:  8.0  },
  // ── North catwalk (west rooftop, extends north) ──
  { minX: -23, maxX: -17, minY: 12, maxY: 12.4, minZ: -28, maxZ: -8 },
  // ── South catwalk (east rooftop, extends south) ──
  { minX:  17, maxX:  23, minY: 12, maxY: 12.4, minZ:  8, maxZ:  28 },
  // ── Center bridge ──
  { minX: -20, maxX: 20, minY: 12, maxY: 12.5, minZ: -3, maxZ: 3 },
  // ── NW sniper nest platform ──
  { minX: -45, maxX: -35, minY: 20, maxY: 20.5, minZ: -40, maxZ: -30 },
  { minX: -45, maxX: -35,   minY: 20.5, maxY: 21.7, minZ: -40.5, maxZ: -40 },
  { minX: -45.5, maxX: -45, minY: 20.5, maxY: 21.7, minZ: -40,   maxZ: -30 },
  { minX: -45, maxX: -35,   minY: 20.5, maxY: 21.7, minZ: -30,   maxZ: -29.5 },
  // ── SE sniper nest platform ──
  { minX:  35, maxX:  45, minY: 20, maxY: 20.5, minZ:  30, maxZ:  40 },
  { minX:  35, maxX:  45,   minY: 20.5, maxY: 21.7, minZ:  40,   maxZ:  40.5 },
  { minX:  45, maxX:  45.5, minY: 20.5, maxY: 21.7, minZ:  30,   maxZ:  40   },
  { minX:  35, maxX:  45,   minY: 20.5, maxY: 21.7, minZ:  29.5, maxZ:  30   },
  // ── Center antenna tower ──
  { minX: -1.5, maxX: 1.5, minY:  0, maxY:  3, minZ: -1.5, maxZ: 1.5 },
  { minX: -0.5, maxX: 0.5, minY:  3, maxY: 21, minZ: -0.5, maxZ: 0.5 },
  // ── Ground concrete barriers (8) ──
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ: -16.4, maxZ: -15.6 },
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ: -10.4, maxZ:  -9.6 },
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ:   9.6, maxZ:  10.4 },
  { minX: -4,    maxX:  4,    minY: 0, maxY: 1.4, minZ:  15.6, maxZ:  16.4 },
  { minX: -16.4, maxX: -15.6, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
  { minX: -10.4, maxX:  -9.6, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
  { minX:   9.6, maxX:  10.4, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
  { minX:  15.6, maxX:  16.4, minY: 0, maxY: 1.4, minZ:  -4,   maxZ:   4   },
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
  constructor(io, roomCode) {
    this.io           = io;
    this._room        = roomCode || 'default';
    this.players      = new Map();
    this._spawnIndex  = 0;
    this._tickInterval = null;

    // ── Map selection ─────────────────────────────────────────────
    this.currentMap   = 'TERMINAL';   // 'TERMINAL' | 'OVERWATCH'
    this.mapAABBs     = ARENA_AABBS;
    this._bounds      = BOUNDS_TERMINAL;

    // ── Map voting ────────────────────────────────────────────────
    this._mapVotes    = new Map();   // socketId → 'TERMINAL'|'OVERWATCH'

    // ── Round system ─────────────────────────────────────────────
    this.gameState      = 'lobby';   // 'lobby' | 'playing' | 'results'
    this.hostId         = null;
    this._roundTimer    = null;
    this._currentMatchId  = null;
    this._roundStartTime  = 0;

    // ── Kill target / round wins (best-of series) ────────────────
    this.roundTarget      = 10;      // kills per round
    this.matchWinsTarget  = 3;       // rounds to win the match (host can change to 1/3/5)
    this._roundWins       = new Map(); // socketId → round wins count
    this._endScheduled    = false;   // prevent double _endRound calls

    // ── Kill-streak & announcements ───────────────────────────────
    this._firstBloodFired = false;
    this._killStreaks      = new Map();  // socketId → consecutive kill count

    // ── Countdown / auto-start ────────────────────────────────────
    this._countdownActive = false;
    this._autoStartTimer  = null;

    // (private lobby — no global matchmaker)
  }

  _applyMap(mapId) {
    if (mapId === 'OVERWATCH') {
      this.currentMap = 'OVERWATCH';
      this.mapAABBs   = OVERWATCH_AABBS;
      this._bounds    = BOUNDS_OVERWATCH;
    } else {
      this.currentMap = 'TERMINAL';
      this.mapAABBs   = ARENA_AABBS;
      this._bounds    = BOUNDS_TERMINAL;
    }
    this.io.to(this._room).emit('game:map', { mapId: this.currentMap });
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
    this._tickInterval = setInterval(() => {
      if (this.players.size === 0) return;
      this.io.to(this._room).emit('game:state', { players: this._getPlayersArray() });
    }, 33);
    console.log(`[${this._room}] Lobby started`);
  }

  addPlayer(socket, { username, class: playerClass, token } = {}) {
    socket.join(this._room);

    if (this.players.size >= MAX_PLAYERS) {
      socket.emit('game:full', { reason: 'Lobby is full (max 10 players).' });
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
      isShooting: false,
      isADS:      false,
      velocity:   { x: 0, y: 0, z: 0 },
      rankPoints: 0,
      damage:     0,
      headshots:  0,
      bestStreak: 0,
    };

    this.players.set(socket.id, player);

    if (userId) {
      try {
        const rankRow = db.getRank(userId);
        if (rankRow && player) player.rankPoints = rankRow.rank_points || 0;
      } catch (_) { /* guest or new account */ }
    }

    socket.emit('game:map',   { mapId: this.currentMap });
    socket.emit('lobby:code', { code: this._room });

    if (!this.hostId) this.hostId = socket.id;

    console.log(`[${this._room}] Player joined: ${resolvedUsername} (${playerClass})`);

    setTimeout(() => {
      if (this.players.has(socket.id)) this.players.get(socket.id).spawnProtection = false;
    }, 2500);

    socket.emit('game:state',                { players: this._getPlayersArray() });
    socket.to(this._room).emit('game:state', { players: this._getPlayersArray() });
    this._broadcastLobbyState();

    // ── Per-socket event handlers ─────────────────────────────────────

    socket.on('player:move', ({ x, y, z, rotY, vx, vy, vz, isADS }) => {
      const p = this.players.get(socket.id);
      if (!p || p.dead) return;
      const B = this._bounds;
      p.x        = clamp(x, -B, B);
      p.y        = y;
      p.z        = clamp(z, -B, B);
      p.rotY     = rotY;
      p.velocity = { x: vx || 0, y: vy || 0, z: vz || 0 };
      p.isADS    = !!isADS;
    });

    socket.on('game:map_request', ({ mapId }) => {
      if (this.gameState !== 'lobby') return;
      if (this.players.size <= 1) this._applyMap(mapId);
      socket.emit('game:map', { mapId: this.currentMap });
    });

    socket.on('game:vote_map', ({ mapId }) => {
      if (this.gameState !== 'lobby') return;
      if (mapId !== 'TERMINAL' && mapId !== 'OVERWATCH') return;
      this._mapVotes.set(socket.id, mapId);
      this._broadcastLobbyState();
    });

    socket.on('game:set_rounds', ({ target }) => {
      if (socket.id !== this.hostId) return;
      if (this.gameState !== 'lobby') return;
      const t = parseInt(target);
      if ([5, 10, 15, 20].includes(t)) {
        this.roundTarget = t;
        this._broadcastLobbyState();
      }
    });

    socket.on('game:set_match_wins', ({ target }) => {
      if (socket.id !== this.hostId) return;
      if (this.gameState !== 'lobby') return;
      const t = parseInt(target);
      if ([1, 3, 5].includes(t)) {
        this.matchWinsTarget = t;
        this._broadcastLobbyState();
      }
    });

      // ── Shoot handler ────────────────────────────────────────────
      socket.on('player:shoot', ({ origin, direction, weaponClass, targetId, distance, hitZone }) => {
        // No damage outside an active round
        if (this.gameState !== 'playing') return;

        const shooter = this.players.get(socket.id);
        if (!shooter || shooter.dead) return;

        // Mark isShooting for all shots (including misses) so remote clients animate
        shooter.isShooting = true;
        setTimeout(() => { if (this.players.has(socket.id)) this.players.get(socket.id).isShooting = false; }, 200);

        if (!targetId) return;

        const target = this.players.get(targetId);
        if (!target || target.dead || target.spawnProtection) return;

        if (distance > 300) return;

        // Loose position sanity-check: server position lags behind client by
        // one or more network ticks, so allow generous tolerance (25 units).
        const posDiff = Math.sqrt(
          (shooter.x - origin.x) ** 2 +
          (shooter.y - origin.y) ** 2 +
          (shooter.z - origin.z) ** 2
        );
        if (posDiff > 25) return;

        const isHead = hitZone === 'head';
        const targetCenter = {
          x: target.x,
          y: isHead ? (target.y + 1.55) : (target.y + 0.90),
          z: target.z,
        };

        // Loose aim-direction check: server target position is stale by up to
        // several ticks, so use a wide angle tolerance (dot > 0.5 ≈ within 60°).
        const toTarget = {
          x: targetCenter.x - origin.x,
          y: targetCenter.y - origin.y,
          z: targetCenter.z - origin.z,
        };
        const len = Math.sqrt(toTarget.x ** 2 + toTarget.y ** 2 + toTarget.z ** 2);
        if (len > 0.01) {
          const dot = (toTarget.x / len) * direction.x +
                      (toTarget.y / len) * direction.y +
                      (toTarget.z / len) * direction.z;
          if (dot < 0.5) return;
        }

        // AWP/WRAITH headshots deal 237, body shots 95; other classes use base damage
        const cls = CLASSES[weaponClass || shooter.class] || CLASSES.SOLDIER;
        let damage;
        if ((weaponClass || shooter.class) === 'WRAITH') {
          damage = isHead ? 237 : 95;
        } else {
          damage = cls.damage;
        }
        target.hp = Math.max(0, target.hp - damage);

        // Track damage dealt by shooter
        shooter.damage = (shooter.damage || 0) + damage;

        socket.emit('shot:confirmed', { targetId, damage, newHp: target.hp, isHeadshot: isHead });

        const targetSocket = this.io.sockets.sockets.get(targetId);
        if (targetSocket) {
          targetSocket.emit('player:damaged', {
            shooterId: socket.id, damage, newHp: target.hp, isHeadshot: isHead,
            hitPos: { x: target.x, y: target.y, z: target.z },
          });
        }

        if (target.hp <= 0) {
          target.dead = true;
          target.deaths++;
          shooter.kills++;

          // Track headshot kills
          if (isHead) shooter.headshots = (shooter.headshots || 0) + 1;

          // Broadcast updated kill counts for HUD
          this.io.to(this._room).emit('game:kills_update', {
            kills: Array.from(this.players.values()).map(p => ({
              id: p.id, username: p.username, kills: p.kills,
            })),
            roundTarget: this.roundTarget,
          });

          // ── Check if shooter reached the kill target ──────────────
          if (shooter.kills >= this.roundTarget && !this._endScheduled) {
            this._endScheduled = true;
            clearTimeout(this._roundTimer);

            const wins = (this._roundWins.get(socket.id) || 0) + 1;
            this._roundWins.set(socket.id, wins);

            // Broadcast updated round wins to all clients
            this.io.to(this._room).emit('game:roundwins_update', {
              roundWins: Array.from(this.players.keys()).map(id => ({
                id, wins: this._roundWins.get(id) || 0,
              })),
              matchWinsTarget: this.matchWinsTarget,
            });

            if (wins >= this.matchWinsTarget) {
              // Entire match is over
              this.io.to(this._room).emit('game:match_winner', {
                winnerId:   socket.id,
                winnerName: shooter.username,
                kills:      shooter.kills,
                target:     this.roundTarget,
              });
              setTimeout(() => this._endRound(), 4000);
            } else {
              // Round won — match continues
              this.io.to(this._room).emit('game:round_won', {
                winnerId:        socket.id,
                winnerName:      shooter.username,
                roundWins:       wins,
                matchWinsTarget: this.matchWinsTarget,
              });
              setTimeout(() => this._startNewRound(), 3500);
            }
          }

          const weaponName = (weaponClass || shooter.class) === 'WRAITH' ? 'AWP'
            : (weaponClass || shooter.class) === 'GHOST' ? 'SMG' : 'AK47';

          this.io.to(this._room).emit('player:killed', {
            killerId:    socket.id,   killerName:  shooter.username,
            victimId:    targetId,    victimName:  target.username,
            killerClass: shooter.class,
            killerRp:    shooter.rankPoints || 0,
            isHeadshot:  isHead,
            weaponName,
          });

          // ── Kill-streak & announcement logic ─────────────────
          const streak = (this._killStreaks.get(socket.id) || 0) + 1;
          this._killStreaks.set(socket.id, streak);
          // Track personal best streak
          shooter.bestStreak = Math.max(shooter.bestStreak || 0, streak);
          // Reset victim's streak
          this._killStreaks.set(targetId, 0);

          let announceType = null;
          if (!this._firstBloodFired) {
            this._firstBloodFired = true;
            announceType = 'first_blood';
          } else if (streak === 2) {
            announceType = 'double_kill';
          } else if (streak === 3) {
            announceType = 'triple_kill';
          } else if (streak >= 4) {
            announceType = 'killing_spree';
          }
          if (announceType) {
            this.io.to(this._room).emit('announcement', { type: announceType });
          }

          // Stats are committed in bulk at round end; no per-kill DB writes.

          setTimeout(() => {
            if (!this.players.has(targetId)) return;
            const sp = this._getFarthestSpawn();
            const hp = (CLASSES[target.class] || CLASSES.SOLDIER).hp;
            Object.assign(target, { x: sp.x, y: sp.y, z: sp.z, hp, dead: false, spawnProtection: true });
            this.io.to(this._room).emit('player:respawned', {
              id: targetId, x: sp.x, y: sp.y, z: sp.z, hp, class: target.class,
            });
            setTimeout(() => {
              if (this.players.has(targetId)) this.players.get(targetId).spawnProtection = false;
            }, 2500);
          }, 3000);
        }
      });

      // ── Live scoreboard (Tab key) ─────────────────────────────────
      socket.on('scoreboard:request', () => {
        const players = Array.from(this.players.values())
          .map(p => ({
            id:       p.id,
            username: p.username,
            class:    p.class,
            team:     p.team || 'A',
            kills:    p.kills    || 0,
            deaths:   p.deaths   || 0,
            damage:   p.damage   || 0,
            score:    (p.kills || 0) * 100,
            dead:     p.dead,
            hp:       p.hp,
          }))
          .sort((a, b) => b.score - a.score);

        const teamA = players.filter(p => p.team === 'A');
        const teamB = players.filter(p => p.team === 'B');
        const totalKills = players.reduce((s, p) => s + p.kills, 0);

        socket.emit('scoreboard:data', {
          players,
          totalKills,
          teamA: {
            kills:  teamA.reduce((s, p) => s + p.kills,  0),
            damage: teamA.reduce((s, p) => s + p.damage, 0),
          },
          teamB: {
            kills:  teamB.reduce((s, p) => s + p.kills,  0),
            damage: teamB.reduce((s, p) => s + p.damage, 0),
          },
        });
      });

    // ── Host starts the round ────────────────────────────────────────
    socket.on('game:start', () => {
      if (socket.id !== this.hostId) return;
      if (this.gameState !== 'lobby') return;
      if (this._countdownActive) return;
      this._startCountdown();
    });

    // ── Leave match voluntarily ───────────────────────────────────────
    socket.on('game:leave', () => {
      this._handlePlayerLeave(socket);
      socket.leave(this._room);
      socket.emit('lobby:left', {});
    });

    socket.on('disconnect', () => {
      this._handlePlayerLeave(socket);
    });
  }

  _handlePlayerLeave(socket) {
    const p = this.players.get(socket.id);
    if (!p) return;
    console.log(`[${this._room}] Player left: ${p.username}`);
    this.players.delete(socket.id);
    this._mapVotes.delete(socket.id);
    this.io.to(this._room).emit('player:left', { id: socket.id });

    if (this.hostId === socket.id) {
      const next = this.players.keys().next();
      this.hostId = next.done ? null : next.value;
      if (this.hostId) {
        this.io.to(this._room).emit('lobby:host_changed', { newHostId: this.hostId });
      }
    }

    if (this.players.size === 0) {
      this.gameState        = 'lobby';
      this._countdownActive = false;
      this._endScheduled    = false;
      if (this._roundTimer) { clearTimeout(this._roundTimer); this._roundTimer = null; }
    }

    this._broadcastLobbyState();
  }

  // ── Countdown before round start ─────────────────────────────────
  _startCountdown() {
    if (this._countdownActive) return;
    this._countdownActive = true;

    // Tally map votes and apply the winner before counting down
    const tally = { TERMINAL: 0, OVERWATCH: 0 };
    for (const v of this._mapVotes.values()) tally[v] = (tally[v] || 0) + 1;
    const chosenMap = tally.OVERWATCH > tally.TERMINAL ? 'OVERWATCH' : 'TERMINAL';
    this._applyMap(chosenMap);

    let count = 5;
    this.io.to(this._room).emit('game:countdown', { seconds: count });
    this._broadcastLobbyState();

    const tick = setInterval(() => {
      count--;
      this.io.to(this._room).emit('game:countdown', { seconds: count });
      if (count <= 0) {
        clearInterval(tick);
        this._countdownActive = false;
        this._startRound();
      }
    }, 1000);
  }

  // ── Round lifecycle ──────────────────────────────────────────────
  _startRound() {
    this.gameState       = 'playing';
    this._roundStartTime = Date.now();
    this._endScheduled   = false;

    // Reset announcement state and round wins for the new match
    this._firstBloodFired = false;
    this._killStreaks.clear();
    this._roundWins.clear();

    // Create match record and register authenticated players
    try {
      this._currentMatchId = db.createMatch(this.currentMap, 'DEATHMATCH');
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
      Object.assign(p, {
        x: sp.x, y: sp.y, z: sp.z, hp, dead: false,
        kills: 0, deaths: 0, damage: 0, headshots: 0, bestStreak: 0,
        spawnProtection: true,
      });
      const id = p.id;
      setTimeout(() => {
        if (this.players.has(id)) this.players.get(id).spawnProtection = false;
      }, 2500);
    }

    // Tell ALL clients about every player's respawn so remote models
    // update positions immediately (not waiting for the next game:state tick)
    for (const [id, p] of this.players) {
      this.io.to(this._room).emit('player:respawned', { id, x: p.x, y: p.y, z: p.z, hp: p.hp, class: p.class });
    }

    // Announce match start to all players
    this.io.to(this._room).emit('announcement', { type: 'match_start' });

    this._broadcastLobbyState();

    if (this._roundTimer) clearTimeout(this._roundTimer);
    this._roundTimer = setTimeout(() => this._endRound(), ROUND_DURATION);
  }

  // ── Start a new round within the same match (round wins preserved) ──
  _startNewRound() {
    this._endScheduled    = false;
    this._firstBloodFired = false;
    this._killStreaks.clear();

    for (const [, p] of this.players) {
      const sp = this._getFarthestSpawn();
      const hp = (CLASSES[p.class] || CLASSES.SOLDIER).hp;
      Object.assign(p, {
        x: sp.x, y: sp.y, z: sp.z, hp, dead: false,
        kills: 0, deaths: 0, damage: 0, headshots: 0, bestStreak: 0,
        spawnProtection: true,
      });
      const id = p.id;
      setTimeout(() => {
        if (this.players.has(id)) this.players.get(id).spawnProtection = false;
      }, 2500);
    }

    for (const [id, p] of this.players) {
      this.io.to(this._room).emit('player:respawned', { id, x: p.x, y: p.y, z: p.z, hp: p.hp, class: p.class });
    }

    this.io.to(this._room).emit('game:kills_update', {
      kills: Array.from(this.players.values()).map(p => ({
        id: p.id, username: p.username, kills: p.kills,
      })),
      roundTarget: this.roundTarget,
    });

    this.io.to(this._room).emit('announcement', { type: 'match_start' });

    if (this._roundTimer) clearTimeout(this._roundTimer);
    this._roundTimer = setTimeout(() => this._endRound(), ROUND_DURATION);
    this._broadcastLobbyState();
  }

  _endRound() {
    this.gameState = 'results';
    this.io.to(this._room).emit('announcement', { type: 'match_end' });

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

        // Save old tier for rank-up detection (before rank update)
        const oldRankMap = {};
        for (const p of authPlayers) {
          const r = db.getRank(p.userId);
          oldRankMap[p.userId] = r ? { tier: r.rank_tier, div: r.rank_division } : { tier: 'BRONZE', div: 4 };
        }

        const avgRP = authPlayers.length > 0
          ? authPlayers.reduce((s, p) => s + rpMap[p.userId], 0) / authPlayers.length
          : 0;

        const rpChanges = {};

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
          rpChanges[p.id] = rpChange;

          db.updateStatsAfterMatch(p.userId, {
            kills:       p.kills,
            deaths:      p.deaths,
            assists:     0,
            headshots:   p.headshots  || 0,
            shotsFired:  0,
            shotsHit:    0,
            damage:      p.damage     || 0,
            won,
            playtimeSeconds: duration,
          });
          db.updateRankPoints(p.userId, rpChange, won);
          db.updateMatchPlayer(matchId, p.userId, {
            kills:     p.kills,
            deaths:    p.deaths,
            assists:   0,
            headshots: p.headshots || 0,
            damage:    p.damage    || 0,
            score:     p.kills * 100,
            placement,
            rpChange,
          });

          // Push updated stats to the player's socket
          const sock = this.io.sockets.sockets.get(p.id);
          if (sock) {
            const newStats = db.getStats(p.userId);
            const newRank  = db.getRank(p.userId);
            sock.emit('player:stats_update', { stats: newStats, rank: newRank, rpChange });
          }
        }

        // ── Build match:ended payload and emit per-socket ─────────
        const TIER_COLORS = {
          BRONZE: '#cd7f32', SILVER: '#c0c0c0', GOLD: '#ffd700',
          PLATINUM: '#00f5ff', DIAMOND: '#b9f2ff', MASTER: '#ff2d78', GRANDMASTER: '#7b2fff',
        };

        const allPlayers = Array.from(this.players.values())
          .map(p => ({
            id:        p.id,
            username:  p.username,
            class:     p.class,
            kills:     p.kills     || 0,
            deaths:    p.deaths    || 0,
            headshots: p.headshots || 0,
            damage:    p.damage    || 0,
            score:     (p.kills || 0) * 100,
            rpChange:  rpChanges[p.id] || 0,
            won:       winner ? p.id === winner.id : false,
          }))
          .sort((a, b) => b.score - a.score);

        for (const p of this.players.values()) {
          const sock = this.io.sockets.sockets.get(p.id);
          if (!sock) continue;

          let rankChanged = false;
          let oldTier = null, oldDiv = null;
          let newTier = null, newDiv = null, newColor = null;

          if (p.userId) {
            const old = oldRankMap[p.userId] || {};
            const newR = db.getRank(p.userId);
            if (newR) {
              oldTier = old.tier;  oldDiv = old.div;
              newTier = newR.rank_tier; newDiv = newR.rank_division;
              rankChanged = oldTier !== newTier || oldDiv !== newDiv;
              newColor = TIER_COLORS[newTier] || null;
            }
          }

          const hsAcc = p.kills > 0
            ? Math.round((p.headshots || 0) / p.kills * 100) : 0;

          sock.emit('match:ended', {
            mapName:     this.currentMap,
            duration,
            mode:        'DEATHMATCH',
            players:     allPlayers,
            rankChanged,
            oldTier,     oldDiv,
            newTier,     newDiv,     newColor,
            myStats: {
              accuracy:    hsAcc,
              bestStreak:  p.bestStreak || 0,
              damage:      p.damage     || 0,
              kd:          parseFloat((p.kills / Math.max(p.deaths, 1)).toFixed(2)),
            },
          });
        }
      } catch (e) {
        console.error('[DB] _endRound commit failed:', e.message);
      }
      this._currentMatchId = null;
    }

    this._broadcastLobbyState();

    // Return to lobby after 12 s, resetting all match state
    setTimeout(() => {
      for (const p of this.players.values()) {
        p.kills = 0; p.deaths = 0;
        const sp = this._getFarthestSpawn();
        const hp = (CLASSES[p.class] || CLASSES.SOLDIER).hp;
        Object.assign(p, { x: sp.x, y: sp.y, z: sp.z, hp, dead: false });
      }
      this.gameState    = 'lobby';
      this._endScheduled = false;
      this._roundWins.clear();
      this._mapVotes.clear();
      this._broadcastLobbyState();
    }, 12000);
  }

  _broadcastLobbyState() {
    const voteCount   = { TERMINAL: 0, OVERWATCH: 0 };
    const playerVotes = {};
    for (const [id, v] of this._mapVotes.entries()) {
      voteCount[v] = (voteCount[v] || 0) + 1;
      playerVotes[id] = v;
    }

    const data = {
      gameState:       this.gameState,
      hostId:          this.hostId,
      playerCount:     this.players.size,
      maxPlayers:      MAX_PLAYERS,
      roundTarget:     this.roundTarget,
      matchWinsTarget: this.matchWinsTarget,
      currentMap:      this.currentMap,
      mapVotes:        voteCount,
      playerVotes,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, username: p.username, class: p.class,
        kills: p.kills, deaths: p.deaths, dead: p.dead, hp: p.hp,
        roundWins: this._roundWins.get(p.id) || 0,
      })),
    };
    this.io.to(this._room).emit('game:lobby_state', data);
  }

  isHost(username) {
    if (!this.hostId || !username) return false;
    const hostPlayer = this.players.get(this.hostId);
    return hostPlayer && hostPlayer.username === username;
  }

  _getPlayersArray() { return Array.from(this.players.values()); }
  stop()             { if (this._tickInterval) clearInterval(this._tickInterval); }
}

module.exports = { GameServer };
