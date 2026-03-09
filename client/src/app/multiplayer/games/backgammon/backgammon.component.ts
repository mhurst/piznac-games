import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { BackgammonScene } from '../../../games/backgammon/backgammon.scene';
import { BackgammonMove, BackgammonVisualState, Color } from '../../../games/backgammon/backgammon-types';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-mp-backgammon',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './backgammon.component.html',
  styleUrl: './backgammon.component.scss'
})
export class BackgammonMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: BackgammonScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';
  private myColor: Color = 'W';

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
      this.audio.init();
      this.setupCallbacks();
      this.setupSocketListeners();
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    };
  }

  private setupCallbacks(): void {
    this.scene.onMoveSelected = (move: BackgammonMove) => {
      this.gameStateService.makeMove(this.roomCode, { type: 'move', from: move.from, to: move.to, die: move.die });
    };

    this.scene.onRollDice = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'roll' });
    };
  }

  private updateSceneFromState(gameState: any): void {
    this.myId = this.socketService.getSocketId();
    this.myColor = gameState.myColor;

    const isMyTurn = gameState.currentPlayerId === this.myId;

    const state: BackgammonVisualState = {
      board: gameState.board,
      bar: gameState.bar,
      borneOff: gameState.borneOff,
      dice: gameState.dice,
      remainingDice: gameState.remainingDice,
      currentPlayer: gameState.currentPlayer,
      isMyTurn,
      validMoves: gameState.validMoves || [],
      selectedPoint: null,
      phase: gameState.phase,
      message: '',
      myColor: gameState.myColor,
      myName: 'YOU',
      opponentName: 'Opponent',
      gameOver: gameState.gameOver,
      winner: gameState.winner === this.myId ? 'YOU' : (gameState.winner ? 'Opponent' : null),
      winType: gameState.winType
    };

    this.scene.updateState(state);
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // State response
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.updateSceneFromState(data.gameState);
      })
    );

    // Move made
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        if (result?.hit) {
          this.audio.playGame('backgammon', 'hit');
        } else if (result?.bearOff) {
          this.audio.playGame('backgammon', 'bearoff');
        } else if (result?.type === 'roll') {
          this.audio.playGame('backgammon', 'roll');
        } else if (result?.type === 'move') {
          this.audio.playGame('backgammon', 'move');
        }

        this.updateSceneFromState(gameState);
      })
    );

    // Game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner }) => {
        this.gameOver = true;
        this.myId = this.socketService.getSocketId();
      })
    );

    // Game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.scene.resetGame();
        this.updateSceneFromState(gameState);
      })
    );

    // Rematch
    this.subscriptions.push(
      this.gameStateService.onRematchRequested().subscribe(() => {})
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
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
