import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { ChessScene, ChessMove } from '../../../games/chess/chess.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-mp-chess',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './chess.component.html',
  styleUrl: './chess.component.scss'
})
export class ChessMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: ChessScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  gameOver = false;
  rematchRequested = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    private gameStateService: GameStateService,
    private lobbyService: LobbyService,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.roomCode = this.route.snapshot.paramMap.get('roomId') || '';
    this.myId = this.socketService.getSocketId();

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
      this.audio.init();
      this.setupGameCallbacks();
      this.setupSocketListeners();
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onMoveSelected = (move: ChessMove) => {
      this.gameStateService.makeMove(this.roomCode, move);
    };
  }

  private initBoard(gameState: any): void {
    this.myId = this.socketService.getSocketId();

    if (gameState.players.W === this.myId) {
      this.scene.setSymbol('W');
    } else {
      this.scene.setSymbol('B');
    }

    this.scene.updateState(
      gameState.board,
      gameState.currentPlayerId,
      this.myId,
      gameState.validMoves || [],
      gameState.lastMove || null,
      gameState.inCheck || { W: false, B: false }
    );
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // State response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.initBoard(data.gameState);
      })
    );

    // Move made
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        this.myId = this.socketService.getSocketId();

        // Play sounds
        if (result?.special === 'castle-king' || result?.special === 'castle-queen') {
          this.audio.playGame('chess', 'castle');
        } else if (result?.special === 'promotion') {
          this.audio.playGame('chess', 'promote');
        } else if (result?.captured) {
          this.audio.playGame('chess', 'capture');
        } else {
          this.audio.playGame('chess', 'move');
        }

        if (result?.inCheck) {
          this.audio.playGame('chess', 'check');
        }

        if (result?.move) {
          this.scene.animateMove(result.move);
        }

        this.scene.updateState(
          gameState.board,
          gameState.currentPlayerId,
          this.myId,
          gameState.validMoves || [],
          gameState.lastMove || null,
          gameState.inCheck || { W: false, B: false }
        );
      })
    );

    // Game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, isDraw }) => {
        this.gameOver = true;
        this.myId = this.socketService.getSocketId();
        this.scene.showGameOver(winner, isDraw, this.myId);
      })
    );

    // Game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.scene.resetGame();
        this.initBoard(gameState);
      })
    );

    // Rematch request from opponent
    this.subscriptions.push(
      this.gameStateService.onRematchRequested().subscribe(() => {
        // Shown via UI
      })
    );

    // Opponent disconnect
    this.subscriptions.push(
      this.lobbyService.onOpponentDisconnected().subscribe(() => {
        alert('Opponent disconnected!');
        this.router.navigate(['/']);
      })
    );
  }

  requestRematch(): void {
    this.rematchRequested = true;
    this.gameStateService.requestRematch(this.roomCode);
  }

  leaveGame(): void {
    this.socketService.disconnect();
    this.socketService.reconnect();
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }
  }
}
