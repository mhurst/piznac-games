import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { WarScene } from '../../../games/war/war.scene';
import { AudioService } from '../../../core/audio/audio.service';

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: number;
}

type GameMode = 'standard' | 'timed';

@Component({
  selector: 'app-sp-war',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-war.component.html',
  styleUrl: './sp-war.component.scss'
})
export class SpWarComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: WarScene;

  // Game state
  private playerDeck: Card[] = [];
  private aiDeck: Card[] = [];
  private playerWonPile: Card[] = [];
  private aiWonPile: Card[] = [];
  private centerCards: Card[] = [];
  private playerFlippedCard: Card | null = null;
  private aiFlippedCard: Card | null = null;
  private inWar = false;
  private isProcessingRound = false;

  // Settings
  gameMode: GameMode = 'standard';
  timedMinutes = 3;

  // Game state flags
  gameStarted = false;
  gameOver = false;
  playerScore = 0;
  aiScore = 0;

  // Timer
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  timeRemaining = 0;

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new WarScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 400,
      height: 500,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupGameCallbacks();
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onFlip = () => {
      if (!this.gameStarted || this.gameOver || this.isProcessingRound) return;
      this.playRound();
    };
  }

  private createDeck(): Card[] {
    const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const deck: Card[] = [];

    for (const suit of suits) {
      for (let value = 2; value <= 14; value++) {
        deck.push({ suit, value });
      }
    }

    return this.shuffleDeck(deck);
  }

  private shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private getTotalCards(isPlayer: boolean): number {
    if (isPlayer) {
      return this.playerDeck.length + this.playerWonPile.length;
    }
    return this.aiDeck.length + this.aiWonPile.length;
  }

  private drawCard(isPlayer: boolean): Card | null {
    const deck = isPlayer ? this.playerDeck : this.aiDeck;
    const wonPile = isPlayer ? this.playerWonPile : this.aiWonPile;

    if (deck.length === 0) {
      if (wonPile.length === 0) {
        return null;
      }
      // Reshuffle won pile into deck
      const reshuffled = this.shuffleDeck(wonPile);
      if (isPlayer) {
        this.playerDeck = reshuffled;
        this.playerWonPile = [];
      } else {
        this.aiDeck = reshuffled;
        this.aiWonPile = [];
      }
    }

    const targetDeck = isPlayer ? this.playerDeck : this.aiDeck;
    return targetDeck.shift() || null;
  }

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.inWar = false;
    this.isProcessingRound = false;

    // Create and deal deck
    const deck = this.createDeck();
    this.playerDeck = deck.slice(0, 26);
    this.aiDeck = deck.slice(26);
    this.playerWonPile = [];
    this.aiWonPile = [];
    this.centerCards = [];
    this.playerFlippedCard = null;
    this.aiFlippedCard = null;

    this.scene.resetGame();
    this.scene.setSymbol('P1');
    this.updateScene();

    // Start timer for timed mode
    if (this.gameMode === 'timed') {
      this.timeRemaining = this.timedMinutes * 60;
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      if (this.timeRemaining <= 0) {
        this.endTimedGame();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private endTimedGame(): void {
    this.stopTimer();
    this.gameOver = true;

    const playerTotal = this.getTotalCards(true);
    const aiTotal = this.getTotalCards(false);

    if (playerTotal > aiTotal) {
      this.playerScore++;
      this.scene.showGameOver('player', 'player', playerTotal, aiTotal);
    } else if (aiTotal > playerTotal) {
      this.aiScore++;
      this.scene.showGameOver('ai', 'player', playerTotal, aiTotal);
    } else {
      this.scene.showGameOver(null, 'player', playerTotal, aiTotal);
    }
  }

  private playRound(): void {
    if (this.gameOver || this.isProcessingRound) return;

    this.isProcessingRound = true;

    // Draw cards for both players
    const playerCard = this.drawCard(true);
    const aiCard = this.drawCard(false);

    if (!playerCard) {
      this.handleGameOver(false);
      return;
    }
    if (!aiCard) {
      this.handleGameOver(true);
      return;
    }

    this.playerFlippedCard = playerCard;
    this.aiFlippedCard = aiCard;
    this.centerCards.push(playerCard, aiCard);

    this.audio.playGame('war', 'flip');
    this.scene.showFlippedCards(playerCard, aiCard);
    this.updateScene();

    // Compare cards after a delay
    setTimeout(() => {
      if (this.gameOver) return;

      if (playerCard.value > aiCard.value) {
        this.resolveRound(true);
      } else if (aiCard.value > playerCard.value) {
        this.resolveRound(false);
      } else {
        // War!
        this.initiateWar();
      }
    }, 800);
  }

  private initiateWar(): void {
    this.inWar = true;
    this.scene.showWarCards(3);
    this.audio.playGame('war', 'slide');

    // Each player puts 3 cards face down
    for (let i = 0; i < 3; i++) {
      const playerCard = this.drawCard(true);
      const aiCard = this.drawCard(false);

      if (!playerCard) {
        this.handleGameOver(false);
        return;
      }
      if (!aiCard) {
        this.handleGameOver(true);
        return;
      }

      this.centerCards.push(playerCard, aiCard);
    }

    this.updateScene();

    // After a delay, draw and show the deciding face-up cards ON the stacks
    setTimeout(() => {
      if (this.gameOver) return;

      // Draw the deciding cards
      const playerDecidingCard = this.drawCard(true);
      const aiDecidingCard = this.drawCard(false);

      if (!playerDecidingCard) {
        this.handleGameOver(false);
        return;
      }
      if (!aiDecidingCard) {
        this.handleGameOver(true);
        return;
      }

      this.centerCards.push(playerDecidingCard, aiDecidingCard);

      // Show face-up cards on top of the war stacks
      this.scene.showWarDecidingCards(playerDecidingCard, aiDecidingCard);
      this.audio.playGame('war', 'flip');

      // After showing, determine winner
      setTimeout(() => {
        if (this.gameOver) return;

        this.inWar = false;

        if (playerDecidingCard.value > aiDecidingCard.value) {
          this.resolveRound(true);
        } else if (aiDecidingCard.value > playerDecidingCard.value) {
          this.resolveRound(false);
        } else {
          // Another war! (double war)
          this.initiateWar();
        }
      }, 1000);
    }, 1000);
  }

  private resolveRound(playerWins: boolean): void {
    this.inWar = false;

    // Award all center cards to winner
    if (playerWins) {
      this.playerWonPile.push(...this.centerCards);
    } else {
      this.aiWonPile.push(...this.centerCards);
    }
    this.centerCards = [];

    this.audio.playGame('war', 'win-round');
    this.scene.showRoundResult(playerWins ? 'P1' : 'P2', playerWins);

    // Check for game over
    setTimeout(() => {
      if (this.gameOver) return;

      const playerTotal = this.getTotalCards(true);
      const aiTotal = this.getTotalCards(false);

      if (playerTotal === 52 || aiTotal === 0) {
        this.handleGameOver(true);
        return;
      }
      if (aiTotal === 52 || playerTotal === 0) {
        this.handleGameOver(false);
        return;
      }

      this.isProcessingRound = false;
      this.updateScene();
    }, 1200);
  }

  private handleGameOver(playerWins: boolean): void {
    this.stopTimer();
    this.gameOver = true;
    this.isProcessingRound = false;

    const playerTotal = this.getTotalCards(true);
    const aiTotal = this.getTotalCards(false);

    if (playerWins) {
      this.playerScore++;
      this.scene.showGameOver('player', 'player', playerTotal, aiTotal);
    } else {
      this.aiScore++;
      this.scene.showGameOver('ai', 'player', playerTotal, aiTotal);
    }
  }

  private updateScene(): void {
    const state = {
      phase: 'waiting',
      myCardCount: this.getTotalCards(true),
      opponentCardCount: this.getTotalCards(false),
      flippedCards: {
        P1: this.playerFlippedCard,
        P2: this.aiFlippedCard
      },
      mySymbol: 'P1' as const,
      iHaveFlipped: this.isProcessingRound,
      opponentHasFlipped: false,
      inWar: this.inWar,
      warCardCount: 0,
      roundWinner: null,
      gameOver: this.gameOver,
      winner: null
    };
    this.scene.updateState(state);
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  playAgain(): void {
    this.startGame();
  }

  resetScore(): void {
    this.playerScore = 0;
    this.aiScore = 0;
  }

  leaveGame(): void {
    this.stopTimer();
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }
  }
}
