import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { PokerScene } from '../../../games/poker/poker.scene';
import { PokerVisualState, PokerPlayer, PokerPhase, PokerVariant, WildCardOption, POKER_VARIANTS, VARIANT_NAMES } from '../../../games/poker/poker-types';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-poker-mp',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './poker.component.html',
  styleUrl: './poker.component.scss'
})
export class PokerMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: PokerScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  // State from server
  private players: { id: string; name: string }[] = [];
  gameState: any = null;

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

    this.scene = new PokerScene();

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
    this.scene.onCheckClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'check' });
    };
    this.scene.onCallClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'call' });
    };
    this.scene.onRaiseClick = (amount: number) => {
      this.gameStateService.makeMove(this.roomCode, { type: 'raise', amount });
    };
    this.scene.onFoldClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'fold' });
    };
    this.scene.onAllInClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'allin' });
    };
    this.scene.onDiscardClick = (indices: number[]) => {
      this.gameStateService.makeMove(this.roomCode, { type: 'discard', cardIndices: indices });
    };
    this.scene.onStandPatClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'stand-pat' });
    };
    this.scene.onVariantSelect = (variant: PokerVariant) => {
      this.gameStateService.makeMove(this.roomCode, { type: 'choose-variant', variant });
    };
    this.scene.onWildCardSelect = (wilds: WildCardOption[], lastCardDown?: boolean) => {
      this.gameStateService.makeMove(this.roomCode, { type: 'choose-wilds', wilds, lastCardDown });
    };
    this.scene.onBuyInClick = () => {
      this.gameStateService.makeMove(this.roomCode, { type: 'buy-in' });
    };
  }

  private getMyPlayer(): any {
    if (!this.gameState) return null;
    return this.gameState.players.find((p: any) => p.id === this.myId);
  }

  private getMaxDiscards(): number {
    const myPlayer = this.getMyPlayer();
    if (!myPlayer || !myPlayer.hand) return 3;
    const wilds = this.gameState?.activeWilds || [];
    const hasAceOrWild = myPlayer.hand.some((c: any) => {
      if (c.value === 'A') return true;
      if (c.faceDown) return false;
      // Check wild status
      if (c.suit === 'joker') return true;
      if (wilds.includes('one-eyed-jacks') && c.value === 'J' && (c.suit === 'spades' || c.suit === 'hearts')) return true;
      if (wilds.includes('suicide-king') && c.value === 'K' && c.suit === 'hearts') return true;
      if (wilds.includes('deuces') && c.value === '2') return true;
      return false;
    });
    return hasAceOrWild ? 4 : 3;
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
      this.gameStateService.onMoveMade().subscribe(({ gameState, move, result }) => {
        this.myId = this.socketService.getSocketId();
        this.gameState = gameState;

        // Play sound effects based on action
        if (result?.action === 'deal' || result?.action === 'discard') {
          this.audio.playGame('poker', 'deal');
        } else if (result?.action === 'call' || result?.action === 'raise' || result?.action === 'allin') {
          this.audio.playGame('poker', 'chips');
        } else if (result?.action === 'check') {
          this.audio.playGame('poker', 'check');
        } else if (result?.action === 'fold') {
          this.audio.playGame('poker', 'fold');
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
    const phase = this.gameState.phase as PokerPhase;
    const bettingPhases = ['betting1', 'betting2', 'betting3', 'betting4', 'betting5'];
    const isBettingPhase = bettingPhases.includes(phase) && isMyTurn;
    const isStudGame = this.gameState.isStud || false;
    const isHoldemGame = this.gameState.isHoldem || false;
    const isDrawPhase = phase === 'draw' && isMyTurn;
    const isShowdown = phase === 'showdown' || phase === 'settlement';

    const callAmount = this.gameState.callAmount || 0;
    const myChips = myPlayer?.chips || 0;

    const isVariantSelect = phase === 'variant-select';
    const isWildSelect = phase === 'wild-select';
    const dealerId = this.gameState.dealerPlayerId;
    const isDealerForSelect = isVariantSelect && dealerId === this.myId;
    const isDealerForWildSelect = isWildSelect && dealerId === this.myId;

    let message = '';
    if (this.gameState.gameOver) {
      const winnerPlayer = this.players.find(p => p.id === this.gameState.winner);
      message = winnerPlayer ? `${winnerPlayer.name} wins!` : 'Game Over!';
    } else if (isWildSelect) {
      if (isDealerForWildSelect) {
        message = "Choose wild cards (or deal with none)!";
      } else {
        const dealerInfo = this.players.find(p => p.id === dealerId);
        message = `${dealerInfo?.name || 'Dealer'} is choosing wild cards...`;
      }
    } else if (isVariantSelect) {
      if (isDealerForSelect) {
        message = "Your deal — choose the game!";
      } else {
        const dealerInfo = this.players.find(p => p.id === dealerId);
        message = `${dealerInfo?.name || 'Dealer'} is choosing the game...`;
      }
    } else if (phase === 'ante') {
      message = '';
    } else if (phase === 'dealing') {
      message = 'Dealing cards...';
    } else if (bettingPhases.includes(phase)) {
      if (isMyTurn) {
        if (isStudGame) {
          const streetNames: Record<number, string> = { 3: '3rd Street', 4: '4th Street', 5: '5th Street', 6: '6th Street', 7: '7th Street' };
          const street = this.gameState.currentStreet || 3;
          message = `${streetNames[street] || 'Betting'} — Your turn`;
        } else if (isHoldemGame) {
          const holdemStreets: Record<string, string> = {
            'betting1': 'Preflop', 'betting2': 'Flop', 'betting3': 'Turn', 'betting4': 'River'
          };
          message = `${holdemStreets[phase] || 'Betting'} — Your turn`;
        } else {
          const round = phase === 'betting1' ? 'Round 1' : 'Round 2';
          message = `${round} — Your turn`;
        }
      } else {
        const current = this.players.find(p => p.id === this.gameState.currentPlayerId);
        message = `${current?.name || 'Opponent'} is thinking...`;
      }
    } else if (phase === 'draw') {
      if (isMyTurn) {
        message = 'Select cards to discard';
      } else {
        const current = this.players.find(p => p.id === this.gameState.currentPlayerId);
        message = `${current?.name || 'Opponent'} is drawing...`;
      }
    } else if (isShowdown) {
      if (myPlayer?.result === 'win') message = `You win! (+$${myPlayer.payout})`;
      else if (myPlayer?.result === 'split') message = `Split pot! (+$${myPlayer.payout})`;
      else if (myPlayer?.result === 'lose') message = 'You lose!';
      else message = 'Hand complete';
    }

    const pokerPlayers: PokerPlayer[] = this.gameState.players.map((p: any) => {
      const info = this.players.find(pl => pl.id === p.id);
      return {
        id: p.id,
        name: p.id === this.myId ? 'YOU' : (info?.name || p.name || 'Player'),
        chips: p.chips,
        hand: p.hand,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        isDealer: p.isDealer,
        isActive: p.isActive,
        result: p.result,
        payout: p.payout,
        handResult: p.handResult,
        hasActed: p.hasActed
      };
    });

    const state: PokerVisualState = {
      phase,
      players: pokerPlayers,
      myIndex: myIndex >= 0 ? myIndex : 0,
      currentPlayerIndex: this.gameState.players.findIndex((p: any) => p.id === this.gameState.currentPlayerId),
      pot: this.gameState.pot || 0,
      pots: this.gameState.pots || [],
      dealerIndex: this.gameState.dealerIndex,
      message,
      canCheck: isBettingPhase && callAmount === 0,
      canCall: isBettingPhase && callAmount > 0 && myChips >= callAmount,
      canRaise: isBettingPhase && myChips > callAmount + (this.gameState.minRaise || 5),
      canFold: isBettingPhase,
      canAllIn: isBettingPhase && myChips > 0,
      callAmount,
      minRaise: this.gameState.minRaise || 5,
      maxRaise: Math.max(0, myChips - callAmount),
      isDrawPhase,
      canDiscard: isDrawPhase,
      maxDiscards: this.getMaxDiscards(),
      isBetting: isBettingPhase,
      isShowdown,
      wonByFold: this.gameState.wonByFold || false,
      isVariantSelect,
      isDealerForSelect,
      variantName: this.gameState.variantName || "DEALER'S CHOICE",
      availableVariants: POKER_VARIANTS,
      isWildSelect,
      isDealerForWildSelect,
      activeWilds: this.gameState.activeWilds || [],
      isBuyIn: phase === 'ante' && (!myPlayer || !myPlayer.hand || myPlayer.hand.length === 0),
      currentStreet: this.gameState.currentStreet || 0,
      lastCardDown: this.gameState.lastCardDown || false,
      isStud: isStudGame,
      communityCards: this.gameState.communityCards || [],
      isHoldem: isHoldemGame,
      smallBlindIndex: this.gameState.smallBlindIndex ?? -1,
      bigBlindIndex: this.gameState.bigBlindIndex ?? -1
    };

    this.scene.updateState(state);
  }

  nextHand(): void {
    this.gameStateService.makeMove(this.roomCode, { type: 'next-hand' });
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
