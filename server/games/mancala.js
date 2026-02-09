class Mancala {
  constructor(player1Id, player2Id) {
    // 14-element array: [0-5] P1 pits, [6] P1 store, [7-12] P2 pits, [13] P2 store
    this.pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    this.players = {
      1: player1Id,
      2: player2Id
    };
    this.currentPlayer = 1; // Player 1 goes first
    this.winner = null;
    this.isDraw = false;
    this.gameOver = false;
  }

  getPlayerNumber(playerId) {
    if (this.players[1] === playerId) return 1;
    if (this.players[2] === playerId) return 2;
    return null;
  }

  makeMove(playerId, pitIndex) {
    const playerNum = this.getPlayerNumber(playerId);

    if (playerNum !== this.currentPlayer) {
      return { valid: false, message: 'Not your turn' };
    }

    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    // Validate pit belongs to this player
    const validStart = playerNum === 1 ? 0 : 7;
    const validEnd = playerNum === 1 ? 5 : 12;

    if (pitIndex < validStart || pitIndex > validEnd) {
      return { valid: false, message: 'Not your pit' };
    }

    if (this.pits[pitIndex] === 0) {
      return { valid: false, message: 'Pit is empty' };
    }

    // Execute sow
    let stones = this.pits[pitIndex];
    this.pits[pitIndex] = 0;
    let current = pitIndex;
    const opponentStore = playerNum === 1 ? 13 : 6;
    const myStore = playerNum === 1 ? 6 : 13;

    while (stones > 0) {
      current = (current + 1) % 14;
      if (current === opponentStore) continue;
      this.pits[current]++;
      stones--;
    }

    const extraTurn = current === myStore;

    // Check capture
    let captured = false;
    const myPitStart = playerNum === 1 ? 0 : 7;
    const myPitEnd = playerNum === 1 ? 5 : 12;

    if (!extraTurn && current >= myPitStart && current <= myPitEnd && this.pits[current] === 1) {
      const opposite = 12 - current;
      if (this.pits[opposite] > 0) {
        this.pits[myStore] += this.pits[opposite] + 1;
        this.pits[current] = 0;
        this.pits[opposite] = 0;
        captured = true;
      }
    }

    // Check game over
    const p1Empty = this.pits.slice(0, 6).every(s => s === 0);
    const p2Empty = this.pits.slice(7, 13).every(s => s === 0);

    if (p1Empty || p2Empty) {
      // Sweep remaining stones
      if (p1Empty) {
        for (let i = 7; i <= 12; i++) {
          this.pits[13] += this.pits[i];
          this.pits[i] = 0;
        }
      }
      if (p2Empty) {
        for (let i = 0; i <= 5; i++) {
          this.pits[6] += this.pits[i];
          this.pits[i] = 0;
        }
      }

      this.gameOver = true;
      const p1Score = this.pits[6];
      const p2Score = this.pits[13];

      if (p1Score > p2Score) {
        this.winner = 1;
      } else if (p2Score > p1Score) {
        this.winner = 2;
      } else {
        this.isDraw = true;
      }

      return {
        valid: true,
        gameOver: true,
        winner: this.winner ? this.players[this.winner] : null,
        isDraw: this.isDraw,
        extraTurn: false,
        captured,
        lastPit: current
      };
    }

    // Switch player if no extra turn
    if (!extraTurn) {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }

    return {
      valid: true,
      gameOver: false,
      extraTurn,
      captured,
      lastPit: current
    };
  }

  getState(playerId) {
    const playerNum = this.getPlayerNumber(playerId);

    return {
      pits: [...this.pits],
      currentPlayer: this.currentPlayer,
      currentPlayerId: this.players[this.currentPlayer],
      players: { ...this.players },
      playerNumber: playerNum,
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      isDraw: this.isDraw,
      scores: {
        1: this.pits[6],
        2: this.pits[13]
      }
    };
  }
}

module.exports = Mancala;
