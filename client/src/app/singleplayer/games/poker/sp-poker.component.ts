import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import Phaser from 'phaser';
import { PokerScene } from '../../../games/poker/poker.scene';
import {
  Card, PokerPlayer, PokerVisualState, PokerPhase, PokerVariant, Difficulty,
  WildCardOption, ANTE_AMOUNT, MIN_BET, STARTING_CHIPS, HAND_RANK_NAMES, POKER_VARIANTS,
  VARIANT_NAMES, VARIANT_ALLOWS_WILDS, WILD_CARD_OPTIONS, isCardWild,
  SMALL_BLIND, BIG_BLIND
} from '../../../games/poker/poker-types';
import { createShuffledDeck, drawCards } from '../../../games/poker/poker-deck';
import { evaluateHand, evaluateHandWithWilds, evaluateBestHand, evaluateBestHandWithWilds, compareHands, determineWinners } from '../../../games/poker/poker-hand-evaluator';
import { PotManager } from '../../../games/poker/poker-pot-manager';
import { getAIBettingDecision, getAIDrawDecision, getAIDelay } from '../../../core/ai/poker.ai';
import { getRandomAINames } from '../../../core/ai/ai-names';
import { AudioService } from '../../../core/audio/audio.service';

interface PlayerState {
  id: string;
  name: string;
  chips: number;
  hand: Card[];
  bet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  isAI: boolean;
  difficulty: Difficulty;
  hasActed: boolean;
  result?: string;
  payout?: number;
  handResult?: any;
  isEliminated: boolean;
}

