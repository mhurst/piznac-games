import { Card, HandResult, HandRank, HAND_RANK_NAMES, CARD_VALUES, WildCardOption, isCardWild, Suit } from './poker-types';

function cardValue(card: Card): number {
  return CARD_VALUES[card.value];
}

function sortByValueDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => cardValue(b) - cardValue(a));
}

function getValueCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const v = cardValue(card);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}

function isFlush(cards: Card[]): boolean {
  return cards.every(c => c.suit === cards[0].suit);
}

function isStraight(cards: Card[]): { straight: boolean; highCard: number } {
  const sorted = sortByValueDesc(cards);
  const values = sorted.map(c => cardValue(c));
  const unique = [...new Set(values)];
  if (unique.length !== 5) return { straight: false, highCard: 0 };

  // Normal straight: consecutive descending
  if (unique[0] - unique[4] === 4) {
    return { straight: true, highCard: unique[0] };
  }

  // Ace-low straight (A-2-3-4-5): A=14, then 5,4,3,2
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return { straight: true, highCard: 5 }; // 5-high straight
  }

  return { straight: false, highCard: 0 };
}

export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length !== 5) {
    return { rank: HandRank.HighCard, name: 'Invalid', tiebreakers: [] };
  }

  const flush = isFlush(cards);
  const { straight, highCard: straightHigh } = isStraight(cards);
  const counts = getValueCounts(cards);
  const sorted = sortByValueDesc(cards);

  // Group by count for pair/trips/quads detection
  const groups: { value: number; count: number }[] = [];
  counts.forEach((count, value) => groups.push({ value, count }));
  // Sort: highest count first, then by value descending
  groups.sort((a, b) => b.count - a.count || b.value - a.value);

  // Royal Flush
  if (flush && straight && straightHigh === 14) {
    return { rank: HandRank.RoyalFlush, name: HAND_RANK_NAMES[HandRank.RoyalFlush], tiebreakers: [14] };
  }

  // Straight Flush
  if (flush && straight) {
    return { rank: HandRank.StraightFlush, name: HAND_RANK_NAMES[HandRank.StraightFlush], tiebreakers: [straightHigh] };
  }

  // Four of a Kind
  if (groups[0].count === 4) {
    const quadVal = groups[0].value;
    const kicker = groups[1].value;
    return { rank: HandRank.FourOfAKind, name: HAND_RANK_NAMES[HandRank.FourOfAKind], tiebreakers: [quadVal, kicker] };
  }

  // Full House
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: HandRank.FullHouse, name: HAND_RANK_NAMES[HandRank.FullHouse], tiebreakers: [groups[0].value, groups[1].value] };
  }

  // Flush
  if (flush) {
    const tiebreakers = sorted.map(c => cardValue(c));
    return { rank: HandRank.Flush, name: HAND_RANK_NAMES[HandRank.Flush], tiebreakers };
  }

  // Straight
  if (straight) {
    return { rank: HandRank.Straight, name: HAND_RANK_NAMES[HandRank.Straight], tiebreakers: [straightHigh] };
  }

  // Three of a Kind
  if (groups[0].count === 3) {
    const tripVal = groups[0].value;
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: HandRank.ThreeOfAKind, name: HAND_RANK_NAMES[HandRank.ThreeOfAKind], tiebreakers: [tripVal, ...kickers] };
  }

  // Two Pair
  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].value, groups[1].value);
    const lowPair = Math.min(groups[0].value, groups[1].value);
    const kicker = groups[2].value;
    return { rank: HandRank.TwoPair, name: HAND_RANK_NAMES[HandRank.TwoPair], tiebreakers: [highPair, lowPair, kicker] };
  }

  // One Pair
  if (groups[0].count === 2) {
    const pairVal = groups[0].value;
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: HandRank.OnePair, name: HAND_RANK_NAMES[HandRank.OnePair], tiebreakers: [pairVal, ...kickers] };
  }

  // High Card
  const tiebreakers = sorted.map(c => cardValue(c));
  return { rank: HandRank.HighCard, name: HAND_RANK_NAMES[HandRank.HighCard], tiebreakers };
}

// --- Wild Card Evaluation ---

const ALL_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const ALL_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** All 52 standard cards for substitution. */
const ALL_CARDS: Card[] = [];
for (const suit of ALL_SUITS) {
  for (const value of ALL_VALUES) {
    ALL_CARDS.push({ suit, value });
  }
}

