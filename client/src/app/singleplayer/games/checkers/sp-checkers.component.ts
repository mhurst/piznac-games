import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { CheckersScene, CheckersMove } from '../../../games/checkers/checkers.scene';
import { CheckersAI, CheckersBoard } from '../../../core/ai/checkers.ai';
import { Difficulty, DEFAULT_AI_CONFIG } from '../../../core/ai/game-ai.interface';
import { AudioService } from '../../../core/audio/audio.service';

@Component({
  selector: 'app-sp-checkers',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-checkers.component.html',
  styleUrl: './sp-checkers.component.scss'
})
export class SpCheckersComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: CheckersScene;
  private board: CheckersBoard = [];
  private isPlayerTurn = true;
  private currentTurn: 'R' | 'B' = 'R';
  private readonly PLAYER_ID = 'player';
  private readonly AI_ID = 'ai';
  private mustContinueFrom: { row: number; col: number } | null = null;

  difficulty: Difficulty = DEFAULT_AI_CONFIG.defaultDifficulty;
  gameOver = false;
  gameStarted = false;
  playerSymbol: 'R' | 'B' = 'R';
  aiSymbol: 'R' | 'B' = 'B';
  playerScore = 0;
  aiScore = 0;

  constructor(
    private router: Router,
    private ai: CheckersAI,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new CheckersScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 520,
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
    this.scene.onMoveSelected = (move: CheckersMove) => {
      if (!this.gameStarted || this.gameOver || !this.isPlayerTurn) return;
      this.makeMove(move);
    };
  }

  private initBoard(): void {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null)) as CheckersBoard;

    // Red at top (rows 0-2)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          this.board[row][col] = 'r';
        }
      }
    }

    // Black at bottom (rows 5-7)
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          this.board[row][col] = 'b';
        }
      }
    }
  }

  startGame(): void {
    this.audio.init();
    this.aiSymbol = this.playerSymbol === 'R' ? 'B' : 'R';
    this.gameStarted = true;
    this.gameOver = false;
    this.initBoard();
    this.currentTurn = 'R';  // Red always goes first
    this.isPlayerTurn = this.playerSymbol === 'R';
    this.mustContinueFrom = null;

    this.ai.setSymbols(this.aiSymbol);
    this.scene.resetGame();
    this.scene.setSymbol(this.playerSymbol);
    this.updateSceneState();

    // If AI is Red, AI goes first
    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private makeMove(move: CheckersMove): void {
    const piece = this.board[move.fromRow][move.fromCol]!;
    const playerSymbol = piece.toUpperCase() as 'R' | 'B';
    const isCapture = Math.abs(move.toRow - move.fromRow) === 2;

    // Execute move
    this.board[move.toRow][move.toCol] = piece;
    this.board[move.fromRow][move.fromCol] = null;

    if (isCapture) {
      const midRow = (move.fromRow + move.toRow) / 2;
      const midCol = (move.fromCol + move.toCol) / 2;
      this.board[midRow][midCol] = null;
      this.audio.playGame('checkers', 'capture');
    } else {
      this.audio.playGame('checkers', 'move');
    }

    // Check for promotion
    let promoted = false;
    if (this.shouldPromote(move.toRow, playerSymbol)) {
      this.board[move.toRow][move.toCol] = playerSymbol;
      promoted = true;
      this.audio.playGame('checkers', 'king');
    }

    // Check for chain jump (only if captured and not promoted)
    if (isCapture && !promoted) {
      const furtherCaptures = this.getCaptureMoves(move.toRow, move.toCol);
      if (furtherCaptures.length > 0) {
        this.mustContinueFrom = { row: move.toRow, col: move.toCol };
        this.updateSceneState();

        // If it's the AI's turn, schedule the chain capture continuation
        if (!this.isPlayerTurn) {
          this.scheduleAiChainCapture();
        }
        return;
      }
    }

    // End turn
    this.mustContinueFrom = null;
    this.currentTurn = this.currentTurn === 'R' ? 'B' : 'R';
    this.isPlayerTurn = this.currentTurn === this.playerSymbol;

    // Check game over
    const result = this.ai.checkGameOver(this.board);
    if (result) {
      this.updateSceneState();
      this.handleGameOver(result);
      return;
    }

    this.updateSceneState();

    // If it's AI's turn, schedule the move
    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private shouldPromote(row: number, playerSymbol: 'R' | 'B'): boolean {
    if (playerSymbol === 'R' && row === 7) return true;
    if (playerSymbol === 'B' && row === 0) return true;
    return false;
  }

  private getCaptureMoves(row: number, col: number): CheckersMove[] {
    const piece = this.board[row][col];
    if (!piece) return [];

    const captures: CheckersMove[] = [];
    const playerSymbol = piece.toUpperCase() as 'R' | 'B';
    const isKing = piece === 'R' || piece === 'B';

    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : playerSymbol === 'R'
        ? [[1, -1], [1, 1]]
        : [[-1, -1], [-1, 1]];

    for (const [dr, dc] of directions) {
      const midRow = row + dr;
      const midCol = col + dc;
      const endRow = row + 2 * dr;
      const endCol = col + 2 * dc;

      if (this.isValidPosition(endRow, endCol)) {
        const midPiece = this.board[midRow][midCol];
        const endCell = this.board[endRow][endCol];

        if (midPiece && midPiece.toUpperCase() !== playerSymbol && endCell === null) {
          captures.push({ fromRow: row, fromCol: col, toRow: endRow, toCol: endCol });
        }
      }
    }

    return captures;
  }

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  private getAllValidMoves(): { moves: CheckersMove[]; mustCapture: boolean } {
    const captures: CheckersMove[] = [];
    const regularMoves: CheckersMove[] = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece && piece.toUpperCase() === this.currentTurn) {
          // Check captures
          const pieceCaptures = this.getCaptureMoves(row, col);
          captures.push(...pieceCaptures);

          // Check regular moves
          const pieceMoves = this.getRegularMoves(row, col);
          regularMoves.push(...pieceMoves);
        }
      }
    }

    if (captures.length > 0) {
      return { moves: captures, mustCapture: true };
    }
    return { moves: regularMoves, mustCapture: false };
  }

  private getRegularMoves(row: number, col: number): CheckersMove[] {
    const piece = this.board[row][col];
    if (!piece) return [];

    const moves: CheckersMove[] = [];
    const playerSymbol = piece.toUpperCase() as 'R' | 'B';
    const isKing = piece === 'R' || piece === 'B';

    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : playerSymbol === 'R'
        ? [[1, -1], [1, 1]]
        : [[-1, -1], [-1, 1]];

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;

      if (this.isValidPosition(newRow, newCol) && this.board[newRow][newCol] === null) {
        moves.push({ fromRow: row, fromCol: col, toRow: newRow, toCol: newCol });
      }
    }

    return moves;
  }

  private scheduleAiMove(): void {
    const delay = this.difficulty === 'hard' ? 800 : DEFAULT_AI_CONFIG.moveDelay;

    setTimeout(() => {
      if (this.gameOver) return;

      const move = this.ai.getMove(this.board, this.difficulty);
      if (move.fromRow !== -1) {
        this.makeMove(move);
      }
    }, delay);
  }

  private scheduleAiChainCapture(): void {
    setTimeout(() => {
      if (this.gameOver || !this.mustContinueFrom) return;

      const captures = this.getCaptureMoves(this.mustContinueFrom.row, this.mustContinueFrom.col);
      if (captures.length > 0) {
        const move = captures[Math.floor(Math.random() * captures.length)];
        this.makeMove(move);
      }
    }, 400);
  }

  private updateSceneState(): void {
    const currentPlayerId = this.isPlayerTurn ? this.PLAYER_ID : this.AI_ID;

    let validMoves: CheckersMove[];
    if (this.mustContinueFrom) {
      validMoves = this.getCaptureMoves(this.mustContinueFrom.row, this.mustContinueFrom.col);
    } else {
      const allMoves = this.getAllValidMoves();
      validMoves = allMoves.moves;
    }

    this.scene.updateState(
      this.board,
      currentPlayerId,
      this.PLAYER_ID,
      validMoves,
      this.mustContinueFrom
    );
  }

  private handleGameOver(result: string | 'draw'): void {
    this.gameOver = true;

    if (result === 'draw') {
      this.scene.showGameOver(null, true, this.PLAYER_ID);
    } else if (result === this.playerSymbol) {
      this.playerScore++;
      this.scene.showGameOver(this.PLAYER_ID, false, this.PLAYER_ID);
    } else {
      this.aiScore++;
      this.scene.showGameOver(this.AI_ID, false, this.PLAYER_ID);
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
