import Phaser from 'phaser';
import { Grid, KeyState, MAX_GUESSES, TileState, WORD_LENGTH } from './wordle-logic';

const BG = 0x1a1a2e;
const PANEL_BG = 0x16213e;
const ACCENT = 0xe94560;

const TILE_SIZE = 60;
const TILE_GAP = 6;

const KEY_H = 54;
const KEY_W_LETTER = 42;
const KEY_W_SPECIAL = 70;
const KEY_GAP_X = 6;
const KEY_GAP_Y = 6;

const CANVAS_W = 900;
const CANVAS_H = 680;

const STATE_FILL: Record<TileState, number | null> = {
  empty: null,
  pending: null,
  correct: 0x538d4e,
  present: 0xb59f3b,
  absent: 0x3a3a3c,
};

const STATE_BORDER: Record<TileState, number> = {
  empty: 0x3a3a3c,
  pending: 0x8a8a8c,
  correct: 0x538d4e,
  present: 0xb59f3b,
  absent: 0x3a3a3c,
};

const KEY_FILL: Record<KeyState, number> = {
  unused: 0x818384,
  correct: 0x538d4e,
  present: 0xb59f3b,
  absent: 0x3a3a3c,
};

const KEYBOARD_ROWS: string[][] = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','BACKSPACE']
];

export class WordleScene extends Phaser.Scene {
  private grid: Grid = [];
  private keyStates: Record<string, KeyState> = {};

  private gridContainer!: Phaser.GameObjects.Container;
  private keyboardContainer!: Phaser.GameObjects.Container;
  private messageText!: Phaser.GameObjects.Text;
  private messageTimer: Phaser.Time.TimerEvent | null = null;
  private overlayContainer!: Phaser.GameObjects.Container;

  private acceptingInput = true;

  public onKey: ((key: string) => void) | null = null;
  public onNewGame: (() => void) | null = null;
  public onBackToMenu: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'WordleScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);

    this.createTitle();
    this.createGrid();
    this.createMessage();
    this.createKeyboard();
    this.setupKeyboard();

    this.overlayContainer = this.add.container(0, 0).setDepth(100).setVisible(false);

