import { Injectable } from '@angular/core';
import { Difficulty, GameAI } from './game-ai.interface';
import { ChessBoard, ChessMove } from '../../games/chess/chess.scene';

const BOARD_SIZE = 8;

// Material values
const PIECE_VALUES: Record<string, number> = {
  'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
};

// Piece-square tables (from White's perspective, flip for Black)
const PST_PAWN = [
  [ 0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [ 5,  5, 10, 25, 25, 10,  5,  5],
  [ 0,  0,  0, 20, 20,  0,  0,  0],
  [ 5, -5,-10,  0,  0,-10, -5,  5],
  [ 5, 10, 10,-20,-20, 10, 10,  5],
  [ 0,  0,  0,  0,  0,  0,  0,  0]
];

const PST_KNIGHT = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const PST_BISHOP = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const PST_ROOK = [
  [ 0,  0,  0,  0,  0,  0,  0,  0],
  [ 5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [ 0,  0,  0,  5,  5,  0,  0,  0]
];

const PST_QUEEN = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [ -5,  0,  5,  5,  5,  5,  0, -5],
  [  0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];

const PST_KING_MID = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [ 20, 20,  0,  0,  0,  0, 20, 20],
  [ 20, 30, 10,  0,  0, 10, 30, 20]
];

const PST: Record<string, number[][]> = {
  'P': PST_PAWN, 'N': PST_KNIGHT, 'B': PST_BISHOP,
  'R': PST_ROOK, 'Q': PST_QUEEN, 'K': PST_KING_MID
};

interface ChessState {
  board: ChessBoard;
  castlingRights: { W: { kingSide: boolean; queenSide: boolean }; B: { kingSide: boolean; queenSide: boolean } };
  enPassantTarget: { row: number; col: number } | null;
}

@Injectable({
  providedIn: 'root'
})
export class ChessAI implements GameAI<ChessBoard, ChessMove> {
  private aiColor: 'W' | 'B' = 'B';
  private playerColor: 'W' | 'B' = 'W';
  private state: ChessState = {
    board: [],
    castlingRights: {
      W: { kingSide: true, queenSide: true },
      B: { kingSide: true, queenSide: true }
    },
    enPassantTarget: null
  };

  setSymbols(aiColor: 'W' | 'B'): void {
    this.aiColor = aiColor;
    this.playerColor = aiColor === 'W' ? 'B' : 'W';
  }

  setState(castlingRights: any, enPassantTarget: any): void {
    this.state.castlingRights = castlingRights;
    this.state.enPassantTarget = enPassantTarget;
  }

  getMove(board: ChessBoard, difficulty: Difficulty): ChessMove {
    this.state.board = board.map(row => [...row]);
    const moves = this.getAllLegalMoves(board, this.aiColor);
    if (moves.length === 0) {
      return { fromRow: -1, fromCol: -1, toRow: -1, toCol: -1 };
    }

    switch (difficulty) {
      case 'easy': return this.getEasyMove(moves);
      case 'medium': return this.getMediumMove(board, moves);
      case 'hard': return this.getHardMove(board, moves);
    }
  }

  checkGameOver(board: ChessBoard): string | 'draw' | null {
    const whiteMoves = this.getAllLegalMoves(board, 'W');
    const blackMoves = this.getAllLegalMoves(board, 'B');

    if (whiteMoves.length === 0) {
      return this.isKingInCheck(board, 'W') ? 'B' : 'draw';
    }
    if (blackMoves.length === 0) {
      return this.isKingInCheck(board, 'B') ? 'W' : 'draw';
    }

    if (this.isInsufficientMaterial(board)) return 'draw';

    return null;
  }

  // ===== DIFFICULTY STRATEGIES =====

  private getEasyMove(moves: ChessMove[]): ChessMove {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  private getMediumMove(board: ChessBoard, moves: ChessMove[]): ChessMove {
    const result = this.minimax(board, 2, -Infinity, Infinity, true, this.aiColor);
    return result.move || moves[0];
  }

  private getHardMove(board: ChessBoard, moves: ChessMove[]): ChessMove {
    const result = this.minimax(board, 4, -Infinity, Infinity, true, this.aiColor);
    return result.move || moves[0];
  }

  private minimax(
    board: ChessBoard,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    currentColor: 'W' | 'B'
  ): { score: number; move: ChessMove | null } {
    const moves = this.getAllLegalMoves(board, currentColor);

    if (moves.length === 0) {
      if (this.isKingInCheck(board, currentColor)) {
        return { score: isMaximizing ? -50000 + (4 - depth) : 50000 - (4 - depth), move: null };
      }
      return { score: 0, move: null }; // Stalemate
    }

    if (depth === 0) {
      return { score: this.evaluateBoard(board), move: null };
    }

    // Move ordering for better pruning
    const orderedMoves = this.orderMoves(board, moves, currentColor);
    const nextColor = currentColor === 'W' ? 'B' : 'W';

    if (isMaximizing) {
      let maxScore = -Infinity;
      let bestMove = orderedMoves[0];

      for (const move of orderedMoves) {
        const newBoard = this.applyMove(board, move);
        const result = this.minimax(newBoard, depth - 1, alpha, beta, false, nextColor);

        if (result.score > maxScore) {
          maxScore = result.score;
          bestMove = move;
        }
        alpha = Math.max(alpha, result.score);
        if (beta <= alpha) break;
      }

      return { score: maxScore, move: bestMove };
    } else {
      let minScore = Infinity;
      let bestMove = orderedMoves[0];

      for (const move of orderedMoves) {
        const newBoard = this.applyMove(board, move);
        const result = this.minimax(newBoard, depth - 1, alpha, beta, true, nextColor);

        if (result.score < minScore) {
          minScore = result.score;
          bestMove = move;
        }
        beta = Math.min(beta, result.score);
        if (beta <= alpha) break;
      }

      return { score: minScore, move: bestMove };
    }
  }

  private evaluateBoard(board: ChessBoard): number {
    let score = 0;
    let wBishops = 0;
    let bBishops = 0;
    let wMobility = 0;
    let bMobility = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        const color = piece[0] === 'w' ? 'W' : 'B';
        const type = piece[1];
        const isAI = color === this.aiColor;
        const multiplier = isAI ? 1 : -1;

        // Material
        let value = PIECE_VALUES[type] || 0;

        // Piece-square table bonus
        const pst = PST[type];
        if (pst) {
          const pstRow = color === 'W' ? row : 7 - row;
          value += pst[pstRow][col];
        }

        score += value * multiplier;

        if (type === 'B') {
          if (color === 'W') wBishops++;
          else bBishops++;
        }
      }
    }

    // Bishop pair bonus
    if (wBishops >= 2) score += (this.aiColor === 'W' ? 50 : -50);
    if (bBishops >= 2) score += (this.aiColor === 'B' ? 50 : -50);

    // Mobility (count legal moves)
    wMobility = this.getAllLegalMoves(board, 'W').length;
    bMobility = this.getAllLegalMoves(board, 'B').length;
    score += (this.aiColor === 'W' ? 1 : -1) * (wMobility - bMobility) * 2;

    return score;
  }

  private orderMoves(board: ChessBoard, moves: ChessMove[], color: 'W' | 'B'): ChessMove[] {
    return moves.map(move => {
      let priority = 0;
      const target = board[move.toRow][move.toCol];
      const piece = board[move.fromRow][move.fromCol];

      // MVV-LVA: most valuable victim - least valuable attacker
      if (target) {
        const victimVal = PIECE_VALUES[target[1]] || 0;
        const attackerVal = PIECE_VALUES[piece![1]] || 0;
        priority += victimVal * 10 - attackerVal;
      }

      // Pawn promotion
      if (piece && piece[1] === 'P' && (move.toRow === 0 || move.toRow === 7)) {
        priority += 800;
      }

      // Check bonus
      const newBoard = this.applyMove(board, move);
      const opponent = color === 'W' ? 'B' : 'W';
      if (this.isKingInCheck(newBoard, opponent)) {
        priority += 200;
      }

      return { move, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .map(item => item.move);
  }

  // ===== MOVE GENERATION =====

  getAllLegalMoves(board: ChessBoard, color: 'W' | 'B'): ChessMove[] {
    const moves: ChessMove[] = [];
    const c = color.toLowerCase();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece[0] === c) {
          const pseudoMoves = this.getPseudoLegalMoves(board, row, col);
          for (const m of pseudoMoves) {
            if (this.isMoveLegal(board, row, col, m.toRow, m.toCol, color)) {
              moves.push({ fromRow: row, fromCol: col, toRow: m.toRow, toCol: m.toCol });
            }
          }
        }
      }
    }

    return moves;
  }

  private getPseudoLegalMoves(board: ChessBoard, row: number, col: number): { toRow: number; toCol: number }[] {
    const piece = board[row][col];
    if (!piece) return [];

    const color = piece[0] === 'w' ? 'W' : 'B';
    const type = piece[1];
    const moves: { toRow: number; toCol: number }[] = [];

    switch (type) {
      case 'P': this.getPawnMoves(board, row, col, color, moves); break;
      case 'R': this.getSlidingMoves(board, row, col, color, [[0,1],[0,-1],[1,0],[-1,0]], moves); break;
      case 'N': this.getKnightMoves(board, row, col, color, moves); break;
      case 'B': this.getSlidingMoves(board, row, col, color, [[1,1],[1,-1],[-1,1],[-1,-1]], moves); break;
      case 'Q': this.getSlidingMoves(board, row, col, color, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]], moves); break;
      case 'K': this.getKingMoves(board, row, col, color, moves); break;
    }

    return moves;
  }

  private getPawnMoves(board: ChessBoard, row: number, col: number, color: 'W' | 'B', moves: { toRow: number; toCol: number }[]): void {
    const dir = color === 'W' ? -1 : 1;
    const startRow = color === 'W' ? 6 : 1;

    if (this.isValid(row + dir, col) && !board[row + dir][col]) {
      moves.push({ toRow: row + dir, toCol: col });
      if (row === startRow && !board[row + 2 * dir][col]) {
        moves.push({ toRow: row + 2 * dir, toCol: col });
      }
    }

    for (const dc of [-1, 1]) {
      const nr = row + dir;
      const nc = col + dc;
      if (this.isValid(nr, nc)) {
        if (board[nr][nc] && board[nr][nc]![0] !== color.toLowerCase()) {
          moves.push({ toRow: nr, toCol: nc });
        }
        if (this.state.enPassantTarget && nr === this.state.enPassantTarget.row && nc === this.state.enPassantTarget.col) {
          moves.push({ toRow: nr, toCol: nc });
        }
      }
    }
  }

  private getSlidingMoves(board: ChessBoard, row: number, col: number, color: 'W' | 'B', directions: number[][], moves: { toRow: number; toCol: number }[]): void {
    const c = color.toLowerCase();
    for (const [dr, dc] of directions) {
      let r = row + dr;
      let cc = col + dc;
      while (this.isValid(r, cc)) {
        if (board[r][cc]) {
          if (board[r][cc]![0] !== c) moves.push({ toRow: r, toCol: cc });
          break;
        }
        moves.push({ toRow: r, toCol: cc });
        r += dr;
        cc += dc;
      }
    }
  }

  private getKnightMoves(board: ChessBoard, row: number, col: number, color: 'W' | 'B', moves: { toRow: number; toCol: number }[]): void {
    const c = color.toLowerCase();
    const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of offsets) {
      const r = row + dr;
      const cc = col + dc;
      if (this.isValid(r, cc) && (!board[r][cc] || board[r][cc]![0] !== c)) {
        moves.push({ toRow: r, toCol: cc });
      }
    }
  }

  private getKingMoves(board: ChessBoard, row: number, col: number, color: 'W' | 'B', moves: { toRow: number; toCol: number }[]): void {
    const c = color.toLowerCase();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const cc = col + dc;
        if (this.isValid(r, cc) && (!board[r][cc] || board[r][cc]![0] !== c)) {
          moves.push({ toRow: r, toCol: cc });
        }
      }
    }

    // Castling
    const homeRow = color === 'W' ? 7 : 0;
    if (row === homeRow && col === 4 && !this.isKingInCheck(board, color)) {
      const rights = this.state.castlingRights[color];
      if (rights.kingSide &&
          !board[homeRow][5] && !board[homeRow][6] &&
          board[homeRow][7] && board[homeRow][7]![1] === 'R' &&
          !this.isSquareAttacked(board, homeRow, 5, color) &&
          !this.isSquareAttacked(board, homeRow, 6, color)) {
        moves.push({ toRow: homeRow, toCol: 6 });
      }
      if (rights.queenSide &&
          !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] &&
          board[homeRow][0] && board[homeRow][0]![1] === 'R' &&
          !this.isSquareAttacked(board, homeRow, 2, color) &&
          !this.isSquareAttacked(board, homeRow, 3, color)) {
        moves.push({ toRow: homeRow, toCol: 2 });
      }
    }
  }

  // ===== HELPERS =====

  private isValid(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  private isSquareAttacked(board: ChessBoard, row: number, col: number, color: 'W' | 'B'): boolean {
    const opponent = color === 'W' ? 'b' : 'w';

    // Pawn attacks
    const pawnDir = color === 'W' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const pr = row + pawnDir;
      const pc = col + dc;
      if (this.isValid(pr, pc) && board[pr][pc] === opponent + 'P') return true;
    }

    // Knight attacks
    const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of knightOffsets) {
      const r = row + dr;
      const c = col + dc;
      if (this.isValid(r, c) && board[r][c] === opponent + 'N') return true;
    }

    // King attacks
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (this.isValid(r, c) && board[r][c] === opponent + 'K') return true;
      }
    }

    // Straight sliding (rook/queen)
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      let r = row + dr;
      let c = col + dc;
      while (this.isValid(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p === opponent + 'R' || p === opponent + 'Q') return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // Diagonal sliding (bishop/queen)
    for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      let r = row + dr;
      let c = col + dc;
      while (this.isValid(r, c)) {
        const p = board[r][c];
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

  private findKing(board: ChessBoard, color: 'W' | 'B'): { row: number; col: number } | null {
    const king = color.toLowerCase() + 'K';
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === king) return { row: r, col: c };
      }
    }
    return null;
  }

  isKingInCheck(board: ChessBoard, color: 'W' | 'B'): boolean {
    const king = this.findKing(board, color);
    if (!king) return false;
    return this.isSquareAttacked(board, king.row, king.col, color);
  }

  private isMoveLegal(board: ChessBoard, fromRow: number, fromCol: number, toRow: number, toCol: number, color: 'W' | 'B'): boolean {
    const piece = board[fromRow][fromCol];
    if (!piece) return false;
    const captured = board[toRow][toCol];
    const type = piece[1];

    // Simulate
    let enPassantCapture: { row: number; col: number; piece: string | null } | null = null;
    if (type === 'P' && this.state.enPassantTarget &&
        toRow === this.state.enPassantTarget.row && toCol === this.state.enPassantTarget.col) {
      const capturedPawnRow = color === 'W' ? toRow + 1 : toRow - 1;
      enPassantCapture = { row: capturedPawnRow, col: toCol, piece: board[capturedPawnRow][toCol] };
      board[capturedPawnRow][toCol] = null;
    }

    let rookMove: { from: { row: number; col: number }; to: { row: number; col: number } } | null = null;
    if (type === 'K' && Math.abs(toCol - fromCol) === 2) {
      if (toCol > fromCol) {
        rookMove = { from: { row: fromRow, col: 7 }, to: { row: fromRow, col: 5 } };
      } else {
        rookMove = { from: { row: fromRow, col: 0 }, to: { row: fromRow, col: 3 } };
      }
      board[rookMove.to.row][rookMove.to.col] = board[rookMove.from.row][rookMove.from.col];
      board[rookMove.from.row][rookMove.from.col] = null;
    }

    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = null;

    const inCheck = this.isKingInCheck(board, color);

    // Undo
    board[fromRow][fromCol] = piece;
    board[toRow][toCol] = captured;

    if (enPassantCapture) {
      board[enPassantCapture.row][enPassantCapture.col] = enPassantCapture.piece;
    }
    if (rookMove) {
      board[rookMove.from.row][rookMove.from.col] = board[rookMove.to.row][rookMove.to.col];
      board[rookMove.to.row][rookMove.to.col] = null;
    }

    return !inCheck;
  }

  private applyMove(board: ChessBoard, move: ChessMove): ChessBoard {
    const newBoard = board.map(row => [...row]) as ChessBoard;
    const piece = newBoard[move.fromRow][move.fromCol];
    if (!piece) return newBoard;

    const color = piece[0] === 'w' ? 'W' : 'B';
    const type = piece[1];

    // En passant capture
    if (type === 'P' && this.state.enPassantTarget &&
        move.toRow === this.state.enPassantTarget.row && move.toCol === this.state.enPassantTarget.col) {
      const capturedPawnRow = color === 'W' ? move.toRow + 1 : move.toRow - 1;
      newBoard[capturedPawnRow][move.toCol] = null;
    }

    // Castling
    if (type === 'K' && Math.abs(move.toCol - move.fromCol) === 2) {
      if (move.toCol > move.fromCol) {
        newBoard[move.fromRow][5] = newBoard[move.fromRow][7];
        newBoard[move.fromRow][7] = null;
      } else {
        newBoard[move.fromRow][3] = newBoard[move.fromRow][0];
        newBoard[move.fromRow][0] = null;
      }
    }

    newBoard[move.toRow][move.toCol] = piece;
    newBoard[move.fromRow][move.fromCol] = null;

    // Promotion (always queen for AI simulation)
    if (type === 'P' && (move.toRow === 0 || move.toRow === 7)) {
      newBoard[move.toRow][move.toCol] = piece[0] + 'Q';
    }

    return newBoard;
  }

  private isInsufficientMaterial(board: ChessBoard): boolean {
    const pieces: { w: string[]; b: string[] } = { w: [], b: [] };
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (p) pieces[p[0] as 'w' | 'b'].push(p[1]);
      }
    }

    const w = pieces.w.filter(t => t !== 'K');
    const b = pieces.b.filter(t => t !== 'K');

    if (w.length === 0 && b.length === 0) return true;
    if (w.length === 0 && b.length === 1 && (b[0] === 'B' || b[0] === 'N')) return true;
    if (b.length === 0 && w.length === 1 && (w[0] === 'B' || w[0] === 'N')) return true;

    return false;
  }
}
