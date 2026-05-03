const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const { GameServer }                         = require('./src/game/GameServer');
const { router: AuthRouter, verifyToken, apiRouter } = require('./src/auth/AuthRouter');
const db                                     = require('./src/db/Database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.use('/auth', AuthRouter);
app.use('/api', apiRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', players: io.engine.clientsCount });
});

app.get('/status', (req, res) => {
  res.json({ status: 'ok', players: io.engine.clientsCount });
});

const gameServer = new GameServer(io);
gameServer.start();

// POST /api/match/end — force-end the current round (host-only)
app.post('/api/match/end', verifyToken, (req, res) => {
  if (!gameServer.isHost(req.user.username)) {
    return res.status(403).json({ error: 'Only the current room host may end the round' });
  }
  gameServer._endRound();
  res.json({ ok: true, message: 'Round ended' });
});

server.listen(PORT, () => {
  console.log(`NEON GRID server running on port ${PORT}`);
});
