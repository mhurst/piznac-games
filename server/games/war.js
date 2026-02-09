const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
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

class War {
  constructor(player1Id, player2Id) {
    this.players = {
      P1: player1Id,
      P2: player2Id
    };

    // Deal cards
    const deck = shuffleDeck(createDeck());
    this.decks = {
      P1: deck.slice(0, 26),
      P2: deck.slice(26)
    };

    // Won piles (cards go here after winning)
    this.wonPiles = {
      P1: [],
      P2: []
    };

    // Cards currently in play (center)
    this.centerCards = [];

    // Flipped cards this round
    this.flippedCards = {
      P1: null,
      P2: null
    };

    // War cards (face down during war)
    this.warCards = {
      P1: [],
      P2: []
    };

    // Phase: 'waiting' (waiting for flips), 'war' (in war), 'gameover'
    this.phase = 'waiting';
    this.roundWinner = null;
    this.winner = null;
    this.gameOver = false;

    // Track if players have flipped this round
    this.hasFlipped = {
      P1: false,
      P2: false
    };
  }

  getPlayerSymbol(playerId) {
    if (this.players.P1 === playerId) return 'P1';
    if (this.players.P2 === playerId) return 'P2';
    return null;
  }

  getOpponentSymbol(playerSymbol) {
    return playerSymbol === 'P1' ? 'P2' : 'P1';
  }

  getTotalCards(playerSymbol) {
    return this.decks[playerSymbol].length + this.wonPiles[playerSymbol].length;
  }

  // Draw a card from the player's deck, reshuffling won pile if needed
  drawCard(playerSymbol) {
    if (this.decks[playerSymbol].length === 0) {
      if (this.wonPiles[playerSymbol].length === 0) {
        return null; // Player has no cards left
      }
      // Reshuffle won pile into deck
      this.decks[playerSymbol] = shuffleDeck(this.wonPiles[playerSymbol]);
      this.wonPiles[playerSymbol] = [];
    }
    return this.decks[playerSymbol].shift();
  }

