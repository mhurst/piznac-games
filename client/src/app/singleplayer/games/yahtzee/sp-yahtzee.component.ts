import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import Phaser from 'phaser';
import { YahtzeeScene, YahtzeeVisualState, YahtzeePlayerState } from '../../../games/yahtzee/yahtzee.scene';
import { AudioService } from '../../../core/audio/audio.service';
import { YahtzeeAI } from '../../../core/ai/yahtzee.ai';

type ScoreCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'chance' | 'yahtzee';

const ALL_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'chance', 'yahtzee'
];

const TOP_CATS: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

@Component({
  selector: 'app-sp-yahtzee',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule, TitleCasePipe],
  templateUrl: './sp-yahtzee.component.html',
  styleUrl: './sp-yahtzee.component.scss'
})
export class SpYahtzeeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: YahtzeeScene;
  private ai = new YahtzeeAI();

  // Current dice (shared display — whoever is rolling)
  private dice: number[] = [0, 0, 0, 0, 0];
  private held: boolean[] = [false, false, false, false, false];
  private rollsLeft = 3;

  // Player state
  private playerScores: Record<string, number | null> = {};
  private currentScores: Record<string, number> = {};

  // AI state
  private aiScores: Record<string, number | null> = {};
  difficulty = 'medium';

  // Game flow
  private turn = 1;
  private isPlayerTurn = true;
  private aiPlaying = false;

  // UI state
  gameStarted = false;
  gameOver = false;

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new YahtzeeScene();
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 900,
      height: 600,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });
    this.scene.onReady = () => this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.scene.onDieClick = (index: number) => this.toggleHold(index);
    this.scene.onRollClick = () => this.roll();
    this.scene.onScoreClick = (category: string) => this.lockScore(category as ScoreCategory);
  }

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.turn = 1;
    this.isPlayerTurn = true;
    this.aiPlaying = false;
    this.resetDice();
    this.currentScores = {};

    this.playerScores = {};
    this.aiScores = {};
    for (const cat of ALL_CATEGORIES) {
      this.playerScores[cat] = null;
      this.aiScores[cat] = null;
    }

    this.scene.resetGame();
    this.updateScene();
  }

  // --- Player Actions ---

  private roll(): void {
    if (!this.isPlayerTurn || this.rollsLeft <= 0 || this.gameOver || this.aiPlaying) return;
    this.rollsLeft--;
    const newDice = [...this.dice];
    for (let i = 0; i < 5; i++) {
      if (!this.held[i]) newDice[i] = this.randomDie();
    }
    this.audio.playGame('yahtzee', 'roll');
    this.scene.animateRoll(newDice, this.held, () => {
      this.dice = newDice;
      this.currentScores = this.calculateAllScores(this.dice, this.playerScores);
      this.updateScene();
    });
  }

  private toggleHold(index: number): void {
    if (!this.isPlayerTurn || this.rollsLeft >= 3 || this.rollsLeft <= 0 || this.gameOver || this.aiPlaying) return;
    this.held[index] = !this.held[index];
    this.audio.playGame('yahtzee', 'hold');
    this.updateScene();
  }

  private lockScore(category: ScoreCategory): void {
    if (!this.isPlayerTurn || this.rollsLeft >= 3 || this.gameOver || this.aiPlaying) return;
    if (this.playerScores[category] !== null) return;
    const score = this.currentScores[category];
    if (score === undefined) return;

    this.playerScores[category] = score;
    this.audio.playGame('yahtzee', 'score');
    this.scene.flashScoreRow(category, 0);

    // Check if game is over (both players filled all 13)
    if (this.allFilled(this.playerScores) && this.allFilled(this.aiScores)) {
      this.endGame();
      return;
    }

    // AI turn
    this.resetDice();
    this.currentScores = {};
    this.isPlayerTurn = false;
    this.updateScene();
    setTimeout(() => this.doAiTurn(), 1200);
  }

  // --- AI Turn ---

  private doAiTurn(): void {
    this.aiPlaying = true;
    this.rollsLeft = 3;
    this.resetDice();
    this.updateScene();

    // AI roll 1
    this.aiRoll(() => {
      // AI decides holds
      const holds = this.ai.getHoldDecision(this.dice, this.aiScores, this.difficulty);
      this.held = holds;
      this.updateScene();

      // Check if AI wants to stop
      if (this.ai.shouldStopRolling(this.dice, this.aiScores, this.difficulty) || this.rollsLeft <= 0) {
        setTimeout(() => this.aiPickScore(), 1500);
        return;
      }

      // AI roll 2
      setTimeout(() => {
        this.aiRoll(() => {
          const holds2 = this.ai.getHoldDecision(this.dice, this.aiScores, this.difficulty);
          this.held = holds2;
          this.updateScene();

          if (this.ai.shouldStopRolling(this.dice, this.aiScores, this.difficulty) || this.rollsLeft <= 0) {
            setTimeout(() => this.aiPickScore(), 1500);
            return;
          }

          // AI roll 3
          setTimeout(() => {
            this.aiRoll(() => {
              setTimeout(() => this.aiPickScore(), 1500);
            });
          }, 1400);
        });
      }, 1400);
    });
  }

  private aiRoll(callback: () => void): void {
    if (this.rollsLeft <= 0) { callback(); return; }
    this.rollsLeft--;
    const newDice = [...this.dice];
    for (let i = 0; i < 5; i++) {
      if (!this.held[i]) newDice[i] = this.randomDie();
    }
    this.audio.playGame('yahtzee', 'roll');
    this.scene.animateRoll(newDice, this.held, () => {
      this.dice = newDice;
      this.updateScene();
      setTimeout(callback, 1000);
    });
  }

  private aiPickScore(): void {
    const category = this.ai.getScoreDecision(this.dice, this.aiScores, this.difficulty) as ScoreCategory;
    const score = this.ai.calculateScore(category, this.dice);
    this.aiScores[category] = score;
    this.audio.playGame('yahtzee', 'score');
    this.scene.flashScoreRow(category, 1);

    // Check if game over
    if (this.allFilled(this.playerScores) && this.allFilled(this.aiScores)) {
      setTimeout(() => this.endGame(), 500);
      return;
    }

    // Advance round
    this.turn++;
    this.resetDice();
    this.currentScores = {};
    this.isPlayerTurn = true;
    this.aiPlaying = false;
    this.updateScene();
  }

  // --- Score Calculation ---

  private calculateAllScores(dice: number[], locked: Record<string, number | null>): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const cat of ALL_CATEGORIES) {
      if (locked[cat] === null) {
        scores[cat] = this.calculateScore(cat, dice);
      }
    }
    return scores;
  }

  private calculateScore(category: ScoreCategory, dice: number[]): number {
    const counts = this.getCounts(dice);
    const sum = dice.reduce((a, b) => a + b, 0);
    const maxCount = Math.max(...counts);

    switch (category) {
      case 'ones': return counts[1] * 1;
      case 'twos': return counts[2] * 2;
      case 'threes': return counts[3] * 3;
      case 'fours': return counts[4] * 4;
      case 'fives': return counts[5] * 5;
      case 'sixes': return counts[6] * 6;
      case 'threeOfAKind': return maxCount >= 3 ? sum : 0;
      case 'fourOfAKind': return maxCount >= 4 ? sum : 0;
      case 'fullHouse': {
        const has3 = Object.values(counts).some(c => c === 3);
        const has2 = Object.values(counts).some(c => c === 2);
        return has3 && has2 ? 25 : 0;
      }
      case 'smallStraight': return this.hasConsecutive(dice, 4) ? 30 : 0;
      case 'largeStraight': return this.hasConsecutive(dice, 5) ? 40 : 0;
      case 'chance': return sum;
      case 'yahtzee': return maxCount === 5 ? 50 : 0;
      default: return 0;
    }
  }

  private getCounts(dice: number[]): number[] {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) counts[d]++;
    return counts;
  }

  private hasConsecutive(dice: number[], needed: number): boolean {
    const unique = new Set(dice);
    const sequences = needed === 4
      ? [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]
      : [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
    return sequences.some(seq => seq.every(n => unique.has(n)));
  }

  private getTopTotal(scores: Record<string, number | null>): number {
    let total = 0;
    for (const cat of TOP_CATS) {
      if (scores[cat] !== null) total += scores[cat]!;
    }
    return total;
  }

  private getTotal(scores: Record<string, number | null>): number {
    let total = 0;
    for (const cat of ALL_CATEGORIES) {
      if (scores[cat] !== null) total += scores[cat]!;
    }
    if (this.getTopTotal(scores) >= 63) total += 35;
    return total;
  }

  private makePlayerState(name: string, scores: Record<string, number | null>): YahtzeePlayerState {
    const topTotal = this.getTopTotal(scores);
    return {
      name,
      lockedScores: scores,
      topTotal,
      topBonus: topTotal >= 63,
      totalScore: this.getTotal(scores)
    };
  }

  // --- Helpers ---

  private resetDice(): void {
    this.dice = [0, 0, 0, 0, 0];
    this.held = [false, false, false, false, false];
    this.rollsLeft = 3;
  }

  private randomDie(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private allFilled(scores: Record<string, number | null>): boolean {
    return ALL_CATEGORIES.every(c => scores[c] !== null);
  }

  private endGame(): void {
    this.gameOver = true;
    this.aiPlaying = false;
    const playerState = this.makePlayerState('You', this.playerScores);
    const aiState = this.makePlayerState('CPU', this.aiScores);
    this.updateScene();
    const winnerIndex = playerState.totalScore >= aiState.totalScore ? 0 : 1;
    setTimeout(() => this.scene.showGameOver([playerState, aiState], winnerIndex), 400);
  }

  private updateScene(): void {
    const state: YahtzeeVisualState = {
      dice: this.dice,
      held: this.held,
      rollsLeft: this.rollsLeft,
      round: this.turn,
      currentScores: this.currentScores,
      players: [
        this.makePlayerState('You', this.playerScores),
        this.makePlayerState('CPU', this.aiScores)
      ],
      currentPlayerIndex: this.isPlayerTurn ? 0 : 1,
      myIndex: 0,
      isMyTurn: this.isPlayerTurn
    };
    this.scene.updateState(state);
  }

  // --- UI ---

  newGame(): void {
    this.startGame();
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
