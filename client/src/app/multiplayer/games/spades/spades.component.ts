import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { SpadesScene } from '../../../games/spades/spades.scene';
import { SpadesVisualState, SpadesPhase, TEAM_FOR_SEAT } from '../../../games/spades/spades-types';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-spades-mp',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './spades.component.html',
  styleUrl: './spades.component.scss'
})
export class SpadesMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: SpadesScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

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

    this.scene = new SpadesScene();

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
    this.scene.onCardClick = (idx: number) => {
      if (!this.gameState) return;
      if (this.gameState.currentPlayer !== this.gameState.mySeat) return;
      if (this.gameState.phase !== 'playing') return;
      this.gameStateService.makeMove(this.roomCode, { type: 'play', cardIndex: idx });
    };

    this.scene.onBidSelect = (bid: number) => {
      if (!this.gameState) return;

      // Blind nil offer
      if (this.gameState.blindNilOffer) {
        if (bid === -1) {
          this.gameStateService.makeMove(this.roomCode, { type: 'blind-nil-accept' });
        } else if (bid === -2) {
          this.gameStateService.makeMove(this.roomCode, { type: 'blind-nil-decline' });
        }
        return;
      }

      // Normal bid
      if (this.gameState.phase !== 'bidding') return;
      if (this.gameState.currentPlayer !== this.gameState.mySeat) return;
      if (bid < 0) return; // ignore blind nil buttons during normal bidding
      this.gameStateService.makeMove(this.roomCode, { type: 'bid', amount: bid });
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

        if (result?.cardPlayed) {
          this.audio.playGame('spades', 'play');
        }
        if (result?.trickComplete) {
          this.audio.playGame('spades', 'trick');
        }

        this.updateSceneFromState();
      })
    );

    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner, isDraw }) => {
        this.gameOver = true;
        this.updateSceneFromState();
      })
    );

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

    this.subscriptions.push(
      this.gameStateService.onRematchRequested().subscribe(() => {})
    );

    this.subscriptions.push(
      this.lobbyService.onOpponentDisconnected().subscribe(() => {
        alert('A player disconnected!');
        this.router.navigate(['/']);
      })
    );
  }

  private updateSceneFromState(): void {
    if (!this.gameState || !this.players.length) return;

    const gs = this.gameState;
    const mySeat: number = gs.mySeat;
    const myTeam: number = gs.myTeam;

    // Map server phase to scene phase
    let phase: SpadesPhase = gs.phase as SpadesPhase;
    if (phase === 'blind-nil' as any) phase = 'bidding';

    // Build message
    let message = '';
    if (gs.gameOver) {
      message = gs.gameWinner === 'Your Team' ? 'Your team wins!' : 'Opponents win!';
    } else if (gs.phase === 'blind-nil') {
      if (gs.blindNilOffer) {
        message = 'Bid Blind Nil? (before seeing your cards)';
      } else {
        const waitSeat = gs.blindNilSeat;
        const waitPlayer = this.players[waitSeat];
        message = `${waitPlayer?.name || 'Player'} deciding on Blind Nil...`;
      }
    } else if (gs.phase === 'bidding') {
      if (gs.currentPlayer === mySeat) {
        message = 'Your bid';
      } else {
        const bidPlayer = this.players[gs.currentPlayer];
        message = `${bidPlayer?.name || 'Player'} is bidding...`;
      }
    } else if (gs.phase === 'playing') {
      if (gs.currentPlayer === mySeat) {
        message = 'Your turn — play a card';
      } else {
        const playPlayer = this.players[gs.currentPlayer];
        message = `${playPlayer?.name || 'Player'}'s turn...`;
      }
    } else if (gs.phase === 'roundEnd') {
      message = 'Round complete!';
    }

    // Build players array, rotated so mySeat appears at visual seat 0 (bottom)
    const visPlayers = gs.players.map((p: any) => {
      const relativeSeat = (p.seat - mySeat + 4) % 4;
      const info = this.players[p.seat];
      return {
        name: p.seat === mySeat ? 'You' : (info?.name || `Player ${p.seat + 1}`),
        seat: relativeSeat,
        cardCount: p.cardCount,
        bid: p.bid,
        tricksWon: p.tricksWon,
        isCurrentTurn: p.isCurrentTurn,
        isHuman: true,
        isPartner: TEAM_FOR_SEAT[p.seat] === myTeam && p.seat !== mySeat,
      };
    });

    // Rotate current trick seats too
    const rotatedTrick = gs.currentTrick.map((tc: any) => ({
      seat: (tc.seat - mySeat + 4) % 4,
      card: tc.card
    }));

    // Rotate other seat-based values
    const rotatedDealer = (gs.dealer - mySeat + 4) % 4;
    const rotatedCurrentPlayer = (gs.currentPlayer - mySeat + 4) % 4;
    const rotatedTrickLeader = (gs.trickLeader - mySeat + 4) % 4;

    // Rotate round summary nil results
    let rotatedSummary = gs.roundSummary;
    if (rotatedSummary) {
      // Swap team indices if mySeat is on team 1
      const teamSwap = myTeam === 1;
      rotatedSummary = {
        ...rotatedSummary,
        teamBids: teamSwap ? [rotatedSummary.teamBids[1], rotatedSummary.teamBids[0]] : rotatedSummary.teamBids,
        teamTricks: teamSwap ? [rotatedSummary.teamTricks[1], rotatedSummary.teamTricks[0]] : rotatedSummary.teamTricks,
        teamDeltas: teamSwap ? [rotatedSummary.teamDeltas[1], rotatedSummary.teamDeltas[0]] : rotatedSummary.teamDeltas,
        bagPenalty: teamSwap ? [rotatedSummary.bagPenalty[1], rotatedSummary.bagPenalty[0]] : rotatedSummary.bagPenalty,
        nilResults: rotatedSummary.nilResults.map((nr: any) => ({
          ...nr,
          seat: (nr.seat - mySeat + 4) % 4,
          name: nr.seat === mySeat ? 'You' : (this.players[nr.seat]?.name || `Player ${nr.seat + 1}`)
        }))
      };
    }

    // Rotate team scores so team 0 = my team
    const myTeamScores = myTeam === 0
      ? gs.teamScores
      : [gs.teamScores[1], gs.teamScores[0]];

    const state: SpadesVisualState = {
      phase,
      players: visPlayers.sort((a: any, b: any) => a.seat - b.seat),
      humanHand: gs.myHand || [],
      currentTrick: rotatedTrick,
      teamScores: myTeamScores,
      message,
      round: gs.round,
      dealer: rotatedDealer,
      currentPlayer: rotatedCurrentPlayer,
      spadesbroken: gs.spadesbroken,
      trickLeader: rotatedTrickLeader,
      roundSummary: rotatedSummary,
      gameWinner: gs.gameWinner,
      legalIndices: gs.legalIndices || [],
      blindNilOffer: gs.blindNilOffer || false,
    };

    this.scene.updateState(state);
  }

  get showNextRound(): boolean {
    return this.gameState?.phase === 'roundEnd' && !this.gameOver;
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
