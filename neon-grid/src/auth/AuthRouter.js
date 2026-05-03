const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db/Database');

const router   = express.Router();
const SECRET   = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'neon_grid_secret_dev_only';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// ── Middleware ─────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function makeToken(userId, username) {
  return jwt.sign({ userId, username }, SECRET, { expiresIn: '7d' });
}

// ── POST /api/auth/register ────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 alphanumeric/underscore chars' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash   = await bcrypt.hash(password, 10);
    const userId = db.createUser(username, hash);
    const token  = makeToken(userId, username);

    res.json({ token, username, userId });
  } catch (err) {
    console.error('[register error]', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)  return res.status(401).json({ error: 'Invalid credentials' });

    const token = makeToken(user.id, user.username);
    res.json({ token, username: user.username, userId: user.id });
  } catch (err) {
    console.error('[login error]', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────
router.get('/me', verifyToken, (req, res) => {
  const user  = db.getUserById(req.user.userId);
  if (!user)  return res.status(404).json({ error: 'User not found' });
  const stats = db.getStats(req.user.userId);
  const rank  = db.getRank(req.user.userId);
  res.json({ username: user.username, userId: user.id, stats, rank });
});

// ── GET /api/auth/leaderboard ──────────────────────────────────
router.get('/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  res.json(db.getLeaderboard(limit));
});

// ── GET /api/auth/match-history ────────────────────────────────
router.get('/match-history', verifyToken, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  res.json(db.getMatchHistory(req.user.userId, limit));
});

module.exports = { router, verifyToken, SECRET };

// ── Separate read-only public API router ───────────────────────
const apiRouter = require('express').Router();

// GET /api/leaderboard?limit=100
apiRouter.get('/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 100);
  const rows  = db.getLeaderboardFull(limit);

  // If authenticated, check if caller is outside top 100
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  let callerUsername = null;
  let callerRow      = null;
  if (token) {
    try {
      const jwt     = require('jsonwebtoken');
      const payload = jwt.verify(token, SECRET);
      callerUsername = payload.username;
    } catch (_) {}
  }

  if (callerUsername && !rows.find(r => r.username === callerUsername)) {
    callerRow = db.getProfileByUsername(callerUsername);
  }

  res.json({ rows, callerRow: callerRow ? callerRow : null });
});

// GET /api/profile/:username
apiRouter.get('/profile/:username', (req, res) => {
  const profile = db.getProfileByUsername(req.params.username);
  if (!profile) return res.status(404).json({ error: 'Operative not found' });
  res.json(profile);
});

// GET /api/stats/me  (requires auth)
apiRouter.get('/stats/me', (req, res, next) => verifyToken(req, res, next), (req, res) => {
  const user = db.getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const stats   = db.getStats(req.user.userId);
  const rank    = db.getRank(req.user.userId);
  const history = db.getMatchHistory(req.user.userId, 10);
  res.json({ username: user.username, stats, rank, history });
});

module.exports.apiRouter = apiRouter;
