// Backgammon Server Game Class
// Board: 24 points, positive = White, negative = Black
// White moves high→low (24→1), Black moves low→high (1→24)

class Backgammon {
  constructor(player1Id, player2Id) {
    this.players = { W: player1Id, B: player2Id };
    this.playerColors = { [player1Id]: 'W', [player2Id]: 'B' };
    this.board = this.createStartingBoard();
    this.bar = { W: 0, B: 0 };
    this.borneOff = { W: 0, B: 0 };
    this.dice = null;
    this.remainingDice = [];
    this.currentPlayer = 'W';
    this.phase = 'rolling'; // rolling | moving | gameOver
    this.gameOver = false;
    this.winner = null;
    this.winType = null;
    this.lastMove = null;
    this.movesThisTurn = [];
  }

  createStartingBoard() {
    const board = new Array(24).fill(0);
    board[23] = 2;  board[12] = 5;  board[7] = 3;  board[5] = 5;   // White
    board[0] = -2;  board[11] = -5; board[16] = -3; board[18] = -5; // Black
    return board;
  }

  rollDice() {
    return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
  }

  getDiceValues(dice) {
    if (dice[0] === dice[1]) return [dice[0], dice[0], dice[0], dice[0]];
    return [dice[0], dice[1]];
  }

  checkerCount(point, color) {
    const val = this.board[point];
    if (color === 'W') return val > 0 ? val : 0;
    return val < 0 ? -val : 0;
  }

  isPointOpen(point, color) {
    const val = this.board[point];
    if (color === 'W') return val >= -1;
    return val <= 1;
  }

  isInHomeBoard(point, color) {
    if (color === 'W') return point >= 0 && point <= 5;
    return point >= 18 && point <= 23;
  }

  allInHomeBoard(color, board, bar) {
    board = board || this.board;
    bar = bar || this.bar;
    if (bar[color] > 0) return false;
    for (let i = 0; i < 24; i++) {
      const count = color === 'W' ? (board[i] > 0 ? board[i] : 0) : (board[i] < 0 ? -board[i] : 0);
      if (count > 0 && !this.isInHomeBoard(i, color)) return false;
    }
    return true;
  }

  farthestChecker(color, board) {
    board = board || this.board;
    if (color === 'W') {
      for (let i = 5; i >= 0; i--) { if (board[i] > 0) return i; }
    } else {
      for (let i = 18; i <= 23; i++) { if (board[i] < 0) return i; }
    }
    return -1;
  }

  barEntryPoint(color, die) {
    return color === 'W' ? 24 - die : die - 1;
  }

  bearOffTarget(point, die, color) {
    return color === 'W' ? point - die : point + die;
  }

  getMovesForDie(color, die, board, bar, borneOff) {
    board = board || this.board;
    bar = bar || this.bar;
    borneOff = borneOff || this.borneOff;
    const moves = [];

    if (bar[color] > 0) {
      const entry = this.barEntryPoint(color, die);
      const val = board[entry];
      const open = color === 'W' ? val >= -1 : val <= 1;
      if (open) {
        moves.push({ from: 'bar', to: entry, die });
      }
      return moves;
    }

    const canBearOff = this.allInHomeBoard(color, board, bar);
    const sign = color === 'W' ? 1 : -1;

    for (let i = 0; i < 24; i++) {
      const count = color === 'W' ? (board[i] > 0 ? board[i] : 0) : (board[i] < 0 ? -board[i] : 0);
      if (count === 0) continue;

      const target = this.bearOffTarget(i, die, color);

      if (target >= 0 && target <= 23) {
        const tVal = board[target];
        const tOpen = color === 'W' ? tVal >= -1 : tVal <= 1;
        if (tOpen) {
          moves.push({ from: i, to: target, die });
        }
      } else if (canBearOff && this.isInHomeBoard(i, color)) {
        if (color === 'W' && target < 0) {
          if (target === -1 || i === this.farthestChecker(color, board)) {
            moves.push({ from: i, to: 'off', die });
          }
        } else if (color === 'B' && target > 23) {
          if (target === 24 || i === this.farthestChecker(color, board)) {
            moves.push({ from: i, to: 'off', die });
          }
        }
      }
    }
    return moves;
  }

