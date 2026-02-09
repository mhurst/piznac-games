import { Injectable } from '@angular/core';
import { Difficulty, GameAI } from './game-ai.interface';

export type ConnectFourBoard = (string | null)[][];  // 6 rows x 7 cols
export type ConnectFourMove = number;  // Column index 0-6

const ROWS = 6;
const COLS = 7;
const WIN_LENGTH = 4;

@Injectable({
  providedIn: 'root'
})
export class ConnectFourAI implements GameAI<ConnectFourBoard, ConnectFourMove> {
  private aiSymbol: 'R' | 'Y' = 'Y';
  private playerSymbol: 'R' | 'Y' = 'R';

  setSymbols(aiSymbol: 'R' | 'Y'): void {
    this.aiSymbol = aiSymbol;
    this.playerSymbol = aiSymbol === 'R' ? 'Y' : 'R';
  }

  getMove(board: ConnectFourBoard, difficulty: Difficulty): ConnectFourMove {
    const validColumns = this.getValidColumns(board);
    if (validColumns.length === 0) return -1;

    switch (difficulty) {
      case 'easy':
        return this.getEasyMove(validColumns);
      case 'medium':
        return this.getMediumMove(board, validColumns);
      case 'hard':
        return this.getHardMove(board);
    }
  }

  checkGameOver(board: ConnectFourBoard): string | 'draw' | null {
    const winner = this.checkWinner(board);
    if (winner) return winner;
    if (this.isBoardFull(board)) return 'draw';
    return null;
  }

