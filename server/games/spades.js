/**
 * Spades — Server-side game logic for multiplayer.
 * 4-player partnership: seats 0,2 = team 0; seats 1,3 = team 1.
 * First team to 500 wins. -200 = loss. Bags penalize at 10.
 */

const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const CARD_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
const SUIT_ORDER = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
const TEAM_FOR_SEAT = { 0: 0, 1: 1, 2: 0, 3: 1 };

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
  const s = [...deck];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => {
    const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return s !== 0 ? s : CARD_VALUES[a.value] - CARD_VALUES[b.value];
  });
}

function getLegalPlays(hand, ledSuit, spadesbroken, isFirstLead) {
  if (hand.length === 0) return [];

  // First lead of entire round: must lead 2 of clubs
  if (isFirstLead) {
    const twoClubs = hand.filter(c => c.suit === 'clubs' && c.value === '2');
    return twoClubs.length > 0 ? twoClubs : hand;
  }

  // Leading
  if (!ledSuit) {
    if (!spadesbroken) {
      const nonSpades = hand.filter(c => c.suit !== 'spades');
      return nonSpades.length > 0 ? nonSpades : hand;
    }
    return hand;
  }

  // Following suit
  const following = hand.filter(c => c.suit === ledSuit);
  if (following.length > 0) return following;

  // Can't follow — play anything
  return hand;
}

function trickWinner(trick) {
  const ledSuit = trick[0].card.suit;
  let best = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const t = trick[i];
    if (t.card.suit === 'spades' && best.card.suit !== 'spades') {
      best = t;
    } else if (t.card.suit === 'spades' && best.card.suit === 'spades') {
      if (CARD_VALUES[t.card.value] > CARD_VALUES[best.card.value]) best = t;
    } else if (t.card.suit === ledSuit && best.card.suit === ledSuit) {
      if (CARD_VALUES[t.card.value] > CARD_VALUES[best.card.value]) best = t;
    }
  }

  return best.seat;
}

class Spades {
  constructor(playerIds) {
    this.playerIds = playerIds; // [seat0, seat1, seat2, seat3]
    this.seats = {};
    playerIds.forEach((id, i) => { this.seats[id] = i; });

    this.teamScores = [{ score: 0, bags: 0 }, { score: 0, bags: 0 }];
    this.dealer = Math.floor(Math.random() * 4);
    this.round = 0;
    this.gameOver = false;
    this.winner = null; // 'team0' or 'team1'

    this.hands = {};
    this.bids = [null, null, null, null]; // PlayerBid per seat
    this.tricksWon = [0, 0, 0, 0];
    this.currentTrick = [];
    this.trickLeader = 0;
    this.currentPlayer = 0;
    this.spadesbroken = false;
    this.isFirstLead = false;
    this.trickCount = 0;
    this.phase = 'waiting'; // waiting, blind-nil, bidding, playing, trickEnd, roundEnd, gameOver
    this.roundSummary = null;
    this.blindNilPhase = false; // true during blind nil offer round
    this.blindNilSeat = -1; // which seat is being offered blind nil

    this.startRound();
  }

  startRound() {
    this.round++;
    this.dealer = (this.dealer + 1) % 4;
    this.spadesbroken = false;
    this.isFirstLead = true;
    this.currentTrick = [];
    this.roundSummary = null;
    this.trickCount = 0;
    this.bids = [null, null, null, null];
    this.tricksWon = [0, 0, 0, 0];

    // Deal
    const deck = shuffleDeck(createDeck());
    for (let i = 0; i < 4; i++) {
      this.hands[this.playerIds[i]] = sortHand(deck.slice(i * 13, (i + 1) * 13));
    }

    // Start blind nil offer phase
    this.phase = 'blind-nil';
    this.currentPlayer = (this.dealer + 1) % 4;
    this.blindNilSeat = this.currentPlayer;
  }

  getCurrentPlayerId() {
    return this.playerIds[this.currentPlayer];
  }

  makeMove(playerId, move) {
    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    const seat = this.seats[playerId];
    if (seat === undefined) {
      return { valid: false, message: 'Not in game' };
    }

    switch (move.type) {
      case 'blind-nil-accept':
        return this.handleBlindNil(seat, true);
      case 'blind-nil-decline':
        return this.handleBlindNil(seat, false);
      case 'bid':
        return this.handleBid(seat, move.amount);
      case 'play':
        return this.handlePlay(seat, move.cardIndex);
      case 'next-round':
        return this.handleNextRound();
      default:
        return { valid: false, message: 'Invalid move type' };
    }
  }

