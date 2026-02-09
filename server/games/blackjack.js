/**
 * Blackjack — Server-side game logic for multiplayer.
 * Supports 2-4 players, all vs dealer. Server generates cards and validates all moves.
 */

function createDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const suit of suits) {
    for (const value of values) {
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

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.value === 'A') {
      aces++;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      total += 10;
    } else {
      total += parseInt(card.value, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && handTotal(hand) === 21;
}

function isSoft(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.value === 'A') {
      aces++;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      total += 10;
    } else {
      total += parseInt(card.value, 10);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return aces > 0;
}

class Blackjack {
  constructor(playerIds) {
    this.playerIds = [...playerIds];
    this.playerCount = playerIds.length;

    // Deck
    this.deck = shuffleDeck(createDeck());

    // Per-player state
    this.players = {};
    for (const id of playerIds) {
      this.players[id] = {
        chips: 1000,
        bet: 0,
        hand: [],
        hasBet: false,
        done: false,
        busted: false,
        blackjack: false,
        isEliminated: false,
        result: null,
        payout: 0
      };
    }

    // Dealer
    this.dealerHand = [];
    this.dealerBusted = false;

    // Turn tracking
    this.currentPlayerIndex = 0;
    this.phase = 'betting'; // betting, dealing, playerTurn, dealerTurn, settlement
    this.gameOver = false;
    this.winner = null;
  }

  drawCard() {
    if (this.deck.length < 15) {
      this.deck = shuffleDeck(createDeck());
    }
    return this.deck.pop();
  }

  get activePlayers() {
    return this.playerIds.filter(id => !this.players[id].isEliminated);
  }

  get currentPlayerId() {
    const active = this.activePlayers;
    if (this.currentPlayerIndex >= active.length) return null;
    return active[this.currentPlayerIndex];
  }

  makeMove(playerId, move) {
    if (this.gameOver) return { valid: false, message: 'Game is over' };

    const player = this.players[playerId];
    if (!player) return { valid: false, message: 'Not in this game' };
    if (player.isEliminated) return { valid: false, message: 'You are eliminated' };

    switch (move.type) {
      case 'bet': return this.handleBet(playerId, move.amount);
      case 'hit': return this.handleHit(playerId);
      case 'stand': return this.handleStand(playerId);
      case 'double': return this.handleDouble(playerId);
      case 'next-round': return this.handleNextRound(playerId);
      default: return { valid: false, message: 'Unknown move type' };
    }
  }

  handleBet(playerId, amount) {
    if (this.phase !== 'betting') return { valid: false, message: 'Not in betting phase' };

    const player = this.players[playerId];
    if (player.hasBet) return { valid: false, message: 'Already placed bet' };
    if (typeof amount !== 'number' || amount <= 0) return { valid: false, message: 'Invalid bet amount' };
    if (amount > player.chips) return { valid: false, message: 'Not enough chips' };

    player.bet = amount;
    player.chips -= amount;
    player.hasBet = true;

    // Check if all active players have bet
    const allBet = this.activePlayers.every(id => this.players[id].hasBet);

    if (allBet) {
      // Auto-deal
      this.dealCards();
      return { valid: true, allBet: true, dealt: true };
    }

    return { valid: true, allBet: false };
  }

  dealCards() {
    this.phase = 'dealing';

    // Deal 2 cards to each player and dealer, alternating
    const active = this.activePlayers;
    for (let round = 0; round < 2; round++) {
      for (const id of active) {
        this.players[id].hand.push(this.drawCard());
      }
      this.dealerHand.push(this.drawCard());
    }

    // Check for blackjacks
    for (const id of active) {
      if (isBlackjack(this.players[id].hand)) {
        this.players[id].blackjack = true;
        this.players[id].done = true;
      }
    }

    // Find first non-done player
    this.currentPlayerIndex = 0;
    this.skipDonePlayers();

    if (this.currentPlayerId === null || this.activePlayers.every(id => this.players[id].done)) {
      // All players have blackjack or are done — go straight to dealer
      this.phase = 'dealerTurn';
      this.playDealer();
    } else {
      this.phase = 'playerTurn';
    }
  }

  handleHit(playerId) {
    if (this.phase !== 'playerTurn') return { valid: false, message: 'Not in player turn phase' };
    if (playerId !== this.currentPlayerId) return { valid: false, message: 'Not your turn' };

    const player = this.players[playerId];
    const card = this.drawCard();
    player.hand.push(card);

    const total = handTotal(player.hand);
    if (total > 21) {
      player.busted = true;
      player.done = true;
      this.advancePlayer();
      return { valid: true, card, busted: true };
    }

    if (total === 21) {
      player.done = true;
      this.advancePlayer();
      return { valid: true, card, busted: false };
    }

    return { valid: true, card, busted: false };
  }

  handleStand(playerId) {
    if (this.phase !== 'playerTurn') return { valid: false, message: 'Not in player turn phase' };
    if (playerId !== this.currentPlayerId) return { valid: false, message: 'Not your turn' };

    this.players[playerId].done = true;
    this.advancePlayer();

    return { valid: true };
  }

  handleDouble(playerId) {
    if (this.phase !== 'playerTurn') return { valid: false, message: 'Not in player turn phase' };
    if (playerId !== this.currentPlayerId) return { valid: false, message: 'Not your turn' };

    const player = this.players[playerId];
    if (player.hand.length !== 2) return { valid: false, message: 'Can only double on first 2 cards' };
    if (player.chips < player.bet) return { valid: false, message: 'Not enough chips to double' };

    // Double the bet
    player.chips -= player.bet;
    player.bet *= 2;

    // Draw exactly 1 card
    const card = this.drawCard();
    player.hand.push(card);

    const total = handTotal(player.hand);
    if (total > 21) {
      player.busted = true;
    }
    player.done = true;

    this.advancePlayer();

    return { valid: true, card, doubled: true, busted: total > 21 };
  }

  advancePlayer() {
    this.currentPlayerIndex++;
    this.skipDonePlayers();

    if (this.currentPlayerId === null || this.currentPlayerIndex >= this.activePlayers.length) {
      // All players done — dealer plays
      this.phase = 'dealerTurn';
      this.playDealer();
    }
  }

  skipDonePlayers() {
    const active = this.activePlayers;
    while (this.currentPlayerIndex < active.length && this.players[active[this.currentPlayerIndex]].done) {
      this.currentPlayerIndex++;
    }
  }

  playDealer() {
    // Dealer hits until hard 17+ (must hit soft 17)
    while (handTotal(this.dealerHand) < 17 || (handTotal(this.dealerHand) === 17 && isSoft(this.dealerHand))) {
      this.dealerHand.push(this.drawCard());
    }
    if (handTotal(this.dealerHand) > 21) {
      this.dealerBusted = true;
    }

    this.settleAll();
  }

  settleAll() {
    this.phase = 'settlement';
    const dealerTotal = handTotal(this.dealerHand);
    const dealerBJ = isBlackjack(this.dealerHand);

    for (const id of this.activePlayers) {
      const player = this.players[id];
      const playerTotal = handTotal(player.hand);
      const playerBJ = isBlackjack(player.hand);

      if (playerBJ && dealerBJ) {
        // Push
        player.result = 'push';
        player.payout = player.bet;
        player.chips += player.bet;
      } else if (playerBJ) {
        // Blackjack pays 3:2
        player.result = 'blackjack';
        player.payout = player.bet + Math.floor(player.bet * 1.5);
        player.chips += player.payout;
      } else if (player.busted) {
        // Bust — already lost bet
        player.result = 'lose';
        player.payout = 0;
      } else if (dealerBJ) {
        player.result = 'lose';
        player.payout = 0;
      } else if (this.dealerBusted) {
        player.result = 'win';
        player.payout = player.bet * 2;
        player.chips += player.payout;
      } else if (playerTotal > dealerTotal) {
        player.result = 'win';
        player.payout = player.bet * 2;
        player.chips += player.payout;
      } else if (dealerTotal > playerTotal) {
        player.result = 'lose';
        player.payout = 0;
      } else {
        // Push
        player.result = 'push';
        player.payout = player.bet;
        player.chips += player.bet;
      }

      // Eliminate players at 0 chips
      if (player.chips <= 0) {
        player.isEliminated = true;
      }
    }

    // Check if game is over (only 1 or 0 non-eliminated players)
    const remaining = this.activePlayers;
    if (remaining.length <= 1) {
      this.gameOver = true;
      this.winner = remaining.length === 1 ? remaining[0] : null;
    }
  }

  handleNextRound(playerId) {
    if (this.phase !== 'settlement') return { valid: false, message: 'Round not settled yet' };
    if (this.gameOver) return { valid: false, message: 'Game is over' };

    // Reset for new round
    this.dealerHand = [];
    this.dealerBusted = false;
    this.currentPlayerIndex = 0;
    this.phase = 'betting';

    for (const id of this.activePlayers) {
      const player = this.players[id];
      player.bet = 0;
      player.hand = [];
      player.hasBet = false;
      player.done = false;
      player.busted = false;
      player.blackjack = false;
      player.result = null;
      player.payout = 0;
    }

    return { valid: true, newRound: true };
  }

  removePlayer(playerId) {
    const player = this.players[playerId];
    if (!player) return;

    player.isEliminated = true;

    // If it was their turn, advance
    if (this.phase === 'playerTurn' && playerId === this.currentPlayerId) {
      player.done = true;
      this.advancePlayer();
    }

    // If they hadn't bet yet and we're waiting, check if all remaining have bet
    if (this.phase === 'betting') {
      player.hasBet = true;
      const allBet = this.activePlayers.every(id => this.players[id].hasBet);
      if (allBet && this.activePlayers.length > 0) {
        this.dealCards();
      }
    }

    // Check game over
    const remaining = this.activePlayers;
    if (remaining.length <= 1) {
      this.gameOver = true;
      this.winner = remaining.length === 1 ? remaining[0] : null;
    }
  }

  getState(forPlayerId = null) {
    const active = this.activePlayers;
    const showDealerHole = this.phase === 'dealerTurn' || this.phase === 'settlement';

    const dealerCards = this.dealerHand.map((card, i) => {
      if (i === 1 && !showDealerHole) {
        return { suit: card.suit, value: card.value, faceDown: true };
      }
      return { suit: card.suit, value: card.value };
    });

    const playerList = this.playerIds.map(id => {
      const p = this.players[id];
      return {
        id,
        hand: p.hand.map(c => ({ suit: c.suit, value: c.value })),
        total: handTotal(p.hand),
        chips: p.chips,
        bet: p.bet,
        hasBet: p.hasBet,
        done: p.done,
        busted: p.busted,
        blackjack: p.blackjack,
        isEliminated: p.isEliminated,
        result: p.result,
        payout: p.payout
      };
    });

    return {
      phase: this.phase,
      dealer: {
        cards: dealerCards,
        total: showDealerHole ? handTotal(this.dealerHand) : 0,
        busted: this.dealerBusted && showDealerHole,
        blackjack: isBlackjack(this.dealerHand) && showDealerHole,
        revealHole: showDealerHole
      },
      players: playerList,
      currentPlayerId: this.currentPlayerId,
      currentPlayerIndex: active.indexOf(this.currentPlayerId),
      gameOver: this.gameOver,
      winner: this.winner
    };
  }
}

module.exports = Blackjack;
