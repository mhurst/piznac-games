import { Card, Difficulty, BettingAction, HandRank, CARD_VALUES, MIN_BET, WildCardOption, isCardWild } from '../../games/poker/poker-types';
import { evaluateHand, evaluateHandWithWilds, evaluateBestHand, evaluateBestHandWithWilds, handStrength, suggestDiscards } from '../../games/poker/poker-hand-evaluator';

/** Round a raise amount to the nearest MIN_BET increment, clamped to available chips. */
function roundRaise(amount: number, chips: number): number {
  const rounded = Math.max(MIN_BET, Math.round(amount / MIN_BET) * MIN_BET);
  return Math.min(rounded, chips);
}

interface BettingDecision {
  action: BettingAction;
  raiseAmount?: number;
}

interface GameContext {
  hand: Card[];
  chips: number;
  currentBet: number;    // highest bet on the table this round
  myBet: number;         // how much I've already bet this round
  pot: number;
  minRaise: number;
  playersInHand: number; // non-folded players
  phase: 'betting1' | 'betting2' | 'betting3' | 'betting4' | 'betting5';
  wilds?: WildCardOption[];
}

/**
 * Get a betting decision for an AI player.
 */
export function getAIBettingDecision(difficulty: Difficulty, context: GameContext): BettingDecision {
  const toCall = context.currentBet - context.myBet;
  const wilds = context.wilds || [];
  // For >5 cards (stud), evaluate best 5 of N
  const isMulti = context.hand.length > 5;
  const strength = isMulti ? handStrengthMulti(context.hand, wilds) : handStrength(context.hand, wilds);
  const result = isMulti
    ? (wilds.length > 0 ? evaluateBestHandWithWilds(context.hand, wilds) : evaluateBestHand(context.hand))
    : (wilds.length > 0 ? evaluateHandWithWilds(context.hand, wilds) : evaluateHand(context.hand));

  switch (difficulty) {
    case 'easy': return easyBet(context, strength, result.rank, toCall);
    case 'medium': return mediumBet(context, strength, result.rank, toCall);
    case 'hard': return hardBet(context, strength, result.rank, toCall);
  }
}

/**
 * Get draw decisions (which cards to discard) for an AI player.
 * Enforces 5-Card Draw rule: max 3 cards, or 4 if keeping an ace.
 */
export function getAIDrawDecision(difficulty: Difficulty, hand: Card[], wilds: WildCardOption[] = []): number[] {
  const result = wilds.length > 0 ? evaluateHandWithWilds(hand, wilds) : evaluateHand(hand);

  let discards: number[];
  switch (difficulty) {
    case 'easy': discards = easyDraw(hand, result.rank, wilds); break;
    case 'medium': discards = mediumDraw(hand, result.rank, wilds); break;
    case 'hard': discards = suggestDiscards(hand, wilds); break;
  }

  return enforceDrawLimit(hand, discards, wilds);
}

/**
 * Enforce 5-Card Draw limit: max 3 discards, or 4 if keeping an ace.
 */
function enforceDrawLimit(hand: Card[], discards: number[], wilds: WildCardOption[] = []): number[] {
  // Never discard wild cards
  if (wilds.length > 0) {
    discards = discards.filter(i => !isCardWild(hand[i], wilds));
  }

  if (discards.length <= 3) return discards;

  // Check if we're keeping an ace (not discarding it)
  const hasKeptAce = hand.some((c, i) => c.value === 'A' && !discards.includes(i));
  if (discards.length === 4 && hasKeptAce) return discards;

  // Too many discards — trim to 3, keeping the best cards
  // Sort discards by card value (discard lowest-value cards first)
  const sorted = discards
    .map(i => ({ index: i, value: CARD_VALUES[hand[i].value] }))
    .sort((a, b) => a.value - b.value);

  return sorted.slice(0, 3).map(x => x.index);
}

/**
 * Get a randomized delay for AI actions (milliseconds).
 */
export function getAIDelay(): number {
  return 800 + Math.random() * 1200; // 0.8s - 2.0s
}

// --- EASY AI ---
// Passive, calls with pairs+, folds junk ~70%, never bluffs

function easyBet(ctx: GameContext, strength: number, rank: HandRank, toCall: number): BettingDecision {
  if (toCall === 0) {
    // Can check for free
    if (rank >= HandRank.OnePair && Math.random() < 0.3) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
    }
    return { action: 'check' };
  }

  // Must call or fold
  if (rank >= HandRank.TwoPair) {
    return { action: 'call' };
  }
  if (rank >= HandRank.OnePair) {
    return Math.random() < 0.6 ? { action: 'call' } : { action: 'fold' };
  }
  // Junk — fold 70%
  return Math.random() < 0.7 ? { action: 'fold' } : { action: 'call' };
}