    if (this.onReady) this.onReady();
  }

  public setGrid(grid: Grid): void {
    this.grid = grid;
    this.renderGrid();
  }

  public setKeyStates(states: Record<string, KeyState>): void {
    this.keyStates = states;
    this.renderKeyboard();
  }

  public setInputEnabled(enabled: boolean): void {
    this.acceptingInput = enabled;
  }

  public showMessage(text: string, color: string = '#ffffff', shakeRow?: number): void {
    this.messageText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.messageText);
    if (this.messageTimer) { this.messageTimer.remove(); this.messageTimer = null; }
    this.messageTimer = this.time.delayedCall(1400, () => {
      this.tweens.add({ targets: this.messageText, alpha: 0, duration: 300 });
    });

    if (shakeRow !== undefined && shakeRow >= 0 && shakeRow < MAX_GUESSES) {
      this.shakeRow(shakeRow);
    }
  }

  public showGameOver(won: boolean, answer: string): void {
    this.acceptingInput = false;
    this.overlayContainer.removeAll(true);
    this.overlayContainer.setVisible(true);

    const bg = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x000000, 0.78).setOrigin(0, 0);
    this.overlayContainer.add(bg);

    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;

    const card = this.add.rectangle(cx, cy, 440, 280, PANEL_BG).setStrokeStyle(3, won ? 0x538d4e : ACCENT);
    this.overlayContainer.add(card);

    const title = won ? 'YOU GOT IT!' : 'GAME OVER';
    const titleColor = won ? '#4caf50' : '#e94560';
    const titleText = this.add.text(cx, cy - 80, title, {
      fontFamily: 'Arial', fontSize: '32px', color: titleColor, fontStyle: 'bold'
    }).setOrigin(0.5);
    this.overlayContainer.add(titleText);

    const label = this.add.text(cx, cy - 28, won ? 'The word was' : 'The word was', {
      fontFamily: 'Arial', fontSize: '14px', color: '#888888'
    }).setOrigin(0.5);
    const ans = this.add.text(cx, cy + 4, answer.toUpperCase(), {
      fontFamily: 'Arial', fontSize: '42px', color: '#ffcc00', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.overlayContainer.add([label, ans]);

    const newBtn = this.makeOverlayButton('NEW GAME', cx - 100, cy + 80, ACCENT, () => {
      if (this.onNewGame) this.onNewGame();
    });
    const menuBtn = this.makeOverlayButton('MENU', cx + 100, cy + 80, 0x555555, () => {
      if (this.onBackToMenu) this.onBackToMenu();
    });
    this.overlayContainer.add([...newBtn, ...menuBtn]);
  }

  public hideOverlay(): void {
    this.overlayContainer.removeAll(true);
    this.overlayContainer.setVisible(false);
    this.acceptingInput = true;
  }

  private makeOverlayButton(label: string, x: number, y: number, color: number, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, 170, 48, color).setStrokeStyle(2, 0x000000, 0.4);
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial', fontSize: '14px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
    return [bg, txt];
  }

  private createTitle(): void {
    this.add.text(CANVAS_W / 2, 28, 'WORDLE', {
      fontFamily: 'Arial', fontSize: '26px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  private createGrid(): void {
    this.gridContainer = this.add.container(0, 0);
  }

  private renderGrid(): void {
    this.gridContainer.removeAll(true);

    const gridW = WORD_LENGTH * TILE_SIZE + (WORD_LENGTH - 1) * TILE_GAP;
    const startX = (CANVAS_W - gridW) / 2 + TILE_SIZE / 2;
    const startY = 70 + TILE_SIZE / 2;

    for (let r = 0; r < MAX_GUESSES; r++) {
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = this.grid[r][c];
        const x = startX + c * (TILE_SIZE + TILE_GAP);
        const y = startY + r * (TILE_SIZE + TILE_GAP);

        const fill = STATE_FILL[tile.state];
        const rect = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, fill ?? 0x000000, fill === null ? 0 : 1);
        rect.setStrokeStyle(2, STATE_BORDER[tile.state]);

        const letter = tile.letter ? tile.letter.toUpperCase() : '';
        const txt = this.add.text(x, y, letter, {
          fontFamily: 'Arial', fontSize: '32px', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.gridContainer.add([rect, txt]);
      }
    }
  }

  private createMessage(): void {
    this.messageText = this.add.text(CANVAS_W / 2, 475, '', {
      fontFamily: 'Arial', fontSize: '20px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);
  }

  private createKeyboard(): void {
    this.keyboardContainer = this.add.container(0, 0);
    this.renderKeyboard();
  }

  private renderKeyboard(): void {
    this.keyboardContainer.removeAll(true);

    const rowYs = [500, 560, 620];
    for (let rowIdx = 0; rowIdx < KEYBOARD_ROWS.length; rowIdx++) {
      const keys = KEYBOARD_ROWS[rowIdx];
      const y = rowYs[rowIdx];

      const widths = keys.map(k => (k === 'ENTER' || k === 'BACKSPACE') ? KEY_W_SPECIAL : KEY_W_LETTER);
      const totalW = widths.reduce((a, b) => a + b, 0) + (keys.length - 1) * KEY_GAP_X;
      let x = (CANVAS_W - totalW) / 2;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const w = widths[i];
        const cx = x + w / 2;
        const state = this.keyStates[key] || 'unused';
        const fill = KEY_FILL[state];

        const rect = this.add.rectangle(cx, y, w, KEY_H, fill);
        rect.setStrokeStyle(1, 0x000000, 0.3);

        let label = key;
        if (key === 'BACKSPACE') label = '⌫';
        const fontSize = key === 'ENTER' ? '13px' : (key === 'BACKSPACE' ? '22px' : '20px');
        const txt = this.add.text(cx, y, label, {
          fontFamily: 'Arial', fontSize, color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);

        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => {
          if (!this.acceptingInput) return;
          if (this.onKey) this.onKey(key);
        });
        rect.on('pointerover', () => rect.setAlpha(0.8));
        rect.on('pointerout', () => rect.setAlpha(1));

        this.keyboardContainer.add([rect, txt]);
        x += w + KEY_GAP_X;
      }
    }
  }

  private shakeRow(rowIndex: number): void {
    const gridW = WORD_LENGTH * TILE_SIZE + (WORD_LENGTH - 1) * TILE_GAP;
    const startX = (CANVAS_W - gridW) / 2 + TILE_SIZE / 2;
    const startY = 70 + TILE_SIZE / 2;
    const centerX = startX + (WORD_LENGTH - 1) * (TILE_SIZE + TILE_GAP) / 2;
    const centerY = startY + rowIndex * (TILE_SIZE + TILE_GAP);

    // Approximate: shake the whole gridContainer briefly
    const originalX = this.gridContainer.x;
    this.tweens.add({
      targets: this.gridContainer,
      x: originalX - 8,
      duration: 60,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.gridContainer.setX(originalX)
    });
    // Silence unused-var warning
    void centerX; void centerY;
  }

  private setupKeyboard(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.acceptingInput) return;
      const key = event.key;

      if (key === 'Enter') {
        if (this.onKey) this.onKey('ENTER');
        return;
      }
      if (key === 'Backspace') {
        if (this.onKey) this.onKey('BACKSPACE');
        return;
      }
      if (/^[a-zA-Z]$/.test(key)) {
        if (this.onKey) this.onKey(key.toUpperCase());
      }
    });
  }
}
