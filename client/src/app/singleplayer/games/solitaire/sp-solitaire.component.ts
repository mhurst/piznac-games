import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { SolitaireScene, SolCard, SolitaireVisualState, CardLocation } from '../../../games/solitaire/solitaire.scene';
import { AudioService } from '../../../core/audio/audio.service';

type DrawMode = 1 | 3;

interface GameState {
  columns: SolCard[][];
  foundations: SolCard[][];  // index 0=spades, 1=hearts, 2=diamonds, 3=clubs
  drawPile: SolCard[];
  wastePile: SolCard[];
}

@Component({
  selector: 'app-sp-solitaire',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-solitaire.component.html',
  styleUrl: './sp-solitaire.component.scss'
})
export class SpSolitaireComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: SolitaireScene;

  // Game state
  private state: GameState = {
    columns: [[], [], [], [], [], [], []],
    foundations: [[], [], [], []],
    drawPile: [],
    wastePile: []
  };

  // Undo history (JSON snapshots of state)
  private history: string[] = [];
  private readonly MAX_UNDO = 200;

  // Settings
  drawMode: DrawMode = 1;

  // Flags
  gameStarted = false;
  gameOver = false;
  won = false;
  private sceneReady = false;
  private pendingRender = false;

  private readonly FOUNDATION_SUIT_ORDER: SolCard['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new SolitaireScene();

    // Set onReady BEFORE creating the game to avoid race condition
    // where create() fires before the callback is assigned
    this.scene.onReady = () => {
      this.sceneReady = true;
      this.setupCallbacks();
      if (this.pendingRender) {
        this.pendingRender = false;
        this.updateScene();
      }
    };

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 980,
      height: 850,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });
  }

  private setupCallbacks(): void {
    this.scene.onDrawClick = () => {
      if (this.gameOver) return;
      this.drawCards();
    };

    this.scene.onCardDrop = (from: CardLocation, to: CardLocation) => {
      if (this.gameOver) return;
      this.handleDrop(from, to);
    };

    this.scene.onDoubleClick = (location: CardLocation) => {
      if (this.gameOver) return;
      this.handleDoubleClick(location);
    };

    this.scene.onGetValidTargets = (from: CardLocation) => {
      return this.getValidTargets(from);
    };
  }

  // --- Undo ---

  private saveSnapshot(): void {
    const snapshot = JSON.stringify(this.state);
    this.history.push(snapshot);
    if (this.history.length > this.MAX_UNDO) {
      this.history.shift();
    }
  }

  get canUndo(): boolean {
    return this.history.length > 0 && !this.gameOver;
  }

  undo(): void {
    if (!this.canUndo) return;
    const snapshot = this.history.pop()!;
    this.state = JSON.parse(snapshot);
    this.updateScene();
  }

  // --- Deck creation and dealing ---

  private createDeck(): SolCard[] {
    const suits: SolCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const deck: SolCard[] = [];

    for (const suit of suits) {
      for (let value = 1; value <= 13; value++) {
        deck.push({ suit, value, faceUp: false });
      }
    }

    return this.shuffle(deck);
  }

  private shuffle(deck: SolCard[]): SolCard[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private deal(): void {
    const deck = this.createDeck();
    let index = 0;

    const columns: SolCard[][] = [[], [], [], [], [], [], []];
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = { ...deck[index++] };
        card.faceUp = (row === col);
        columns[col].push(card);
      }
    }

    const drawPile = deck.slice(index).map(c => ({ ...c, faceUp: false }));

    this.state = {
      columns,
      foundations: [[], [], [], []],
      drawPile,
      wastePile: []
    };

    this.history = [];
  }

  // --- Drop handling (drag & drop) ---

  private handleDrop(from: CardLocation, to: CardLocation): void {
    const cards = this.getCardsFromLocation(from);
    if (!cards || cards.length === 0) {
      this.updateScene();
      return;
    }

    this.saveSnapshot();

    if (this.tryMove(from, to)) {
      this.audio.playGame('solitaire', 'place');
      this.autoFlipColumns();
      this.checkWin();
      this.updateScene();

      if (!this.gameOver && this.allCardsFaceUp()) {
        this.autoComplete();
      }
    } else {
      // Invalid move — undo the snapshot we just saved
      this.history.pop();
      this.updateScene();
    }
  }

  // --- Double-click to foundation ---

  private handleDoubleClick(location: CardLocation): void {
    if (location.type === 'draw') return;

    const cards = this.getCardsFromLocation(location);
    if (!cards || cards.length !== 1) return;

    const card = cards[0];

    // Find which foundation this card can go to
    for (let i = 0; i < 4; i++) {
      if (this.canPlaceOnFoundation(card, i)) {
        this.saveSnapshot();
        this.removeCardsFromSource(location, 1);
        this.state.foundations[i].push({ ...card, faceUp: true });
        this.audio.playGame('solitaire', 'place');
        this.autoFlipColumns();
        this.checkWin();
        this.updateScene();

        if (!this.gameOver && this.allCardsFaceUp()) {
          this.autoComplete();
        }
        return;
      }
    }
  }

  // --- Draw pile ---

  private drawCards(): void {
    this.saveSnapshot();

    if (this.state.drawPile.length === 0) {
      if (this.state.wastePile.length === 0) {
        this.history.pop();
        return;
      }
      this.state.drawPile = this.state.wastePile.reverse().map(c => ({ ...c, faceUp: false }));
      this.state.wastePile = [];
      this.audio.playGame('solitaire', 'slide');
    } else {
      const count = Math.min(this.drawMode, this.state.drawPile.length);
      for (let i = 0; i < count; i++) {
        const card = this.state.drawPile.pop()!;
        card.faceUp = true;
        this.state.wastePile.push(card);
      }
      this.audio.playGame('solitaire', 'flip');
    }

    this.updateScene();
  }

  // --- Move validation and execution ---

  private tryMove(from: CardLocation, to: CardLocation): boolean {
    const cards = this.getCardsFromLocation(from);
    if (!cards || cards.length === 0) return false;

    if (to.type === 'foundation') {
      if (cards.length !== 1) return false;
      return this.moveToFoundation(from, to.pileIndex, cards[0]);
    }

    if (to.type === 'column') {
      return this.moveToColumn(from, to.colIndex, cards);
    }

    return false;
  }

  private getCardsFromLocation(location: CardLocation): SolCard[] | null {
    if (location.type === 'waste') {
      if (this.state.wastePile.length === 0) return null;
      return [this.state.wastePile[this.state.wastePile.length - 1]];
    }
    if (location.type === 'foundation') {
      const pile = this.state.foundations[location.pileIndex];
      if (pile.length === 0) return null;
      return [pile[pile.length - 1]];
    }
    if (location.type === 'column') {
      const col = this.state.columns[location.colIndex];
      if (location.cardIndex >= col.length) return null;
      return col.slice(location.cardIndex);
    }
    return null;
  }

  private moveToFoundation(from: CardLocation, pileIndex: number, card: SolCard): boolean {
    const pile = this.state.foundations[pileIndex];
    const expectedSuit = this.FOUNDATION_SUIT_ORDER[pileIndex];

    if (card.suit !== expectedSuit) return false;

    if (pile.length === 0) {
      if (card.value !== 1) return false;
    } else {
      const topCard = pile[pile.length - 1];
      if (card.value !== topCard.value + 1) return false;
    }

    this.removeCardFromSource(from);
    pile.push({ ...card, faceUp: true });
    return true;
  }

  private moveToColumn(from: CardLocation, colIndex: number, cards: SolCard[]): boolean {
    const targetCol = this.state.columns[colIndex];
    const movingCard = cards[0];

    if (targetCol.length === 0) {
      if (movingCard.value !== 13) return false;
    } else {
      const topCard = targetCol[targetCol.length - 1];
      if (!topCard.faceUp) return false;
      if (movingCard.value !== topCard.value - 1) return false;
      if (!this.isOppositeColor(movingCard, topCard)) return false;
    }

    this.removeCardsFromSource(from, cards.length);
    for (const card of cards) {
      targetCol.push({ ...card, faceUp: true });
    }
    return true;
  }

  private removeCardFromSource(location: CardLocation): void {
    this.removeCardsFromSource(location, 1);
  }

  private removeCardsFromSource(location: CardLocation, count: number): void {
    if (location.type === 'waste') {
      this.state.wastePile.pop();
    } else if (location.type === 'foundation') {
      this.state.foundations[location.pileIndex].pop();
    } else if (location.type === 'column') {
      this.state.columns[location.colIndex].splice(location.cardIndex, count);
    }
  }

  private isOppositeColor(a: SolCard, b: SolCard): boolean {
    const isRed = (s: string) => s === 'hearts' || s === 'diamonds';
    return isRed(a.suit) !== isRed(b.suit);
  }

  // --- Auto-flip face-down cards when exposed ---

  private autoFlipColumns(): void {
    for (const col of this.state.columns) {
      if (col.length > 0 && !col[col.length - 1].faceUp) {
        col[col.length - 1].faceUp = true;
      }
    }
  }

  // --- Valid targets for highlighting ---

  private getValidTargets(from: CardLocation): CardLocation[] {
    const targets: CardLocation[] = [];
    const cards = this.getCardsFromLocation(from);
    if (!cards || cards.length === 0) return targets;

    const movingCard = cards[0];

    // Check foundations (only single cards)
    if (cards.length === 1) {
      for (let i = 0; i < 4; i++) {
        if (this.canPlaceOnFoundation(movingCard, i)) {
          targets.push({ type: 'foundation', pileIndex: i });
        }
      }
    }

    // Check columns
    for (let col = 0; col < 7; col++) {
      if (from.type === 'column' && from.colIndex === col) continue;

      const targetCol = this.state.columns[col];
      if (targetCol.length === 0) {
        if (movingCard.value === 13) {
          targets.push({ type: 'column', colIndex: col, cardIndex: 0 });
        }
      } else {
        const topCard = targetCol[targetCol.length - 1];
        if (topCard.faceUp && movingCard.value === topCard.value - 1 && this.isOppositeColor(movingCard, topCard)) {
          targets.push({ type: 'column', colIndex: col, cardIndex: targetCol.length });
        }
      }
    }

    return targets;
  }

  // --- Win detection ---

  private checkWin(): void {
    const totalFoundation = this.state.foundations.reduce((sum, pile) => sum + pile.length, 0);
    if (totalFoundation === 52) {
      this.gameOver = true;
      this.won = true;
      this.audio.playGame('solitaire', 'win');
      this.scene.showWin();
    }
  }

  // --- Auto-complete when all cards face-up ---

  private allCardsFaceUp(): boolean {
    if (this.state.drawPile.length > 0) return false;
    if (this.state.wastePile.length > 0) return false;

    for (const col of this.state.columns) {
      for (const card of col) {
        if (!card.faceUp) return false;
      }
    }
    return true;
  }

  private autoComplete(): void {
    this.scene.lockInput();

    const doStep = () => {
      if (this.gameOver) {
        this.scene.unlockInput();
        return;
      }

      let moved = false;

      // Try waste to foundations
      if (this.state.wastePile.length > 0) {
        const card = this.state.wastePile[this.state.wastePile.length - 1];
        for (let i = 0; i < 4; i++) {
          if (this.canPlaceOnFoundation(card, i)) {
            this.state.wastePile.pop();
            this.state.foundations[i].push({ ...card, faceUp: true });
            moved = true;
            break;
          }
        }
      }

      // Try columns to foundations
      if (!moved) {
        for (const col of this.state.columns) {
          if (col.length === 0) continue;
          const card = col[col.length - 1];
          for (let i = 0; i < 4; i++) {
            if (this.canPlaceOnFoundation(card, i)) {
              col.pop();
              this.state.foundations[i].push({ ...card, faceUp: true });
              moved = true;
              break;
            }
          }
          if (moved) break;
        }
      }

      if (moved) {
        this.audio.playGame('solitaire', 'place');
        this.updateScene();
        this.checkWin();
        if (!this.gameOver) {
          setTimeout(doStep, 150);
        } else {
          this.scene.unlockInput();
        }
      } else {
        this.scene.unlockInput();
      }
    };

    setTimeout(doStep, 300);
  }

  private canPlaceOnFoundation(card: SolCard, pileIndex: number): boolean {
    const pile = this.state.foundations[pileIndex];
    const expectedSuit = this.FOUNDATION_SUIT_ORDER[pileIndex];
    if (card.suit !== expectedSuit) return false;
    if (pile.length === 0) return card.value === 1;
    return card.value === pile[pile.length - 1].value + 1;
  }

  // --- Scene updates ---

  private updateScene(): void {
    if (!this.sceneReady) {
      this.pendingRender = true;
      return;
    }
    const visualState: SolitaireVisualState = {
      columns: this.state.columns.map(col => col.map(c => ({ ...c }))),
      foundations: this.state.foundations.map(pile => pile.map(c => ({ ...c }))),
      drawPile: this.state.drawPile.length,
      wastePile: this.state.wastePile.map(c => ({ ...c })),
      gameOver: this.gameOver,
      won: this.won
    };
    this.scene.updateState(visualState);
  }

  // --- Public methods for template ---

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.won = false;
    this.history = [];

    this.deal();
    this.updateScene();
  }

  newGame(): void {
    this.startGame();
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }
  }
}
