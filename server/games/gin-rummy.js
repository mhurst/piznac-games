/**
 * Gin Rummy — Server-side game logic for multiplayer.
 * No-knock variant: must go Gin (0 deadwood) to win.
 * First to Gin wins. Stock exhaustion = draw.
 */

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANK_ORDER = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
const CARD_POINTS = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of RANKS) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardKey(c) {
  return `${c.value}_${c.suit}`;
}

function findAllSets(hand) {
  const byRank = new Map();
  for (const c of hand) {
    if (!byRank.has(c.value)) byRank.set(c.value, []);
    byRank.get(c.value).push(c);
  }
  const melds = [];
  for (const [, cards] of byRank) {
    if (cards.length >= 3) {
      if (cards.length === 3) {
        melds.push({ type: 'set', cards: [...cards] });
      } else {
        melds.push({ type: 'set', cards: [...cards] });
        for (let skip = 0; skip < 4; skip++) {
          melds.push({ type: 'set', cards: cards.filter((_, i) => i !== skip) });
        }
      }
    }
  }
  return melds;
}

function findAllRuns(hand) {
  const bySuit = new Map();
  for (const c of hand) {
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit).push(c);
  }
  const melds = [];
  for (const [, cards] of bySuit) {
    const sorted = cards.sort((a, b) => RANK_ORDER[a.value] - RANK_ORDER[b.value]);
    for (let start = 0; start < sorted.length; start++) {
      const run = [sorted[start]];
      for (let j = start + 1; j < sorted.length; j++) {
        if (RANK_ORDER[sorted[j].value] === RANK_ORDER[run[run.length - 1].value] + 1) {
          run.push(sorted[j]);
        } else {
          break;
        }
      }
      if (run.length >= 3) {
        for (let len = 3; len <= run.length; len++) {
          for (let offset = 0; offset <= run.length - len; offset++) {
            melds.push({ type: 'run', cards: run.slice(offset, offset + len) });
          }
        }
      }
    }
  }
  const seen = new Set();
  return melds.filter(m => {
    const key = m.cards.map(cardKey).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findBestMelds(hand) {
  const allMelds = [...findAllSets(hand), ...findAllRuns(hand)];

  let bestMelds = [];
  let bestDeadwood = Infinity;
  let bestDeadwoodCards = [];

  function backtrack(idx, usedKeys, currentMelds) {
    const unusedCards = hand.filter(c => !usedKeys.has(cardKey(c)));
    const dw = unusedCards.reduce((sum, c) => sum + (CARD_POINTS[c.value] || 0), 0);
    if (dw < bestDeadwood) {
      bestDeadwood = dw;
      bestMelds = [...currentMelds];
      bestDeadwoodCards = unusedCards;
    }
    if (dw === 0) return;

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

class GinRummy {
  constructor(player1Id, player2Id) {
    this.playerIds = [player1Id, player2Id];
    this.gameOver = false;
    this.winner = null;

    this.deck = shuffleDeck(createDeck());
    this.discardPile = [];
    this.hands = {};
    this.phase = 'drawing';

    for (const id of this.playerIds) {
      this.hands[id] = [];
    }

    // Deal 10 cards each
    for (let i = 0; i < 10; i++) {
      for (const id of this.playerIds) {
        this.hands[id].push(this.deck.pop());
      }
    }

    // First card to discard
    this.discardPile.push(this.deck.pop());

    this.currentPlayerIndex = 0;
  }

  getCurrentPlayerId() {
    return this.playerIds[this.currentPlayerIndex];
  }

  getOpponentId(playerId) {
    return this.playerIds.find(id => id !== playerId);
  }

  makeMove(playerId, move) {
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    if (playerId !== this.getCurrentPlayerId()) {
      return { valid: false, message: 'Not your turn' };
    }

    switch (move.type) {
      case 'draw-stock':
        return this.handleDrawStock(playerId);
      case 'draw-discard':
        return this.handleDrawDiscard(playerId);
      case 'discard':
        return this.handleDiscard(playerId, move.cardIndex);
      case 'gin':
        return this.handleGin(playerId, move.cardIndex);
      default:
        return { valid: false, message: 'Invalid move type' };
    }
  }

  handleDrawStock(playerId) {
    if (this.phase !== 'drawing') {
      return { valid: false, message: 'Not in drawing phase' };
    }
    if (this.deck.length === 0) {
      return { valid: false, message: 'Stock is empty' };
    }

    const card = this.deck.pop();
    this.hands[playerId].push(card);
    this.phase = 'discarding';

    return { valid: true, drawnCard: card, source: 'stock' };
  }

  handleDrawDiscard(playerId) {
    if (this.phase !== 'drawing') {
      return { valid: false, message: 'Not in drawing phase' };
    }
    if (this.discardPile.length === 0) {
      return { valid: false, message: 'Discard pile is empty' };
    }

    const card = this.discardPile.pop();
    this.hands[playerId].push(card);
    this.phase = 'discarding';

    return { valid: true, drawnCard: card, source: 'discard' };
  }

  handleDiscard(playerId, cardIndex) {
    if (this.phase !== 'discarding') {
      return { valid: false, message: 'Not in discard phase' };
    }

    const hand = this.hands[playerId];
    if (cardIndex < 0 || cardIndex >= hand.length) {
      return { valid: false, message: 'Invalid card index' };
    }

    const card = hand.splice(cardIndex, 1)[0];
    this.discardPile.push(card);

    // Check stock exhaustion — draw
    if (this.deck.length === 0) {
      this.gameOver = true;
      this.winner = null;
      this.phase = 'gameOver';
      return { valid: true, discardedCard: card, gameOver: true, isDraw: true };
    }

    // Next turn
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
    this.phase = 'drawing';

    return { valid: true, discardedCard: card };
  }

  handleGin(playerId, cardIndex) {
    if (this.phase !== 'discarding') {
      return { valid: false, message: 'Not in discard phase' };
    }

    const hand = this.hands[playerId];
    if (cardIndex < 0 || cardIndex >= hand.length) {
      return { valid: false, message: 'Invalid card index' };
    }

    // Discard the chosen card
    const discarded = hand.splice(cardIndex, 1)[0];
    this.discardPile.push(discarded);

    // Verify gin
    const result = findBestMelds(hand);
    if (result.deadwoodPoints !== 0) {
      // Put card back, invalid gin
      hand.push(discarded);
      this.discardPile.pop();
      return { valid: false, message: 'Not a valid Gin — you still have deadwood' };
    }

    const opponentId = this.getOpponentId(playerId);
    const opponentResult = findBestMelds(this.hands[opponentId]);

    this.gameOver = true;
    this.winner = playerId;
    this.phase = 'gameOver';

    return {
      valid: true,
      gin: true,
      gameOver: true,
      winnerId: playerId,
      loserId: opponentId,
      winnerMelds: result.melds,
      loserMelds: opponentResult.melds,
      loserHand: [...this.hands[opponentId]],
      winnerHand: [...hand],
      discardedCard: discarded
    };
  }

  removePlayer(playerId) {
    const idx = this.playerIds.indexOf(playerId);
    if (idx === -1) return;

    this.gameOver = true;
    this.phase = 'gameOver';
    this.winner = this.playerIds.find(id => id !== playerId) || null;
  }

  getState(forPlayerId) {
    const opponentId = this.getOpponentId(forPlayerId);

    return {
      phase: this.phase,
      myHand: this.hands[forPlayerId] || [],
      opponentCardCount: this.hands[opponentId] ? this.hands[opponentId].length : 0,
      stockCount: this.deck.length,
      discardTop: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
      currentPlayerId: this.getCurrentPlayerId(),
      isMyTurn: forPlayerId === this.getCurrentPlayerId(),
      gameOver: this.gameOver,
      winner: this.winner,
      playerIds: this.playerIds,
      // Reveal opponent hand on game over
      opponentHand: this.phase === 'gameOver' ? (this.hands[opponentId] || []) : undefined
    };
  }
}

module.exports = GinRummy;
