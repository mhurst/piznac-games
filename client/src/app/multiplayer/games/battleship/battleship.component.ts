import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { BattleshipScene, ShipPlacement, PlacedShip } from '../../../games/battleship/battleship.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-battleship',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './battleship.component.html',
  styleUrl: './battleship.component.scss'
})
export class BattleshipComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: BattleshipScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  phase: 'setup' | 'waiting' | 'battle' | 'gameover' = 'setup';
  gameOver = false;
  rematchRequested = false;
  opponentReady = false;
  mySetupComplete = false;

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

    this.scene = new BattleshipScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 850,
      height: 620,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupGameCallbacks();
      this.setupSocketListeners();

      // Request current game state from server
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    };
  }

  private setupGameCallbacks(): void {
    // Ship placement during setup
    this.scene.onShipPlaced = (placement: ShipPlacement) => {
      this.socketService.emit('make-move', {
        roomCode: this.roomCode,
        move: { type: 'place-ship', ...placement }
      });
    };

    // Auto-place ships
    this.scene.onAutoPlace = () => {
      this.socketService.emit('make-move', {
        roomCode: this.roomCode,
        move: { type: 'auto-place' }
      });
    };

    // Setup complete (Ready button)
    this.scene.onSetupComplete = () => {
      this.mySetupComplete = true;
      this.socketService.emit('make-move', {
        roomCode: this.roomCode,
        move: { type: 'confirm-setup' }
      });
      this.scene.showSetupWaiting();
    };

    // Cell click during battle (fire)
    this.scene.onCellClick = (row: number, col: number) => {
      this.gameStateService.makeMove(this.roomCode, { row, col });
    };
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // Listen for state response (initial load or updates)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.handleGameState(data.gameState);
      })
    );

    // Listen for moves
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        this.myId = this.socketService.getSocketId();
        this.handleGameState(gameState);

        // Show hit/miss animation if in battle phase
        if (gameState.phase === 'battle' && gameState.lastShot) {
          const { row, col, hit, sunk, shipType } = gameState.lastShot;
          this.scene.showHitResult(row, col, hit, sunk, shipType);
        }
      })
    );

    // Listen for game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, isDraw }) => {
        this.gameOver = true;
        this.phase = 'gameover';
        this.myId = this.socketService.getSocketId();
        this.scene.showGameOver(winner || '', this.myId);
      })
    );

    // Listen for game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.mySetupComplete = false;
        this.opponentReady = false;
        this.phase = 'setup';
        this.scene.resetGame();
        this.handleGameState(gameState);
      })
    );

    // Listen for rematch request from opponent
    this.subscriptions.push(
      this.gameStateService.onRematchRequested().subscribe(() => {
        // Opponent wants rematch
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

  private handleGameState(gameState: any): void {
    this.myId = this.socketService.getSocketId();

    // Update phase
    if (gameState.phase === 'setup') {
      // Check if we're waiting for opponent
      if (gameState.setupComplete[gameState.mySymbol]) {
        this.phase = 'waiting';
        this.mySetupComplete = true;
      } else {
        this.phase = 'setup';
      }
    } else if (gameState.phase === 'battle') {
      this.phase = 'battle';
    }

    // Update scene
    this.scene.updateState({
      phase: gameState.phase,
      myBoard: gameState.myBoard,
      trackingBoard: gameState.trackingBoard,
      myShips: gameState.myShips,
      currentPlayerId: gameState.currentPlayerId,
      myId: this.myId,
      myShipsRemaining: gameState.myShipsRemaining,
      opponentShipsRemaining: gameState.opponentShipsRemaining,
      opponentSunkShips: gameState.opponentSunkShips
    });

    // If we just entered waiting phase
    if (this.phase === 'waiting') {
      this.scene.showSetupWaiting();
    }
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
