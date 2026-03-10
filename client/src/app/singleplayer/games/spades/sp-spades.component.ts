import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { SpadesScene } from '../../../games/spades/spades.scene';
import { AudioService } from '../../../core/audio/audio.service';
import { getRandomAINames } from '../../../core/ai/ai-names';
import { getAIBid, getAIPlay, getLegalPlays, getAIDelay, AIContext } from '../../../core/ai/spades.ai';
import {
  SpadesCard, Suit, SpadesPhase, PlayerBid, SpadesPlayer, TeamScore,
  TrickCard, SpadesVisualState, RoundSummary,
  CARD_VALUES, SUIT_ORDER, SUITS, VALUES, TEAM_FOR_SEAT, SEAT_LABELS
} from '../../../games/spades/spades-types';

type Difficulty = 'easy' | 'medium' | 'hard';

@Component({
  selector: 'app-sp-spades',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-spades.component.html',
  styleUrl: './sp-spades.component.scss'
})
export class SpSpadesComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: SpadesScene;

  // Game state
  gameStarted = false;
  gameOver = false;
  difficulty: Difficulty = 'medium';
  round = 0;
  dealer = -1; // will be set on start

  private players: SpadesPlayer[] = [];
  private teamScores: [TeamScore, TeamScore] = [{ score: 0, bags: 0 }, { score: 0, bags: 0 }];
  private deck: SpadesCard[] = [];
  private phase: SpadesPhase = 'setup';
  private currentPlayer = 0;
  private currentTrick: TrickCard[] = [];
  private trickLeader = 0;
  private spadesbroken = false;
  private isFirstLead = false;
  private playedCards: SpadesCard[] = [];
  private voids: Set<string>[] = [new Set(), new Set(), new Set(), new Set()];
  private roundSummary: RoundSummary | null = null;
  private gameWinner: string | null = null;
  private isProcessing = false;
  private aiNames: string[] = [];
  private trickCount = 0;
  private blindNilOffer = false; // true when offering blind nil before showing cards
  private aiTimeouts: any[] = [];

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new SpadesScene();
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
    this.scene.onCardClick = (idx: number) => this.playCard(idx);
    this.scene.onBidSelect = (bid: number) => this.handleBid(bid);
  }

  // ──── deck ────

  private createDeck(): SpadesCard[] {
    const deck: SpadesCard[] = [];
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value });
      }
    }
    return deck;
  }

  private shuffleDeck(deck: SpadesCard[]): SpadesCard[] {
    const s = [...deck];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s;
  }

  // ──── game start ────

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.aiNames = getRandomAINames(3);
    this.teamScores = [{ score: 0, bags: 0 }, { score: 0, bags: 0 }];
    this.round = 0;
    this.dealer = Math.floor(Math.random() * 4);
    this.gameWinner = null;

    this.players = [
      { name: 'You', seat: 0, hand: [], bid: null, tricksWon: 0, isAI: false, difficulty: this.difficulty },
      { name: this.aiNames[0], seat: 1, hand: [], bid: null, tricksWon: 0, isAI: true, difficulty: this.difficulty },
      { name: this.aiNames[1], seat: 2, hand: [], bid: null, tricksWon: 0, isAI: true, difficulty: this.difficulty },
      { name: this.aiNames[2], seat: 3, hand: [], bid: null, tricksWon: 0, isAI: true, difficulty: this.difficulty },
    ];

    this.scene.resetGame();
    this.startRound();
  }

  // ──── round flow ────

  private startRound(): void {
    this.round++;
    this.dealer = (this.dealer + 1) % 4;
    this.spadesbroken = false;
    this.isFirstLead = true;
    this.playedCards = [];
    this.voids = [new Set(), new Set(), new Set(), new Set()];
    this.currentTrick = [];
    this.roundSummary = null;
    this.trickCount = 0;

    for (const p of this.players) {
      p.hand = [];
      p.bid = null;
      p.tricksWon = 0;
    }

    // Deal
    this.deck = this.shuffleDeck(this.createDeck());
    for (let i = 0; i < 52; i++) {
      this.players[i % 4].hand.push(this.deck[i]);
    }

    // Sort hands
    for (const p of this.players) {
      p.hand = this.sortHand(p.hand);
    }

    this.audio.playGame('spades', 'deal');

    // Always offer blind nil before anything else
    this.phase = 'bidding';
    this.currentPlayer = (this.dealer + 1) % 4;
    this.blindNilOffer = true;
    this.updateScene('Blind Nil? (Bid before seeing your cards)');
  }

  private sortHand(hand: SpadesCard[]): SpadesCard[] {
    return [...hand].sort((a, b) => {
      const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return s !== 0 ? s : CARD_VALUES[a.value] - CARD_VALUES[b.value];
    });
  }

  // ──── bidding ────

  private handleBid(bid: number): void {
    if (this.phase !== 'bidding' || this.isProcessing) return;

    // Blind nil offer phase (shown before any bidding starts)
    if (this.blindNilOffer) {
      if (bid === -1) {
        // Accepted blind nil
        this.isProcessing = true;
        this.blindNilOffer = false;
        this.players[0].bid = { amount: 0, blind: true };
        // If human isn't first bidder, start AI bidding from the actual first bidder
        if (this.currentPlayer !== 0) {
          this.isProcessing = false;
          this.updateScene('Bidding...');
          this.processAITurnIfNeeded();
        } else {
          this.advanceBidding();
        }
      } else if (bid === -2) {
        // Declined — show cards, start normal bidding from correct player
        this.blindNilOffer = false;
        if (this.currentPlayer === 0) {
          this.updateScene('Your bid');
        } else {
          this.updateScene('Bidding...');
          this.processAITurnIfNeeded();
        }
      }
      return;
    }

    if (this.currentPlayer !== 0) return;
    this.isProcessing = true;
    this.players[0].bid = { amount: bid, blind: false };
    this.advanceBidding();
  }

  private advanceBidding(): void {
    // Find next player who hasn't bid
    let next = (this.currentPlayer + 1) % 4;
    let checked = 0;
    while (checked < 4 && this.players[next].bid !== null) {
      next = (next + 1) % 4;
      checked++;
    }

    if (checked >= 4 || this.players.every(p => p.bid !== null)) {
      // All bids in — start playing
      this.phase = 'playing';
      this.trickLeader = (this.dealer + 1) % 4;
      this.currentPlayer = this.trickLeader;
      this.isProcessing = false;
      this.updateScene('Play a card');
      this.processAITurnIfNeeded();
      return;
    }

    this.currentPlayer = next;
    this.isProcessing = false;

    if (next === 0) {
      this.updateScene('Your bid');
    } else {
      this.updateScene('Bidding...');
      this.processAITurnIfNeeded();
    }
  }

  // ──── playing ────

  private playCard(handIndex: number): void {
    if (this.phase !== 'playing' || this.currentPlayer !== 0 || this.isProcessing) return;

    const legal = this.getLegalPlaysForPlayer(0);
    const card = this.players[0].hand[handIndex];
    if (!legal.some(c => c.suit === card.suit && c.value === card.value)) return;

    this.isProcessing = true;
    this.executePlay(0, handIndex);
  }

  private executePlay(seat: number, handIndex: number): void {
    const player = this.players[seat];
    if (handIndex < 0 || handIndex >= player.hand.length) {
      this.isProcessing = false;
      return;
    }
    const card = player.hand.splice(handIndex, 1)[0];

    // Track void detection
    const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    if (ledSuit && card.suit !== ledSuit) {
      this.voids[seat].add(ledSuit);
    }

    // Check if spades broken
    if (card.suit === 'spades' && !this.spadesbroken) {
      this.spadesbroken = true;
    }

    this.currentTrick.push({ seat, card });
    this.playedCards.push(card);
    this.isFirstLead = false;

    this.audio.playGame('spades', 'play');

    if (this.currentTrick.length === 4) {
      // Trick complete — keep isProcessing true until resolved
      this.updateScene('');
      const t = setTimeout(() => this.resolveTrick(), 800);
      this.aiTimeouts.push(t);
    } else {
      this.currentPlayer = (this.currentPlayer + 1) % 4;
      this.isProcessing = false;
      this.updateScene('');
      this.processAITurnIfNeeded();
    }
  }

  private resolveTrick(): void {
    const winner = this.trickWinner(this.currentTrick);
    this.players[winner].tricksWon++;
    this.trickCount++;

    this.audio.playGame('spades', 'trick');

    this.currentTrick = [];
    this.trickLeader = winner;
    this.currentPlayer = winner;

    if (this.trickCount === 13) {
      // Round over
      this.phase = 'roundEnd';
      this.isProcessing = false;
      this.scoreRound();
      return;
    }

    // Keep isProcessing = true during the inter-trick delay to prevent
    // the human from playing during the "wins the trick!" message,
    // which would start a duplicate AI chain and corrupt state.
    this.updateScene(`${this.players[winner].name} wins the trick!`);

    const t = setTimeout(() => {
      this.isProcessing = false;
      this.updateScene('');
      this.processAITurnIfNeeded();
    }, 1000);
    this.aiTimeouts.push(t);
  }

  private trickWinner(trick: TrickCard[]): number {
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
      // If different non-spade suit and not led suit, doesn't beat anything
    }

    return best.seat;
  }

  // ──── scoring ────

  private scoreRound(): void {
    const nilResults: RoundSummary['nilResults'] = [];
    const teamBids: [number, number] = [0, 0];
    const teamTricks: [number, number] = [0, 0];
    const teamDeltas: [number, number] = [0, 0];
    const bagPenalty: [boolean, boolean] = [false, false];

    // Calculate team bids (excluding nil bidders)
    for (const p of this.players) {
      const team = TEAM_FOR_SEAT[p.seat];
      teamTricks[team] += p.tricksWon;

      if (p.bid!.amount === 0) {
        // Nil scoring — per player
        const nilBonus = p.bid!.blind ? 200 : 100;
        if (p.tricksWon === 0) {
          teamDeltas[team] += nilBonus;
          nilResults.push({ seat: p.seat, name: p.name, success: true, blind: p.bid!.blind });
        } else {
          teamDeltas[team] -= nilBonus;
          nilResults.push({ seat: p.seat, name: p.name, success: false, blind: p.bid!.blind });
        }
      } else {
        teamBids[team] += p.bid!.amount;
      }
    }

    // Team bid scoring
    for (let t = 0; t < 2; t++) {
      if (teamBids[t] === 0) continue; // both players bid nil — no team bid
      const tricks = teamTricks[t];
      // Subtract nil-bidders' tricks from team count for bid comparison
      let nilTricks = 0;
      for (const p of this.players) {
        if (TEAM_FOR_SEAT[p.seat] === t && p.bid!.amount === 0) {
          nilTricks += p.tricksWon;
        }
      }
      const relevantTricks = tricks - nilTricks;

      if (relevantTricks >= teamBids[t]) {
        // Made bid
        const overtricks = relevantTricks - teamBids[t];
        teamDeltas[t] += teamBids[t] * 10 + overtricks;
        this.teamScores[t].bags += overtricks;

        // Bag penalty check
        if (this.teamScores[t].bags >= 10) {
          teamDeltas[t] -= 100;
          this.teamScores[t].bags -= 10;
          bagPenalty[t] = true;
        }
      } else {
        // Set (failed bid)
        teamDeltas[t] -= teamBids[t] * 10;
      }
    }

    // Apply deltas
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

    this.updateScene('');

    // Check win condition
    const t = setTimeout(() => this.checkWinCondition(), 100);
    this.aiTimeouts.push(t);
  }

  private checkWinCondition(): void {
    const s0 = this.teamScores[0].score;
    const s1 = this.teamScores[1].score;

    // Check for loss at -200
    if (s0 <= -200 && s1 <= -200) {
      this.gameWinner = s0 > s1 ? 'Your Team' : s0 < s1 ? 'Opponents' : 'Your Team';
    } else if (s0 <= -200) {
      this.gameWinner = 'Opponents';
    } else if (s1 <= -200) {
      this.gameWinner = 'Your Team';
    } else if (s0 >= 500 || s1 >= 500) {
      // Both 500+ — higher wins
      if (s0 >= 500 && s1 >= 500) {
        this.gameWinner = s0 >= s1 ? 'Your Team' : 'Opponents';
      } else if (s0 >= 500) {
        this.gameWinner = 'Your Team';
      } else {
        this.gameWinner = 'Opponents';
      }
    }

    if (this.gameWinner) {
      this.phase = 'gameOver';
      this.gameOver = true;
      this.updateScene('');
    }
  }

  // ──── AI turns ────

  private processAITurnIfNeeded(): void {
    const p = this.players[this.currentPlayer];
    if (!p.isAI) return;

    const t = setTimeout(() => {
      if (this.phase === 'bidding') {
        this.doAIBid(this.currentPlayer);
      } else if (this.phase === 'playing') {
        this.doAIPlay(this.currentPlayer);
      }
    }, getAIDelay());
    this.aiTimeouts.push(t);
  }

  private buildAIContext(seat: number): AIContext {
    return {
      hand: [...this.players[seat].hand],
      seat,
      difficulty: this.players[seat].difficulty,
      bids: this.players.map(p => p.bid),
      tricksWon: this.players.map(p => p.tricksWon),
      spadesbroken: this.spadesbroken,
      currentTrick: [...this.currentTrick],
      trickLeader: this.trickLeader,
      isFirstLead: this.isFirstLead,
      playedCards: [...this.playedCards],
      teamScores: this.teamScores,
      round: this.round,
      voids: this.voids.map(s => new Set(s)),
    };
  }

  private doAIBid(seat: number): void {
    if (this.phase !== 'bidding') return;
    const ctx = this.buildAIContext(seat);
    const bid = getAIBid(ctx);
    this.players[seat].bid = bid;
    this.advanceBidding();
  }

  private doAIPlay(seat: number): void {
    if (this.phase !== 'playing') {
      this.isProcessing = false;
      return;
    }
    this.isProcessing = true;

    const ctx = this.buildAIContext(seat);
    const card = getAIPlay(ctx);

    // Find card index in hand
    const idx = this.players[seat].hand.findIndex(
      c => c.suit === card.suit && c.value === card.value
    );
    if (idx === -1) {
      // Fallback — play first legal card
      const legal = this.getLegalPlaysForPlayer(seat);
      if (legal.length === 0) {
        this.isProcessing = false;
        return;
      }
      const fallbackIdx = this.players[seat].hand.findIndex(
        c => c.suit === legal[0].suit && c.value === legal[0].value
      );
      this.executePlay(seat, fallbackIdx === -1 ? 0 : fallbackIdx);
      return;
    }

    this.executePlay(seat, idx);
  }

  // ──── legal plays ────

  private getLegalPlaysForPlayer(seat: number): SpadesCard[] {
    const ledSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suit : null;
    return getLegalPlays(this.players[seat].hand, ledSuit, this.spadesbroken, this.isFirstLead);
  }

  // ──── scene update ────

  private updateScene(message: string): void {
    const humanHand = this.players[0].hand;
    const legal = this.phase === 'playing' && this.currentPlayer === 0
      ? this.getLegalPlaysForPlayer(0)
      : [];

    const legalIndices = legal.map(lc =>
      humanHand.findIndex(hc => hc.suit === lc.suit && hc.value === lc.value)
    ).filter(i => i !== -1);

    const state: SpadesVisualState = {
      phase: this.phase,
      players: this.players.map(p => ({
        name: p.name,
        seat: p.seat,
        cardCount: p.hand.length,
        bid: p.bid,
        tricksWon: p.tricksWon,
        isCurrentTurn: this.currentPlayer === p.seat,
        isHuman: !p.isAI,
        isPartner: p.seat === 2,
      })),
      humanHand: this.blindNilOffer ? [] : humanHand,
      currentTrick: this.currentTrick,
      teamScores: this.teamScores,
      message,
      round: this.round,
      dealer: this.dealer,
      currentPlayer: this.currentPlayer,
      spadesbroken: this.spadesbroken,
      trickLeader: this.trickLeader,
      roundSummary: this.roundSummary,
      gameWinner: this.gameWinner,
      legalIndices,
      blindNilOffer: this.blindNilOffer,
    };

    this.scene.updateState(state);
  }

  // ──── UI actions ────

  nextRound(): void {
    if (this.isProcessing) return;
    this.roundSummary = null;
    this.startRound();
  }

  get showNextRound(): boolean {
    return this.phase === 'roundEnd' && !this.gameOver;
  }

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
