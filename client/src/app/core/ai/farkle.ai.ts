import { scoreSelection, getAllScoringOptions, hasScoringDice } from '../../games/farkle/farkle-scoring';

/**
 * Farkle AI — three difficulty levels.
 *
 * Easy:   Random valid keeps, banks early (200+, 40% chance)
 * Medium: Greedy (best scoring combo), banks at 300-500 based on remaining dice
 * Hard:   Expected-value analysis, adjusts risk based on game state
 */
export class FarkleAI {

  /**
   * Choose which dice to keep from the current roll.
   * Returns indices of dice to keep (must form a valid scoring combo).
   */
  getKeepDecision(
    diceValues: number[],
    turnScore: number,
    totalScore: number,
    opponentMaxScore: number,
    difficulty: string
  ): number[] {
    const options = getAllScoringOptions(diceValues);
    if (options.length === 0) return [];

    if (difficulty === 'easy') return this.easyKeep(options);
    if (difficulty === 'medium') return this.mediumKeep(options, diceValues.length);
    return this.hardKeep(options, diceValues.length, turnScore, totalScore, opponentMaxScore);
  }

  /**
   * Decide whether to bank current turn score or roll again.
   */
  shouldBank(
    turnScore: number,
    totalScore: number,
    remainingDice: number,
    opponentMaxScore: number,
    difficulty: string
  ): boolean {
    if (difficulty === 'easy') return this.easyBank(turnScore);
    if (difficulty === 'medium') return this.mediumBank(turnScore, remainingDice);
    return this.hardBank(turnScore, totalScore, remainingDice, opponentMaxScore);
  }

  // --- Easy ---

  private easyKeep(options: { indices: number[]; score: number }[]): number[] {
    // Random valid option
    const idx = Math.floor(Math.random() * options.length);
    return options[idx].indices;
  }

  private easyBank(turnScore: number): boolean {
    // Bank at 200+ with 40% chance, always bank at 500+
    if (turnScore >= 500) return true;
    if (turnScore >= 200) return Math.random() < 0.4;
    return false;
  }

  // --- Medium ---

  private mediumKeep(options: { indices: number[]; score: number }[], totalDice: number): number[] {
    // Always take the highest-scoring combo
    return options[0].indices; // Already sorted by score desc
  }

  private mediumBank(turnScore: number, remainingDice: number): boolean {
    // Bank thresholds based on remaining dice
    const thresholds: Record<number, number> = {
      1: 200,
      2: 300,
      3: 400,
      4: 500,
      5: 600,
      6: 200  // Hot dice — low threshold since we get all 6 back
    };
    const threshold = thresholds[remainingDice] || 300;
    return turnScore >= threshold;
  }

  // --- Hard ---

  private hardKeep(
    options: { indices: number[]; score: number }[],
    totalDice: number,
    turnScore: number,
    totalScore: number,
    opponentMaxScore: number
  ): number[] {
    // Evaluate each option by expected value of continuing
    let bestOption = options[0];
    let bestEV = -1;

    for (const option of options) {
      const remaining = totalDice - option.indices.length;
      const newTurnScore = turnScore + option.score;

      if (remaining === 0) {
        // Hot dice! All 6 dice scored — we get them all back
        // High EV because we get to roll 6 dice again
        const ev = option.score + this.expectedValue(6) * this.pNotFarkle(6);
        if (ev > bestEV) { bestEV = ev; bestOption = option; }
      } else {
        // EV of continuing: option.score + expected future value
        const pContinue = this.pNotFarkle(remaining);
        const ev = option.score + (pContinue * this.expectedValue(remaining));
        if (ev > bestEV) { bestEV = ev; bestOption = option; }
      }
    }

    // Trailing strategy: if behind, prefer keeping fewer dice (more remaining to roll)
    const behind = opponentMaxScore - totalScore;
    if (behind > 3000 && options.length > 1) {
      // Try to find an option that keeps fewer dice but still scores decently
      const fewerDice = options.filter(o => o.indices.length < bestOption.indices.length && o.score >= 100);
      if (fewerDice.length > 0) {
        return fewerDice[0].indices;
      }
    }

    return bestOption.indices;
  }

  private hardBank(turnScore: number, totalScore: number, remainingDice: number, opponentMaxScore: number): boolean {
    // Probability of NOT farkle-ing
    const pSafe = this.pNotFarkle(remainingDice);

    // If we'd win by banking, always bank
    if (totalScore + turnScore >= 10000) return true;

    // If hot dice (6 remaining), almost always roll
    if (remainingDice === 6 && turnScore < 2000) return false;

    // Risk adjustment based on game state
    const trailing = opponentMaxScore - totalScore;
    let riskMultiplier = 1.0;

    if (trailing > 3000) {
      riskMultiplier = 0.6; // More aggressive when far behind
    } else if (trailing > 1000) {
      riskMultiplier = 0.8; // Slightly more aggressive
    } else if (totalScore > opponentMaxScore + 2000) {
      riskMultiplier = 1.3; // More conservative when leading
    }

    // Bank thresholds adjusted by risk and remaining dice
    const baseThresholds: Record<number, number> = {
      1: 250,
      2: 350,
      3: 450,
      4: 550,
      5: 700,
      6: 150
    };
    const threshold = (baseThresholds[remainingDice] || 400) * riskMultiplier;

    // Expected value consideration: if EV of rolling > current bank, keep going
    const ev = pSafe * this.expectedValue(remainingDice);
    if (turnScore < threshold && ev > turnScore * 0.3) return false;

    return turnScore >= threshold;
  }

  // --- Probability helpers ---

  /** Approximate probability of NOT farkle-ing given N dice */
  private pNotFarkle(numDice: number): number {
    const probs: Record<number, number> = {
      1: 0.33,
      2: 0.56,
      3: 0.72,
      4: 0.84,
      5: 0.92,
      6: 0.98
    };
    return probs[numDice] || 0.5;
  }

  /** Rough expected score from a single roll of N dice */
  private expectedValue(numDice: number): number {
    const evs: Record<number, number> = {
      1: 25,   // (100+50)/6
      2: 50,
      3: 100,
      4: 150,
      5: 200,
      6: 300
    };
    return evs[numDice] || 50;
  }
}
