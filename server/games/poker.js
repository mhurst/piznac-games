/**
 * Poker — Server-side game logic for multiplayer.
 * Supports 2-6 players. Variants: 5-Card Draw, 7-Card Stud.
 */

const { evaluateHand, evaluateHandWithWilds, evaluateBestHand, evaluateBestHandWithWilds, isCardWild, determineWinners } = require('./poker-hand-evaluator');
const PotManager = require('./poker-pot-manager');

const ANTE_AMOUNT = 1;
const MIN_BET = 5;
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;

const VARIANT_NAMES = {
  'five-card-draw': '5-Card Draw',
  'seven-card-stud': '7-Card Stud',
  'texas-holdem': "Texas Hold'em",
};

const VARIANT_ALLOWS_WILDS = {
  'five-card-draw': true,
  'seven-card-stud': true,
  'texas-holdem': false,
};

const VALID_WILD_OPTIONS = [
  'jokers', 'one-eyed-jacks', 'suicide-king', 'deuces',
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
];

function createDeck(wilds) {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  if (wilds && wilds.includes('jokers')) {
    deck.push({ suit: 'joker', value: 'Joker' });
    deck.push({ suit: 'joker', value: 'Joker' });
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

class Poker {
  constructor(playerIds) {
    this.playerIds = [...playerIds];
    this.playerCount = playerIds.length;
    this.deck = shuffleDeck(createDeck());
    this.potManager = new PotManager();

    // Per-player state
    this.players = {};
    for (const id of playerIds) {
      this.players[id] = {
        chips: STARTING_CHIPS,
        hand: [],
        bet: 0,
        totalBet: 0,
        folded: false,
        allIn: false,
        isEliminated: false,
        result: null,
        payout: 0,
        handResult: null,
        hasActed: false,
        discards: []
      };
    }

    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.phase = 'variant-select';
    this.currentBet = 0;       // highest bet in current betting round
    this.minRaise = MIN_BET;
    this.lastRaiser = null;
    this.gameOver = false;
    this.winner = null;
    this.handNumber = 0;
    this.currentVariant = 'five-card-draw';
    this.activeWilds = [];
    this.wonByFold = false;

    // 7-Card Stud state
    this.studLastCardDown = true;
    this.currentStreet = 0;

    // Texas Hold'em state
    this.communityCards = [];
    this.smallBlindIndex = -1;
    this.bigBlindIndex = -1;

    // Start with variant selection (dealer's choice)
    this.startVariantSelect();
  }

  drawCard() {
    if (this.deck.length < 5) {
      this.deck = shuffleDeck(createDeck(this.activeWilds));
    }
    return this.deck.pop();
  }

  get activePlayers() {
    return this.playerIds.filter(id => !this.players[id].isEliminated);
  }

  get playersInHand() {
    return this.activePlayers.filter(id => !this.players[id].folded);
  }

  get currentPlayerId() {
    const inHand = this.playersInHand;
    if (this.currentPlayerIndex >= inHand.length) return null;
    return inHand[this.currentPlayerIndex];
  }

  get dealerPlayerId() {
    const active = this.activePlayers;
    return active.length > 0 ? active[this.dealerIndex % active.length] : null;
  }

  startVariantSelect() {
    this.phase = 'variant-select';
    // Wait for dealer to choose variant via makeMove('choose-variant')
  }

  startHand() {
    this.handNumber++;
    this.deck = shuffleDeck(createDeck(this.activeWilds));
    this.wonByFold = false;
    this.communityCards = [];

    // Reset player state
    for (const id of this.activePlayers) {
      const p = this.players[id];
      p.hand = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.allIn = false;
      p.result = null;
      p.payout = 0;
      p.handResult = null;
      p.hasActed = false;
      p.discards = [];
    }

    this.currentBet = 0;
    this.minRaise = MIN_BET;
    this.lastRaiser = null;

    // Setup pot manager
    this.potManager.reset();
    this.potManager.setPlayers(this.activePlayers);

    if (this.isHoldem) {
      // Hold'em: post blinds instead of antes
      this.phase = 'dealing';
      this.postBlinds();
      this.dealHoldemPreflop();
    } else {
      // Post antes (Draw + Stud)
      this.phase = 'ante';
      for (const id of this.activePlayers) {
        const p = this.players[id];
        const ante = Math.min(ANTE_AMOUNT, p.chips);
        p.chips -= ante;
        p.bet = ante;
        p.totalBet = ante;
        this.potManager.recordBet(id, ante);
        if (p.chips === 0) {
          p.allIn = true;
          this.potManager.recordAllIn(id);
        }
      }
      this.currentBet = ANTE_AMOUNT;

      if (this.currentVariant === 'seven-card-stud') {
        // Stud: deal 2 down + 1 up (3rd street)
        this.currentStreet = 3;
        this.startStudStreet3();
      } else {
        // Draw: deal 5 cards
        this.phase = 'dealing';
        for (let round = 0; round < 5; round++) {
          for (const id of this.activePlayers) {
            this.players[id].hand.push(this.drawCard());
          }
        }
        // Move to first betting round
        this.startBettingRound('betting1');
      }
    }
  }

  // --- Texas Hold'em ---

  postBlinds() {
    const active = this.activePlayers;
    const count = active.length;

    let sbIdx, bbIdx;

    if (count === 2) {
      // Heads-up: dealer = SB, other = BB
      sbIdx = this.dealerIndex;
      bbIdx = (this.dealerIndex + 1) % count;
    } else {
      // 3+ players: left of dealer = SB, next = BB
      sbIdx = (this.dealerIndex + 1) % count;
      bbIdx = (this.dealerIndex + 2) % count;
    }

    this.smallBlindIndex = sbIdx;
    this.bigBlindIndex = bbIdx;

    // Post small blind
    const sbId = active[sbIdx];
    const sbPlayer = this.players[sbId];
    const sbAmount = Math.min(SMALL_BLIND, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    sbPlayer.totalBet = sbAmount;
    this.potManager.recordBet(sbId, sbAmount);
    if (sbPlayer.chips === 0) {
      sbPlayer.allIn = true;
      this.potManager.recordAllIn(sbId);
    }

    // Post big blind
    const bbId = active[bbIdx];
    const bbPlayer = this.players[bbId];
    const bbAmount = Math.min(BIG_BLIND, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    bbPlayer.totalBet = bbAmount;
    this.potManager.recordBet(bbId, bbAmount);
    if (bbPlayer.chips === 0) {
      bbPlayer.allIn = true;
      this.potManager.recordAllIn(bbId);
    }

    this.currentBet = BIG_BLIND;
  }

  dealHoldemPreflop() {
    // Deal 2 hole cards to each player
    for (let round = 0; round < 2; round++) {
      for (const id of this.activePlayers) {
        this.players[id].hand.push(this.drawCard());
      }
    }

    this.startHoldemBettingRound('betting1');
  }

  startHoldemBettingRound(phaseName) {
    this.phase = phaseName;
    const active = this.activePlayers;
    const inHand = this.playersInHand;
    const count = active.length;

    if (phaseName === 'betting1') {
      // Preflop: don't reset bets (blinds already posted)
      for (const id of active) {
        this.players[id].hasActed = false;
      }

      if (count === 2) {
        // Heads-up: dealer (SB) opens preflop
        this.currentPlayerIndex = inHand.indexOf(active[this.dealerIndex]);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = 0;
      } else {
        // UTG = left of BB
        const utgId = active[(this.bigBlindIndex + 1) % count];
        this.currentPlayerIndex = inHand.indexOf(utgId);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = 0;
      }
    } else {
      // Post-flop: reset bets
      this.currentBet = 0;
      this.minRaise = MIN_BET;
      this.lastRaiser = null;

      for (const id of active) {
        this.players[id].bet = 0;
        this.players[id].hasActed = false;
      }

      if (count === 2) {
        // Heads-up post-flop: BB acts first
        const bbId = active[this.bigBlindIndex];
        this.currentPlayerIndex = inHand.indexOf(bbId);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = 0;
      } else {
        // First active player left of dealer
        for (let i = 1; i <= count; i++) {
          const candidateId = active[(this.dealerIndex + i) % count];
          const idxInHand = inHand.indexOf(candidateId);
          if (idxInHand >= 0 && !this.players[candidateId].folded && !this.players[candidateId].allIn) {
            this.currentPlayerIndex = idxInHand;
            break;
          }
        }
      }
    }

    this.skipInactivePlayers();

    const canAct = this.playersInHand.filter(id => !this.players[id].allIn && !this.players[id].hasActed);
    if (canAct.length <= 1 && (phaseName !== 'betting1' || canAct.length === 0)) {
      this.endBettingRound();
    }
  }

  dealFlop() {
    // Burn 1 card
    this.drawCard();
    // Deal 3 community cards
    this.communityCards.push(this.drawCard(), this.drawCard(), this.drawCard());
    this.startHoldemBettingRound('betting2');
  }

  dealTurn() {
    // Burn 1 card
    this.drawCard();
    // Deal 1 community card
    this.communityCards.push(this.drawCard());
    this.startHoldemBettingRound('betting3');
  }

  dealRiver() {
    // Burn 1 card
    this.drawCard();
    // Deal 1 community card
    this.communityCards.push(this.drawCard());
    this.startHoldemBettingRound('betting4');
  }

  get isStud() {
    return this.currentVariant === 'seven-card-stud';
  }

  get isHoldem() {
    return this.currentVariant === 'texas-holdem';
  }

  startStudStreet3() {
    this.phase = 'street3';
    // 2 face-down cards
    for (let round = 0; round < 2; round++) {
      for (const id of this.activePlayers) {
        const card = this.drawCard();
        card.faceDown = true;
        this.players[id].hand.push(card);
      }
    }
    // 1 face-up card
    for (const id of this.activePlayers) {
      const card = this.drawCard();
      card.faceDown = false;
      this.players[id].hand.push(card);
    }
    this.startStudBettingRound('betting1');
  }

  startStudStreet(streetNum) {
    this.currentStreet = streetNum;
    const phaseMap = { 4: 'street4', 5: 'street5', 6: 'street6', 7: 'street7' };
    this.phase = phaseMap[streetNum];

    const faceDown = (streetNum === 7 && this.studLastCardDown);
    for (const id of this.playersInHand) {
      const card = this.drawCard();
      card.faceDown = faceDown;
      this.players[id].hand.push(card);
    }

    const bettingMap = { 4: 'betting2', 5: 'betting3', 6: 'betting4', 7: 'betting5' };
    this.startStudBettingRound(bettingMap[streetNum]);
  }

  startStudBettingRound(phaseName) {
    this.phase = phaseName;
    this.currentBet = 0;
    this.minRaise = MIN_BET;
    this.lastRaiser = null;

    for (const id of this.activePlayers) {
      this.players[id].bet = 0;
      this.players[id].hasActed = false;
    }

    // Stud: opener is player with highest visible hand
    const openerIndex = this.findStudOpener();
    this.currentPlayerIndex = openerIndex;
    this.skipInactivePlayers();

    const canAct = this.playersInHand.filter(id => !this.players[id].allIn);
    if (canAct.length <= 1) {
      this.endBettingRound();
    }
  }

  findStudOpener() {
    const inHand = this.playersInHand;
    const CARD_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    let bestIdx = 0;
    let bestRank = -1;
    let bestTb = [];

    for (let i = 0; i < inHand.length; i++) {
      const p = this.players[inHand[i]];
      if (p.allIn) continue;
      const upCards = p.hand.filter(c => !c.faceDown);
      if (upCards.length === 0) continue;

      let rank = 0;
      let tb = [];
      if (upCards.length >= 5) {
        const result = this.activeWilds.length > 0
          ? evaluateHandWithWilds(upCards, this.activeWilds)
          : evaluateHand(upCards);
        rank = result.rank;
        tb = result.tiebreakers;
      } else {
        const vals = upCards.map(c => CARD_VALUES[c.value] || 0).sort((a, b) => b - a);
        const counts = new Map();
        vals.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        const maxCount = Math.max(...counts.values());
        rank = maxCount >= 3 ? 3 : maxCount === 2 ? 1 : 0;
        tb = vals;
      }

      if (rank > bestRank || (rank === bestRank && this.compareTb(tb, bestTb) > 0)) {
        bestRank = rank;
        bestTb = tb;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  compareTb(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  startBettingRound(phaseName) {
    this.phase = phaseName;
    this.currentBet = 0;
    this.minRaise = MIN_BET;
    this.lastRaiser = null;

    // Reset per-round bet amounts and action flags
    for (const id of this.activePlayers) {
      const p = this.players[id];
      p.bet = 0;
      p.hasActed = false;
    }

    // Start left of dealer
    const inHand = this.playersInHand;
    this.currentPlayerIndex = (this.dealerIndex + 1) % inHand.length;

    // Skip all-in players
    this.skipInactivePlayers();

    // Check if only one player can act
    const canAct = this.playersInHand.filter(id => !this.players[id].allIn);
    if (canAct.length <= 1) {
      this.endBettingRound();
    }
  }

  skipInactivePlayers() {
    const inHand = this.playersInHand;
    if (inHand.length <= 1) return;

    let iterations = 0;
    while (iterations < inHand.length) {
      const id = inHand[this.currentPlayerIndex % inHand.length];
      const p = this.players[id];
      if (!p.allIn && !p.folded) break;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
      iterations++;
    }
  }

  makeMove(playerId, move) {
    if (this.gameOver) return { valid: false, message: 'Game is over' };

    const player = this.players[playerId];
    if (!player) return { valid: false, message: 'Not in this game' };
    if (player.isEliminated) return { valid: false, message: 'You are eliminated' };

    switch (move.type) {
      case 'choose-variant': return this.handleChooseVariant(playerId, move.variant);
      case 'choose-wilds': return this.handleChooseWilds(playerId, move.wilds, move.lastCardDown);
      case 'buy-in': return this.handleBuyIn(playerId);
      case 'check': return this.handleCheck(playerId);
      case 'call': return this.handleCall(playerId);
      case 'raise': return this.handleRaise(playerId, move.amount);
      case 'fold': return this.handleFold(playerId);
      case 'allin': return this.handleAllIn(playerId);
      case 'discard': return this.handleDiscard(playerId, move.cardIndices);
      case 'stand-pat': return this.handleStandPat(playerId);
      case 'next-hand': return this.handleNextHand(playerId);
      default: return { valid: false, message: 'Unknown move type' };
    }
  }

  handleChooseVariant(playerId, variant) {
    if (this.phase !== 'variant-select') {
      return { valid: false, message: 'Not in variant selection phase' };
    }
    if (playerId !== this.dealerPlayerId) {
      return { valid: false, message: 'Only the dealer can choose the variant' };
    }
    if (!VARIANT_NAMES[variant]) {
      return { valid: false, message: 'Unknown variant' };
    }

    this.currentVariant = variant;
    if (VARIANT_ALLOWS_WILDS[variant]) {
      this.phase = 'wild-select';
      return { valid: true, action: 'choose-variant', variant };
    }
    this.activeWilds = [];
    this.phase = 'ante';
    return { valid: true, action: 'choose-variant', variant };
  }

  handleChooseWilds(playerId, wilds, lastCardDown) {
    if (this.phase !== 'wild-select') {
      return { valid: false, message: 'Not in wild card selection phase' };
    }
    if (playerId !== this.dealerPlayerId) {
      return { valid: false, message: 'Only the dealer can choose wild cards' };
    }
    if (!Array.isArray(wilds)) {
      return { valid: false, message: 'Invalid wild card selection' };
    }
    for (const w of wilds) {
      if (!VALID_WILD_OPTIONS.includes(w)) {
        return { valid: false, message: `Unknown wild card option: ${w}` };
      }
    }

    this.activeWilds = wilds;
    if (lastCardDown !== undefined) {
      this.studLastCardDown = !!lastCardDown;
    }
    this.phase = 'ante';
    return { valid: true, action: 'choose-wilds', wilds };
  }

  handleBuyIn(playerId) {
    if (this.phase !== 'ante') {
      return { valid: false, message: 'Not in buy-in phase' };
    }
    // Any player can trigger the buy-in to start dealing
    this.startHand();
    return { valid: true, action: 'buy-in' };
  }

  isBettingPhase() {
    return ['betting1', 'betting2', 'betting3', 'betting4', 'betting5'].includes(this.phase);
  }

  handleCheck(playerId) {
    if (!this.isBettingPhase()) {
      return { valid: false, message: 'Not in betting phase' };
    }
    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }
    if (this.currentBet > this.players[playerId].bet) {
      return { valid: false, message: 'Cannot check — must call or raise' };
    }

    this.players[playerId].hasActed = true;
    this.advanceBetting();
    return { valid: true, action: 'check' };
  }

  handleCall(playerId) {
    if (!this.isBettingPhase()) {
      return { valid: false, message: 'Not in betting phase' };
    }
    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }

    const p = this.players[playerId];
    const toCall = this.currentBet - p.bet;
    if (toCall <= 0) {
      return { valid: false, message: 'Nothing to call' };
    }

    const actualCall = Math.min(toCall, p.chips);
    p.chips -= actualCall;
    p.bet += actualCall;
    p.totalBet += actualCall;
    this.potManager.recordBet(playerId, actualCall);

    if (p.chips === 0) {
      p.allIn = true;
      this.potManager.recordAllIn(playerId);
    }

    p.hasActed = true;
    this.advanceBetting();
    return { valid: true, action: 'call', amount: actualCall };
  }

  handleRaise(playerId, amount) {
    if (!this.isBettingPhase()) {
      return { valid: false, message: 'Not in betting phase' };
    }
    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }

    const p = this.players[playerId];
    const toCall = this.currentBet - p.bet;
    const totalNeeded = toCall + amount;

    if (amount < this.minRaise) {
      return { valid: false, message: `Minimum raise is ${this.minRaise}` };
    }
    if (totalNeeded > p.chips) {
      return { valid: false, message: 'Not enough chips' };
    }

    p.chips -= totalNeeded;
    p.bet += totalNeeded;
    p.totalBet += totalNeeded;
    this.potManager.recordBet(playerId, totalNeeded);

    this.currentBet = p.bet;
    this.minRaise = Math.max(MIN_BET, amount);
    this.lastRaiser = playerId;

    if (p.chips === 0) {
      p.allIn = true;
      this.potManager.recordAllIn(playerId);
    }

    // Reset hasActed for others since there was a raise
    for (const id of this.playersInHand) {
      if (id !== playerId) {
        this.players[id].hasActed = false;
      }
    }
    p.hasActed = true;

    this.advanceBetting();
    return { valid: true, action: 'raise', amount };
  }

  handleFold(playerId) {
    if (!this.isBettingPhase()) {
      return { valid: false, message: 'Not in betting phase' };
    }
    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }

    this.players[playerId].folded = true;
    this.potManager.recordFold(playerId);
    this.players[playerId].hasActed = true;

    // Check if only one player remains
    if (this.playersInHand.length <= 1) {
      this.handleLastPlayerWins();
      return { valid: true, action: 'fold', handOver: true };
    }

    this.advanceBetting(true);
    return { valid: true, action: 'fold' };
  }

  handleAllIn(playerId) {
    if (!this.isBettingPhase()) {
      return { valid: false, message: 'Not in betting phase' };
    }
    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }

    const p = this.players[playerId];
    const allInAmount = p.chips;
    p.bet += allInAmount;
    p.totalBet += allInAmount;
    p.chips = 0;
    p.allIn = true;
    this.potManager.recordBet(playerId, allInAmount);
    this.potManager.recordAllIn(playerId);

    if (p.bet > this.currentBet) {
      const raiseAmount = p.bet - this.currentBet;
      this.currentBet = p.bet;
      this.minRaise = Math.max(this.minRaise, raiseAmount);
      this.lastRaiser = playerId;
      // Reset hasActed for others
      for (const id of this.playersInHand) {
        if (id !== playerId) {
          this.players[id].hasActed = false;
        }
      }
    }

    p.hasActed = true;
    this.advanceBetting();
    return { valid: true, action: 'allin', amount: allInAmount };
  }

  advanceBetting(afterFold = false) {
    const inHand = this.playersInHand;
    if (inHand.length <= 1) {
      this.handleLastPlayerWins();
      return;
    }

    // Find next player who hasn't acted and isn't all-in
    const canAct = inHand.filter(id => !this.players[id].allIn && !this.players[id].hasActed);

    if (canAct.length === 0) {
      // All players have acted — end this betting round
      this.endBettingRound();
      return;
    }

    if (afterFold) {
      // After fold, the folded player is removed from playersInHand,
      // shifting indices — currentPlayerIndex already points to the next player
      this.currentPlayerIndex = this.currentPlayerIndex % inHand.length;
    } else {
      // Move to next active player
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
    }
    this.skipInactivePlayers();

    // Double-check the current player can still act
    const curId = inHand[this.currentPlayerIndex % inHand.length];
    if (this.players[curId].hasActed || this.players[curId].allIn) {
      this.endBettingRound();
    }
  }

  endBettingRound() {
    const inHand = this.playersInHand;

    if (inHand.length <= 1) {
      this.handleLastPlayerWins();
      return;
    }

    if (this.isHoldem) {
      // Hold'em progression: betting1→flop, betting2→turn, betting3→river, betting4→showdown
      if (this.phase === 'betting1') {
        this.dealFlop();
      } else if (this.phase === 'betting2') {
        this.dealTurn();
      } else if (this.phase === 'betting3') {
        this.dealRiver();
      } else if (this.phase === 'betting4') {
        this.showdown();
      }
    } else if (this.isStud) {
      // Stud progression
      const nextStreetMap = { 'betting1': 4, 'betting2': 5, 'betting3': 6, 'betting4': 7 };
      const nextStreet = nextStreetMap[this.phase];
      if (nextStreet) {
        this.startStudStreet(nextStreet);
      } else {
        // betting5 → showdown
        this.showdown();
      }
    } else {
      // Draw progression
      if (this.phase === 'betting1') {
        this.startDrawPhase();
      } else if (this.phase === 'betting2') {
        this.showdown();
      }
    }
  }

  startDrawPhase() {
    this.phase = 'draw';

    // Reset action tracking for draw
    for (const id of this.playersInHand) {
      this.players[id].hasActed = false;
    }

    // Start left of dealer
    const inHand = this.playersInHand;
    this.currentPlayerIndex = (this.dealerIndex + 1) % inHand.length;
    this.skipAllInAndFolded();
  }

  skipAllInAndFolded() {
    const inHand = this.playersInHand;
    if (inHand.length <= 1) return;

    let iterations = 0;
    while (iterations < inHand.length) {
      const id = inHand[this.currentPlayerIndex % inHand.length];
      const p = this.players[id];
      if (!p.allIn && !p.hasActed) break;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
      iterations++;
    }
  }

  handleDiscard(playerId, cardIndices) {
    if (this.phase !== 'draw') return { valid: false, message: 'Not in draw phase' };

    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }
    if (this.players[playerId].allIn) {
      return { valid: false, message: 'All-in players cannot draw' };
    }

    if (!Array.isArray(cardIndices) || cardIndices.length > 5) {
      return { valid: false, message: 'Invalid discard selection' };
    }

    // Validate indices
    for (const idx of cardIndices) {
      if (idx < 0 || idx >= 5) return { valid: false, message: 'Invalid card index' };
    }

    // 5-Card Draw rule: max 3 cards, or 4 if keeping an ace or wild card
    const p_hand = this.players[playerId].hand;
    const hasAceOrWild = p_hand.some(c =>
      c.value === 'A' || (this.activeWilds.length > 0 && isCardWild(c, this.activeWilds))
    );
    const maxDiscards = hasAceOrWild ? 4 : 3;
    if (cardIndices.length > maxDiscards) {
      return { valid: false, message: `Can only discard up to ${maxDiscards} cards` };
    }
    // If discarding 4, the kept card must be an ace or wild
    if (cardIndices.length === 4) {
      const keptIdx = [0,1,2,3,4].find(i => !cardIndices.includes(i));
      if (keptIdx === undefined) {
        return { valid: false, message: 'Invalid discard selection' };
      }
      const keptCard = p_hand[keptIdx];
      const isAceOrWild = keptCard.value === 'A' ||
        (this.activeWilds.length > 0 && isCardWild(keptCard, this.activeWilds));
      if (!isAceOrWild) {
        return { valid: false, message: 'Must keep an ace or wild card when discarding 4 cards' };
      }
    }

    const p = this.players[playerId];
    p.discards = cardIndices;

    // Replace discarded cards
    const newCards = [];
    for (const idx of cardIndices.sort((a, b) => b - a)) {
      p.hand.splice(idx, 1);
    }
    for (let i = 0; i < cardIndices.length; i++) {
      const newCard = this.drawCard();
      p.hand.push(newCard);
      newCards.push(newCard);
    }

    p.hasActed = true;
    this.advanceDrawPhase();
    return { valid: true, action: 'discard', count: cardIndices.length, newCards };
  }

  handleStandPat(playerId) {
    if (this.phase !== 'draw') return { valid: false, message: 'Not in draw phase' };

    const inHand = this.playersInHand;
    if (playerId !== inHand[this.currentPlayerIndex % inHand.length]) {
      return { valid: false, message: 'Not your turn' };
    }

    this.players[playerId].hasActed = true;
    this.players[playerId].discards = [];
    this.advanceDrawPhase();
    return { valid: true, action: 'stand-pat' };
  }

  advanceDrawPhase() {
    const inHand = this.playersInHand;
    const canAct = inHand.filter(id => !this.players[id].allIn && !this.players[id].hasActed);

    if (canAct.length === 0) {
      // All players have drawn — start second betting round
      this.startBettingRound('betting2');
      return;
    }

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
    this.skipAllInAndFolded();
  }

  handleLastPlayerWins() {
    const winners = this.playersInHand;
    if (winners.length !== 1) return;

    const winnerId = winners[0];
    const totalPot = this.potManager.getTotalPot();

    this.players[winnerId].result = 'win';
    this.players[winnerId].payout = totalPot;
    this.players[winnerId].chips += totalPot;

    // Mark others as losers
    for (const id of this.activePlayers) {
      if (id !== winnerId && !this.players[id].folded) {
        this.players[id].result = 'lose';
      }
    }

    this.wonByFold = true;
    this.phase = 'settlement';
    this.eliminateBrokePlayers();
  }

  showdown() {
    this.phase = 'showdown';

    // Evaluate all hands
    const inHand = this.playersInHand;
    for (const id of inHand) {
      const hand = this.players[id].hand;
      if (this.isHoldem) {
        // Hold'em: best 5 of 7 (2 hole + 5 community)
        const allCards = [...hand, ...this.communityCards];
        this.players[id].handResult = evaluateBestHand(allCards);
      } else if (this.isStud && hand.length > 5) {
        this.players[id].handResult = this.activeWilds.length > 0
          ? evaluateBestHandWithWilds(hand, this.activeWilds)
          : evaluateBestHand(hand);
      } else {
        this.players[id].handResult = this.activeWilds.length > 0
          ? evaluateHandWithWilds(hand, this.activeWilds)
          : evaluateHand(hand);
      }
    }

    // Calculate pots
    const pots = this.potManager.calculatePots();

    // Distribute each pot
    for (const pot of pots) {
      const eligibleHands = inHand
        .filter(id => pot.eligible.includes(id))
        .map(id => ({
          playerId: id,
          cards: this.isHoldem ? [...this.players[id].hand, ...this.communityCards] : this.players[id].hand
        }));

      if (eligibleHands.length === 0) continue;

      const { winnerIds } = determineWinners(eligibleHands, this.activeWilds);
      const share = Math.floor(pot.amount / winnerIds.length);
      const remainder = pot.amount - share * winnerIds.length;

      for (let i = 0; i < winnerIds.length; i++) {
        const id = winnerIds[i];
        const payout = share + (i === 0 ? remainder : 0);
        this.players[id].chips += payout;
        this.players[id].payout = (this.players[id].payout || 0) + payout;
        this.players[id].result = winnerIds.length > 1 ? 'split' : 'win';
      }
    }

    // Mark losers
    for (const id of inHand) {
      if (!this.players[id].result) {
        this.players[id].result = 'lose';
      }
    }

    this.phase = 'settlement';
    this.eliminateBrokePlayers();
  }

  eliminateBrokePlayers() {
    for (const id of this.activePlayers) {
      if (this.players[id].chips <= 0) {
        this.players[id].isEliminated = true;
      }
    }

    const remaining = this.activePlayers;
    if (remaining.length <= 1) {
      this.gameOver = true;
      this.winner = remaining.length === 1 ? remaining[0] : null;
    }
  }

  handleNextHand(playerId) {
    if (this.phase !== 'settlement') return { valid: false, message: 'Hand not settled yet' };
    if (this.gameOver) return { valid: false, message: 'Game is over' };

    // Reset player state for new hand (needed before buy-in checks hand.length)
    for (const id of this.activePlayers) {
      const p = this.players[id];
      p.hand = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
      p.result = null;
      p.payout = 0;
      p.handResult = null;
      p.discards = [];
    }

    this.wonByFold = false;
    this.currentBet = 0;
    this.minRaise = MIN_BET;
    this.lastRaiser = null;
    this.currentStreet = 0;
    this.communityCards = [];
    this.smallBlindIndex = -1;
    this.bigBlindIndex = -1;

    // Rotate dealer
    const active = this.activePlayers;
    this.dealerIndex = (this.dealerIndex + 1) % active.length;

    this.startVariantSelect();
    return { valid: true, newHand: true };
  }

  removePlayer(playerId) {
    const player = this.players[playerId];
    if (!player) return;

    player.isEliminated = true;
    player.folded = true;
    this.potManager.recordFold(playerId);

    // If it was their turn, advance
    const inHand = this.playersInHand;
    if (inHand.length <= 1) {
      if (this.isBettingPhase()) {
        this.handleLastPlayerWins();
      } else if (this.phase === 'draw') {
        this.handleLastPlayerWins();
      }
    } else if (this.isBettingPhase()) {
      const curId = inHand[this.currentPlayerIndex % inHand.length];
      if (curId === playerId || !curId) {
        this.advanceBetting(true);
      }
    } else if (this.phase === 'draw') {
      this.advanceDrawPhase();
    }

    const remaining = this.activePlayers;
    if (remaining.length <= 1) {
      this.gameOver = true;
      this.winner = remaining.length === 1 ? remaining[0] : null;
    }
  }

  getState(forPlayerId = null) {
    const active = this.activePlayers;
    const inHand = this.playersInHand;
    const isShowdown = this.phase === 'showdown' || this.phase === 'settlement';
    // Only reveal cards at actual showdown, not when won by fold
    const revealCards = isShowdown && !this.wonByFold;

    const playerList = this.playerIds.map((id, idx) => {
      const p = this.players[id];
      const showCards = id === forPlayerId || (revealCards && !p.folded);

      let hand;
      if (showCards) {
        // Show all cards face-up
        hand = p.hand.map(c => ({ suit: c.suit, value: c.value }));
      } else if (this.isStud) {
        // Stud: show face-up cards, hide face-down for opponents
        hand = p.hand.map(c => c.faceDown
          ? { suit: 'back', value: 'back', faceDown: true }
          : { suit: c.suit, value: c.value, faceDown: false }
        );
      } else {
        hand = p.hand.map(() => ({ suit: 'back', value: 'back', faceDown: true }));
      }

      return {
        id,
        name: `Player ${idx + 1}`,
        hand,
        chips: p.chips,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        isEliminated: p.isEliminated,
        isDealer: active.indexOf(id) === this.dealerIndex,
        isActive: inHand.indexOf(id) === (this.currentPlayerIndex % Math.max(1, inHand.length)),
        result: p.result,
        payout: p.payout,
        handResult: (revealCards && !p.folded) ? p.handResult : null,
        hasActed: p.hasActed
      };
    });

    const currentId = inHand.length > 0 ? inHand[this.currentPlayerIndex % inHand.length] : null;
    const myPlayer = forPlayerId ? this.players[forPlayerId] : null;
    const callAmount = myPlayer ? Math.max(0, this.currentBet - (myPlayer.bet || 0)) : 0;

    return {
      phase: this.phase,
      players: playerList,
      pot: this.potManager.getTotalPot(),
      pots: this.potManager.getPots(),
      dealerIndex: this.dealerIndex,
      dealerPlayerId: this.dealerPlayerId,
      currentPlayerId: currentId,
      currentBet: this.currentBet,
      callAmount,
      minRaise: this.minRaise,
      gameOver: this.gameOver,
      winner: this.winner,
      handNumber: this.handNumber,
      currentVariant: this.currentVariant,
      variantName: VARIANT_NAMES[this.currentVariant] || "Dealer's Choice",
      wonByFold: this.wonByFold,
      activeWilds: this.activeWilds,
      isStud: this.isStud,
      currentStreet: this.currentStreet,
      lastCardDown: this.studLastCardDown,
      isHoldem: this.isHoldem,
      communityCards: this.communityCards,
      smallBlindIndex: this.smallBlindIndex,
      bigBlindIndex: this.bigBlindIndex
    };
  }
}

module.exports = Poker;
