const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db/Database');

const router   = express.Router();
const SECRET   = process.env.JWT_SECRET || 'neon_grid_secret_change_in_prod';
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
  const { username, password } = req.body;

  if (!USERNAME_RE.test(username)) {
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
});

// ── POST /api/auth/login ───────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok)  return res.status(401).json({ error: 'Invalid credentials' });

  const token = makeToken(user.id, user.username);
  res.json({ token, username: user.username, userId: user.id });
});

// ── GET /api/auth/me ───────────────────────────────────────────
router.get('/me', verifyToken, (req, res) => {
  const user  = db.getUserById(req.user.userId);
  if (!user)  return res.status(404).json({ error: 'User not found' });
  const stats = db.getStats(req.user.userId);
  res.json({ username: user.username, stats });
});

module.exports = { router, verifyToken, SECRET };
