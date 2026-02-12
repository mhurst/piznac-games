class PotManager {
  constructor() {
    this.pots = [];
    this.playerBets = new Map();
  }

  reset() {
    this.pots = [];
    this.playerBets.clear();
  }

  setPlayers(playerIds) {
    this.playerBets.clear();
    for (const id of playerIds) {
      this.playerBets.set(id, { id, amount: 0, folded: false, allIn: false });
    }
  }

  recordBet(playerId, amount) {
    const pb = this.playerBets.get(playerId);
    if (pb) pb.amount += amount;
  }

  recordFold(playerId) {
    const pb = this.playerBets.get(playerId);
    if (pb) pb.folded = true;
  }

  recordAllIn(playerId) {
    const pb = this.playerBets.get(playerId);
    if (pb) pb.allIn = true;
  }

  calculatePots() {
    const players = Array.from(this.playerBets.values());
    const allInAmounts = players
      .filter(p => p.allIn && !p.folded)
      .map(p => p.amount)
      .sort((a, b) => a - b);

    const levels = [...new Set([...allInAmounts])];

    if (levels.length === 0) {
      const total = players.reduce((sum, p) => sum + p.amount, 0);
      const eligible = players.filter(p => !p.folded).map(p => p.id);
      this.pots = [{ amount: total, eligible }];
      return this.pots;
    }

    const pots = [];
    let prevLevel = 0;

    for (const level of levels) {
      const contribution = level - prevLevel;
      if (contribution <= 0) continue;

      let potAmount = 0;
      const eligible = [];

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

    const highestLevel = levels[levels.length - 1];
    let remainingPot = 0;
    const remainingEligible = [];

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

    const foldedMoney = players.filter(p => p.folded).reduce((sum, p) => sum + p.amount, 0);
    if (pots.length === 0 && foldedMoney > 0) {
      const eligible = players.filter(p => !p.folded).map(p => p.id);
      pots.push({ amount: foldedMoney, eligible });
    }

    this.pots = pots;
    return pots;
  }

  getTotalPot() {
    return Array.from(this.playerBets.values()).reduce((sum, p) => sum + p.amount, 0);
  }

  getPots() {
    return this.pots;
  }

  getPlayerBet(playerId) {
    const pb = this.playerBets.get(playerId);
    return pb ? pb.amount : 0;
  }
}

module.exports = PotManager;
