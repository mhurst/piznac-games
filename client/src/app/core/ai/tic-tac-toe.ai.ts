import { Injectable } from '@angular/core';
import { Difficulty, GameAI } from './game-ai.interface';

export type TicTacToeBoard = (string | null)[];
export type TicTacToeMove = number; // Cell index 0-8

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6]             // diagonals
];

@Injectable({
  providedIn: 'root'
})
export class TicTacToeAI implements GameAI<TicTacToeBoard, TicTacToeMove> {
  private aiSymbol: 'X' | 'O' = 'O';
  private playerSymbol: 'X' | 'O' = 'X';

  setSymbols(aiSymbol: 'X' | 'O'): void {
    this.aiSymbol = aiSymbol;
    this.playerSymbol = aiSymbol === 'X' ? 'O' : 'X';
  }

  getMove(board: TicTacToeBoard, difficulty: Difficulty): TicTacToeMove {
    const emptySquares = this.getEmptySquares(board);
    if (emptySquares.length === 0) return -1;

    switch (difficulty) {
      case 'easy':
        return this.getEasyMove(emptySquares);
      case 'medium':
        return this.getMediumMove(board, emptySquares);
      case 'hard':
        return this.getHardMove(board);
    }
  }

  checkGameOver(board: TicTacToeBoard): string | 'draw' | null {
    const winner = this.checkWinner(board);
    if (winner) return winner;
    if (this.isDraw(board)) return 'draw';
    return null;
  }

  getWinningLine(board: TicTacToeBoard): number[] | null {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return line;
      }
    }
    return null;
  }

  // ===== DIFFICULTY STRATEGIES =====

  // Easy: Random move
  private getEasyMove(emptySquares: number[]): number {
    return emptySquares[Math.floor(Math.random() * emptySquares.length)];
  }

  // Medium: Block/take wins, otherwise random
  private getMediumMove(board: TicTacToeBoard, emptySquares: number[]): number {
    // Try to win
    const winMove = this.findWinningMove(board, this.aiSymbol);
    if (winMove !== -1) return winMove;

    // Block player from winning
    const blockMove = this.findWinningMove(board, this.playerSymbol);
    if (blockMove !== -1) return blockMove;

    // Take center if available
    if (board[4] === null) return 4;

    // Otherwise random
    return this.getEasyMove(emptySquares);
  }

  // Hard: Minimax algorithm (unbeatable)
  private getHardMove(board: TicTacToeBoard): number {
    const result = this.minimax(board, this.aiSymbol, 0);
    return result.move;
  }

  private minimax(
    board: TicTacToeBoard,
    currentPlayer: 'X' | 'O',
    depth: number
  ): { score: number; move: number } {
    // Check terminal states
    const winner = this.checkWinner(board);
    if (winner === this.aiSymbol) return { score: 10 - depth, move: -1 };
    if (winner === this.playerSymbol) return { score: depth - 10, move: -1 };

    const emptySquares = this.getEmptySquares(board);
    if (emptySquares.length === 0) return { score: 0, move: -1 };

    const isMaximizing = currentPlayer === this.aiSymbol;
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let bestMove = emptySquares[0];

    for (const square of emptySquares) {
      // Make move
      const newBoard = [...board];
      newBoard[square] = currentPlayer;

      // Recurse
      const nextPlayer = currentPlayer === 'X' ? 'O' : 'X';
      const result = this.minimax(newBoard, nextPlayer, depth + 1);

      // Update best
      if (isMaximizing) {
        if (result.score > bestScore) {
          bestScore = result.score;
          bestMove = square;
        }
      } else {
        if (result.score < bestScore) {
          bestScore = result.score;
          bestMove = square;
        }
      }
    }

    return { score: bestScore, move: bestMove };
  }

  // ===== HELPERS =====

  private findWinningMove(board: TicTacToeBoard, symbol: string): number {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      const values = [board[a], board[b], board[c]];
      const symbolCount = values.filter(v => v === symbol).length;
      const emptyCount = values.filter(v => v === null).length;

      if (symbolCount === 2 && emptyCount === 1) {
        if (board[a] === null) return a;
        if (board[b] === null) return b;
        if (board[c] === null) return c;
      }
    }
    return -1;
  }

  private getEmptySquares(board: TicTacToeBoard): number[] {
    return board.reduce<number[]>((acc, val, idx) => {
      if (val === null) acc.push(idx);
      return acc;
    }, []);
  }

  private checkWinner(board: TicTacToeBoard): string | null {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  private isDraw(board: TicTacToeBoard): boolean {
    return !this.checkWinner(board) && this.getEmptySquares(board).length === 0;
  }
}
