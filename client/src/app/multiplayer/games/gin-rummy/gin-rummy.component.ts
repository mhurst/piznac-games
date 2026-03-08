import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { GinRummyScene } from '../../../games/gin-rummy/gin-rummy.scene';
import { GinRummyVisualState, GinRummyPhase, findBestMelds } from '../../../games/gin-rummy/gin-rummy-types';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-gin-rummy-mp',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './gin-rummy.component.html',
  styleUrl: './gin-rummy.component.scss'
})
export class GinRummyMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: GinRummyScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  private players: { id: string; name: string }[] = [];
  gameState: any = null;

  private selectedCardIndex: number | null = null;

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

    this.scene = new GinRummyScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 700,
      height: 520,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#0b0b15',
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
    this.scene.onStockClick = () => {
      if (!this.gameState || this.gameState.currentPlayerId !== this.myId) return;
      if (this.gameState.phase !== 'drawing') return;
      this.gameStateService.makeMove(this.roomCode, { type: 'draw-stock' });
    };

    this.scene.onDiscardPileClick = () => {
      if (!this.gameState || this.gameState.currentPlayerId !== this.myId) return;
      if (this.gameState.phase !== 'drawing') return;
      this.gameStateService.makeMove(this.roomCode, { type: 'draw-discard' });
    };

    this.scene.onHandCardClick = (index: number) => {
      if (!this.gameState || this.gameState.currentPlayerId !== this.myId) return;
      if (this.gameState.phase !== 'discarding') return;
      this.selectedCardIndex = index;
      this.updateSceneFromState();
    };

    this.scene.onDiscardClick = () => {
      if (!this.gameState || this.gameState.currentPlayerId !== this.myId) return;
      if (this.selectedCardIndex === null) return;
      this.gameStateService.makeMove(this.roomCode, {
        type: 'discard',
        cardIndex: this.selectedCardIndex
      });
      this.selectedCardIndex = null;
    };

    this.scene.onGinClick = () => {
      if (!this.gameState || this.gameState.currentPlayerId !== this.myId) return;
      if (this.selectedCardIndex === null) return;
      this.gameStateService.makeMove(this.roomCode, {
        type: 'gin',
        cardIndex: this.selectedCardIndex
      });
      this.selectedCardIndex = null;
    };

    this.scene.onHandReorder = (order: number[]) => {
      if (!this.gameState?.myHand) return;
      this.gameState.myHand = order.map(i => this.gameState.myHand[i]);
      this.selectedCardIndex = null;
      this.updateSceneFromState();
    };
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.players = data.players;
        this.gameState = data.gameState;
        this.updateSceneFromState();
      })
    );

    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        this.myId = this.socketService.getSocketId();
        this.gameState = gameState;

        if (result?.source === 'stock' || result?.source === 'discard') {
          this.audio.playGame('gin-rummy', 'draw');
        }
        if (result?.discardedCard) {
          this.audio.playGame('gin-rummy', 'discard');
        }
        if (result?.gin) {
          this.audio.playGame('gin-rummy', 'gin');
          if (result.winnerId === this.myId) {
            this.audio.playGame('gin-rummy', 'win');
          } else {
            this.audio.playGame('gin-rummy', 'lose');
          }
        }
        this.selectedCardIndex = null;
        this.updateSceneFromState();
      })
    );

    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, isDraw }) => {
        this.gameOver = true;
        this.updateSceneFromState();
        if (isDraw) {
          this.scene.showGameOver("It's a draw!", 'Stock exhausted — no one got Gin');
        } else {
          const winnerPlayer = this.players.find(p => p.id === winner);
          const message = winner === this.myId ? 'You win!' : `${winnerPlayer?.name || 'Opponent'} wins!`;
          this.scene.showGameOver(message, 'Gin!');
        }
      })
    );

    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.players = players;
        this.gameState = gameState;
        this.selectedCardIndex = null;
        this.scene.resetGame();
        this.updateSceneFromState();
      })
    );

    this.subscriptions.push(
      this.gameStateService.onRematchRequested().subscribe(() => {})
    );

    this.subscriptions.push(
      this.lobbyService.onOpponentDisconnected().subscribe(() => {
        alert('Opponent disconnected!');
        this.router.navigate(['/']);
      })
    );
  }

  private updateSceneFromState(): void {
    if (!this.gameState || !this.players.length) return;

    const isMyTurn = this.gameState.currentPlayerId === this.myId;
    const phase: GinRummyPhase = this.gameState.phase;
    const opponentPlayer = this.players.find(p => p.id !== this.myId);
    const opponentId = opponentPlayer?.id;

    let message = '';
    if (this.gameState.gameOver) {
      const winnerPlayer = this.players.find(p => p.id === this.gameState.winner);
      message = winnerPlayer ? `${winnerPlayer.name} wins the game!` : 'Game Over!';
    } else if (isMyTurn) {
      message = phase === 'drawing' ? 'Your turn — draw from stock or discard pile' : 'Select a card to discard';
    } else {
      message = `${opponentPlayer?.name || 'Opponent'} is thinking...`;
    }

    // Check if player can gin (during discard phase with 11 cards)
    let canGin = false;
    if (isMyTurn && phase === 'discarding' && this.gameState.myHand.length === 11 && this.selectedCardIndex !== null) {
      const testHand = this.gameState.myHand.filter((_: any, i: number) => i !== this.selectedCardIndex);
      const result = findBestMelds(testHand);
      canGin = result.deadwoodPoints === 0;
    }

    const state: GinRummyVisualState = {
      phase,
      myHand: this.gameState.myHand || [],
      opponentCardCount: this.gameState.opponentCardCount || 0,
      stockCount: this.gameState.stockCount || 0,
      discardTop: this.gameState.discardTop,
      selectedCardIndex: this.selectedCardIndex,
      isMyTurn: isMyTurn && (phase === 'drawing' || phase === 'discarding'),
      canGin,
      message,
      myName: 'YOU',
      opponentName: opponentPlayer?.name || 'Opponent',
    };

    // Show opponent hand on game over
    if (phase === 'gameOver') {
      if (this.gameState.opponentHand) {
        state.opponentHand = this.gameState.opponentHand;
        const oppMelds = findBestMelds(this.gameState.opponentHand);
        state.opponentMelds = oppMelds.melds;
      }
      if (this.gameState.myHand) {
        const myMelds = findBestMelds(this.gameState.myHand);
        state.myMelds = myMelds.melds;
      }
    }

    this.scene.updateState(state);
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
