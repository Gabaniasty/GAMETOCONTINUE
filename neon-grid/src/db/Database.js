const BetterSQLite = require('better-sqlite3');
const path         = require('path');
const fs           = require('fs');
const { getRankFromRP } = require('../game/RankSystem');

const DB_DIR  = path.join(__dirname, '../../db');
const DB_PATH = path.join(DB_DIR, 'neon_grid.sqlite');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new BetterSQLite(DB_PATH);

db.pragma('journal_mode = WAL');

// ── Schema migration: drop old tables, create new ones ───────────────
db.pragma('foreign_keys = OFF');
db.exec(`
  DROP TABLE IF EXISTS match_players;
  DROP TABLE IF EXISTS matches;
  DROP TABLE IF EXISTS player_rank;
  DROP TABLE IF EXISTS player_stats;
  DROP TABLE IF EXISTS stats;
  DROP TABLE IF EXISTS users;
`);
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    user_id         INTEGER PRIMARY KEY,
    kills           INTEGER DEFAULT 0,
    deaths          INTEGER DEFAULT 0,
    assists         INTEGER DEFAULT 0,
    headshots       INTEGER DEFAULT 0,
    shots_fired     INTEGER DEFAULT 0,
    shots_hit       INTEGER DEFAULT 0,
    damage_dealt    INTEGER DEFAULT 0,
    matches_played  INTEGER DEFAULT 0,
    matches_won     INTEGER DEFAULT 0,
    playtime_seconds INTEGER DEFAULT 0,
    xp              INTEGER DEFAULT 0,
    level           INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS player_rank (
    user_id       INTEGER PRIMARY KEY,
    rank_tier     TEXT    DEFAULT 'BRONZE',
    rank_division INTEGER DEFAULT 3,
    rank_points   INTEGER DEFAULT 0,
    peak_tier     TEXT    DEFAULT 'BRONZE',
    peak_points   INTEGER DEFAULT 0,
    win_streak    INTEGER DEFAULT 0,
    loss_streak   INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    map_name        TEXT    NOT NULL,
    game_mode       TEXT    DEFAULT 'DEATHMATCH',
    started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at        DATETIME,
    duration_seconds INTEGER,
    winner_user_id  INTEGER
  );

  CREATE TABLE IF NOT EXISTS match_players (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id     INTEGER,
    user_id      INTEGER,
    kills        INTEGER DEFAULT 0,
    deaths       INTEGER DEFAULT 0,
    assists      INTEGER DEFAULT 0,
    headshots    INTEGER DEFAULT 0,
    damage_dealt INTEGER DEFAULT 0,
    score        INTEGER DEFAULT 0,
    placement    INTEGER DEFAULT 1,
    rp_change    INTEGER DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES matches(id),
    FOREIGN KEY (user_id)  REFERENCES users(id)
  );
