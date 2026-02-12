import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import Phaser from 'phaser';
import { GoFishScene } from '../../../games/go-fish/go-fish.scene';
import {
  GoFishCard, GoFishVisualState, GoFishPlayer, GoFishPhase, GoFishLastAction,
  RANKS
} from '../../../games/go-fish/go-fish-types';
import { getAIDecision, updateAIMemory, getAIDelay, GoFishAIContext } from '../../../core/ai/go-fish.ai';
import { getRandomAINames } from '../../../core/ai/ai-names';
import { AudioService } from '../../../core/audio/audio.service';

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
}

interface Player {
  id: string;
  name: string;
  hand: Card[];
  books: string[];
  isAI: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
}

@Component({
  selector: 'app-sp-go-fish',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatSelectModule, MatFormFieldModule, FormsModule],
  templateUrl: './sp-go-fish.component.html',
  styleUrl: './sp-go-fish.component.scss'
})
export class SpGoFishComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: GoFishScene;

  // Deck
  private deck: Card[] = [];

  // Players
  private players: Player[] = [];
  private currentPlayerIndex = 0;

  // Game state
  private phase: GoFishPhase = 'waiting';
  private lastAction: GoFishLastAction | null = null;
  private aiTimeouts: any[] = [];

  // AI memory for medium/hard
  private aiMemory = new Map<string, Set<string>>();

  // Selection state
  private selectedTargetIndex: number | null = null;
  private selectedRank: string | null = null;

  // UI state
  gameStarted = false;
  gameOver = false;
  aiCount = 1;
  difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new GoFishScene();
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
    this.scene.onPlayerClick = (index: number) => {
      if (this.phase !== 'playing') return;
      if (this.currentPlayerIndex !== 0) return; // not human's turn
      this.selectedTargetIndex = index;
      this.updateScene();
    };

    this.scene.onRankClick = (rank: string) => {
      if (this.phase !== 'playing') return;
      if (this.currentPlayerIndex !== 0) return;
      this.selectedRank = rank;
      this.updateScene();
    };

    this.scene.onAskClick = () => {
      if (this.phase !== 'playing') return;
      if (this.currentPlayerIndex !== 0) return;
      if (this.selectedTargetIndex === null || this.selectedRank === null) return;
      this.executeAsk(0, this.selectedTargetIndex, this.selectedRank);
    };
  }

  // --- Deck Management ---

  private createDeck(): Card[] {
    const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const deck: Card[] = [];
    for (const suit of suits) {
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
    this.lastAction = null;
    this.selectedTargetIndex = null;
    this.selectedRank = null;
    this.aiMemory.clear();

    // Create deck
    this.deck = this.shuffleDeck(this.createDeck());

    // Create players
    const aiNames = getRandomAINames(this.aiCount);
    this.players = [
      { id: 'human', name: 'YOU', hand: [], books: [], isAI: false, difficulty: this.difficulty }
    ];
    for (let i = 0; i < this.aiCount; i++) {
      this.players.push({
        id: `ai-${i}`,
        name: aiNames[i],
        hand: [],
        books: [],
        isAI: true,
        difficulty: this.difficulty
      });
    }

    // Deal cards
    const cardsEach = this.players.length <= 2 ? 7 : 5;
    for (let i = 0; i < cardsEach; i++) {
      for (const player of this.players) {
        player.hand.push(this.deck.pop()!);
      }
    }

    // Check initial books
    for (const player of this.players) {
      this.checkAndRemoveBooks(player);
    }

    this.currentPlayerIndex = 0;
    this.phase = 'playing';
    this.scene.resetGame();
    this.updateScene('Your turn — pick a player and a rank!');
  }

  // --- Core Game Logic ---

  private executeAsk(askerIdx: number, targetIdx: number, rank: string): void {
    const asker = this.players[askerIdx];
    const target = this.players[targetIdx];

    // Find matching cards
    const matchingCards = target.hand.filter(c => c.value === rank);
    const gotCards = matchingCards.length > 0;
    let drewMatch = false;
    let anotherTurn = false;
    let newBook: string | null = null;

    if (gotCards) {
      // Transfer cards
      target.hand = target.hand.filter(c => c.value !== rank);
      asker.hand.push(...matchingCards);
      anotherTurn = true;
      this.audio.playGame('go-fish', 'give');
    } else {
      // Go Fish — draw from deck
      this.audio.playGame('go-fish', 'fish');
      if (this.deck.length > 0) {
        const drawnCard = this.deck.pop()!;
        asker.hand.push(drawnCard);
        drewMatch = drawnCard.value === rank;
        if (drewMatch) {
          anotherTurn = true;
        }
      }
    }

    // Check for new books
    newBook = this.checkAndRemoveBooks(asker);
    if (newBook) {
      this.audio.playGame('go-fish', 'book');
    }

    // Handle empty hands
    this.handleEmptyHand(asker);
    this.handleEmptyHand(target);

    // Update AI memory
    updateAIMemory(this.aiMemory, asker.id, target.id, rank, gotCards, newBook);

    // Build last action
    this.lastAction = {
      askerId: asker.id,
      askerName: asker.name,
      targetId: target.id,
      targetName: target.name,
      rank,
      gotCards,
      cardsGiven: matchingCards.length,
      drewMatch,
      newBook: newBook || undefined
    };

    // Build message
    let message = '';
    if (askerIdx === 0) {
      // Human's ask
      if (gotCards) {
        message = `${target.name} gave you ${matchingCards.length} ${rank}(s)!`;
      } else {
        message = `Go Fish!${drewMatch ? ` You drew a ${rank}!` : ''}`;
      }
      if (newBook) {
        message += ` Book of ${newBook}s!`;
      }
    } else {
      // AI's ask
      if (gotCards) {
        message = `${asker.name} took ${matchingCards.length} ${rank}(s) from ${targetIdx === 0 ? 'you' : target.name}!`;
      } else {
        message = `${asker.name} asked for ${rank}s — Go Fish!`;
      }
      if (newBook) {
        message += ` ${asker.name} made a book of ${newBook}s!`;
      }
    }

    // Check game end
    if (this.checkGameEnd()) {
      this.phase = 'gameOver';
      this.gameOver = true;
      const winner = this.getWinner();
      const winMessage = winner.isDraw ? 'It\'s a tie!'
        : (winner.winnerId === 'human' ? 'You win!' : `${this.players.find(p => p.id === winner.winnerId)?.name} wins!`);
      this.updateScene(message);
      setTimeout(() => {
        this.scene.showGameOver(winMessage, `${winner.maxBooks} books`);
      }, 1500);
      return;
    }

    // Reset selection for human
    if (askerIdx === 0) {
      this.selectedTargetIndex = null;
      this.selectedRank = null;
    }

    if (!anotherTurn) {
      this.advanceTurn();
    }

    this.updateScene(message);

    // If it's now an AI's turn, schedule their move
    if (this.phase === 'playing' && this.players[this.currentPlayerIndex].isAI) {
      this.scheduleAITurn();
    }
  }

  private checkAndRemoveBooks(player: Player): string | null {
    let newBook: string | null = null;
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

  private handleEmptyHand(player: Player): void {
    if (player.hand.length === 0 && this.deck.length > 0) {
      player.hand.push(this.deck.pop()!);
    }
  }

  private checkGameEnd(): boolean {
    // All 13 books made
    let totalBooks = 0;
    for (const p of this.players) {
      totalBooks += p.books.length;
    }
    if (totalBooks === 13) return true;

    // All players have empty hands and deck is empty
    if (this.deck.length === 0 && this.players.every(p => p.hand.length === 0)) return true;

    return false;
  }

  private getWinner(): { winnerId: string | null; isDraw: boolean; maxBooks: number } {
    let maxBooks = 0;
    let winnerId: string | null = null;
    let isDraw = false;

    for (const p of this.players) {
      if (p.books.length > maxBooks) {
        maxBooks = p.books.length;
        winnerId = p.id;
        isDraw = false;
      } else if (p.books.length === maxBooks && winnerId !== null) {
        isDraw = true;
      }
    }

    return { winnerId: isDraw ? null : winnerId, isDraw, maxBooks };
  }

  private advanceTurn(): void {
    let attempts = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      attempts++;
      const player = this.players[this.currentPlayerIndex];
      if (player.hand.length > 0) break;
      if (this.deck.length > 0) {
        this.handleEmptyHand(player);
        break;
      }
    } while (attempts < this.players.length);
  }

  // --- AI Turn ---

  private scheduleAITurn(): void {
    if (this.phase !== 'playing') return;
    const player = this.players[this.currentPlayerIndex];
    if (!player.isAI) return;

    const timeout = setTimeout(() => {
      if (this.phase !== 'playing') return;

      const context: GoFishAIContext = {
        hand: player.hand as GoFishCard[],
        players: this.players.map(p => ({
          id: p.id,
          cardCount: p.hand.length,
          books: p.books
        })),
        myId: player.id,
        difficulty: player.difficulty,
        memory: this.aiMemory
      };

      const decision = getAIDecision(context);
      if (!decision) {
        // No valid move, advance turn
        this.advanceTurn();
        this.updateScene(`${player.name} has no valid moves`);
        if (this.players[this.currentPlayerIndex].isAI) {
          this.scheduleAITurn();
        }
        return;
      }

      const targetIdx = this.players.findIndex(p => p.id === decision.targetId);
      if (targetIdx === -1) return;

      this.executeAsk(this.currentPlayerIndex, targetIdx, decision.rank);
    }, getAIDelay());

    this.aiTimeouts.push(timeout);
  }

  // --- Scene Updates ---

  private updateScene(message?: string): void {
    const isMyTurn = this.currentPlayerIndex === 0 && this.phase === 'playing';
    const displayMessage = message ||
      (isMyTurn ? 'Your turn — pick a player and a rank!' :
        (this.phase === 'playing' ? `${this.players[this.currentPlayerIndex].name} is thinking...` : ''));

    const visualPlayers: GoFishPlayer[] = this.players.map(p => ({
      id: p.id,
      name: p.name,
      hand: p.hand.map(c => ({ suit: c.suit, value: c.value })),
      books: p.books,
      cardCount: p.hand.length,
      isActive: p === this.players[this.currentPlayerIndex] && this.phase === 'playing',
      isAI: p.isAI,
      difficulty: p.difficulty
    }));

    const state: GoFishVisualState = {
      phase: this.phase,
      players: visualPlayers,
      myIndex: 0,
      currentPlayerIndex: this.currentPlayerIndex,
      deckCount: this.deck.length,
      message: displayMessage,
      isMyTurn,
      canAsk: isMyTurn && this.selectedTargetIndex !== null && this.selectedRank !== null,
      selectedTargetIndex: this.selectedTargetIndex,
      selectedRank: this.selectedRank,
      lastAction: this.lastAction,
      newBook: this.lastAction?.newBook || null
    };

    this.scene.updateState(state);
  }

  // --- UI Actions ---

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
