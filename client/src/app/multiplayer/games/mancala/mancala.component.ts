import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { MancalaScene } from '../../../games/mancala/mancala.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-mp-mancala',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './mancala.component.html',
  styleUrl: './mancala.component.scss'
})
export class MancalaMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: MancalaScene;
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

    this.scene = new MancalaScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 700,
      height: 400,
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
    this.scene.onPitClick = (pitIndex: number) => {
      this.gameStateService.makeMove(this.roomCode, pitIndex);
    };
  }

  private initBoard(gameState: any, players: any[]): void {
    this.myId = this.socketService.getSocketId();
    const myPlayerNum = gameState.playerNumber as 1 | 2;

    const myName = players.find((p: any) => p.id === this.myId)?.name || 'You';
    const opponentName = players.find((p: any) => p.id !== this.myId)?.name || 'Opponent';

    const p1Name = myPlayerNum === 1 ? myName : opponentName;
    const p2Name = myPlayerNum === 2 ? myName : opponentName;

    this.scene.setPlayer(myPlayerNum, p1Name, p2Name);
    this.scene.updateState({
      pits: gameState.pits,
      currentPlayer: gameState.currentPlayer,
      gameOver: gameState.gameOver,
      winner: null
    });
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // Listen for state response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.initBoard(data.gameState, data.players);
      })
    );

    // Listen for moves
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        this.myId = this.socketService.getSocketId();

        // Play sound based on result
        if (result?.captured) {
          this.audio.playGame('mancala', 'capture');
        } else if (result?.extraTurn) {
          this.audio.playGame('mancala', 'extra-turn');
        } else {
          this.audio.playGame('mancala', 'sow');
        }

        this.scene.updateState({
          pits: gameState.pits,
          currentPlayer: gameState.currentPlayer,
          gameOver: gameState.gameOver,
          winner: null,
          extraTurn: result?.extraTurn
        });
      })
    );

    // Listen for game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, isDraw }) => {
        this.gameOver = true;
        this.myId = this.socketService.getSocketId();

        // Determine winner as player number
        let winnerNum: 1 | 2 | null = null;
        if (!isDraw && winner) {
          // winner is a socket ID; compare to determine player number
          const myPlayerNum = winner === this.myId ? this.scene['myPlayer'] : (this.scene['myPlayer'] === 1 ? 2 : 1);
          winnerNum = winner === this.myId ? this.scene['myPlayer'] as 1 | 2 : (this.scene['myPlayer'] === 1 ? 2 : 1) as 1 | 2;
        }

        // Get scores from the current pits state
        const pits = this.scene['pits'] || [];
        const p1Score = pits[6] || 0;
        const p2Score = pits[13] || 0;

        this.scene.showGameOver(winnerNum, p1Score, p2Score);
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
