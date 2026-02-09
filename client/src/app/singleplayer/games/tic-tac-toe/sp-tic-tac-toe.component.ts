import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { TicTacToeScene } from '../../../multiplayer/games/tic-tac-toe/tic-tac-toe.scene';
import { TicTacToeAI, TicTacToeBoard } from '../../../core/ai/tic-tac-toe.ai';
import { Difficulty, DEFAULT_AI_CONFIG } from '../../../core/ai/game-ai.interface';

@Component({
  selector: 'app-sp-tic-tac-toe',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-tic-tac-toe.component.html',
  styleUrl: './sp-tic-tac-toe.component.scss'
})
export class SpTicTacToeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: TicTacToeScene;
  private board: TicTacToeBoard = Array(9).fill(null);
  private isPlayerTurn = true;
  private readonly PLAYER_ID = 'player';
  private readonly AI_ID = 'ai';

  difficulty: Difficulty = DEFAULT_AI_CONFIG.defaultDifficulty;
  gameOver = false;
  gameStarted = false;
  playerSymbol: 'X' | 'O' = 'X';
  aiSymbol: 'X' | 'O' = 'O';
  playerScore = 0;
  aiScore = 0;

  constructor(
    private router: Router,
    private ai: TicTacToeAI
  ) {}

  ngAfterViewInit(): void {
    this.scene = new TicTacToeScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 500,
      height: 580,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupGameCallbacks();
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onCellClick = (cellIndex: number) => {
      if (!this.gameStarted || this.gameOver || !this.isPlayerTurn) return;
      if (this.board[cellIndex] !== null) return;

      this.makeMove(cellIndex, this.playerSymbol);
    };
  }

  startGame(): void {
    this.gameStarted = true;
    this.gameOver = false;
    this.board = Array(9).fill(null);
    this.isPlayerTurn = this.playerSymbol === 'X'; // X always goes first

    this.ai.setSymbols(this.aiSymbol);
    this.scene.resetGame();
    this.scene.setSymbol(this.playerSymbol);
    this.updateSceneBoard();

    // If AI is X, AI goes first
    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private makeMove(cellIndex: number, symbol: 'X' | 'O'): void {
    this.board[cellIndex] = symbol;
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
    setTimeout(() => {
      if (this.gameOver) return;

      const move = this.ai.getMove(this.board, this.difficulty);
      if (move !== -1) {
        this.makeMove(move, this.aiSymbol);
      }
    }, DEFAULT_AI_CONFIG.moveDelay);
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
