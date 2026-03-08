import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import Phaser from 'phaser';
import { GinRummyScene } from '../../../games/gin-rummy/gin-rummy.scene';
import {
  GinRummyCard, GinRummyVisualState, GinRummyPhase, GinRummyMeld,
  SUITS, RANKS, findBestMelds, isGin, sortHand
} from '../../../games/gin-rummy/gin-rummy-types';
import { getAIDrawDecision, getAIDiscardDecision, getAIDelay, GinRummyAIContext } from '../../../core/ai/gin-rummy.ai';
import { getRandomAINames } from '../../../core/ai/ai-names';
import { AudioService } from '../../../core/audio/audio.service';

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
}

@Component({
  selector: 'app-sp-gin-rummy',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatSelectModule, MatFormFieldModule, FormsModule],
  templateUrl: './sp-gin-rummy.component.html',
  styleUrl: './sp-gin-rummy.component.scss'
})
export class SpGinRummyComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: GinRummyScene;

  // Deck
  private deck: Card[] = [];
  private discardPile: Card[] = [];

  // Hands
  private playerHand: Card[] = [];
  private aiHand: Card[] = [];

  // Game state
  private phase: GinRummyPhase = 'waiting';
  private isPlayerTurn = true;
  private selectedCardIndex: number | null = null;
  private aiTimeouts: any[] = [];

  private aiName = '';

  // AI tracking
  private discardHistory: Card[] = [];
  private opponentPickedFromDiscard: Card[] = [];

  // Round over state
  private roundOverMelds: { player: GinRummyMeld[]; ai: GinRummyMeld[] } | null = null;

  // UI state
  gameStarted = false;
  gameOver = false;
  difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new GinRummyScene();
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 700,
      height: 520,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#0b0b15',
      scene: this.scene
    });
    this.scene.onReady = () => this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.scene.onStockClick = () => {
      if (this.phase !== 'drawing' || !this.isPlayerTurn) return;
      this.drawFromStock(true);
    };

    this.scene.onDiscardPileClick = () => {
      if (this.phase !== 'drawing' || !this.isPlayerTurn) return;
      this.drawFromDiscard(true);
    };

    this.scene.onHandCardClick = (index: number) => {
      if (this.phase !== 'discarding' || !this.isPlayerTurn) return;
      this.selectedCardIndex = index;
      this.updateScene();
    };

    this.scene.onDiscardClick = () => {
      if (this.phase !== 'discarding' || !this.isPlayerTurn) return;
      if (this.selectedCardIndex === null) return;
      this.discardCard(true, this.selectedCardIndex);
    };

    this.scene.onGinClick = () => {
      if (this.phase !== 'discarding' || !this.isPlayerTurn) return;
      this.callGin(true);
    };

    this.scene.onHandReorder = (order: number[]) => {
      this.playerHand = order.map(i => this.playerHand[i]);
      this.selectedCardIndex = null;
      this.updateScene();
    };
  }

  // --- Deck ---

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const value of RANKS) {
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

  // --- Game Start ---

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.aiName = getRandomAINames(1)[0];
    this.scene.resetGame();
    this.startNewHand();
  }

  private startNewHand(): void {
    this.deck = this.shuffleDeck(this.createDeck());
    this.discardPile = [];
    this.playerHand = [];
    this.aiHand = [];
    this.selectedCardIndex = null;
    this.roundOverMelds = null;
    this.discardHistory = [];
    this.opponentPickedFromDiscard = [];

    // Deal 10 cards each
    for (let i = 0; i < 10; i++) {
      this.playerHand.push(this.deck.pop()!);
      this.aiHand.push(this.deck.pop()!);
    }

    // First card to discard pile
    this.discardPile.push(this.deck.pop()!);

    this.playerHand = sortHand(this.playerHand);
    this.isPlayerTurn = true;
    this.phase = 'drawing';

    this.audio.playGame('gin-rummy', 'deal');
    this.updateScene('Your turn — draw from stock or discard pile');
  }

  // --- Draw ---

  private drawFromStock(isPlayer: boolean): void {
    if (this.deck.length === 0) return;
    const card = this.deck.pop()!;

    if (isPlayer) {
      this.playerHand.push(card);
      this.audio.playGame('gin-rummy', 'draw');
    } else {
      this.aiHand.push(card);
    }

    this.phase = 'discarding';
    this.selectedCardIndex = null;
    if (isPlayer) {
      this.updateScene('Select a card to discard');
    }
  }

  private drawFromDiscard(isPlayer: boolean): void {
    if (this.discardPile.length === 0) return;
    const card = this.discardPile.pop()!;

    if (isPlayer) {
      this.playerHand.push(card);
      this.audio.playGame('gin-rummy', 'draw');
    } else {
      this.aiHand.push(card);
      this.opponentPickedFromDiscard.push(card);
    }

    this.phase = 'discarding';
    this.selectedCardIndex = null;
    if (isPlayer) {
      this.updateScene('Select a card to discard');
    }
  }

  // --- Discard ---

  private discardCard(isPlayer: boolean, cardIndex: number): void {
    let card: Card;

    if (isPlayer) {
      card = this.playerHand.splice(cardIndex, 1)[0];
    } else {
      card = this.aiHand.splice(cardIndex, 1)[0];
    }

    this.discardPile.push(card);
    this.discardHistory.push(card);
    this.selectedCardIndex = null;
    this.audio.playGame('gin-rummy', 'discard');

    // Check stock exhaustion
    if (this.deck.length === 0) {
      this.handleDraw();
      return;
    }

    // Next turn
    this.isPlayerTurn = !this.isPlayerTurn;
    this.phase = 'drawing';

    if (this.isPlayerTurn) {
      this.updateScene('Your turn — draw from stock or discard pile');
    } else {
      this.updateScene(`${this.aiName} is thinking...`);
      this.scheduleAITurn();
    }
  }

  // --- Gin ---

  private callGin(isPlayer: boolean): void {
    if (isPlayer) {
      // Find the best discard that leaves gin
      for (let i = 0; i < this.playerHand.length; i++) {
        const testHand = this.playerHand.filter((_, idx) => idx !== i);
        if (isGin(testHand)) {
          const discarded = this.playerHand.splice(i, 1)[0];
          this.discardPile.push(discarded);
          break;
        }
      }
      this.audio.playGame('gin-rummy', 'gin');
      this.handleGin(true);
    } else {
      // AI gin — already determined best discard
      this.audio.playGame('gin-rummy', 'gin');
      this.handleGin(false);
    }
  }

  private handleGin(playerWon: boolean): void {
    const winnerHand = playerWon ? this.playerHand : this.aiHand;
    const loserHand = playerWon ? this.aiHand : this.playerHand;

    const winnerMelds = findBestMelds(winnerHand);
    const loserMelds = findBestMelds(loserHand);

    if (playerWon) {
      this.audio.playGame('gin-rummy', 'win');
    } else {
      this.audio.playGame('gin-rummy', 'lose');
    }

    this.roundOverMelds = {
      player: playerWon ? winnerMelds.melds : loserMelds.melds,
      ai: playerWon ? loserMelds.melds : winnerMelds.melds
    };

    this.phase = 'gameOver';
    this.gameOver = true;
    const winnerName = playerWon ? 'You' : this.aiName;
    this.updateScene(`${winnerName} got Gin!`);

    const timeout = setTimeout(() => {
      this.scene.showGameOver(playerWon ? 'You win!' : `${this.aiName} wins!`, `${winnerName} got Gin!`);
    }, 1500);
    this.aiTimeouts.push(timeout);
  }

  private handleDraw(): void {
    this.phase = 'gameOver';
    this.gameOver = true;
    const playerMelds = findBestMelds(this.playerHand);
    const aiMelds = findBestMelds(this.aiHand);
    this.roundOverMelds = { player: playerMelds.melds, ai: aiMelds.melds };

    this.updateScene('Stock exhausted — draw!');

    const timeout = setTimeout(() => {
      this.scene.showGameOver("It's a draw!", 'Stock exhausted — no one got Gin');
    }, 1500);
    this.aiTimeouts.push(timeout);
  }

  // --- AI ---

  private scheduleAITurn(): void {
    if (this.phase !== 'drawing' && this.phase !== 'discarding') return;
    if (this.isPlayerTurn) return;

    const timeout = setTimeout(() => {
      if (this.isPlayerTurn) return;

      if (this.phase === 'drawing') {
        // AI draws
        const ctx: GinRummyAIContext = {
          hand: this.aiHand as GinRummyCard[],
          discardTop: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] as GinRummyCard : null,
          difficulty: this.difficulty,
          discardHistory: this.discardHistory as GinRummyCard[],
          opponentPickedFromDiscard: this.opponentPickedFromDiscard as GinRummyCard[]
        };

        const drawDecision = getAIDrawDecision(ctx);
        if (drawDecision.source === 'discard' && ctx.discardTop) {
          this.drawFromDiscard(false);
        } else {
          this.drawFromStock(false);
        }

        // Now discard
        this.updateScene(`${this.aiName} is thinking...`);
        const discardTimeout = setTimeout(() => {
          const discardCtx: GinRummyAIContext = {
            hand: this.aiHand as GinRummyCard[],
            discardTop: null,
            difficulty: this.difficulty,
            discardHistory: this.discardHistory as GinRummyCard[],
            opponentPickedFromDiscard: this.opponentPickedFromDiscard as GinRummyCard[]
          };

          const discardDecision = getAIDiscardDecision(discardCtx);

          if (discardDecision.callGin) {
            // Discard the chosen card first
            const discarded = this.aiHand.splice(discardDecision.cardIndex, 1)[0];
            this.discardPile.push(discarded);
            this.discardHistory.push(discarded);
            this.callGin(false);
          } else {
            this.discardCard(false, discardDecision.cardIndex);
          }
        }, getAIDelay());
        this.aiTimeouts.push(discardTimeout);
      }
    }, getAIDelay());
    this.aiTimeouts.push(timeout);
  }

  // --- Scene Update ---

  private updateScene(message?: string): void {
    const canGin = this.isPlayerTurn && this.phase === 'discarding' && this.checkCanGin();

    const displayMessage = message || (
      this.isPlayerTurn
        ? (this.phase === 'drawing' ? 'Your turn — draw from stock or discard pile' : 'Select a card to discard')
        : `${this.aiName} is thinking...`
    );

    const state: GinRummyVisualState = {
      phase: this.phase,
      myHand: this.playerHand as GinRummyCard[],
      opponentCardCount: this.aiHand.length,
      stockCount: this.deck.length,
      discardTop: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] as GinRummyCard : null,
      selectedCardIndex: this.selectedCardIndex,
      isMyTurn: this.isPlayerTurn,
      canGin,
      message: displayMessage,
      myName: 'YOU',
      opponentName: this.aiName,
      opponentAvatar: this.aiName,
    };

    if (this.phase === 'gameOver') {
      state.opponentHand = this.aiHand as GinRummyCard[];
      if (this.roundOverMelds) {
        state.myMelds = this.roundOverMelds.player;
        state.opponentMelds = this.roundOverMelds.ai;
      }
    }

    this.scene.updateState(state);
  }

  private checkCanGin(): boolean {
    if (this.playerHand.length !== 11) return false;
    for (let i = 0; i < this.playerHand.length; i++) {
      const testHand = this.playerHand.filter((_, idx) => idx !== i);
      if (isGin(testHand)) return true;
    }
    return false;
  }

  // --- UI ---

  newGame(): void {
    this.clearAITimeouts();
    this.scene.resetGame();
    this.startGame();
  }

  leaveGame(): void {
    this.clearAITimeouts();
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  private clearAITimeouts(): void {
    this.aiTimeouts.forEach(t => clearTimeout(t));
    this.aiTimeouts = [];
  }

  ngOnDestroy(): void {
    this.clearAITimeouts();
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
