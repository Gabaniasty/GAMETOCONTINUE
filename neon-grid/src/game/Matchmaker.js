class Matchmaker {
  constructor(io) {
    this.io            = io;
    this.queue         = [];              // { socketId, userId, username, rankPoints, queuedAt }
    this.activeMatches = new Map();       // matchId → Match object
    this.MATCH_SIZE    = 6;
    this.QUEUE_INTERVAL = 2000;
    setInterval(() => this.processQueue(), this.QUEUE_INTERVAL);
  }

  joinQueue(socket, playerData) {
    if (this.queue.find(p => p.socketId === socket.id)) return;
    if (this.isInMatch(socket.id)) return;
    this.queue.push({
      socketId:    socket.id,
      userId:      playerData.userId      || null,
      username:    playerData.username    || `Ghost_${socket.id.slice(0, 4)}`,
      rankPoints:  playerData.rankPoints  || 0,
      playerClass: playerData.playerClass || 'SOLDIER',
      queuedAt:    Date.now(),
    });
    socket.emit('queue:joined', { position: this.queue.length });
    this.broadcastQueueSize();
  }

  leaveQueue(socketId) {
    const before = this.queue.length;
    this.queue   = this.queue.filter(p => p.socketId !== socketId);
    if (this.queue.length !== before) this.broadcastQueueSize();
  }

  processQueue() {
    // Remove stale sockets
    this.queue = this.queue.filter(p => this.io.sockets.sockets.has(p.socketId));

    // Sort by rankPoints for fair skill matchmaking
    this.queue.sort((a, b) => a.rankPoints - b.rankPoints);

    while (
      this.queue.length >= this.MATCH_SIZE ||
      (this.queue.length >= 2 && this.queue[0] &&
        Date.now() - this.queue[0].queuedAt > 45000)
    ) {
      const size = Math.min(this.queue.length, this.MATCH_SIZE);
      if (size < 2) break;
      const group = this.queue.splice(0, size);
      this.createMatch(group);
    }
  }

  createMatch(players) {
    const matchId = 'match_' + Date.now();
    const maps    = ['TERMINAL', 'OVERWATCH'];
    const map     = maps[Math.floor(Math.random() * maps.length)];

    const match = {
      id:        matchId,
      map,
      players:   players.map((p, i) => ({ ...p, team: i % 2 === 0 ? 'A' : 'B' })),
      state:     'LOBBY',   // LOBBY → COUNTDOWN → ACTIVE → ENDED
      scores:    { A: 0, B: 0 },
      killLimit: 30,
      startTime: null,
      dbMatchId: null,
    };

    this.activeMatches.set(matchId, match);

    // Add all players to the match Socket.io room
    for (const p of match.players) {
      const sock = this.io.sockets.sockets.get(p.socketId);
      if (sock) sock.join(matchId);
    }

    // Send lobby state to everyone in the match room
    this.io.to(matchId).emit('match:lobby', {
      matchId,
      map,
      players: match.players.map(p => ({
        username:    p.username,
        rankPoints:  p.rankPoints,
        playerClass: p.playerClass,
        team:        p.team,
      })),
    });

    // 10-second countdown then start
    let countdown = 10;
    const timer = setInterval(() => {
      countdown--;
      this.io.to(matchId).emit('match:countdown', { seconds: countdown });
      if (countdown <= 0) {
        clearInterval(timer);
        this.startMatch(matchId);
      }
    }, 1000);
  }

  startMatch(matchId) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;
    match.state     = 'ACTIVE';
    match.startTime = Date.now();
    this.io.to(matchId).emit('match:start', {
      matchId,
      map:     match.map,
      players: match.players,
    });
  }

  endMatch(matchId, winnerId) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;
    match.state = 'ENDED';
    this.io.to(matchId).emit('match:ended', {
      matchId,
      winnerId,
      scores:  match.scores,
      players: match.players,
    });
    setTimeout(() => this.activeMatches.delete(matchId), 15000);
  }

  isInMatch(socketId) {
    for (const match of this.activeMatches.values()) {
      if (match.players.find(p => p.socketId === socketId)) return true;
    }
    return false;
  }

  getMatchForSocket(socketId) {
    for (const [, match] of this.activeMatches.entries()) {
      if (match.players.find(p => p.socketId === socketId)) return match;
    }
    return null;
  }

  broadcastQueueSize() {
    this.io.emit('queue:size', { count: this.queue.length });
  }
}

module.exports = { Matchmaker };
