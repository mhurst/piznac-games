import Phaser from 'phaser';
import { scoreWord, GameMode } from './anagrams-utils';

const BG = 0x1a1a2e;
const PANEL_BG = 0x16213e;
const ACCENT = 0xe94560;
const TILE_BG = 0x16213e;
const TILE_BG_USED = 0x0a0f1e;
const TEXT_WHITE = '#ffffff';
const TEXT_DIM = '#888888';

const CANVAS_W = 900;
const CANVAS_H = 680;
const GAME_W = 620;

const TILE_SIZE = 70;
const TILE_GAP = 12;

export type SubmitResult = 'valid' | 'already-found' | 'too-short' | 'invalid';

export class AnagramsScene extends Phaser.Scene {
  private letters: string[] = [];
  private tileUsed: boolean[] = [];
  private currentWord: Array<{ letter: string; tileIdx: number }> = [];

  private tileContainers: Phaser.GameObjects.Container[] = [];
  private currentWordContainer!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private messageTimer: Phaser.Time.TimerEvent | null = null;
  private foundListText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;

  private overlayContainer!: Phaser.GameObjects.Container;
  private acceptingInput = true;

  public onSubmit: ((word: string) => SubmitResult) | null = null;
  public onPlayAgain: (() => void) | null = null;
  public onBackToMenu: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'AnagramsScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG);

    this.createTopBar();
    this.createProgressRow();
    this.createMessageArea();
    this.createCurrentWordArea();
    this.createButtons();
    this.createFoundPanel();
    this.setupKeyboard();

    this.overlayContainer = this.add.container(0, 0).setDepth(100).setVisible(false);