@Component({
  selector: 'app-sp-poker',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatSelectModule, FormsModule],
  templateUrl: './sp-poker.component.html',
  styleUrl: './sp-poker.component.scss'
})
export class SpPokerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: PokerScene;

  // Deck
  private deck: Card[] = [];

  // Players
  private players: PlayerState[] = [];
  private dealerIndex = 0;
  private currentPlayerIndex = 0;
  private potManager = new PotManager();

  // Game state
  private phase: PokerPhase = 'ante';
  private currentBet = 0;
  private minRaise = MIN_BET;
  private isProcessing = false;
  private currentVariant: PokerVariant = 'five-card-draw';
  private activeWilds: WildCardOption[] = [];
  private wonByFold = false;

  // 7-Card Stud state
  private studLastCardDown = true;
  private currentStreet = 0; // 3-7

  // Follow the Queen state
  private pendingQueen = false;
  private followTheQueenValue: string | null = null;

  // Texas Hold'em state
  private communityCards: Card[] = [];
  private smallBlindIndex = -1;
  private bigBlindIndex = -1;

  // Locked variant (for standalone Texas Hold'em mode)
  lockedVariant: PokerVariant | null = null;

  // Setup options
  gameStarted = false;
  gameOver = false;
  aiCount = 3;
  difficulty: Difficulty = 'medium';
  aiCountOptions = [1, 2, 3, 4, 5];
  difficultyOptions: Difficulty[] = ['easy', 'medium', 'hard'];

  // Stats
  handsWon = 0;
  handsPlayed = 0;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    // Detect locked variant from route
    if (this.router.url.includes('poker-holdem')) {
      this.lockedVariant = 'texas-holdem';
    }

    this.scene = new PokerScene();
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 990,
      height: 748,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#0b0b15',
      scene: this.scene
    });
    this.scene.onReady = () => this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.scene.onCheckClick = () => this.handlePlayerAction('check');
    this.scene.onCallClick = () => this.handlePlayerAction('call');
    this.scene.onRaiseClick = (amount: number) => this.handlePlayerAction('raise', amount);
    this.scene.onFoldClick = () => this.handlePlayerAction('fold');
    this.scene.onAllInClick = () => this.handlePlayerAction('allin');
    this.scene.onDiscardClick = (indices: number[]) => this.handlePlayerDiscard(indices);
    this.scene.onStandPatClick = () => this.handlePlayerDiscard([]);
    this.scene.onVariantSelect = (variant: PokerVariant) => this.handleVariantSelect(variant);
    this.scene.onWildCardSelect = (wilds: WildCardOption[], lastCardDown?: boolean) => this.handleWildCardSelect(wilds, lastCardDown);
    this.scene.onBuyInClick = () => this.handleBuyIn();
  }

  // --- Game Start ---

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.handsWon = 0;
    this.handsPlayed = 0;

    // Create players: human first, then AI
    this.players = [];
    this.players.push({
      id: 'human',
      name: 'YOU',
      chips: STARTING_CHIPS,
      hand: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      isAI: false,
      difficulty: 'medium',
      hasActed: false,
      isEliminated: false
    });

    const aiNames = getRandomAINames(this.aiCount);
    for (let i = 0; i < this.aiCount; i++) {
      this.players.push({
        id: `ai_${i}`,
        name: aiNames[i],
        chips: STARTING_CHIPS,
        hand: [],
        bet: 0,
        totalBet: 0,
        folded: false,
        allIn: false,
        isAI: true,
        difficulty: this.difficulty,
        hasActed: false,
        isEliminated: false
      });
    }

    this.dealerIndex = 0;
    this.scene.resetGame();
    // Brief delay to let Angular change detection show the canvas before updating scene
    if (this.lockedVariant) {
      this.currentVariant = this.lockedVariant;
      this.activeWilds = [];
      this.phase = 'ante';
      setTimeout(() => this.updateScene(''), 100);
    } else {
      setTimeout(() => this.startVariantSelect(), 100);
    }
  }

  // --- Dealer's Choice (Variant Selection) ---

  private startVariantSelect(): void {
    this.phase = 'variant-select';
    const dealer = this.activePlayers[this.dealerIndex % this.activePlayers.length];

    if (dealer && dealer.isAI) {
      // AI dealer picks a variant after a brief delay
      this.updateScene("Dealer is choosing the game...");
      setTimeout(() => {
        // AI picks randomly from available variants (just 5-card draw for now)
        const variants = POKER_VARIANTS;
        const pick = variants[Math.floor(Math.random() * variants.length)];
        this.handleVariantSelect(pick.id);
      }, 1200);
    } else {
      // Human is dealer — show variant selection UI
      this.updateScene("Your deal — choose the game!");
    }
  }

  private handleVariantSelect(variant: PokerVariant): void {
    this.currentVariant = variant;
    if (variant === 'follow-the-queen') {
      // Auto-set Queens wild, skip wild select
      this.activeWilds = ['Q'];
      this.pendingQueen = false;
      this.followTheQueenValue = null;
      this.studLastCardDown = true; // 7th card always face-down
      this.phase = 'ante';
      this.updateScene('');
    } else if (VARIANT_ALLOWS_WILDS[variant]) {
      this.startWildSelect();
    } else {
      this.activeWilds = [];
      // Skip wild select, go straight to buy-in
      this.phase = 'ante';
      this.updateScene('');
    }
  }

  // --- Wild Card Selection ---

  private startWildSelect(): void {
    this.phase = 'wild-select';
    const dealer = this.activePlayers[this.dealerIndex % this.activePlayers.length];

    if (dealer && dealer.isAI) {
      this.updateScene("Dealer is choosing wild cards...");
      setTimeout(() => {
        // AI picks wilds: easy = none, medium = 20% chance of a value wild, hard = random mix
        let wilds: WildCardOption[] = [];
        if (dealer.difficulty === 'medium' && Math.random() < 0.2) {
          wilds = ['2'];
        } else if (dealer.difficulty === 'hard' && Math.random() < 0.35) {
          // Hard AI might pick a themed option or value-based wilds
          const roll = Math.random();
          if (roll < 0.4) {
            const options = WILD_CARD_OPTIONS;
            const pick = options[Math.floor(Math.random() * options.length)];
            wilds = [pick.id];
          } else {
            // Pick 1-2 random values
            const allVals: WildCardOption[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
            const shuffled = allVals.sort(() => Math.random() - 0.5);
            const count = Math.random() < 0.6 ? 1 : 2;
            wilds = shuffled.slice(0, count);
          }
        }
        // AI randomly picks last-card-down for stud
        const aiLastCardDown = Math.random() < 0.6; // 60% face-down
        this.handleWildCardSelect(wilds, this.isStud ? aiLastCardDown : undefined);
      }, 1000);
    } else {
      this.updateScene("Choose wild cards (or deal with none)!");
    }
  }

  private handleWildCardSelect(wilds: WildCardOption[], lastCardDown?: boolean): void {
    this.activeWilds = wilds;
    if (lastCardDown !== undefined) {
      this.studLastCardDown = lastCardDown;
    }
    this.phase = 'ante';
    this.updateScene('');
  }

  private handleBuyIn(): void {
    this.startHand();
  }

  // --- Hand Management ---

  private startHand(): void {
    this.handsPlayed++;
    this.deck = createShuffledDeck(this.activeWilds);
    this.currentBet = 0;
    this.minRaise = MIN_BET;
    this.isProcessing = false;
    this.wonByFold = false;
    this.communityCards = [];

    // Reset player state
    for (const p of this.activePlayers) {
      p.hand = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
      p.result = undefined;
      p.payout = undefined;
      p.handResult = undefined;
    }

    // Setup pot manager
    this.potManager.reset();
    this.potManager.setPlayers(this.activePlayers.map(p => p.id));

    if (this.isHoldem) {
      // Hold'em: post blinds instead of antes
      this.phase = 'dealing';
      this.postBlinds();
      this.dealHoldemPreflop();
    } else {
      // Post antes (Draw + Stud)
      this.phase = 'ante';
      for (const p of this.activePlayers) {
        const ante = Math.min(ANTE_AMOUNT, p.chips);
        p.chips -= ante;
        p.bet = ante;
        p.totalBet = ante;
        this.potManager.recordBet(p.id, ante);
        if (p.chips === 0) {
          p.allIn = true;
          this.potManager.recordAllIn(p.id);
        }
      }
      this.currentBet = ANTE_AMOUNT;

      if (this.isStud) {
        // Stud: deal 2 down + 1 up (3rd street)
        this.currentStreet = 3;
        this.startStudStreet3();
      } else {
        // Draw: deal 5 cards face-down
        this.phase = 'dealing';
        for (let round = 0; round < 5; round++) {
          for (const p of this.activePlayers) {
            const cards = drawCards(this.deck, 1);
            p.hand.push(cards[0]);
          }
        }

        this.audio.playGame('poker', 'deal');
        this.updateScene('Cards dealt! First betting round');

        // Start betting round 1
        setTimeout(() => this.startBettingRound('betting1'), 500);
      }
    }
  }

  // --- Texas Hold'em ---

  private postBlinds(): void {
    const active = this.activePlayers;
    const count = active.length;

    let sbIdx: number;
    let bbIdx: number;

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
    const sbPlayer = active[sbIdx];
    const sbAmount = Math.min(SMALL_BLIND, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    sbPlayer.totalBet = sbAmount;
    this.potManager.recordBet(sbPlayer.id, sbAmount);
    if (sbPlayer.chips === 0) {
      sbPlayer.allIn = true;
      this.potManager.recordAllIn(sbPlayer.id);
    }

    // Post big blind
    const bbPlayer = active[bbIdx];
    const bbAmount = Math.min(BIG_BLIND, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    bbPlayer.totalBet = bbAmount;
    this.potManager.recordBet(bbPlayer.id, bbAmount);
    if (bbPlayer.chips === 0) {
      bbPlayer.allIn = true;
      this.potManager.recordAllIn(bbPlayer.id);
    }

    this.currentBet = BIG_BLIND;
  }

  private dealHoldemPreflop(): void {
    // Deal 2 hole cards to each player
    for (let round = 0; round < 2; round++) {
      for (const p of this.activePlayers) {
        const cards = drawCards(this.deck, 1);
        p.hand.push(cards[0]);
      }
    }

    this.audio.playGame('poker', 'deal');
    this.updateScene('Preflop — betting round');

    setTimeout(() => this.startHoldemBettingRound('betting1'), 500);
  }

  private startHoldemBettingRound(phaseName: PokerPhase): void {
    this.phase = phaseName;
    const active = this.activePlayers;
    const inHand = this.playersInHand;
    const count = active.length;

    if (phaseName === 'betting1') {
      // Preflop: don't reset bets (blinds already posted), don't reset currentBet
      for (const p of active) {
        p.hasActed = false;
      }

      // Opener = UTG (left of BB); heads-up: dealer/SB acts first preflop
      if (count === 2) {
        // Heads-up: dealer (SB) opens preflop
        this.currentPlayerIndex = inHand.indexOf(active[this.dealerIndex]);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = 0;
      } else {
        // UTG = left of BB
        const utg = active[(this.bigBlindIndex + 1) % count];
        this.currentPlayerIndex = inHand.indexOf(utg);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = 0;
      }
    } else {
      // Post-flop: reset bets, opener = first active left of dealer
      this.currentBet = 0;
      this.minRaise = MIN_BET;

      for (const p of active) {
        p.bet = 0;
        p.hasActed = false;
      }

      if (count === 2) {
        // Heads-up post-flop: BB acts first (non-dealer)
        const bbPlayer = active[this.bigBlindIndex];
        this.currentPlayerIndex = inHand.indexOf(bbPlayer);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = 0;
      } else {
        // First active player left of dealer
        for (let i = 1; i <= count; i++) {
          const candidate = active[(this.dealerIndex + i) % count];
          const idxInHand = inHand.indexOf(candidate);
          if (idxInHand >= 0 && !candidate.folded && !candidate.allIn) {
            this.currentPlayerIndex = idxInHand;
            break;
          }
        }
      }
    }

    this.skipInactive();

    const canAct = this.playersInHand.filter(p => !p.allIn && !p.hasActed);
    if (canAct.length <= 1 && (phaseName !== 'betting1' || canAct.length === 0)) {
      this.endBettingRound();
      return;
    }

    this.updateScene(this.getBettingMessage());
    this.processCurrentPlayer();
  }

  private dealFlop(): void {
    // Burn 1 card
    drawCards(this.deck, 1);
    // Deal 3 community cards
    const cards = drawCards(this.deck, 3);
    this.communityCards.push(...cards);

    this.audio.playGame('poker', 'deal');
    this.updateScene('Flop dealt — betting round');

    setTimeout(() => this.startHoldemBettingRound('betting2'), 500);
  }

  private dealTurn(): void {
    // Burn 1 card
    drawCards(this.deck, 1);
    // Deal 1 community card
    const cards = drawCards(this.deck, 1);
    this.communityCards.push(cards[0]);

    this.audio.playGame('poker', 'deal');
    this.updateScene('Turn dealt — betting round');

    setTimeout(() => this.startHoldemBettingRound('betting3'), 500);
  }

  private dealRiver(): void {
    // Burn 1 card
    drawCards(this.deck, 1);
    // Deal 1 community card
    const cards = drawCards(this.deck, 1);
    this.communityCards.push(cards[0]);

    this.audio.playGame('poker', 'deal');
    this.updateScene('River dealt — final betting round');

    setTimeout(() => this.startHoldemBettingRound('betting4'), 500);
  }

  private get activePlayers(): PlayerState[] {
    return this.players.filter(p => !p.isEliminated);
  }

  private get playersInHand(): PlayerState[] {
    return this.activePlayers.filter(p => !p.folded);
  }

  // --- 7-Card Stud ---

  private get isStud(): boolean {
    return this.currentVariant === 'seven-card-stud' || this.currentVariant === 'follow-the-queen';
  }

  private get isHoldem(): boolean {
    return this.currentVariant === 'texas-holdem';
  }

  private get isFollowTheQueen(): boolean {
    return this.currentVariant === 'follow-the-queen';
  }

  /** Update wilds after face-up cards are dealt in Follow the Queen. */
  private updateFollowTheQueenWilds(faceUpCards: Card[]): void {
    for (const card of faceUpCards) {
      if (card.value === 'Q') {
        this.pendingQueen = true;
      } else if (this.pendingQueen) {
        this.followTheQueenValue = card.value;
        this.pendingQueen = false;
      }
    }
    // Rebuild activeWilds
    this.activeWilds = ['Q'];
    if (this.followTheQueenValue) {
      this.activeWilds.push(this.followTheQueenValue as WildCardOption);
    }
  }

  /** 3rd Street: deal 2 face-down + 1 face-up to each player, then betting1. */
  private startStudStreet3(): void {
    this.phase = 'street3';
    // 2 face-down cards
    for (let round = 0; round < 2; round++) {
      for (const p of this.activePlayers) {
        const card = drawCards(this.deck, 1)[0];
        card.faceDown = true;
        p.hand.push(card);
      }
    }
    // 1 face-up card
    const faceUpCards: Card[] = [];
    for (const p of this.activePlayers) {
      const card = drawCards(this.deck, 1)[0];
      card.faceDown = false;
      p.hand.push(card);
      faceUpCards.push(card);
    }

    // Follow the Queen: check face-up cards for Queens/followers
    if (this.isFollowTheQueen) {
      this.updateFollowTheQueenWilds(faceUpCards);
    }

    this.audio.playGame('poker', 'deal');
    this.updateScene('3rd Street — first betting round');
    setTimeout(() => this.startStudBettingRound('betting1'), 500);
  }

  /** Streets 4-7: deal 1 card to each player. 4-6 face-up, 7 configurable. */
  private startStudStreet(streetNum: number): void {
    this.currentStreet = streetNum;
    const phaseMap: Record<number, PokerPhase> = { 4: 'street4', 5: 'street5', 6: 'street6', 7: 'street7' };
    this.phase = phaseMap[streetNum];

    const faceDown = (streetNum === 7 && this.studLastCardDown);
    const faceUpCards: Card[] = [];
    for (const p of this.playersInHand) {
      const card = drawCards(this.deck, 1)[0];
      card.faceDown = faceDown;
      p.hand.push(card);
      if (!faceDown) faceUpCards.push(card);
    }

    // Follow the Queen: check face-up cards for Queens/followers (streets 4-6 only)
    if (this.isFollowTheQueen && faceUpCards.length > 0) {
      this.updateFollowTheQueenWilds(faceUpCards);
    }

    this.audio.playGame('poker', 'deal');
    const suffix = streetNum === 7 ? (faceDown ? ' (face down)' : ' (face up)') : '';
    this.updateScene(`${this.streetName(streetNum)}${suffix}`);

    const bettingMap: Record<number, PokerPhase> = { 4: 'betting2', 5: 'betting3', 6: 'betting4', 7: 'betting5' };
    setTimeout(() => this.startStudBettingRound(bettingMap[streetNum]), 500);
  }

  private streetName(n: number): string {
    const names: Record<number, string> = { 3: '3rd Street', 4: '4th Street', 5: '5th Street', 6: '6th Street', 7: '7th Street' };
    return names[n] || `Street ${n}`;
  }

  /** Start a stud betting round. Opens with highest visible hand. */
  private startStudBettingRound(phaseName: PokerPhase): void {
    this.phase = phaseName;
    this.currentBet = 0;
    this.minRaise = MIN_BET;

    for (const p of this.activePlayers) {
      p.bet = 0;
      p.hasActed = false;
    }

    // Find opener: player with highest visible hand
    const openerIndex = this.findStudOpener();
    this.currentPlayerIndex = openerIndex;

    this.skipInactive();

    const canAct = this.playersInHand.filter(p => !p.allIn);
    if (canAct.length <= 1) {
      this.endBettingRound();
      return;
    }

    this.updateScene(this.getBettingMessage());
    this.processCurrentPlayer();
  }

  /** Find the player with the highest visible hand (face-up cards only). */
  private findStudOpener(): number {
    const inHand = this.playersInHand;
    let bestIdx = 0;
    let bestRank = -1;
    let bestTb: number[] = [];

    for (let i = 0; i < inHand.length; i++) {
      const p = inHand[i];
      if (p.allIn) continue;
      // Get only face-up cards
      const upCards = p.hand.filter(c => !c.faceDown);
      if (upCards.length === 0) continue;

      // Evaluate visible cards (may be < 5, pad evaluation)
      let rank = 0;
      let tb: number[] = [];
      if (upCards.length >= 5) {
        const result = this.activeWilds.length > 0
          ? evaluateHandWithWilds(upCards, this.activeWilds)
          : evaluateHand(upCards);
        rank = result.rank;
        tb = result.tiebreakers;
      } else {
        // For < 5 visible cards, rank by highest values
        const vals = upCards.map(c => {
          const v = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
          return (v as any)[c.value] || 0;
        }).sort((a, b) => b - a);
        // Check for pairs in visible cards
        const counts = new Map<number, number>();
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

  private compareTb(a: number[], b: number[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  // --- Betting Round ---

  private startBettingRound(phaseName: PokerPhase): void {
    this.phase = phaseName;
    this.currentBet = 0;
    this.minRaise = MIN_BET;

    for (const p of this.activePlayers) {
      p.bet = 0;
      p.hasActed = false;
    }

    // Start left of dealer
    const inHand = this.playersInHand;
    this.currentPlayerIndex = (this.dealerIndex + 1) % inHand.length;

    // Skip all-in players
    this.skipInactive();

    const canAct = this.playersInHand.filter(p => !p.allIn);
    if (canAct.length <= 1) {
      this.endBettingRound();
      return;
    }

    this.updateScene(this.getBettingMessage());
    this.processCurrentPlayer();
  }

  private skipInactive(): void {
    const inHand = this.playersInHand;
    if (inHand.length <= 1) return;
    let iterations = 0;
    while (iterations < inHand.length) {
      const p = inHand[this.currentPlayerIndex % inHand.length];
      if (!p.allIn && !p.folded) break;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
      iterations++;
    }
  }

  private getBettingMessage(): string {
    const current = this.playersInHand[this.currentPlayerIndex % this.playersInHand.length];
    if (!current) return '';
    if (current.isAI) return `${current.name} is thinking...`;
    if (this.isStud) {
      return `${this.streetName(this.currentStreet)} — Your turn`;
    }
    if (this.isHoldem) {
      const holdemStreets: Record<string, string> = {
        'betting1': 'Preflop', 'betting2': 'Flop', 'betting3': 'Turn', 'betting4': 'River'
      };
      return `${holdemStreets[this.phase] || 'Betting'} — Your turn`;
    }
    const round = this.phase === 'betting1' ? 'Round 1' : 'Round 2';
    return `${round} — Your turn`;
  }

  private processCurrentPlayer(): void {
    if (this.isProcessing) return;

    const inHand = this.playersInHand;
    if (inHand.length <= 1) {
      this.handleLastPlayerWins();
      return;
    }

    const current = inHand[this.currentPlayerIndex % inHand.length];
    if (!current || current.hasActed || current.allIn) {
      this.endBettingRound();
      return;
    }

    if (current.isAI) {
      this.isProcessing = true;
      setTimeout(() => {
        this.processAIBetting(current);
        this.isProcessing = false;
      }, getAIDelay());
    }
    // If human, wait for button click (callbacks handle it)
  }

  private processAIBetting(ai: PlayerState): void {
    const decision = getAIBettingDecision(ai.difficulty, {
      hand: ai.hand,
      chips: ai.chips,
      currentBet: this.currentBet,
      myBet: ai.bet,
      pot: this.potManager.getTotalPot(),
      minRaise: this.minRaise,
      playersInHand: this.playersInHand.length,
      phase: this.phase as any,
      wilds: this.activeWilds,
      communityCards: this.isHoldem ? this.communityCards : undefined,
      isHoldem: this.isHoldem
    });

    switch (decision.action) {
      case 'check':
        this.executeCheck(ai);
        break;
      case 'call':
        this.executeCall(ai);
        break;
      case 'raise':
        this.executeRaise(ai, decision.raiseAmount || this.minRaise);
        break;
      case 'fold':
        this.executeFold(ai);
        break;
      case 'allin':
        this.executeAllIn(ai);
        break;
    }
  }

  // --- Player Actions ---

  private isBettingPhase(): boolean {
    return ['betting1', 'betting2', 'betting3', 'betting4', 'betting5'].includes(this.phase);
  }

  private handlePlayerAction(action: string, amount?: number): void {
    if (this.isProcessing) return;
    if (!this.isBettingPhase()) return;

    const inHand = this.playersInHand;
    const current = inHand[this.currentPlayerIndex % inHand.length];
    if (!current || current.isAI) return;

    switch (action) {
      case 'check':
        if (this.currentBet > current.bet) return;
        this.executeCheck(current);
        break;
      case 'call':
        if (this.currentBet <= current.bet) return;
        this.executeCall(current);
        break;
      case 'raise':
        this.executeRaise(current, amount || this.minRaise);
        break;
      case 'fold':
        this.executeFold(current);
        break;
      case 'allin':
        this.executeAllIn(current);
        break;
    }
  }

  private executeCheck(player: PlayerState): void {
    player.hasActed = true;
    this.audio.playGame('poker', 'check');
    this.updateScene(`${player.name} checks`);
    setTimeout(() => this.advanceBetting(), 300);
  }

  private executeCall(player: PlayerState): void {
    const toCall = Math.min(this.currentBet - player.bet, player.chips);
    player.chips -= toCall;
    player.bet += toCall;
    player.totalBet += toCall;
    this.potManager.recordBet(player.id, toCall);

    if (player.chips === 0) {
      player.allIn = true;
      this.potManager.recordAllIn(player.id);
    }

    player.hasActed = true;
    this.audio.playGame('poker', 'chips');
    this.updateScene(`${player.name} calls $${toCall}`);
    setTimeout(() => this.advanceBetting(), 300);
  }

  private executeRaise(player: PlayerState, amount: number): void {
    const toCall = this.currentBet - player.bet;
    const raiseAmount = Math.min(amount, player.chips - toCall);
    const total = toCall + raiseAmount;

    if (total > player.chips) {
      // Convert to all-in
      this.executeAllIn(player);
      return;
    }

    player.chips -= total;
    player.bet += total;
    player.totalBet += total;
    this.potManager.recordBet(player.id, total);

    this.currentBet = player.bet;
    this.minRaise = Math.max(MIN_BET, raiseAmount);

    if (player.chips === 0) {
      player.allIn = true;
      this.potManager.recordAllIn(player.id);
    }

    // Reset other players' hasActed
    for (const p of this.playersInHand) {
      if (p.id !== player.id) p.hasActed = false;
    }
    player.hasActed = true;

    this.audio.playGame('poker', 'raise');
    this.updateScene(`${player.name} raises $${raiseAmount}`);
    setTimeout(() => this.advanceBetting(), 300);
  }

  private executeFold(player: PlayerState): void {
    player.folded = true;
    player.hasActed = true;
    this.potManager.recordFold(player.id);
    this.audio.playGame('poker', 'fold');

    if (this.playersInHand.length <= 1) {
      this.updateScene(`${player.name} folds`);
      setTimeout(() => this.handleLastPlayerWins(), 500);
      return;
    }

    this.updateScene(`${player.name} folds`);
    setTimeout(() => this.advanceBetting(true), 300);
  }

  private executeAllIn(player: PlayerState): void {
    const allInAmount = player.chips;
    player.bet += allInAmount;
    player.totalBet += allInAmount;
    player.chips = 0;
    player.allIn = true;
    this.potManager.recordBet(player.id, allInAmount);
    this.potManager.recordAllIn(player.id);

    if (player.bet > this.currentBet) {
      this.minRaise = Math.max(this.minRaise, player.bet - this.currentBet);
      this.currentBet = player.bet;
      for (const p of this.playersInHand) {
        if (p.id !== player.id) p.hasActed = false;
      }
    }

    player.hasActed = true;
    this.audio.playGame('poker', 'raise');
    this.updateScene(`${player.name} goes ALL IN! ($${allInAmount})`);
    setTimeout(() => this.advanceBetting(), 300);
  }

  // --- Betting Flow ---

  private advanceBetting(afterFold = false): void {
    const inHand = this.playersInHand;
    if (inHand.length <= 1) {
      this.handleLastPlayerWins();
      return;
    }

    const canAct = inHand.filter(p => !p.allIn && !p.hasActed);
    if (canAct.length === 0) {
      this.endBettingRound();
      return;
    }

    if (afterFold) {
      // After fold, the folded player is removed from playersInHand,
      // shifting indices — currentPlayerIndex already points to the next player
      this.currentPlayerIndex = this.currentPlayerIndex % inHand.length;
    } else {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
    }
    this.skipInactive();

    const cur = inHand[this.currentPlayerIndex % inHand.length];
    if (cur.hasActed || cur.allIn) {
      this.endBettingRound();
      return;
    }

    this.updateScene(this.getBettingMessage());
    this.processCurrentPlayer();
  }

  private endBettingRound(): void {
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
      // Stud progression: betting1→street4, betting2→street5, ..., betting5→showdown
      const nextStreetMap: Record<string, number> = {
        'betting1': 4, 'betting2': 5, 'betting3': 6, 'betting4': 7
      };
      const nextStreet = nextStreetMap[this.phase];
      if (nextStreet) {
        this.startStudStreet(nextStreet);
      } else {
        // betting5 → showdown
        this.showdown();
      }
    } else {
      // Draw poker progression
      if (this.phase === 'betting1') {
        this.startDrawPhase();
      } else if (this.phase === 'betting2') {
        this.showdown();
      }
    }
  }

  // --- Draw Phase ---

  private startDrawPhase(): void {
    this.phase = 'draw';
    for (const p of this.playersInHand) {
      p.hasActed = false;
    }

    const inHand = this.playersInHand;
    this.currentPlayerIndex = (this.dealerIndex + 1) % inHand.length;

    // Skip all-in players
    this.skipDrawInactive();
    this.updateScene('Draw phase — select cards to discard');
    this.processDrawPhase();
  }

  private skipDrawInactive(): void {
    const inHand = this.playersInHand;
    let iterations = 0;
    while (iterations < inHand.length) {
      const p = inHand[this.currentPlayerIndex % inHand.length];
      if (!p.allIn && !p.hasActed) break;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % inHand.length;
      iterations++;
    }
  }

  private processDrawPhase(): void {
    const inHand = this.playersInHand;
    const canDraw = inHand.filter(p => !p.allIn && !p.hasActed);
    if (canDraw.length === 0) {
      // All drawn — start betting round 2
      this.updateScene('Second betting round');
      setTimeout(() => this.startBettingRound('betting2'), 500);
      return;
    }

    const current = inHand[this.currentPlayerIndex % inHand.length];
    if (!current) return;

    if (current.isAI) {
      this.isProcessing = true;
      setTimeout(() => {
        const discards = getAIDrawDecision(current.difficulty, current.hand, this.activeWilds);
        this.executeDiscard(current, discards);
        this.isProcessing = false;
      }, getAIDelay());
    } else {
      this.updateScene('Select cards to discard (click cards), then DISCARD or STAND PAT');
    }
  }

  private handlePlayerDiscard(indices: number[]): void {
    if (this.phase !== 'draw') return;
    const inHand = this.playersInHand;
    const current = inHand[this.currentPlayerIndex % inHand.length];
    if (!current || current.isAI) return;

    // Enforce draw limit: 3 cards max, or 4 if keeping an ace
    const max = this.getMaxDiscards(current);
    if (indices.length > max) return;
    // If drawing 4, must be keeping an ace or wild card
    if (indices.length === 4) {
      const keptIndex = [0,1,2,3,4].find(i => !indices.includes(i));
      if (keptIndex === undefined) return;
      const keptCard = current.hand[keptIndex];
      const isAceOrWild = keptCard?.value === 'A' ||
        (this.activeWilds.length > 0 && isCardWild(keptCard, this.activeWilds));
      if (!isAceOrWild) return;
    }

    this.executeDiscard(current, indices);
  }

  private executeDiscard(player: PlayerState, indices: number[]): void {
    // Remove discarded cards (sort descending to preserve indices)
    const sortedIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      player.hand.splice(idx, 1);
    }

    // Draw replacements
    for (let i = 0; i < indices.length; i++) {
      const cards = drawCards(this.deck, 1);
      player.hand.push(cards[0]);
    }

    player.hasActed = true;

    if (indices.length > 0) {
      this.audio.playGame('poker', 'deal');
      this.updateScene(`${player.name} draws ${indices.length} card${indices.length > 1 ? 's' : ''}`);
    } else {
      this.updateScene(`${player.name} stands pat`);
    }

    // Advance to next player
    setTimeout(() => {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playersInHand.length;
      this.skipDrawInactive();
      this.processDrawPhase();
    }, 400);
  }

  // --- Showdown ---

  private showdown(): void {
    this.phase = 'showdown';

    const inHand = this.playersInHand;
    for (const p of inHand) {
      // Hold'em: best 5 of 7 (2 hole + 5 community)
      // Stud: best 5 of 7; Draw: standard 5-card eval
      if (this.isHoldem) {
        const allCards = [...p.hand, ...this.communityCards];
        p.handResult = evaluateBestHand(allCards);
      } else if (this.isStud && p.hand.length > 5) {
        p.handResult = this.activeWilds.length > 0
          ? evaluateBestHandWithWilds(p.hand, this.activeWilds)
          : evaluateBestHand(p.hand);
      } else {
        p.handResult = this.activeWilds.length > 0
          ? evaluateHandWithWilds(p.hand, this.activeWilds)
          : evaluateHand(p.hand);
      }
    }

    // Calculate pots
    const pots = this.potManager.calculatePots();

    // Distribute each pot
    for (const pot of pots) {
      const eligible = inHand
        .filter(p => pot.eligible.includes(p.id))
        .map(p => ({
          playerId: p.id,
          cards: this.isHoldem ? [...p.hand, ...this.communityCards] : p.hand
        }));

      if (eligible.length === 0) continue;

      const { winnerIds } = determineWinners(eligible, this.activeWilds);
      const share = Math.floor(pot.amount / winnerIds.length);
      const remainder = pot.amount - share * winnerIds.length;

      for (let i = 0; i < winnerIds.length; i++) {
        const player = this.players.find(p => p.id === winnerIds[i])!;
        const payout = share + (i === 0 ? remainder : 0);
        player.chips += payout;
        player.payout = (player.payout || 0) + payout;
        player.result = winnerIds.length > 1 ? 'split' : 'win';
      }
    }

    // Mark losers
    for (const p of inHand) {
      if (!p.result) p.result = 'lose';
    }

    // Track human wins
    const human = this.players.find(p => p.id === 'human');
    if (human?.result === 'win' || human?.result === 'split') {
      this.handsWon++;
    }

    this.audio.playGame('poker', human?.result === 'win' || human?.result === 'split' ? 'win' : 'lose');

    this.phase = 'settlement';
    this.eliminateBrokePlayers();
    this.updateScene(this.getSettlementMessage());
  }

  private getSettlementMessage(): string {
    const human = this.players.find(p => p.id === 'human');
    if (!human) return '';
    if (human.result === 'win') {
      return `You win! ${human.handResult?.name || ''} (+$${human.payout})`;
    }
    if (human.result === 'split') {
      return `Split pot! ${human.handResult?.name || ''} (+$${human.payout})`;
    }
    // Find winner
    const winner = this.playersInHand.find(p => p.result === 'win');
    if (winner) {
      return `${winner.name} wins with ${winner.handResult?.name || 'best hand'}`;
    }
    return 'Hand complete';
  }

  private handleLastPlayerWins(): void {
    const winners = this.playersInHand;
    if (winners.length !== 1) return;

    const winner = winners[0];
    const totalPot = this.potManager.getTotalPot();
    winner.result = 'win';
    winner.payout = totalPot;
    winner.chips += totalPot;

    if (winner.id === 'human') this.handsWon++;

    this.audio.playGame('poker', winner.id === 'human' ? 'win' : 'lose');
    this.wonByFold = true;
    this.phase = 'settlement';
    this.eliminateBrokePlayers();
    this.updateScene(`${winner.name} wins $${totalPot} — everyone else folded`);
  }

  private eliminateBrokePlayers(): void {
    for (const p of this.activePlayers) {
      if (p.chips <= 0) p.isEliminated = true;
    }

    const human = this.players.find(p => p.id === 'human');
    if (human?.isEliminated) {
      this.gameOver = true;
      setTimeout(() => this.scene.showGameOver('Game Over!'), 1500);
      return;
    }

    const remaining = this.activePlayers;
    if (remaining.length <= 1) {
      this.gameOver = true;
      setTimeout(() => this.scene.showGameOver('You Win!'), 1500);
    }
  }

  // --- Draw Limit ---

  private getMaxDiscards(player: PlayerState | undefined): number {
    if (!player) return 3;
    const hasAceOrWild = player.hand.some(c =>
      c.value === 'A' || (this.activeWilds.length > 0 && isCardWild(c, this.activeWilds))
    );
    return hasAceOrWild ? 4 : 3;
  }

  // --- Scene Update ---

  private updateScene(message: string): void {
    const inHand = this.playersInHand;
    const activePlayers = this.activePlayers;
    const currentInHand = inHand[this.currentPlayerIndex % Math.max(1, inHand.length)];
    const humanPlayer = this.players.find(p => p.id === 'human');
    const isMyTurn = currentInHand?.id === 'human';
    const isBettingPhase = this.isBettingPhase();
    const isDrawPhase = this.phase === 'draw';
    const isShowdown = this.phase === 'showdown' || this.phase === 'settlement';

    const toCall = humanPlayer ? Math.max(0, this.currentBet - humanPlayer.bet) : 0;
    const myChips = humanPlayer?.chips || 0;

    // Only reveal cards at showdown (not when won by fold)
    const revealCards = isShowdown && !this.wonByFold;

    const pokerPlayers: PokerPlayer[] = this.players.map(p => {
      let hand: Card[];
      if (p.id === 'human') {
        // Human sees all cards face-up; in stud, preserve faceDown flag for layout positioning
        hand = this.isStud
          ? p.hand.map(c => ({ ...c }))
          : p.hand.map(c => ({ ...c, faceDown: false }));
      } else if (revealCards && !p.folded) {
        // Showdown: reveal all cards
        hand = p.hand.map(c => ({ ...c, faceDown: false }));
      } else if (this.isStud) {
        // Stud: show face-up cards, hide face-down for opponents
        hand = p.hand.map(c => c.faceDown
          ? { suit: 'back' as any, value: 'back', faceDown: true }
          : { ...c, faceDown: false }
        );
      } else if (this.isHoldem) {
        // Hold'em: opponents show 2 face-down cards (hole cards hidden until showdown)
        hand = p.hand.map(() => ({ suit: 'back' as any, value: 'back', faceDown: true }));
      } else {
        // Draw: all opponent cards hidden
        hand = p.hand.map(() => ({ suit: 'back' as any, value: 'back', faceDown: true }));
      }

      return {
        id: p.id,
        name: p.name,
        chips: p.chips,
        hand,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        isDealer: activePlayers.indexOf(p) === this.dealerIndex,
        isActive: p.id === currentInHand?.id && (isBettingPhase || isDrawPhase),
        result: p.result,
        payout: p.payout,
        handResult: (revealCards && !p.folded) ? p.handResult : undefined,
        isAI: p.isAI,
        difficulty: p.difficulty,
        hasActed: p.hasActed
      };
    });

    const myIndex = this.players.findIndex(p => p.id === 'human');
    const currentPlayerIdx = this.players.indexOf(currentInHand as any);

    const isVariantSelect = this.phase === 'variant-select';
    const isWildSelect = this.phase === 'wild-select';
    const dealer = this.activePlayers[this.dealerIndex % this.activePlayers.length];
    const isDealerForSelect = isVariantSelect && dealer?.id === 'human';
    const isDealerForWildSelect = isWildSelect && dealer?.id === 'human';

    const state: PokerVisualState = {
      phase: this.phase,
      players: pokerPlayers,
      myIndex,
      currentPlayerIndex: currentPlayerIdx,
      pot: this.potManager.getTotalPot(),
      pots: this.potManager.getPots(),
      dealerIndex: this.dealerIndex,
      message,
      canCheck: isBettingPhase && isMyTurn && this.currentBet <= (humanPlayer?.bet || 0),
      canCall: isBettingPhase && isMyTurn && toCall > 0 && myChips >= toCall,
      canRaise: isBettingPhase && isMyTurn && myChips > toCall + this.minRaise,
      canFold: isBettingPhase && isMyTurn,
      canAllIn: isBettingPhase && isMyTurn && myChips > 0,
      callAmount: toCall,
      minRaise: this.minRaise,
      maxRaise: Math.max(0, myChips - toCall),
      isDrawPhase,
      canDiscard: isDrawPhase && isMyTurn,
      maxDiscards: this.getMaxDiscards(humanPlayer),
      isBetting: isBettingPhase && isMyTurn,
      isShowdown,
      wonByFold: this.wonByFold,
      isVariantSelect,
      isDealerForSelect,
      variantName: VARIANT_NAMES[this.currentVariant] || "DEALER'S CHOICE",
      availableVariants: POKER_VARIANTS,
      isWildSelect,
      isDealerForWildSelect,
      activeWilds: this.activeWilds,
      isBuyIn: this.phase === 'ante' && (!humanPlayer || humanPlayer.hand.length === 0),
      currentStreet: this.currentStreet,
      lastCardDown: this.studLastCardDown,
      isStud: this.isStud,
      communityCards: this.communityCards,
      isHoldem: this.isHoldem,
      smallBlindIndex: this.smallBlindIndex,
      bigBlindIndex: this.bigBlindIndex
    };

    this.scene.updateState(state);
  }

  // --- Next Hand ---

  nextHand(): void {
    if (this.isProcessing || this.gameOver || this.phase !== 'settlement') return;
    this.scene.resetGame();

    // Reset player state for new hand (needed before buy-in screen checks hand.length)
    for (const p of this.activePlayers) {
      p.hand = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
      p.result = undefined;
      p.payout = undefined;
      p.handResult = undefined;
    }

    this.wonByFold = false;
    this.isProcessing = false;
    this.currentStreet = 0;
    this.communityCards = [];
    this.smallBlindIndex = -1;
    this.bigBlindIndex = -1;
    this.pendingQueen = false;
    this.followTheQueenValue = null;
    this.dealerIndex = (this.dealerIndex + 1) % this.activePlayers.length;
    if (this.lockedVariant) {
      this.currentVariant = this.lockedVariant;
      this.activeWilds = [];
      this.phase = 'ante';
      this.updateScene('');
    } else {
      this.startVariantSelect();
    }
  }

  newGame(): void {
    this.scene.resetGame();
    this.startGame();
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
