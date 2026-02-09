const ALL_CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'chance', 'yahtzee'
];

export class YahtzeeAI {

  getHoldDecision(dice: number[], lockedScores: Record<string, number | null>, difficulty: string): boolean[] {
    if (difficulty === 'easy') return this.easyHold(dice);
    if (difficulty === 'medium') return this.mediumHold(dice, lockedScores);
    return this.hardHold(dice, lockedScores);
  }

  getScoreDecision(dice: number[], lockedScores: Record<string, number | null>, difficulty: string): string {
    if (difficulty === 'easy') return this.randomCategory(lockedScores);
    return this.bestCategory(dice, lockedScores, difficulty === 'hard');
  }

  shouldStopRolling(dice: number[], lockedScores: Record<string, number | null>, difficulty: string): boolean {
    if (difficulty === 'easy') return Math.random() > 0.6;
    const best = this.bestScore(dice, lockedScores);
    if (difficulty === 'medium') return best >= 25;
    // Hard: stop if we have a great hand
    return best >= 30 || this.allFiveSame(dice);
  }

  // --- Easy ---
  private easyHold(dice: number[]): boolean[] {
    return dice.map(() => Math.random() > 0.5);
  }

  private randomCategory(lockedScores: Record<string, number | null>): string {
    const available = ALL_CATEGORIES.filter(c => lockedScores[c] === null);
    return available[Math.floor(Math.random() * available.length)];
  }

  // --- Medium ---
  private mediumHold(dice: number[], _lockedScores: Record<string, number | null>): boolean[] {
    const counts = this.getCounts(dice);
    const maxCount = Math.max(...counts.slice(1));
    const maxVal = counts.indexOf(maxCount, 1);

    // Hold 3+ of a kind
    if (maxCount >= 3) {
      return dice.map(d => d === maxVal);
    }

    // Hold 4-straight
    const unique = [...new Set(dice)].sort((a, b) => a - b);
    if (unique.length >= 4) {
      for (let i = 0; i <= unique.length - 4; i++) {
        if (unique[i + 3] - unique[i] === 3) {
          const keep = new Set(unique.slice(i, i + 4));
          const held: boolean[] = [false, false, false, false, false];
          for (let j = 0; j < 5; j++) {
            if (keep.has(dice[j]) && !held.some((h, k) => h && dice[k] === dice[j] && k !== j)) {
              held[j] = true;
            }
          }
          // Mark first occurrence of each keep value
          const used = new Set<number>();
          return dice.map(d => {
            if (keep.has(d) && !used.has(d)) { used.add(d); return true; }
            return false;
          });
        }
      }
    }

    // Hold pairs
    if (maxCount >= 2) {
      return dice.map(d => d === maxVal);
    }

    // Hold highest value
    const maxDie = Math.max(...dice);
    return dice.map(d => d === maxDie);
  }

  // --- Hard ---
  private hardHold(dice: number[], lockedScores: Record<string, number | null>): boolean[] {
    // Try to maximize the best available category
    const available = ALL_CATEGORIES.filter(c => lockedScores[c] === null);
    const counts = this.getCounts(dice);
    const maxCount = Math.max(...counts.slice(1));
    const maxVal = counts.indexOf(maxCount, 1);

    // Yahtzee chase: if 4 of a kind, keep going
    if (maxCount >= 4 && available.includes('yahtzee')) {
      return dice.map(d => d === maxVal);
    }

    // Full house: if we have 3 of one and need full house
    if (maxCount === 3 && available.includes('fullHouse')) {
      const pairVal = counts.findIndex((c, i) => i > 0 && c >= 2 && i !== maxVal);
      if (pairVal > 0) {
        return dice.map(d => d === maxVal || d === pairVal);
      }
      return dice.map(d => d === maxVal);
    }

    // Use medium strategy as fallback
    return this.mediumHold(dice, lockedScores);
  }

  private bestCategory(dice: number[], lockedScores: Record<string, number | null>, isHard: boolean): string {
    const available = ALL_CATEGORIES.filter(c => lockedScores[c] === null);
    let bestCat = available[0];
    let bestScore = -1;

    for (const cat of available) {
      const score = this.calculateScore(cat, dice);
      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
      }
    }

    // If best score is 0, waste the least valuable category
    if (bestScore === 0 && isHard) {
      const wasteOrder = ['yahtzee', 'largeStraight', 'smallStraight', 'fullHouse',
        'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
        'fourOfAKind', 'threeOfAKind', 'chance'];
      for (const cat of wasteOrder) {
        if (lockedScores[cat] === null) return cat;
      }
    }

    return bestCat;
  }

  private bestScore(dice: number[], lockedScores: Record<string, number | null>): number {
    let best = 0;
    for (const cat of ALL_CATEGORIES) {
      if (lockedScores[cat] === null) {
        best = Math.max(best, this.calculateScore(cat, dice));
      }
    }
    return best;
  }

  private allFiveSame(dice: number[]): boolean {
    return dice.every(d => d === dice[0]);
  }

  private getCounts(dice: number[]): number[] {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) counts[d]++;
    return counts;
  }

  calculateScore(category: string, dice: number[]): number {
    const counts = this.getCounts(dice);
    const sum = dice.reduce((a, b) => a + b, 0);
    const maxCount = Math.max(...counts.slice(1));

    switch (category) {
      case 'ones': return counts[1] * 1;
      case 'twos': return counts[2] * 2;
      case 'threes': return counts[3] * 3;
      case 'fours': return counts[4] * 4;
      case 'fives': return counts[5] * 5;
      case 'sixes': return counts[6] * 6;
      case 'threeOfAKind': return maxCount >= 3 ? sum : 0;
      case 'fourOfAKind': return maxCount >= 4 ? sum : 0;
      case 'fullHouse': {
        const has3 = counts.some(c => c === 3);
        const has2 = counts.some(c => c === 2);
        return has3 && has2 ? 25 : 0;
      }
      case 'smallStraight': return this.hasConsecutive(dice, 4) ? 30 : 0;
      case 'largeStraight': return this.hasConsecutive(dice, 5) ? 40 : 0;
      case 'chance': return sum;
      case 'yahtzee': return maxCount === 5 ? 50 : 0;
      default: return 0;
    }
  }

  private hasConsecutive(dice: number[], needed: number): boolean {
    const unique = new Set(dice);
    const sequences = needed === 4
      ? [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]
      : [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
    return sequences.some(seq => seq.every(n => unique.has(n)));
  }
}
