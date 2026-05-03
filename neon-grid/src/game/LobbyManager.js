const { GameServer } = require('./GameServer');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(existing) {
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (existing.has(code));
  return code;
}

class LobbyManager {
  constructor(io) {
    this.io       = io;
    this._lobbies = new Map(); // code → GameServer
  }

  createLobby() {
    const code   = generateCode(this._lobbies);
    const server = new GameServer(this.io, code);
    server.start();
    this._lobbies.set(code, server);
    console.log(`[LobbyManager] Created lobby: ${code}`);
    return code;
  }

  hasLobby(code) {
    return this._lobbies.has(code.toUpperCase());
  }

  getLobby(code) {
    return this._lobbies.get(code.toUpperCase()) || null;
  }

  addPlayerToLobby(code, socket, data) {
    const server = this._lobbies.get(code.toUpperCase());
    if (!server) return false;
    server.addPlayer(socket, data);

    // Auto-cleanup: destroy lobby 30s after it empties
    socket.on('disconnect', () => {
      setTimeout(() => {
        if (server.players.size === 0) {
          server.stop();
          this._lobbies.delete(code.toUpperCase());
          console.log(`[LobbyManager] Destroyed empty lobby: ${code}`);
        }
      }, 30000);
    });

    return true;
  }

  destroyLobby(code) {
    const server = this._lobbies.get(code.toUpperCase());
    if (server) {
      server.stop();
      this._lobbies.delete(code.toUpperCase());
      console.log(`[LobbyManager] Destroyed lobby: ${code}`);
    }
  }

  stats() {
    return {
      lobbies: this._lobbies.size,
      players: Array.from(this._lobbies.values()).reduce((n, s) => n + s.players.size, 0),
    };
  }
}

module.exports = { LobbyManager };
