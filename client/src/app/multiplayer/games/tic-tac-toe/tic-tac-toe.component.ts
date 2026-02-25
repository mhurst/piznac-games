import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { TicTacToeScene } from './tic-tac-toe.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tic-tac-toe',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './tic-tac-toe.component.html',
  styleUrl: './tic-tac-toe.component.scss'
})
export class TicTacToeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: TicTacToeScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';
  private opponentName = 'Opponent';

  gameOver = false;
  rematchRequested = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    private gameStateService: GameStateService,
    private lobbyService: LobbyService
  ) {}

  ngAfterViewInit(): void {
    this.roomCode = this.route.snapshot.paramMap.get('roomId') || '';
    this.myId = this.socketService.getSocketId();

    this.scene = new TicTacToeScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 500,
      height: 620,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    // Wait for Phaser scene to be ready
    this.scene.onReady = () => {
      this.setupGameCallbacks();
      this.setupSocketListeners();

      // Request current game state from server
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onCellClick = (cellIndex: number) => {
      this.gameStateService.makeMove(this.roomCode, cellIndex);
    };
  }

  private initBoard(gameState: any, players?: any[]): void {
    this.myId = this.socketService.getSocketId();

    if (gameState.players.X === this.myId) {
      this.scene.setSymbol('X');
    } else {
      this.scene.setSymbol('O');
    }

    if (players) {
      const opponent = players.find((p: any) => p.id !== this.myId);
      if (opponent) {
        this.opponentName = opponent.name || 'Opponent';
      }
    }
    this.scene.setOpponentName(this.opponentName);

    this.scene.updateBoard(gameState.board, gameState.currentPlayerId, this.myId);
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // Listen for state response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        const playersArr = Array.isArray(data.players) ? data.players : undefined;
        this.initBoard(data.gameState, playersArr);
      })
    );

    // Listen for moves
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState }) => {
        this.myId = this.socketService.getSocketId();
        this.scene.updateBoard(gameState.board, gameState.currentPlayerId, this.myId);
      })
    );

    // Listen for game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, winningLine, isDraw }) => {
        this.gameOver = true;
        this.myId = this.socketService.getSocketId();
        this.scene.showGameOver(winner, winningLine, isDraw, this.myId);
      })
    );

    // Listen for game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.scene.resetGame();
        this.initBoard(gameState, players);
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
    // Disconnect and immediately reconnect to leave the room cleanly
    // Server will handle room cleanup on disconnect
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
