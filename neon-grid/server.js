const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const { GameServer }                         = require('./src/game/GameServer');
const { router: AuthRouter, verifyToken }    = require('./src/auth/AuthRouter');
const db                                     = require('./src/db/Database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', AuthRouter);

// ── Public leaderboard ────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  try { res.json(db.getLeaderboard()); }
  catch (e) { res.status(500).json({ error: 'DB error' }); }
});

// ── Authenticated player stats + rank ─────────────────────────────
app.get('/api/stats/me', verifyToken, (req, res) => {
  const stats = db.getStats(req.user.userId);
  const rank  = db.getUserRank(req.user.userId);
  if (!stats) return res.status(404).json({ error: 'Stats not found' });
  res.json({ stats, rank });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', players: io.engine.clientsCount });
});

const gameServer = new GameServer(io);
gameServer.start();

server.listen(PORT, () => {
  console.log(`NEON GRID server running on port ${PORT}`);
});
