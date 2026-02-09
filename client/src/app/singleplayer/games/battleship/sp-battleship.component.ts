import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import Phaser from 'phaser';
import { BattleshipScene, ShipPlacement, PlacedShip, SHIPS } from '../../../games/battleship/battleship.scene';
import { BattleshipAI } from '../../../core/ai/battleship.ai';
import { Difficulty, DEFAULT_AI_CONFIG } from '../../../core/ai/game-ai.interface';

const BOARD_SIZE = 10;

@Component({
  selector: 'app-sp-battleship',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, FormsModule],
  templateUrl: './sp-battleship.component.html',
  styleUrl: './sp-battleship.component.scss'
})
export class SpBattleshipComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef;

  private phaserGame!: Phaser.Game;
  private scene!: BattleshipScene;
  private readonly PLAYER_ID = 'player';
  private readonly AI_ID = 'ai';

  // Game state
  phase: 'menu' | 'setup' | 'battle' | 'gameover' = 'menu';
  difficulty: Difficulty = DEFAULT_AI_CONFIG.defaultDifficulty;
  gameStarted = false;
  gameOver = false;
  winner: string | null = null;
  playerScore = 0;
  aiScore = 0;

  // Player boards
  private playerShipsBoard: (string | null)[][] = [];
  private playerTrackingBoard: (string | null)[][] = [];
  private playerShips: Record<string, PlacedShip> = {};

  // AI boards
  private aiShipsBoard: (string | null)[][] = [];
  private aiTrackingBoard: (string | null)[][] = [];
  private aiShips: Record<string, PlacedShip> = {};

  // Turn management
  private isPlayerTurn = true;

  constructor(
    private router: Router,
    private ai: BattleshipAI
  ) {}

  ngAfterViewInit(): void {
    this.scene = new BattleshipScene();

    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 850,
      height: 620,
      parent: this.gameCanvas.nativeElement,
      backgroundColor: '#1a1a2e',
      scene: this.scene
    });

    this.scene.onReady = () => {
      this.setupGameCallbacks();
    };
  }

  private setupGameCallbacks(): void {
    // Ship placement during setup
    this.scene.onShipPlaced = (placement: ShipPlacement) => {
      this.placePlayerShip(placement);
    };

    // Auto-place button
    this.scene.onAutoPlace = () => {
      this.autoPlacePlayerShips();
    };

    // Setup complete (Ready button)
    this.scene.onSetupComplete = () => {
      this.startBattle();
    };

    // Cell click during battle
    this.scene.onCellClick = (row: number, col: number) => {
      if (this.phase === 'battle' && this.isPlayerTurn && !this.gameOver) {
        this.playerFire(row, col);
      }
    };
  }

  private initBoards(): void {
    this.playerShipsBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.playerTrackingBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.playerShips = {};

    this.aiShipsBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.aiTrackingBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.aiShips = {};
  }

  startGame(): void {
    this.gameStarted = true;
    this.gameOver = false;
    this.winner = null;
    this.phase = 'setup';
    this.initBoards();
    this.ai.reset();

    // Place AI ships immediately (hidden from player)
    this.placeAIShips();

    // Reset scene and show setup phase
    this.scene.resetGame();
    this.updateScene();
  }

  private placePlayerShip(placement: ShipPlacement): void {
    const shipConfig = SHIPS.find(s => s.type === placement.shipType);
    if (!shipConfig) return;

    // Remove old placement if repositioning
    if (this.playerShips[placement.shipType]) {
      this.removePlayerShip(placement.shipType);
    }

    // Place ship on board
    for (let i = 0; i < shipConfig.size; i++) {
      const row = placement.horizontal ? placement.row : placement.row + i;
      const col = placement.horizontal ? placement.col + i : placement.col;
      this.playerShipsBoard[row][col] = placement.shipType;
    }

    this.playerShips[placement.shipType] = {
      ...placement,
      size: shipConfig.size,
      hits: [],
      sunk: false
    };

    this.updateScene();
  }

  private removePlayerShip(shipType: string): void {
    const ship = this.playerShips[shipType];
    if (!ship) return;

    for (let i = 0; i < ship.size; i++) {
      const row = ship.horizontal ? ship.row : ship.row + i;
      const col = ship.horizontal ? ship.col + i : ship.col;
      this.playerShipsBoard[row][col] = null;
    }

    delete this.playerShips[shipType];
  }

  private autoPlacePlayerShips(): void {
    // Clear existing placements
    this.playerShipsBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.playerShips = {};

    // Use AI to generate placements
    const placements = this.ai.generateShipPlacements();
    for (const placement of placements) {
      this.placePlayerShip(placement);
    }
  }

  private placeAIShips(): void {
    const placements = this.ai.generateShipPlacements();
    for (const placement of placements) {
      const shipConfig = SHIPS.find(s => s.type === placement.shipType);
      if (!shipConfig) continue;

      for (let i = 0; i < shipConfig.size; i++) {
        const row = placement.horizontal ? placement.row : placement.row + i;
        const col = placement.horizontal ? placement.col + i : placement.col;
        this.aiShipsBoard[row][col] = placement.shipType;
      }

      this.aiShips[placement.shipType] = {
        ...placement,
        size: shipConfig.size,
        hits: [],
        sunk: false
      };
    }
  }

  private startBattle(): void {
    this.phase = 'battle';
    this.isPlayerTurn = true;
    this.updateScene();
  }

  private playerFire(row: number, col: number): void {
    if (this.playerTrackingBoard[row][col] !== null) return;  // Already fired here

    const target = this.aiShipsBoard[row][col];
    let hit = false;
    let sunk = false;
    let sunkShipType: string | null = null;

    if (target && target !== 'hit') {
      // Hit!
      hit = true;
      this.playerTrackingBoard[row][col] = 'hit';
      this.aiShipsBoard[row][col] = 'hit';

      // Record hit on ship
      const ship = this.aiShips[target];
      ship.hits.push({ row, col });

      // Check if sunk
      if (ship.hits.length === ship.size) {
        ship.sunk = true;
        sunk = true;
        sunkShipType = target;
      }
    } else {
      // Miss
      this.playerTrackingBoard[row][col] = 'miss';
    }

    // Update scene with result
    this.updateScene();
    this.scene.showHitResult(row, col, hit, sunk, sunkShipType);

    // Check for win
    if (this.checkAllShipsSunk(this.aiShips)) {
      this.handleGameOver(this.PLAYER_ID);
      return;
    }

    // If hit, player gets another turn. Only switch to AI on miss.
    if (!hit) {
      this.isPlayerTurn = false;
      this.updateScene();
      this.scheduleAITurn();
    }
  }

  private scheduleAITurn(): void {
    const delay = this.difficulty === 'hard' ? 1000 : 700;

    setTimeout(() => {
      if (this.gameOver) return;
      this.aiFire();
    }, delay);
  }

  private aiFire(): void {
    const move = this.ai.getAttackMove(this.aiTrackingBoard, this.difficulty);
    const { row, col } = move;

    const target = this.playerShipsBoard[row][col];
    let hit = false;
    let sunk = false;
    let sunkShipType: string | null = null;

    if (target && target !== 'hit' && target !== 'miss') {
      // Hit!
      hit = true;
      this.aiTrackingBoard[row][col] = 'hit';
      this.playerShipsBoard[row][col] = 'hit';

      // Record hit on ship
      const ship = this.playerShips[target];
      ship.hits.push({ row, col });

      // Check if sunk
      if (ship.hits.length === ship.size) {
        ship.sunk = true;
        sunk = true;
        sunkShipType = target;
      }
    } else if (!target || target === null) {
      // Miss - mark on both boards
      this.aiTrackingBoard[row][col] = 'miss';
      this.playerShipsBoard[row][col] = 'miss';
    }

    // Notify AI of result
    this.ai.notifyResult(row, col, hit, sunk);

    // Update scene
    this.updateScene();

    // Check for loss
    if (this.checkAllShipsSunk(this.playerShips)) {
      this.handleGameOver(this.AI_ID);
      return;
    }

    // If hit, AI gets another turn. Only switch to player on miss.
    if (hit) {
      this.scheduleAITurn();
    } else {
      this.isPlayerTurn = true;
      this.updateScene();
    }
  }

  private checkAllShipsSunk(ships: Record<string, PlacedShip>): boolean {
    for (const shipType of Object.keys(ships)) {
      if (!ships[shipType].sunk) return false;
    }
    return Object.keys(ships).length > 0;
  }

  private countRemainingShips(ships: Record<string, PlacedShip>): number {
    let count = 0;
    for (const shipType of Object.keys(ships)) {
      if (!ships[shipType].sunk) count++;
    }
    return count;
  }

  private getSunkShips(ships: Record<string, PlacedShip>): string[] {
    const sunk: string[] = [];
    for (const shipType of Object.keys(ships)) {
      if (ships[shipType].sunk) sunk.push(shipType);
    }
    return sunk;
  }

  private getSunkShipsData(ships: Record<string, PlacedShip>): PlacedShip[] {
    const sunkData: PlacedShip[] = [];
    for (const shipType of Object.keys(ships)) {
      if (ships[shipType].sunk) {
        sunkData.push({ ...ships[shipType], shipType });
      }
    }
    return sunkData;
  }

  private handleGameOver(winnerId: string): void {
    this.gameOver = true;
    this.phase = 'gameover';
    this.winner = winnerId;

    if (winnerId === this.PLAYER_ID) {
      this.playerScore++;
    } else {
      this.aiScore++;
    }

    this.scene.showGameOver(winnerId, this.PLAYER_ID);
  }

  private updateScene(): void {
    if (this.phase === 'setup') {
      this.scene.updateState({
        phase: 'setup',
        myBoard: this.playerShipsBoard,
        trackingBoard: this.playerTrackingBoard,
        myShips: this.playerShips,
        currentPlayerId: this.PLAYER_ID,
        myId: this.PLAYER_ID
      });
    } else if (this.phase === 'battle' || this.phase === 'gameover') {
      this.scene.updateState({
        phase: 'battle',
        myBoard: this.playerShipsBoard,
        trackingBoard: this.playerTrackingBoard,
        myShips: this.playerShips,
        currentPlayerId: this.isPlayerTurn ? this.PLAYER_ID : this.AI_ID,
        myId: this.PLAYER_ID,
        myShipsRemaining: this.countRemainingShips(this.playerShips),
        opponentShipsRemaining: this.countRemainingShips(this.aiShips),
        opponentSunkShips: this.getSunkShips(this.aiShips),
        sunkEnemyShipsData: this.getSunkShipsData(this.aiShips)
      });
    }
  }

  playAgain(): void {
    this.startGame();
  }

  resetScore(): void {
    this.playerScore = 0;
    this.aiScore = 0;
  }

  leaveGame(): void {
    this.router.navigate(['/'], { queryParams: { tab: 'sp' } });
  }

  ngOnDestroy(): void {
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }
  }
}
