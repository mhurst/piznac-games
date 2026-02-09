class ConnectFour {
  constructor(player1Id, player2Id) {
    // 6 rows x 7 columns, bottom row is index 5
    this.board = Array(6).fill(null).map(() => Array(7).fill(null));
    this.players = {
      R: player1Id,  // Red
      Y: player2Id   // Yellow
    };
    this.currentTurn = 'R';  // Red goes first
    this.winner = null;
    this.isDraw = false;
    this.gameOver = false;
    this.winningLine = null;
  }

  makeMove(playerId, column) {
    // Validate it's this player's turn
    if (this.players[this.currentTurn] !== playerId) {
      return { valid: false, message: 'Not your turn' };
    }

    // Validate game isn't over
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    // Validate column index
    if (column < 0 || column > 6) {
      return { valid: false, message: 'Invalid column' };
    }

    // Find the lowest empty row in this column
    const row = this.getLowestEmptyRow(column);
    if (row === -1) {
      return { valid: false, message: 'Column is full' };
    }

    // Make the move
    this.board[row][column] = this.currentTurn;

    // Check for win
    const winResult = this.checkWin(row, column);
    if (winResult) {
      this.gameOver = true;
      this.winner = this.currentTurn;
      this.winningLine = winResult;
      return {
        valid: true,
        gameOver: true,
        winner: this.players[this.currentTurn],
        winningLine: winResult,
        isDraw: false,
        row,
        column
      };
    }

    // Check for draw (board full)
    if (this.isBoardFull()) {
      this.gameOver = true;
      this.isDraw = true;
      return {
        valid: true,
        gameOver: true,
        winner: null,
        winningLine: null,
        isDraw: true,
        row,
        column
      };
    }

    // Switch turns
    this.currentTurn = this.currentTurn === 'R' ? 'Y' : 'R';

    return { valid: true, gameOver: false, row, column };
  }

  getLowestEmptyRow(column) {
    for (let row = 5; row >= 0; row--) {
      if (this.board[row][column] === null) {
        return row;
      }
    }
    return -1; // Column is full
  }

  isBoardFull() {
    return this.board[0].every(cell => cell !== null);
  }

  checkWin(row, col) {
    const symbol = this.board[row][col];
    if (!symbol) return null;

    const directions = [
      { dr: 0, dc: 1 },   // horizontal
      { dr: 1, dc: 0 },   // vertical
      { dr: 1, dc: 1 },   // diagonal down-right
      { dr: 1, dc: -1 }   // diagonal down-left
    ];

    for (const { dr, dc } of directions) {
      const line = this.getLine(row, col, dr, dc, symbol);
      if (line.length >= 4) {
        return line;
      }
    }

    return null;
  }

  getLine(row, col, dr, dc, symbol) {
    const line = [{ row, col }];

    // Check in positive direction
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && this.board[r][c] === symbol) {
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }

    // Check in negative direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && this.board[r][c] === symbol) {
      line.unshift({ row: r, col: c });
      r -= dr;
      c -= dc;
    }

    return line;
  }

  getState() {
    return {
      board: this.board.map(row => [...row]),
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

module.exports = ConnectFour;
