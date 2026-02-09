import { Injectable } from '@angular/core';
import { Difficulty, GameAI } from './game-ai.interface';

// null = empty, 'r' = red piece, 'R' = red king, 'b' = black piece, 'B' = black king
export type CheckersBoard = (null | 'r' | 'R' | 'b' | 'B')[][];

export interface CheckersMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

const BOARD_SIZE = 8;

@Injectable({
  providedIn: 'root'
})
export class CheckersAI implements GameAI<CheckersBoard, CheckersMove> {
  private aiSymbol: 'R' | 'B' = 'B';
  private playerSymbol: 'R' | 'B' = 'R';

  setSymbols(aiSymbol: 'R' | 'B'): void {
    this.aiSymbol = aiSymbol;
    this.playerSymbol = aiSymbol === 'R' ? 'B' : 'R';
  }

  getMove(board: CheckersBoard, difficulty: Difficulty): CheckersMove {
    const allMoves = this.getAllValidMoves(board, this.aiSymbol);
    if (allMoves.moves.length === 0) {
      return { fromRow: -1, fromCol: -1, toRow: -1, toCol: -1 };
    }

    switch (difficulty) {
      case 'easy':
        return this.getEasyMove(allMoves.moves);
      case 'medium':
        return this.getMediumMove(board, allMoves);
      case 'hard':
        return this.getHardMove(board);
    }
  }

