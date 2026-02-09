/**
 * Farkle scoring logic — pure functions shared by component, AI, and scene.
 *
 * Standard Farkle scoring:
 *   Single 1 = 100, Single 5 = 50
 *   Three of a kind: 1s=1000, 2s=200, 3s=300, 4s=400, 5s=500, 6s=600
 *   Four of a kind = 2x triple value
 *   Five of a kind = 4x triple value
 *   Six of a kind = 8x triple value
 *   Straight (1-2-3-4-5-6) = 1500
 *   Three pairs = 1500
 */

export interface ScoringResult {
  score: number;
  description: string;
}

/** Count occurrences of each die value (index 0 unused, 1-6 used) */
function getCounts(values: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) counts[v]++;
  return counts;
}

/** Score a specific set of dice values the player chose to keep. Returns 0 if invalid. */
export function scoreSelection(values: number[]): ScoringResult {
  if (values.length === 0) return { score: 0, description: '' };

  const counts = getCounts(values);
  const len = values.length;

  // Check straight (1-2-3-4-5-6)
  if (len === 6 && counts[1] === 1 && counts[2] === 1 && counts[3] === 1 &&
      counts[4] === 1 && counts[5] === 1 && counts[6] === 1) {
    return { score: 1500, description: 'Straight' };
  }

  // Check three pairs (including cases like four-of-a-kind + pair)
  if (len === 6) {
    const pairCount = counts.filter(c => c === 2).length;
    // Three pairs
    if (pairCount === 3) return { score: 1500, description: 'Three Pairs' };
    // Four of a kind + pair also counts as three pairs
    if (counts.some(c => c === 4) && counts.some(c => c === 2)) {
      return { score: 1500, description: 'Three Pairs' };
    }
    // Two triples (not three pairs but worth noting — score as individual triples)
  }

  // Score multi-of-a-kind combos + leftover 1s and 5s
  let score = 0;
  let description = '';
  const usedCounts = [0, 0, 0, 0, 0, 0, 0];

  for (let face = 1; face <= 6; face++) {
    const c = counts[face];
    if (c >= 3) {
      const tripleBase = face === 1 ? 1000 : face * 100;
      if (c === 3) {
        score += tripleBase;
        description += `Three ${face}s, `;
      } else if (c === 4) {
        score += tripleBase * 2;
        description += `Four ${face}s, `;
      } else if (c === 5) {
        score += tripleBase * 4;
        description += `Five ${face}s, `;
      } else if (c === 6) {
        score += tripleBase * 8;
        description += `Six ${face}s, `;
      }
      usedCounts[face] = c;
    }
  }

  // Score leftover 1s and 5s (not already consumed by multi-of-a-kind)
  const leftover1s = counts[1] - (usedCounts[1] > 0 ? usedCounts[1] : 0);
  const leftover5s = counts[5] - (usedCounts[5] > 0 ? usedCounts[5] : 0);

  if (leftover1s > 0) {
    score += leftover1s * 100;
    description += `${leftover1s}x One, `;
  }
  if (leftover5s > 0) {
    score += leftover5s * 50;
    description += `${leftover5s}x Five, `;
  }

  // Check for dead dice: any die value that didn't score is invalid
  for (let face = 1; face <= 6; face++) {
    const used = usedCounts[face] + (face === 1 ? leftover1s : 0) + (face === 5 ? leftover5s : 0);
    if (counts[face] > 0 && used === 0) {
      // This face value has dice that don't score — invalid selection
      return { score: 0, description: 'Invalid selection' };
    }
  }

  if (description.endsWith(', ')) description = description.slice(0, -2);
  return { score, description };
}

/** Check if a set of dice has ANY scoring dice at all (farkle detection). */
export function hasScoringDice(values: number[]): boolean {
  if (values.length === 0) return false;

  const counts = getCounts(values);

  // Any 1s or 5s
  if (counts[1] > 0 || counts[5] > 0) return true;

  // Any three-of-a-kind
  for (let face = 2; face <= 6; face++) {
    if (counts[face] >= 3) return true;
  }

  // Straight
  if (values.length === 6 &&
      counts[1] === 1 && counts[2] === 1 && counts[3] === 1 &&
      counts[4] === 1 && counts[5] === 1 && counts[6] === 1) {
    return true;
  }

  // Three pairs
  if (values.length === 6) {
    const pairs = counts.filter(c => c === 2).length;
    if (pairs === 3) return true;
    if (counts.some(c => c === 4) && counts.some(c => c === 2)) return true;
  }

  return false;
}

/** Find indices of dice that CAN score (for highlighting clickable dice). */
export function findScoringDiceIndices(values: number[]): number[] {
  const indices: number[] = [];
  const counts = getCounts(values);

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    // 1s and 5s always score
    if (v === 1 || v === 5) {
      indices.push(i);
      continue;
    }
    // Part of three-of-a-kind or more
    if (counts[v] >= 3) {
      indices.push(i);
      continue;
    }
  }

  // If it's a straight, all dice score
  if (values.length === 6 &&
      counts[1] === 1 && counts[2] === 1 && counts[3] === 1 &&
      counts[4] === 1 && counts[5] === 1 && counts[6] === 1) {
    return [0, 1, 2, 3, 4, 5];
  }

  // If three pairs, all dice score
  if (values.length === 6) {
    const pairs = counts.filter(c => c === 2).length;
    if (pairs === 3) return [0, 1, 2, 3, 4, 5];
    if (counts.some(c => c === 4) && counts.some(c => c === 2)) return [0, 1, 2, 3, 4, 5];
  }

  return indices;
}

/** Get ALL valid scoring options (subsets) for the AI to evaluate.
 *  Returns arrays of indices that form valid scoring combos. */
export function getAllScoringOptions(values: number[]): { indices: number[]; score: number; description: string }[] {
  const options: { indices: number[]; score: number; description: string }[] = [];
  const len = values.length;

  // Generate all non-empty subsets (up to 2^6 = 64 for 6 dice)
  for (let mask = 1; mask < (1 << len); mask++) {
    const indices: number[] = [];
    const subValues: number[] = [];
    for (let i = 0; i < len; i++) {
      if (mask & (1 << i)) {
        indices.push(i);
        subValues.push(values[i]);
      }
    }

    const result = scoreSelection(subValues);
    if (result.score > 0) {
      // Deduplicate: check we don't already have an option with the same score and same values
      const key = subValues.sort().join(',');
      const exists = options.some(o => {
        const oValues = o.indices.map(i => values[i]).sort().join(',');
        return oValues === key && o.score === result.score;
      });
      if (!exists) {
        options.push({ indices, score: result.score, description: result.description });
      }
    }
  }

  // Sort by score descending
  options.sort((a, b) => b.score - a.score);
  return options;
}
