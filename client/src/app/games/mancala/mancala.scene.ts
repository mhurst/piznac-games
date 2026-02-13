import Phaser from 'phaser';
import { AI_NAMES, getAvatarConfig } from '../../core/ai/ai-names';

export interface MancalaState {
  pits: number[];          // 14 elements: [0-5] P1 pits, [6] P1 store, [7-12] P2 pits, [13] P2 store
  currentPlayer: 1 | 2;
  gameOver: boolean;
  winner: 1 | 2 | null;    // null = draw
  lastMove?: number;
  extraTurn?: boolean;
  captured?: boolean;
}

export class MancalaScene extends Phaser.Scene {
  // Layout constants
  private readonly CANVAS_W = 700;
  private readonly CANVAS_H = 400;
  private readonly PIT_RADIUS = 35;
  private readonly PIT_SPACING = 80;
  private readonly PIT_START_X = 150;
  private readonly BOTTOM_ROW_Y = 280;
  private readonly TOP_ROW_Y = 150;
  private readonly STORE_W = 70;
  private readonly STORE_H = 240;
  private readonly STORE_Y = 95;
  private readonly P2_STORE_X = 30;
  private readonly P1_STORE_X = 600;
  private readonly BOARD_X = 10;
  private readonly BOARD_Y = 70;
  private readonly BOARD_W = 680;
  private readonly BOARD_H = 270;

  // Colors
  private readonly BOARD_BG = 0x2d1f0e;
  private readonly BOARD_BORDER = 0x8b5a2b;
  private readonly PIT_COLOR = 0x1a0f05;
  private readonly PIT_STROKE = 0x5c3a1e;
  private readonly STORE_COLOR = 0x1a0f05;
  private readonly STORE_STROKE = 0x5c3a1e;
  private readonly VALID_HIGHLIGHT = 0x4a90d9;
  private readonly HOVER_GLOW = 0x6ab0f9;
  private readonly STONE_COLORS = [0x8b7355, 0xa0522d, 0x6b4423, 0x556b2f, 0x4a6741, 0x8b6914, 0x704214, 0x5c4033];

  // State
  private pits: number[] = [];
  private myPlayer: 1 | 2 = 1;
  private currentPlayer: 1 | 2 = 1;
  private isMyTurn = false;
  private gameOverFlag = false;
  private validPits: number[] = [];

