import { Injectable } from '@angular/core';
import { GameAI, Difficulty } from './game-ai.interface';

// Board is a 14-element array: [0-5] P1 pits, [6] P1 store, [7-12] P2 pits, [13] P2 store
type MancalaBoard = number[];
// Move is a pit index (0-5 for P1, 7-12 for P2)
type MancalaMove = number;

interface SowResult {
  pits: number[];
  lastPit: number;
  extraTurn: boolean;
  captured: boolean;
}

@Injectable({ providedIn: 'root' })
export class MancalaAI implements GameAI<MancalaBoard, MancalaMove> {
  private aiPlayer: 1 | 2 = 2;

  setPlayer(player: 1 | 2): void {
    this.aiPlayer = player;
  }

  getMove(board: MancalaBoard, difficulty: Difficulty): MancalaMove {
    const validMoves = this.getValidMoves(board, this.aiPlayer);
    if (validMoves.length === 0) return -1;

    switch (difficulty) {
      case 'easy': return this.getEasyMove(validMoves);
      case 'medium': return this.getMediumMove(board, validMoves);
      case 'hard': return this.getHardMove(board);
    }
  }

  checkGameOver(board: MancalaBoard): string | 'draw' | null {
    const p1Empty = board.slice(0, 6).every(s => s === 0);
    const p2Empty = board.slice(7, 13).every(s => s === 0);

    if (!p1Empty && !p2Empty) return null;

    // Sweep remaining stones
    const p1Score = board[6] + (p1Empty ? 0 : board.slice(0, 6).reduce((a, b) => a + b, 0));
    const p2Score = board[13] + (p2Empty ? 0 : board.slice(7, 13).reduce((a, b) => a + b, 0));

    if (p1Score > p2Score) return 'P1';
    if (p2Score > p1Score) return 'P2';
    return 'draw';
  }

  private getValidMoves(board: MancalaBoard, player: 1 | 2): MancalaMove[] {
    const start = player === 1 ? 0 : 7;
    const end = player === 1 ? 5 : 12;
    const moves: MancalaMove[] = [];

    for (let i = start; i <= end; i++) {
      if (board[i] > 0) moves.push(i);
    }
    return moves;
  }

  private simulateSow(board: MancalaBoard, pitIndex: number, player: 1 | 2): SowResult {
    const pits = [...board];
    let stones = pits[pitIndex];
    pits[pitIndex] = 0;
    let current = pitIndex;
    const opponentStore = player === 1 ? 13 : 6;

    while (stones > 0) {
      current = (current + 1) % 14;
      if (current === opponentStore) continue; // Skip opponent's store
      pits[current]++;
      stones--;
    }

    const myStore = player === 1 ? 6 : 13;
    const extraTurn = current === myStore;

    // Check capture
    let captured = false;
    const myPitStart = player === 1 ? 0 : 7;
    const myPitEnd = player === 1 ? 5 : 12;

    if (!extraTurn && current >= myPitStart && current <= myPitEnd && pits[current] === 1) {
      const opposite = 12 - current;
      if (pits[opposite] > 0) {
        pits[myStore] += pits[opposite] + 1;
        pits[current] = 0;
        pits[opposite] = 0;
        captured = true;
      }
    }

    return { pits, lastPit: current, extraTurn, captured };
  }

