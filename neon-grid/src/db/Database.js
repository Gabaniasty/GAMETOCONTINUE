const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR  = path.join(__dirname, '../../db');
const DB_PATH = path.join(DB_DIR, 'neon_grid.sqlite');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stats (
    user_id  INTEGER PRIMARY KEY,
    kills    INTEGER DEFAULT 0,
    deaths   INTEGER DEFAULT 0,
    xp       INTEGER DEFAULT 0,
    level    INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const stmts = {
  createUser:         db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  getUserByUsername:  db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById:        db.prepare('SELECT * FROM users WHERE id = ?'),
  createStats:        db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)'),
  getStats:           db.prepare('SELECT * FROM stats WHERE user_id = ?'),
  updateStats:        db.prepare(`
    UPDATE stats
    SET kills  = kills  + ?,
        deaths = deaths + ?,
        xp     = xp     + ?,
        level  = MAX(1, CAST(SQRT((xp + ?) / 100.0) AS INTEGER))
    WHERE user_id = ?
  `),
};

function createUser(username, passwordHash) {
  const info = stmts.createUser.run(username, passwordHash);
  stmts.createStats.run(info.lastInsertRowid);
  return info.lastInsertRowid;
}

function getUserByUsername(username) {
  return stmts.getUserByUsername.get(username);
}

function getUserById(id) {
  return stmts.getUserById.get(id);
}

function getStats(userId) {
  return stmts.getStats.get(userId);
}

function updateStats(userId, killsDelta, deathsDelta, xpDelta) {
  stmts.updateStats.run(killsDelta, deathsDelta, xpDelta, xpDelta, userId);
}

module.exports = { createUser, getUserByUsername, getUserById, getStats, updateStats };