  getWinningLine(board: ConnectFourBoard): { row: number; col: number }[] | null {
    const directions = [
      { dr: 0, dc: 1 },   // horizontal
      { dr: 1, dc: 0 },   // vertical
      { dr: 1, dc: 1 },   // diagonal down-right
      { dr: 1, dc: -1 }   // diagonal down-left
    ];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const symbol = board[row][col];
        if (!symbol) continue;

        for (const { dr, dc } of directions) {
          const line = this.getLineFromPosition(board, row, col, dr, dc, symbol);
          if (line.length >= WIN_LENGTH) {
            return line.slice(0, WIN_LENGTH);
          }
        }
      }
    }
    return null;
  }

  // ===== DIFFICULTY STRATEGIES =====

  // Easy: Random valid column
  private getEasyMove(validColumns: number[]): number {
    return validColumns[Math.floor(Math.random() * validColumns.length)];
  }

  // Medium: Win/block + center preference
  private getMediumMove(board: ConnectFourBoard, validColumns: number[]): number {
    // Try to win
    const winMove = this.findWinningMove(board, this.aiSymbol);
    if (winMove !== -1) return winMove;

    // Block player from winning
    const blockMove = this.findWinningMove(board, this.playerSymbol);
    if (blockMove !== -1) return blockMove;

    // Prefer center columns (3, 2, 4, 1, 5, 0, 6)
    const centerPreference = [3, 2, 4, 1, 5, 0, 6];
    for (const col of centerPreference) {
      if (validColumns.includes(col)) {
        return col;
      }
    }

    return this.getEasyMove(validColumns);
  }

  // Hard: Minimax with alpha-beta pruning
  private getHardMove(board: ConnectFourBoard): number {
    const maxDepth = 7;  // Limit depth for performance
    const result = this.minimax(board, maxDepth, -Infinity, Infinity, true);
    return result.move;
  }

  private minimax(
    board: ConnectFourBoard,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): { score: number; move: number } {
    const winner = this.checkWinner(board);
    if (winner === this.aiSymbol) return { score: 1000 + depth, move: -1 };
    if (winner === this.playerSymbol) return { score: -1000 - depth, move: -1 };

    const validColumns = this.getValidColumns(board);
    if (validColumns.length === 0 || depth === 0) {
      return { score: this.evaluateBoard(board), move: -1 };
    }

    // Order columns by center preference for better pruning
    const orderedColumns = this.orderColumnsByCenter(validColumns);

    if (isMaximizing) {
      let maxScore = -Infinity;
      let bestMove = orderedColumns[0];

      for (const col of orderedColumns) {
        const newBoard = this.makeMove(board, col, this.aiSymbol);
        const result = this.minimax(newBoard, depth - 1, alpha, beta, false);

        if (result.score > maxScore) {
          maxScore = result.score;
          bestMove = col;
        }
        alpha = Math.max(alpha, result.score);
        if (beta <= alpha) break;  // Prune
      }

      return { score: maxScore, move: bestMove };
    } else {
      let minScore = Infinity;
      let bestMove = orderedColumns[0];

      for (const col of orderedColumns) {
        const newBoard = this.makeMove(board, col, this.playerSymbol);
        const result = this.minimax(newBoard, depth - 1, alpha, beta, true);

        if (result.score < minScore) {
          minScore = result.score;
          bestMove = col;
        }
        beta = Math.min(beta, result.score);
        if (beta <= alpha) break;  // Prune
      }

      return { score: minScore, move: bestMove };
    }
  }

  // Heuristic evaluation for non-terminal states
  private evaluateBoard(board: ConnectFourBoard): number {
    let score = 0;

    // Evaluate center column (most valuable)
    const centerCol = 3;
    let centerCount = 0;
    for (let row = 0; row < ROWS; row++) {
      if (board[row][centerCol] === this.aiSymbol) centerCount++;
    }
    score += centerCount * 3;

    // Evaluate all windows of 4
    score += this.evaluateWindows(board);

    return score;
  }

  private evaluateWindows(board: ConnectFourBoard): number {
    let score = 0;

    // Horizontal windows
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col <= COLS - WIN_LENGTH; col++) {
        const window = [0, 1, 2, 3].map(i => board[row][col + i]);
        score += this.evaluateWindow(window);
      }
    }

    // Vertical windows
    for (let row = 0; row <= ROWS - WIN_LENGTH; row++) {
      for (let col = 0; col < COLS; col++) {
        const window = [0, 1, 2, 3].map(i => board[row + i][col]);
        score += this.evaluateWindow(window);
      }
    }

    // Diagonal down-right windows
    for (let row = 0; row <= ROWS - WIN_LENGTH; row++) {
      for (let col = 0; col <= COLS - WIN_LENGTH; col++) {
        const window = [0, 1, 2, 3].map(i => board[row + i][col + i]);
        score += this.evaluateWindow(window);
      }
    }

    // Diagonal down-left windows
    for (let row = 0; row <= ROWS - WIN_LENGTH; row++) {
      for (let col = WIN_LENGTH - 1; col < COLS; col++) {
        const window = [0, 1, 2, 3].map(i => board[row + i][col - i]);
        score += this.evaluateWindow(window);
      }
    }

    return score;
  }

  private evaluateWindow(window: (string | null)[]): number {
    const aiCount = window.filter(c => c === this.aiSymbol).length;
    const playerCount = window.filter(c => c === this.playerSymbol).length;
    const emptyCount = window.filter(c => c === null).length;

    // Only score windows that one player can still win
    if (aiCount > 0 && playerCount > 0) return 0;

    if (aiCount === 4) return 100;
    if (aiCount === 3 && emptyCount === 1) return 5;
    if (aiCount === 2 && emptyCount === 2) return 2;

    if (playerCount === 4) return -100;
    if (playerCount === 3 && emptyCount === 1) return -4;

    return 0;
  }

  private orderColumnsByCenter(columns: number[]): number[] {
    const centerOrder = [3, 2, 4, 1, 5, 0, 6];
    return centerOrder.filter(col => columns.includes(col));
  }

  // ===== HELPERS =====

  private findWinningMove(board: ConnectFourBoard, symbol: string): number {
    for (const col of this.getValidColumns(board)) {
      const newBoard = this.makeMove(board, col, symbol);
      if (this.checkWinner(newBoard) === symbol) {
        return col;
      }
    }
    return -1;
  }

  private makeMove(board: ConnectFourBoard, col: number, symbol: string): ConnectFourBoard {
    const newBoard = board.map(row => [...row]);
    const row = this.getLowestEmptyRow(newBoard, col);
    if (row !== -1) {
      newBoard[row][col] = symbol;
    }
    return newBoard;
  }

  private getLowestEmptyRow(board: ConnectFourBoard, col: number): number {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === null) {
        return row;
      }
    }
    return -1;
  }

  private getValidColumns(board: ConnectFourBoard): number[] {
    const valid: number[] = [];
    for (let col = 0; col < COLS; col++) {
      if (board[0][col] === null) {
        valid.push(col);
      }
    }
    return valid;
  }

  private checkWinner(board: ConnectFourBoard): string | null {
    const directions = [
      { dr: 0, dc: 1 },
      { dr: 1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 }
    ];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const symbol = board[row][col];
        if (!symbol) continue;

        for (const { dr, dc } of directions) {
          if (this.checkDirection(board, row, col, dr, dc, symbol)) {
            return symbol;
          }
        }
      }
    }
    return null;
  }

  private checkDirection(
    board: ConnectFourBoard,
    row: number,
    col: number,
    dr: number,
    dc: number,
    symbol: string
  ): boolean {
    for (let i = 0; i < WIN_LENGTH; i++) {
      const r = row + i * dr;
      const c = col + i * dc;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== symbol) {
        return false;
      }
    }
    return true;
  }

  private getLineFromPosition(
    board: ConnectFourBoard,
    row: number,
    col: number,
    dr: number,
    dc: number,
    symbol: string
  ): { row: number; col: number }[] {
    const line: { row: number; col: number }[] = [];
    let r = row;
    let c = col;

    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === symbol) {
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }

    return line;
  }

  private isBoardFull(board: ConnectFourBoard): boolean {
    return board[0].every(cell => cell !== null);
  }
}
