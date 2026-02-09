class Checkers {
  constructor(player1Id, player2Id) {
    // 8x8 board, only dark squares used
    // null = empty, 'r' = red piece, 'R' = red king, 'b' = black piece, 'B' = black king
    this.board = this.initializeBoard();
    this.players = {
      R: player1Id,  // Red (top, rows 0-2)
      B: player2Id   // Black (bottom, rows 5-7)
    };
    this.currentTurn = 'R';  // Red goes first
    this.winner = null;
    this.isDraw = false;
    this.gameOver = false;
    this.mustContinueFrom = null;  // For chain jumps - {row, col} if in middle of multi-jump
  }

  initializeBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));

    // Red pieces at top (rows 0-2), only on dark squares
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        // Dark squares are where (row + col) is odd
        if ((row + col) % 2 === 1) {
          board[row][col] = 'r';
        }
      }
    }

    // Black pieces at bottom (rows 5-7), only on dark squares
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          board[row][col] = 'b';
        }
      }
    }

    return board;
  }

  getPlayerSymbol(playerId) {
    if (this.players.R === playerId) return 'R';
    if (this.players.B === playerId) return 'B';
    return null;
  }

  isPlayerPiece(piece, playerSymbol) {
    if (!piece) return false;
    return piece.toUpperCase() === playerSymbol;
  }

  isKing(piece) {
    return piece === 'R' || piece === 'B';
  }

  makeMove(playerId, move) {
    const playerSymbol = this.getPlayerSymbol(playerId);

    // Validate it's this player's turn
    if (this.currentTurn !== playerSymbol) {
      return { valid: false, message: 'Not your turn' };
    }

    // Validate game isn't over
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    const { fromRow, fromCol, toRow, toCol } = move;

    // Validate bounds
    if (!this.isValidPosition(fromRow, fromCol) || !this.isValidPosition(toRow, toCol)) {
      return { valid: false, message: 'Invalid position' };
    }

    // If in chain jump, must continue from same piece
    if (this.mustContinueFrom) {
      if (fromRow !== this.mustContinueFrom.row || fromCol !== this.mustContinueFrom.col) {
        return { valid: false, message: 'Must continue jumping with the same piece' };
      }
    }

    // Validate the piece belongs to this player
    const piece = this.board[fromRow][fromCol];
    if (!this.isPlayerPiece(piece, playerSymbol)) {
      return { valid: false, message: 'Not your piece' };
    }

    // Get all valid moves for this player
    const allCaptures = this.getAllCaptureMoves(playerSymbol);
    const hasCaptures = allCaptures.length > 0;

    // If there are capture moves available, player must capture
    if (hasCaptures) {
      const isValidCapture = allCaptures.some(m =>
        m.fromRow === fromRow && m.fromCol === fromCol &&
        m.toRow === toRow && m.toCol === toCol
      );
      if (!isValidCapture) {
        return { valid: false, message: 'Must capture when possible' };
      }
    } else {
      // No captures available, validate regular move
      if (this.mustContinueFrom) {
        // We're in a chain jump but no more captures - shouldn't happen
        return { valid: false, message: 'Invalid state' };
      }
      const regularMoves = this.getRegularMovesForPiece(fromRow, fromCol, piece);
      const isValidMove = regularMoves.some(m => m.toRow === toRow && m.toCol === toCol);
      if (!isValidMove) {
        return { valid: false, message: 'Invalid move' };
      }
    }

    // Execute the move
    const capturedRow = hasCaptures ? (fromRow + toRow) / 2 : null;
    const capturedCol = hasCaptures ? (fromCol + toCol) / 2 : null;
    const capturedPiece = capturedRow !== null ? this.board[capturedRow][capturedCol] : null;

    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;
    if (capturedRow !== null) {
      this.board[capturedRow][capturedCol] = null;
    }

    // Check for king promotion
    let promoted = false;
    if (this.shouldPromote(toRow, playerSymbol)) {
      this.board[toRow][toCol] = playerSymbol;  // Uppercase = King
      promoted = true;
    }

    // Check for chain jump (only if we captured and not promoted)
    if (hasCaptures && !promoted) {
      const furtherCaptures = this.getCaptureMoves(toRow, toCol, this.board[toRow][toCol]);
      if (furtherCaptures.length > 0) {
        this.mustContinueFrom = { row: toRow, col: toCol };
        return {
          valid: true,
          gameOver: false,
          move: { fromRow, fromCol, toRow, toCol },
          captured: { row: capturedRow, col: capturedCol, piece: capturedPiece },
          promoted,
          chainJump: true,
          mustContinueFrom: this.mustContinueFrom
        };
      }
    }

    // End of turn
    this.mustContinueFrom = null;
    this.currentTurn = this.currentTurn === 'R' ? 'B' : 'R';

    // Check for game over
    const gameOverResult = this.checkGameOver();
    if (gameOverResult) {
      this.gameOver = true;
      this.winner = gameOverResult.winner;
      this.isDraw = gameOverResult.isDraw;
      return {
        valid: true,
        gameOver: true,
        winner: this.winner ? this.players[this.winner] : null,
        isDraw: this.isDraw,
        move: { fromRow, fromCol, toRow, toCol },
        captured: capturedRow !== null ? { row: capturedRow, col: capturedCol, piece: capturedPiece } : null,
        promoted
      };
    }

    return {
      valid: true,
      gameOver: false,
      move: { fromRow, fromCol, toRow, toCol },
      captured: capturedRow !== null ? { row: capturedRow, col: capturedCol, piece: capturedPiece } : null,
      promoted,
      chainJump: false
    };
  }

  isValidPosition(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  shouldPromote(row, playerSymbol) {
    // Red promotes at row 7, Black promotes at row 0
    if (playerSymbol === 'R' && row === 7) return true;
    if (playerSymbol === 'B' && row === 0) return true;
    return false;
  }

  getAllCaptureMoves(playerSymbol) {
    const captures = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (this.isPlayerPiece(piece, playerSymbol)) {
          const pieceCaptures = this.getCaptureMoves(row, col, piece);
          captures.push(...pieceCaptures.map(m => ({ fromRow: row, fromCol: col, ...m })));
        }
      }
    }
    return captures;
  }

  getCaptureMoves(row, col, piece) {
    const captures = [];
    const playerSymbol = piece.toUpperCase();
    const isKing = this.isKing(piece);

    // Directions: regular pieces can only capture forward, kings can capture any direction
    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]  // All diagonals
      : playerSymbol === 'R'
        ? [[1, -1], [1, 1]]  // Red moves down (increasing row)
        : [[-1, -1], [-1, 1]];  // Black moves up (decreasing row)

    for (const [dr, dc] of directions) {
      const midRow = row + dr;
      const midCol = col + dc;
      const endRow = row + 2 * dr;
      const endCol = col + 2 * dc;

      if (this.isValidPosition(endRow, endCol)) {
        const midPiece = this.board[midRow][midCol];
        const endCell = this.board[endRow][endCol];

        // Can capture if there's an opponent piece in the middle and end is empty
        if (midPiece && !this.isPlayerPiece(midPiece, playerSymbol) && endCell === null) {
          captures.push({ toRow: endRow, toCol: endCol });
        }
      }
    }

    return captures;
  }

  getRegularMovesForPiece(row, col, piece) {
    const moves = [];
    const playerSymbol = piece.toUpperCase();
    const isKing = this.isKing(piece);

    // Directions for regular moves
    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : playerSymbol === 'R'
        ? [[1, -1], [1, 1]]  // Red moves down
        : [[-1, -1], [-1, 1]];  // Black moves up

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;

      if (this.isValidPosition(newRow, newCol) && this.board[newRow][newCol] === null) {
        moves.push({ toRow: newRow, toCol: newCol });
      }
    }

    return moves;
  }

  getAllValidMoves(playerSymbol) {
    const captures = this.getAllCaptureMoves(playerSymbol);

    // If captures available, must capture (mandatory)
    if (captures.length > 0) {
      return { moves: captures, mustCapture: true };
    }

    // Otherwise, get all regular moves
    const regularMoves = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (this.isPlayerPiece(piece, playerSymbol)) {
          const pieceMoves = this.getRegularMovesForPiece(row, col, piece);
          regularMoves.push(...pieceMoves.map(m => ({ fromRow: row, fromCol: col, ...m })));
        }
      }
    }

    return { moves: regularMoves, mustCapture: false };
  }

  checkGameOver() {
    // Count pieces
    let redPieces = 0;
    let blackPieces = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece === 'r' || piece === 'R') redPieces++;
        if (piece === 'b' || piece === 'B') blackPieces++;
      }
    }

    // No pieces left = opponent wins
    if (redPieces === 0) {
      return { winner: 'B', isDraw: false };
    }
    if (blackPieces === 0) {
      return { winner: 'R', isDraw: false };
    }

    // Check if current player has any valid moves
    const { moves } = this.getAllValidMoves(this.currentTurn);
    if (moves.length === 0) {
      // Current player can't move, opponent wins
      return { winner: this.currentTurn === 'R' ? 'B' : 'R', isDraw: false };
    }

    return null;  // Game continues
  }

  getState(playerId) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    const { moves, mustCapture } = this.getAllValidMoves(this.currentTurn);

    return {
      board: this.board.map(row => [...row]),
      currentTurn: this.currentTurn,
      currentPlayerId: this.players[this.currentTurn],
      players: { ...this.players },
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      isDraw: this.isDraw,
      mustContinueFrom: this.mustContinueFrom,
      validMoves: this.currentTurn === playerSymbol ? moves : [],
      mustCapture
    };
  }
}

module.exports = Checkers;