  // Player flips their top card
  flip(playerId) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) return { valid: false, message: 'Invalid player' };

    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    if (this.phase !== 'waiting') {
      return { valid: false, message: 'Not in flip phase' };
    }

    if (this.hasFlipped[playerSymbol]) {
      return { valid: false, message: 'Already flipped this round' };
    }

    const card = this.drawCard(playerSymbol);
    if (!card) {
      // Player ran out of cards
      this.gameOver = true;
      this.winner = this.getOpponentSymbol(playerSymbol);
      return { valid: true, gameOver: true, winner: this.players[this.winner] };
    }

    this.flippedCards[playerSymbol] = card;
    this.centerCards.push({ card, player: playerSymbol });
    this.hasFlipped[playerSymbol] = true;

    // Check if both players have flipped
    if (this.hasFlipped.P1 && this.hasFlipped.P2) {
      return this.resolveRound();
    }

    return { valid: true, waiting: true, card };
  }

  resolveRound() {
    const p1Card = this.flippedCards.P1;
    const p2Card = this.flippedCards.P2;

    if (p1Card.value > p2Card.value) {
      // P1 wins
      this.roundWinner = 'P1';
      this.awardCards('P1');
      this.resetRound();
      return this.checkGameOver('P1');
    } else if (p2Card.value > p1Card.value) {
      // P2 wins
      this.roundWinner = 'P2';
      this.awardCards('P2');
      this.resetRound();
      return this.checkGameOver('P2');
    } else {
      // War!
      return this.initiateWar();
    }
  }

  initiateWar() {
    this.phase = 'war';
    this.warCards = { P1: [], P2: [] };

    // Each player puts 3 cards face down
    for (let i = 0; i < 3; i++) {
      const p1Card = this.drawCard('P1');
      const p2Card = this.drawCard('P2');

      if (!p1Card) {
        // P1 can't complete war, P2 wins
        this.gameOver = true;
        this.winner = 'P2';
        return { valid: true, war: true, gameOver: true, winner: this.players.P2, reason: 'P1 cannot complete war' };
      }
      if (!p2Card) {
        // P2 can't complete war, P1 wins
        this.gameOver = true;
        this.winner = 'P1';
        return { valid: true, war: true, gameOver: true, winner: this.players.P1, reason: 'P2 cannot complete war' };
      }

      this.warCards.P1.push(p1Card);
      this.warCards.P2.push(p2Card);
      this.centerCards.push({ card: p1Card, player: 'P1', faceDown: true });
      this.centerCards.push({ card: p2Card, player: 'P2', faceDown: true });
    }

    // Reset for war flip
    this.hasFlipped = { P1: false, P2: false };
    this.flippedCards = { P1: null, P2: null };
    this.phase = 'waiting';

    return { valid: true, war: true, warInitiated: true };
  }

  awardCards(winnerSymbol) {
    // All center cards go to winner's won pile
    for (const item of this.centerCards) {
      this.wonPiles[winnerSymbol].push(item.card);
    }
    this.centerCards = [];
  }

  resetRound() {
    this.flippedCards = { P1: null, P2: null };
    this.warCards = { P1: [], P2: [] };
    this.hasFlipped = { P1: false, P2: false };
    this.phase = 'waiting';
  }

  checkGameOver(lastWinner) {
    const p1Total = this.getTotalCards('P1');
    const p2Total = this.getTotalCards('P2');

    if (p1Total === 52) {
      this.gameOver = true;
      this.winner = 'P1';
      return { valid: true, roundWinner: lastWinner, gameOver: true, winner: this.players.P1 };
    }
    if (p2Total === 52) {
      this.gameOver = true;
      this.winner = 'P2';
      return { valid: true, roundWinner: lastWinner, gameOver: true, winner: this.players.P2 };
    }
    if (p1Total === 0) {
      this.gameOver = true;
      this.winner = 'P2';
      return { valid: true, roundWinner: lastWinner, gameOver: true, winner: this.players.P2 };
    }
    if (p2Total === 0) {
      this.gameOver = true;
      this.winner = 'P1';
      return { valid: true, roundWinner: lastWinner, gameOver: true, winner: this.players.P1 };
    }

    return { valid: true, roundWinner: lastWinner, gameOver: false };
  }

  // Get state for a specific player (hides opponent's deck)
  getState(forPlayerId = null) {
    const forPlayerSymbol = forPlayerId ? this.getPlayerSymbol(forPlayerId) : null;

    const state = {
      phase: this.phase,
      players: { ...this.players },
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      roundWinner: this.roundWinner,
      p1CardCount: this.getTotalCards('P1'),
      p2CardCount: this.getTotalCards('P2'),
      hasFlipped: { ...this.hasFlipped },
      // Show flipped cards to both players
      flippedCards: {
        P1: this.flippedCards.P1,
        P2: this.flippedCards.P2
      },
      centerCardCount: this.centerCards.length,
      inWar: this.centerCards.length > 2, // More than 2 cards means war is happening
      warCardCount: this.warCards.P1.length // How many face-down cards each player put
    };

    if (forPlayerSymbol) {
      state.mySymbol = forPlayerSymbol;
      state.myCardCount = this.getTotalCards(forPlayerSymbol);
      state.opponentCardCount = this.getTotalCards(this.getOpponentSymbol(forPlayerSymbol));
      state.myDeckCount = this.decks[forPlayerSymbol].length;
      state.myWonPileCount = this.wonPiles[forPlayerSymbol].length;
      state.iHaveFlipped = this.hasFlipped[forPlayerSymbol];
      state.opponentHasFlipped = this.hasFlipped[this.getOpponentSymbol(forPlayerSymbol)];
    }

    return state;
  }

  // For timed mode - determine winner by card count
  getTimedWinner() {
    const p1Total = this.getTotalCards('P1');
    const p2Total = this.getTotalCards('P2');

    if (p1Total > p2Total) {
      return { winner: this.players.P1, p1Cards: p1Total, p2Cards: p2Total };
    } else if (p2Total > p1Total) {
      return { winner: this.players.P2, p1Cards: p1Total, p2Cards: p2Total };
    } else {
      return { winner: null, tie: true, p1Cards: p1Total, p2Cards: p2Total };
    }
  }
}

module.exports = War;
