/**
 * Go Fish — Server-side game logic for multiplayer.
 * Supports 2-4 players. Standard rules:
 * - 2 players: 7 cards each; 3-4 players: 5 cards each
 * - Ask a player for a rank you hold; they give ALL matching cards or "Go Fish"
 * - If you get cards OR draw the asked rank, you get another turn
 * - 4 of same rank = book (laid down)
 * - Game ends when all 13 books made OR a player has 0 cards + empty deck
 * - Most books wins
 */

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck = [];
  for (const suit of suits) {
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

class GoFish {
  constructor(playerIds) {
    this.playerIds = [...playerIds];
    this.playerCount = playerIds.length;
    this.deck = shuffleDeck(createDeck());

    // Per-player state
    this.players = {};
    for (const id of playerIds) {
      this.players[id] = {
        hand: [],
        books: []
      };
    }

    // Deal initial cards
    const cardsEach = this.playerCount <= 2 ? 7 : 5;
    for (let i = 0; i < cardsEach; i++) {
      for (const id of playerIds) {
        this.players[id].hand.push(this.deck.pop());
      }
    }

    // Check initial books
    for (const id of playerIds) {
      this.checkAndRemoveBooks(id);
    }

    this.currentPlayerIndex = 0;
    this.phase = 'playing';
    this.lastAction = null;
    this.gameOver = false;
    this.winner = null;

    // AI tracking for MP AI
    this.aiMemory = {};
  }

  getCurrentPlayerId() {
    return this.playerIds[this.currentPlayerIndex];
  }

  makeMove(playerId, move) {
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    if (playerId !== this.getCurrentPlayerId()) {
      return { valid: false, message: 'Not your turn' };
    }

    if (move.type === 'ask') {
      return this.handleAsk(playerId, move.targetId, move.rank);
    }

    return { valid: false, message: 'Invalid move type' };
  }

  handleAsk(askerId, targetId, rank) {
    const asker = this.players[askerId];
    const target = this.players[targetId];

    if (!asker || !target) {
      return { valid: false, message: 'Invalid player' };
    }

    if (askerId === targetId) {
      return { valid: false, message: 'Cannot ask yourself' };
    }

    // Asker must hold at least one card of the asked rank
    const askerHasRank = asker.hand.some(c => c.value === rank);
    if (!askerHasRank) {
      return { valid: false, message: 'You must hold a card of the rank you ask for' };
    }

    // Target must have cards (can't ask someone with empty hand)
    if (target.hand.length === 0) {
      return { valid: false, message: 'That player has no cards' };
    }

    // Find matching cards in target's hand
    const matchingCards = target.hand.filter(c => c.value === rank);
    const gotCards = matchingCards.length > 0;
    let drewMatch = false;
    let drawnCard = null;
    let anotherTurn = false;
    let newBook = null;

    if (gotCards) {
      // Transfer all matching cards
      target.hand = target.hand.filter(c => c.value !== rank);
      asker.hand.push(...matchingCards);
      anotherTurn = true;
    } else {
      // Go Fish — draw from deck
      if (this.deck.length > 0) {
        drawnCard = this.deck.pop();
        asker.hand.push(drawnCard);
        drewMatch = drawnCard.value === rank;
        if (drewMatch) {
          anotherTurn = true;
        }
      }
    }

    // Check for new books
    newBook = this.checkAndRemoveBooks(askerId);

    // Handle empty hands — draw if deck has cards
    this.handleEmptyHand(askerId);
    this.handleEmptyHand(targetId);

    // Build last action
    this.lastAction = {
      askerId,
      targetId,
      rank,
      gotCards,
      cardsGiven: matchingCards.length,
      drewMatch,
      newBook
    };

    // Check game end
    const gameEnd = this.checkGameEnd();
    if (gameEnd) {
      this.gameOver = true;
      this.phase = 'gameOver';
      this.winner = gameEnd.winnerId;
    } else if (!anotherTurn) {
      this.advanceTurn();
    }

    return {
      valid: true,
      gotCards,
      cardsGiven: matchingCards.length,
      drewMatch,
      anotherTurn,
      newBook,
      gameOver: this.gameOver,
      winner: this.winner,
      isDraw: gameEnd?.isDraw || false,
      drawnCard
    };
  }

  checkAndRemoveBooks(playerId) {
    const player = this.players[playerId];
    let newBook = null;

    for (const rank of RANKS) {
      const matching = player.hand.filter(c => c.value === rank);
      if (matching.length === 4) {
        player.hand = player.hand.filter(c => c.value !== rank);
        player.books.push(rank);
        newBook = rank;
      }
    }

    return newBook;
  }

  handleEmptyHand(playerId) {
    const player = this.players[playerId];
    if (player.hand.length === 0 && this.deck.length > 0) {
      // Draw a card from the deck
      player.hand.push(this.deck.pop());
    }
  }

  checkGameEnd() {
    // All 13 books made
    let totalBooks = 0;
    for (const id of this.playerIds) {
      totalBooks += this.players[id].books.length;
    }
    if (totalBooks === 13) {
      return this.getWinner();
    }

    // All players have empty hands and deck is empty
    const allEmpty = this.playerIds.every(id =>
      this.players[id].hand.length === 0
    );
    if (allEmpty && this.deck.length === 0) {
      return this.getWinner();
    }

    return null;
  }

  getWinner() {
    let maxBooks = 0;
    let winnerId = null;
    let isDraw = false;

    for (const id of this.playerIds) {
      const books = this.players[id].books.length;
      if (books > maxBooks) {
        maxBooks = books;
        winnerId = id;
        isDraw = false;
      } else if (books === maxBooks && winnerId !== null) {
        isDraw = true;
      }
    }

    return { winnerId: isDraw ? null : winnerId, isDraw, maxBooks };
  }

  advanceTurn() {
    let attempts = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerCount;
      attempts++;
      // Skip players with no cards if deck is also empty
      const pid = this.getCurrentPlayerId();
      const player = this.players[pid];
      if (player.hand.length > 0) break;
      if (this.deck.length > 0) {
        this.handleEmptyHand(pid);
        break;
      }
    } while (attempts < this.playerCount);
  }

  getAIMove(playerId) {
    const player = this.players[playerId];
    if (!player || player.hand.length === 0) return null;

    // Pick a random rank from hand
    const ranks = [...new Set(player.hand.map(c => c.value))];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];

    // Pick a random other player with cards
    const targets = this.playerIds.filter(id =>
      id !== playerId && this.players[id].hand.length > 0
    );
    if (targets.length === 0) return null;

    const targetId = targets[Math.floor(Math.random() * targets.length)];

    return { type: 'ask', targetId, rank };
  }

  removePlayer(playerId) {
    const idx = this.playerIds.indexOf(playerId);
    if (idx === -1) return;

    // Put cards back into deck
    const player = this.players[playerId];
    if (player) {
      this.deck.push(...player.hand);
      this.deck = shuffleDeck(this.deck);
      delete this.players[playerId];
    }

    this.playerIds.splice(idx, 1);
    this.playerCount = this.playerIds.length;

    // Adjust current player index
    if (this.currentPlayerIndex >= this.playerCount) {
      this.currentPlayerIndex = 0;
    }

    // Check if game should end
    if (this.playerCount < 2) {
      this.gameOver = true;
      this.phase = 'gameOver';
      this.winner = this.playerIds[0] || null;
    }
  }

  getState(forPlayerId) {
    const players = this.playerIds.map(id => {
      const p = this.players[id];
      const isMe = id === forPlayerId;
      return {
        id,
        hand: isMe ? p.hand : p.hand.map(() => ({ suit: 'back', value: '?', faceDown: true })),
        books: p.books,
        cardCount: p.hand.length,
        isActive: id === this.getCurrentPlayerId()
      };
    });

    return {
      phase: this.phase,
      players,
      currentPlayerId: this.getCurrentPlayerId(),
      deckCount: this.deck.length,
      lastAction: this.lastAction,
      gameOver: this.gameOver,
      winner: this.winner
    };
  }
}

module.exports = GoFish;
