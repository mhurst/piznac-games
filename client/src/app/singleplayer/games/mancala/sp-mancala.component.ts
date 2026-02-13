import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { MancalaScene, MancalaState } from '../../../games/mancala/mancala.scene';
import { MancalaAI } from '../../../core/ai/mancala-ai';
import { Difficulty, DEFAULT_AI_CONFIG } from '../../../core/ai/game-ai.interface';
import { AudioService } from '../../../core/audio/audio.service';
import { getRandomAINames } from '../../../core/ai/ai-names';

interface SowResult {
  pits: number[];
  path: number[];
  lastPit: number;
  extraTurn: boolean;
  captured: boolean;
}

@Component({
  selector: 'app-sp-mancala',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-mancala.component.html',
  styleUrl: './sp-mancala.component.scss'
})
export class SpMancalaComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: MancalaScene;
  private pits: number[] = [];
  private currentPlayer: 1 | 2 = 1;
  private animating = false;

  difficulty: Difficulty = DEFAULT_AI_CONFIG.defaultDifficulty;
  private aiName = 'AI';
  gameOver = false;
  gameStarted = false;
  playerSide: 1 | 2 = 1;
  aiSide: 1 | 2 = 2;
  playerScore = 0;
  aiScore = 0;

  constructor(
    private router: Router,
    private ai: MancalaAI,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new MancalaScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 700,
      height: 400,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupGameCallbacks();
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onPitClick = (pitIndex: number) => {
      if (!this.gameStarted || this.gameOver || this.animating) return;
      if (this.currentPlayer !== this.playerSide) return;
      this.executeTurn(pitIndex);
    };
  }

  startGame(): void {
    this.audio.init();
    this.aiSide = this.playerSide === 1 ? 2 : 1;
    this.ai.setPlayer(this.aiSide);
    this.aiName = getRandomAINames(1)[0];
    this.gameStarted = true;
    this.gameOver = false;
    this.pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    this.currentPlayer = 1;

    this.scene.resetGame();
    this.scene.setPlayer(this.playerSide, 'You', this.aiName);
    this.updateScene(false);

    if (this.currentPlayer !== this.playerSide) {
      this.scheduleAiMove();
    }
  }

  private async executeTurn(pitIndex: number): Promise<void> {
    if (this.pits[pitIndex] === 0) return;

    this.animating = true;
    const result = this.sow(pitIndex, this.currentPlayer);

    // Play sound
    if (result.captured) {
      this.audio.playGame('mancala', 'capture');
    } else if (result.extraTurn) {
      this.audio.playGame('mancala', 'extra-turn');
    } else {
      this.audio.playGame('mancala', 'sow');
    }

    // Animate
    await this.scene.animateSow(result.path, result.pits);
    this.pits = result.pits;

    // Check game over
    if (this.checkGameOver()) {
      this.animating = false;
      return;
    }

    if (result.extraTurn) {
      // Same player goes again
      this.updateScene(true);
      this.animating = false;

      if (this.currentPlayer !== this.playerSide) {
        this.scheduleAiMove();
      }
    } else {
      // Switch player
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      this.updateScene(false);
      this.animating = false;

      if (this.currentPlayer !== this.playerSide) {
        this.scheduleAiMove();
      }
    }
  }

  private sow(pitIndex: number, player: 1 | 2): SowResult {
    const pits = [...this.pits];
    let stones = pits[pitIndex];
    pits[pitIndex] = 0;
    let current = pitIndex;
    const opponentStore = player === 1 ? 13 : 6;
    const path: number[] = [];

    while (stones > 0) {
      current = (current + 1) % 14;
      if (current === opponentStore) continue;
      pits[current]++;
      path.push(current);
      stones--;
    }

    const myStore = player === 1 ? 6 : 13;
    const extraTurn = current === myStore;

    // Check capture
    let captured = false;
    const myPitStart = player === 1 ? 0 : 7;
    const myPitEnd = player === 1 ? 5 : 12;

    if (!extraTurn && current >= myPitStart && current <= myPitEnd && pits[current] === 1) {
      const opposite = 12 - current;
      if (pits[opposite] > 0) {
        pits[myStore] += pits[opposite] + 1;
        pits[current] = 0;
        pits[opposite] = 0;
        captured = true;
      }
    }

    return { pits, path, lastPit: current, extraTurn, captured };
  }

  private checkGameOver(): boolean {
    const p1Empty = this.pits.slice(0, 6).every(s => s === 0);
    const p2Empty = this.pits.slice(7, 13).every(s => s === 0);

    if (!p1Empty && !p2Empty) return false;

    // Sweep remaining stones
    if (p1Empty) {
      for (let i = 7; i <= 12; i++) {
        this.pits[13] += this.pits[i];
        this.pits[i] = 0;
      }
    }
    if (p2Empty) {
      for (let i = 0; i <= 5; i++) {
        this.pits[6] += this.pits[i];
        this.pits[i] = 0;
      }
    }

    this.gameOver = true;
    const p1Score = this.pits[6];
    const p2Score = this.pits[13];
    let winner: 1 | 2 | null = null;

    if (p1Score > p2Score) winner = 1;
    else if (p2Score > p1Score) winner = 2;

    // Update scores
    if (winner === this.playerSide) {
      this.playerScore++;
    } else if (winner === this.aiSide) {
      this.aiScore++;
    }

    this.scene.updateState({
      pits: this.pits,
      currentPlayer: this.currentPlayer,
      gameOver: true,
      winner
    });
    this.scene.showGameOver(winner, p1Score, p2Score);
    return true;
  }

  private updateScene(extraTurn: boolean): void {
    this.scene.updateState({
      pits: this.pits,
      currentPlayer: this.currentPlayer,
      gameOver: false,
      winner: null,
      extraTurn
    });
  }

  private scheduleAiMove(): void {
    const delay = this.difficulty === 'hard' ? 800 : DEFAULT_AI_CONFIG.moveDelay;

    setTimeout(async () => {
      if (this.gameOver) return;

      const move = this.ai.getMove(this.pits, this.difficulty);
      if (move !== -1) {
        await this.executeTurn(move);
      }
    }, delay);
  }

  playAgain(): void {
    [this.playerSide, this.aiSide] = [this.aiSide, this.playerSide];
    this.startGame();
  }

  resetScore(): void {
    this.playerScore = 0;
    this.aiScore = 0;
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
