import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { BlackjackScene, BlackjackVisualState, BlackjackPlayerHand } from '../../../games/blackjack/blackjack.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-blackjack-mp',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './blackjack.component.html',
  styleUrl: './blackjack.component.scss'
})
export class BlackjackMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: BlackjackScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  // State from server
  private players: { id: string; name: string }[] = [];
  gameState: any = null;
  private currentBet = 0;
  private hasBet = false;

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

    this.scene = new BlackjackScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 990,
      height: 748,
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
    this.scene.onHitClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'hit' });
    };
    this.scene.onStandClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'stand' });
    };
    this.scene.onDoubleDownClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'double' });
    };
    this.scene.onDealClick = () => {
      if (this.currentBet > 0 && !this.hasBet) {
        this.hasBet = true;
        this.gameStateService.makeMove(this.roomCode, { type: 'bet', amount: this.currentBet });
      }
    };
    this.scene.onBetChange = (amount: number) => {
      if (this.hasBet) return;
      const myPlayer = this.getMyPlayer();
      if (!myPlayer) return;
      if (this.currentBet + amount > myPlayer.chips + myPlayer.bet) return;
      this.currentBet += amount;
      this.audio.playGame('blackjack', 'chips');
      this.updateSceneFromState();
    };
    this.scene.onClearBet = () => {
      if (this.hasBet) return;
      this.currentBet = 0;
      this.updateSceneFromState();
    };
  }

  private getMyPlayer(): any {
    if (!this.gameState) return null;
    return this.gameState.players.find((p: any) => p.id === this.myId);
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // State response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.players = data.players;
        this.gameState = data.gameState;
        this.currentBet = 0;
        this.hasBet = false;
        this.updateSceneFromState();
      })
    );

    // Move made
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, move, result }) => {
        this.myId = this.socketService.getSocketId();
        this.gameState = gameState;

        if (result?.newRound) {
          this.currentBet = 0;
          this.hasBet = false;
        }

        if (result?.allBet && result?.dealt) {
          this.audio.playGame('blackjack', 'deal');
        }

        if (result?.doubled) {
          this.audio.playGame('blackjack', 'chips');
        } else if (result?.card) {
          this.audio.playGame('blackjack', 'hit');
        }

        this.updateSceneFromState();
      })
    );

    // Game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner }) => {
        this.gameOver = true;
        this.updateSceneFromState();
        const winnerPlayer = this.players.find(p => p.id === winner);
        const message = winnerPlayer
          ? (winner === this.myId ? 'You win the game!' : `${winnerPlayer.name} wins!`)
          : 'Game Over!';
        this.scene.showGameOver(message);
      })
    );

    // Game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.players = players;
        this.gameState = gameState;
        this.currentBet = 0;
        this.hasBet = false;
        this.scene.resetGame();
        this.updateSceneFromState();
      })
    );

    // Rematch request
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

  private updateSceneFromState(): void {
    if (!this.gameState || !this.players.length) return;

    const isMyTurn = this.gameState.currentPlayerId === this.myId;
    const myPlayer = this.getMyPlayer();
    const myIndex = this.gameState.players.findIndex((p: any) => p.id === this.myId);

    const phase = this.gameState.phase;
    const isBetting = phase === 'betting' && !this.hasBet && !myPlayer?.isEliminated;

    let message = '';
    if (this.gameState.gameOver) {
      const winnerPlayer = this.players.find(p => p.id === this.gameState.winner);
      message = winnerPlayer ? `${winnerPlayer.name} wins!` : 'Game Over!';
    } else if (phase === 'betting') {
      if (this.hasBet) {
        message = 'Waiting for others to bet...';
      } else {
        message = 'Place your bet!';
      }
    } else if (phase === 'playerTurn') {
      if (isMyTurn) {
        message = 'Your turn — Hit, Stand, or Double Down';
      } else {
        const current = this.players.find(p => p.id === this.gameState.currentPlayerId);
        message = `${current?.name || 'Opponent'}'s turn...`;
      }
    } else if (phase === 'dealerTurn') {
      message = 'Dealer is playing...';
    } else if (phase === 'settlement') {
      // Build result message for this player
      if (myPlayer?.result === 'win') message = 'You win!';
      else if (myPlayer?.result === 'blackjack') message = 'Blackjack! You win!';
      else if (myPlayer?.result === 'lose') message = 'You lose!';
      else if (myPlayer?.result === 'push') message = 'Push!';
      else message = 'Round complete';
    }

    const playerHands: BlackjackPlayerHand[] = this.gameState.players.map((p: any) => {
      const info = this.players.find(pl => pl.id === p.id);
      const isActivePlayer = phase === 'playerTurn' && p.id === this.gameState.currentPlayerId;
      return {
        name: p.id === this.myId ? 'YOU' : (info?.name || 'Player'),
        cards: p.hand.map((c: any) => ({ suit: c.suit, value: c.value })),
        total: p.total,
        busted: p.busted,
        blackjack: p.blackjack,
        done: p.done,
        bet: p.bet,
        chips: p.chips,
        isActive: isActivePlayer,
        result: p.result,
        payout: p.payout
      };
    });

    const canAct = phase === 'playerTurn' && isMyTurn;

    const state: BlackjackVisualState = {
      phase,
      dealer: this.gameState.dealer,
      players: playerHands,
      myIndex: myIndex >= 0 ? myIndex : 0,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      message,
      canHit: canAct,
      canStand: canAct,
      canDouble: canAct && myPlayer?.hand.length === 2 && myPlayer?.chips >= myPlayer?.bet,
      canDeal: isBetting && this.currentBet > 0,
      currentBet: this.currentBet,
      isBetting
    };

    this.scene.updateState(state);
  }

  nextRound(): void {
    this.gameStateService.makeMove(this.roomCode, { type: 'next-round' });
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