  // Easy: random valid move
  private getEasyMove(validMoves: MancalaMove[]): MancalaMove {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  // Medium: prefer extra turns > captures > most stones in store
  private getMediumMove(board: MancalaBoard, validMoves: MancalaMove[]): MancalaMove {
    const myStore = this.aiPlayer === 1 ? 6 : 13;

    // Priority 1: extra turn
    const extraTurnMoves = validMoves.filter(m => {
      const result = this.simulateSow(board, m, this.aiPlayer);
      return result.extraTurn;
    });
    if (extraTurnMoves.length > 0) {
      return extraTurnMoves[Math.floor(Math.random() * extraTurnMoves.length)];
    }

    // Priority 2: capture
    const captureMoves = validMoves.filter(m => {
      const result = this.simulateSow(board, m, this.aiPlayer);
      return result.captured;
    });
    if (captureMoves.length > 0) {
      // Pick the capture that gives the most stones
      let bestCapture = captureMoves[0];
      let bestGain = 0;
      for (const m of captureMoves) {
        const result = this.simulateSow(board, m, this.aiPlayer);
        const gain = result.pits[myStore] - board[myStore];
        if (gain > bestGain) {
          bestGain = gain;
          bestCapture = m;
        }
      }
      return bestCapture;
    }

    // Priority 3: maximize store gain
    let bestMove = validMoves[0];
    let bestGain = -Infinity;
    for (const m of validMoves) {
      const result = this.simulateSow(board, m, this.aiPlayer);
      const gain = result.pits[myStore] - board[myStore];
      if (gain > bestGain) {
        bestGain = gain;
        bestMove = m;
      }
    }
    return bestMove;
  }

  // Hard: minimax with alpha-beta pruning
  private getHardMove(board: MancalaBoard): MancalaMove {
    const validMoves = this.getValidMoves(board, this.aiPlayer);
    if (validMoves.length === 0) return -1;

    let bestScore = -Infinity;
    let bestMove = validMoves[0];
    const depth = 10;

    for (const move of validMoves) {
      const result = this.simulateSow(board, move, this.aiPlayer);
      let score: number;

      if (result.extraTurn) {
        // Same player moves again — don't switch
        score = this.minimax(result.pits, depth - 1, -Infinity, Infinity, true);
      } else {
        score = this.minimax(result.pits, depth - 1, -Infinity, Infinity, false);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private minimax(
    board: MancalaBoard,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): number {
    // Terminal check
    const p1Empty = board.slice(0, 6).every(s => s === 0);
    const p2Empty = board.slice(7, 13).every(s => s === 0);

    if (p1Empty || p2Empty || depth === 0) {
      return this.evaluate(board, p1Empty, p2Empty);
    }

    const currentPlayer = isMaximizing ? this.aiPlayer : (this.aiPlayer === 1 ? 2 : 1);
    const validMoves = this.getValidMoves(board, currentPlayer);

    if (validMoves.length === 0) {
      return this.evaluate(board, true, true);
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of validMoves) {
        const result = this.simulateSow(board, move, currentPlayer);
        let evalScore: number;

        if (result.extraTurn) {
          evalScore = this.minimax(result.pits, depth - 1, alpha, beta, true);
        } else {
          evalScore = this.minimax(result.pits, depth - 1, alpha, beta, false);
        }

        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of validMoves) {
        const result = this.simulateSow(board, move, currentPlayer);
        let evalScore: number;

        if (result.extraTurn) {
          evalScore = this.minimax(result.pits, depth - 1, alpha, beta, false);
        } else {
          evalScore = this.minimax(result.pits, depth - 1, alpha, beta, true);
        }

        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  private evaluate(board: MancalaBoard, p1Empty: boolean, p2Empty: boolean): number {
    const pits = [...board];

    // Sweep remaining stones
    if (p1Empty) {
      for (let i = 7; i <= 12; i++) {
        pits[13] += pits[i];
        pits[i] = 0;
      }
    }
    if (p2Empty) {
      for (let i = 0; i <= 5; i++) {
        pits[6] += pits[i];
        pits[i] = 0;
      }
    }

    const myStore = this.aiPlayer === 1 ? 6 : 13;
    const oppStore = this.aiPlayer === 1 ? 13 : 6;
    const storeDiff = pits[myStore] - pits[oppStore];

    // Mobility: count stones on my side vs opponent's
    const myStart = this.aiPlayer === 1 ? 0 : 7;
    const oppStart = this.aiPlayer === 1 ? 7 : 0;
    let myStones = 0;
    let oppStones = 0;
    for (let i = 0; i < 6; i++) {
      myStones += pits[myStart + i];
      oppStones += pits[oppStart + i];
    }

    // Evaluate: store difference is primary, stones on board secondary
    return storeDiff * 10 + (myStones - oppStones) * 0.5;
  }
}
