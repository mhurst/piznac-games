/**
 * Spades AI — bidding and play logic for easy/medium/hard difficulties.
 *
 * Hard AI features:
 *  - Partner nil support (lead low, overtake partner's accidental wins)
 *  - Opponent nil breaking (lead into their voids)
 *  - Card counting (track played cards, infer voids)
 *  - Cheapest-winning-card strategy ("just enough to win")
 *  - Bag awareness near penalty thresholds
 */
import {
  SpadesCard, Suit, PlayerBid, Difficulty, TeamScore,
  CARD_VALUES, SUIT_ORDER, SUITS, VALUES, TEAM_FOR_SEAT, TrickCard
} from '../../games/spades/spades-types';

// ──────────────────────────── helpers ────────────────────────────

function cardValue(c: SpadesCard): number {
  return CARD_VALUES[c.value];
}

function sortHand(hand: SpadesCard[]): SpadesCard[] {
  return [...hand].sort((a, b) => {
    const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return s !== 0 ? s : cardValue(a) - cardValue(b);
  });
}

function hasSuit(hand: SpadesCard[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

function cardsOfSuit(hand: SpadesCard[], suit: Suit): SpadesCard[] {
  return hand.filter(c => c.suit === suit);
}

function highestOfSuit(cards: SpadesCard[]): SpadesCard | undefined {
  return cards.reduce<SpadesCard | undefined>(
    (best, c) => !best || cardValue(c) > cardValue(best) ? c : best,
    undefined
  );
}

function lowestOfSuit(cards: SpadesCard[]): SpadesCard | undefined {
  return cards.reduce<SpadesCard | undefined>(
    (best, c) => !best || cardValue(c) < cardValue(best) ? c : best,
    undefined
  );
}

// ──────────────────────────── legal plays ────────────────────────────

export function getLegalPlays(
  hand: SpadesCard[],
  ledSuit: Suit | null,
  spadesbroken: boolean,
  isFirstLead: boolean
): SpadesCard[] {
  if (hand.length === 0) return [];

  // Following — must follow suit if possible
  if (ledSuit) {
    const suited = cardsOfSuit(hand, ledSuit);
    if (suited.length > 0) return suited;
    return hand; // void in led suit — play anything
  }

  // Leading
  if (isFirstLead) {
    // First lead of the game: must lead 2 of clubs
    const twoClubs = hand.find(c => c.suit === 'clubs' && c.value === '2');
    if (twoClubs) return [twoClubs];
  }

  if (!spadesbroken) {
    const nonSpades = hand.filter(c => c.suit !== 'spades');
    if (nonSpades.length > 0) return nonSpades;
    // All spades — must allow leading spades
  }

  return hand;
}

// ──────────────────────────── AI context ────────────────────────────

export interface AIContext {
  hand: SpadesCard[];
  seat: number;
  difficulty: Difficulty;
  bids: (PlayerBid | null)[];     // indexed by seat
  tricksWon: number[];            // indexed by seat
  spadesbroken: boolean;
  currentTrick: TrickCard[];
  trickLeader: number;
  isFirstLead: boolean;
  playedCards: SpadesCard[];      // all cards played so far this round
  teamScores: [TeamScore, TeamScore];
  round: number;
  voids: Set<string>[];           // voids[seat] = set of suits known void
}

// ──────────────────────────── bidding ────────────────────────────

export function getAIBid(ctx: AIContext): PlayerBid {
  const { hand, difficulty, seat, bids, teamScores } = ctx;
  const sorted = sortHand(hand);

  // Count expected winners
  let winners = 0;

  // Count spades
  const spades = cardsOfSuit(sorted, 'spades');
  const spadesCount = spades.length;
  for (const c of spades) {
    const v = cardValue(c);
    if (v === 14) winners += 1;        // Ace of spades
    else if (v === 13) winners += 0.9; // King
    else if (v === 12 && spadesCount >= 3) winners += 0.7; // Queen with backup
    else if (v >= 10 && spadesCount >= 5) winners += 0.5;  // Length strength
  }

  // Count off-suit top cards
  for (const suit of ['clubs', 'diamonds', 'hearts'] as Suit[]) {
    const cards = cardsOfSuit(sorted, suit);
    if (cards.length === 0) {
      // Void — can trump with spades
      if (spadesCount > 0) winners += Math.min(1, spadesCount * 0.3);
      continue;
    }
    const highest = highestOfSuit(cards)!;
    if (cardValue(highest) === 14) winners += 0.9;         // Ace
    else if (cardValue(highest) === 13 && cards.length >= 2) winners += 0.7; // King with backup
    else if (cardValue(highest) === 13) winners += 0.4;
    // Short suits (1-2 cards) add trumping potential
    if (cards.length <= 2 && spadesCount >= 2) winners += 0.3;
  }

  let bid = Math.round(winners);

  // Difficulty adjustments
  if (difficulty === 'easy') {
    // Conservative — subtract 1 (min 1)
    bid = Math.max(1, bid - 1);
  } else if (difficulty === 'medium') {
    // Nil consideration for very weak hands
    if (winners <= 0.5 && spadesCount <= 1) {
      const canNil = !spades.some(c => cardValue(c) >= 13);
      if (canNil && Math.random() < 0.3) {
        return { amount: 0, blind: false };
      }
    }
    bid = Math.max(1, bid);
  } else {
    // Hard — partner bid awareness + bag management
    const partnerSeat = (seat + 2) % 4;
    const partnerBid = bids[partnerSeat];
    const teamIdx = TEAM_FOR_SEAT[seat];
    const teamBags = teamScores[teamIdx].bags;

    // Nil consideration
    if (winners <= 0.5 && spadesCount <= 1) {
      const hasHighSpade = spades.some(c => cardValue(c) >= 13);
      if (!hasHighSpade) {
        // Consider blind nil if haven't seen cards (before deal)
        return { amount: 0, blind: false };
      }
    }

    bid = Math.max(1, bid);

    // If partner bid big, be more conservative to avoid bags
    if (partnerBid && partnerBid.amount >= 5) {
      bid = Math.max(1, bid - 1);
    }

    // Bag awareness — if close to 10 bags, bid slightly higher to avoid overtricks
    if (teamBags >= 7) {
      bid = Math.min(13, bid + 1);
    }
  }

  bid = Math.max(1, Math.min(13, bid));
  return { amount: bid, blind: false };
}

// ──────────────────────────── play logic ────────────────────────────

export function getAIPlay(ctx: AIContext): SpadesCard {
  const legal = getLegalPlays(ctx.hand, getLedSuit(ctx), ctx.spadesbroken, ctx.isFirstLead);
  if (legal.length === 1) return legal[0];

  switch (ctx.difficulty) {
    case 'easy': return easyPlay(ctx, legal);
    case 'medium': return mediumPlay(ctx, legal);
    case 'hard': return hardPlay(ctx, legal);
  }
}

function getLedSuit(ctx: AIContext): Suit | null {
  if (ctx.currentTrick.length === 0) return null;
  return ctx.currentTrick[0].card.suit;
}

// ── Easy: play randomly with slight preference for following suit low ──

function easyPlay(ctx: AIContext, legal: SpadesCard[]): SpadesCard {
  const ledSuit = getLedSuit(ctx);
  if (ledSuit) {
    // Following: play lowest of suit
    const suited = legal.filter(c => c.suit === ledSuit);
    if (suited.length > 0) {
      return lowestOfSuit(suited)!;
    }
    // Void — play random non-spade if possible, else lowest spade
    const nonSpades = legal.filter(c => c.suit !== 'spades');
    if (nonSpades.length > 0) return nonSpades[Math.floor(Math.random() * nonSpades.length)];
    return lowestOfSuit(legal)!;
  }
  // Leading: play random
  return legal[Math.floor(Math.random() * legal.length)];
}

// ── Medium: basic strategy ──

function mediumPlay(ctx: AIContext, legal: SpadesCard[]): SpadesCard {
  const ledSuit = getLedSuit(ctx);
  const trick = ctx.currentTrick;

  if (!ledSuit) {
    // Leading — play aces of off-suits first, then low
    return pickLead(ctx, legal, false);
  }

  const currentWinner = trickWinnerSoFar(trick);

  // Following
  const suited = legal.filter(c => c.suit === ledSuit);
  if (suited.length > 0) {
    // Can we beat current winner?
    if (currentWinner && currentWinner.card.suit === ledSuit) {
      const higher = suited.filter(c => cardValue(c) > cardValue(currentWinner.card));
      if (higher.length > 0 && isPartnerWinning(ctx, currentWinner)) {
        // Partner winning — play low
        return lowestOfSuit(suited)!;
      }
      if (higher.length > 0) {
        // Play cheapest winner
        return lowestOfSuit(higher)!;
      }
    }
    // Can't beat or partner winning — play low
    return lowestOfSuit(suited)!;
  }

  // Void in led suit
  if (currentWinner && isPartnerWinning(ctx, currentWinner)) {
    // Partner winning — dump lowest card (avoid spades to not waste trumps)
    const nonSpades = legal.filter(c => c.suit !== 'spades');
    return nonSpades.length > 0 ? lowestCard(nonSpades) : lowestCard(legal);
  }

  // Trump if not winning
  const spades = legal.filter(c => c.suit === 'spades');
  if (spades.length > 0) {
    const currentSpade = currentWinner?.card.suit === 'spades' ? cardValue(currentWinner.card) : 0;
    const higherSpades = spades.filter(c => cardValue(c) > currentSpade);
    if (higherSpades.length > 0) return lowestOfSuit(higherSpades)!;
  }

  // Can't win — dump lowest
  return lowestCard(legal);
}

// ── Hard: full strategy with partner awareness ──

function hardPlay(ctx: AIContext, legal: SpadesCard[]): SpadesCard {
  const ledSuit = getLedSuit(ctx);
  const trick = ctx.currentTrick;
  const partnerSeat = (ctx.seat + 2) % 4;
  const partnerBid = ctx.bids[partnerSeat];
  const partnerNil = partnerBid !== null && partnerBid.amount === 0;
  const oppSeats = [(ctx.seat + 1) % 4, (ctx.seat + 3) % 4];
  const oppNil = oppSeats.some(s => ctx.bids[s]?.amount === 0);

  if (!ledSuit) {
    return pickLeadHard(ctx, legal, partnerNil, oppNil);
  }

  const currentWinner = trickWinnerSoFar(trick);
  const partnerPlayed = trick.some(t => t.seat === partnerSeat);
  const partnerWinning = currentWinner ? isPartnerWinning(ctx, currentWinner) : false;

  // Following
  const suited = legal.filter(c => c.suit === ledSuit);

  if (suited.length > 0) {
    // Partner bid nil and is winning the trick — overtake them!
    if (partnerNil && currentWinner?.seat === partnerSeat) {
      const higher = suited.filter(c => cardValue(c) > cardValue(currentWinner.card));
      if (higher.length > 0) return lowestOfSuit(higher)!;
    }

    if (partnerWinning && !partnerNil) {
      // Partner winning and didn't bid nil — play low
      return lowestOfSuit(suited)!;
    }

    // Try to win cheaply
    const winThreshold = currentWinner?.card.suit === ledSuit ? cardValue(currentWinner.card) : 0;
    const canWin = suited.filter(c => cardValue(c) > winThreshold);

    if (canWin.length > 0) {
      // Bag awareness — if we've already met our bid, consider ducking
      if (shouldAvoidBags(ctx) && partnerPlayed) {
        return lowestOfSuit(suited)!;
      }
      return lowestOfSuit(canWin)!; // cheapest winner
    }

    return lowestOfSuit(suited)!;
  }

  // Void in led suit
  // Partner nil and winning — overtake with lowest trump
  if (partnerNil && currentWinner?.seat === partnerSeat) {
    const spades = legal.filter(c => c.suit === 'spades');
    if (spades.length > 0) return lowestOfSuit(spades)!;
  }

  if (partnerWinning && !partnerNil) {
    // Partner winning — dump a low card
    return dumpLowest(legal);
  }

  // Opponent winning — try to trump
  const spades = legal.filter(c => c.suit === 'spades');
  if (spades.length > 0) {
    const currentSpade = currentWinner?.card.suit === 'spades' ? cardValue(currentWinner.card) : 0;
    const higherSpades = spades.filter(c => cardValue(c) > currentSpade);
    if (higherSpades.length > 0) {
      if (shouldAvoidBags(ctx)) return dumpLowest(legal);
      return lowestOfSuit(higherSpades)!;
    }
  }

  return dumpLowest(legal);
}

// ──────────────────────────── leading strategies ────────────────────────────

function pickLead(ctx: AIContext, legal: SpadesCard[], _partnerAware: boolean): SpadesCard {
  // Lead aces of off-suits first
  const offSuitAces = legal.filter(c => c.suit !== 'spades' && c.value === 'A');
  if (offSuitAces.length > 0) return offSuitAces[0];

  // Lead kings where ace is played
  const kings = legal.filter(c => c.suit !== 'spades' && c.value === 'K');
  for (const k of kings) {
    if (ctx.playedCards.some(p => p.suit === k.suit && p.value === 'A')) return k;
  }

  // Lead from longest non-spade suit
  const nonSpades = legal.filter(c => c.suit !== 'spades');
  if (nonSpades.length > 0) {
    const suitCounts: Partial<Record<Suit, number>> = {};
    for (const c of nonSpades) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    const longest = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0][0] as Suit;
    const fromLongest = nonSpades.filter(c => c.suit === longest);
    return lowestOfSuit(fromLongest)!;
  }

  return lowestCard(legal);
}

function pickLeadHard(
  ctx: AIContext, legal: SpadesCard[],
  partnerNil: boolean, oppNil: boolean
): SpadesCard {
  const partnerSeat = (ctx.seat + 2) % 4;

  // If partner bid nil — lead low cards to help them duck
  if (partnerNil) {
    // Lead low from partner's likely strong suits (non-void)
    // Avoid leading from suits partner is void in
    const partnerVoids = ctx.voids[partnerSeat];
    const safeLeads = legal.filter(c => c.suit !== 'spades' && !partnerVoids.has(c.suit));
    if (safeLeads.length > 0) {
      // Lead lowest
      return lowestCard(safeLeads);
    }
    return lowestCard(legal);
  }

  // If opponent bid nil — lead into their likely voids to break nil
  if (oppNil) {
    const oppSeat1 = (ctx.seat + 1) % 4;
    const oppSeat3 = (ctx.seat + 3) % 4;
    const nilOpp = ctx.bids[oppSeat1]?.amount === 0 ? oppSeat1 : oppSeat3;
    const nilVoids = ctx.voids[nilOpp];

    // Lead from suits they're void in — they'll be forced to trump or play off-suit
    for (const voidSuit of nilVoids) {
      const suited = legal.filter(c => c.suit === voidSuit);
      if (suited.length > 0) {
        return highestOfSuit(suited)!; // lead high to force them
      }
    }
  }

  // Standard hard leading
  // Aces first (cash winners)
  const offSuitAces = legal.filter(c => c.suit !== 'spades' && c.value === 'A');
  if (offSuitAces.length > 0) return offSuitAces[0];

  // Kings where ace is played
  const kings = legal.filter(c => c.suit !== 'spades' && c.value === 'K');
  for (const k of kings) {
    if (ctx.playedCards.some(p => p.suit === k.suit && p.value === 'A')) return k;
  }

  // Lead from short suits to create voids for future trumping
  const nonSpades = legal.filter(c => c.suit !== 'spades');
  if (nonSpades.length > 0) {
    const suitCounts: Partial<Record<Suit, number>> = {};
    for (const c of nonSpades) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    const shortest = Object.entries(suitCounts).sort((a, b) => a[1] - b[1])[0][0] as Suit;
    const fromShortest = nonSpades.filter(c => c.suit === shortest);
    // Lead high from short suit to win and create void
    return highestOfSuit(fromShortest)!;
  }

  // Only spades — lead lowest
  return lowestCard(legal);
}

// ──────────────────────────── utility ────────────────────────────

function trickWinnerSoFar(trick: TrickCard[]): TrickCard | null {
  if (trick.length === 0) return null;
  const ledSuit = trick[0].card.suit;
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const t = trick[i];
    if (t.card.suit === 'spades' && best.card.suit !== 'spades') {
      best = t;
    } else if (t.card.suit === 'spades' && best.card.suit === 'spades') {
      if (cardValue(t.card) > cardValue(best.card)) best = t;
    } else if (t.card.suit === ledSuit && best.card.suit === ledSuit) {
      if (cardValue(t.card) > cardValue(best.card)) best = t;
    }
  }
  return best;
}