/**
 * Evaluate a hand that may contain wild cards.
 * Wild cards are substituted for the best possible hand.
 */
export function evaluateHandWithWilds(cards: Card[], wilds: WildCardOption[]): HandResult {
  if (!wilds || wilds.length === 0) return evaluateHand(cards);

  const wildIndices: number[] = [];
  const naturals: Card[] = [];

  for (let i = 0; i < cards.length; i++) {
    if (isCardWild(cards[i], wilds)) {
      wildIndices.push(i);
    } else {
      naturals.push(cards[i]);
    }
  }

  const numWilds = wildIndices.length;
  if (numWilds === 0) return evaluateHand(cards);

  // 5 wilds: Five Aces
  if (numWilds >= 5) {
    return { rank: HandRank.FiveOfAKind, name: HAND_RANK_NAMES[HandRank.FiveOfAKind], tiebreakers: [14] };
  }

  // 4 wilds + 1 natural: Five of a Kind of that card's value
  if (numWilds === 4) {
    const v = cardValue(naturals[0]);
    return { rank: HandRank.FiveOfAKind, name: HAND_RANK_NAMES[HandRank.FiveOfAKind], tiebreakers: [v] };
  }

  // 3 wilds: analytical approach
  if (numWilds === 3) {
    return bestHandWith3Wilds(naturals);
  }

  // 1-2 wilds: brute force (max 2704 evaluations)
  return bruteForceWilds(cards, wildIndices);
}

/** Brute force: try all possible substitutions for 1-2 wild cards. */
function bruteForceWilds(cards: Card[], wildIndices: number[]): HandResult {
  let best: HandResult | null = null;
  const hand = [...cards];

  if (wildIndices.length === 1) {
    const wi = wildIndices[0];
    for (const sub of ALL_CARDS) {
      hand[wi] = sub;
      const result = evaluateHand(hand);
      if (!best || compareHands(result, best) > 0) best = result;
      // Can't beat Five of a Kind (but we only have 1 wild, so max is 4-of-a-kind-ish... unless dupes allowed)
      // Actually wilds CAN represent cards already in hand, so Four of a Kind is possible
    }
  } else if (wildIndices.length === 2) {
    const [w1, w2] = wildIndices;
    for (const s1 of ALL_CARDS) {
      hand[w1] = s1;
      for (const s2 of ALL_CARDS) {
        hand[w2] = s2;
        const result = evaluateHand(hand);
        if (!best || compareHands(result, best) > 0) best = result;
      }
    }
  }

  // Check if we can make Five of a Kind (duplicate values allowed with wilds)
  // The brute force already covers this since ALL_CARDS includes all values

  return best || evaluateHand(cards);
}

/** Analytical best hand with 3 wilds + 2 naturals. */
function bestHandWith3Wilds(naturals: Card[]): HandResult {
  const [n1, n2] = naturals;
  const v1 = cardValue(n1);
  const v2 = cardValue(n2);

  // Same value: Five of a Kind
  if (v1 === v2) {
    return { rank: HandRank.FiveOfAKind, name: HAND_RANK_NAMES[HandRank.FiveOfAKind], tiebreakers: [v1] };
  }

  // Same suit: check for Royal Flush or Straight Flush
  if (n1.suit === n2.suit) {
    // Try all 5-card straights that include both values
    const straightRanges = [
      [14, 13, 12, 11, 10], // Royal
      [13, 12, 11, 10, 9], [12, 11, 10, 9, 8], [11, 10, 9, 8, 7],
      [10, 9, 8, 7, 6], [9, 8, 7, 6, 5], [8, 7, 6, 5, 4],
      [7, 6, 5, 4, 3], [6, 5, 4, 3, 2],
      [14, 5, 4, 3, 2] // Ace-low (A is 14 but counts as 1)
    ];

    // Normalize ace-low: for range check, use the sorted values
    for (const range of straightRanges) {
      if (range.includes(v1) && range.includes(v2)) {
        const high = range[0] === 14 && range[1] === 5 ? 5 : range[0];
        if (high === 14 && range[0] === 14 && range[1] === 13) {
          return { rank: HandRank.RoyalFlush, name: HAND_RANK_NAMES[HandRank.RoyalFlush], tiebreakers: [14] };
        }
        return { rank: HandRank.StraightFlush, name: HAND_RANK_NAMES[HandRank.StraightFlush], tiebreakers: [high] };
      }
    }
  }

  // Different suit or can't make straight flush: Four of a Kind of the higher card
  const highVal = Math.max(v1, v2);
  const lowVal = Math.min(v1, v2);
  return { rank: HandRank.FourOfAKind, name: HAND_RANK_NAMES[HandRank.FourOfAKind], tiebreakers: [highVal, lowVal] };
}

