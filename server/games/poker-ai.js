/**
 * Server-side Poker AI — ported from client/src/app/core/ai/poker.ai.ts
 * Used for AI bots in multiplayer poker games.
 */

const { evaluateHand, evaluateHandWithWilds, evaluateBestHand, evaluateBestHandWithWilds, isCardWild, CARD_VALUES } = require('./poker-hand-evaluator');

const MIN_BET = 5;

const VARIANTS = ['five-card-draw', 'seven-card-stud', 'texas-holdem', 'follow-the-queen'];

const WILD_OPTIONS = [
  'jokers', 'one-eyed-jacks', 'suicide-king', 'deuces',
  '3', '4', '5', '6', '7', '8', '9'
];

/** Round a raise amount to the nearest MIN_BET increment, clamped to available chips. */
function roundRaise(amount, chips) {
  const rounded = Math.max(MIN_BET, Math.round(amount / MIN_BET) * MIN_BET);
  return Math.min(rounded, chips);
}

// --- Hand evaluation helpers (not exported from poker-hand-evaluator) ---

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

/**
 * Calculate hand strength as a percentile (0-1).
 */
function handStrength(cards, wilds) {
  wilds = wilds || [];
  const result = wilds.length > 0 ? evaluateHandWithWilds(cards, wilds) : evaluateHand(cards);
  const rankScore = result.rank / 10; // FiveOfAKind = 10
  const tbScore = result.tiebreakers.length > 0
    ? (result.tiebreakers[0] - 2) / 12 * 0.05
    : 0;
  return Math.min(1, rankScore + tbScore);
}

/**
 * Hand strength for >5 cards (stud): use best-5-of-N evaluation.
 */
function handStrengthMulti(cards, wilds) {
  wilds = wilds || [];
  const result = wilds.length > 0 ? evaluateBestHandWithWilds(cards, wilds) : evaluateBestHand(cards);
  const rankScore = result.rank / 10;
  const tbScore = result.tiebreakers.length > 0
    ? (result.tiebreakers[0] - 2) / 12 * 0.05
    : 0;
  return Math.min(1, rankScore + tbScore);
}

/**
 * Preflop hand strength heuristic for Texas Hold'em (2 hole cards).
 */
function holdemPreflopStrength(hole) {
  if (hole.length !== 2) return 0.2;

  const v1 = CARD_VALUES[hole[0].value] || 0;
  const v2 = CARD_VALUES[hole[1].value] || 0;
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const isPair = v1 === v2;
  const isSuited = hole[0].suit === hole[1].suit;
  const gap = high - low;
  const isConnected = gap === 1;

  let score = 0;

  if (isPair) {
    score = 0.45 + (low - 2) / 12 * 0.5;
  } else {
    score = (high - 2) / 12 * 0.35 + (low - 2) / 12 * 0.10;
    if (isSuited) score += 0.06;
    if (isConnected) score += 0.04;
    else if (gap === 2) score += 0.02;
    if (gap >= 5) score -= 0.05;
  }

  return Math.max(0.08, Math.min(0.95, score));
}

// --- Suggest discards (ported from client poker-hand-evaluator.ts) ---

function suggestDiscards(cards, wilds) {
  wilds = wilds || [];
  const wildIndices = new Set();
  if (wilds.length > 0) {
    cards.forEach((c, i) => { if (isCardWild(c, wilds)) wildIndices.add(i); });
    if (wildIndices.size >= cards.length) return [];
  }

  const rawDiscards = suggestDiscardsRaw(cards, wilds);
  return rawDiscards.filter(i => !wildIndices.has(i));
}

function suggestDiscardsRaw(cards, wilds) {
  const result = wilds.length > 0 ? evaluateHandWithWilds(cards, wilds) : evaluateHand(cards);

  if (result.rank >= 4) return []; // Straight or better
  if (result.rank === 7 || result.rank === 6) return []; // Four of a kind / Full house

  const hasWilds = wilds.length > 0;
  const naturalCards = hasWilds ? cards.filter(c => !isCardWild(c, wilds)) : cards;
  if (naturalCards.length === 0) return [];

  const counts = getValueCounts(naturalCards);
  const sorted = sortByValueDesc(naturalCards);

  const groups = [];
  counts.forEach((count, value) => groups.push({ value, count }));
  groups.sort((a, b) => b.count - a.count || b.value - a.value);

  // Three of a kind — discard kickers
  if (groups.length > 0 && groups[0].count >= 3) {
    const tripVal = groups[0].value;
    return cards.map((c, i) => {
      if (hasWilds && isCardWild(c, wilds)) return -1;
      return cardValue(c) !== tripVal ? i : -1;
    }).filter(i => i !== -1);
  }

  // Two pair — discard kicker
  if (groups.length >= 2 && groups[0].count === 2 && groups[1].count === 2) {
    const pairVals = [groups[0].value, groups[1].value];
    return cards.map((c, i) => {
      if (hasWilds && isCardWild(c, wilds)) return -1;
      return !pairVals.includes(cardValue(c)) ? i : -1;
    }).filter(i => i !== -1);
  }

  // One pair — discard kickers
  if (groups.length > 0 && groups[0].count === 2) {
    const pairVal = groups[0].value;
    return cards.map((c, i) => {
      if (hasWilds && isCardWild(c, wilds)) return -1;
      return cardValue(c) !== pairVal ? i : -1;
    }).filter(i => i !== -1);
  }

  // 4-card flush draw
  const suitCounts = new Map();
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

  // 4-card straight draw
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

  // No strong pattern — keep best 2 natural cards
  const sortedNatural = naturalCards
    .map(c => ({ value: cardValue(c), origIndex: cards.indexOf(c) }))
    .sort((a, b) => b.value - a.value);
  const keepIndices = new Set(sortedNatural.slice(0, 2).map(x => x.origIndex));
  return cards.map((c, i) => {
    if (hasWilds && isCardWild(c, wilds)) return -1;
    return !keepIndices.has(i) ? i : -1;
  }).filter(i => i !== -1);
}

