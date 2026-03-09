import { Injectable } from '@angular/core';
import {
  Board, Bar, BorneOff, Color, BackgammonMove,
  findAllTurns, applyMove, pipCount, countBlots,
  homePointsControlled, checkerCount, isInHomeBoard
} from '../../games/backgammon/backgammon-types';

export type Difficulty = 'easy' | 'medium' | 'hard';

interface TurnContext {
  board: Board;
  bar: Bar;
  borneOff: BorneOff;
  color: Color;
  remainingDice: number[];
}

@Injectable({ providedIn: 'root' })
export class BackgammonAI {

  getDelay(difficulty: Difficulty): number {
    if (difficulty === 'easy') return 600 + Math.random() * 400;
    if (difficulty === 'medium') return 800 + Math.random() * 600;
    return 1000 + Math.random() * 800;
  }

  getMoveDelay(): number {
    return 200 + Math.random() * 200;
  }

  // Returns a complete turn (array of moves) for the AI
  getTurn(ctx: TurnContext, difficulty: Difficulty): BackgammonMove[] {
    const allTurns = findAllTurns(ctx.board, ctx.bar, ctx.borneOff, ctx.color, ctx.remainingDice);

    if (allTurns.length === 0 || (allTurns.length === 1 && allTurns[0].length === 0)) {
      return [];
    }

    // Filter out empty turns if non-empty ones exist
    const nonEmpty = allTurns.filter(t => t.length > 0);
    if (nonEmpty.length === 0) return [];

    if (difficulty === 'easy') {
      return nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
    }

    // Score each turn
    let bestScore = -Infinity;
    let bestTurns: BackgammonMove[][] = [];

    for (const turn of nonEmpty) {
      const score = this.evaluateTurn(ctx, turn);
      if (score > bestScore) {
        bestScore = score;
        bestTurns = [turn];
      } else if (score === bestScore) {
        bestTurns.push(turn);
      }
    }

    if (difficulty === 'medium') {
      // Add slight randomness
      return bestTurns[Math.floor(Math.random() * bestTurns.length)];
    }

    // Hard: 1-ply expectimax (evaluate opponent's best response)
    if (nonEmpty.length <= 50) {
      return this.expectimaxTurn(ctx, nonEmpty);
    }

    // Too many turns to evaluate deeply, fall back to heuristic
    return bestTurns[Math.floor(Math.random() * bestTurns.length)];
  }

  private evaluateTurn(ctx: TurnContext, turn: BackgammonMove[]): number {
    // Apply all moves
    let b = ctx.board;
    let br = ctx.bar;
    let bo = ctx.borneOff;
    let hits = 0;

    for (const move of turn) {
      const result = applyMove(b, br, bo, ctx.color, move);
      b = result.board;
      br = result.bar;
      bo = result.borneOff;
      if (result.hit) hits++;
    }

    return this.evaluatePosition(b, br, bo, ctx.color, hits);
  }

  private evaluatePosition(board: Board, bar: Bar, borneOff: BorneOff, color: Color, hits: number): number {
    const opp: Color = color === 'W' ? 'B' : 'W';
    let score = 0;

    // Pip count advantage (lower is better)
    const myPips = pipCount(board, bar, color);
    const oppPips = pipCount(board, bar, opp);
    score += (oppPips - myPips) * 0.5;

    // Hits
    score += hits * 30;

    // Blots (exposed single checkers) — penalty
    const myBlots = countBlots(board, color);
    score -= myBlots * 20;

    // Extra penalty for blots in opponent's home board
    for (let i = 0; i < 24; i++) {
      const val = board[i];
      const isBlot = (color === 'W' && val === 1) || (color === 'B' && val === -1);
      if (isBlot && isInHomeBoard(i, opp)) {
        score -= 15; // Extra penalty
      }
    }

    // Home board control
    score += homePointsControlled(board, color) * 15;

    // Bearing off progress
    score += borneOff[color] * 40;

    // Anchors in opponent's home (2+ checkers)
    for (let i = 0; i < 24; i++) {
      if (checkerCount(board, i, color) >= 2 && isInHomeBoard(i, opp)) {
        score += 20;
      }
    }

    // Bar penalty for opponent (good for us)
    score += bar[opp] * 25;

    // Bar penalty for us
    score -= bar[color] * 30;

    return score;
  }

  private expectimaxTurn(ctx: TurnContext, turns: BackgammonMove[][]): BackgammonMove[] {
    const opp: Color = ctx.color === 'W' ? 'B' : 'W';
    let bestScore = -Infinity;
    let bestTurn = turns[0];

    // All 21 distinct dice outcomes
    const diceOutcomes: { dice: [number, number]; prob: number }[] = [];
    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = d1; d2 <= 6; d2++) {
        diceOutcomes.push({
          dice: [d1, d2],
          prob: d1 === d2 ? 1 / 36 : 2 / 36
        });
      }
    }

    for (const turn of turns) {
      // Apply turn
      let b = ctx.board;
      let br = ctx.bar;
      let bo = ctx.borneOff;
      let hits = 0;

      for (const move of turn) {
        const result = applyMove(b, br, bo, ctx.color, move);
        b = result.board;
        br = result.bar;
        bo = result.borneOff;
        if (result.hit) hits++;
      }

      // Our position score
      const ourScore = this.evaluatePosition(b, br, bo, ctx.color, hits);

      // Expected opponent response
      let expectedOppScore = 0;
      for (const { dice, prob } of diceOutcomes) {
        const oppDice = dice[0] === dice[1]
          ? [dice[0], dice[0], dice[0], dice[0]]
          : [dice[0], dice[1]];
        const oppTurns = findAllTurns(b, br, bo, opp, oppDice);
        const nonEmpty = oppTurns.filter(t => t.length > 0);

        if (nonEmpty.length === 0) {
          expectedOppScore += 0;
          continue;
        }

        // Find opponent's best turn (from their perspective)
        let bestOpp = -Infinity;
        for (const oppTurn of nonEmpty) {
          let ob = b;
          let obr = br;
          let obo = bo;
          let oHits = 0;
          for (const m of oppTurn) {
            const r = applyMove(ob, obr, obo, opp, m);
            ob = r.board;
            obr = r.bar;
            obo = r.borneOff;
            if (r.hit) oHits++;
          }
          const s = this.evaluatePosition(ob, obr, obo, opp, oHits);
          if (s > bestOpp) bestOpp = s;
        }
        expectedOppScore += bestOpp * prob;
      }

      const totalScore = ourScore - expectedOppScore * 0.5;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestTurn = turn;
      }
    }

    return bestTurn;
  }
}
