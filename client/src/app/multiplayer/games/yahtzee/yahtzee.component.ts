import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { YahtzeeScene, YahtzeeVisualState, YahtzeePlayerState } from '../../../games/yahtzee/yahtzee.scene';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

type ScoreCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'chance' | 'yahtzee';

const ALL_CATEGORIES: ScoreCategory[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeOfAKind', 'fourOfAKind', 'fullHouse',
  'smallStraight', 'largeStraight', 'chance', 'yahtzee'
];

const TOP_CATS: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

@Component({
  selector: 'app-yahtzee-mp',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './yahtzee.component.html',
  styleUrl: './yahtzee.component.scss'
})
export class YahtzeeMpComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: YahtzeeScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';
  private playersSetup = false;

  // State from server
  private players: { id: string; name: string }[] = [];
  private gameState: any = null;

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

    this.scene = new YahtzeeScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 900,
      height: 600,
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
    this.scene.onDieClick = (index: number) => this.toggleHold(index);
    this.scene.onRollClick = () => this.handleRollClick();
    this.scene.onScoreClick = (category: string) => this.handleScoreClick(category);
  }

  private handleRollClick(): void {
    if (!this.gameState) return;
    if (this.gameState.currentPlayerId !== this.myId) return;
    if (this.gameState.rollsLeft <= 0) return;

    this.gameStateService.makeMove(this.roomCode, { type: 'roll' });
  }

  private toggleHold(index: number): void {
    if (!this.gameState) return;
    if (this.gameState.currentPlayerId !== this.myId) return;
    if (this.gameState.rollsLeft >= 3 || this.gameState.rollsLeft <= 0) return;

    // Toggle held state locally and send to server
    const newHeld = [...this.gameState.held];
    newHeld[index] = !newHeld[index];
    this.gameStateService.makeMove(this.roomCode, { type: 'hold', held: newHeld });
  }

  private handleScoreClick(category: string): void {
    if (!this.gameState) return;
    if (this.gameState.currentPlayerId !== this.myId) return;
    if (this.gameState.rollsLeft >= 3) return;

    // Check if this category is already locked for me
    const myIndex = this.getMyIndex();
    if (myIndex < 0) return;
    const myPlayer = this.gameState.players[myIndex];
    if (myPlayer.lockedScores[category] !== null) return;

    this.gameStateService.makeMove(this.roomCode, { type: 'score', category });
  }

  private getMyIndex(): number {
    if (!this.gameState) return -1;
    return this.gameState.players.findIndex((p: any) => p.id === this.myId);
  }

  private setupPlayerNames(): void {
    if (this.playersSetup) return;
    if (!this.players.length || !this.gameState?.players?.length) return;

    const names = this.gameState.players.map((p: any) => {
      if (p.id === this.myId) return 'You';
      const info = this.players.find((pl: any) => pl.id === p.id);
      return info?.name || 'Player';
    });

    this.scene.setupPlayers(names);
    this.playersSetup = true;
  }

  private calculateCurrentScores(): Record<string, number> {
    if (!this.gameState) return {};
    const myIndex = this.getMyIndex();
    if (myIndex < 0) return {};
    const myPlayer = this.gameState.players[myIndex];
    if (this.gameState.rollsLeft >= 3) return {};

    const dice: number[] = this.gameState.dice;
    if (!dice || dice.every((d: number) => d === 0)) return {};

    const scores: Record<string, number> = {};
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) counts[d]++;
    const sum = dice.reduce((a: number, b: number) => a + b, 0);
    const maxCount = Math.max(...counts.slice(1));

    for (const cat of ALL_CATEGORIES) {
      if (myPlayer.lockedScores[cat] !== null) continue;
      let score = 0;
      switch (cat) {
        case 'ones': score = counts[1] * 1; break;
        case 'twos': score = counts[2] * 2; break;
        case 'threes': score = counts[3] * 3; break;
        case 'fours': score = counts[4] * 4; break;
        case 'fives': score = counts[5] * 5; break;
        case 'sixes': score = counts[6] * 6; break;
        case 'threeOfAKind': score = maxCount >= 3 ? sum : 0; break;
        case 'fourOfAKind': score = maxCount >= 4 ? sum : 0; break;
        case 'fullHouse': {
          const has3 = counts.slice(1).some(c => c === 3);
          const has2 = counts.slice(1).some(c => c === 2);
          score = has3 && has2 ? 25 : 0;
          break;
        }
        case 'smallStraight': score = this.hasConsecutive(dice, 4) ? 30 : 0; break;
        case 'largeStraight': score = this.hasConsecutive(dice, 5) ? 40 : 0; break;
        case 'chance': score = sum; break;
        case 'yahtzee': score = maxCount === 5 ? 50 : 0; break;
      }
      scores[cat] = score;
    }
    return scores;
  }

  private hasConsecutive(dice: number[], needed: number): boolean {
    const unique = new Set(dice);
    const sequences = needed === 4
      ? [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]
      : [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
    return sequences.some(seq => seq.every(n => unique.has(n)));
  }

  private updateSceneFromState(): void {
    if (!this.gameState || !this.players.length) return;

    this.setupPlayerNames();

    const myIndex = this.getMyIndex();
    const isMyTurn = this.gameState.currentPlayerId === this.myId;
    const currentScores = isMyTurn ? this.calculateCurrentScores() : {};

    const yahtzPlayers: YahtzeePlayerState[] = this.gameState.players.map((p: any) => {
      const info = this.players.find((pl: any) => pl.id === p.id);
      return {
        name: p.id === this.myId ? 'You' : (info?.name || 'Player'),
        lockedScores: p.lockedScores,
        topTotal: p.topTotal,
        topBonus: p.topBonus,
        totalScore: p.totalScore
      };
    });

    const state: YahtzeeVisualState = {
      dice: this.gameState.dice,
      held: this.gameState.held,
      rollsLeft: this.gameState.rollsLeft,
      round: this.gameState.round,
      currentScores,
      players: yahtzPlayers,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      myIndex,
      isMyTurn
    };
    this.scene.updateState(state);
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

        // Animate roll if it was a roll action
        if (move?.type === 'roll' && result?.rollingIndices) {
          this.audio.playGame('yahtzee', 'roll');
          this.scene.animateRoll(gameState.dice, gameState.held, () => {
            this.updateSceneFromState();
          });
          return;
        }

        if (move?.type === 'hold') {
          this.audio.playGame('yahtzee', 'hold');
        }

        if (move?.type === 'score') {
          this.audio.playGame('yahtzee', 'score');
          // Flash the scored category for the player who scored
          const scoringPlayerIndex = gameState.players.findIndex((p: any) => {
            return p.lockedScores[(result as any)?.category] !== null &&
              p.lockedScores[(result as any)?.category] !== undefined;
          });
          // Actually we need the index of the player who just scored
          // The move was made by the previous current player (before turn advanced)
          // We can find them by looking at who has the freshly scored category
          if ((result as any)?.category) {
            // The player who scored is the one before current (since turn advanced)
            const prevIndex = (gameState.currentPlayerIndex - 1 + gameState.players.length) % gameState.players.length;
            this.scene.flashScoreRow((result as any).category, prevIndex);
          }
        }

        this.updateSceneFromState();
      })
    );

    // Game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner }) => {
        this.gameOver = true;
        if (this.gameState) {
          const yahtzPlayers: YahtzeePlayerState[] = this.gameState.players.map((p: any) => {
            const info = this.players.find((pl: any) => pl.id === p.id);
            return {
              name: p.id === this.myId ? 'You' : (info?.name || 'Player'),
              lockedScores: p.lockedScores,
              topTotal: p.topTotal,
              topBonus: p.topBonus,
              totalScore: p.totalScore
            };
          });
          const winnerIdx = this.gameState.players.findIndex((p: any) => p.id === winner);
          this.scene.showGameOver(yahtzPlayers, winnerIdx >= 0 ? winnerIdx : 0);
        }
      })
    );

    // Game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.playersSetup = false;
        this.players = players;
        this.gameState = gameState;
        this.scene.resetGame();
        this.setupPlayerNames();
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
