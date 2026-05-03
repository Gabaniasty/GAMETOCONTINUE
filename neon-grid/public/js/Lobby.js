/**
 * Lobby.js — client-side matchmaking socket wrapper.
 *
 * Usage:
 *   const lobby = new Lobby(socket);
 *   lobby.onQueueJoined  = ({ position }) => { ... };
 *   lobby.onQueueSize    = ({ count })    => { ... };
 *   lobby.onMatchLobby   = ({ matchId, map, players }) => { ... };
 *   lobby.onCountdown    = ({ seconds })  => { ... };
 *   lobby.onMatchStart   = ({ matchId, map, players }) => { ... };
 *
 *   lobby.joinQueue({ userId, username, rankPoints, playerClass });
 *   lobby.leaveQueue();
 */
export class Lobby {
  constructor(socket) {
    this._socket    = socket;
    this._matchData = null;

    this.onQueueJoined = null;
    this.onQueueSize   = null;
    this.onMatchLobby  = null;
    this.onCountdown   = null;
    this.onMatchStart  = null;

    this._bind();
  }

  _bind() {
    this._socket.on('queue:joined', (data) => {
      if (this.onQueueJoined) this.onQueueJoined(data);
    });

    this._socket.on('queue:size', (data) => {
      if (this.onQueueSize) this.onQueueSize(data);
    });

    this._socket.on('match:lobby', (data) => {
      this._matchData = data;
      if (this.onMatchLobby) this.onMatchLobby(data);
    });

    this._socket.on('match:countdown', (data) => {
      if (this.onCountdown) this.onCountdown(data);
    });

    this._socket.on('match:start', (data) => {
      // Merge in any lobby data the caller may not have received yet
      const full = { ...this._matchData, ...data };
      if (this.onMatchStart) this.onMatchStart(full);
    });
  }

  /** Put the local player into the matchmaking queue. */
  joinQueue({ userId, username, rankPoints, playerClass }) {
    this._socket.emit('queue:join', {
      userId:      userId      ?? null,
      username:    username    ?? 'Guest',
      rankPoints:  rankPoints  ?? 0,
      playerClass: playerClass ?? 'SOLDIER',
    });
  }

  /** Remove the local player from the queue. */
  leaveQueue() {
    this._socket.emit('queue:leave');
    this._matchData = null;
  }
}
