import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { ConnectFourScene } from '../../../games/connect-four/connect-four.scene';
import { ConnectFourAI, ConnectFourBoard } from '../../../core/ai/connect-four.ai';
import { Difficulty, DEFAULT_AI_CONFIG } from '../../../core/ai/game-ai.interface';
import { AudioService } from '../../../core/audio/audio.service';

@Component({
  selector: 'app-sp-connect-four',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-connect-four.component.html',
  styleUrl: './sp-connect-four.component.scss'
})
export class SpConnectFourComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: ConnectFourScene;
  private board: ConnectFourBoard = [];
  private isPlayerTurn = true;
  private readonly PLAYER_ID = 'player';
  private readonly AI_ID = 'ai';

  difficulty: Difficulty = DEFAULT_AI_CONFIG.defaultDifficulty;
  gameOver = false;
  gameStarted = false;
  playerSymbol: 'R' | 'Y' = 'R';
  aiSymbol: 'R' | 'Y' = 'Y';
  playerScore = 0;
  aiScore = 0;

  constructor(
    private router: Router,
    private ai: ConnectFourAI,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new ConnectFourScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 560,
      height: 560,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupGameCallbacks();
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onColumnClick = (column: number) => {
      if (!this.gameStarted || this.gameOver || !this.isPlayerTurn) return;
      if (!this.isColumnValid(column)) return;

      this.makeMove(column, this.playerSymbol);
    };
  }

  private initBoard(): void {
    this.board = Array(6).fill(null).map(() => Array(7).fill(null));
  }

  private isColumnValid(col: number): boolean {
    return this.board[0][col] === null;
  }

  private getLowestEmptyRow(col: number): number {
    for (let row = 5; row >= 0; row--) {
      if (this.board[row][col] === null) {
        return row;
      }
    }
    return -1;
  }

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.initBoard();
    this.isPlayerTurn = this.playerSymbol === 'R';  // Red goes first

    this.ai.setSymbols(this.aiSymbol);
    this.scene.resetGame();
    this.scene.setSymbol(this.playerSymbol);
    this.updateSceneBoard();

    // If AI is Red, AI goes first
    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private makeMove(column: number, symbol: 'R' | 'Y'): void {
    const row = this.getLowestEmptyRow(column);
    if (row === -1) return;

    this.board[row][column] = symbol;
    this.audio.playGame('connect-four', 'drop');
    this.updateSceneBoard();

    const result = this.ai.checkGameOver(this.board);
    if (result) {
      this.handleGameOver(result);
      return;
    }

    // Switch turns
    this.isPlayerTurn = !this.isPlayerTurn;
    this.updateSceneBoard();

    // If it's AI's turn, schedule the move
    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private scheduleAiMove(): void {
    // Longer delay for hard AI since it "thinks" more
    const delay = this.difficulty === 'hard' ? 800 : DEFAULT_AI_CONFIG.moveDelay;

    setTimeout(() => {
      if (this.gameOver) return;

      const column = this.ai.getMove(this.board, this.difficulty);
      if (column !== -1) {
        this.makeMove(column, this.aiSymbol);
      }
    }, delay);
  }

  private updateSceneBoard(): void {
    const currentPlayerId = this.isPlayerTurn ? this.PLAYER_ID : this.AI_ID;
    this.scene.updateBoard(this.board, currentPlayerId, this.PLAYER_ID);
  }

  private handleGameOver(result: string | 'draw'): void {
    this.gameOver = true;
    const winningLine = this.ai.getWinningLine(this.board);

    if (result === 'draw') {
      this.scene.showGameOver(null, null, true, this.PLAYER_ID);
    } else if (result === this.playerSymbol) {
      this.playerScore++;
      this.scene.showGameOver(this.PLAYER_ID, winningLine, false, this.PLAYER_ID);
    } else {
      this.aiScore++;
      this.scene.showGameOver(this.AI_ID, winningLine, false, this.PLAYER_ID);
    }
  }

  playAgain(): void {
    // Swap symbols for next game
    [this.playerSymbol, this.aiSymbol] = [this.aiSymbol, this.playerSymbol];
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
