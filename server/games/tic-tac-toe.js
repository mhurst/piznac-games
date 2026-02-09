class TicTacToe {
  constructor(player1Id, player2Id) {
    this.board = Array(9).fill(null);
    this.players = {
      X: player1Id,
      O: player2Id
    };
    this.currentTurn = 'X';
    this.winner = null;
    this.isDraw = false;
    this.gameOver = false;
    this.winningLine = null;
  }

  makeMove(playerId, cellIndex) {
    // Validate it's this player's turn
    if (this.players[this.currentTurn] !== playerId) {
      return { valid: false, message: 'Not your turn' };
    }

    // Validate game isn't over
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    // Validate cell is empty
    if (this.board[cellIndex] !== null) {
      return { valid: false, message: 'Cell is occupied' };
    }

    // Validate cell index
    if (cellIndex < 0 || cellIndex > 8) {
      return { valid: false, message: 'Invalid cell' };
    }

    // Make the move
    this.board[cellIndex] = this.currentTurn;

    // Check for win
    const winResult = this.checkWin();
    if (winResult) {
      this.gameOver = true;
      this.winner = this.currentTurn;
      this.winningLine = winResult;
      return {
        valid: true,
        gameOver: true,
        winner: this.players[this.currentTurn],
        winningLine: winResult,
        isDraw: false
      };
    }

    // Check for draw
    if (this.board.every(cell => cell !== null)) {
      this.gameOver = true;
      this.isDraw = true;
      return {
        valid: true,
        gameOver: true,
        winner: null,
        winningLine: null,
        isDraw: true
      };
    }

    // Switch turns
    this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';

    return { valid: true, gameOver: false };
  }

  checkWin() {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
      [0, 4, 8], [2, 4, 6]              // diagonals
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        return line;
      }
    }

    return null;
  }

  getState() {
    return {
      board: [...this.board],
      currentTurn: this.currentTurn,
      currentPlayerId: this.players[this.currentTurn],
      players: { ...this.players },
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      winningLine: this.winningLine,
      isDraw: this.isDraw
    };
  }
}

module.exports = TicTacToe;
