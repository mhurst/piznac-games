import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { ChessScene, ChessMove, ChessBoard } from '../../../games/chess/chess.scene';
import { ChessAI } from '../../../core/ai/chess.ai';
import { Difficulty, DEFAULT_AI_CONFIG } from '../../../core/ai/game-ai.interface';
import { AudioService } from '../../../core/audio/audio.service';

@Component({
  selector: 'app-sp-chess',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-chess.component.html',
  styleUrl: './sp-chess.component.scss'
})
export class SpChessComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: ChessScene;
  private board: ChessBoard = [];
  private isPlayerTurn = true;
  private currentTurn: 'W' | 'B' = 'W';
  private readonly PLAYER_ID = 'player';
  private readonly AI_ID = 'ai';
  private castlingRights = {
    W: { kingSide: true, queenSide: true },
    B: { kingSide: true, queenSide: true }
  };
  private enPassantTarget: { row: number; col: number } | null = null;
  private halfMoveClock = 0;
  private positionHistory: string[] = [];
  private lastMove: ChessMove | null = null;
  private inCheck = { W: false, B: false };

  difficulty: Difficulty = DEFAULT_AI_CONFIG.defaultDifficulty;
  gameOver = false;
  gameStarted = false;
  playerColor: 'W' | 'B' = 'W';
  aiColor: 'W' | 'B' = 'B';
  playerScore = 0;
  aiScore = 0;

  constructor(
    private router: Router,
    private ai: ChessAI,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new ChessScene();

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
    this.scene.onMoveSelected = (move: ChessMove) => {
      if (!this.gameStarted || this.gameOver || !this.isPlayerTurn) return;
      this.makeMove(move);
    };
  }

  private initBoard(): void {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null)) as ChessBoard;
    this.board[0] = ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'];
    this.board[1] = ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'];
    this.board[6] = ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'];
    this.board[7] = ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'];
  }

  startGame(): void {
    this.audio.init();
    this.aiColor = this.playerColor === 'W' ? 'B' : 'W';
    this.gameStarted = true;
    this.gameOver = false;
    this.initBoard();
    this.currentTurn = 'W';
    this.isPlayerTurn = this.playerColor === 'W';
    this.castlingRights = {
      W: { kingSide: true, queenSide: true },
      B: { kingSide: true, queenSide: true }
    };
    this.enPassantTarget = null;
    this.halfMoveClock = 0;
    this.positionHistory = [];
    this.lastMove = null;
    this.inCheck = { W: false, B: false };

    this.ai.setSymbols(this.aiColor);
    this.ai.setState(
      JSON.parse(JSON.stringify(this.castlingRights)),
      this.enPassantTarget
    );

    this.scene.resetGame();
    this.scene.setSymbol(this.playerColor);
    this.recordPosition();
    this.updateSceneState();

    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private makeMove(move: ChessMove): void {
    const piece = this.board[move.fromRow][move.fromCol];
    if (!piece) return;

    const color = piece[0] === 'w' ? 'W' : 'B';
    const type = piece[1];
    let captured = this.board[move.toRow][move.toCol];
    let special: string | null = null;

    // En passant capture
    if (type === 'P' && this.enPassantTarget &&
        move.toRow === this.enPassantTarget.row && move.toCol === this.enPassantTarget.col) {
      const capturedPawnRow = color === 'W' ? move.toRow + 1 : move.toRow - 1;
      captured = this.board[capturedPawnRow][move.toCol];
      this.board[capturedPawnRow][move.toCol] = null;
      special = 'en-passant';
    }

    // Castling
    if (type === 'K' && Math.abs(move.toCol - move.fromCol) === 2) {
      if (move.toCol > move.fromCol) {
        this.board[move.fromRow][5] = this.board[move.fromRow][7];
        this.board[move.fromRow][7] = null;
        special = 'castle-king';
      } else {
        this.board[move.fromRow][3] = this.board[move.fromRow][0];
        this.board[move.fromRow][0] = null;
        special = 'castle-queen';
      }
    }

    // Move the piece
    this.board[move.toRow][move.toCol] = piece;
    this.board[move.fromRow][move.fromCol] = null;

    // Pawn promotion
    if (type === 'P' && (move.toRow === 0 || move.toRow === 7)) {
      const promoteTo = move.promotion || 'Q';
      this.board[move.toRow][move.toCol] = color.toLowerCase() + promoteTo;
      special = 'promotion';
    }

    // Play sounds
    if (special === 'castle-king' || special === 'castle-queen') {
      this.audio.playGame('chess', 'castle');
    } else if (special === 'promotion') {
      this.audio.playGame('chess', 'promote');
    } else if (captured) {
      this.audio.playGame('chess', 'capture');
    } else {
      this.audio.playGame('chess', 'move');
    }

    // Update castling rights
    this.updateCastlingRights(piece, move.fromRow, move.fromCol, move.toRow, move.toCol);

    // Update en passant target
    this.enPassantTarget = null;
    if (type === 'P' && Math.abs(move.toRow - move.fromRow) === 2) {
      this.enPassantTarget = {
        row: (move.fromRow + move.toRow) / 2,
        col: move.fromCol
      };
    }

    // Update half-move clock
    if (type === 'P' || captured) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    this.lastMove = { fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol };

    // Update check status
    const opponent = color === 'W' ? 'B' : 'W';
    this.inCheck[opponent] = this.ai.isKingInCheck(this.board, opponent);
    this.inCheck[color] = false;

    if (this.inCheck[opponent]) {
      this.audio.playGame('chess', 'check');
    }

    // Switch turns
    this.currentTurn = opponent;
    this.isPlayerTurn = this.currentTurn === this.playerColor;

    // Sync AI state
    this.ai.setState(
      JSON.parse(JSON.stringify(this.castlingRights)),
      this.enPassantTarget ? { ...this.enPassantTarget } : null
    );

    // Record position
    this.recordPosition();

    // Check game over
    const result = this.checkGameOver();
    if (result) {
      this.updateSceneState();
      this.handleGameOver(result);
      return;
    }

    this.updateSceneState();

    if (!this.isPlayerTurn) {
      this.scheduleAiMove();
    }
  }

  private updateCastlingRights(piece: string, fromRow: number, fromCol: number, toRow: number, toCol: number): void {
    const color = piece[0] === 'w' ? 'W' : 'B' as 'W' | 'B';
    const type = piece[1];

    if (type === 'K') {
      this.castlingRights[color].kingSide = false;
      this.castlingRights[color].queenSide = false;
    }
    if (type === 'R') {
      if (fromCol === 0) this.castlingRights[color].queenSide = false;
      if (fromCol === 7) this.castlingRights[color].kingSide = false;
    }

    if (toRow === 0 && toCol === 0) this.castlingRights.B.queenSide = false;
    if (toRow === 0 && toCol === 7) this.castlingRights.B.kingSide = false;
    if (toRow === 7 && toCol === 0) this.castlingRights.W.queenSide = false;
    if (toRow === 7 && toCol === 7) this.castlingRights.W.kingSide = false;
  }

  private recordPosition(): void {
    let hash = this.currentTurn;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        hash += (this.board[r][c] || '--');
      }
    }
    this.positionHistory.push(hash);
  }

  private checkGameOver(): string | 'draw' | null {
    // Use AI's game over check
    const result = this.ai.checkGameOver(this.board);
    if (result) return result;

    // 50-move rule
    if (this.halfMoveClock >= 100) return 'draw';

    // Threefold repetition
    const current = this.positionHistory[this.positionHistory.length - 1];
    let count = 0;
    for (const pos of this.positionHistory) {
      if (pos === current) count++;
      if (count >= 3) return 'draw';
    }

    return null;
  }

  private getAllLegalMoves(): ChessMove[] {
    return this.ai.getAllLegalMoves(this.board, this.currentTurn);
  }

  private scheduleAiMove(): void {
    const delay = this.difficulty === 'hard' ? 800 : DEFAULT_AI_CONFIG.moveDelay;

    setTimeout(() => {
      if (this.gameOver) return;

      const move = this.ai.getMove(this.board, this.difficulty);
      if (move.fromRow !== -1) {
        // AI always promotes to queen
        const piece = this.board[move.fromRow][move.fromCol];
        if (piece && piece[1] === 'P' && (move.toRow === 0 || move.toRow === 7)) {
          move.promotion = 'Q';
        }
        this.makeMove(move);
      }
    }, delay);
  }

  private updateSceneState(): void {
    const currentPlayerId = this.isPlayerTurn ? this.PLAYER_ID : this.AI_ID;
    const validMoves = this.isPlayerTurn ? this.getAllLegalMoves() : [];

    this.scene.updateState(
      this.board,
      currentPlayerId,
      this.PLAYER_ID,
      validMoves,
      this.lastMove,
      this.inCheck
    );
  }

  private handleGameOver(result: string | 'draw'): void {
    this.gameOver = true;

    if (result === 'draw') {
      this.scene.showGameOver(null, true, this.PLAYER_ID);
    } else if (result === this.playerColor) {
      this.playerScore++;
      this.scene.showGameOver(this.PLAYER_ID, false, this.PLAYER_ID);
    } else {
      this.aiScore++;
      this.scene.showGameOver(this.AI_ID, false, this.PLAYER_ID);
    }
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
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }
  }
}
