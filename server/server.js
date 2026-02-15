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
const { getAIBettingDecision, getAIDrawDecision, getAIVariantChoice, getAIWildChoice, getAIDelay } = require('./games/poker-ai');
const { validateUsername } = require('./utils/validate-username');

const AI_NAMES = ['JohnnyBoy', 'JayJay', 'JimBob', 'Sal', 'SallyJoe', 'June'];

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
  'poker-holdem': 6,
  'go-fish': 4
};

const ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'https://piznac.com',
  'https://www.piznac.com',
  'https://games.piznac.com',
  'https://fortunate-mercy-production-574d.up.railway.app'
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

/** Find a room by player socket ID (fallback when roomCode lookup fails). */
function findRoomByPlayer(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.some(p => p.id === socketId)) {
      return { code, room };
    }
  }
  return null;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Emit move-made to all human players in a room (skip AI bot IDs).
 */
function emitToHumans(room, event, dataFn) {
  room.players.forEach(player => {
    if (room.game && room.game.isAI && room.game.isAI(player.id)) return;
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.emit(event, typeof dataFn === 'function' ? dataFn(player.id) : dataFn);
    }
  });
}

/**
 * Schedule AI moves if the current player is an AI bot.
 * Chains automatically for consecutive AI turns.
 */
function scheduleAIMoveIfNeeded(room, roomCode) {
  if (!room || !room.game || !room.game.isAI) return;
  const game = room.game;
  if (game.gameOver) return;

  const phase = game.phase;

  // Variant select — AI dealer picks a variant
  if (phase === 'variant-select' && game.isAI(game.dealerPlayerId)) {
    setTimeout(() => {
      if (!rooms.has(roomCode)) return;
      const variant = getAIVariantChoice();
      const result = game.makeMove(game.dealerPlayerId, { type: 'choose-variant', variant });
      if (result.valid) {
        emitMoveMadeToHumans(room, game.dealerPlayerId, { type: 'choose-variant', variant }, result);
        scheduleAIMoveIfNeeded(room, roomCode);
      }
    }, getAIDelay());
    return;
  }

  // Wild select — AI dealer picks wilds
  if (phase === 'wild-select' && game.isAI(game.dealerPlayerId)) {
    setTimeout(() => {
      if (!rooms.has(roomCode)) return;
      const choice = getAIWildChoice(game.currentVariant);
      const result = game.makeMove(game.dealerPlayerId, { type: 'choose-wilds', wilds: choice.wilds, lastCardDown: choice.lastCardDown });
      if (result.valid) {
        emitMoveMadeToHumans(room, game.dealerPlayerId, { type: 'choose-wilds', wilds: choice.wilds, lastCardDown: choice.lastCardDown }, result);
        scheduleAIMoveIfNeeded(room, roomCode);
      }
    }, getAIDelay());
    return;
  }

  // Ante — AI auto-buy-in (any AI triggers it)
  if (phase === 'ante') {
    const aiPlayer = game.activePlayers.find(id => game.isAI(id));
    if (aiPlayer) {
      setTimeout(() => {
        if (!rooms.has(roomCode)) return;
        if (game.phase !== 'ante') return;
        const result = game.makeMove(aiPlayer, { type: 'buy-in' });
        if (result.valid) {
          emitMoveMadeToHumans(room, aiPlayer, { type: 'buy-in' }, result);
          scheduleAIMoveIfNeeded(room, roomCode);
        }
      }, 500);
    }
    return;
  }

  // Betting phases
  if (game.isBettingPhase()) {
    const inHand = game.playersInHand;
    const currentId = inHand.length > 0 ? inHand[game.currentPlayerIndex % inHand.length] : null;
    if (currentId && game.isAI(currentId)) {
      setTimeout(() => {
        if (!rooms.has(roomCode)) return;
        if (!game.isBettingPhase()) return;
        const player = game.players[currentId];
        if (!player || player.folded || player.allIn) return;

        const context = {
          hand: player.hand,
          chips: player.chips,
          currentBet: game.currentBet,
          myBet: player.bet,
          pot: game.potManager.getTotalPot(),
          minRaise: game.minRaise,
          playersInHand: inHand.length,
          phase: game.phase,
          wilds: game.activeWilds,
          communityCards: game.communityCards,
          isHoldem: game.isHoldem
        };

        const decision = getAIBettingDecision('medium', context);
        let move;
        if (decision.action === 'raise') {
          move = { type: 'raise', amount: decision.raiseAmount };
        } else {
          move = { type: decision.action };
        }

        const result = game.makeMove(currentId, move);
        if (result.valid) {
          emitMoveMadeToHumans(room, currentId, move, result);
          scheduleAIMoveIfNeeded(room, roomCode);
        }
      }, getAIDelay());
    }
    return;
  }

  // Draw phase
  if (phase === 'draw') {
    const inHand = game.playersInHand;
    const currentId = inHand.length > 0 ? inHand[game.currentPlayerIndex % inHand.length] : null;
    if (currentId && game.isAI(currentId)) {
      setTimeout(() => {
        if (!rooms.has(roomCode)) return;
        if (game.phase !== 'draw') return;
        const player = game.players[currentId];
        if (!player || player.allIn || player.hasActed) return;

        const discards = getAIDrawDecision('medium', player.hand, game.activeWilds);
        let move;
        if (discards.length === 0) {
          move = { type: 'stand-pat' };
        } else {
          move = { type: 'discard', cardIndices: discards };
        }

        const result = game.makeMove(currentId, move);
        if (result.valid) {
          emitMoveMadeToHumans(room, currentId, move, result);
          scheduleAIMoveIfNeeded(room, roomCode);
        }
      }, getAIDelay());
    }
    return;
  }

  // Settlement — let humans click "Next Hand" at their own pace
  if (phase === 'settlement') {
    return;
  }
}

