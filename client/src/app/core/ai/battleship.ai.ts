import { Injectable } from '@angular/core';
import { Difficulty } from './game-ai.interface';
import { SHIPS, ShipPlacement } from '../../games/battleship/battleship.scene';

export type BattleshipBoard = (string | null)[][];  // 10x10
export type BattleshipMove = { row: number; col: number };

const BOARD_SIZE = 10;

interface HuntState {
  lastHit: BattleshipMove | null;
  hitChain: BattleshipMove[];  // Consecutive hits (for determining ship direction)
  targets: BattleshipMove[];   // Priority cells to check next
  direction: 'horizontal' | 'vertical' | null;
}

@Injectable({
  providedIn: 'root'
})
export class BattleshipAI {
  private huntState: HuntState = {
    lastHit: null,
    hitChain: [],
    targets: [],
    direction: null
  };

  // ===== SHIP PLACEMENT =====

  /**
   * Generate random valid ship placements for all ships
   */
  generateShipPlacements(): ShipPlacement[] {
    const placements: ShipPlacement[] = [];
    const board: boolean[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(false));

    for (const ship of SHIPS) {
      let placed = false;
      let attempts = 0;
      const maxAttempts = 100;

      while (!placed && attempts < maxAttempts) {
        attempts++;
        const horizontal = Math.random() < 0.5;
        const maxRow = horizontal ? BOARD_SIZE : BOARD_SIZE - ship.size;
        const maxCol = horizontal ? BOARD_SIZE - ship.size : BOARD_SIZE;
        const row = Math.floor(Math.random() * maxRow);
        const col = Math.floor(Math.random() * maxCol);

        if (this.canPlaceShip(board, row, col, ship.size, horizontal)) {
          // Mark cells as occupied
          for (let i = 0; i < ship.size; i++) {
            const r = horizontal ? row : row + i;
            const c = horizontal ? col + i : col;
            board[r][c] = true;
          }

          placements.push({
            shipType: ship.type,
            row,
            col,
            horizontal
          });
          placed = true;
        }
      }

      if (!placed) {
        // Fallback: start over if we couldn't place a ship
        return this.generateShipPlacements();
      }
    }

    return placements;
  }

  private canPlaceShip(board: boolean[][], row: number, col: number, size: number, horizontal: boolean): boolean {
    for (let i = 0; i < size; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;

      if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
      if (board[r][c]) return false;
    }
    return true;
  }

  // ===== ATTACK STRATEGY =====

  /**
   * Get the AI's next attack move
   */
  getAttackMove(trackingBoard: BattleshipBoard, difficulty: Difficulty): BattleshipMove {
    switch (difficulty) {
      case 'easy':
        return this.getRandomMove(trackingBoard);
      case 'medium':
        return this.getHuntTargetMove(trackingBoard);
      case 'hard':
        return this.getProbabilityMove(trackingBoard);
    }
  }

  /**
   * Notify AI of the result of its last shot
   */
  notifyResult(row: number, col: number, hit: boolean, sunk: boolean): void {
    if (hit) {
      const move = { row, col };
      this.huntState.lastHit = move;
      this.huntState.hitChain.push(move);

      if (sunk) {
        // Ship sunk - reset hunt state
        this.huntState.hitChain = [];
        this.huntState.targets = [];
        this.huntState.direction = null;
        this.huntState.lastHit = null;
      } else {
        // Add adjacent cells as targets
        this.updateTargetsAfterHit(row, col);
      }
    } else {
      // Miss - might need to change direction if we were targeting
      if (this.huntState.direction && this.huntState.targets.length === 0 && this.huntState.hitChain.length > 0) {
        // Reverse direction along the hit chain
        this.reverseDirection();
      }
    }
  }

  /**
   * Reset AI state for a new game
   */
  reset(): void {
    this.huntState = {
      lastHit: null,
      hitChain: [],
      targets: [],
      direction: null
    };
  }

  // ===== EASY: Random shots =====

  private getRandomMove(board: BattleshipBoard): BattleshipMove {
    const available = this.getAvailableCells(board);
    return available[Math.floor(Math.random() * available.length)];
  }

  // ===== MEDIUM: Hunt/Target mode =====

  private getHuntTargetMove(board: BattleshipBoard): BattleshipMove {
    // Filter out invalid targets (already shot)
    this.huntState.targets = this.huntState.targets.filter(
      t => board[t.row][t.col] === null
    );

    // If we have priority targets, use them
    if (this.huntState.targets.length > 0) {
      return this.huntState.targets.shift()!;
    }

    // Otherwise, hunt mode - use checkerboard pattern for efficiency
    const available = this.getAvailableCells(board);

    // Prefer checkerboard pattern (row + col is even or odd)
    const checkerboard = available.filter(c => (c.row + c.col) % 2 === 0);
    if (checkerboard.length > 0) {
      return checkerboard[Math.floor(Math.random() * checkerboard.length)];
    }

    return available[Math.floor(Math.random() * available.length)];
  }

