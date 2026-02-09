import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { WarScene } from '../../../games/war/war.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-war',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './war.component.html',
  styleUrl: './war.component.scss'
})
export class WarComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: WarScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';
  private mySymbol: 'P1' | 'P2' = 'P1';
  private lastState: any = null;

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

    this.scene = new WarScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 400,
      height: 500,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.audio.init();
      this.setupGameCallbacks();
      this.setupSocketListeners();

      // Request current game state from server
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    };
  }

  private setupGameCallbacks(): void {
    this.scene.onFlip = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'flip' });
    };
  }

  private initState(gameState: any): void {
    this.myId = this.socketService.getSocketId();
    this.mySymbol = gameState.mySymbol || 'P1';
    this.scene.setSymbol(this.mySymbol);
    this.updateScene(gameState);
  }

  private updateScene(gameState: any): void {
    this.lastState = gameState;

    const state = {
      phase: gameState.phase,
      myCardCount: gameState.myCardCount,
      opponentCardCount: gameState.opponentCardCount,
      flippedCards: gameState.flippedCards,
      mySymbol: this.mySymbol,
      iHaveFlipped: gameState.iHaveFlipped,
      opponentHasFlipped: gameState.opponentHasFlipped,
      inWar: gameState.inWar,
      warCardCount: gameState.warCardCount,
      roundWinner: gameState.roundWinner,
      gameOver: gameState.gameOver,
      winner: gameState.winner
    };

    this.scene.updateState(state);

    // Show flipped cards if both players have flipped
    if (gameState.flippedCards.P1 && gameState.flippedCards.P2) {
      const myCard = gameState.flippedCards[this.mySymbol];
      const opponentSymbol = this.mySymbol === 'P1' ? 'P2' : 'P1';
      const opponentCard = gameState.flippedCards[opponentSymbol];
      this.scene.showFlippedCards(myCard, opponentCard);
    }

    // Show war cards if in war
    if (gameState.inWar && gameState.warCardCount > 0) {
      this.scene.showWarCards(gameState.warCardCount);
    }
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // Listen for state response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.initState(data.gameState);
      })
    );

    // Listen for moves
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        this.myId = this.socketService.getSocketId();
        this.audio.playGame('war', 'flip');
        this.updateScene(gameState);

        // Handle round result
        if (gameState.roundWinner && !gameState.inWar) {
          const isMe = gameState.roundWinner === this.mySymbol;
          setTimeout(() => {
            this.scene.showRoundResult(gameState.roundWinner, isMe);
            this.audio.playGame('war', 'win-round');
          }, 800);
        }

        // Handle war
        if (result?.war && result?.warInitiated) {
          this.audio.playGame('war', 'slide');
        }
      })
    );

    // Listen for game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner }) => {
        this.gameOver = true;
        this.myId = this.socketService.getSocketId();

        const myCount = this.lastState?.myCardCount || 0;
        const oppCount = this.lastState?.opponentCardCount || 0;

        this.scene.showGameOver(winner, this.myId, myCount, oppCount);
      })
    );

    // Listen for game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.scene.resetGame();
        this.initState(gameState);
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
