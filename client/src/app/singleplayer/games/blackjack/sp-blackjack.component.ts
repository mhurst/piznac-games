import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { BlackjackScene, BlackjackCard, BlackjackVisualState, BlackjackPlayerHand } from '../../../games/blackjack/blackjack.scene';
import { AudioService } from '../../../core/audio/audio.service';
import { PlayerWalletService } from '../../../core/player-wallet.service';

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
}

@Component({
  selector: 'app-sp-blackjack',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './sp-blackjack.component.html',
  styleUrl: './sp-blackjack.component.scss'
})
export class SpBlackjackComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: BlackjackScene;

  // Deck
  private deck: Card[] = [];

  // Hands
  private playerHand: Card[] = [];
  private dealerHand: Card[] = [];

  // Game state
  private chips = 1000;
  private currentBet = 0;
  private phase: 'betting' | 'dealing' | 'playerTurn' | 'dealerTurn' | 'settlement' = 'betting';
  private playerBusted = false;
  private dealerBusted = false;
  private isProcessing = false;

  // Stats
  wins = 0;
  losses = 0;

  // UI state
  gameStarted = false;
  gameOver = false;

  constructor(
    private router: Router,
    private audio: AudioService,
    private wallet: PlayerWalletService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new BlackjackScene();
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
    this.scene.onHitClick = () => this.hit();
    this.scene.onStandClick = () => this.stand();
    this.scene.onDoubleDownClick = () => this.doubleDown();
    this.scene.onDealClick = () => this.deal();
    this.scene.onBetChange = (amount: number) => this.addBet(amount);
    this.scene.onClearBet = () => this.clearBet();

    // If the game already started before the scene was ready, push current state
    if (this.gameStarted && this.phase === 'betting') {
      this.updateScene('Place your bet!');
    }
  }

  // --- Deck Management ---

  private createDeck(): Card[] {
    const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
    return deck;
  }

  private shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private drawCard(): Card {
    if (this.deck.length < 15) {
      this.deck = this.shuffleDeck(this.createDeck());
    }
    return this.deck.pop()!;
  }

  // --- Hand Evaluation ---

  private handTotal(hand: Card[]): number {
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

  private isBlackjack(hand: Card[]): boolean {
    return hand.length === 2 && this.handTotal(hand) === 21;
  }

  private isSoft(hand: Card[]): boolean {
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

  // --- Game Start ---

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.chips = this.wallet.getBalance('chips');
    this.wins = 0;
    this.losses = 0;
    this.deck = this.shuffleDeck(this.createDeck());
    this.scene.resetGame();
    this.startNewRound();
  }

  private startNewRound(): void {
    this.playerHand = [];
    this.dealerHand = [];
    this.currentBet = 0;
    this.playerBusted = false;
    this.dealerBusted = false;
    this.phase = 'betting';
    this.isProcessing = false;
    this.updateScene('Place your bet!');
  }

  // --- Betting ---

  private addBet(amount: number): void {
    if (this.phase !== 'betting') return;
    if (this.currentBet + amount > this.chips) return;
    this.currentBet += amount;
    this.audio.playGame('blackjack', 'chips');
    this.updateScene('Place your bet!');
  }

  private clearBet(): void {
    if (this.phase !== 'betting') return;
    this.currentBet = 0;
    this.updateScene('Place your bet!');
  }

  // --- Deal ---

  private deal(): void {
    if (this.phase !== 'betting' || this.currentBet <= 0 || this.isProcessing) return;
    this.isProcessing = true;
    this.phase = 'dealing';

    // Deduct bet
    this.chips -= this.currentBet;

    // Deal 4 cards alternating: player, dealer, player, dealer
    const cards = [this.drawCard(), this.drawCard(), this.drawCard(), this.drawCard()];

    // Deal cards one at a time with delays, updating the scene each time
    const dealSteps = [
      () => { this.playerHand.push(cards[0]); this.audio.playGame('blackjack', 'deal'); this.updateScene('Dealing...'); },
      () => { this.dealerHand.push(cards[1]); this.audio.playGame('blackjack', 'deal'); this.updateScene('Dealing...'); },
      () => { this.playerHand.push(cards[2]); this.audio.playGame('blackjack', 'deal'); this.updateScene('Dealing...'); },
      () => { this.dealerHand.push(cards[3]); this.audio.playGame('blackjack', 'deal'); this.updateScene('Dealing...'); },
    ];

    let i = 0;
    const dealNext = () => {
      if (i < dealSteps.length) {
        dealSteps[i]();
        i++;
        setTimeout(dealNext, 300);
      } else {
        this.finishDeal();
      }
    };
    dealNext();
  }

  private finishDeal(): void {
    // Check for blackjacks
    const playerBJ = this.isBlackjack(this.playerHand);
    const dealerBJ = this.isBlackjack(this.dealerHand);

    if (playerBJ || dealerBJ) {
      this.phase = 'settlement';
      this.isProcessing = false;
      this.settleRound();
      return;
    }

    this.phase = 'playerTurn';
    this.isProcessing = false;
    this.updateScene('Hit, Stand, or Double Down');
  }

  // --- Player Actions ---

  private hit(): void {
    if (this.phase !== 'playerTurn' || this.isProcessing) return;
    this.isProcessing = true;

    const card = this.drawCard();
    this.playerHand.push(card);
    this.audio.playGame('blackjack', 'hit');

    const total = this.handTotal(this.playerHand);

    if (total > 21) {
      this.playerBusted = true;
      this.phase = 'settlement';
      this.isProcessing = false;
      this.settleRound();
    } else if (total === 21) {
      // Auto-stand on 21
      this.isProcessing = false;
      this.stand();
    } else {
      this.isProcessing = false;
      this.updateScene('Hit or Stand');
    }
  }

  private stand(): void {
    if (this.phase !== 'playerTurn' || this.isProcessing) return;
    this.isProcessing = true;
    this.phase = 'dealerTurn';
    this.updateScene('Dealer reveals...');

    // Dealer plays after a brief delay
    setTimeout(() => this.dealerPlay(), 600);
  }

  private doubleDown(): void {
    if (this.phase !== 'playerTurn' || this.isProcessing) return;
    if (this.playerHand.length !== 2) return;
    if (this.chips < this.currentBet) return;

    this.isProcessing = true;

    // Double the bet
    this.chips -= this.currentBet;
    this.currentBet *= 2;
    this.audio.playGame('blackjack', 'chips');
    this.updateScene(`Double Down! Bet: $${this.currentBet}`);

    // Brief pause so the user can see the bet change, then draw the card
    setTimeout(() => {
      const card = this.drawCard();
      this.playerHand.push(card);
      this.audio.playGame('blackjack', 'hit');

      const total = this.handTotal(this.playerHand);
      if (total > 21) {
        this.playerBusted = true;
        this.phase = 'settlement';
        this.isProcessing = false;
        this.settleRound();
      } else {
        this.phase = 'dealerTurn';
        this.updateScene('Dealer reveals...');
        setTimeout(() => this.dealerPlay(), 600);
      }
    }, 500);
  }

  // --- Dealer Play ---

  private dealerPlay(): void {
    // Reveal hole card
    this.updateScene('Dealer reveals...');

    const dealerTurn = () => {
      const dealerTotal = this.handTotal(this.dealerHand);

      if (dealerTotal > 17 || (dealerTotal === 17 && !this.isSoft(this.dealerHand))) {
        // Dealer stands (hits on soft 17)
        if (dealerTotal > 21) {
          this.dealerBusted = true;
        }
        this.phase = 'settlement';
        this.isProcessing = false;
        this.settleRound();
        return;
      }

      // Dealer hits
      const card = this.drawCard();
      this.dealerHand.push(card);
      this.audio.playGame('blackjack', 'hit');
      this.updateScene(`Dealer draws... [${this.handTotal(this.dealerHand)}]`);

      setTimeout(dealerTurn, 600);
    };

    setTimeout(dealerTurn, 600);
  }

  // --- Settlement ---

  private settleRound(): void {
    const playerTotal = this.handTotal(this.playerHand);
    const dealerTotal = this.handTotal(this.dealerHand);
    const playerBJ = this.isBlackjack(this.playerHand);
    const dealerBJ = this.isBlackjack(this.dealerHand);

    let result: string;
    let payout = 0;
    let message: string;

    if (playerBJ && dealerBJ) {
      // Both blackjack — push
      result = 'push';
      payout = this.currentBet;
      message = 'Both Blackjack — Push!';
    } else if (playerBJ) {
      // Player blackjack — pays 3:2
      result = 'blackjack';
      payout = this.currentBet + Math.floor(this.currentBet * 1.5);
      message = 'Blackjack! You win!';
      this.wins++;
    } else if (dealerBJ) {
      result = 'lose';
      payout = 0;
      message = 'Dealer Blackjack — You lose!';
      this.losses++;
    } else if (this.playerBusted) {
      result = 'lose';
      payout = 0;
      message = 'Bust! You lose!';
      this.losses++;
    } else if (this.dealerBusted) {
      result = 'win';
      payout = this.currentBet * 2;
      message = 'Dealer busts — You win!';
      this.wins++;
    } else if (playerTotal > dealerTotal) {
      result = 'win';
      payout = this.currentBet * 2;
      message = `You win! ${playerTotal} vs ${dealerTotal}`;
      this.wins++;
    } else if (dealerTotal > playerTotal) {
      result = 'lose';
      payout = 0;
      message = `Dealer wins! ${dealerTotal} vs ${playerTotal}`;
      this.losses++;
    } else {
      result = 'push';
      payout = this.currentBet;
      message = `Push! Both ${playerTotal}`;
    }

    this.chips += payout;

    if (result === 'win' || result === 'blackjack') {
      this.audio.playGame('blackjack', 'win');
    } else if (result === 'lose') {
      this.audio.playGame('blackjack', 'lose');
    }

    this.wallet.setBalance('chips', this.chips);
    this.updateSceneWithResult(message, result, payout);

    // Check for game over (0 chips)
    if (this.chips <= 0) {
      this.gameOver = true;
      setTimeout(() => {
        this.scene.showGameOver('Game Over!');
      }, 1500);
    }
  }

  // --- Next Round ---

  nextRound(): void {
    if (this.isProcessing) return;
    this.scene.resetGame();
    this.startNewRound();
  }

  // --- Scene Updates ---

  private updateScene(message: string): void {
    const playerTotal = this.handTotal(this.playerHand);
    const dealerTotal = this.handTotal(this.dealerHand);
    const showDealerHole = this.phase === 'dealerTurn' || this.phase === 'settlement';

    const dealerCards: BlackjackCard[] = this.dealerHand.map((c, i) => ({
      suit: c.suit,
      value: c.value,
      faceDown: i === 1 && !showDealerHole
    }));

    const playerBJ = this.isBlackjack(this.playerHand);

    const state: BlackjackVisualState = {
      phase: this.phase,
      dealer: {
        cards: dealerCards,
        total: showDealerHole ? dealerTotal : 0,
        busted: this.dealerBusted,
        blackjack: this.isBlackjack(this.dealerHand) && showDealerHole,
        revealHole: showDealerHole
      },
      players: [{
        name: 'YOU',
        cards: this.playerHand.map(c => ({ suit: c.suit, value: c.value })),
        total: playerTotal,
        busted: this.playerBusted,
        blackjack: playerBJ,
        done: this.phase !== 'playerTurn',
        bet: this.currentBet,
        chips: this.chips,
        isActive: this.phase === 'playerTurn'
      }],
      myIndex: 0,
      currentPlayerIndex: 0,
      message,
      canHit: this.phase === 'playerTurn' && !this.isProcessing,
      canStand: this.phase === 'playerTurn' && !this.isProcessing,
      canDouble: this.phase === 'playerTurn' && !this.isProcessing &&
        this.playerHand.length === 2 && this.chips >= this.currentBet,
      canDeal: this.phase === 'betting' && this.currentBet > 0,
      currentBet: this.currentBet,
      isBetting: this.phase === 'betting'
    };

    this.scene.updateState(state);
  }

  private updateSceneWithResult(message: string, result: string, payout: number): void {
    const playerTotal = this.handTotal(this.playerHand);
    const dealerTotal = this.handTotal(this.dealerHand);

    const dealerCards: BlackjackCard[] = this.dealerHand.map(c => ({
      suit: c.suit, value: c.value
    }));

    const state: BlackjackVisualState = {
      phase: 'settlement',
      dealer: {
        cards: dealerCards,
        total: dealerTotal,
        busted: this.dealerBusted,
        blackjack: this.isBlackjack(this.dealerHand),
        revealHole: true
      },
      players: [{
        name: 'YOU',
        cards: this.playerHand.map(c => ({ suit: c.suit, value: c.value })),
        total: playerTotal,
        busted: this.playerBusted,
        blackjack: this.isBlackjack(this.playerHand),
        done: true,
        bet: this.currentBet,
        chips: this.chips,
        isActive: false,
        result,
        payout: result === 'lose' ? 0 : payout - this.currentBet
      }],
      myIndex: 0,
      currentPlayerIndex: 0,
      message,
      canHit: false,
      canStand: false,
      canDouble: false,
      canDeal: false,
      currentBet: this.currentBet,
      isBetting: false
    };

    this.scene.updateState(state);
  }

  // --- UI Actions ---

  replenishChips(): void {
    this.wallet.replenish('chips', 1000);
    this.chips = this.wallet.getBalance('chips');
    this.gameOver = false;
    this.scene.resetGame();
    this.startNewRound();
  }

  get canReplenish(): boolean {
    return this.wallet.getBalance('chips') < 1000;
  }

  newGame(): void {
    this.scene.resetGame();
    this.startGame();
  }

  leaveGame(): void {
    this.wallet.setBalance('chips', this.chips);
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    this.wallet.setBalance('chips', this.chips);
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
