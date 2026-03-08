export interface GinRummyCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
  faceDown?: boolean;
}

export type GinRummyPhase = 'waiting' | 'drawing' | 'discarding' | 'gin' | 'gameOver';

export interface GinRummyMeld {
  type: 'set' | 'run';
  cards: GinRummyCard[];
}

export interface GinRummyVisualState {
  phase: GinRummyPhase;
  myHand: GinRummyCard[];
  opponentCardCount: number;
  opponentHand?: GinRummyCard[]; // shown after gin
  opponentMelds?: GinRummyMeld[];
  myMelds?: GinRummyMeld[];
  stockCount: number;
  discardTop: GinRummyCard | null;
  selectedCardIndex: number | null;
  isMyTurn: boolean;
  canGin: boolean;
  message: string;
  myName: string;
  opponentName: string;
  myAvatar?: string;
  opponentAvatar?: string;
}

export const SUITS: GinRummyCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
};
export const CARD_POINTS: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10
};
export function getCardPoints(card: GinRummyCard): number {
  return CARD_POINTS[card.value] || 0;
}

export function sortHand(hand: GinRummyCard[]): GinRummyCard[] {
  return [...hand].sort((a, b) => {
    const suitOrder = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitOrder !== 0) return suitOrder;
    return RANK_ORDER[a.value] - RANK_ORDER[b.value];
  });
}

function cardKey(c: GinRummyCard): string {
  return `${c.value}_${c.suit}`;
}

function findAllSets(hand: GinRummyCard[]): GinRummyMeld[] {
  const byRank = new Map<string, GinRummyCard[]>();
  for (const c of hand) {
    if (!byRank.has(c.value)) byRank.set(c.value, []);
    byRank.get(c.value)!.push(c);
  }
  const melds: GinRummyMeld[] = [];
  for (const [, cards] of byRank) {
    if (cards.length >= 3) {
      // 3-of-a-kind
      if (cards.length === 3) {
        melds.push({ type: 'set', cards: [...cards] });
      } else {
        // 4-of-a-kind + all 3-card subsets
        melds.push({ type: 'set', cards: [...cards] });
        for (let skip = 0; skip < 4; skip++) {
          melds.push({ type: 'set', cards: cards.filter((_, i) => i !== skip) });
        }
      }
    }
  }
  return melds;
}

function findAllRuns(hand: GinRummyCard[]): GinRummyMeld[] {
  const bySuit = new Map<string, GinRummyCard[]>();
  for (const c of hand) {
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit)!.push(c);
  }
  const melds: GinRummyMeld[] = [];
  for (const [, cards] of bySuit) {
    const sorted = cards.sort((a, b) => RANK_ORDER[a.value] - RANK_ORDER[b.value]);
    // Find all consecutive runs of length >= 3
    for (let start = 0; start < sorted.length; start++) {
      const run: GinRummyCard[] = [sorted[start]];
      for (let j = start + 1; j < sorted.length; j++) {
        if (RANK_ORDER[sorted[j].value] === RANK_ORDER[run[run.length - 1].value] + 1) {
          run.push(sorted[j]);
        } else {
          break;
        }
      }
      if (run.length >= 3) {
        // Add all sub-runs of length >= 3
        for (let len = 3; len <= run.length; len++) {
          for (let offset = 0; offset <= run.length - len; offset++) {
            melds.push({ type: 'run', cards: run.slice(offset, offset + len) });
          }
        }
      }
    }
  }
  // Deduplicate
  const seen = new Set<string>();
  return melds.filter(m => {
    const key = m.cards.map(cardKey).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findBestMelds(hand: GinRummyCard[]): { melds: GinRummyMeld[]; deadwood: GinRummyCard[]; deadwoodPoints: number } {
  const allMelds = [...findAllSets(hand), ...findAllRuns(hand)];

  let bestMelds: GinRummyMeld[] = [];
  let bestDeadwood = Infinity;
  let bestDeadwoodCards: GinRummyCard[] = [];

  function backtrack(idx: number, usedKeys: Set<string>, currentMelds: GinRummyMeld[]) {
    // Calculate current deadwood
    const unusedCards = hand.filter(c => !usedKeys.has(cardKey(c)));
    const dw = unusedCards.reduce((sum, c) => sum + getCardPoints(c), 0);
    if (dw < bestDeadwood) {
      bestDeadwood = dw;
      bestMelds = [...currentMelds];
      bestDeadwoodCards = unusedCards;
    }
    if (dw === 0) return; // Can't do better

    for (let i = idx; i < allMelds.length; i++) {
      const meld = allMelds[i];
      const meldKeys = meld.cards.map(cardKey);
      if (meldKeys.some(k => usedKeys.has(k))) continue;

      meldKeys.forEach(k => usedKeys.add(k));
      currentMelds.push(meld);
      backtrack(i + 1, usedKeys, currentMelds);
      currentMelds.pop();
      meldKeys.forEach(k => usedKeys.delete(k));
    }
  }

  backtrack(0, new Set(), []);
  return { melds: bestMelds, deadwood: bestDeadwoodCards, deadwoodPoints: bestDeadwood };
}

export function isGin(hand: GinRummyCard[]): boolean {
  return findBestMelds(hand).deadwoodPoints === 0;
}

export function calculateDeadwood(hand: GinRummyCard[]): number {
  return findBestMelds(hand).deadwoodPoints;
}
