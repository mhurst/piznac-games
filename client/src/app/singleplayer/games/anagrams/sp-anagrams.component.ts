import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import Phaser from 'phaser';
import { AnagramsScene, SubmitResult } from '../../../games/anagrams/anagrams.scene';
import {
  generateLetters,
  generateLettersFromPangram,
  findAllPossibleWords,
  scoreWord,
  collectPangramSeeds,
  MIN_WORD_LENGTH,
  MIN_POSSIBLE_WORDS,
  LETTER_COUNT,
  CLASSIC_DURATION_SEC,
  TEXT_TWIST_DURATION_SEC,
  GameMode,
  canBuildFromLetters
} from '../../../games/anagrams/anagrams-utils';

type View = 'menu' | 'playing';

const HIGH_SCORE_KEY = (mode: GameMode) => `anagrams_highscore_${mode}`;

@Component({
  selector: 'app-sp-anagrams',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './sp-anagrams.component.html',
  styleUrl: './sp-anagrams.component.scss'
})
export class SpAnagramsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  loading = true;
  errorMessage = '';
  view: View = 'menu';

  highScoreClassic = 0;
  highScoreTextTwist = 0;

  private dictionary: Set<string> = new Set();
  private pangramSeeds: string[] = [];
  private phaserGame: Phaser.Game | null = null;
  private scene: AnagramsScene | null = null;

  mode: GameMode = 'classic';
  private letters: string[] = [];
  private possibleWords: string[] = [];
  private foundWords: string[] = [];
  private score = 0;
  private round = 1;
  private timeRemaining = 0;
  private timerHandle: any = null;
  private gameOver = false;

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    try {
      const res = await fetch('assets/wordlists/enable1.txt');
      if (!res.ok) throw new Error(`Failed to load wordlist: ${res.status}`);
      const text = await res.text();
      const words = text.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
      this.dictionary = new Set(words);
      this.pangramSeeds = collectPangramSeeds(this.dictionary);
      this.loadHighScores();
      this.loading = false;
    } catch (e: any) {
      this.errorMessage = e.message || 'Failed to load word list';
      this.loading = false;
    }
  }

  ngAfterViewInit(): void {
    // Phaser is lazily created when user picks a mode.
  }

  selectMode(mode: GameMode): void {
    this.mode = mode;
    this.view = 'playing';
    this.cdr.detectChanges(); // ensure gameCanvas is in the DOM
    this.initOrResetPhaser();
  }

  private initOrResetPhaser(): void {
    if (this.phaserGame) {
      this.startNewRun();
      return;
    }

    this.scene = new AnagramsScene();
    this.scene.onReady = () => {
      this.startNewRun();
    };
    this.scene.onSubmit = (word: string) => this.handleSubmit(word);
    this.scene.onPlayAgain = () => {
      this.scene!.hideOverlay();
      this.startNewRun();
    };
    this.scene.onBackToMenu = () => {
      this.scene!.hideOverlay();
      this.backToMenu();
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

  private startNewRun(): void {
    if (!this.scene) return;
    this.gameOver = false;
    this.score = 0;
    this.round = 1;

    this.scene.setMode(this.mode);
    this.scene.setRound(this.round, this.mode === 'text-twist');

    this.loadNextLetters();

    this.timeRemaining = this.mode === 'classic' ? CLASSIC_DURATION_SEC : TEXT_TWIST_DURATION_SEC;
    this.scene.updateTimer(this.timeRemaining);
    this.startTimer();

    this.scene.setInputEnabled(true);
  }

  private loadNextLetters(): void {
    let letters: string[] = [];
    let possible: string[] = [];

    if (this.mode === 'text-twist') {
      for (let attempt = 0; attempt < 20; attempt++) {
        letters = generateLettersFromPangram(this.pangramSeeds);
        possible = findAllPossibleWords(letters, this.dictionary);
        if (possible.length >= MIN_POSSIBLE_WORDS) break;
      }
    } else {
      for (let attempt = 0; attempt < 20; attempt++) {
        letters = generateLetters();
        possible = findAllPossibleWords(letters, this.dictionary);
        if (possible.length >= MIN_POSSIBLE_WORDS) break;
      }
    }

    this.letters = letters;
    this.possibleWords = possible;
    this.foundWords = [];

    this.scene!.setLetters(this.letters);
    this.scene!.updateScore(this.score, 0, this.possibleWords.length);
    this.scene!.updateFoundWords(this.foundWords);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerHandle = setInterval(() => {
      this.timeRemaining -= 1;
      if (this.scene) this.scene.updateTimer(Math.max(0, this.timeRemaining));
      if (this.timeRemaining <= 0) {
        this.endRun("Time's Up!");
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private handleSubmit(word: string): SubmitResult {
    if (this.gameOver) return 'invalid';
    const lower = word.toLowerCase();

    if (lower.length < MIN_WORD_LENGTH) return 'too-short';
    if (!canBuildFromLetters(lower, this.letters)) return 'invalid';
    if (!this.dictionary.has(lower)) return 'invalid';
    if (this.foundWords.includes(lower)) return 'already-found';

    this.foundWords.push(lower);
    this.score += scoreWord(lower);

    if (this.scene) {
      this.scene.updateScore(this.score, this.foundWords.length, this.possibleWords.length);
      this.scene.updateFoundWords(this.foundWords);
    }

    // Text Twist: finding a pangram clears the round
    if (this.mode === 'text-twist' && lower.length === LETTER_COUNT) {
      this.advanceRound(lower);
    }

    return 'valid';
  }

  private advanceRound(pangram: string): void {
    if (!this.scene) return;
    this.scene.showRoundClear(pangram, 1600);

    // After the scene's overlay auto-dismisses, load the next letters.
    setTimeout(() => {
      if (this.gameOver) return;
      this.round += 1;
      this.scene!.setRound(this.round, true);
      this.timeRemaining = TEXT_TWIST_DURATION_SEC;
      this.scene!.updateTimer(this.timeRemaining);
      this.loadNextLetters();
    }, 1700);
  }

  private endRun(title: string): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.stopTimer();

    const isClassic = this.mode === 'classic';
    const prevHigh = isClassic ? this.highScoreClassic : this.highScoreTextTwist;
    const isNewHigh = this.score > prevHigh;

    if (isNewHigh) {
      if (isClassic) this.highScoreClassic = this.score;
      else this.highScoreTextTwist = this.score;
      this.saveHighScores();
    }

    const subtitle = this.mode === 'text-twist'
      ? `Rounds cleared: ${this.round - 1}`
      : `${this.foundWords.length} / ${this.possibleWords.length} words found`;

    if (this.scene) {
      this.scene.setInputEnabled(false);
      this.scene.showGameOver(title, this.score, Math.max(prevHigh, this.score), isNewHigh, subtitle);
    }
  }

  backToMenu(): void {
    this.stopTimer();
    this.gameOver = true;
    this.view = 'menu';
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
      this.phaserGame = null;
      this.scene = null;
    }
    this.loadHighScores();
    this.cdr.detectChanges();
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  private loadHighScores(): void {
    try {
      this.highScoreClassic = parseInt(localStorage.getItem(HIGH_SCORE_KEY('classic')) || '0', 10) || 0;
      this.highScoreTextTwist = parseInt(localStorage.getItem(HIGH_SCORE_KEY('text-twist')) || '0', 10) || 0;
    } catch {
      this.highScoreClassic = 0;
      this.highScoreTextTwist = 0;
    }
  }

  private saveHighScores(): void {
    try {
      localStorage.setItem(HIGH_SCORE_KEY('classic'), String(this.highScoreClassic));
      localStorage.setItem(HIGH_SCORE_KEY('text-twist'), String(this.highScoreTextTwist));
    } catch {
      // ignore storage failures
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
