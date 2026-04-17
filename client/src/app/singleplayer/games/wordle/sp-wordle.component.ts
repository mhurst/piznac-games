import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import Phaser from 'phaser';
import { WordleScene } from '../../../games/wordle/wordle.scene';
import {
  Grid,
  KeyState,
  MAX_GUESSES,
  WORD_LENGTH,
  evaluateGuess,
  makeEmptyGrid,
  tileStateToKeyState,
  upgradeKeyState
} from '../../../games/wordle/wordle-logic';

interface WordleStats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  distribution: number[]; // index 0..MAX_GUESSES-1
}

const STATS_KEY = 'wordle_stats_v1';

function emptyStats(): WordleStats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: Array(MAX_GUESSES).fill(0)
  };
}

@Component({
  selector: 'app-sp-wordle',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './sp-wordle.component.html',
  styleUrl: './sp-wordle.component.scss'
})
export class SpWordleComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  loading = true;
  errorMessage = '';
  stats: WordleStats = emptyStats();

  private validGuesses: Set<string> = new Set();
  private answerPool: string[] = [];
  private phaserGame!: Phaser.Game;
  private scene!: WordleScene;

  private answer = '';
  private grid: Grid = makeEmptyGrid();
  private keyStates: Record<string, KeyState> = {};
  private currentRow = 0;
  private currentCol = 0;
  private status: 'playing' | 'won' | 'lost' = 'playing';

  constructor(private router: Router) {}

  async ngOnInit(): Promise<void> {
    try {
      const [validRes, answersRes] = await Promise.all([
        fetch('assets/wordlists/wordle-valid.txt'),
        fetch('assets/wordlists/wordle-answers.txt')
      ]);
      if (!validRes.ok || !answersRes.ok) throw new Error('Failed to load word lists');
      const validText = await validRes.text();
      const answersText = await answersRes.text();
      this.validGuesses = new Set(
        validText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length === WORD_LENGTH)
      );
      this.answerPool = answersText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length === WORD_LENGTH);
      this.loadStats();
      this.loading = false;
    } catch (e: any) {
      this.errorMessage = e.message || 'Failed to load word lists';
      this.loading = false;
    }
  }

  ngAfterViewInit(): void {
    const waitForReady = () => {
      if (!this.loading && !this.errorMessage && this.gameCanvas) {
        this.initPhaser();
      } else if (this.loading) {
        setTimeout(waitForReady, 50);
      }
    };
    waitForReady();
  }

  private initPhaser(): void {
    this.scene = new WordleScene();
    this.scene.onReady = () => this.startNewGame();
    this.scene.onKey = (key: string) => this.handleKey(key);
    this.scene.onNewGame = () => {
      this.scene.hideOverlay();
      this.startNewGame();
    };
    this.scene.onBackToMenu = () => {
      this.scene.hideOverlay();
      this.leaveGame();
    };

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 900,
      height: 680,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });
  }

  private startNewGame(): void {
    this.answer = this.answerPool[Math.floor(Math.random() * this.answerPool.length)];
    this.grid = makeEmptyGrid();
    this.keyStates = {};
    this.currentRow = 0;
    this.currentCol = 0;
    this.status = 'playing';

    this.scene.setGrid(this.grid);
    this.scene.setKeyStates(this.keyStates);
    this.scene.setInputEnabled(true);
  }

  private handleKey(key: string): void {
    if (this.status !== 'playing') return;

    if (key === 'ENTER') {
      this.commitGuess();
      return;
    }

    if (key === 'BACKSPACE') {
      if (this.currentCol > 0) {
        this.currentCol -= 1;
        this.grid[this.currentRow][this.currentCol] = { letter: '', state: 'empty' };
        this.scene.setGrid(this.grid);
      }
      return;
    }

    if (this.currentCol < WORD_LENGTH) {
      this.grid[this.currentRow][this.currentCol] = { letter: key, state: 'pending' };
      this.currentCol += 1;
      this.scene.setGrid(this.grid);
    }
  }

  private commitGuess(): void {
    if (this.currentCol < WORD_LENGTH) {
      this.scene.showMessage('Not enough letters', '#ff9800', this.currentRow);
      return;
    }

    const guess = this.grid[this.currentRow].map(t => t.letter).join('').toLowerCase();

    if (!this.validGuesses.has(guess)) {
      this.scene.showMessage('Not in word list', '#e94560', this.currentRow);
      return;
    }

    const states = evaluateGuess(guess, this.answer);
    for (let c = 0; c < WORD_LENGTH; c++) {
      const letter = this.grid[this.currentRow][c].letter;
      this.grid[this.currentRow][c] = { letter, state: states[c] };
      const upper = letter.toUpperCase();
      const next = tileStateToKeyState(states[c]);
      this.keyStates[upper] = upgradeKeyState(this.keyStates[upper] || 'unused', next);
    }

    this.scene.setGrid(this.grid);
    this.scene.setKeyStates(this.keyStates);

    if (guess === this.answer) {
      this.status = 'won';
      this.recordResult(true, this.currentRow);
      setTimeout(() => this.scene.showGameOver(true, this.answer), 600);
      return;
    }

    this.currentRow += 1;
    this.currentCol = 0;

    if (this.currentRow >= MAX_GUESSES) {
      this.status = 'lost';
      this.recordResult(false, -1);
      setTimeout(() => this.scene.showGameOver(false, this.answer), 600);
    }
  }

  private recordResult(won: boolean, guessIndex: number): void {
    this.stats.played += 1;
    if (won) {
      this.stats.wins += 1;
      this.stats.currentStreak += 1;
      if (this.stats.currentStreak > this.stats.maxStreak) {
        this.stats.maxStreak = this.stats.currentStreak;
      }
      if (guessIndex >= 0 && guessIndex < MAX_GUESSES) {
        this.stats.distribution[guessIndex] += 1;
      }
    } else {
      this.stats.currentStreak = 0;
    }
    this.saveStats();
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  get winPct(): number {
    return this.stats.played === 0 ? 0 : Math.round((this.stats.wins / this.stats.played) * 100);
  }

  get maxDistribution(): number {
    return Math.max(1, ...this.stats.distribution);
  }

  distPercent(n: number): number {
    return Math.round((n / this.maxDistribution) * 100);
  }

  private loadStats(): void {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.stats = {
          played: parsed.played || 0,
          wins: parsed.wins || 0,
          currentStreak: parsed.currentStreak || 0,
          maxStreak: parsed.maxStreak || 0,
          distribution: Array.isArray(parsed.distribution) && parsed.distribution.length === MAX_GUESSES
            ? parsed.distribution
            : Array(MAX_GUESSES).fill(0)
        };
      }
    } catch {
      this.stats = emptyStats();
    }
  }

  private saveStats(): void {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
    } catch {
      // ignore
    }
  }

  ngOnDestroy(): void {
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
