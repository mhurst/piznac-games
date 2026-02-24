class Chess {
  constructor(player1Id, player2Id) {
    this.board = this.initializeBoard();
    this.players = {
      W: player1Id,  // White
      B: player2Id   // Black
    };
    this.currentTurn = 'W';  // White goes first
    this.winner = null;
    this.isDraw = false;
    this.gameOver = false;
    this.castlingRights = {
      W: { kingSide: true, queenSide: true },
      B: { kingSide: true, queenSide: true }
    };
    this.enPassantTarget = null; // {row, col} if available
    this.halfMoveClock = 0;     // for 50-move rule
    this.positionHistory = [];  // for threefold repetition
    this.lastMove = null;       // {fromRow, fromCol, toRow, toCol}
    this.inCheck = { W: false, B: false };

    this.recordPosition();
  }

  // Board: 8x8, pieces as 'wP','wR','wN','wB','wQ','wK' / 'bP','bR','bN','bB','bQ','bK', null for empty
  // White rows 6-7 (bottom), Black rows 0-1 (top)
  initializeBoard() {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));

    // Black pieces (top)
    board[0] = ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'];
    board[1] = ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'];

    // White pieces (bottom)
    board[6] = ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'];
    board[7] = ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'];

    return board;
  }

  getPlayerColor(playerId) {
    if (this.players.W === playerId) return 'W';
    if (this.players.B === playerId) return 'B';
    return null;
  }

  isOwnPiece(piece, color) {
    if (!piece) return false;
    return piece[0] === color.toLowerCase();
  }

  isEnemyPiece(piece, color) {
    if (!piece) return false;
    return piece[0] !== color.toLowerCase();
  }

  getPieceColor(piece) {
    if (!piece) return null;
    return piece[0] === 'w' ? 'W' : 'B';
  }

  getPieceType(piece) {
    if (!piece) return null;
    return piece[1]; // P, R, N, B, Q, K
  }

  isValidPosition(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  makeMove(playerId, move) {
    const color = this.getPlayerColor(playerId);
    if (this.currentTurn !== color) {
      return { valid: false, message: 'Not your turn' };
    }
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    const { fromRow, fromCol, toRow, toCol, promotion } = move;

    if (!this.isValidPosition(fromRow, fromCol) || !this.isValidPosition(toRow, toCol)) {
      return { valid: false, message: 'Invalid position' };
    }

    const piece = this.board[fromRow][fromCol];
    if (!this.isOwnPiece(piece, color)) {
      return { valid: false, message: 'Not your piece' };
    }

    // Check if move is in legal moves list
    const legalMoves = this.getLegalMovesForPiece(fromRow, fromCol);
    const isLegal = legalMoves.some(m => m.toRow === toRow && m.toCol === toCol);
    if (!isLegal) {
      return { valid: false, message: 'Illegal move' };
    }

    // Execute the move
    const captured = this.board[toRow][toCol];
    const pieceType = this.getPieceType(piece);
    let special = null; // 'castle-king', 'castle-queen', 'en-passant', 'promotion'
    let capturedPiece = captured;

    // En passant capture
    if (pieceType === 'P' && this.enPassantTarget &&
        toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
      const capturedPawnRow = color === 'W' ? toRow + 1 : toRow - 1;
      capturedPiece = this.board[capturedPawnRow][toCol];
      this.board[capturedPawnRow][toCol] = null;
      special = 'en-passant';
    }

    // Castling
    if (pieceType === 'K' && Math.abs(toCol - fromCol) === 2) {
      if (toCol > fromCol) {
        // King-side castle
        this.board[fromRow][5] = this.board[fromRow][7];
        this.board[fromRow][7] = null;
        special = 'castle-king';
      } else {
        // Queen-side castle
        this.board[fromRow][3] = this.board[fromRow][0];
        this.board[fromRow][0] = null;
        special = 'castle-queen';
      }
    }

    // Move the piece
    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;

    // Pawn promotion
    if (pieceType === 'P' && (toRow === 0 || toRow === 7)) {
      const promoteTo = promotion || 'Q';
      this.board[toRow][toCol] = color.toLowerCase() + promoteTo;
      special = 'promotion';
    }

    // Update castling rights
    this.updateCastlingRights(piece, fromRow, fromCol, toRow, toCol);

    // Update en passant target
    this.enPassantTarget = null;
    if (pieceType === 'P' && Math.abs(toRow - fromRow) === 2) {
      this.enPassantTarget = {
        row: (fromRow + toRow) / 2,
        col: fromCol
      };
    }

    // Update half-move clock
    if (pieceType === 'P' || capturedPiece) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    this.lastMove = { fromRow, fromCol, toRow, toCol };

    // Update check status
    const opponent = color === 'W' ? 'B' : 'W';
    this.inCheck[opponent] = this.isKingInCheck(opponent);
    this.inCheck[color] = false;

    // Record position for repetition detection
    this.recordPosition();

    // Switch turns
    this.currentTurn = opponent;

    // Check game over
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
        captured: capturedPiece,
        special,
        inCheck: this.inCheck[opponent]
      };
    }

    return {
      valid: true,
      gameOver: false,
      move: { fromRow, fromCol, toRow, toCol },
      captured: capturedPiece,
      special,
      inCheck: this.inCheck[opponent]
    };
  }

  updateCastlingRights(piece, fromRow, fromCol, toRow, toCol) {
    const color = this.getPieceColor(piece);
    const type = this.getPieceType(piece);

    // King moved
    if (type === 'K') {
      this.castlingRights[color].kingSide = false;
      this.castlingRights[color].queenSide = false;
    }

    // Rook moved or captured
    if (type === 'R') {
      if (fromCol === 0) this.castlingRights[color].queenSide = false;
      if (fromCol === 7) this.castlingRights[color].kingSide = false;
    }

    // Rook captured
    if (toRow === 0 && toCol === 0) this.castlingRights.B.queenSide = false;
    if (toRow === 0 && toCol === 7) this.castlingRights.B.kingSide = false;
    if (toRow === 7 && toCol === 0) this.castlingRights.W.queenSide = false;
    if (toRow === 7 && toCol === 7) this.castlingRights.W.kingSide = false;
  }

  // Get all pseudo-legal moves for a piece (doesn't check for leaving king in check)
  getPseudoLegalMoves(row, col) {
    const piece = this.board[row][col];
    if (!piece) return [];

    const color = this.getPieceColor(piece);
    const type = this.getPieceType(piece);
    const moves = [];

    switch (type) {
      case 'P': this.getPawnMoves(row, col, color, moves); break;
      case 'R': this.getSlidingMoves(row, col, color, [[0,1],[0,-1],[1,0],[-1,0]], moves); break;
      case 'N': this.getKnightMoves(row, col, color, moves); break;
      case 'B': this.getSlidingMoves(row, col, color, [[1,1],[1,-1],[-1,1],[-1,-1]], moves); break;
      case 'Q': this.getSlidingMoves(row, col, color, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]], moves); break;
      case 'K': this.getKingMoves(row, col, color, moves); break;
    }

    return moves;
  }

  getPawnMoves(row, col, color, moves) {
    const dir = color === 'W' ? -1 : 1;
    const startRow = color === 'W' ? 6 : 1;

    // Forward one
    if (this.isValidPosition(row + dir, col) && !this.board[row + dir][col]) {
      moves.push({ toRow: row + dir, toCol: col });
      // Forward two from start
      if (row === startRow && !this.board[row + 2 * dir][col]) {
        moves.push({ toRow: row + 2 * dir, toCol: col });
      }
    }

    // Diagonal captures
    for (const dc of [-1, 1]) {
      const nr = row + dir;
      const nc = col + dc;
      if (this.isValidPosition(nr, nc)) {
        if (this.isEnemyPiece(this.board[nr][nc], color)) {
          moves.push({ toRow: nr, toCol: nc });
        }
        // En passant
        if (this.enPassantTarget && nr === this.enPassantTarget.row && nc === this.enPassantTarget.col) {
          moves.push({ toRow: nr, toCol: nc });
        }
      }
    }
  }

  getSlidingMoves(row, col, color, directions, moves) {
    for (const [dr, dc] of directions) {
      let r = row + dr;
      let c = col + dc;
      while (this.isValidPosition(r, c)) {
        if (this.isOwnPiece(this.board[r][c], color)) break;
        moves.push({ toRow: r, toCol: c });
        if (this.isEnemyPiece(this.board[r][c], color)) break;
        r += dr;
        c += dc;
      }
    }
  }

  getKnightMoves(row, col, color, moves) {
    const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of offsets) {
      const r = row + dr;
      const c = col + dc;
      if (this.isValidPosition(r, c) && !this.isOwnPiece(this.board[r][c], color)) {
        moves.push({ toRow: r, toCol: c });
      }
    }
  }

  getKingMoves(row, col, color, moves) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (this.isValidPosition(r, c) && !this.isOwnPiece(this.board[r][c], color)) {
          moves.push({ toRow: r, toCol: c });
        }
      }
    }

    // Castling
    const homeRow = color === 'W' ? 7 : 0;
    if (row === homeRow && col === 4 && !this.isKingInCheck(color)) {
      // King-side
      if (this.castlingRights[color].kingSide &&
          !this.board[homeRow][5] && !this.board[homeRow][6] &&
          this.board[homeRow][7] && this.getPieceType(this.board[homeRow][7]) === 'R' &&
          !this.isSquareAttacked(homeRow, 5, color) &&
          !this.isSquareAttacked(homeRow, 6, color)) {
        moves.push({ toRow: homeRow, toCol: 6 });
      }
      // Queen-side
      if (this.castlingRights[color].queenSide &&
          !this.board[homeRow][1] && !this.board[homeRow][2] && !this.board[homeRow][3] &&
          this.board[homeRow][0] && this.getPieceType(this.board[homeRow][0]) === 'R' &&
          !this.isSquareAttacked(homeRow, 2, color) &&
          !this.isSquareAttacked(homeRow, 3, color)) {
        moves.push({ toRow: homeRow, toCol: 2 });
      }
    }
  }

  // Check if a square is attacked by the opponent of 'color'
  isSquareAttacked(row, col, color) {
    const opponent = color === 'W' ? 'b' : 'w';

    // Pawn attacks
    const pawnDir = color === 'W' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const pr = row + pawnDir;
      const pc = col + dc;
      if (this.isValidPosition(pr, pc) && this.board[pr][pc] === opponent + 'P') {
        return true;
      }
    }

    // Knight attacks
    const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of knightOffsets) {
      const r = row + dr;
      const c = col + dc;
      if (this.isValidPosition(r, c) && this.board[r][c] === opponent + 'N') {
        return true;
      }
    }

    // King attacks
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (this.isValidPosition(r, c) && this.board[r][c] === opponent + 'K') {
          return true;
        }
      }
    }

    // Sliding attacks (rook/queen on straights, bishop/queen on diagonals)
    const straightDirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of straightDirs) {
      let r = row + dr;
      let c = col + dc;
      while (this.isValidPosition(r, c)) {
        const p = this.board[r][c];
        if (p) {
          if (p === opponent + 'R' || p === opponent + 'Q') return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    const diagDirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of diagDirs) {
      let r = row + dr;
      let c = col + dc;
      while (this.isValidPosition(r, c)) {
        const p = this.board[r][c];
        if (p) {
          if (p === opponent + 'B' || p === opponent + 'Q') return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    return false;
  }

  findKing(color) {
    const king = color.toLowerCase() + 'K';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === king) return { row: r, col: c };
      }
    }
    return null;
  }

  isKingInCheck(color) {
    const king = this.findKing(color);
    if (!king) return false;
    return this.isSquareAttacked(king.row, king.col, color);
  }

  // Get legal moves (filters out moves that leave king in check)
  getLegalMovesForPiece(row, col) {
    const piece = this.board[row][col];
    if (!piece) return [];

    const color = this.getPieceColor(piece);
    const pseudoMoves = this.getPseudoLegalMoves(row, col);
    const legalMoves = [];

    for (const move of pseudoMoves) {
      if (this.isMoveLegal(row, col, move.toRow, move.toCol, color)) {
        legalMoves.push(move);
      }
    }

    return legalMoves;
  }

  // Test if a move is legal (doesn't leave own king in check)
  isMoveLegal(fromRow, fromCol, toRow, toCol, color) {
    const piece = this.board[fromRow][fromCol];
    const captured = this.board[toRow][toCol];
    const pieceType = this.getPieceType(piece);

    // Simulate the move
    let enPassantCapture = null;
    if (pieceType === 'P' && this.enPassantTarget &&
        toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
      const capturedPawnRow = color === 'W' ? toRow + 1 : toRow - 1;
      enPassantCapture = { row: capturedPawnRow, col: toCol, piece: this.board[capturedPawnRow][toCol] };
      this.board[capturedPawnRow][toCol] = null;
    }

    // Handle castling rook movement for simulation
    let rookMove = null;
    if (pieceType === 'K' && Math.abs(toCol - fromCol) === 2) {
      if (toCol > fromCol) {
        rookMove = { from: { row: fromRow, col: 7 }, to: { row: fromRow, col: 5 } };
      } else {
        rookMove = { from: { row: fromRow, col: 0 }, to: { row: fromRow, col: 3 } };
      }
      this.board[rookMove.to.row][rookMove.to.col] = this.board[rookMove.from.row][rookMove.from.col];
      this.board[rookMove.from.row][rookMove.from.col] = null;
    }

    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;

    const inCheck = this.isKingInCheck(color);

    // Undo the move
    this.board[fromRow][fromCol] = piece;
    this.board[toRow][toCol] = captured;

    if (enPassantCapture) {
      this.board[enPassantCapture.row][enPassantCapture.col] = enPassantCapture.piece;
    }

    if (rookMove) {
      this.board[rookMove.from.row][rookMove.from.col] = this.board[rookMove.to.row][rookMove.to.col];
      this.board[rookMove.to.row][rookMove.to.col] = null;
    }

    return !inCheck;
  }

  getAllLegalMoves(color) {
    const moves = [];
    const c = color.toLowerCase();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece && piece[0] === c) {
          const pieceMoves = this.getLegalMovesForPiece(row, col);
          for (const m of pieceMoves) {
            moves.push({ fromRow: row, fromCol: col, toRow: m.toRow, toCol: m.toCol });
          }
        }
      }
    }
    return moves;
  }

  checkGameOver() {
    const legalMoves = this.getAllLegalMoves(this.currentTurn);

    if (legalMoves.length === 0) {
      if (this.isKingInCheck(this.currentTurn)) {
        // Checkmate - the other player wins
        const winner = this.currentTurn === 'W' ? 'B' : 'W';
        return { winner, isDraw: false };
      } else {
        // Stalemate
        return { winner: null, isDraw: true };
      }
    }

    // 50-move rule
    if (this.halfMoveClock >= 100) {
      return { winner: null, isDraw: true };
    }

    // Threefold repetition
    if (this.isThreefoldRepetition()) {
      return { winner: null, isDraw: true };
    }

    // Insufficient material
    if (this.isInsufficientMaterial()) {
      return { winner: null, isDraw: true };
    }

    return null;
  }

  recordPosition() {
    this.positionHistory.push(this.getBoardHash());
  }

  getBoardHash() {
    let hash = this.currentTurn;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        hash += (this.board[r][c] || '--');
      }
    }
    hash += `${this.castlingRights.W.kingSide}${this.castlingRights.W.queenSide}`;
    hash += `${this.castlingRights.B.kingSide}${this.castlingRights.B.queenSide}`;
    if (this.enPassantTarget) {
      hash += `${this.enPassantTarget.row}${this.enPassantTarget.col}`;
    }
    return hash;
  }

  isThreefoldRepetition() {
    const current = this.positionHistory[this.positionHistory.length - 1];
    let count = 0;
    for (const pos of this.positionHistory) {
      if (pos === current) count++;
      if (count >= 3) return true;
    }
    return false;
  }

  isInsufficientMaterial() {
    const pieces = { w: [], b: [] };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) {
          pieces[p[0]].push(p[1]);
        }
      }
    }

    const w = pieces.w.filter(t => t !== 'K');
    const b = pieces.b.filter(t => t !== 'K');

    // K vs K
    if (w.length === 0 && b.length === 0) return true;
    // K+B vs K or K+N vs K
    if (w.length === 0 && b.length === 1 && (b[0] === 'B' || b[0] === 'N')) return true;
    if (b.length === 0 && w.length === 1 && (w[0] === 'B' || w[0] === 'N')) return true;
    // K+B vs K+B (same color bishops)
    if (w.length === 1 && b.length === 1 && w[0] === 'B' && b[0] === 'B') {
      const wBishop = this.findPiecePosition('wB');
      const bBishop = this.findPiecePosition('bB');
      if (wBishop && bBishop) {
        const wColor = (wBishop.row + wBishop.col) % 2;
        const bColor = (bBishop.row + bBishop.col) % 2;
        if (wColor === bColor) return true;
      }
    }

    return false;
  }

  findPiecePosition(piece) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === piece) return { row: r, col: c };
      }
    }
    return null;
  }

  getState(playerId) {
    const color = this.getPlayerColor(playerId);
    const legalMoves = this.currentTurn === color ? this.getAllLegalMoves(color) : [];

    return {
      board: this.board.map(row => [...row]),
      currentTurn: this.currentTurn,
      currentPlayerId: this.players[this.currentTurn],
      players: { ...this.players },
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      isDraw: this.isDraw,
      validMoves: legalMoves,
      lastMove: this.lastMove,
      inCheck: this.inCheck,
      castlingRights: JSON.parse(JSON.stringify(this.castlingRights)),
      enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null
    };
  }
}

module.exports = Chess;