  handleBlindNil(seat, accept) {
    if (this.phase !== 'blind-nil') {
      return { valid: false, message: 'Not in blind nil phase' };
    }
    if (seat !== this.blindNilSeat) {
      return { valid: false, message: 'Not your turn for blind nil' };
    }

    if (accept) {
      this.bids[seat] = { amount: 0, blind: true };
    }

    // Move to next seat for blind nil offer
    this.blindNilSeat = (this.blindNilSeat + 1) % 4;

    // If we've gone around to the starting bidder, move to normal bidding
    const startBidder = (this.dealer + 1) % 4;
    if (this.blindNilSeat === startBidder) {
      this.phase = 'bidding';
      // Find first seat that hasn't bid yet
      this.currentPlayer = startBidder;
      while (this.bids[this.currentPlayer] !== null) {
        this.currentPlayer = (this.currentPlayer + 1) % 4;
        if (this.currentPlayer === startBidder) break;
      }
      // If everyone already bid blind nil somehow, start playing
      if (this.bids.every(b => b !== null)) {
        this.startPlaying();
      }
    }

    return { valid: true, blindNil: accept };
  }

  handleBid(seat, amount) {
    if (this.phase !== 'bidding') {
      return { valid: false, message: 'Not in bidding phase' };
    }
    if (seat !== this.currentPlayer) {
      return { valid: false, message: 'Not your turn to bid' };
    }
    if (this.bids[seat] !== null) {
      return { valid: false, message: 'Already bid' };
    }
    if (amount < 0 || amount > 13) {
      return { valid: false, message: 'Invalid bid amount' };
    }

    this.bids[seat] = { amount, blind: false };

    // Find next unbid player
    let next = (this.currentPlayer + 1) % 4;
    let checked = 0;
    while (checked < 4 && this.bids[next] !== null) {
      next = (next + 1) % 4;
      checked++;
    }

    if (this.bids.every(b => b !== null)) {
      this.startPlaying();
      return { valid: true, allBidsIn: true };
    }

    this.currentPlayer = next;
    return { valid: true };
  }

  startPlaying() {
    this.phase = 'playing';
    this.trickLeader = (this.dealer + 1) % 4;
    this.currentPlayer = this.trickLeader;
  }

  handlePlay(seat, cardIndex) {
    if (this.phase !== 'playing') {
      return { valid: false, message: 'Not in playing phase' };
    }
    if (seat !== this.currentPlayer) {
      return { valid: false, message: 'Not your turn' };
    }

    const hand = this.hands[this.playerIds[seat]];
    if (cardIndex < 0 || cardIndex >= hand.length) {
      return { valid: false, message: 'Invalid card index' };
    }

    const card = hand[cardIndex];
    const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    const legal = getLegalPlays(hand, ledSuit, this.spadesbroken, this.isFirstLead);

    if (!legal.some(c => c.suit === card.suit && c.value === card.value)) {
      return { valid: false, message: 'Illegal play' };
    }

    // Remove card from hand
    hand.splice(cardIndex, 1);

    // Track spades broken
    if (card.suit === 'spades' && !this.spadesbroken) {
      this.spadesbroken = true;
    }

    this.currentTrick.push({ seat, card });
    this.isFirstLead = false;

    if (this.currentTrick.length === 4) {
      // Trick complete
      const winner = trickWinner(this.currentTrick);
      this.tricksWon[winner]++;
      this.trickCount++;

      const trickCards = [...this.currentTrick];
      this.currentTrick = [];
      this.trickLeader = winner;
      this.currentPlayer = winner;

      if (this.trickCount === 13) {
        this.scoreRound();
        return { valid: true, trickComplete: true, trickWinner: winner, trickCards, roundEnd: true };
      }

      return { valid: true, trickComplete: true, trickWinner: winner, trickCards };
    }

    this.currentPlayer = (this.currentPlayer + 1) % 4;
    return { valid: true, cardPlayed: card };
  }

