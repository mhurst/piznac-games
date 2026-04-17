import Phaser from 'phaser';
import { Board, BOARD_SIZE, Direction } from './game-2048-logic';

const BG = 0x1a1a2e;
const PANEL_BG = 0x16213e;
const BOARD_BG = 0x0f1a35;
const EMPTY_CELL = 0x1e2a4a;
const ACCENT = 0xe94560;

const CANVAS_W = 900;
const CANVAS_H = 680;
const GAME_W = 620;

const TILE_SIZE = 100;
const TILE_GAP = 14;
const BOARD_PAD = 14;
const BOARD_SIZE_PX = BOARD_SIZE * TILE_SIZE + (BOARD_SIZE - 1) * TILE_GAP + BOARD_PAD * 2;

// Classic 2048 palette (tile bg + text color)
const TILE_COLORS: Record<number, { bg: number; text: string }> = {
  2:    { bg: 0xeee4da, text: '#776e65' },
  4:    { bg: 0xede0c8, text: '#776e65' },
  8:    { bg: 0xf2b179, text: '#ffffff' },
  16:   { bg: 0xf59563, text: '#ffffff' },
  32:   { bg: 0xf67c5f, text: '#ffffff' },
  64:   { bg: 0xf65e3b, text: '#ffffff' },
  128:  { bg: 0xedcf72, text: '#ffffff' },
  256:  { bg: 0xedcc61, text: '#ffffff' },
  512:  { bg: 0xedc850, text: '#ffffff' },
  1024: { bg: 0xedc53f, text: '#ffffff' },
  2048: { bg: 0xedc22e, text: '#ffffff' },
};
const FALLBACK_TILE = { bg: 0x3c3a32, text: '#ffffff' };

function tileStyle(value: number): { bg: number; text: string } {
  return TILE_COLORS[value] || FALLBACK_TILE;
}

function fontSizeFor(value: number): string {
  if (value < 10) return '52px';
  if (value < 100) return '44px';
  if (value < 1000) return '36px';
  return '30px';
}

export class Game2048Scene extends Phaser.Scene {
  private board: Board = [];
  private boardX = 0;
  private boardY = 0;

  private tileLayer!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private overlayContainer!: Phaser.GameObjects.Container;

  private acceptingInput = true;

  public onMove: ((dir: Direction) => void) | null = null;
  public onNewGame: (() => void) | null = null;
  public onContinueAfterWin: (() => void) | null = null;
  public onBackToMenu: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'Game2048Scene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);

    this.createTitle();
    this.createSidePanel();
    this.createBoard();
    this.setupKeyboard();

    this.overlayContainer = this.add.container(0, 0).setDepth(100).setVisible(false);