  applyMoveToState(board, bar, borneOff, color, move) {
    const b = [...board];
    const br = { ...bar };
    const bo = { ...borneOff };
    let hit = false;
    const opp = color === 'W' ? 'B' : 'W';
    const sign = color === 'W' ? 1 : -1;
    const oppSign = color === 'W' ? -1 : 1;

    if (move.from === 'bar') {
      br[color]--;
    } else {
      b[move.from] -= sign;
    }

    if (move.to === 'off') {
      bo[color]++;
    } else {
      const oppCount = opp === 'W' ? (b[move.to] > 0 ? b[move.to] : 0) : (b[move.to] < 0 ? -b[move.to] : 0);
      if (oppCount === 1) {
        hit = true;
        b[move.to] = 0;
        br[opp]++;
      }
      b[move.to] += sign;
    }

    return { board: b, bar: br, borneOff: bo, hit };
  }

  // Find all valid complete turns
  findAllTurns(board, bar, borneOff, color, remainingDice) {
    const results = [];
    let maxDiceUsed = 0;

    const search = (b, br, bo, dice, movesSoFar) => {
      if (dice.length === 0) {
        if (movesSoFar.length > maxDiceUsed) maxDiceUsed = movesSoFar.length;
        results.push([...movesSoFar]);
        return;
      }

      let anyMove = false;
      const tried = new Set();
      for (let i = 0; i < dice.length; i++) {
        if (tried.has(dice[i])) continue;
        tried.add(dice[i]);

        const moves = this.getMovesForDie(color, dice[i], b, br, bo);
        for (const move of moves) {
          anyMove = true;
          const { board: nb, bar: nbr, borneOff: nbo } = this.applyMoveToState(b, br, bo, color, move);
          const newDice = [...dice];
          newDice.splice(i, 1);
          movesSoFar.push(move);
          search(nb, nbr, nbo, newDice, movesSoFar);
          movesSoFar.pop();
        }
      }

      if (!anyMove) {
        if (movesSoFar.length > maxDiceUsed) maxDiceUsed = movesSoFar.length;
        results.push([...movesSoFar]);
      }
    };

    search(board, bar, borneOff, remainingDice, []);

    const filtered = results.filter(r => r.length === maxDiceUsed);

    // Must use higher die if only one can be used
    if (maxDiceUsed === 1 && remainingDice.length === 2 && remainingDice[0] !== remainingDice[1]) {
      const highDie = Math.max(...remainingDice);
      const hasHigh = filtered.some(r => r[0].die === highDie);
      if (hasHigh) {
        const onlyHigh = filtered.filter(r => r[0].die === highDie);
        if (onlyHigh.length > 0) return onlyHigh;
      }
    }

    return filtered.length > 0 ? filtered : [[]];
  }

  getValidFirstMoves() {
    const allTurns = this.findAllTurns(this.board, this.bar, this.borneOff, this.currentPlayer, this.remainingDice);
    const moves = [];
    const seen = new Set();
    for (const turn of allTurns) {
      if (turn.length === 0) continue;
      const key = `${turn[0].from}-${turn[0].to}-${turn[0].die}`;
      if (!seen.has(key)) {
        seen.add(key);
        moves.push(turn[0]);
      }
    }
    return moves;
  }

