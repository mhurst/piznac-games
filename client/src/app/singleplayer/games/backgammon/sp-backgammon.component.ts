import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { BackgammonScene } from '../../../games/backgammon/backgammon.scene';
import {
  Board, Bar, BorneOff, Color, BackgammonMove, BackgammonVisualState,
  createStartingBoard, rollDice, getDiceValues,
  getValidFirstMoves, findAllTurns, applyMove, checkGameOver, getWinType
} from '../../../games/backgammon/backgammon-types';
import { BackgammonAI, Difficulty } from '../../../core/ai/backgammon.ai';
import { AudioService } from '../../../core/audio/audio.service';
import { getRandomAINames } from '../../../core/ai/ai-names';

@Component({
  selector: 'app-sp-backgammon',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-backgammon.component.html',
  styleUrl: './sp-backgammon.component.scss'
})
export class SpBackgammonComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: BackgammonScene;

  private board: Board = [];
  private bar: Bar = { W: 0, B: 0 };
  private borneOff: BorneOff = { W: 0, B: 0 };
  private dice: [number, number] | null = null;
  private remainingDice: number[] = [];
  private currentPlayer: Color = 'W';
  private phase: 'rolling' | 'moving' | 'gameOver' = 'rolling';
  private lastMove: BackgammonMove | null = null;
  private selectedPoint: number | 'bar' | null = null;
  private aiTimers: any[] = [];

  difficulty: Difficulty = 'medium';
  gameOver = false;
  gameStarted = false;
  playerColor: Color = 'W';
  aiColor: Color = 'B';
  aiName = '';
  playerScore = 0;
  aiScore = 0;
  winner: string | null = null;
  winType: 'normal' | 'gammon' | 'backgammon' | null = null;

  constructor(
    private router: Router,
    private ai: BackgammonAI,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new BackgammonScene();
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 650,
      height: 520,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a472a',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupCallbacks();
    };
  }

  private setupCallbacks(): void {
    this.scene.onMoveSelected = (move: BackgammonMove) => {
      if (!this.gameStarted || this.gameOver) return;
      if (this.currentPlayer !== this.playerColor) return;
      if (this.phase !== 'moving') return;
      this.executeMove(move);
    };

    this.scene.onRollDice = () => {
      if (!this.gameStarted || this.gameOver) return;
      if (this.currentPlayer !== this.playerColor) return;
      if (this.phase !== 'rolling') return;
      this.doRoll();
    };
  }

  startGame(): void {
    this.audio.init();
    this.aiColor = this.playerColor === 'W' ? 'B' : 'W';
    this.aiName = getRandomAINames(1)[0];
    this.gameStarted = true;
    this.gameOver = false;
    this.winner = null;
    this.winType = null;

    this.board = createStartingBoard();
    this.bar = { W: 0, B: 0 };
    this.borneOff = { W: 0, B: 0 };
    this.dice = null;
    this.remainingDice = [];
    this.currentPlayer = 'W';
    this.phase = 'rolling';
    this.lastMove = null;
    this.selectedPoint = null;

    this.clearAITimers();
    this.scene.resetGame();
    this.updateScene();

    if (this.currentPlayer === this.aiColor) {
      this.scheduleAIRoll();
    }
  }

  private doRoll(): void {
    this.dice = rollDice();
    this.remainingDice = getDiceValues(this.dice);
    this.audio.playGame('backgammon', 'roll');

    const validMoves = getValidFirstMoves(this.board, this.bar, this.borneOff, this.currentPlayer, this.remainingDice);
    if (validMoves.length === 0) {
      this.scene.setMessage('No valid moves — turn passes');
      this.updateScene();
      const timer = setTimeout(() => {
        this.endTurn();
      }, 1500);
      this.aiTimers.push(timer);
      return;
    }

    this.phase = 'moving';
    this.updateScene();
  }

  private executeMove(move: BackgammonMove): void {
    const result = applyMove(this.board, this.bar, this.borneOff, this.currentPlayer, move);
    this.board = result.board;
    this.bar = result.bar;
    this.borneOff = result.borneOff;
    this.lastMove = move;

    if (result.hit) {
      this.audio.playGame('backgammon', 'hit');
    } else if (move.to === 'off') {
      this.audio.playGame('backgammon', 'bearoff');
    } else {
      this.audio.playGame('backgammon', 'move');
    }

    // Remove used die
    const idx = this.remainingDice.indexOf(move.die);
    this.remainingDice.splice(idx, 1);
    this.selectedPoint = null;

    // Check game over
    const winner = checkGameOver(this.borneOff);
    if (winner) {
      this.handleGameOver(winner);
      return;
    }

    // Check if more moves
    if (this.remainingDice.length === 0) {
      this.endTurn();
      return;
    }

    const nextMoves = getValidFirstMoves(this.board, this.bar, this.borneOff, this.currentPlayer, this.remainingDice);
    if (nextMoves.length === 0) {
      this.scene.setMessage('No more valid moves');
      this.updateScene();
      const timer = setTimeout(() => this.endTurn(), 1000);
      this.aiTimers.push(timer);
      return;
    }

    this.updateScene();
  }

  private endTurn(): void {
    this.currentPlayer = this.currentPlayer === 'W' ? 'B' : 'W';
    this.phase = 'rolling';
    this.dice = null;
    this.remainingDice = [];
    this.selectedPoint = null;
    this.scene.setMessage('');
    this.updateScene();

    if (this.currentPlayer === this.aiColor) {
      this.scheduleAIRoll();
    }
  }

  private scheduleAIRoll(): void {
    const delay = this.ai.getDelay(this.difficulty);
    const timer = setTimeout(() => {
      if (this.gameOver) return;
      this.doRoll();

      if (this.phase === 'moving' && this.currentPlayer === this.aiColor) {
        this.scheduleAITurn();
      }
    }, delay);
    this.aiTimers.push(timer);
  }

  private scheduleAITurn(): void {
    const turn = this.ai.getTurn({
      board: [...this.board],
      bar: { ...this.bar },
      borneOff: { ...this.borneOff },
      color: this.aiColor,
      remainingDice: [...this.remainingDice]
    }, this.difficulty);

    if (turn.length === 0) {
      const timer = setTimeout(() => this.endTurn(), 800);
      this.aiTimers.push(timer);
      return;
    }

    // Execute moves one at a time with delays
    let delay = 0;
    for (let i = 0; i < turn.length; i++) {
      delay += this.ai.getMoveDelay();
      const timer = setTimeout(() => {
        if (this.gameOver) return;
        this.executeMove(turn[i]);
      }, delay);
      this.aiTimers.push(timer);
    }
  }

  private handleGameOver(winnerColor: Color): void {
    this.gameOver = true;
    this.phase = 'gameOver';
    this.winType = getWinType(winnerColor, this.board, this.bar, this.borneOff);

    const multiplier = this.winType === 'backgammon' ? 3 : this.winType === 'gammon' ? 2 : 1;

    if (this.players(winnerColor) === 'player') {
      this.winner = 'YOU';
      this.playerScore += multiplier;
      this.audio.playGame('backgammon', 'win');
    } else {
      this.winner = this.aiName;
      this.aiScore += multiplier;
    }

    this.updateScene();
  }

  private players(color: Color): string {
    return color === this.playerColor ? 'player' : 'ai';
  }

  private updateScene(): void {
    const isMyTurn = this.currentPlayer === this.playerColor;
    const validMoves = (isMyTurn && this.phase === 'moving')
      ? getValidFirstMoves(this.board, this.bar, this.borneOff, this.currentPlayer, this.remainingDice)
      : [];

    const state: BackgammonVisualState = {
      board: [...this.board],
      bar: { ...this.bar },
      borneOff: { ...this.borneOff },
      dice: this.dice,
      remainingDice: [...this.remainingDice],
      currentPlayer: this.currentPlayer,
      isMyTurn,
      validMoves,
      selectedPoint: this.selectedPoint,
      phase: this.phase,
      message: '',
      myColor: this.playerColor,
      myName: 'YOU',
      opponentName: this.aiName,
      gameOver: this.gameOver,
      winner: this.winner,
      winType: this.winType
    };

    this.scene.updateState(state);
  }

  private clearAITimers(): void {
    for (const t of this.aiTimers) clearTimeout(t);
    this.aiTimers = [];
  }

  playAgain(): void {
    [this.playerColor, this.aiColor] = [this.aiColor, this.playerColor];
    this.startGame();
  }

  resetScore(): void {
    this.playerScore = 0;
    this.aiScore = 0;
  }

  leaveGame(): void {
    this.clearAITimers();
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    this.clearAITimers();
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