  checkGameOver(board: CheckersBoard): string | 'draw' | null {
    let redPieces = 0;
    let blackPieces = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece === 'r' || piece === 'R') redPieces++;
        if (piece === 'b' || piece === 'B') blackPieces++;
      }
    }

    if (redPieces === 0) return 'B';
    if (blackPieces === 0) return 'R';

    // Check if each player has valid moves
    const redMoves = this.getAllValidMoves(board, 'R');
    const blackMoves = this.getAllValidMoves(board, 'B');

    if (redMoves.moves.length === 0) return 'B';
    if (blackMoves.moves.length === 0) return 'R';

    return null;
  }

  // ===== DIFFICULTY STRATEGIES =====

  private getEasyMove(moves: CheckersMove[]): CheckersMove {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  private getMediumMove(
    board: CheckersBoard,
    allMoves: { moves: CheckersMove[]; mustCapture: boolean }
  ): CheckersMove {
    const { moves, mustCapture } = allMoves;

    // 1. If we must capture, prefer multi-captures
    if (mustCapture) {
      const captureScores = moves.map(move => {
        const newBoard = this.applyMove(board, move);
        return {
          move,
          score: this.countChainCaptures(newBoard, move.toRow, move.toCol, this.aiSymbol)
        };
      });
      captureScores.sort((a, b) => b.score - a.score);
      if (captureScores[0].score > 0) {
        return captureScores[0].move;
      }
    }

    // 2. Prefer king creation moves
    const kingMoves = moves.filter(move => this.wouldPromote(move, this.aiSymbol));
    if (kingMoves.length > 0) {
      return kingMoves[Math.floor(Math.random() * kingMoves.length)];
    }

    // 3. Prefer moves that advance toward promotion
    const scoredMoves = moves.map(move => {
      const piece = board[move.fromRow][move.fromCol];
      const isKing = piece === 'R' || piece === 'B';
      let score = 0;

      if (!isKing) {
        // Advancing toward promotion
        if (this.aiSymbol === 'R') {
          score = move.toRow - move.fromRow;  // Red moves down
        } else {
          score = move.fromRow - move.toRow;  // Black moves up
        }
      }

      // Bonus for staying on edges (safer)
      if (move.toCol === 0 || move.toCol === 7) {
        score += 0.5;
      }

      return { move, score };
    });

    scoredMoves.sort((a, b) => b.score - a.score);

    // Pick from top moves with some randomness
    const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
    return topMoves[Math.floor(Math.random() * topMoves.length)].move;
  }

  private getHardMove(board: CheckersBoard): CheckersMove {
    const maxDepth = 6;
    const result = this.minimax(board, maxDepth, -Infinity, Infinity, true, this.aiSymbol);
    return result.move!;
  }

  private minimax(
    board: CheckersBoard,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    currentPlayer: 'R' | 'B'
  ): { score: number; move: CheckersMove | null } {
    const gameOver = this.checkGameOver(board);
    if (gameOver) {
      if (gameOver === this.aiSymbol) return { score: 1000 + depth, move: null };
      if (gameOver === this.playerSymbol) return { score: -1000 - depth, move: null };
      return { score: 0, move: null };  // Draw (shouldn't happen in checkers)
    }

    if (depth === 0) {
      return { score: this.evaluateBoard(board), move: null };
    }

    const { moves } = this.getAllValidMoves(board, currentPlayer);
    if (moves.length === 0) {
      // No moves = lose
      return {
        score: isMaximizing ? -1000 - depth : 1000 + depth,
        move: null
      };
    }

    // Order moves for better pruning (captures first, then king moves)
    const orderedMoves = this.orderMoves(board, moves, currentPlayer);
    const nextPlayer = currentPlayer === 'R' ? 'B' : 'R';

    if (isMaximizing) {
      let maxScore = -Infinity;
      let bestMove = orderedMoves[0];

      for (const move of orderedMoves) {
        const newBoard = this.applyMoveWithChain(board, move, currentPlayer);
        const result = this.minimax(newBoard, depth - 1, alpha, beta, false, nextPlayer);

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
        const newBoard = this.applyMoveWithChain(board, move, currentPlayer);
        const result = this.minimax(newBoard, depth - 1, alpha, beta, true, nextPlayer);

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

  private evaluateBoard(board: CheckersBoard): number {
    let score = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        const isAI = piece.toUpperCase() === this.aiSymbol;
        const isKing = piece === 'R' || piece === 'B';
        const multiplier = isAI ? 1 : -1;

        // Base piece value
        let pieceValue = isKing ? 3 : 1;

        // Advancement bonus for regular pieces
        if (!isKing) {
          if (piece.toUpperCase() === 'R') {
            pieceValue += row * 0.1;  // Red advances down
          } else {
            pieceValue += (7 - row) * 0.1;  // Black advances up
          }
        }

        // Edge safety bonus
        if (col === 0 || col === 7) {
          pieceValue += 0.2;
        }

        // Back row protection (only for regular pieces)
        if (!isKing) {
          if ((piece === 'r' && row === 0) || (piece === 'b' && row === 7)) {
            pieceValue += 0.3;
          }
        }

        // Center control for kings
        if (isKing && row >= 2 && row <= 5 && col >= 2 && col <= 5) {
          pieceValue += 0.2;
        }

        score += pieceValue * multiplier;
      }
    }

    return score;
  }

  private orderMoves(
    board: CheckersBoard,
    moves: CheckersMove[],
    playerSymbol: 'R' | 'B'
  ): CheckersMove[] {
    return moves.map(move => {
      let priority = 0;

      // Captures have highest priority
      if (this.isCaptureMove(move)) {
        priority += 100;
        // Chain captures are even better
        const newBoard = this.applyMove(board, move);
        priority += this.countChainCaptures(newBoard, move.toRow, move.toCol, playerSymbol) * 50;
      }

      // King creation moves are good
      if (this.wouldPromote(move, playerSymbol)) {
        priority += 30;
      }

      return { move, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .map(item => item.move);
  }

  // ===== MOVE GENERATION =====

  getAllValidMoves(
    board: CheckersBoard,
    playerSymbol: 'R' | 'B'
  ): { moves: CheckersMove[]; mustCapture: boolean } {
    const captures = this.getAllCaptureMoves(board, playerSymbol);
    if (captures.length > 0) {
      return { moves: captures, mustCapture: true };
    }

    const regularMoves: CheckersMove[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (this.isPlayerPiece(piece, playerSymbol)) {
          const pieceMoves = this.getRegularMovesForPiece(board, row, col, piece!);
          regularMoves.push(...pieceMoves.map(m => ({ fromRow: row, fromCol: col, ...m })));
        }
      }
    }

    return { moves: regularMoves, mustCapture: false };
  }

  private getAllCaptureMoves(board: CheckersBoard, playerSymbol: 'R' | 'B'): CheckersMove[] {
    const captures: CheckersMove[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (this.isPlayerPiece(piece, playerSymbol)) {
          const pieceCaptures = this.getCaptureMoves(board, row, col, piece!);
          captures.push(...pieceCaptures.map(m => ({ fromRow: row, fromCol: col, ...m })));
        }
      }
    }
    return captures;
  }

  private getCaptureMoves(
    board: CheckersBoard,
    row: number,
    col: number,
    piece: 'r' | 'R' | 'b' | 'B'
  ): { toRow: number; toCol: number }[] {
    const captures: { toRow: number; toCol: number }[] = [];
    const playerSymbol = piece.toUpperCase() as 'R' | 'B';
    const isKing = piece === 'R' || piece === 'B';

    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : playerSymbol === 'R'
        ? [[1, -1], [1, 1]]  // Red moves down
        : [[-1, -1], [-1, 1]];  // Black moves up

    for (const [dr, dc] of directions) {
      const midRow = row + dr;
      const midCol = col + dc;
      const endRow = row + 2 * dr;
      const endCol = col + 2 * dc;

      if (this.isValidPosition(endRow, endCol)) {
        const midPiece = board[midRow][midCol];
        const endCell = board[endRow][endCol];

        if (midPiece && !this.isPlayerPiece(midPiece, playerSymbol) && endCell === null) {
          captures.push({ toRow: endRow, toCol: endCol });
        }
      }
    }

    return captures;
  }

  private getRegularMovesForPiece(
    board: CheckersBoard,
    row: number,
    col: number,
    piece: 'r' | 'R' | 'b' | 'B'
  ): { toRow: number; toCol: number }[] {
    const moves: { toRow: number; toCol: number }[] = [];
    const playerSymbol = piece.toUpperCase() as 'R' | 'B';
    const isKing = piece === 'R' || piece === 'B';

    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : playerSymbol === 'R'
        ? [[1, -1], [1, 1]]
        : [[-1, -1], [-1, 1]];

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;

      if (this.isValidPosition(newRow, newCol) && board[newRow][newCol] === null) {
        moves.push({ toRow: newRow, toCol: newCol });
      }
    }

    return moves;
  }

  // ===== HELPERS =====

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  private isPlayerPiece(piece: string | null, playerSymbol: 'R' | 'B'): boolean {
    if (!piece) return false;
    return piece.toUpperCase() === playerSymbol;
  }

  private isCaptureMove(move: CheckersMove): boolean {
    return Math.abs(move.toRow - move.fromRow) === 2;
  }

  private wouldPromote(move: CheckersMove, playerSymbol: 'R' | 'B'): boolean {
    if (playerSymbol === 'R' && move.toRow === 7) return true;
    if (playerSymbol === 'B' && move.toRow === 0) return true;
    return false;
  }

  private applyMove(board: CheckersBoard, move: CheckersMove): CheckersBoard {
    const newBoard = board.map(row => [...row]) as CheckersBoard;
    const piece = newBoard[move.fromRow][move.fromCol]!;
    const playerSymbol = piece.toUpperCase() as 'R' | 'B';

    newBoard[move.toRow][move.toCol] = piece;
    newBoard[move.fromRow][move.fromCol] = null;

    // Handle capture
    if (this.isCaptureMove(move)) {
      const midRow = (move.fromRow + move.toRow) / 2;
      const midCol = (move.fromCol + move.toCol) / 2;
      newBoard[midRow][midCol] = null;
    }

    // Handle promotion
    if (this.wouldPromote(move, playerSymbol)) {
      newBoard[move.toRow][move.toCol] = playerSymbol;
    }

    return newBoard;
  }

  private applyMoveWithChain(
    board: CheckersBoard,
    move: CheckersMove,
    playerSymbol: 'R' | 'B'
  ): CheckersBoard {
    let currentBoard = this.applyMove(board, move);

    // If it was a capture, check for chain captures
    if (this.isCaptureMove(move)) {
      const piece = currentBoard[move.toRow][move.toCol];
      // Don't chain if just promoted
      if (piece && !this.wouldPromote(move, playerSymbol)) {
        let furtherCaptures = this.getCaptureMoves(currentBoard, move.toRow, move.toCol, piece);
        while (furtherCaptures.length > 0) {
          const nextCapture = furtherCaptures[0];  // Take first available
          const chainMove: CheckersMove = {
            fromRow: move.toRow,
            fromCol: move.toCol,
            toRow: nextCapture.toRow,
            toCol: nextCapture.toCol
          };
          currentBoard = this.applyMove(currentBoard, chainMove);
          const newPiece = currentBoard[nextCapture.toRow][nextCapture.toCol];
          if (!newPiece) break;
          furtherCaptures = this.getCaptureMoves(
            currentBoard,
            nextCapture.toRow,
            nextCapture.toCol,
            newPiece
          );
        }
      }
    }

    return currentBoard;
  }

  private countChainCaptures(
    board: CheckersBoard,
    row: number,
    col: number,
    playerSymbol: 'R' | 'B'
  ): number {
    const piece = board[row][col];
    if (!piece) return 0;

    const captures = this.getCaptureMoves(board, row, col, piece);
    if (captures.length === 0) return 0;

    let maxChain = 0;
    for (const capture of captures) {
      const newBoard = this.applyMove(board, {
        fromRow: row,
        fromCol: col,
        toRow: capture.toRow,
        toCol: capture.toCol
      });
      const chainCount = 1 + this.countChainCaptures(
        newBoard,
        capture.toRow,
        capture.toCol,
        playerSymbol
      );
      maxChain = Math.max(maxChain, chainCount);
    }

    return maxChain;
  }
}
