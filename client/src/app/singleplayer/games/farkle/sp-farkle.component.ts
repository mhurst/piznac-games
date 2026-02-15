import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import Phaser from 'phaser';
import { FarkleScene, FarkleVisualState, FarklePlayer } from '../../../games/farkle/farkle.scene';
import { scoreSelection, hasScoringDice, findScoringDiceIndices, getAllScoringOptions } from '../../../games/farkle/farkle-scoring';
import { FarkleAI } from '../../../core/ai/farkle.ai';
import { AudioService } from '../../../core/audio/audio.service';
import { getRandomAINames } from '../../../core/ai/ai-names';

interface PlayerState {
  name: string;
  totalScore: number;
  isHuman: boolean;
}

@Component({
  selector: 'app-sp-farkle',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule, TitleCasePipe],
  templateUrl: './sp-farkle.component.html',
  styleUrl: './sp-farkle.component.scss'
})
export class SpFarkleComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: FarkleScene;
  private ai = new FarkleAI();

  // Game config
  difficulty = 'medium';
  opponentCount = '1';

  // Dice state
  private dice: number[] = [0, 0, 0, 0, 0, 0];
  private keptIndices: number[] = [];       // Dice already locked in (moved to kept row)
  private selectedIndices: number[] = [];   // Dice selected but not yet locked
  private hasRolled = false;

  // Players
  private players: PlayerState[] = [];
  private currentPlayerIndex = 0;
  private turnScore = 0;
  private aiPlaying = false;

  // UI state
  gameStarted = false;
  gameOver = false;

  constructor(
    private router: Router,
    private audio: AudioService
  ) {}

  ngAfterViewInit(): void {
    this.scene = new FarkleScene();
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1100,
      height: 748,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });
    this.scene.onReady = () => this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.scene.onDieClick = (index: number) => this.toggleSelect(index);
    this.scene.onRollClick = () => this.handleRollClick();
    this.scene.onBankClick = () => this.bankPoints();
  }

  startGame(): void {
    this.audio.init();
    this.gameStarted = true;
    this.gameOver = false;
    this.aiPlaying = false;

    const count = parseInt(this.opponentCount, 10);
    this.players = [{ name: 'You', totalScore: 0, isHuman: true }];
    const aiNames = getRandomAINames(count);
    for (let i = 0; i < count; i++) {
      this.players.push({ name: aiNames[i], totalScore: 0, isHuman: false });
    }

    this.currentPlayerIndex = 0;
    this.resetTurn();
    this.scene.resetGame();
    this.updateScene('Roll the dice to begin!');
  }

  // --- Human Actions ---

  private handleRollClick(): void {
    if (this.gameOver || this.aiPlaying) return;
    if (!this.players[this.currentPlayerIndex].isHuman) return;

    if (this.selectedIndices.length > 0) {
      // "Keep & Roll" — lock selected dice and roll remaining
      this.keepSelectedAndRoll();
    } else if (!this.hasRolled) {
      // First roll of the turn
      this.rollDice();
    }
  }

  private rollDice(): void {
    const rollingIndices = this.getActiveDiceIndices();
    if (rollingIndices.length === 0) return;

    const newDice = [...this.dice];
    for (const i of rollingIndices) {
      newDice[i] = this.randomDie();
    }

    this.audio.playGame('farkle', 'roll');
    this.scene.animateRoll(newDice, rollingIndices, () => {
      this.dice = newDice;
      this.hasRolled = true;
      this.selectedIndices = [];

      // Check for farkle
      const activeValues = rollingIndices.map(i => this.dice[i]);
      if (!hasScoringDice(activeValues)) {
        this.handleFarkle();
        return;
      }

      // Check if ALL active dice score → auto-keep for Hot Dice
      const allResult = scoreSelection(activeValues);
      if (allResult.score > 0) {
        this.turnScore += allResult.score;
        this.keptIndices.push(...rollingIndices);
        if (this.keptIndices.length === 6) {
          this.updateScene('All dice score — Hot Dice!');
          this.handleHotDice();
          return;
        }
      }

      this.updateScene('Select scoring dice, then Roll or Bank.');
    });
  }

  private keepSelectedAndRoll(): void {
    // Validate selection
    const selectedValues = this.selectedIndices.map(i => this.dice[i]);
    const result = scoreSelection(selectedValues);
    if (result.score === 0) {
      this.updateScene('Invalid selection — pick dice that score!');
      return;
    }

    // Lock selected dice into kept
    this.turnScore += result.score;
    this.keptIndices.push(...this.selectedIndices);
    this.selectedIndices = [];
    this.audio.playGame('farkle', 'keep');

    // Check for Hot Dice
    if (this.keptIndices.length === 6) {
      this.handleHotDice();
      return;
    }

    // Check if ALL remaining active dice score → auto-keep for Hot Dice
    const remainingIndices = this.getActiveDiceIndices();
    const remainingValues = remainingIndices.map(i => this.dice[i]);
    const remainingResult = scoreSelection(remainingValues);
    if (remainingResult.score > 0) {
      this.turnScore += remainingResult.score;
      this.keptIndices.push(...remainingIndices);
      if (this.keptIndices.length === 6) {
        this.updateScene('All dice score — Hot Dice!');
        this.handleHotDice();
        return;
      }
    }

    // Roll remaining
    const rollingIndices = this.getActiveDiceIndices();
    const newDice = [...this.dice];
    for (const i of rollingIndices) {
      newDice[i] = this.randomDie();
    }

    this.audio.playGame('farkle', 'roll');
    this.scene.animateRoll(newDice, rollingIndices, () => {
      this.dice = newDice;

      // Check farkle on new roll
      const activeValues = rollingIndices.map(i => this.dice[i]);
      if (!hasScoringDice(activeValues)) {
        this.handleFarkle();
        return;
      }

      // Check if ALL newly rolled dice score → auto-keep for Hot Dice
      const allResult = scoreSelection(activeValues);
      if (allResult.score > 0) {
        this.turnScore += allResult.score;
        this.keptIndices.push(...rollingIndices);
        if (this.keptIndices.length === 6) {
          this.updateScene('All dice score — Hot Dice!');
          this.handleHotDice();
          return;
        }
      }

      this.updateScene('Select scoring dice, then Roll or Bank.');
    });
  }

  private toggleSelect(index: number): void {
    if (this.gameOver || this.aiPlaying || !this.hasRolled) return;
    if (!this.players[this.currentPlayerIndex].isHuman) return;
    if (this.keptIndices.includes(index)) return;

    const idx = this.selectedIndices.indexOf(index);
    if (idx >= 0) {
      this.selectedIndices.splice(idx, 1);
    } else {
      this.selectedIndices.push(index);
    }
    this.audio.playGame('farkle', 'keep');
    this.updateSceneForSelection();
  }

  private bankPoints(): void {
    if (this.gameOver || this.aiPlaying) return;
    if (!this.players[this.currentPlayerIndex].isHuman) return;

    // Score selected dice first
    if (this.selectedIndices.length > 0) {
      const selectedValues = this.selectedIndices.map(i => this.dice[i]);
      const result = scoreSelection(selectedValues);
      if (result.score > 0) {
        this.turnScore += result.score;
        this.keptIndices.push(...this.selectedIndices);
        this.selectedIndices = [];
      }
    }

    // Auto-score any remaining scoring dice still in the scatter area
    const activeIndices = this.getActiveDiceIndices();
    if (activeIndices.length > 0) {
      const activeValues = activeIndices.map(i => this.dice[i]);
      const scoringLocalIndices = findScoringDiceIndices(activeValues);
      if (scoringLocalIndices.length > 0) {
        const scoringGlobalIndices = scoringLocalIndices.map(li => activeIndices[li]);
        const scoringValues = scoringGlobalIndices.map(i => this.dice[i]);
        const result = scoreSelection(scoringValues);
        if (result.score > 0) {
          this.turnScore += result.score;
          this.keptIndices.push(...scoringGlobalIndices);
        }
      }
    }

    if (this.turnScore <= 0) return;

    this.audio.playGame('farkle', 'bank');
    this.players[this.currentPlayerIndex].totalScore += this.turnScore;

    // Hit 10,000 — game over immediately
    if (this.players[this.currentPlayerIndex].totalScore >= 10000) {
      this.endGame();
      return;
    }

    this.scene.sweepDice(() => {
      this.advanceTurn();
    });
  }

  // --- Farkle & Hot Dice ---

  private handleFarkle(): void {
    this.turnScore = 0;
    this.updateScene('FARKLE! No scoring dice — turn lost!');
    setTimeout(() => {
      this.audio.playGame('farkle', 'farkle');
      this.scene.showFarkle(() => {
        this.scene.sweepDice(() => {
          this.advanceTurn();
        });
      });
    }, 400);
  }

  private handleHotDice(): void {
    // All 6 dice scored — reset and roll all 6 again
    this.scene.showHotDice(() => {
      this.keptIndices = [];
      this.selectedIndices = [];
      this.hasRolled = false;

      if (this.players[this.currentPlayerIndex].isHuman) {
        this.rollDice();
      } else {
        this.aiRoll();
      }
    });
  }

  // --- Turn Management ---

  private advanceTurn(): void {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.resetTurn();

    if (this.players[this.currentPlayerIndex].isHuman) {
      this.updateScene('Your turn — roll the dice!');
    } else {
      this.updateScene(`${this.players[this.currentPlayerIndex].name} is playing...`);
      setTimeout(() => this.doAiTurn(), 1000);
    }
  }

  // --- AI Turn ---

  private doAiTurn(): void {
    this.aiPlaying = true;
    this.updateScene(`${this.players[this.currentPlayerIndex].name} is rolling...`);
    this.aiRoll();
  }

  private aiRoll(): void {
    const rollingIndices = this.getActiveDiceIndices();
    if (rollingIndices.length === 0) return;

    const newDice = [...this.dice];
    for (const i of rollingIndices) {
      newDice[i] = this.randomDie();
    }

    this.audio.playGame('farkle', 'roll');
    this.scene.animateRoll(newDice, rollingIndices, () => {
      this.dice = newDice;
      this.hasRolled = true;

      // Check for farkle
      const activeValues = rollingIndices.map(i => this.dice[i]);
      if (!hasScoringDice(activeValues)) {
        this.turnScore = 0;
        this.updateScene(`${this.players[this.currentPlayerIndex].name} FARKLED!`);
        setTimeout(() => {
          this.audio.playGame('farkle', 'farkle');
          this.scene.showFarkle(() => {
            this.scene.sweepDice(() => {
              this.aiPlaying = false;
              this.advanceTurn();
            });
          });
        }, 600);
        return;
      }

      // AI picks what to keep
      setTimeout(() => this.aiKeepAndDecide(), 1200);
    });
  }

  private aiKeepAndDecide(): void {
    const activeIndices = this.getActiveDiceIndices();
    const activeValues = activeIndices.map(i => this.dice[i]);

    const opponentMax = this.getOpponentMaxScore();
    const keepIndices = this.ai.getKeepDecision(
      activeValues, this.turnScore,
      this.players[this.currentPlayerIndex].totalScore,
      opponentMax, this.difficulty
    );

    // Map AI's local indices back to global dice indices
    const globalKeepIndices = keepIndices.map(localIdx => activeIndices[localIdx]);
    const keepValues = globalKeepIndices.map(i => this.dice[i]);
    const keepScore = scoreSelection(keepValues).score;

    if (keepScore === 0) {
      // Fallback: take the best option
      const options = getAllScoringOptions(activeValues);
      if (options.length > 0) {
        const fallbackGlobal = options[0].indices.map(localIdx => activeIndices[localIdx]);
        this.aiCommitKeep(fallbackGlobal, options[0].score);
        return;
      }
      // Should never happen — we already checked hasScoringDice
      this.aiPlaying = false;
      this.advanceTurn();
      return;
    }

    this.aiCommitKeep(globalKeepIndices, keepScore);
  }

  private aiCommitKeep(indices: number[], score: number): void {
    this.turnScore += score;
    this.keptIndices.push(...indices);
    this.selectedIndices = [];
    this.audio.playGame('farkle', 'keep');
    this.updateScene(`${this.players[this.currentPlayerIndex].name} kept dice (+${score})`);

    // Check for Hot Dice
    if (this.keptIndices.length === 6) {
      setTimeout(() => this.handleHotDice(), 800);
      return;
    }

    // Decide: bank or roll again?
    const remaining = this.getActiveDiceIndices().length;
    const opponentMax = this.getOpponentMaxScore();
    const shouldBank = this.ai.shouldBank(
      this.turnScore,
      this.players[this.currentPlayerIndex].totalScore,
      remaining, opponentMax, this.difficulty
    );

    // If banking would win, always bank
    const wouldWin = this.players[this.currentPlayerIndex].totalScore + this.turnScore >= 10000;

    if (shouldBank || wouldWin) {
      setTimeout(() => {
        this.audio.playGame('farkle', 'bank');
        this.players[this.currentPlayerIndex].totalScore += this.turnScore;

        this.updateScene(`${this.players[this.currentPlayerIndex].name} banked ${this.turnScore} points!`);

        // Hit 10,000 — game over immediately
        if (this.players[this.currentPlayerIndex].totalScore >= 10000) {
          this.aiPlaying = false;
          setTimeout(() => this.endGame(), 800);
          return;
        }

        this.scene.sweepDice(() => {
          this.aiPlaying = false;
          this.advanceTurn();
        });
      }, 1000);
    } else {
      // Roll again
      setTimeout(() => {
        this.updateScene(`${this.players[this.currentPlayerIndex].name} is rolling again...`);
        setTimeout(() => this.aiRoll(), 600);
      }, 800);
    }
  }

  // --- Helpers ---

  private getActiveDiceIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (!this.keptIndices.includes(i)) indices.push(i);
    }
    return indices;
  }

  private getOpponentMaxScore(): number {
    let max = 0;
    for (let i = 0; i < this.players.length; i++) {
      if (i !== this.currentPlayerIndex) {
        max = Math.max(max, this.players[i].totalScore);
      }
    }
    return max;
  }

  private resetTurn(): void {
    this.dice = [0, 0, 0, 0, 0, 0];
    this.keptIndices = [];
    this.selectedIndices = [];
    this.turnScore = 0;
    this.hasRolled = false;
  }

  private randomDie(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private endGame(): void {
    this.gameOver = true;
    this.aiPlaying = false;

    // Find the winner
    let winnerIdx = 0;
    for (let i = 1; i < this.players.length; i++) {
      if (this.players[i].totalScore > this.players[winnerIdx].totalScore) {
        winnerIdx = i;
      }
    }

    const farklePlayers: FarklePlayer[] = this.players.map((p, i) => ({
      name: p.name,
      totalScore: p.totalScore,
      isCurrentTurn: false,
      isHuman: p.isHuman
    }));

    this.updateScene(`Game Over! ${this.players[winnerIdx].name} wins!`);
    setTimeout(() => this.scene.showGameOver(farklePlayers, winnerIdx), 400);
  }

  // --- Scene Updates ---

  private updateScene(message: string): void {
    const isHumanTurn = this.players[this.currentPlayerIndex]?.isHuman ?? false;
    const activeIndices = this.getActiveDiceIndices();
    const activeValues = activeIndices.map(i => this.dice[i]).filter(v => v > 0);

    // Determine selectable indices (only for human, only active unselected scoring dice)
    let selectableIndices: number[] = [];
    if (isHumanTurn && this.hasRolled) {
      const scoringLocalIndices = findScoringDiceIndices(activeValues);
      selectableIndices = scoringLocalIndices.map(li => activeIndices[li]);
    }

    // Determine roll score preview (from selected dice)
    let rollScore = 0;
    if (this.selectedIndices.length > 0) {
      const selValues = this.selectedIndices.map(i => this.dice[i]);
      rollScore = scoreSelection(selValues).score;
    }

    // Check if unselected active dice have scoring potential (for auto-score on bank)
    let hasActiveScoring = false;
    if (isHumanTurn && this.hasRolled) {
      const unselectedActive = activeIndices.filter(i => !this.selectedIndices.includes(i));
      if (unselectedActive.length > 0) {
        hasActiveScoring = hasScoringDice(unselectedActive.map(i => this.dice[i]));
      }
    }

    // Can roll: first roll OR has valid selected dice to lock before rolling
    const canRoll = isHumanTurn && !this.gameOver && !this.aiPlaying &&
      !this.hasRolled && this.selectedIndices.length === 0;

    // Can keep & roll: has valid selection
    const canKeep = isHumanTurn && !this.gameOver && !this.aiPlaying &&
      this.hasRolled && this.selectedIndices.length > 0 && rollScore > 0;

    // Can bank: has turn score, valid selected dice, or auto-scoreable active dice
    const canBank = isHumanTurn && !this.gameOver && !this.aiPlaying &&
      this.hasRolled && (this.turnScore > 0 || rollScore > 0 || hasActiveScoring);

    // Compute best melds text
    let bestMeldsText = '';
    if (isHumanTurn && this.hasRolled && activeValues.length > 0) {
      const scoringLocalIndices = findScoringDiceIndices(activeValues);
      if (scoringLocalIndices.length > 0) {
        bestMeldsText = scoringLocalIndices.map(li => activeValues[li]).join('; ');
      }
    }

    const state: FarkleVisualState = {
      dice: this.dice,
      keptIndices: this.keptIndices,
      selectableIndices: selectableIndices,
      selectedIndices: this.selectedIndices,
      players: this.players.map((p, i) => ({
        name: p.name,
        totalScore: p.totalScore,
        isCurrentTurn: i === this.currentPlayerIndex,
        isHuman: p.isHuman
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      turnScore: this.turnScore,
      rollScore,
      canRoll: !this.hasRolled && isHumanTurn && !this.gameOver && !this.aiPlaying,
      canBank,
      canKeep,
      isMyTurn: isHumanTurn && !this.aiPlaying,
      message,
      hotDice: false,
      bestMeldsText,
      localPlayerIndex: 0
    };
    this.scene.updateState(state);
  }

  private updateSceneForSelection(): void {
    // Quick update after selecting/deselecting a die
    const selValues = this.selectedIndices.map(i => this.dice[i]);
    const rollScore = scoreSelection(selValues).score;
    const msg = rollScore > 0
      ? `Selected: +${rollScore} pts. Roll or Bank.`
      : this.selectedIndices.length > 0
        ? 'Invalid selection — adjust your picks.'
        : 'Select scoring dice, then Roll or Bank.';
    this.updateScene(msg);
  }

  // --- UI ---

  newGame(): void {
    this.startGame();
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) this.phaserGame.destroy(true);
  }
}
