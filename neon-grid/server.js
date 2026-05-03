const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const { LobbyManager }                               = require('./src/game/LobbyManager');
const { router: AuthRouter, verifyToken, apiRouter } = require('./src/auth/AuthRouter');

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

// ── Lobby manager ────────────────────────────────────────────────────
const lobbyManager = new LobbyManager(io);

// ── Socket: route each connection to the correct lobby ───────────────
io.on('connection', (socket) => {
  socket.on('lobby:enter', ({ code, username, class: playerClass, token }) => {
    if (!code) {
      socket.emit('lobby:error', { message: 'No lobby code. Create or join a match from the main menu.' });
      return;
    }
    const ok = lobbyManager.addPlayerToLobby(code.toUpperCase().trim(), socket, {
      username,
      class: playerClass,
      token,
    });
    if (!ok) {
      socket.emit('lobby:error', { message: `Lobby "${code.toUpperCase()}" not found. It may have expired.` });
    }
  });
});

// ── REST: create a private lobby ─────────────────────────────────────
app.post('/api/lobby/create', (req, res) => {
  const code = lobbyManager.createLobby();
  res.json({ code });
});

// ── REST: verify a lobby code before the client navigates ────────────
app.get('/api/lobby/:code/check', (req, res) => {
  const exists = lobbyManager.hasLobby(req.params.code);
  res.json({ exists });
});

app.get('/health', (req, res) => res.json({ status: 'ok', ...lobbyManager.stats() }));
app.get('/status', (req, res) => res.json({ status: 'ok', ...lobbyManager.stats() }));

server.listen(PORT, () => {
  console.log(`NEON GRID server running on port ${PORT}`);
});