/**
 * Compare two hand results. Returns:
 *  > 0 if hand a wins
 *  < 0 if hand b wins
 *  0 if tie
 */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;

  // Same rank — compare tiebreakers
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) {
      return a.tiebreakers[i] - b.tiebreakers[i];
    }
  }
  return 0;
}

/**
 * Given multiple players' hands, determine winners (can be multiple for split pot).
 * Returns array of indices into the input array.
 */
export function determineWinners(hands: { cards: Card[]; playerId: string }[], wilds: WildCardOption[] = []): { winnerIds: string[]; result: HandResult } {
  let bestResult: HandResult | null = null;
  let winnerIds: string[] = [];

  for (const hand of hands) {
    // Use best-5-of-N for hands with >5 cards (stud)
    const useMulti = hand.cards.length > 5;
    const result = useMulti
      ? (wilds.length > 0 ? evaluateBestHandWithWilds(hand.cards, wilds) : evaluateBestHand(hand.cards))
      : (wilds.length > 0 ? evaluateHandWithWilds(hand.cards, wilds) : evaluateHand(hand.cards));
    if (!bestResult) {
      bestResult = result;
      winnerIds = [hand.playerId];
    } else {
      const cmp = compareHands(result, bestResult);
      if (cmp > 0) {
        bestResult = result;
        winnerIds = [hand.playerId];
      } else if (cmp === 0) {
        winnerIds.push(hand.playerId);
      }
    }
  }

  return { winnerIds, result: bestResult! };
}

/**
 * Generate all C(n,5) index combinations for choosing 5 cards from n.
 */
function combinations5(n: number): number[][] {
  const result: number[][] = [];
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            result.push([a, b, c, d, e]);
  return result;
}

/**
 * Evaluate the best 5-card hand from 6 or 7 cards (no wilds).
 * Tries all C(n,5) combos and returns the best.
 */
export function evaluateBestHand(cards: Card[]): HandResult {
  if (cards.length <= 5) return evaluateHand(cards);
  const combos = combinations5(cards.length);
  let best: HandResult | null = null;
  for (const combo of combos) {
    const hand = combo.map(i => cards[i]);
    const result = evaluateHand(hand);
    if (!best || compareHands(result, best) > 0) best = result;
  }
  return best!;
}

/**
 * Evaluate the best 5-card hand from 6 or 7 cards with wild card substitution.
 */
export function evaluateBestHandWithWilds(cards: Card[], wilds: WildCardOption[]): HandResult {
  if (!wilds || wilds.length === 0) return evaluateBestHand(cards);
  if (cards.length <= 5) return evaluateHandWithWilds(cards, wilds);
  const combos = combinations5(cards.length);
  let best: HandResult | null = null;
  for (const combo of combos) {
    const hand = combo.map(i => cards[i]);
    const result = evaluateHandWithWilds(hand, wilds);
    if (!best || compareHands(result, best) > 0) best = result;
  }
  return best!;
}

/**
 * Calculate hand strength as a percentile (0-1) for AI decision making.
 * Based on pre-flop hand categories for 5-card draw.
 */
export function handStrength(cards: Card[], wilds: WildCardOption[] = []): number {
  const result = wilds.length > 0 ? evaluateHandWithWilds(cards, wilds) : evaluateHand(cards);
  // Base score from rank
  const rankScore = result.rank / HandRank.FiveOfAKind;
  // Fine-tune with tiebreakers normalized to 0-1
  const tbScore = result.tiebreakers.length > 0
    ? (result.tiebreakers[0] - 2) / 12 * 0.05
    : 0;
  return Math.min(1, rankScore + tbScore);
}

/**
 * Count how many cards could improve the hand (outs) for draw decisions.
 * Returns indices of cards that should be discarded for improvement.
 */
export function suggestDiscards(cards: Card[], wilds: WildCardOption[] = []): number[] {
  // Never discard wild cards — filter them from final result
  const wildIndices = new Set<number>();
  if (wilds.length > 0) {
    cards.forEach((c, i) => { if (isCardWild(c, wilds)) wildIndices.add(i); });
    // If all cards are wild or hand is strong with wilds, keep everything
    if (wildIndices.size >= cards.length) return [];
  }

  const rawDiscards = suggestDiscardsRaw(cards, wilds);
  return rawDiscards.filter(i => !wildIndices.has(i));
}

