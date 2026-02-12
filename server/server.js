const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const TicTacToe = require('./games/tic-tac-toe');
const ConnectFour = require('./games/connect-four');
const Battleship = require('./games/battleship');
const Checkers = require('./games/checkers');
const War = require('./games/war');
const Farkle = require('./games/farkle');
const Blackjack = require('./games/blackjack');
const Mancala = require('./games/mancala');
const Yahtzee = require('./games/yahtzee');
const Poker = require('./games/poker');
const GoFish = require('./games/go-fish');
const { validateUsername } = require('./utils/validate-username');

// Max players per game type
const MAX_PLAYERS = {
  'tic-tac-toe': 2,
  'connect-four': 2,
  'battleship': 2,
  'checkers': 2,
  'war': 2,
  'farkle': 4,
  'blackjack': 4,
  'mancala': 2,
  'yahtzee': 4,
  'poker': 6,
  'go-fish': 4
};

const ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'https://piznac.com',
  'https://www.piznac.com'
];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  }
});

// Store active rooms
const rooms = new Map();

// Store online users: socketId -> { id, name, status, currentRoom }
const users = new Map();

// Store pending challenges: challengeId -> { id, from, to, gameType, timestamp }
const challenges = new Map();

function generateChallengeId() {
  return `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function broadcastUserList(socket) {
  const userList = Array.from(users.values());
  socket.emit('user-list', userList);
}

function broadcastToAll(event, data) {
  for (const [socketId] of users) {
    const s = io.sockets.sockets.get(socketId);
    if (s) s.emit(event, data);
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // User announces presence with their name
  socket.on('user-connect', ({ name }) => {
    const trimmedName = (name || '').trim();

    // Validate username
    const validation = validateUsername(trimmedName);
    if (!validation.valid) {
      socket.emit('name-error', { message: validation.reason });
      return;
    }

    // Check if name is already taken by another online user (case-insensitive)
    const nameLower = trimmedName.toLowerCase();
    for (const [id, existingUser] of users) {
      if (id !== socket.id && existingUser.name.toLowerCase() === nameLower) {
        socket.emit('name-error', { message: 'This name is already in use' });
        return;
      }
    }

    const user = {
      id: socket.id,
      name: trimmedName,
      status: 'available',
      currentRoom: null,
      gameType: null
    };
    users.set(socket.id, user);

    // Confirm successful connection
    socket.emit('name-accepted', { name: trimmedName });

    // Send full user list to the connecting user
    broadcastUserList(socket);

    // Notify all other users about the new user
    socket.broadcast.emit('user-joined', user);

    console.log(`User connected: ${trimmedName} (${socket.id})`);
  });

  // Create a new game room
  socket.on('create-room', ({ gameType, playerName }) => {
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms.has(roomCode));

    // Use stored user name if available, fallback to provided name
    const user = users.get(socket.id);
    const name = user?.name || playerName || 'Player 1';

    const maxPlayers = MAX_PLAYERS[gameType] || 2;
    const room = {
      code: roomCode,
      gameType,
      players: [{ id: socket.id, name }],
      game: null,
      maxPlayers
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('room-created', { roomCode, maxPlayers });
    console.log(`Room ${roomCode} created for ${gameType} by ${name} (max ${maxPlayers} players)`);
  });

  // Join an existing room
  socket.on('join-room', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('join-error', { message: 'Room not found' });
      return;
    }

    const maxPlayers = room.maxPlayers || 2;
    if (room.players.length >= maxPlayers) {
      socket.emit('join-error', { message: 'Room is full' });
      return;
    }

    // Use stored user name if available, fallback to provided name
    const user = users.get(socket.id);
    const name = user?.name || playerName || `Player ${room.players.length + 1}`;

    room.players.push({ id: socket.id, name });
    socket.join(roomCode);
    socket.roomCode = roomCode;

    // Update all players' status to in-game
    room.players.forEach(player => {
      const u = users.get(player.id);
      if (u) {
        u.status = 'in-game';
        u.currentRoom = roomCode;
        u.gameType = room.gameType;
        broadcastToAll('user-status', { id: player.id, status: 'in-game', gameType: room.gameType });
      }
    });

    // For farkle/blackjack/yahtzee/poker/go-fish, don't auto-start — host must click Start Game when 2+ players joined
    if (room.gameType === 'farkle' || room.gameType === 'blackjack' || room.gameType === 'yahtzee' || room.gameType === 'poker' || room.gameType === 'go-fish') {
      // Notify all players in the room about the new player
      io.to(roomCode).emit('player-joined', { players: room.players, maxPlayers });
      console.log(`${name} joined ${room.gameType} room ${roomCode} (${room.players.length}/${maxPlayers})`);
      return;
    }

    // Auto-start for 2-player games
    if (room.gameType === 'tic-tac-toe') {
      room.game = new TicTacToe(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'connect-four') {
      room.game = new ConnectFour(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'battleship') {
      room.game = new Battleship(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'checkers') {
      room.game = new Checkers(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'war') {
      room.game = new War(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'mancala') {
      room.game = new Mancala(room.players[0].id, room.players[1].id);
    }

    // Emit directly to both players (with player-specific state for Battleship)
    room.players.forEach(player => {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        const gameState = room.game ? room.game.getState(player.id) : null;
        playerSocket.emit('game-start', { players: room.players, gameState });
        console.log(`game-start sent to ${player.name} (${player.id})`);
      } else {
        console.log(`WARNING: socket not found for ${player.name} (${player.id})`);
      }
    });

    console.log(`${name} joined room ${roomCode}`);
  });

  // Host starts a farkle/blackjack game (when 2+ players have joined)
  socket.on('start-game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.gameType !== 'farkle' && room.gameType !== 'blackjack' && room.gameType !== 'yahtzee' && room.gameType !== 'poker' && room.gameType !== 'go-fish') return;
    if (room.players[0].id !== socket.id) {
      socket.emit('invalid-move', { message: 'Only the host can start the game' });
      return;
    }
    if (room.players.length < 2) {
      socket.emit('invalid-move', { message: 'Need at least 2 players' });
      return;
    }

    const playerIds = room.players.map(p => p.id);
    if (room.gameType === 'farkle') {
      room.game = new Farkle(playerIds);
    } else if (room.gameType === 'blackjack') {
      room.game = new Blackjack(playerIds);
    } else if (room.gameType === 'yahtzee') {
      room.game = new Yahtzee(playerIds);
    } else if (room.gameType === 'poker') {
      room.game = new Poker(playerIds);
    } else if (room.gameType === 'go-fish') {
      room.game = new GoFish(playerIds);
    }

    room.players.forEach(player => {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.emit('game-start', {
          players: room.players,
          gameState: room.game.getState(player.id)
        });
      }
    });

    console.log(`${room.gameType} game started in room ${roomCode} with ${room.players.length} players`);
  });

  // Client requests current game state (after navigation)
  socket.on('request-state', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('state-response', { error: 'Room not found' });
      return;
    }

    // For Battleship, pass player ID to get filtered state
    const gameState = room.game ? room.game.getState(socket.id) : null;
    socket.emit('state-response', {
      players: room.players,
      gameState
    });
    console.log(`State requested for room ${roomCode} by ${socket.id}`);
  });

  // Handle a game move
  socket.on('make-move', ({ roomCode, move }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.game) return;

    let result;

    // Handle Farkle moves (roll/keep/bank)
    if (room.gameType === 'farkle') {
      result = room.game.makeMove(socket.id, move);
    }
    // Handle Blackjack moves (bet/hit/stand/double/next-round)
    else if (room.gameType === 'blackjack') {
      result = room.game.makeMove(socket.id, move);
    }
    // Handle Yahtzee moves (roll/hold/score)
    else if (room.gameType === 'yahtzee') {
      result = room.game.makeMove(socket.id, move);
    }
    // Handle Poker moves (check/call/raise/fold/allin/discard/stand-pat/next-hand)
    else if (room.gameType === 'poker') {
      result = room.game.makeMove(socket.id, move);
    }
    // Handle Go Fish moves (ask)
    else if (room.gameType === 'go-fish') {
      result = room.game.makeMove(socket.id, move);
    }
    // Handle War flip action
    else if (room.gameType === 'war' && move.type === 'flip') {
      result = room.game.flip(socket.id);
    }
    // Handle Battleship-specific move types
    else if (room.gameType === 'battleship' && move.type) {
      switch (move.type) {
        case 'place-ship':
          result = room.game.placeShip(socket.id, {
            shipType: move.shipType,
            row: move.row,
            col: move.col,
            horizontal: move.horizontal
          });
          break;
        case 'auto-place':
          result = room.game.autoPlaceShips(socket.id);
          break;
        case 'confirm-setup':
          result = room.game.confirmSetup(socket.id);
          break;
        default:
          result = room.game.makeMove(socket.id, move);
      }
    } else {
      result = room.game.makeMove(socket.id, move);
    }

    if (result.valid) {
      // Build result payload (include game-specific fields)
      const resultPayload = {
        hit: result.hit, sunk: result.sunk, sunkShipType: result.sunkShipType,
        // War
        war: result.war, warInitiated: result.warInitiated, roundWinner: result.roundWinner,
        // Farkle
        farkle: result.farkle, hotDice: result.hotDice,
        rollingIndices: result.rollingIndices, score: result.score,
        banked: result.banked, lostScore: result.lostScore,
        // Blackjack
        card: result.card, busted: result.busted, doubled: result.doubled,
        allBet: result.allBet, dealt: result.dealt, newRound: result.newRound,
        // Poker
        action: result.action, handOver: result.handOver, newHand: result.newHand,
        count: result.count, newCards: result.newCards, variant: result.variant, wilds: result.wilds,
        // Mancala
        extraTurn: result.extraTurn, lastPit: result.lastPit,
        // Yahtzee
        dice: result.dice, rollingIndices: result.rollingIndices,
        rollsLeft: result.rollsLeft, held: result.held,
        category: result.category, score: result.score,
        totalScore: result.totalScore,
        // Go Fish
        gotCards: result.gotCards, drewMatch: result.drewMatch,
        cardsGiven: result.cardsGiven, anotherTurn: result.anotherTurn,
        newBook: result.newBook
      };

      // Send player-specific state to each player
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('move-made', {
            playerId: socket.id,
            move,
            result: resultPayload,
            gameState: room.game.getState(player.id)
          });
        }
      });

      if (result.gameOver) {
        io.to(roomCode).emit('game-over', {
          winner: result.winner,
          winningLine: result.winningLine,
          isDraw: result.isDraw
        });
      }
    } else {
      socket.emit('invalid-move', { message: result.message });
    }
  });

  // Handle rematch request
  socket.on('request-rematch', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (!room.rematchRequests) room.rematchRequests = new Set();
    room.rematchRequests.add(socket.id);

    // Notify the other player
    socket.to(roomCode).emit('rematch-requested', { playerId: socket.id });

    // If all players want rematch, restart
    if (room.rematchRequests.size === room.players.length) {
      room.rematchRequests.clear();

      if (room.gameType === 'tic-tac-toe') {
        room.game = new TicTacToe(room.players[0].id, room.players[1].id);
      } else if (room.gameType === 'connect-four') {
        room.game = new ConnectFour(room.players[0].id, room.players[1].id);
      } else if (room.gameType === 'battleship') {
        room.game = new Battleship(room.players[0].id, room.players[1].id);
      } else if (room.gameType === 'checkers') {
        room.game = new Checkers(room.players[0].id, room.players[1].id);
      } else if (room.gameType === 'war') {
        room.game = new War(room.players[0].id, room.players[1].id);
      } else if (room.gameType === 'mancala') {
        room.game = new Mancala(room.players[0].id, room.players[1].id);
      } else if (room.gameType === 'farkle') {
        room.game = new Farkle(room.players.map(p => p.id));
      } else if (room.gameType === 'blackjack') {
        room.game = new Blackjack(room.players.map(p => p.id));
      } else if (room.gameType === 'yahtzee') {
        room.game = new Yahtzee(room.players.map(p => p.id));
      } else if (room.gameType === 'poker') {
        room.game = new Poker(room.players.map(p => p.id));
      } else if (room.gameType === 'go-fish') {
        room.game = new GoFish(room.players.map(p => p.id));
      }

      // Send player-specific state to each player
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('game-start', {
            players: room.players,
            gameState: room.game.getState(player.id)
          });
        }
      });
    }
  });

  // Send a challenge to another player
  socket.on('send-challenge', ({ toId, gameType }) => {
    const fromUser = users.get(socket.id);
    const toUser = users.get(toId);

    if (!fromUser || !toUser) {
      socket.emit('challenge-error', { message: 'User not found' });
      return;
    }

    const challengeId = generateChallengeId();
    const challenge = {
      id: challengeId,
      from: { id: socket.id, name: fromUser.name },
      to: { id: toId, name: toUser.name },
      gameType,
      timestamp: Date.now()
    };

    challenges.set(challengeId, challenge);

    // Notify the target player
    const toSocket = io.sockets.sockets.get(toId);
    if (toSocket) {
      toSocket.emit('challenge-received', challenge);
    }

    // Confirm to sender
    socket.emit('challenge-sent', challenge);

    console.log(`Challenge sent: ${fromUser.name} -> ${toUser.name} for ${gameType}`);
  });

  // Accept a challenge
  socket.on('accept-challenge', ({ challengeId }) => {
    const challenge = challenges.get(challengeId);

    if (!challenge) {
      socket.emit('challenge-error', { message: 'Challenge not found or expired' });
      return;
    }

    // Verify the acceptor is the target
    if (challenge.to.id !== socket.id) {
      socket.emit('challenge-error', { message: 'Not authorized to accept this challenge' });
      return;
    }

    // Create a room for the game
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms.has(roomCode));

    const room = {
      code: roomCode,
      gameType: challenge.gameType,
      players: [
        { id: challenge.from.id, name: challenge.from.name },
        { id: challenge.to.id, name: challenge.to.name }
      ],
      game: null
    };

    // Start the game
    if (room.gameType === 'tic-tac-toe') {
      room.game = new TicTacToe(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'connect-four') {
      room.game = new ConnectFour(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'battleship') {
      room.game = new Battleship(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'checkers') {
      room.game = new Checkers(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'war') {
      room.game = new War(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'mancala') {
      room.game = new Mancala(room.players[0].id, room.players[1].id);
    } else if (room.gameType === 'farkle') {
      room.game = new Farkle(room.players.map(p => p.id));
    } else if (room.gameType === 'blackjack') {
      room.game = new Blackjack(room.players.map(p => p.id));
    } else if (room.gameType === 'yahtzee') {
      room.game = new Yahtzee(room.players.map(p => p.id));
    } else if (room.gameType === 'poker') {
      room.game = new Poker(room.players.map(p => p.id));
    } else if (room.gameType === 'go-fish') {
      room.game = new GoFish(room.players.map(p => p.id));
    }

    rooms.set(roomCode, room);

    // Join both players to the room
    const fromSocket = io.sockets.sockets.get(challenge.from.id);
    const toSocket = io.sockets.sockets.get(challenge.to.id);

    if (fromSocket) {
      fromSocket.join(roomCode);
      fromSocket.roomCode = roomCode;
    }
    if (toSocket) {
      toSocket.join(roomCode);
      toSocket.roomCode = roomCode;
    }

    // Update both players' status to in-game
    room.players.forEach(player => {
      const u = users.get(player.id);
      if (u) {
        u.status = 'in-game';
        u.currentRoom = roomCode;
        u.gameType = room.gameType;
        broadcastToAll('user-status', { id: player.id, status: 'in-game', gameType: room.gameType });
      }
    });

    // Notify both players that the challenge was accepted (with player-specific state)
    if (fromSocket) {
      fromSocket.emit('challenge-accepted', {
        challengeId,
        roomCode,
        gameType: challenge.gameType,
        players: room.players,
        gameState: room.game ? room.game.getState(challenge.from.id) : null
      });
    }
    if (toSocket) {
      toSocket.emit('challenge-accepted', {
        challengeId,
        roomCode,
        gameType: challenge.gameType,
        players: room.players,
        gameState: room.game ? room.game.getState(challenge.to.id) : null
      });
    }

    // Clean up the challenge
    challenges.delete(challengeId);

    console.log(`Challenge accepted: ${challenge.from.name} vs ${challenge.to.name} in room ${roomCode}`);
  });

  // Decline a challenge
  socket.on('decline-challenge', ({ challengeId }) => {
    const challenge = challenges.get(challengeId);

    if (!challenge) return;

    // Verify the decliner is the target
    if (challenge.to.id !== socket.id) return;

    // Notify the challenger
    const fromSocket = io.sockets.sockets.get(challenge.from.id);
    if (fromSocket) {
      fromSocket.emit('challenge-declined', { challengeId, declinedBy: challenge.to.name });
    }

    // Clean up the challenge
    challenges.delete(challengeId);

    console.log(`Challenge declined by ${challenge.to.name}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Remove from users list and broadcast
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      broadcastToAll('user-left', { id: socket.id });
      console.log(`User left: ${user.name}`);
    }

    // Clean up any pending challenges involving this user
    for (const [challengeId, challenge] of challenges) {
      if (challenge.from.id === socket.id || challenge.to.id === socket.id) {
        challenges.delete(challengeId);
      }
    }

    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (room) {
        // For farkle/blackjack/yahtzee/poker/go-fish with 3+ players remaining, remove player and continue
        if ((room.gameType === 'farkle' || room.gameType === 'blackjack' || room.gameType === 'yahtzee' || room.gameType === 'poker' || room.gameType === 'go-fish') && room.players.length > 2) {
          room.players = room.players.filter(p => p.id !== socket.id);
          if (room.game && room.game.removePlayer) {
            room.game.removePlayer(socket.id);
          }
          // Notify remaining players
          io.to(socket.roomCode).emit('player-left', {
            leftPlayerId: socket.id,
            players: room.players,
            gameState: room.game ? room.game.getState() : null
          });
        } else {
          // Standard 2-player disconnect: end the room
          room.players.forEach(player => {
            if (player.id !== socket.id) {
              const u = users.get(player.id);
              if (u) {
                u.status = 'available';
                u.currentRoom = null;
                u.gameType = null;
                broadcastToAll('user-status', { id: player.id, status: 'available', gameType: null });
              }
            }
          });
          socket.to(socket.roomCode).emit('opponent-disconnected');
          rooms.delete(socket.roomCode);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Piznac Games server running on port ${PORT}`);
});
