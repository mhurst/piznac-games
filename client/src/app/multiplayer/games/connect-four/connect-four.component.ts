import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { ConnectFourScene } from '../../../games/connect-four/connect-four.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-connect-four',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './connect-four.component.html',
  styleUrl: './connect-four.component.scss'
})
export class ConnectFourComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: ConnectFourScene;
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

    this.scene = new ConnectFourScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 560,
      height: 560,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    // Wait for Phaser scene to be ready
    this.scene.onReady = () => {
      this.audio.init();
      this.setupGameCallbacks();
      this.setupSocketListeners();

      // Request current game state from server
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onColumnClick = (column: number) => {
      this.gameStateService.makeMove(this.roomCode, column);
    };
  }

  private initBoard(gameState: any): void {
    this.myId = this.socketService.getSocketId();

    if (gameState.players.R === this.myId) {
      this.scene.setSymbol('R');
    } else {
      this.scene.setSymbol('Y');
    }

    this.scene.updateBoard(gameState.board, gameState.currentPlayerId, this.myId);
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // Listen for state response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.initBoard(data.gameState);
      })
    );

    // Listen for moves
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState }) => {
        this.myId = this.socketService.getSocketId();
        this.audio.playGame('connect-four', 'drop');
        this.scene.updateBoard(gameState.board, gameState.currentPlayerId, this.myId);
      })
    );

    // Listen for game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, winningLine, isDraw }) => {
        this.gameOver = true;
        this.myId = this.socketService.getSocketId();
        // Connect Four uses {row, col}[] format for winning line
        const line = winningLine as { row: number; col: number }[] | null;
        this.scene.showGameOver(winner, line, isDraw, this.myId);
      })
    );

    // Listen for game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.scene.resetGame();
        this.initBoard(gameState);
      })
    );

    // Listen for rematch request from opponent
    this.subscriptions.push(
      this.gameStateService.onRematchRequested().subscribe(() => {
        // Opponent wants rematch - shown via UI
      })
    );

    // Listen for opponent disconnect
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