function suggestDiscardsRaw(cards: Card[], wilds: WildCardOption[]): number[] {
  // Evaluate full hand (with wilds) to check for strong made hands
  const result = wilds.length > 0 ? evaluateHandWithWilds(cards, wilds) : evaluateHand(cards);

  // Don't discard anything for strong made hands
  if (result.rank >= HandRank.Straight) return [];
  // Also keep four-of-a-kind and full house (with wild enhancement)
  if (result.rank === HandRank.FourOfAKind || result.rank === HandRank.FullHouse) return [];

  // For pattern matching, analyze NATURAL cards only (wilds are kept by wrapper)
  const hasWilds = wilds.length > 0;
  const naturalCards = hasWilds ? cards.filter(c => !isCardWild(c, wilds)) : cards;
  if (naturalCards.length === 0) return [];

  const counts = getValueCounts(naturalCards);
  const sorted = sortByValueDesc(naturalCards);

  // Group by count for pair/trips detection on natural cards
  const groups: { value: number; count: number }[] = [];
  counts.forEach((count, value) => groups.push({ value, count }));
  groups.sort((a, b) => b.count - a.count || b.value - a.value);

  // Natural three of a kind — discard the kickers
  if (groups.length > 0 && groups[0].count >= 3) {
    const tripVal = groups[0].value;
    return cards.map((c, i) => {
      if (hasWilds && isCardWild(c, wilds)) return -1;
      return cardValue(c) !== tripVal ? i : -1;
    }).filter(i => i !== -1);
  }

  // Natural two pair — discard the kicker
  if (groups.length >= 2 && groups[0].count === 2 && groups[1].count === 2) {
    const pairVals = [groups[0].value, groups[1].value];
    return cards.map((c, i) => {
      if (hasWilds && isCardWild(c, wilds)) return -1;
      return !pairVals.includes(cardValue(c)) ? i : -1;
    }).filter(i => i !== -1);
  }

  // Natural one pair — discard the kickers
  if (groups.length > 0 && groups[0].count === 2) {
    const pairVal = groups[0].value;
    return cards.map((c, i) => {
      if (hasWilds && isCardWild(c, wilds)) return -1;
      return cardValue(c) !== pairVal ? i : -1;
    }).filter(i => i !== -1);
  }

  // Check for 4-card flush draw (natural cards only)
  const suitCounts = new Map<string, number>();
  for (const card of naturalCards) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  }
  for (const [suit, count] of suitCounts) {
    if (count === 4) {
      return cards.map((c, i) => {
        if (hasWilds && isCardWild(c, wilds)) return -1;
        return c.suit !== suit ? i : -1;
      }).filter(i => i !== -1);
    }
  }

  // Check for 4-card straight draw (open-ended, natural cards only)
  const values = sorted.map(c => cardValue(c));
  for (let i = 0; i <= Math.max(0, values.length - 4); i++) {
    const sub = values.slice(i, i + 4);
    if (sub.length === 4 && sub[0] - sub[3] === 3 && new Set(sub).size === 4) {
      const keepValues = new Set(sub);
      return cards.map((c, idx) => {
        if (hasWilds && isCardWild(c, wilds)) return -1;
        return !keepValues.has(cardValue(c)) ? idx : -1;
      }).filter(idx => idx !== -1);
    }
  }

  // No strong natural pattern — keep the best 2 natural cards, discard rest
  const keepCount = 2;
  const sortedNatural = naturalCards
    .map(c => ({ value: cardValue(c), origIndex: cards.indexOf(c) }))
    .sort((a, b) => b.value - a.value);
  const keepIndices = new Set(sortedNatural.slice(0, keepCount).map(x => x.origIndex));
  return cards.map((c, i) => {
    if (hasWilds && isCardWild(c, wilds)) return -1;
    return !keepIndices.has(i) ? i : -1;
  }).filter(i => i !== -1);
}

/**
 * Calculate the max number of cards a player can discard.
 * Standard 5-Card Draw: 3 max, or 4 if keeping an ace.
 */
export function getMaxDiscardsForHand(cards: Card[]): number {
  const hasAce = cards.some(c => c.value === 'A');
  return hasAce ? 4 : 3;
}