`);

// ── Prepared statements ──────────────────────────────────────────────
const stmts = {
  // Users
  createUser:        db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById:       db.prepare('SELECT * FROM users WHERE id = ?'),
  touchLastSeen:     db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?'),

  // Stats init
  initStats:         db.prepare('INSERT OR IGNORE INTO player_stats (user_id) VALUES (?)'),
  initRank:          db.prepare('INSERT OR IGNORE INTO player_rank  (user_id) VALUES (?)'),

  // Stats read
  getStats: db.prepare('SELECT * FROM player_stats WHERE user_id = ?'),
  getRank:  db.prepare('SELECT * FROM player_rank  WHERE user_id = ?'),

  // Stats update after match
  updateStats: db.prepare(`
    UPDATE player_stats
    SET kills            = kills            + @kills,
        deaths           = deaths           + @deaths,
        assists          = assists          + @assists,
        headshots        = headshots        + @headshots,
        shots_fired      = shots_fired      + @shotsFired,
        shots_hit        = shots_hit        + @shotsHit,
        damage_dealt     = damage_dealt     + @damage,
        matches_played   = matches_played   + 1,
        matches_won      = matches_won      + @won,
        playtime_seconds = playtime_seconds + @playtimeSeconds,
        xp               = xp               + @xpGained,
        level            = MAX(1, CAST(SQRT((xp + @xpGained) / 150.0) AS INTEGER))
    WHERE user_id = @userId
  `),

  // Rank update
  updateRank: db.prepare(`
    UPDATE player_rank
    SET rank_points   = @newRP,
        rank_tier     = @newTier,
        rank_division = @newDiv,
        peak_points   = MAX(peak_points, @newRP),
        peak_tier     = CASE WHEN @newRP > peak_points THEN @newTier ELSE peak_tier END,
        win_streak    = CASE WHEN @won = 1 THEN win_streak + 1 ELSE 0 END,
        loss_streak   = CASE WHEN @won = 0 THEN loss_streak + 1 ELSE 0 END
    WHERE user_id = @userId
  `),

  // Leaderboard (basic)
  leaderboard: db.prepare(`
    SELECT u.id, u.username,
           r.rank_tier, r.rank_division, r.rank_points,
           s.kills, s.deaths, s.assists,
           s.matches_played, s.matches_won,
           s.xp, s.level,
           ROUND(CAST(s.kills AS REAL) / MAX(s.deaths, 1), 2) AS kd_ratio
    FROM player_rank r
    JOIN player_stats s ON r.user_id = s.user_id
    JOIN users        u ON r.user_id = u.id
    ORDER BY r.rank_points DESC
    LIMIT ?
  `),

  // Leaderboard (full — includes HS rate and win rate)
  leaderboardFull: db.prepare(`
    SELECT u.id, u.username,
           r.rank_tier, r.rank_division, r.rank_points,
           s.kills, s.deaths, s.headshots, s.damage_dealt,
           s.matches_played, s.matches_won,
           s.xp, s.level,
           ROUND(CAST(s.kills AS REAL) / MAX(s.deaths, 1), 2) AS kd_ratio,
           CASE WHEN s.matches_played > 0
                THEN ROUND(CAST(s.matches_won AS REAL) / s.matches_played * 100.0, 1)
                ELSE 0.0 END AS win_rate,
           CASE WHEN s.kills > 0
                THEN ROUND(CAST(s.headshots AS REAL) / s.kills * 100.0, 1)
                ELSE 0.0 END AS hs_rate
    FROM player_rank r
    JOIN player_stats s ON r.user_id = s.user_id
    JOIN users        u ON r.user_id = u.id
    ORDER BY r.rank_points DESC
    LIMIT ?
  `),

  // Rank history for a user (last N rp_change entries from match_players)
  rankHistory: db.prepare(`
    SELECT mp.rp_change, m.started_at, m.map_name, m.game_mode,
           mp.kills, mp.deaths, mp.placement
    FROM match_players mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.user_id = ?
    ORDER BY m.started_at DESC
    LIMIT 10
  `),

  // Matches
  createMatch: db.prepare(
    'INSERT INTO matches (map_name, game_mode) VALUES (?, ?)'
  ),
  finalizeMatch: db.prepare(
    'UPDATE matches SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ?, winner_user_id = ? WHERE id = ?'
  ),
  addMatchPlayer: db.prepare(
    'INSERT OR IGNORE INTO match_players (match_id, user_id) VALUES (?, ?)'
  ),
  updateMatchPlayer: db.prepare(`
    UPDATE match_players
    SET kills        = @kills,
        deaths       = @deaths,
        assists      = @assists,
        headshots    = @headshots,
        damage_dealt = @damage,
        score        = @score,
        placement    = @placement,
        rp_change    = @rpChange
    WHERE match_id = @matchId AND user_id = @userId
  `),
  matchHistory: db.prepare(`
    SELECT m.id, m.map_name, m.game_mode, m.started_at, m.ended_at, m.duration_seconds,
           mp.kills, mp.deaths, mp.assists, mp.score, mp.placement, mp.rp_change
    FROM match_players mp
    JOIN matches m ON mp.match_id = m.id
    WHERE mp.user_id = ?
    ORDER BY m.started_at DESC
    LIMIT ?
  `),
};

// ── Helper: initialise stat rows for a new user ──────────────────────
function _initUser(userId) {
  stmts.initStats.run(userId);
  stmts.initRank.run(userId);
}

// ── Public API ───────────────────────────────────────────────────────

function createUser(username, passwordHash, email = null) {
  const info = stmts.createUser.run(username, email, passwordHash);
  const id   = info.lastInsertRowid;
  _initUser(id);
  return id;
}

function getUserByUsername(username) {
  return stmts.getUserByUsername.get(username);
}

function getUserById(id) {
  stmts.touchLastSeen.run(id);
  return stmts.getUserById.get(id);
}

function getStats(userId) {
  return stmts.getStats.get(userId);
}

function getRank(userId) {
  return stmts.getRank.get(userId);
}

/**
 * Update all stats for a player at the end of a match.
 * @param {number} userId
 * @param {{ kills, deaths, assists, headshots, shotsFired, shotsHit,
 *           damage, won, playtimeSeconds }} stats
 */
function updateStatsAfterMatch(userId, {
  kills = 0, deaths = 0, assists = 0, headshots = 0,
  shotsFired = 0, shotsHit = 0, damage = 0,
  won = false, playtimeSeconds = 0,
} = {}) {
  _initUser(userId);
  const xpGained = kills * 50 + (won ? 200 : 0) + assists * 25;
  stmts.updateStats.run({
    kills, deaths, assists, headshots,
    shotsFired, shotsHit, damage,
    won: won ? 1 : 0,
    playtimeSeconds,
    xpGained,
    userId,
  });
}

/**
 * Apply an RP delta to a player, recalculate tier/division.
 * @param {number} userId
 * @param {number} rpChange  - Can be negative
 * @param {boolean} won
 */
function updateRankPoints(userId, rpChange, won) {
  _initUser(userId);
  const current = stmts.getRank.get(userId);
  if (!current) return;
  const newRP   = Math.max(0, current.rank_points + rpChange);
  const newRank = getRankFromRP(newRP);
  stmts.updateRank.run({
    newRP,
    newTier: newRank.tier,
    newDiv:  newRank.division,
    won:     won ? 1 : 0,
    userId,
  });
}

/**
 * Top players by rank points (basic).
 * @param {number} limit
 */
function getLeaderboard(limit = 50) {
  return stmts.leaderboard.all(limit);
}

/**
 * Top players by rank points — full data including HS rate and win rate.
 * @param {number} limit
 */
function getLeaderboardFull(limit = 100) {
  return stmts.leaderboardFull.all(Math.min(limit, 100));
}

/**
 * Full profile for a user by username.
 * @param {string} username
 */
function getProfileByUsername(username) {
  const user = stmts.getUserByUsername.get(username);
  if (!user) return null;
  const stats        = stmts.getStats.get(user.id) || null;
  const rank         = stmts.getRank.get(user.id) || null;
  const recentMatches = stmts.matchHistory.all(user.id, 10);
  const rankHistory  = stmts.rankHistory.all(user.id);
  return {
    user: {
      id: user.id,
      username: user.username,
      created_at: user.created_at,
      last_seen:  user.last_seen,
    },
    stats,
    rank,
    recentMatches,
    rankHistory,
  };
}

function createMatch(mapName, gameMode = 'DEATHMATCH') {
  return stmts.createMatch.run(mapName, gameMode).lastInsertRowid;
}

function addMatchPlayer(matchId, userId) {
  stmts.addMatchPlayer.run(matchId, userId);
}

function finalizeMatch(matchId, winnerId, durationSeconds) {
  stmts.finalizeMatch.run(durationSeconds, winnerId, matchId);
}

/**
 * @param {number} matchId
 * @param {number} userId
 * @param {{ kills, deaths, assists, headshots, damage, score, placement, rpChange }} stats
 */
function updateMatchPlayer(matchId, userId, {
  kills = 0, deaths = 0, assists = 0, headshots = 0,
  damage = 0, score = 0, placement = 1, rpChange = 0,
} = {}) {
  stmts.updateMatchPlayer.run({
    matchId, userId,
    kills, deaths, assists, headshots, damage, score, placement, rpChange,
  });
}

/**
 * Recent match history for a user.
 * @param {number} userId
 * @param {number} limit
 */
function getMatchHistory(userId, limit = 10) {
  return stmts.matchHistory.all(userId, limit);
}

module.exports = {
  createUser,
  getUserByUsername,
  getUserById,
  getStats,
  getRank,
  updateStatsAfterMatch,
  updateRankPoints,
  getLeaderboard,
  getLeaderboardFull,
  getProfileByUsername,
  createMatch,
  addMatchPlayer,
  finalizeMatch,
  updateMatchPlayer,
  getMatchHistory,
};