/**
 * Emit move-made with player-specific game state to all human players.
 */
function emitMoveMadeToHumans(room, playerId, move, result) {
  const resultPayload = {
    action: result.action, handOver: result.handOver, newHand: result.newHand,
    count: result.count, newCards: result.newCards, variant: result.variant, wilds: result.wilds,
    amount: result.amount
  };

  room.players.forEach(player => {
    if (room.game && room.game.isAI && room.game.isAI(player.id)) return;
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.emit('move-made', {
        playerId,
        move,
        result: resultPayload,
        gameState: room.game.getState(player.id)
      });
    }
  });
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
    if (room.gameType === 'farkle' || room.gameType === 'blackjack' || room.gameType === 'yahtzee' || room.gameType === 'poker' || room.gameType === 'poker-holdem' || room.gameType === 'go-fish') {
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
  socket.on('start-game', ({ roomCode, aiCount }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.gameType !== 'farkle' && room.gameType !== 'blackjack' && room.gameType !== 'yahtzee' && room.gameType !== 'poker' && room.gameType !== 'poker-holdem' && room.gameType !== 'go-fish') return;
    if (room.players[0].id !== socket.id) {
      socket.emit('invalid-move', { message: 'Only the host can start the game' });
      return;
    }

    // Add AI bots for poker games
    const isPoker = room.gameType === 'poker' || room.gameType === 'poker-holdem';
    const botIds = [];
    if (isPoker && aiCount > 0) {
      const maxPlayers = MAX_PLAYERS[room.gameType] || 6;
      const botsToAdd = Math.min(aiCount, maxPlayers - room.players.length);
      const shuffledNames = [...AI_NAMES].sort(() => Math.random() - 0.5);
      for (let i = 0; i < botsToAdd; i++) {
        const botId = `ai-bot-${i}`;
        const botName = shuffledNames[i % shuffledNames.length];
        room.players.push({ id: botId, name: botName });
        botIds.push(botId);
      }
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
      room.game = new Poker(playerIds, { aiBots: botIds });
    } else if (room.gameType === 'poker-holdem') {
      room.game = new Poker(playerIds, { lockedVariant: 'texas-holdem', aiBots: botIds });
    } else if (room.gameType === 'go-fish') {
      room.game = new GoFish(playerIds);
    }

    room.players.forEach(player => {
      if (room.game && room.game.isAI && room.game.isAI(player.id)) return;
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.emit('game-start', {
          players: room.players,
          gameState: room.game.getState(player.id)
        });
      }
    });

    console.log(`${room.gameType} game started in room ${roomCode} with ${room.players.length} players (${botIds.length} AI): ${room.players.map(p => p.name + '(' + p.id + ')').join(', ')}`);

    // Schedule AI move if first player is AI
    if (isPoker && botIds.length > 0) {
      scheduleAIMoveIfNeeded(room, roomCode);
    }
  });

  // Client requests current game state (after navigation)
  socket.on('request-state', ({ roomCode }) => {
    let room = rooms.get(roomCode);
    if (!room) {
      // Fallback: find room by player ID
      const found = findRoomByPlayer(socket.id);
      if (found) {
        room = found.room;
        console.log(`request-state: room ${roomCode} not found, but found player in room ${found.code}`);
      } else {
        socket.emit('state-response', { error: 'Room not found' });
        return;
      }
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
    let room = rooms.get(roomCode);
    if (!room || !room.game) {
      // Fallback: find room by player ID
      const found = findRoomByPlayer(socket.id);
      if (found && found.room.game) {
        room = found.room;
        roomCode = found.code;
        console.log(`make-move: room ${roomCode} not found by code, found player in room ${found.code}`);
      } else {
        console.log(`[MAKE-MOVE] No room/game for ${roomCode}, socket=${socket.id}`);
        return;
      }
    }

    let result;

    // Handle Farkle moves (roll/keep/bank)
    if (room.gameType === 'farkle') {
      console.log(`[FARKLE MOVE] player=${socket.id}, move=${JSON.stringify(move)}, currentPlayer=${room.game.currentPlayerId}, hasRolled=${room.game.hasRolled}`);
      result = room.game.makeMove(socket.id, move);
      console.log(`[FARKLE RESULT] valid=${result.valid}, message=${result.message || 'ok'}`);
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
    else if (room.gameType === 'poker' || room.gameType === 'poker-holdem') {
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

      // Send player-specific state to each player (skip AI bots)
      room.players.forEach(player => {
        if (room.game && room.game.isAI && room.game.isAI(player.id)) return;
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

      // After a human move in poker, check if next player is AI
      if ((room.gameType === 'poker' || room.gameType === 'poker-holdem') && room.game.aiBots && room.game.aiBots.size > 0) {
        scheduleAIMoveIfNeeded(room, roomCode);
      }
    } else {
      socket.emit('invalid-move', { message: result.message });
    }
  });

  // Handle rematch request
  socket.on('request-rematch', ({ roomCode }) => {
    let room = rooms.get(roomCode);
    if (!room) {
      const found = findRoomByPlayer(socket.id);
      if (found) { room = found.room; roomCode = found.code; }
      else return;
    }

    if (!room.rematchRequests) room.rematchRequests = new Set();
    room.rematchRequests.add(socket.id);

    // Notify the other player
    socket.to(roomCode).emit('rematch-requested', { playerId: socket.id });

    // For poker with AI, count only human players for rematch threshold
    const isPoker = room.gameType === 'poker' || room.gameType === 'poker-holdem';
    const botIds = isPoker && room.game && room.game.aiBots ? [...room.game.aiBots] : [];
    const humanCount = room.players.filter(p => !botIds.includes(p.id)).length;
    const rematchThreshold = isPoker && botIds.length > 0 ? humanCount : room.players.length;

    // If all (human) players want rematch, restart
    if (room.rematchRequests.size >= rematchThreshold) {
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
        room.game = new Poker(room.players.map(p => p.id), { aiBots: botIds });
      } else if (room.gameType === 'poker-holdem') {
        room.game = new Poker(room.players.map(p => p.id), { lockedVariant: 'texas-holdem', aiBots: botIds });
      } else if (room.gameType === 'go-fish') {
        room.game = new GoFish(room.players.map(p => p.id));
      }

      // Send player-specific state to each player (skip AI bots)
      room.players.forEach(player => {
        if (room.game && room.game.isAI && room.game.isAI(player.id)) return;
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('game-start', {
            players: room.players,
            gameState: room.game.getState(player.id)
          });
        }
      });

      // Schedule AI move for new poker game
      if (isPoker && botIds.length > 0) {
        scheduleAIMoveIfNeeded(room, roomCode);
      }
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

    // For poker, send both players to the lobby instead of auto-starting
    const isPokerChallenge = room.gameType === 'poker' || room.gameType === 'poker-holdem';
    if (isPokerChallenge) {
      const maxPlayers = MAX_PLAYERS[room.gameType] || 6;
      room.maxPlayers = maxPlayers;
      rooms.set(roomCode, room);

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

      room.players.forEach(player => {
        const u = users.get(player.id);
        if (u) {
          u.status = 'in-game';
          u.currentRoom = roomCode;
          u.gameType = room.gameType;
          broadcastToAll('user-status', { id: player.id, status: 'in-game', gameType: room.gameType });
        }
      });

      // Send both to lobby (challenger is host)
      if (fromSocket) {
        fromSocket.emit('challenge-accepted', {
          challengeId, roomCode, gameType: challenge.gameType,
          players: room.players, gameState: null, lobbyMode: true, maxPlayers
        });
      }
      if (toSocket) {
        toSocket.emit('challenge-accepted', {
          challengeId, roomCode, gameType: challenge.gameType,
          players: room.players, gameState: null, lobbyMode: true, maxPlayers
        });
      }

      challenges.delete(challengeId);
      console.log(`Poker challenge accepted: ${challenge.from.name} vs ${challenge.to.name} → lobby ${roomCode}`);
      return;
    }

    // Start the game (non-poker)
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
        const isPoker = room.gameType === 'poker' || room.gameType === 'poker-holdem';
        const hasBots = isPoker && room.game && room.game.aiBots && room.game.aiBots.size > 0;

        // For farkle/blackjack/yahtzee/poker/go-fish with 3+ players remaining, remove player and continue
        if ((room.gameType === 'farkle' || room.gameType === 'blackjack' || room.gameType === 'yahtzee' || room.gameType === 'poker' || room.gameType === 'poker-holdem' || room.gameType === 'go-fish') && room.players.length > 2) {
          room.players = room.players.filter(p => p.id !== socket.id);
          if (room.game && room.game.removePlayer) {
            room.game.removePlayer(socket.id);
          }

          // Check if all humans have left (only AI bots remain)
          const humanPlayers = room.players.filter(p => !(hasBots && room.game.isAI(p.id)));
          if (humanPlayers.length === 0) {
            rooms.delete(socket.roomCode);
            console.log(`Room ${socket.roomCode} cleaned up — all humans left`);
          } else {
            // Notify remaining human players
            room.players.forEach(player => {
              if (hasBots && room.game.isAI(player.id)) return;
              const playerSocket = io.sockets.sockets.get(player.id);
              if (playerSocket) {
                playerSocket.emit('player-left', {
                  leftPlayerId: socket.id,
                  players: room.players,
                  gameState: room.game ? room.game.getState(player.id) : null
                });
              }
            });

            // If it was the disconnected player's turn, AI might need to act next
            if (hasBots) {
              scheduleAIMoveIfNeeded(room, socket.roomCode);
            }
          }
        } else {
          // Standard 2-player disconnect or last human leaving: end the room
          room.players.forEach(player => {
            if (player.id !== socket.id && !(hasBots && room.game && room.game.isAI(player.id))) {
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