  private updateTargetsAfterHit(row: number, col: number): void {
    const adjacent = this.getAdjacentCells(row, col);

    if (this.huntState.hitChain.length >= 2) {
      // Determine direction from hit chain
      const first = this.huntState.hitChain[0];
      const second = this.huntState.hitChain[1];

      if (first.row === second.row) {
        this.huntState.direction = 'horizontal';
        // Only add horizontal neighbors
        this.huntState.targets = adjacent.filter(c => c.row === row);
      } else {
        this.huntState.direction = 'vertical';
        // Only add vertical neighbors
        this.huntState.targets = adjacent.filter(c => c.col === col);
      }
    } else {
      // First hit - add all adjacent
      this.huntState.targets = adjacent;
    }
  }

  private reverseDirection(): void {
    if (this.huntState.hitChain.length === 0) return;

    // Find the other end of the hit chain
    const firstHit = this.huntState.hitChain[0];
    const adjacent = this.getAdjacentCells(firstHit.row, firstHit.col);

    if (this.huntState.direction === 'horizontal') {
      this.huntState.targets = adjacent.filter(c => c.row === firstHit.row);
    } else if (this.huntState.direction === 'vertical') {
      this.huntState.targets = adjacent.filter(c => c.col === firstHit.col);
    }
  }

  // ===== HARD: Probability density =====

  private getProbabilityMove(board: BattleshipBoard): BattleshipMove {
    // First check if we have hits to follow up on
    this.huntState.targets = this.huntState.targets.filter(
      t => board[t.row][t.col] === null
    );

    if (this.huntState.targets.length > 0) {
      return this.huntState.targets.shift()!;
    }

    // Calculate probability density for each cell
    const density = this.calculateProbabilityDensity(board);

    // Find cell with highest probability
    let maxProb = 0;
    let bestCells: BattleshipMove[] = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === null && density[row][col] > maxProb) {
          maxProb = density[row][col];
          bestCells = [{ row, col }];
        } else if (board[row][col] === null && density[row][col] === maxProb) {
          bestCells.push({ row, col });
        }
      }
    }

    // Randomly pick among equally good cells
    if (bestCells.length > 0) {
      return bestCells[Math.floor(Math.random() * bestCells.length)];
    }

    // Fallback to random
    return this.getRandomMove(board);
  }

  private calculateProbabilityDensity(board: BattleshipBoard): number[][] {
    const density: number[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));

    // Get remaining ships (assume we track sunk ships via hit patterns)
    // For simplicity, we'll use all ship sizes and let the density calculation handle it
    const shipSizes = SHIPS.map(s => s.size);

    for (const size of shipSizes) {
      // Try horizontal placements
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col <= BOARD_SIZE - size; col++) {
          if (this.canPlaceShipOnTracking(board, row, col, size, true)) {
            // Increment probability for each cell in this placement
            for (let i = 0; i < size; i++) {
              density[row][col + i]++;
            }
          }
        }
      }

      // Try vertical placements
      for (let row = 0; row <= BOARD_SIZE - size; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (this.canPlaceShipOnTracking(board, row, col, size, false)) {
            for (let i = 0; i < size; i++) {
              density[row + i][col]++;
            }
          }
        }
      }
    }

    // Boost cells adjacent to hits (but not misses)
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === 'hit') {
          const adjacent = this.getAdjacentCells(row, col);
          for (const cell of adjacent) {
            if (board[cell.row][cell.col] === null) {
              density[cell.row][cell.col] *= 2;  // Double priority
            }
          }
        }
      }
    }

    return density;
  }

  private canPlaceShipOnTracking(board: BattleshipBoard, row: number, col: number, size: number, horizontal: boolean): boolean {
    for (let i = 0; i < size; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;

      if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
      if (board[r][c] === 'miss') return false;  // Can't be here
      // 'hit' is OK - ship could extend through this cell
    }
    return true;
  }

  // ===== HELPERS =====

  private getAvailableCells(board: BattleshipBoard): BattleshipMove[] {
    const available: BattleshipMove[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === null) {
          available.push({ row, col });
        }
      }
    }
    return available;
  }

  private getAdjacentCells(row: number, col: number): BattleshipMove[] {
    const adjacent: BattleshipMove[] = [];
    const directions = [
      { dr: -1, dc: 0 },  // up
      { dr: 1, dc: 0 },   // down
      { dr: 0, dc: -1 },  // left
      { dr: 0, dc: 1 }    // right
    ];

    for (const { dr, dc } of directions) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        adjacent.push({ row: r, col: c });
      }
    }

    return adjacent;
  }
}