    if (this.onReady) this.onReady();
  }

  public setLetters(letters: string[]): void {
    this.letters = [...letters];
    this.tileUsed = this.letters.map(() => false);
    this.currentWord = [];
    this.renderTiles();
    this.renderCurrentWord();
  }

  public updateScore(score: number, foundCount: number, totalCount: number): void {
    this.scoreText.setText(`Score: ${score}`);
    this.progressText.setText(`Words: ${foundCount} / ${totalCount}`);
  }

  public updateTimer(seconds: number): void {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    if (seconds <= 10) this.timerText.setColor('#e94560');
    else if (seconds <= 30) this.timerText.setColor('#ff9800');
    else this.timerText.setColor('#4caf50');
  }

  public setMode(mode: GameMode): void {
    this.modeText.setText(mode === 'classic' ? 'CLASSIC' : 'TEXT TWIST');
  }

  public setRound(round: number, show: boolean): void {
    this.roundText.setVisible(show);
    if (show) this.roundText.setText(`Round ${round}`);
  }

  public updateFoundWords(words: string[]): void {
    const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
    this.foundListText.setText(sorted.map(w => w.toUpperCase()).join('\n'));
  }

  public showMessage(text: string, color: string = TEXT_WHITE): void {
    this.messageText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.messageText);
    if (this.messageTimer) { this.messageTimer.remove(); this.messageTimer = null; }
    this.messageTimer = this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: this.messageText, alpha: 0, duration: 400 });
    });
  }

  public clearCurrentWord(): void {
    this.currentWord = [];
    this.tileUsed = this.letters.map(() => false);
    this.renderTiles();
    this.renderCurrentWord();
  }

  public setInputEnabled(enabled: boolean): void {
    this.acceptingInput = enabled;
  }

  public showGameOver(title: string, score: number, highScore: number, isNewHigh: boolean, subtitle?: string): void {
    this.acceptingInput = false;
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

    const titleText = this.add.text(cx, cy - 140, title, {
      fontFamily: 'Arial', fontSize: '32px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.overlayContainer.add(titleText);

    if (subtitle) {
      const sub = this.add.text(cx, cy - 100, subtitle, {
        fontFamily: 'Arial', fontSize: '16px', color: '#aaaaaa'
      }).setOrigin(0.5);
      this.overlayContainer.add(sub);
    }

    const scoreLabel = this.add.text(cx, cy - 50, 'FINAL SCORE', {
      fontFamily: 'Arial', fontSize: '14px', color: '#888888', fontStyle: 'bold'
    }).setOrigin(0.5);
    const scoreValue = this.add.text(cx, cy - 15, `${score}`, {
      fontFamily: 'Arial', fontSize: '56px', color: '#4a90d9', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.overlayContainer.add([scoreLabel, scoreValue]);

    if (isNewHigh) {
      const nb = this.add.text(cx, cy + 40, '★ NEW BEST! ★', {
        fontFamily: 'Arial', fontSize: '20px', color: '#ffcc00', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.overlayContainer.add(nb);
      this.tweens.add({ targets: nb, scale: { from: 1, to: 1.15 }, yoyo: true, duration: 700, repeat: -1 });
    } else {
      const hs = this.add.text(cx, cy + 40, `Best: ${highScore}`, {
        fontFamily: 'Arial', fontSize: '18px', color: '#888888'
      }).setOrigin(0.5);
      this.overlayContainer.add(hs);
    }

    const again = this.makeOverlayButton('PLAY AGAIN', cx - 100, cy + 110, ACCENT, () => {
      if (this.onPlayAgain) this.onPlayAgain();
    });
    const menu = this.makeOverlayButton('MENU', cx + 100, cy + 110, 0x555555, () => {
      if (this.onBackToMenu) this.onBackToMenu();
    });
    this.overlayContainer.add([...again, ...menu]);
  }

  public hideOverlay(): void {
    this.overlayContainer.removeAll(true);
    this.overlayContainer.setVisible(false);
    this.acceptingInput = true;
  }

  public showRoundClear(pangram: string, durationMs: number = 1600): void {
    this.acceptingInput = false;
    const overlay = this.add.container(0, 0).setDepth(90);

    const bg = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x000000, 0.6).setOrigin(0, 0);
    overlay.add(bg);

    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;

    const title = this.add.text(cx, cy - 40, 'ROUND CLEAR!', {
      fontFamily: 'Arial', fontSize: '40px', color: '#4caf50', fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);

    const word = this.add.text(cx, cy + 20, pangram.toUpperCase(), {
      fontFamily: 'Arial', fontSize: '32px', color: '#ffcc00', fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);

    overlay.add([title, word]);

    this.tweens.add({ targets: [title, word], alpha: 1, duration: 300 });
    this.time.delayedCall(durationMs, () => {
      this.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          overlay.destroy();
          this.acceptingInput = true;
        }
      });
    });
  }

  private makeOverlayButton(label: string, x: number, y: number, color: number, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, 170, 50, color).setStrokeStyle(2, 0x000000, 0.4);
    const txt = this.add.text(x, y, label, {
      fontFamily: 'Arial', fontSize: '16px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
    return [bg, txt];
  }

  private createTopBar(): void {
    this.modeText = this.add.text(20, 26, 'CLASSIC', {
      fontFamily: 'Arial', fontSize: '14px', color: '#888888', fontStyle: 'bold'
    });

    this.timerText = this.add.text(GAME_W / 2, 40, '0:00', {
      fontFamily: 'Arial', fontSize: '42px', color: '#4caf50', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.scoreText = this.add.text(GAME_W - 20, 26, 'Score: 0', {
      fontFamily: 'Arial', fontSize: '16px', color: '#4a90d9', fontStyle: 'bold'
    }).setOrigin(1, 0);
  }

  private createProgressRow(): void {
    this.roundText = this.add.text(20, 70, 'Round 1', {
      fontFamily: 'Arial', fontSize: '16px', color: '#ffcc00', fontStyle: 'bold'
    }).setVisible(false);

    this.progressText = this.add.text(GAME_W - 20, 70, 'Words: 0 / 0', {
      fontFamily: 'Arial', fontSize: '16px', color: '#ffffff'
    }).setOrigin(1, 0);
  }

  private createMessageArea(): void {
    this.messageText = this.add.text(GAME_W / 2, 125, '', {
      fontFamily: 'Arial', fontSize: '22px', color: TEXT_WHITE, fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);
  }

  private createCurrentWordArea(): void {
    this.currentWordContainer = this.add.container(GAME_W / 2, 195);
  }

  private renderCurrentWord(): void {
    this.currentWordContainer.removeAll(true);

    if (this.currentWord.length === 0) {
      const placeholder = this.add.text(0, 0, 'Type or click letters...', {
        fontFamily: 'Arial', fontSize: '22px', color: TEXT_DIM, fontStyle: 'italic'
      }).setOrigin(0.5);
      this.currentWordContainer.add(placeholder);
      return;
    }

    const charW = 38;
    const total = this.currentWord.length * charW;
    const startX = -total / 2 + charW / 2;

    this.currentWord.forEach((entry, i) => {
      const x = startX + i * charW;
      const bg = this.add.rectangle(x, 0, charW - 4, 52, ACCENT, 0.15);
      bg.setStrokeStyle(2, ACCENT);
      const txt = this.add.text(x, 0, entry.letter, {
        fontFamily: 'Arial', fontSize: '30px', color: TEXT_WHITE, fontStyle: 'bold'
      }).setOrigin(0.5);

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (!this.acceptingInput) return;
        this.removeLetterFromWord(i);
      });

      this.currentWordContainer.add([bg, txt]);
    });
  }

  private renderTiles(): void {
    this.tileContainers.forEach(c => c.destroy());
    this.tileContainers = [];

    const n = this.letters.length;
    const total = n * TILE_SIZE + (n - 1) * TILE_GAP;
    const startX = (GAME_W - total) / 2 + TILE_SIZE / 2;
    const y = 300;

    this.letters.forEach((letter, i) => {
      const x = startX + i * (TILE_SIZE + TILE_GAP);
      const container = this.add.container(x, y);

      const isUsed = this.tileUsed[i];
      const bg = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, isUsed ? TILE_BG_USED : TILE_BG);
      bg.setStrokeStyle(2, isUsed ? 0x333333 : ACCENT);
      const txt = this.add.text(0, 0, letter, {
        fontFamily: 'Arial',
        fontSize: '36px',
        color: isUsed ? TEXT_DIM : TEXT_WHITE,
        fontStyle: 'bold'
      }).setOrigin(0.5);

      container.add([bg, txt]);
      container.setSize(TILE_SIZE, TILE_SIZE);

      if (!isUsed) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => {
          if (!this.acceptingInput) return;
          this.addLetterToWord(i);
        });
      }

      this.tileContainers.push(container);
    });
  }

  private createButtons(): void {
    const y = 425;
    this.createButton('SHUFFLE', GAME_W / 2 - 170, y, 0x4a90d9, () => this.shuffleLetters());
    this.createButton('CLEAR', GAME_W / 2, y, 0x555555, () => this.clearCurrentWord());
    this.createButton('SUBMIT', GAME_W / 2 + 170, y, ACCENT, () => this.submit());
  }

  private createButton(label: string, x: number, y: number, color: number, onClick: () => void): void {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 150, 48, color);
    bg.setStrokeStyle(2, 0x000000, 0.4);
    const txt = this.add.text(0, 0, label, {
      fontFamily: 'Arial', fontSize: '16px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    container.add([bg, txt]);
    container.setSize(150, 48);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      if (!this.acceptingInput && label !== 'SHUFFLE') return;
      onClick();
    });
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
  }

  private createFoundPanel(): void {
    const x = 640;
    const y = 40;
    const w = 240;
    const h = 600;

    this.add.rectangle(x, y, w, h, PANEL_BG).setOrigin(0, 0).setStrokeStyle(2, 0x0f3460);
    this.add.text(x + w / 2, y + 22, 'FOUND', {
      fontFamily: 'Arial', fontSize: '18px', color: TEXT_WHITE, fontStyle: 'bold'
    }).setOrigin(0.5);

    this.foundListText = this.add.text(x + 16, y + 50, '', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: TEXT_WHITE,
      lineSpacing: 4,
      wordWrap: { width: w - 32 }
    });
  }

  private setupKeyboard(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.acceptingInput) return;
      const key = event.key;

      if (key === 'Backspace') {
        if (this.currentWord.length > 0) {
          this.removeLetterFromWord(this.currentWord.length - 1);
        }
        return;
      }

      if (key === 'Enter') {
        this.submit();
        return;
      }

      if (key === 'Escape') {
        this.clearCurrentWord();
        return;
      }

      if (/^[a-zA-Z]$/.test(key)) {
        const upper = key.toUpperCase();
        const tileIdx = this.letters.findIndex((l, i) => !this.tileUsed[i] && l === upper);
        if (tileIdx !== -1) {
          this.addLetterToWord(tileIdx);
        }
      }
    });
  }

  private addLetterToWord(tileIdx: number): void {
    if (this.tileUsed[tileIdx]) return;
    this.tileUsed[tileIdx] = true;
    this.currentWord.push({ letter: this.letters[tileIdx], tileIdx });
    this.renderTiles();
    this.renderCurrentWord();
  }

  private removeLetterFromWord(wordIdx: number): void {
    if (wordIdx < 0 || wordIdx >= this.currentWord.length) return;
    const entry = this.currentWord[wordIdx];
    this.tileUsed[entry.tileIdx] = false;
    this.currentWord.splice(wordIdx, 1);
    this.renderTiles();
    this.renderCurrentWord();
  }

  private submit(): void {
    if (!this.onSubmit || this.currentWord.length === 0 || !this.acceptingInput) return;
    const word = this.currentWord.map(e => e.letter).join('');
    const result = this.onSubmit(word);

    if (result === 'valid') {
      const pts = scoreWord(word);
      this.showMessage(`+${pts} pts — nice!`, '#4caf50');
      this.clearCurrentWord();
    } else if (result === 'already-found') {
      this.showMessage('Already found', '#ff9800');
    } else if (result === 'too-short') {
      this.showMessage('Too short (3+ letters)', '#ff9800');
    } else {
      this.showMessage('Not in word list', '#e94560');
    }
  }

  private shuffleLetters(): void {
    const n = this.letters.length;
    const indices = this.letters.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const oldLetters = [...this.letters];
    const oldUsed = [...this.tileUsed];
    this.letters = indices.map(i => oldLetters[i]);
    this.tileUsed = indices.map(i => oldUsed[i]);

    const remap = new Map<number, number>();
    indices.forEach((oldI, newI) => remap.set(oldI, newI));
    this.currentWord = this.currentWord.map(e => ({
      letter: e.letter,
      tileIdx: remap.get(e.tileIdx) ?? e.tileIdx
    }));

    this.renderTiles();
    this.renderCurrentWord();
  }
}