  // Graphics
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private pitGraphics: Phaser.GameObjects.Graphics[] = [];
  private stoneContainers: Phaser.GameObjects.Container[] = [];
  private countTexts: Phaser.GameObjects.Text[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private p1Label!: Phaser.GameObjects.Text;
  private p2Label!: Phaser.GameObjects.Text;
  private p1StoreText!: Phaser.GameObjects.Text;
  private p2StoreText!: Phaser.GameObjects.Text;
  private clickZones: Phaser.GameObjects.Zone[] = [];
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private hoveredPit: number = -1;

  // Avatar elements for AI label
  private avatarElements: Phaser.GameObjects.GameObject[] = [];
  private p2Name = 'Player 2';

  // Callbacks
  public onPitClick: ((pitIndex: number) => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'MancalaScene' });
  }

  preload(): void {
    // Avatar images
    const avatarPath = 'assets/sprites/board-game/avatars/images/';
    for (const name of AI_NAMES) {
      this.load.image(`avatar_${name}`, avatarPath + `${name}.png`);
    }
  }

  create(): void {
    this.removeWhiteBackground();
    this.pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];

    this.drawBoard();
    this.createPitVisuals();
    this.createStoreVisuals();
    this.createClickZones();
    this.createLabels();
    this.renderStones();

    if (this.onReady) this.onReady();
  }

  /** Strip white/near-white background from avatar images. */
  private removeWhiteBackground(): void {
    for (const name of AI_NAMES) {
      const key = `avatar_${name}`;
      if (!this.textures.exists(key)) continue;

      const source = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(source, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const threshold = 240;

      for (let p = 0; p < data.length; p += 4) {
        if (data[p] >= threshold && data[p + 1] >= threshold && data[p + 2] >= threshold) {
          data[p + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
    }
  }

  private drawBoard(): void {
    this.boardGraphics = this.add.graphics();

    // Board background
    this.boardGraphics.fillStyle(this.BOARD_BG);
    this.boardGraphics.fillRoundedRect(this.BOARD_X, this.BOARD_Y, this.BOARD_W, this.BOARD_H, 16);

    // Board border
    this.boardGraphics.lineStyle(3, this.BOARD_BORDER);
    this.boardGraphics.strokeRoundedRect(this.BOARD_X, this.BOARD_Y, this.BOARD_W, this.BOARD_H, 16);
  }

  private createPitVisuals(): void {
    // Clear old
    this.pitGraphics.forEach(g => g.destroy());
    this.pitGraphics = [];

    for (let i = 0; i < 14; i++) {
      if (i === 6 || i === 13) continue; // Skip stores
      const { x, y } = this.getPitPosition(i);
      const g = this.add.graphics();
      g.fillStyle(this.PIT_COLOR);
      g.fillCircle(x, y, this.PIT_RADIUS);
      g.lineStyle(2, this.PIT_STROKE);
      g.strokeCircle(x, y, this.PIT_RADIUS);
      this.pitGraphics[i] = g;
    }
  }

  private createStoreVisuals(): void {
    const g = this.add.graphics();

    // P1 store (right)
    g.fillStyle(this.STORE_COLOR);
    g.fillRoundedRect(this.P1_STORE_X, this.STORE_Y, this.STORE_W, this.STORE_H, 12);
    g.lineStyle(2, this.STORE_STROKE);
    g.strokeRoundedRect(this.P1_STORE_X, this.STORE_Y, this.STORE_W, this.STORE_H, 12);

    // P2 store (left)
    g.fillStyle(this.STORE_COLOR);
    g.fillRoundedRect(this.P2_STORE_X, this.STORE_Y, this.STORE_W, this.STORE_H, 12);
    g.lineStyle(2, this.STORE_STROKE);
    g.strokeRoundedRect(this.P2_STORE_X, this.STORE_Y, this.STORE_W, this.STORE_H, 12);

    // Store count texts
    this.p1StoreText = this.add.text(this.P1_STORE_X + this.STORE_W / 2, this.STORE_Y + this.STORE_H / 2, '0', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.p2StoreText = this.add.text(this.P2_STORE_X + this.STORE_W / 2, this.STORE_Y + this.STORE_H / 2, '0', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  private createLabels(): void {
    this.turnText = this.add.text(this.CANVAS_W / 2, 25, 'Waiting...', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.p1Label = this.add.text(this.CANVAS_W / 2, 345, 'Player 1', {
      fontSize: '16px',
      color: '#4a90d9',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.p2Label = this.add.text(this.CANVAS_W / 2, 85, 'Player 2', {
      fontSize: '16px',
      color: '#e94560',
      fontFamily: 'Arial'
    }).setOrigin(0.5);
  }

  private createClickZones(): void {
    this.clickZones.forEach(z => z.destroy());
    this.clickZones = [];

    for (let i = 0; i < 14; i++) {
      if (i === 6 || i === 13) continue;
      const { x, y } = this.getPitPosition(i);

      const zone = this.add.zone(x, y, this.PIT_RADIUS * 2, this.PIT_RADIUS * 2);
      zone.setInteractive({ useHandCursor: true });

      zone.on('pointerdown', () => {
        if (!this.isMyTurn || this.gameOverFlag) return;
        if (!this.validPits.includes(i)) return;
        if (this.onPitClick) this.onPitClick(i);
      });

      zone.on('pointerover', () => {
        if (this.validPits.includes(i) && this.isMyTurn && !this.gameOverFlag) {
          this.hoveredPit = i;
          this.drawHighlights();
        }
      });

      zone.on('pointerout', () => {
        if (this.hoveredPit === i) {
          this.hoveredPit = -1;
          this.drawHighlights();
        }
      });

      this.clickZones.push(zone);
    }
  }

  private getPitPosition(index: number): { x: number; y: number } {
    if (index >= 0 && index <= 5) {
      // Bottom row (P1): left to right
      return {
        x: this.PIT_START_X + index * this.PIT_SPACING,
        y: this.BOTTOM_ROW_Y
      };
    } else if (index >= 7 && index <= 12) {
      // Top row (P2): right to left visually
      return {
        x: this.PIT_START_X + (12 - index) * this.PIT_SPACING,
        y: this.TOP_ROW_Y
      };
    }
    // Stores - not used for pit positions
    return { x: 0, y: 0 };
  }

  private drawHighlights(): void {
    if (this.highlightGraphics) {
      this.highlightGraphics.destroy();
    }
    this.highlightGraphics = this.add.graphics();

    for (const pitIndex of this.validPits) {
      const { x, y } = this.getPitPosition(pitIndex);
      const isHovered = this.hoveredPit === pitIndex;

      if (isHovered) {
        // Glow effect
        this.highlightGraphics.lineStyle(4, this.HOVER_GLOW, 0.9);
        this.highlightGraphics.strokeCircle(x, y, this.PIT_RADIUS + 4);
        this.highlightGraphics.fillStyle(this.HOVER_GLOW, 0.15);
        this.highlightGraphics.fillCircle(x, y, this.PIT_RADIUS);
      } else {
        // Blue highlight ring
        this.highlightGraphics.lineStyle(3, this.VALID_HIGHLIGHT, 0.7);
        this.highlightGraphics.strokeCircle(x, y, this.PIT_RADIUS + 2);
      }
    }
  }

  private renderStones(): void {
    // Clear old stone visuals
    this.stoneContainers.forEach(c => c?.destroy());
    this.stoneContainers = [];
    this.countTexts.forEach(t => t?.destroy());
    this.countTexts = [];

    for (let i = 0; i < 14; i++) {
      if (i === 6 || i === 13) continue;
      const count = this.pits[i] || 0;
      const { x, y } = this.getPitPosition(i);

      // Draw small stone circles
      const container = this.add.container(x, y);
      const stonePositions = this.getStonePositions(count, this.PIT_RADIUS - 8);

      for (let s = 0; s < stonePositions.length; s++) {
        const stone = this.add.graphics();
        const color = this.STONE_COLORS[s % this.STONE_COLORS.length];
        stone.fillStyle(color);
        stone.fillCircle(stonePositions[s].x, stonePositions[s].y, 4 + Math.random());
        // Slight highlight
        stone.fillStyle(0xffffff, 0.2);
        stone.fillCircle(stonePositions[s].x - 1, stonePositions[s].y - 1, 2);
        container.add(stone);
      }
      this.stoneContainers[i] = container;

      // Count text
      const countText = this.add.text(x, y + this.PIT_RADIUS + 14, `${count}`, {
        fontSize: '14px',
        color: '#aaaaaa',
        fontFamily: 'Arial'
      }).setOrigin(0.5);
      this.countTexts[i] = countText;
    }

    // Update store counts
    this.p1StoreText.setText(`${this.pits[6] || 0}`);
    this.p2StoreText.setText(`${this.pits[13] || 0}`);

    // Render stones in stores
    this.renderStoreStones(6, this.P1_STORE_X + this.STORE_W / 2, this.STORE_Y + this.STORE_H / 2);
    this.renderStoreStones(13, this.P2_STORE_X + this.STORE_W / 2, this.STORE_Y + this.STORE_H / 2);
  }

  private renderStoreStones(storeIndex: number, cx: number, cy: number): void {
    const count = this.pits[storeIndex] || 0;
    const container = this.add.container(cx, cy);
    const positions = this.getStonePositions(count, 25);

    for (let s = 0; s < positions.length; s++) {
      const stone = this.add.graphics();
      const color = this.STONE_COLORS[s % this.STONE_COLORS.length];
      stone.fillStyle(color);
      stone.fillCircle(positions[s].x, positions[s].y, 4);
      container.add(stone);
    }
    this.stoneContainers[storeIndex] = container;
  }

  private getStonePositions(count: number, radius: number): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];
    if (count === 0) return positions;

    // Show up to 20 stones visually, use a seeded-like spiral pattern
    const maxVisible = Math.min(count, 20);
    const goldenAngle = 2.39996; // ~137.5 degrees

    for (let i = 0; i < maxVisible; i++) {
      const r = radius * 0.3 * Math.sqrt(i / maxVisible) + 2;
      const theta = i * goldenAngle;
      positions.push({
        x: r * Math.cos(theta),
        y: r * Math.sin(theta)
      });
    }

    return positions;
  }

  public updateState(state: MancalaState): void {
    this.pits = [...state.pits];
    this.currentPlayer = state.currentPlayer;
    this.gameOverFlag = state.gameOver;
    this.isMyTurn = state.currentPlayer === this.myPlayer && !state.gameOver;

    // Determine valid pits
    this.validPits = [];
    if (this.isMyTurn) {
      const startPit = this.myPlayer === 1 ? 0 : 7;
      const endPit = this.myPlayer === 1 ? 5 : 12;
      for (let i = startPit; i <= endPit; i++) {
        if (this.pits[i] > 0) {
          this.validPits.push(i);
        }
      }
    }

    // Update turn text
    if (state.gameOver) {
      // Don't change turn text here - showGameOver handles it
    } else if (state.extraTurn) {
      this.turnText.setText('Extra turn!');
      this.turnText.setColor('#ffff00');
    } else {
      this.turnText.setText(this.isMyTurn ? 'Your turn!' : "Opponent's turn...");
      this.turnText.setColor(this.isMyTurn ? '#4a90d9' : '#888888');
    }

    this.renderStones();
    this.drawHighlights();
  }

  public setPlayer(player: 1 | 2, p1Name: string = 'Player 1', p2Name: string = 'Player 2'): void {
    this.myPlayer = player;
    this.p2Name = p2Name;
    this.p1Label.setText(p1Name);
    this.p2Label.setText(p2Name);
    this.drawP2Avatar();
  }

  private drawP2Avatar(): void {
    // Clear old avatar elements
    this.avatarElements.forEach(el => el.destroy());
    this.avatarElements = [];

    const name = this.p2Name;
    if (name === 'You' || name === 'Player 2') return;

    const r = 16;
    // Position avatar to the left of the P2 label
    const labelX = this.p2Label.x;
    const labelY = this.p2Label.y;
    const textWidth = this.p2Label.width;
    const ax = labelX - textWidth / 2 - r - 6;
    const ay = labelY;

    const imageKey = `avatar_${name}`;
    if (this.textures.exists(imageKey)) {
      const img = this.add.image(ax, ay, imageKey)
        .setDisplaySize(r * 2, r * 2).setDepth(1);
      this.avatarElements.push(img);
    } else {
      const config = getAvatarConfig(name);
      const gfx = this.add.graphics().setDepth(1);
      gfx.fillStyle(config.color);
      gfx.fillCircle(ax, ay, r);
      gfx.lineStyle(1, 0xd4a847, 0.6);
      gfx.strokeCircle(ax, ay, r);
      this.avatarElements.push(gfx);
      const initial = this.add.text(ax, ay, config.initial, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(2);
      this.avatarElements.push(initial);
    }
  }

  public async animateSow(path: number[], finalPits: number[]): Promise<void> {
    // Animate stones dropping one at a time along the path
    for (let i = 0; i < path.length; i++) {
      const pitIndex = path[i];
      const target = this.getSowTarget(pitIndex);

      // Create a flying stone
      const stone = this.add.graphics();
      stone.fillStyle(this.STONE_COLORS[i % this.STONE_COLORS.length]);
      stone.fillCircle(0, 0, 5);

      const startX = this.CANVAS_W / 2;
      const startY = this.CANVAS_H / 2;
      stone.setPosition(startX, startY);

      await new Promise<void>(resolve => {
        this.tweens.add({
          targets: stone,
          x: target.x,
          y: target.y,
          duration: 120,
          ease: 'Power2',
          onComplete: () => {
            stone.destroy();
            // Update this pit's count
            this.pits[pitIndex] = (this.pits[pitIndex] || 0) + 1;
            this.renderStones();
            resolve();
          }
        });
      });
    }

    // Final state sync
    this.pits = [...finalPits];
    this.renderStones();
  }

  private getSowTarget(pitIndex: number): { x: number; y: number } {
    if (pitIndex === 6) {
      return { x: this.P1_STORE_X + this.STORE_W / 2, y: this.STORE_Y + this.STORE_H / 2 };
    }
    if (pitIndex === 13) {
      return { x: this.P2_STORE_X + this.STORE_W / 2, y: this.STORE_Y + this.STORE_H / 2 };
    }
    return this.getPitPosition(pitIndex);
  }

  public showGameOver(winner: 1 | 2 | null, p1Score: number, p2Score: number): void {
    this.gameOverFlag = true;
    this.validPits = [];
    this.drawHighlights();

    let message: string;
    let color: string;

    if (winner === null) {
      message = `It's a tie! ${p1Score} - ${p2Score}`;
      color = '#ffff00';
    } else if (winner === this.myPlayer) {
      message = `You win! ${p1Score} - ${p2Score}`;
      color = '#00ff00';
    } else {
      message = `You lose! ${p1Score} - ${p2Score}`;
      color = '#e94560';
    }

    this.turnText.setText(message);
    this.turnText.setColor(color);
    this.turnText.setFontSize(28);
  }

  public resetGame(): void {
    this.pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    this.gameOverFlag = false;
    this.validPits = [];
    this.hoveredPit = -1;
    this.currentPlayer = 1;
    this.isMyTurn = false;

    this.turnText.setText('Waiting...');
    this.turnText.setColor('#ffffff');
    this.turnText.setFontSize(22);

    this.renderStones();
    this.drawHighlights();
  }
}
