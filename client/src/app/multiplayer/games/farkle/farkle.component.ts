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
      width: 1100,
      height: 748,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.audio.init();
      this.setupGameCallbacks();
      this.setupSocketListeners();

      // Use buffered game-start data from lobby as initial state (avoids request-state race)
      const startData = this.lobbyService.lastGameStartData;
      if (startData && startData.gameState) {
        this.players = startData.players;
        this.gameState = startData.gameState;
        this.selectedIndices = [];
        this.updateSceneFromState();
      }
      // Also request state as backup (handles page refresh, reconnect scenarios)
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
      // Combined keep + roll in one atomic move (handles hot dice properly)
      this.gameStateService.makeMove(this.roomCode, { type: 'keep-and-roll', indices: this.selectedIndices });
      this.selectedIndices = [];
    } else {
      this.gameStateService.makeMove(this.roomCode, { type: 'roll' });
    }
  }

  private handleBankClick(): void {
    if (this.selectedIndices.length > 0) {
      // Combined keep + bank in one atomic move
      this.gameStateService.makeMove(this.roomCode, { type: 'keep-and-bank', indices: this.selectedIndices });
      this.selectedIndices = [];
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
    if (!this.gameState) return;

    // If players list hasn't loaded yet, derive from gameState and re-request
    if (!this.players.length) {
      this.players = this.gameState.players.map((p: any, i: number) => ({
        id: p.id,
        name: p.id === this.myId ? 'You' : `Player ${i + 1}`
      }));
      this.socketService.emit('request-state', { roomCode: this.roomCode });
    }

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

    // Compute auto-score for unselected active scoring dice (server will auto-score on bank)
    let autoScore = 0;
    if (isMyTurn && this.gameState.hasRolled) {
      const unselectedActive = activeIndices.filter(i => !this.selectedIndices.includes(i) && this.gameState.dice[i] > 0);
      if (unselectedActive.length > 0) {
        const unselectedValues = unselectedActive.map(i => this.gameState.dice[i]);
        const scoringLocal = findScoringDiceIndices(unselectedValues);
        if (scoringLocal.length > 0) {
          const scoringValues = scoringLocal.map(li => unselectedValues[li]);
          autoScore = scoreSelection(scoringValues).score;
        }
      }
    }

    const canRoll = isMyTurn && !this.gameState.hasRolled && this.selectedIndices.length === 0;
    const canKeep = isMyTurn && this.gameState.hasRolled && this.selectedIndices.length > 0 && rollScore > 0;
    const canBank = isMyTurn && this.gameState.hasRolled && (this.gameState.turnScore > 0 || rollScore > 0 || autoScore > 0);

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
      const name = current?.name || 'Opponent';
      if (!this.gameState.hasRolled) {
        message = `Waiting for ${name} to roll...`;
      } else {
        message = `${name} is playing...`;
      }
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

    // Compute best melds text
    let bestMeldsText = '';
    if (isMyTurn && this.gameState.hasRolled && activeValues.length > 0) {
      const scoringLocal = findScoringDiceIndices(activeValues);
      if (scoringLocal.length > 0) {
        bestMeldsText = scoringLocal.map(li => activeValues[li]).join('; ');
      }
    }

    const state: FarkleVisualState = {
      dice: this.gameState.dice,
      keptIndices: this.gameState.keptIndices,
      selectableIndices,
      selectedIndices: this.selectedIndices,
      players: farklePlayers,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      turnScore: this.gameState.turnScore,
      rollScore: rollScore + autoScore,
      canRoll,
      canBank,
      canKeep,
      isMyTurn,
      message,
      hotDice: false,
      bestMeldsText,
      localPlayerIndex: this.gameState.players.findIndex((p: any) => p.id === this.myId)
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
          if (move?.type === 'keep-and-roll') this.audio.playGame('farkle', 'keep');
          this.audio.playGame('farkle', 'roll');
          this.scene.animateRoll(result.dice as number[], result.rollingIndices as number[], () => {
            setTimeout(() => {
              this.audio.playGame('farkle', 'farkle');
              this.scene.showFarkle(() => {
                this.scene.sweepDice(() => {
                  this.updateSceneFromState();
                });
              });
            }, 400);
          });
          return;
        }

        if (result?.hotDice) {
          if (move?.type === 'keep-and-roll' || move?.type === 'keep') {
            this.audio.playGame('farkle', 'keep');
          }
          // Top-level safety: if the entire hot dice chain stalls, force-recover
          let hotDiceResolved = false;
          const resolveHotDice = () => {
            if (hotDiceResolved) return;
            hotDiceResolved = true;
            this.updateSceneFromState();
          };
          setTimeout(() => {
            if (!hotDiceResolved) {
              console.warn('[FARKLE MP] hot dice safety timeout — forcing update');
              resolveHotDice();
            }
          }, 6000);

          // If dice were rolled as part of this move, animate roll first, then show hot dice
          if (result?.rollingIndices && result?.dice) {
            this.audio.playGame('farkle', 'roll');
            this.scene.animateRoll(result.dice as number[], result.rollingIndices as number[], () => {
              setTimeout(() => {
                this.scene.showHotDice(() => {
                  this.scene.sweepDice(() => resolveHotDice());
                });
              }, 400);
            });
          } else {
            this.scene.showHotDice(() => {
              this.scene.sweepDice(() => resolveHotDice());
            });
          }
          return;
        }

        // Animate roll if dice were rolled
        if ((move?.type === 'roll' || move?.type === 'keep-and-roll') && result?.rollingIndices) {
          if (move?.type === 'keep-and-roll') this.audio.playGame('farkle', 'keep');
          this.audio.playGame('farkle', 'roll');
          this.scene.animateRoll(gameState.dice, result.rollingIndices, () => {
            this.updateSceneFromState();
          });
          return;
        }

        if (move?.type === 'keep') {
          this.audio.playGame('farkle', 'keep');
        }
        if (move?.type === 'bank' || move?.type === 'keep-and-bank') {
          if (move?.type === 'keep-and-bank') this.audio.playGame('farkle', 'keep');
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

    // Invalid move (server rejected our move)
    this.subscriptions.push(
      this.socketService.on<{ message: string }>('invalid-move').subscribe((data) => {
        console.warn('[FARKLE MP] invalid-move:', data.message);
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
