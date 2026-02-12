import { GoFishCard, RANKS } from '../../games/go-fish/go-fish-types';

export interface GoFishAIContext {
  hand: GoFishCard[];
  players: { id: string; cardCount: number; books: string[] }[];
  myId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  memory: Map<string, Set<string>>; // playerId → set of ranks they likely hold
}

export interface GoFishAIDecision {
  targetId: string;
  rank: string;
}

export function getAIDecision(context: GoFishAIContext): GoFishAIDecision | null {
  const { hand, players, myId, difficulty } = context;
  if (hand.length === 0) return null;

  const myRanks = [...new Set(hand.map(c => c.value))];
  const targets = players.filter(p => p.id !== myId && p.cardCount > 0);
  if (targets.length === 0 || myRanks.length === 0) return null;

  if (difficulty === 'easy') {
    return easyDecision(myRanks, targets);
  } else if (difficulty === 'medium') {
    return mediumDecision(myRanks, targets, hand, context.memory);
  } else {
    return hardDecision(myRanks, targets, hand, context.memory);
  }
}

function easyDecision(
  myRanks: string[],
  targets: { id: string; cardCount: number }[]
): GoFishAIDecision {
  const rank = myRanks[Math.floor(Math.random() * myRanks.length)];
  const target = targets[Math.floor(Math.random() * targets.length)];
  return { targetId: target.id, rank };
}

function mediumDecision(
  myRanks: string[],
  targets: { id: string; cardCount: number }[],
  hand: GoFishCard[],
  memory: Map<string, Set<string>>
): GoFishAIDecision {
  // Prefer ranks we have 2+ of
  const rankCounts = new Map<string, number>();
  for (const card of hand) {
    rankCounts.set(card.value, (rankCounts.get(card.value) || 0) + 1);
  }

  // Sort ranks by count (most cards first)
  const sortedRanks = [...myRanks].sort((a, b) =>
    (rankCounts.get(b) || 0) - (rankCounts.get(a) || 0)
  );

  // Try to find a target likely holding our best rank
  for (const rank of sortedRanks) {
    for (const target of targets) {
      const known = memory.get(target.id);
      if (known && known.has(rank)) {
        return { targetId: target.id, rank };
      }
    }
  }

  // Fallback: pick best rank, random target
  const rank = sortedRanks[0];
  const target = targets[Math.floor(Math.random() * targets.length)];
  return { targetId: target.id, rank };
}

function hardDecision(
  myRanks: string[],
  targets: { id: string; cardCount: number; books: string[] }[],
  hand: GoFishCard[],
  memory: Map<string, Set<string>>
): GoFishAIDecision {
  // Count cards per rank in hand
  const rankCounts = new Map<string, number>();
  for (const card of hand) {
    rankCounts.set(card.value, (rankCounts.get(card.value) || 0) + 1);
  }

  // Priority: ranks where we have 3 cards (one more = book)
  // Then 2 cards, then 1
  const sortedRanks = [...myRanks].sort((a, b) =>
    (rankCounts.get(b) || 0) - (rankCounts.get(a) || 0)
  );

  // Score each (target, rank) pair
  let bestScore = -1;
  let bestTarget: string | null = null;
  let bestRank: string | null = null;

  for (const rank of sortedRanks) {
    const myCount = rankCounts.get(rank) || 0;
    const baseScore = myCount * 10; // Prioritize completing books

    for (const target of targets) {
      let score = baseScore;

      // Bonus if memory says target has this rank
      const known = memory.get(target.id);
      if (known && known.has(rank)) {
        score += 20;
      }

      // Bonus for targets with more cards (more likely to have what we want)
      score += target.cardCount * 0.5;

      // Bonus for ranks that aren't already booked by anyone
      const allBookedRanks = new Set<string>();
      for (const p of targets) {
        for (const b of p.books) allBookedRanks.add(b);
      }
      if (!allBookedRanks.has(rank)) {
        score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTarget = target.id;
        bestRank = rank;
      }
    }
  }

  if (bestTarget && bestRank) {
    return { targetId: bestTarget, rank: bestRank };
  }

  // Fallback
  return easyDecision(myRanks, targets);
}

export function updateAIMemory(
  memory: Map<string, Set<string>>,
  askerId: string,
  targetId: string,
  rank: string,
  gotCards: boolean,
  newBook: string | null
): void {
  // The asker has the rank (they asked for it)
  if (!memory.has(askerId)) memory.set(askerId, new Set());
  memory.get(askerId)!.add(rank);

  if (gotCards) {
    // Target had the rank, now asker has more; target may still have some
    // Actually, ALL matching cards transfer, so target no longer has it
    if (memory.has(targetId)) {
      memory.get(targetId)!.delete(rank);
    }
  } else {
    // Target doesn't have the rank
    if (!memory.has(targetId)) memory.set(targetId, new Set());
    // We now know target DOESN'T have this rank, but our memory tracks "likely has"
    // So remove it if we thought they did
    if (memory.has(targetId)) {
      memory.get(targetId)!.delete(rank);
    }
  }

  // If a book was made, remove that rank from all memory
  if (newBook) {
    for (const [, rankSet] of memory) {
      rankSet.delete(newBook);
    }
  }
}

export function getAIDelay(): number {
  return 800 + Math.floor(Math.random() * 1200);
}