// --- Betting decisions ---

function easyBet(ctx, strength, rank, toCall) {
  if (toCall === 0) {
    if (rank >= 1 && Math.random() < 0.3) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
    }
    return { action: 'check' };
  }
  if (rank >= 2) return { action: 'call' };
  if (rank >= 1) return Math.random() < 0.6 ? { action: 'call' } : { action: 'fold' };
  return Math.random() < 0.7 ? { action: 'fold' } : { action: 'call' };
}

function mediumBet(ctx, strength, rank, toCall) {
  const potOdds = toCall > 0 ? toCall / (ctx.pot + toCall) : 0;
  const bluff = Math.random() < 0.15;

  if (toCall === 0) {
    if (rank >= 3) {
      return { action: 'raise', raiseAmount: roundRaise(Math.max(ctx.minRaise, ctx.pot), ctx.chips) };
    }
    if (rank >= 1) {
      return Math.random() < 0.5
        ? { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) }
        : { action: 'check' };
    }
    if (bluff) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
    }
    return { action: 'check' };
  }

  if (rank >= 3) {
    if (Math.random() < 0.4) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise * 2, ctx.chips) };
    }
    return { action: 'call' };
  }
  if (rank >= 1) {
    return strength > potOdds ? { action: 'call' } : { action: 'fold' };
  }
  if (bluff && toCall <= ctx.minRaise * 2) {
    return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
  }
  return Math.random() < 0.2 ? { action: 'call' } : { action: 'fold' };
}

function hardBet(ctx, strength, rank, toCall) {
  const potOdds = toCall > 0 ? toCall / (ctx.pot + toCall) : 0;
  const bluffFreq = 0.20;
  const isBluff = Math.random() < bluffFreq;
  const positionFactor = ctx.playersInHand <= 3 ? 1.15 : 1.0;
  const adjustedStrength = Math.min(1, strength * positionFactor);

  if (toCall === 0) {
    if (adjustedStrength >= 0.6) {
      const betSize = Math.max(ctx.minRaise, Math.floor(ctx.pot * adjustedStrength * 0.75));
      return { action: 'raise', raiseAmount: roundRaise(betSize, ctx.chips) };
    }
    if (adjustedStrength >= 0.35 && Math.random() < 0.35) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
    }
    if (isBluff && adjustedStrength < 0.25) {
      const bluffSize = Math.max(ctx.minRaise, Math.floor(ctx.pot * 0.6));
      return { action: 'raise', raiseAmount: roundRaise(bluffSize, ctx.chips) };
    }
    return { action: 'check' };
  }

  const isEarlyRound = ctx.phase === 'betting1' || ctx.phase === 'betting3' || ctx.phase === 'betting4';
  const effectiveOdds = potOdds * (isEarlyRound ? 1.3 : 1.0);

  if (adjustedStrength >= 0.7) {
    if (Math.random() < 0.5) {
      const raiseSize = Math.max(ctx.minRaise, Math.floor(toCall * 2));
      return { action: 'raise', raiseAmount: roundRaise(raiseSize, ctx.chips) };
    }
    return { action: 'call' };
  }

  if (adjustedStrength >= effectiveOdds) return { action: 'call' };

  if (isBluff && ctx.playersInHand <= 3 && toCall <= ctx.chips * 0.15) {
    return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise * 3, ctx.chips) };
  }

  if (isEarlyRound && toCall <= ctx.chips * 0.05) return { action: 'call' };

  return { action: 'fold' };
}

// --- Draw decisions ---

