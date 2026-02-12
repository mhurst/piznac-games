import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { GoFishScene } from '../../../games/go-fish/go-fish.scene';
import { GoFishVisualState, GoFishPlayer, GoFishPhase, RANKS } from '../../../games/go-fish/go-fish-types';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-go-fish-mp',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './go-fish.component.html',
  styleUrl: './go-fish.component.scss'
})
export class GoFishMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: GoFishScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  // State from server
  private players: { id: string; name: string }[] = [];
  gameState: any = null;

  // Local selection state
  private selectedTargetIndex: number | null = null;
  private selectedRank: string | null = null;

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

    this.scene = new GoFishScene();

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
    this.scene.onPlayerClick = (index: number) => {
      this.selectedTargetIndex = index;
      this.updateSceneFromState();
    };

    this.scene.onRankClick = (rank: string) => {
      this.selectedRank = rank;
      this.updateSceneFromState();
    };

    this.scene.onAskClick = () => {
      if (this.selectedTargetIndex === null || this.selectedRank === null) return;
      if (!this.gameState) return;

      const targetPlayer = this.gameState.players[this.selectedTargetIndex];
      if (!targetPlayer) return;

      this.gameStateService.makeMove(this.roomCode, {
        type: 'ask',
        targetId: targetPlayer.id,
        rank: this.selectedRank
      });

      // Clear selection after asking
      this.selectedTargetIndex = null;
      this.selectedRank = null;
    };
  }

  private setupSocketListeners(): void {
    this.myId = this.socketService.getSocketId();

    // State response (initial load)
    this.subscriptions.push(
      this.socketService.on<{ players: any; gameState: any; error?: string }>('state-response').subscribe((data) => {
        if (data.error || !data.gameState) return;
        this.players = data.players;
        this.gameState = data.gameState;
        this.updateSceneFromState();
      })
    );

    // Move made
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, result }) => {
        this.myId = this.socketService.getSocketId();
        this.gameState = gameState;

        // Play sound effects
        if (result?.gotCards) {
          this.audio.playGame('go-fish', 'give');
        } else if (result?.gotCards === false) {
          this.audio.playGame('go-fish', 'fish');
        }
        if (result?.newBook) {
          this.audio.playGame('go-fish', 'book');
        }

        // Clear selection on new state
        this.selectedTargetIndex = null;
        this.selectedRank = null;

        this.updateSceneFromState();
      })
    );

    // Game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, isDraw }) => {
        this.gameOver = true;
        this.updateSceneFromState();
        let message: string;
        if (isDraw) {
          message = "It's a tie!";
        } else {
          const winnerPlayer = this.players.find(p => p.id === winner);
          message = winner === this.myId ? 'You win!' : `${winnerPlayer?.name || 'Opponent'} wins!`;
        }
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
        this.selectedTargetIndex = null;
        this.selectedRank = null;
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
    const myIndex = this.gameState.players.findIndex((p: any) => p.id === this.myId);
    const phase: GoFishPhase = this.gameState.phase;
    const lastAction = this.gameState.lastAction;

    // Build message
    let message = '';
    if (this.gameState.gameOver) {
      const winnerPlayer = this.players.find(p => p.id === this.gameState.winner);
      message = winnerPlayer ? `${winnerPlayer.name} wins!` : 'Game Over!';
    } else if (isMyTurn) {
      if (lastAction && lastAction.askerId === this.myId) {
        if (lastAction.gotCards) {
          message = `You got ${lastAction.cardsGiven} card(s)! Go again!`;
        } else if (lastAction.drewMatch) {
          message = `You drew the card you asked for! Go again!`;
        }
      }
      if (!message) {
        message = 'Your turn — pick a player and a rank!';
      }
    } else {
      const current = this.players.find(p => p.id === this.gameState.currentPlayerId);
      if (lastAction) {
        const askerName = this.players.find(p => p.id === lastAction.askerId)?.name || 'Someone';
        const targetName = lastAction.targetId === this.myId ? 'you' :
          (this.players.find(p => p.id === lastAction.targetId)?.name || 'someone');
        if (lastAction.gotCards) {
          message = `${askerName} took ${lastAction.cardsGiven} ${lastAction.rank}(s) from ${targetName}`;
        } else {
          message = `${askerName} asked for ${lastAction.rank}s — Go Fish!`;
        }
        if (lastAction.newBook) {
          message += ` Book of ${lastAction.newBook}s!`;
        }
      } else {
        message = `${current?.name || 'Opponent'} is thinking...`;
      }
    }

    const visualPlayers: GoFishPlayer[] = this.gameState.players.map((p: any) => {
      const info = this.players.find(pl => pl.id === p.id);
      return {
        id: p.id,
        name: p.id === this.myId ? 'YOU' : (info?.name || 'Player'),
        hand: p.hand,
        books: p.books,
        cardCount: p.cardCount,
        isActive: p.isActive
      };
    });

    const state: GoFishVisualState = {
      phase,
      players: visualPlayers,
      myIndex: myIndex >= 0 ? myIndex : 0,
      currentPlayerIndex: this.gameState.players.findIndex((p: any) => p.id === this.gameState.currentPlayerId),
      deckCount: this.gameState.deckCount,
      message,
      isMyTurn: isMyTurn && phase === 'playing',
      canAsk: isMyTurn && phase === 'playing' && this.selectedTargetIndex !== null && this.selectedRank !== null,
      selectedTargetIndex: this.selectedTargetIndex,
      selectedRank: this.selectedRank,
      lastAction: lastAction ? {
        askerId: lastAction.askerId,
        askerName: this.players.find(p => p.id === lastAction.askerId)?.name || '?',
        targetId: lastAction.targetId,
        targetName: this.players.find(p => p.id === lastAction.targetId)?.name || '?',
        rank: lastAction.rank,
        gotCards: lastAction.gotCards,
        cardsGiven: lastAction.cardsGiven,
        drewMatch: lastAction.drewMatch,
        newBook: lastAction.newBook
      } : null,
      newBook: lastAction?.newBook || null
    };

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
