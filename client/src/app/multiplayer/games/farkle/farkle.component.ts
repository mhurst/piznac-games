import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import Phaser from 'phaser';
import { FarkleScene, FarkleVisualState, FarklePlayer } from '../../../games/farkle/farkle.scene';
import { scoreSelection, findScoringDiceIndices, hasScoringDice } from '../../../games/farkle/farkle-scoring';
import { SocketService } from '../../../core/socket.service';
import { GameStateService } from '../../../core/game-state.service';
import { LobbyService } from '../../../core/lobby.service';
import { AudioService } from '../../../core/audio/audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-farkle',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './farkle.component.html',
  styleUrl: './farkle.component.scss'
})
export class FarkleComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: FarkleScene;
  private subscriptions: Subscription[] = [];
  private roomCode = '';
  private myId = '';

  // State from server
  private players: { id: string; name: string }[] = [];
  private gameState: any = null;
  private selectedIndices: number[] = [];

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

    this.scene = new FarkleScene();

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
    this.scene.onDieClick = (index: number) => this.toggleSelect(index);
    this.scene.onRollClick = () => this.handleRollClick();
    this.scene.onBankClick = () => this.handleBankClick();
  }

  private handleRollClick(): void {
    if (this.selectedIndices.length > 0) {
      // Keep selected dice, then roll
      this.gameStateService.makeMove(this.roomCode, { type: 'keep', indices: this.selectedIndices });
      this.selectedIndices = [];
      // After keep succeeds, send a roll
      // The server will process keep first, then we roll on the next response
      setTimeout(() => {
        this.gameStateService.makeMove(this.roomCode, { type: 'roll' });
      }, 100);
    } else {
      // Just roll
      this.gameStateService.makeMove(this.roomCode, { type: 'roll' });
    }
  }

  private handleBankClick(): void {
    // If there are selected dice, keep them first
    if (this.selectedIndices.length > 0) {
      this.gameStateService.makeMove(this.roomCode, { type: 'keep', indices: this.selectedIndices });
      this.selectedIndices = [];
      setTimeout(() => {
        this.gameStateService.makeMove(this.roomCode, { type: 'bank' });
      }, 100);
    } else {
      this.gameStateService.makeMove(this.roomCode, { type: 'bank' });
    }
  }

  private toggleSelect(index: number): void {
    if (!this.gameState) return;
    if (this.gameState.currentPlayerId !== this.myId) return;
    if (!this.gameState.hasRolled) return;
    if (this.gameState.keptIndices.includes(index)) return;

    const idx = this.selectedIndices.indexOf(index);
    if (idx >= 0) {
      this.selectedIndices.splice(idx, 1);
    } else {
      this.selectedIndices.push(index);
    }
    this.audio.playGame('farkle', 'keep');
    this.updateSceneFromState();
  }

  private updateSceneFromState(): void {
    if (!this.gameState || !this.players.length) return;

    const isMyTurn = this.gameState.currentPlayerId === this.myId;
    const activeIndices = [];
    for (let i = 0; i < 6; i++) {
      if (!this.gameState.keptIndices.includes(i)) activeIndices.push(i);
    }
    const activeValues = activeIndices.filter(i => this.gameState.dice[i] > 0).map(i => this.gameState.dice[i]);

    let selectableIndices: number[] = [];
    if (isMyTurn && this.gameState.hasRolled) {
      const scoringLocal = findScoringDiceIndices(activeValues);
      const activeWithValues = activeIndices.filter(i => this.gameState.dice[i] > 0);
      selectableIndices = scoringLocal.map(li => activeWithValues[li]);
    }

    let rollScore = 0;
    if (this.selectedIndices.length > 0) {
      const selValues = this.selectedIndices.map(i => this.gameState.dice[i]);
      rollScore = scoreSelection(selValues).score;
    }

    const canRoll = isMyTurn && !this.gameState.hasRolled && this.selectedIndices.length === 0;
    const canKeep = isMyTurn && this.gameState.hasRolled && this.selectedIndices.length > 0 && rollScore > 0;
    const canBank = isMyTurn && this.gameState.turnScore > 0 && this.gameState.hasRolled;

    let message = '';
    if (this.gameState.gameOver) {
      const winner = this.players.find(p => p.id === this.gameState.winner);
      message = `Game Over! ${winner?.name || 'Unknown'} wins!`;
    } else if (isMyTurn) {
      if (!this.gameState.hasRolled) message = 'Your turn — roll the dice!';
      else if (this.selectedIndices.length > 0 && rollScore > 0) message = `Selected: +${rollScore} pts. Keep & Roll or Bank.`;
      else message = 'Select scoring dice, then Keep & Roll or Bank.';
    } else {
      const current = this.players.find(p => p.id === this.gameState.currentPlayerId);
      message = `${current?.name || 'Opponent'}'s turn...`;
    }

    const farklePlayers: FarklePlayer[] = this.gameState.players.map((p: any, i: number) => {
      const info = this.players.find(pl => pl.id === p.id);
      return {
        name: info?.name || `Player ${i + 1}`,
        totalScore: p.score,
        isCurrentTurn: i === this.gameState.currentPlayerIndex,
        isHuman: true
      };
    });

    const state: FarkleVisualState = {
      dice: this.gameState.dice,
      keptIndices: this.gameState.keptIndices,
      selectableIndices,
      selectedIndices: this.selectedIndices,
      players: farklePlayers,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      turnScore: this.gameState.turnScore,
      rollScore,
      canRoll,
      canBank,
      canKeep,
      isMyTurn,
      message,
      hotDice: false
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
        this.selectedIndices = [];
        this.updateSceneFromState();
      })
    );

    // Move made
    this.subscriptions.push(
      this.gameStateService.onMoveMade().subscribe(({ gameState, move, result }) => {
        this.myId = this.socketService.getSocketId();
        this.gameState = gameState;
        this.selectedIndices = [];

        if (result?.farkle) {
          this.audio.playGame('farkle', 'farkle');
          this.scene.showFarkle(() => {
            this.updateSceneFromState();
          });
          return;
        }

        if (result?.hotDice) {
          this.scene.showHotDice(() => {
            this.updateSceneFromState();
          });
          return;
        }

        // Animate roll if it was a roll action
        if (move?.type === 'roll' && result?.rollingIndices) {
          this.audio.playGame('farkle', 'roll');
          this.scene.animateRoll(gameState.dice, result.rollingIndices, () => {
            this.updateSceneFromState();
          });
          return;
        }

        if (move?.type === 'keep') {
          this.audio.playGame('farkle', 'keep');
        }
        if (move?.type === 'bank') {
          this.audio.playGame('farkle', 'bank');
        }

        this.updateSceneFromState();
      })
    );

    // Game over
    this.subscriptions.push(
      this.gameStateService.onGameOver().subscribe(({ winner }) => {
        this.gameOver = true;
        if (this.gameState) {
          const farklePlayers: FarklePlayer[] = this.gameState.players.map((p: any, i: number) => {
            const info = this.players.find(pl => pl.id === p.id);
            return {
              name: info?.name || `Player ${i + 1}`,
              totalScore: p.score,
              isCurrentTurn: false,
              isHuman: true
            };
          });
          const winnerIdx = this.gameState.players.findIndex((p: any) => p.id === winner);
          this.scene.showGameOver(farklePlayers, winnerIdx >= 0 ? winnerIdx : 0);
        }
      })
    );

    // Game start (rematch)
    this.subscriptions.push(
      this.lobbyService.onGameStart().subscribe(({ players, gameState }) => {
        this.gameOver = false;
        this.rematchRequested = false;
        this.players = players;
        this.gameState = gameState;
        this.selectedIndices = [];
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
