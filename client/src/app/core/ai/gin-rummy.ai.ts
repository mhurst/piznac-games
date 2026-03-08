import { GinRummyCard, findBestMelds, getCardPoints, RANK_ORDER } from '../../games/gin-rummy/gin-rummy-types';

export interface GinRummyAIContext {
  hand: GinRummyCard[];
  discardTop: GinRummyCard | null;
  difficulty: 'easy' | 'medium' | 'hard';
  discardHistory?: GinRummyCard[];  // for hard AI tracking
  opponentPickedFromDiscard?: GinRummyCard[]; // cards opponent drew from discard
}

export function getAIDrawDecision(ctx: GinRummyAIContext): { source: 'stock' | 'discard' } {
  if (!ctx.discardTop) return { source: 'stock' };

  if (ctx.difficulty === 'easy') {
    return { source: Math.random() < 0.7 ? 'stock' : 'discard' };
  }

  // Check if discard top completes or improves melds
  const currentResult = findBestMelds(ctx.hand);
  const withDiscard = [...ctx.hand, ctx.discardTop];
  // Simulate: if we took the discard, what's the best we could do minus worst card?
  let bestAfterDiscard = Infinity;
  for (let i = 0; i < withDiscard.length; i++) {
    const testHand = withDiscard.filter((_, idx) => idx !== i);
    const result = findBestMelds(testHand);
    bestAfterDiscard = Math.min(bestAfterDiscard, result.deadwoodPoints);
  }

  if (bestAfterDiscard < currentResult.deadwoodPoints) {
    return { source: 'discard' };
  }

  if (ctx.difficulty === 'hard') {
    // Only take discard if it significantly helps
    return { source: 'stock' };
  }

  // Medium: take discard if it reduces deadwood at all
  return { source: bestAfterDiscard < currentResult.deadwoodPoints ? 'discard' : 'stock' };
}

export function getAIDiscardDecision(ctx: GinRummyAIContext): { cardIndex: number; callGin: boolean } {
  const hand = ctx.hand;
  const result = findBestMelds(hand);

  // Check if we can gin
  if (result.deadwoodPoints === 0) {
    // Discard any card (shouldn't happen with 11 cards if gin, but find worst)
    // Actually with 11 cards after drawing, we need to discard one and still have gin
    return findBestDiscardForGin(hand);
  }

  if (ctx.difficulty === 'easy') {
    // Discard highest deadwood card
    const deadwood = result.deadwood;
    if (deadwood.length > 0) {
      const worst = deadwood.reduce((max, c) => getCardPoints(c) > getCardPoints(max) ? c : max, deadwood[0]);
      const idx = hand.findIndex(c => c.suit === worst.suit && c.value === worst.value);
      return { cardIndex: idx >= 0 ? idx : 0, callGin: false };
    }
    return { cardIndex: 0, callGin: false };
  }

  // Medium/Hard: find discard that minimizes deadwood
  let bestIdx = 0;
  let bestDW = Infinity;
  let canGin = false;

  for (let i = 0; i < hand.length; i++) {
    const testHand = hand.filter((_, idx) => idx !== i);
    const r = findBestMelds(testHand);
    if (r.deadwoodPoints < bestDW) {
      bestDW = r.deadwoodPoints;
      bestIdx = i;
      canGin = r.deadwoodPoints === 0;
    }
  }

  if (ctx.difficulty === 'hard' && !canGin) {
    // Avoid discarding cards opponent might want
    const opponentPicked = ctx.opponentPickedFromDiscard || [];
    const dangerRanks = new Set(opponentPicked.map(c => c.value));
    const dangerSuits = new Set(opponentPicked.map(c => c.suit));

    // Among cards with similar deadwood impact, prefer safe discards
    const candidates: { idx: number; dw: number; danger: number }[] = [];
    for (let i = 0; i < hand.length; i++) {
      const testHand = hand.filter((_, idx) => idx !== i);
      const r = findBestMelds(testHand);
      if (r.deadwoodPoints <= bestDW + 2) {
        const card = hand[i];
        let danger = 0;
        if (dangerRanks.has(card.value)) danger += 2;
        if (dangerSuits.has(card.suit)) danger += 1;
        candidates.push({ idx: i, dw: r.deadwoodPoints, danger });
      }
    }
    candidates.sort((a, b) => a.dw - b.dw || a.danger - b.danger);
    if (candidates.length > 0) {
      bestIdx = candidates[0].idx;
    }
  }

  return { cardIndex: bestIdx, callGin: canGin };
}

function findBestDiscardForGin(hand: GinRummyCard[]): { cardIndex: number; callGin: boolean } {
  for (let i = 0; i < hand.length; i++) {
    const testHand = hand.filter((_, idx) => idx !== i);
    const r = findBestMelds(testHand);
    if (r.deadwoodPoints === 0) {
      return { cardIndex: i, callGin: true };
    }
  }
  // Shouldn't reach here, but discard highest
  let worstIdx = 0;
  let worstPts = 0;
  for (let i = 0; i < hand.length; i++) {
    const pts = getCardPoints(hand[i]);
    if (pts > worstPts) { worstPts = pts; worstIdx = i; }
  }
  return { cardIndex: worstIdx, callGin: false };
}

export function getAIDelay(): number {
  return 800 + Math.random() * 1200;
}