  makeMove(playerId, move) {
    if (this.gameOver) return { valid: false, message: 'Game is over' };

    const color = this.playerColors[playerId];
    if (!color) return { valid: false, message: 'Not a player' };
    if (color !== this.currentPlayer) return { valid: false, message: 'Not your turn' };

    if (move.type === 'roll') {
      if (this.phase !== 'rolling') return { valid: false, message: 'Not rolling phase' };

      this.dice = this.rollDice();
      this.remainingDice = this.getDiceValues(this.dice);
      this.movesThisTurn = [];

      // Check if any moves are available
      const validMoves = this.getValidFirstMoves();
      if (validMoves.length === 0) {
        // No moves possible, auto-end turn
        this.phase = 'rolling';
        this.currentPlayer = color === 'W' ? 'B' : 'W';
        this.remainingDice = [];
        return {
          valid: true,
          type: 'roll',
          dice: this.dice,
          noMoves: true,
          nextPlayer: this.currentPlayer,
          gameState: this.getState(playerId)
        };
      }

      this.phase = 'moving';
      return {
        valid: true,
        type: 'roll',
        dice: this.dice,
        validMoves,
        gameState: this.getState(playerId)
      };
    }

    if (move.type === 'move') {
      if (this.phase !== 'moving') return { valid: false, message: 'Not moving phase' };

      const validMoves = this.getValidFirstMoves();
      const matched = validMoves.find(m =>
        m.from === move.from && m.to === move.to && m.die === move.die
      );
      if (!matched) return { valid: false, message: 'Invalid move' };

      // Apply the move
      const { board, bar, borneOff, hit } = this.applyMoveToState(
        this.board, this.bar, this.borneOff, color, matched
      );
      this.board = board;
      this.bar = bar;
      this.borneOff = borneOff;
      this.lastMove = matched;
      this.movesThisTurn.push(matched);

      // Remove used die
      const dieIdx = this.remainingDice.indexOf(matched.die);
      this.remainingDice.splice(dieIdx, 1);

      // Check game over
      const winner = this.borneOff.W === 15 ? 'W' : this.borneOff.B === 15 ? 'B' : null;
      if (winner) {
        this.gameOver = true;
        this.winner = winner;
        this.winType = this.getWinType(winner);
        this.phase = 'gameOver';
        return {
          valid: true,
          type: 'move',
          move: matched,
          hit,
          bearOff: move.to === 'off',
          gameOver: true,
          winner: this.players[winner],
          winType: this.winType,
          gameState: this.getState(playerId)
        };
      }

      // Check if more moves remain
      if (this.remainingDice.length === 0) {
        this.endTurn();
        return {
          valid: true,
          type: 'move',
          move: matched,
          hit,
          bearOff: move.to === 'off',
          turnOver: true,
          nextPlayer: this.currentPlayer,
          gameState: this.getState(playerId)
        };
      }

      // Check if remaining dice have valid moves
      const nextMoves = this.getValidFirstMoves();
      if (nextMoves.length === 0) {
        this.endTurn();
        return {
          valid: true,
          type: 'move',
          move: matched,
          hit,
          bearOff: move.to === 'off',
          turnOver: true,
          noMoreMoves: true,
          nextPlayer: this.currentPlayer,
          gameState: this.getState(playerId)
        };
      }

      return {
        valid: true,
        type: 'move',
        move: matched,
        hit,
        bearOff: move.to === 'off',
        validMoves: nextMoves,
        gameState: this.getState(playerId)
      };
    }

    return { valid: false, message: 'Unknown move type' };
  }

  endTurn() {
    this.currentPlayer = this.currentPlayer === 'W' ? 'B' : 'W';
    this.phase = 'rolling';
    this.dice = null;
    this.remainingDice = [];
    this.movesThisTurn = [];
  }

  getWinType(winner) {
    const loser = winner === 'W' ? 'B' : 'W';
    if (this.borneOff[loser] > 0) return 'normal';
    if (this.bar[loser] > 0) return 'backgammon';
    for (let i = 0; i < 24; i++) {
      const count = this.checkerCount(i, loser);
      if (count > 0 && this.isInHomeBoard(i, winner)) return 'backgammon';
    }
    return 'gammon';
  }

  getState(playerId) {
    const color = this.playerColors[playerId];
    const validMoves = (this.phase === 'moving' && this.currentPlayer === color)
      ? this.getValidFirstMoves()
      : [];

    return {
      board: [...this.board],
      bar: { ...this.bar },
      borneOff: { ...this.borneOff },
      dice: this.dice ? [...this.dice] : null,
      remainingDice: [...this.remainingDice],
      currentPlayer: this.currentPlayer,
      currentPlayerId: this.players[this.currentPlayer],
      myColor: color,
      phase: this.phase,
      validMoves,
      lastMove: this.lastMove,
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      winType: this.winType,
      players: { ...this.players }
    };
  }

  removePlayer(playerId) {
    const color = this.playerColors[playerId];
    if (color) {
      this.gameOver = true;
      const winnerColor = color === 'W' ? 'B' : 'W';
      this.winner = winnerColor;
      this.winType = 'normal';
      this.phase = 'gameOver';
    }
  }
}

module.exports = Backgammon;