function easyDraw(hand: Card[], rank: HandRank, wilds: WildCardOption[] = []): number[] {
  if (rank >= HandRank.Straight) return []; // Keep strong hands

  // Simple: keep pairs and wilds, discard the rest
  const counts = new Map<number, number>();
  for (const card of hand) {
    if (wilds.length > 0 && isCardWild(card, wilds)) continue; // don't count wilds
    const v = CARD_VALUES[card.value];
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const keptValues = new Set<number>();
  for (const [val, count] of counts) {
    if (count >= 2) keptValues.add(val);
  }

  // If no pairs, keep highest 2
  if (keptValues.size === 0) {
    const sorted = hand.map((c, i) => ({ val: CARD_VALUES[c.value] || 0, i, wild: wilds.length > 0 && isCardWild(c, wilds) }))
      .sort((a, b) => (b.wild ? 100 : b.val) - (a.wild ? 100 : a.val));
    return sorted.slice(2).map(x => x.i);
  }

  return hand.map((c, i) => {
    if (wilds.length > 0 && isCardWild(c, wilds)) return -1; // keep wilds
    return !keptValues.has(CARD_VALUES[c.value]) ? i : -1;
  }).filter(i => i !== -1);
}

// --- MEDIUM AI ---
// Uses hand strength tiers, occasional bluffs (~15%), draws to flushes/straights

function mediumBet(ctx: GameContext, strength: number, rank: HandRank, toCall: number): BettingDecision {
  const potOdds = toCall > 0 ? toCall / (ctx.pot + toCall) : 0;
  const bluff = Math.random() < 0.15;

  if (toCall === 0) {
    // Check or bet
    if (rank >= HandRank.ThreeOfAKind) {
      return { action: 'raise', raiseAmount: roundRaise(Math.max(ctx.minRaise, ctx.pot), ctx.chips) };
    }
    if (rank >= HandRank.OnePair) {
      return Math.random() < 0.5
        ? { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) }
        : { action: 'check' };
    }
    if (bluff) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
    }
    return { action: 'check' };
  }

  // Facing a bet
  if (rank >= HandRank.ThreeOfAKind) {
    // Strong hand — raise sometimes
    if (Math.random() < 0.4) {
      return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise * 2, ctx.chips) };
    }
    return { action: 'call' };
  }
  if (rank >= HandRank.OnePair) {
    // Decent hand — call if pot odds are okay
    return strength > potOdds ? { action: 'call' } : { action: 'fold' };
  }
  // Junk — bluff or fold
  if (bluff && toCall <= ctx.minRaise * 2) {
    return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise, ctx.chips) };
  }
  return Math.random() < 0.2 ? { action: 'call' } : { action: 'fold' };
}

function mediumDraw(hand: Card[], rank: HandRank, wilds: WildCardOption[] = []): number[] {
  if (rank >= HandRank.Straight) return [];

  // Check for flush draw (4 of same suit), skip wilds
  const suitCounts = new Map<string, number>();
  for (const card of hand) {
    if (wilds.length > 0 && isCardWild(card, wilds)) continue;
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  }
  for (const [suit, count] of suitCounts) {
    if (count === 4) {
      return hand.map((c, i) => {
        if (wilds.length > 0 && isCardWild(c, wilds)) return -1; // keep wilds
        return c.suit !== suit ? i : -1;
      }).filter(i => i !== -1);
    }
  }

  // Use standard discard logic
  return suggestDiscards(hand, wilds);
}

// --- HARD AI ---
// Considers hand percentiles, pot odds, balanced bluff frequency (~20%), optimal draw

function hardBet(ctx: GameContext, strength: number, rank: HandRank, toCall: number): BettingDecision {
  const potOdds = toCall > 0 ? toCall / (ctx.pot + toCall) : 0;
  const bluffFreq = 0.20;
  const isBluff = Math.random() < bluffFreq;
  const positionFactor = ctx.playersInHand <= 3 ? 1.15 : 1.0; // more aggressive short-handed
  const adjustedStrength = Math.min(1, strength * positionFactor);

  if (toCall === 0) {
    // Can check for free
    if (adjustedStrength >= 0.6) {
      // Value bet — size based on strength
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

  // Facing a bet
  // Account for draw/street potential in early rounds
  const isEarlyRound = ctx.phase === 'betting1' || ctx.phase === 'betting3' || ctx.phase === 'betting4';
  const effectiveOdds = potOdds * (isEarlyRound ? 1.3 : 1.0);

  if (adjustedStrength >= 0.7) {
    // Strong — raise for value
    if (Math.random() < 0.5) {
      const raiseSize = Math.max(ctx.minRaise, Math.floor(toCall * 2));
      return { action: 'raise', raiseAmount: roundRaise(raiseSize, ctx.chips) };
    }
    return { action: 'call' };
  }

  if (adjustedStrength >= effectiveOdds) {
    return { action: 'call' };
  }

  // Below pot odds — consider bluff-raise or fold
  if (isBluff && ctx.playersInHand <= 3 && toCall <= ctx.chips * 0.15) {
    return { action: 'raise', raiseAmount: roundRaise(ctx.minRaise * 3, ctx.chips) };
  }

  // Check if calling is cheap enough to draw/wait for more cards
  if (isEarlyRound && toCall <= ctx.chips * 0.05) {
    return { action: 'call' };
  }

  return { action: 'fold' };
}

/**
 * Hand strength for >5 cards (stud): use best-5-of-N evaluation.
 */
function handStrengthMulti(cards: Card[], wilds: WildCardOption[] = []): number {
  const result = wilds.length > 0 ? evaluateBestHandWithWilds(cards, wilds) : evaluateBestHand(cards);
  const rankScore = result.rank / 10; // HandRank.FiveOfAKind = 10
  const tbScore = result.tiebreakers.length > 0
    ? (result.tiebreakers[0] - 2) / 12 * 0.05
    : 0;
  return Math.min(1, rankScore + tbScore);
}