    if (this.onReady) this.onReady();
  }

  public setBoard(board: Board, spawnedAt?: { r: number; c: number } | null): void {
    this.board = board;
    this.renderTiles(spawnedAt);
  }

  public updateScore(score: number, best: number): void {
    this.scoreText.setText(`${score}`);
    this.bestText.setText(`${best}`);
  }

  public setInputEnabled(enabled: boolean): void {
    this.acceptingInput = enabled;
  }

  public showGameOver(score: number, best: number, isNewHigh: boolean): void {
    this.acceptingInput = false;
    this.buildOverlay('GAME OVER', score, best, isNewHigh, false);
  }

  public showWin(score: number, best: number, isNewHigh: boolean): void {
    this.acceptingInput = false;
    this.buildOverlay('YOU WIN!', score, best, isNewHigh, true);
  }

  public hideOverlay(): void {
    this.overlayContainer.removeAll(true);
    this.overlayContainer.setVisible(false);
    this.acceptingInput = true;
  }

  private buildOverlay(title: string, score: number, best: number, isNewHigh: boolean, canContinue: boolean): void {
    this.overlayContainer.removeAll(true);
    this.overlayContainer.setVisible(true);

    const bg = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x000000, 0.78).setOrigin(0, 0);
    this.overlayContainer.add(bg);

    const cardW = 460;
    const cardH = 380;
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;

    const card = this.add.rectangle(cx, cy, cardW, cardH, PANEL_BG).setStrokeStyle(3, ACCENT);
    this.overlayContainer.add(card);

    const titleColor = canContinue ? '#ffcc00' : '#ffffff';
    const titleText = this.add.text(cx, cy - 140, title, {
      fontFamily: 'Arial', fontSize: '36px', color: titleColor, fontStyle: 'bold'
    }).setOrigin(0.5);
    this.overlayContainer.add(titleText);

    const scoreLabel = this.add.text(cx, cy - 60, 'SCORE', {
      fontFamily: 'Arial', fontSize: '14px', color: '#888888', fontStyle: 'bold'
    }).setOrigin(0.5);
    const scoreValue = this.add.text(cx, cy - 25, `${score}`, {
      fontFamily: 'Arial', fontSize: '52px', color: '#4a90d9', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.overlayContainer.add([scoreLabel, scoreValue]);

    if (isNewHigh) {
      const nb = this.add.text(cx, cy + 30, '★ NEW BEST! ★', {
        fontFamily: 'Arial', fontSize: '20px', color: '#ffcc00', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.overlayContainer.add(nb);
      this.tweens.add({ targets: nb, scale: { from: 1, to: 1.15 }, yoyo: true, duration: 700, repeat: -1 });
    } else {
      const hs = this.add.text(cx, cy + 30, `Best: ${best}`, {
        fontFamily: 'Arial', fontSize: '18px', color: '#888888'
      }).setOrigin(0.5);
      this.overlayContainer.add(hs);
    }

    if (canContinue) {
      const keepBtn = this.makeOverlayButton('KEEP PLAYING', cx - 105, cy + 110, 0x4caf50, () => {
        if (this.onContinueAfterWin) this.onContinueAfterWin();
      });
      const menuBtn = this.makeOverlayButton('MENU', cx + 105, cy + 110, 0x555555, () => {
        if (this.onBackToMenu) this.onBackToMenu();
      });
      this.overlayContainer.add([...keepBtn, ...menuBtn]);
    } else {
      const againBtn = this.makeOverlayButton('NEW GAME', cx - 100, cy + 110, ACCENT, () => {
        if (this.onNewGame) this.onNewGame();
      });
      const menuBtn = this.makeOverlayButton('MENU', cx + 100, cy + 110, 0x555555, () => {
        if (this.onBackToMenu) this.onBackToMenu();
      });
      this.overlayContainer.add([...againBtn, ...menuBtn]);
    }
  }

  private makeOverlayButton(label: string, x: number, y: number, color: number, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, 180, 50, color).setStrokeStyle(2, 0x000000, 0.4);
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
    return [bg, txt];
  }

  private createTitle(): void {
    this.add.text(GAME_W / 2, 34, '2048', {
      fontFamily: 'Arial', fontSize: '32px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, 72, 'Combine tiles to reach 2048!', {
      fontFamily: 'Arial', fontSize: '14px', color: '#888888'
    }).setOrigin(0.5);
  }

  private createBoard(): void {
    this.boardX = (GAME_W - BOARD_SIZE_PX) / 2;
    this.boardY = 110;

    this.add.rectangle(this.boardX, this.boardY, BOARD_SIZE_PX, BOARD_SIZE_PX, BOARD_BG)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x0f3460);

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const { x, y } = this.cellCenter(r, c);
        this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, EMPTY_CELL).setStrokeStyle(1, 0x333355);
      }
    }

    this.tileLayer = this.add.container(0, 0);
  }

  private createSidePanel(): void {
    const x = 640;
    const y = 40;
    const w = 240;

    this.add.rectangle(x, y, w, 600, PANEL_BG).setOrigin(0, 0).setStrokeStyle(2, 0x0f3460);

    // Score card
    this.add.rectangle(x + 20, y + 20, w - 40, 72, 0x0f1a35).setOrigin(0, 0).setStrokeStyle(1, 0x0f3460);
    this.add.text(x + w / 2, y + 32, 'SCORE', {
      fontFamily: 'Arial', fontSize: '12px', color: '#888888', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.scoreText = this.add.text(x + w / 2, y + 62, '0', {
      fontFamily: 'Arial', fontSize: '28px', color: '#4a90d9', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Best card
    this.add.rectangle(x + 20, y + 108, w - 40, 72, 0x0f1a35).setOrigin(0, 0).setStrokeStyle(1, 0x0f3460);
    this.add.text(x + w / 2, y + 120, 'BEST', {
      fontFamily: 'Arial', fontSize: '12px', color: '#888888', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.bestText = this.add.text(x + w / 2, y + 150, '0', {
      fontFamily: 'Arial', fontSize: '28px', color: '#ffcc00', fontStyle: 'bold'
    }).setOrigin(0.5);

    // New Game button
    const btnY = y + 210;
    const btnBg = this.add.rectangle(x + w / 2, btnY, w - 40, 48, ACCENT).setStrokeStyle(2, 0x000000, 0.4);
    const btnTxt = this.add.text(x + w / 2, btnY, 'NEW GAME', {
      fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => {
      if (this.onNewGame) this.onNewGame();
    });
    btnBg.on('pointerover', () => btnBg.setAlpha(0.8));
    btnBg.on('pointerout', () => btnBg.setAlpha(1));

    // Controls hint
    this.add.text(x + w / 2, y + 290, 'CONTROLS', {
      fontFamily: 'Arial', fontSize: '12px', color: '#888888', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(x + w / 2, y + 320, '↑ ↓ ← →', {
      fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(x + w / 2, y + 355, 'or W A S D', {
      fontFamily: 'Arial', fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5);
  }

  private cellCenter(r: number, c: number): { x: number; y: number } {
    const x = this.boardX + BOARD_PAD + c * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
    const y = this.boardY + BOARD_PAD + r * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
    return { x, y };
  }

  private renderTiles(spawnedAt?: { r: number; c: number } | null): void {
    this.tileLayer.removeAll(true);

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const v = this.board[r][c];
        if (v === 0) continue;
        const { x, y } = this.cellCenter(r, c);
        const { bg, text } = tileStyle(v);

        const rect = this.add.rectangle(x, y, TILE_SIZE - 4, TILE_SIZE - 4, bg);
        rect.setStrokeStyle(2, 0x000000, 0.2);

        const txt = this.add.text(x, y, `${v}`, {
          fontFamily: 'Arial',
          fontSize: fontSizeFor(v),
          color: text,
          fontStyle: 'bold'
        }).setOrigin(0.5);

        this.tileLayer.add([rect, txt]);

        if (spawnedAt && spawnedAt.r === r && spawnedAt.c === c) {
          rect.setScale(0);
          txt.setScale(0);
          this.tweens.add({
            targets: [rect, txt],
            scale: 1,
            duration: 140,
            ease: 'Back.easeOut'
          });
        }
      }
    }
  }

  private setupKeyboard(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.acceptingInput) return;

      let dir: Direction | null = null;
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          dir = 'up'; break;
        case 'ArrowDown':
        case 's':
        case 'S':
          dir = 'down'; break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          dir = 'left'; break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          dir = 'right'; break;
      }

      if (dir && this.onMove) {
        event.preventDefault?.();
        this.onMove(dir);
      }
    });
  }
}
