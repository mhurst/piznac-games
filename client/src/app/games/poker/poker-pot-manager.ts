import { PotInfo } from './poker-types';

interface PlayerBet {
  id: string;
  amount: number; // total amount committed this hand
  folded: boolean;
  allIn: boolean;
}

export class PotManager {
  private pots: PotInfo[] = [];
  private playerBets: Map<string, PlayerBet> = new Map();

  reset(): void {
    this.pots = [];
    this.playerBets.clear();
  }

  setPlayers(playerIds: string[]): void {
    this.playerBets.clear();
    for (const id of playerIds) {
      this.playerBets.set(id, { id, amount: 0, folded: false, allIn: false });
    }
  }

  recordBet(playerId: string, amount: number): void {
    const pb = this.playerBets.get(playerId);
    if (pb) {
      pb.amount += amount;
    }
  }

  recordFold(playerId: string): void {
    const pb = this.playerBets.get(playerId);
    if (pb) {
      pb.folded = true;
    }
  }

  recordAllIn(playerId: string): void {
    const pb = this.playerBets.get(playerId);
    if (pb) {
      pb.allIn = true;
    }
  }

  /**
   * Calculate main pot and side pots based on all bets.
   * Called at showdown to determine pot distribution.
   */
  calculatePots(): PotInfo[] {
    const players = Array.from(this.playerBets.values());
    const allInAmounts = players
      .filter(p => p.allIn && !p.folded)
      .map(p => p.amount)
      .sort((a, b) => a - b);

    // Remove duplicates
    const levels = [...new Set([...allInAmounts])];

    if (levels.length === 0) {
      // No side pots needed — single main pot
      const total = players.reduce((sum, p) => sum + p.amount, 0);
      const eligible = players.filter(p => !p.folded).map(p => p.id);
      this.pots = [{ amount: total, eligible }];
      return this.pots;
    }

    // Build pots level by level
    const pots: PotInfo[] = [];
    let prevLevel = 0;

    for (const level of levels) {
      const contribution = level - prevLevel;
      if (contribution <= 0) continue;

      let potAmount = 0;
      const eligible: string[] = [];

      for (const p of players) {
        const canContribute = Math.min(contribution, Math.max(0, p.amount - prevLevel));
        potAmount += canContribute;
        if (!p.folded && p.amount >= level) {
          eligible.push(p.id);
        }
      }

      if (potAmount > 0) {
        pots.push({ amount: potAmount, eligible });
      }
      prevLevel = level;
    }

    // Remaining bets above highest all-in level
    const highestLevel = levels[levels.length - 1];
    let remainingPot = 0;
    const remainingEligible: string[] = [];

    for (const p of players) {
      const excess = Math.max(0, p.amount - highestLevel);
      remainingPot += excess;
      if (!p.folded && p.amount > highestLevel) {
        remainingEligible.push(p.id);
      }
    }

    if (remainingPot > 0 && remainingEligible.length > 0) {
      pots.push({ amount: remainingPot, eligible: remainingEligible });
    }

    // If no all-in eligible players captured folded player money, add to first pot
    const foldedMoney = players.filter(p => p.folded).reduce((sum, p) => sum + p.amount, 0);
    if (pots.length === 0 && foldedMoney > 0) {
      const eligible = players.filter(p => !p.folded).map(p => p.id);
      pots.push({ amount: foldedMoney, eligible });
    }

    this.pots = pots;
    return pots;
  }

  /**
   * Simple total pot calculation (for display purposes during the hand).
   */
  getTotalPot(): number {
    return Array.from(this.playerBets.values()).reduce((sum, p) => sum + p.amount, 0);
  }

  getPots(): PotInfo[] {
    return this.pots;
  }

  getPlayerBet(playerId: string): number {
    return this.playerBets.get(playerId)?.amount || 0;
  }
}