  scoreRound() {
    const nilResults = [];
    const teamBids = [0, 0];
    const teamTricks = [0, 0];
    const teamDeltas = [0, 0];
    const bagPenalty = [false, false];

    for (let seat = 0; seat < 4; seat++) {
      const team = TEAM_FOR_SEAT[seat];
      teamTricks[team] += this.tricksWon[seat];

      if (this.bids[seat].amount === 0) {
        const nilBonus = this.bids[seat].blind ? 200 : 100;
        if (this.tricksWon[seat] === 0) {
          teamDeltas[team] += nilBonus;
          nilResults.push({ seat, name: `Seat ${seat}`, success: true, blind: this.bids[seat].blind });
        } else {
          teamDeltas[team] -= nilBonus;
          nilResults.push({ seat, name: `Seat ${seat}`, success: false, blind: this.bids[seat].blind });
        }
      } else {
        teamBids[team] += this.bids[seat].amount;
      }
    }

    for (let t = 0; t < 2; t++) {
      if (teamBids[t] === 0) continue;
      let nilTricks = 0;
      for (let seat = 0; seat < 4; seat++) {
        if (TEAM_FOR_SEAT[seat] === t && this.bids[seat].amount === 0) {
          nilTricks += this.tricksWon[seat];
        }
      }
      const relevantTricks = teamTricks[t] - nilTricks;

      if (relevantTricks >= teamBids[t]) {
        const overtricks = relevantTricks - teamBids[t];
        teamDeltas[t] += teamBids[t] * 10 + overtricks;
        this.teamScores[t].bags += overtricks;

        if (this.teamScores[t].bags >= 10) {
          teamDeltas[t] -= 100;
          this.teamScores[t].bags -= 10;
          bagPenalty[t] = true;
        }
      } else {
        teamDeltas[t] -= teamBids[t] * 10;
      }
    }

    this.teamScores[0].score += teamDeltas[0];
    this.teamScores[1].score += teamDeltas[1];

    this.roundSummary = {
      round: this.round,
      teamBids,
      teamTricks,
      teamDeltas,
      nilResults,
      bagPenalty
    };

    this.phase = 'roundEnd';
    this.checkWinCondition();
  }

  checkWinCondition() {
    const s0 = this.teamScores[0].score;
    const s1 = this.teamScores[1].score;

    if (s0 <= -200 && s1 <= -200) {
      this.winner = s0 > s1 ? 'team0' : 'team1';
    } else if (s0 <= -200) {
      this.winner = 'team1';
    } else if (s1 <= -200) {
      this.winner = 'team0';
    } else if (s0 >= 500 || s1 >= 500) {
      if (s0 >= 500 && s1 >= 500) {
        this.winner = s0 >= s1 ? 'team0' : 'team1';
      } else if (s0 >= 500) {
        this.winner = 'team0';
      } else {
        this.winner = 'team1';
      }
    }

    if (this.winner) {
      this.gameOver = true;
      this.phase = 'gameOver';
    }
  }

  handleNextRound() {
    if (this.phase !== 'roundEnd') {
      return { valid: false, message: 'Not at round end' };
    }
    this.startRound();
    return { valid: true, newRound: true };
  }

  removePlayer(playerId) {
    const seat = this.seats[playerId];
    if (seat === undefined) return;
    this.gameOver = true;
    this.phase = 'gameOver';
    // The other team wins
    const losingTeam = TEAM_FOR_SEAT[seat];
    this.winner = losingTeam === 0 ? 'team1' : 'team0';
  }

  getState(forPlayerId) {
    const mySeat = this.seats[forPlayerId];
    const myTeam = TEAM_FOR_SEAT[mySeat];

    // Build player info for each seat
    const players = this.playerIds.map((id, seat) => {
      return {
        id,
        seat,
        cardCount: this.hands[id] ? this.hands[id].length : 0,
        bid: this.bids[seat],
        tricksWon: this.tricksWon[seat],
        isCurrentTurn: this.currentPlayer === seat,
        team: TEAM_FOR_SEAT[seat]
      };
    });

    // Legal plays for current player
    let legalIndices = [];
    if (this.phase === 'playing' && mySeat === this.currentPlayer) {
      const hand = this.hands[forPlayerId];
      const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
      const legal = getLegalPlays(hand, ledSuit, this.spadesbroken, this.isFirstLead);
      legalIndices = legal.map(lc =>
        hand.findIndex(hc => hc.suit === lc.suit && hc.value === lc.value)
      ).filter(i => i !== -1);
    }

    // Determine game winner label relative to this player
    let gameWinner = null;
    if (this.winner) {
      const winTeam = this.winner === 'team0' ? 0 : 1;
      gameWinner = winTeam === myTeam ? 'Your Team' : 'Opponents';
    }

    return {
      phase: this.phase,
      players,
      myHand: this.phase === 'blind-nil' && this.blindNilSeat !== -1 ? [] : (this.hands[forPlayerId] || []),
      mySeat,
      myTeam,
      currentTrick: this.currentTrick,
      teamScores: this.teamScores,
      round: this.round,
      dealer: this.dealer,
      currentPlayer: this.currentPlayer,
      spadesbroken: this.spadesbroken,
      trickLeader: this.trickLeader,
      roundSummary: this.roundSummary,
      gameOver: this.gameOver,
      gameWinner,
      legalIndices,
      blindNilOffer: this.phase === 'blind-nil' && this.blindNilSeat === mySeat,
      blindNilSeat: this.phase === 'blind-nil' ? this.blindNilSeat : -1
    };
  }
}

module.exports = Spades;
