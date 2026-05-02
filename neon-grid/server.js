const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { GameServer } = require('./src/game/GameServer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', players: io.engine.clientsCount });
});

const gameServer = new GameServer(io);
gameServer.start();

server.listen(PORT, () => {
  console.log(`NEON GRID server running on port ${PORT}`);
});