function easyDraw(hand, rank, wilds) {
  wilds = wilds || [];
  if (rank >= 4) return []; // Straight or better

  const counts = new Map();
  for (const card of hand) {
    if (wilds.length > 0 && isCardWild(card, wilds)) continue;
    const v = CARD_VALUES[card.value];
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const keptValues = new Set();
  for (const [val, count] of counts) {
    if (count >= 2) keptValues.add(val);
  }

  if (keptValues.size === 0) {
    const sorted = hand.map((c, i) => ({ val: CARD_VALUES[c.value] || 0, i, wild: wilds.length > 0 && isCardWild(c, wilds) }))
      .sort((a, b) => (b.wild ? 100 : b.val) - (a.wild ? 100 : a.val));
    return sorted.slice(2).map(x => x.i);
  }

  return hand.map((c, i) => {
    if (wilds.length > 0 && isCardWild(c, wilds)) return -1;
    return !keptValues.has(CARD_VALUES[c.value]) ? i : -1;
  }).filter(i => i !== -1);
}

function mediumDraw(hand, rank, wilds) {
  wilds = wilds || [];
  if (rank >= 4) return [];

  const suitCounts = new Map();
  for (const card of hand) {
    if (wilds.length > 0 && isCardWild(card, wilds)) continue;
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  }
  for (const [suit, count] of suitCounts) {
    if (count === 4) {
      return hand.map((c, i) => {
        if (wilds.length > 0 && isCardWild(c, wilds)) return -1;
        return c.suit !== suit ? i : -1;
      }).filter(i => i !== -1);
    }
  }

  return suggestDiscards(hand, wilds);
}

/**
 * Enforce 5-Card Draw limit: max 3 discards, or 4 if keeping an ace or wild.
 */
function enforceDrawLimit(hand, discards, wilds) {
  wilds = wilds || [];
  if (wilds.length > 0) {
    discards = discards.filter(i => !isCardWild(hand[i], wilds));
  }

  if (discards.length <= 3) return discards;

  const hasKeptAce = hand.some((c, i) => c.value === 'A' && !discards.includes(i));
  if (discards.length === 4 && hasKeptAce) return discards;

  const sorted = discards
    .map(i => ({ index: i, value: CARD_VALUES[hand[i].value] }))
    .sort((a, b) => a.value - b.value);

  return sorted.slice(0, 3).map(x => x.index);
}

// --- Public API ---

/**
 * Get a betting decision for an AI player.
 */
function getAIBettingDecision(difficulty, context) {
  const toCall = context.currentBet - context.myBet;
  const wilds = context.wilds || [];
  const community = context.communityCards || [];

  let strength;
  let rank;

  if (context.isHoldem) {
    if (community.length === 0) {
      strength = holdemPreflopStrength(context.hand);
      rank = strength >= 0.6 ? 1 : 0; // OnePair : HighCard
    } else {
      const allCards = [...context.hand, ...community];
      const result = evaluateBestHand(allCards);
      strength = handStrengthMulti(allCards, []);
      rank = result.rank;
    }
  } else {
    const isMulti = context.hand.length > 5;
    strength = isMulti ? handStrengthMulti(context.hand, wilds) : handStrength(context.hand, wilds);
    const result = isMulti
      ? (wilds.length > 0 ? evaluateBestHandWithWilds(context.hand, wilds) : evaluateBestHand(context.hand))
      : (wilds.length > 0 ? evaluateHandWithWilds(context.hand, wilds) : evaluateHand(context.hand));
    rank = result.rank;
  }

  switch (difficulty) {
    case 'easy': return easyBet(context, strength, rank, toCall);
    case 'medium': return mediumBet(context, strength, rank, toCall);
    case 'hard': return hardBet(context, strength, rank, toCall);
    default: return mediumBet(context, strength, rank, toCall);
  }
}

/**
 * Get draw decisions for an AI player.
 */
function getAIDrawDecision(difficulty, hand, wilds) {
  wilds = wilds || [];
  const result = wilds.length > 0 ? evaluateHandWithWilds(hand, wilds) : evaluateHand(hand);

  let discards;
  switch (difficulty) {
    case 'easy': discards = easyDraw(hand, result.rank, wilds); break;
    case 'medium': discards = mediumDraw(hand, result.rank, wilds); break;
    case 'hard': discards = suggestDiscards(hand, wilds); break;
    default: discards = mediumDraw(hand, result.rank, wilds); break;
  }

  return enforceDrawLimit(hand, discards, wilds);
}

/**
 * Pick a random variant for AI dealer.
 */
function getAIVariantChoice() {
  return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
}

/**
 * Pick wild cards for AI dealer.
 */
function getAIWildChoice(variant) {
  // 50% no wilds, 50% random 1-2 wild options
  if (Math.random() < 0.5) {
    return { wilds: [], lastCardDown: true };
  }
  const count = Math.random() < 0.7 ? 1 : 2;
  const shuffled = [...WILD_OPTIONS].sort(() => Math.random() - 0.5);
  return { wilds: shuffled.slice(0, count), lastCardDown: Math.random() < 0.7 };
}

/**
 * Get a randomized delay for AI actions (milliseconds).
 */
function getAIDelay() {
  return 800 + Math.random() * 1200;
}

module.exports = {
  getAIBettingDecision,
  getAIDrawDecision,
  getAIVariantChoice,
  getAIWildChoice,
  getAIDelay
};
