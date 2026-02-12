const CARD_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const HAND_RANK_NAMES = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
  10: 'Five of a Kind'
};

function cardValue(card) {
  return CARD_VALUES[card.value];
}

function sortByValueDesc(cards) {
  return [...cards].sort((a, b) => cardValue(b) - cardValue(a));
}

function getValueCounts(cards) {
  const counts = new Map();
  for (const card of cards) {
    const v = cardValue(card);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}

function isFlush(cards) {
  return cards.every(c => c.suit === cards[0].suit);
}

function isStraight(cards) {
  const sorted = sortByValueDesc(cards);
  const values = sorted.map(c => cardValue(c));
  const unique = [...new Set(values)];
  if (unique.length !== 5) return { straight: false, highCard: 0 };

  if (unique[0] - unique[4] === 4) {
    return { straight: true, highCard: unique[0] };
  }

  // Ace-low straight (A-2-3-4-5)
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return { straight: true, highCard: 5 };
  }

  return { straight: false, highCard: 0 };
}

function evaluateHand(cards) {
  if (cards.length !== 5) {
    return { rank: 0, name: 'Invalid', tiebreakers: [] };
  }

  const flush = isFlush(cards);
  const { straight, highCard: straightHigh } = isStraight(cards);
  const counts = getValueCounts(cards);
  const sorted = sortByValueDesc(cards);

  const groups = [];
  counts.forEach((count, value) => groups.push({ value, count }));
  groups.sort((a, b) => b.count - a.count || b.value - a.value);

  if (flush && straight && straightHigh === 14) {
    return { rank: 9, name: HAND_RANK_NAMES[9], tiebreakers: [14] };
  }
  if (flush && straight) {
    return { rank: 8, name: HAND_RANK_NAMES[8], tiebreakers: [straightHigh] };
  }
  if (groups[0].count === 4) {
    return { rank: 7, name: HAND_RANK_NAMES[7], tiebreakers: [groups[0].value, groups[1].value] };
  }
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: 6, name: HAND_RANK_NAMES[6], tiebreakers: [groups[0].value, groups[1].value] };
  }
  if (flush) {
    return { rank: 5, name: HAND_RANK_NAMES[5], tiebreakers: sorted.map(c => cardValue(c)) };
  }
  if (straight) {
    return { rank: 4, name: HAND_RANK_NAMES[4], tiebreakers: [straightHigh] };
  }
  if (groups[0].count === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: 3, name: HAND_RANK_NAMES[3], tiebreakers: [groups[0].value, ...kickers] };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].value, groups[1].value);
    const lowPair = Math.min(groups[0].value, groups[1].value);
    return { rank: 2, name: HAND_RANK_NAMES[2], tiebreakers: [highPair, lowPair, groups[2].value] };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: 1, name: HAND_RANK_NAMES[1], tiebreakers: [groups[0].value, ...kickers] };
  }
  return { rank: 0, name: HAND_RANK_NAMES[0], tiebreakers: sorted.map(c => cardValue(c)) };
}

// --- Wild Card Support ---

const ALL_SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const ALL_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const ALL_CARDS = [];
for (const suit of ALL_SUITS) {
  for (const value of ALL_VALUES) {
    ALL_CARDS.push({ suit, value });
  }
}

function isCardWild(card, wilds) {
  if (!wilds || wilds.length === 0) return false;
  if (card.suit === 'joker') return true;
  if (wilds.includes('one-eyed-jacks') && card.value === 'J' && (card.suit === 'spades' || card.suit === 'hearts')) return true;
  if (wilds.includes('suicide-king') && card.value === 'K' && card.suit === 'hearts') return true;
  if (wilds.includes('deuces') && card.value === '2') return true;
  // Value-based wilds (e.g. '3', '6', '9')
  if (wilds.includes(card.value)) return true;
  return false;
}