function isPartnerWinning(ctx: AIContext, winner: TrickCard): boolean {
  const partnerSeat = (ctx.seat + 2) % 4;
  return winner.seat === partnerSeat;
}

function shouldAvoidBags(ctx: AIContext): boolean {
  const teamIdx = TEAM_FOR_SEAT[ctx.seat];
  const team = ctx.teamScores[teamIdx];
  const myBid = ctx.bids[ctx.seat]?.amount ?? 0;
  const partnerBid = ctx.bids[(ctx.seat + 2) % 4]?.amount ?? 0;
  const teamBid = myBid + partnerBid;
  const teamTricks = ctx.tricksWon[ctx.seat] + ctx.tricksWon[(ctx.seat + 2) % 4];

  // Already met bid — avoid extra tricks
  if (teamTricks >= teamBid && team.bags >= 7) return true;
  return false;
}

function lowestCard(cards: SpadesCard[]): SpadesCard {
  // Prefer non-spades, then lowest value
  const nonSpades = cards.filter(c => c.suit !== 'spades');
  const pool = nonSpades.length > 0 ? nonSpades : cards;
  return pool.reduce((best, c) => cardValue(c) < cardValue(best) ? c : best, pool[0]);
}

function dumpLowest(cards: SpadesCard[]): SpadesCard {
  return lowestCard(cards);
}

// ──────────────────────────── delay ────────────────────────────

export function getAIDelay(): number {
  return 700 + Math.random() * 1000;
}