function evaluateHandWithWilds(cards, wilds) {
  if (!wilds || wilds.length === 0) return evaluateHand(cards);

  const wildIndices = [];
  const naturals = [];
  for (let i = 0; i < cards.length; i++) {
    if (isCardWild(cards[i], wilds)) wildIndices.push(i);
    else naturals.push(cards[i]);
  }

  if (wildIndices.length === 0) return evaluateHand(cards);
  if (wildIndices.length >= 5) return { rank: 10, name: HAND_RANK_NAMES[10], tiebreakers: [14] };
  if (wildIndices.length === 4) {
    const v = cardValue(naturals[0]);
    return { rank: 10, name: HAND_RANK_NAMES[10], tiebreakers: [v] };
  }
  if (wildIndices.length === 3) return bestHandWith3Wilds(naturals);

  // 1-2 wilds: brute force
  let best = null;
  const hand = [...cards];
  if (wildIndices.length === 1) {
    for (const sub of ALL_CARDS) {
      hand[wildIndices[0]] = sub;
      const result = evaluateHand(hand);
      if (!best || compareHands(result, best) > 0) best = result;
    }
  } else {
    for (const s1 of ALL_CARDS) {
      hand[wildIndices[0]] = s1;
      for (const s2 of ALL_CARDS) {
        hand[wildIndices[1]] = s2;
        const result = evaluateHand(hand);
        if (!best || compareHands(result, best) > 0) best = result;
      }
    }
  }
  return best || evaluateHand(cards);
}

function bestHandWith3Wilds(naturals) {
  const v1 = cardValue(naturals[0]);
  const v2 = cardValue(naturals[1]);

  if (v1 === v2) return { rank: 10, name: HAND_RANK_NAMES[10], tiebreakers: [v1] };

  if (naturals[0].suit === naturals[1].suit) {
    const straightRanges = [
      [14, 13, 12, 11, 10], [13, 12, 11, 10, 9], [12, 11, 10, 9, 8],
      [11, 10, 9, 8, 7], [10, 9, 8, 7, 6], [9, 8, 7, 6, 5],
      [8, 7, 6, 5, 4], [7, 6, 5, 4, 3], [6, 5, 4, 3, 2], [14, 5, 4, 3, 2]
    ];
    for (const range of straightRanges) {
      if (range.includes(v1) && range.includes(v2)) {
        const high = range[0] === 14 && range[1] === 5 ? 5 : range[0];
        if (high === 14 && range[0] === 14 && range[1] === 13) {
          return { rank: 9, name: HAND_RANK_NAMES[9], tiebreakers: [14] };
        }
        return { rank: 8, name: HAND_RANK_NAMES[8], tiebreakers: [high] };
      }
    }
  }

  const highVal = Math.max(v1, v2);
  const lowVal = Math.min(v1, v2);
  return { rank: 7, name: HAND_RANK_NAMES[7], tiebreakers: [highVal, lowVal] };
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) {
      return a.tiebreakers[i] - b.tiebreakers[i];
    }
  }
  return 0;
}

function determineWinners(hands, wilds) {
  wilds = wilds || [];
  let bestResult = null;
  let winnerIds = [];

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

  return { winnerIds, result: bestResult };
}

function combinations5(n) {
  const result = [];
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            result.push([a, b, c, d, e]);
  return result;
}

function evaluateBestHand(cards) {
  if (cards.length <= 5) return evaluateHand(cards);
  const combos = combinations5(cards.length);
  let best = null;
  for (const combo of combos) {
    const hand = combo.map(i => cards[i]);
    const result = evaluateHand(hand);
    if (!best || compareHands(result, best) > 0) best = result;
  }
  return best;
}

function evaluateBestHandWithWilds(cards, wilds) {
  if (!wilds || wilds.length === 0) return evaluateBestHand(cards);
  if (cards.length <= 5) return evaluateHandWithWilds(cards, wilds);
  const combos = combinations5(cards.length);
  let best = null;
  for (const combo of combos) {
    const hand = combo.map(i => cards[i]);
    const result = evaluateHandWithWilds(hand, wilds);
    if (!best || compareHands(result, best) > 0) best = result;
  }
  return best;
}

module.exports = { evaluateHand, evaluateHandWithWilds, evaluateBestHand, evaluateBestHandWithWilds, isCardWild, compareHands, determineWinners, CARD_VALUES, HAND_RANK_NAMES };
