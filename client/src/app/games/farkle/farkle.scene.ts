import Phaser from 'phaser';
import { AI_NAMES, getAvatarConfig } from '../../core/ai/ai-names';

export interface FarklePlayer {
  name: string;
  totalScore: number;
  isCurrentTurn: boolean;
  isHuman: boolean;
}

export interface FarkleVisualState {
  dice: number[];           // 6 dice values (0 = not rolled yet)
  keptIndices: number[];    // indices of dice that have been kept this turn
  selectableIndices: number[]; // indices player can click to select
  selectedIndices: number[]; // indices player has selected (highlighted, not yet kept)
  players: FarklePlayer[];
  currentPlayerIndex: number;
  turnScore: number;
  rollScore: number;        // score from current selection
  canRoll: boolean;
  canBank: boolean;
  canKeep: boolean;
  isMyTurn: boolean;
  message: string;
  hotDice: boolean;
}

export class FarkleScene extends Phaser.Scene {
  private readonly DICE_SIZE = 60;
  private readonly PLAY_AREA_W = 600;
  private readonly SCATTER_LEFT = 60;
  private readonly SCATTER_RIGHT = 530;
  private readonly SCATTER_TOP = 100;
  private readonly SCATTER_BOTTOM = 300;
  private readonly KEPT_ROW_Y = 350;
  private readonly ROLL_BTN_Y = 420;
  private readonly BANK_BTN_Y = 475;
  private readonly SCORE_PANEL_X = 610;
  private readonly SCORE_PANEL_W = 280;
  private readonly CANVAS_W = 900;
  private readonly CANVAS_H = 600;

  // Dice sprites
  private diceSprites: Phaser.GameObjects.Sprite[] = [];
  private scatterPositions: { x: number; y: number; angle: number }[] = [];
  private diceHighlights: Phaser.GameObjects.Graphics[] = [];

  // Instruction banner
  private instructionBg!: Phaser.GameObjects.Graphics;
  private instructionText!: Phaser.GameObjects.Text;

  // Buttons
  private rollBg!: Phaser.GameObjects.Graphics;
  private rollText!: Phaser.GameObjects.Text;
  private rollZone!: Phaser.GameObjects.Zone;
  private bankBg!: Phaser.GameObjects.Graphics;
  private bankText!: Phaser.GameObjects.Text;
  private bankZone!: Phaser.GameObjects.Zone;

  // Score panel
  private playerNameTexts: Phaser.GameObjects.Text[] = [];
  private playerScoreTexts: Phaser.GameObjects.Text[] = [];
  private playerBars: Phaser.GameObjects.Graphics[] = [];
  private turnIndicators: Phaser.GameObjects.Graphics[] = [];
  private playerAvatars: Phaser.GameObjects.GameObject[] = [];
  private currentPlayerText!: Phaser.GameObjects.Text;
  private turnScoreText!: Phaser.GameObjects.Text;
  private rollScoreText!: Phaser.GameObjects.Text;

  // Game over
  private gameOverElements: Phaser.GameObjects.GameObject[] = [];

  // State
  private isRolling = false;
  private currentKeptIndices: number[] = [];
  private prevInBottomRow: Set<number> = new Set();

  // Callbacks
  public onDieClick: ((index: number) => void) | null = null;
  public onRollClick: (() => void) | null = null;
  public onBankClick: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'FarkleScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/dice/';
    for (let i = 1; i <= 6; i++) {
      this.load.image(`fdie${i}`, basePath + `dieWhite${i}.png`);
      this.load.image(`fdieRed${i}`, basePath + `dieRed${i}.png`);
      this.load.image(`fdieSel${i}`, basePath + `dieWhite_border${i}.png`);
    }

    // Avatar images
    const avatarPath = 'assets/sprites/board-game/avatars/images/';
    for (const name of AI_NAMES) {
      this.load.image(`avatar_${name}`, avatarPath + `${name}.png`);
    }
  }

  create(): void {
    this.removeWhiteBackground();
    this.createInstruction();
    this.createDice();
    this.createButtons();
    this.createScorePanel();
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

  // --- Instruction Banner ---

  private createInstruction(): void {
    const cx = this.PLAY_AREA_W / 2;
    this.instructionBg = this.add.graphics();
    this.drawInstructionBg();
    this.instructionText = this.add.text(cx, 50, 'Roll the dice to begin!', {
      fontSize: '15px', color: '#333333', fontFamily: 'Arial'
    }).setOrigin(0.5);
  }

  private drawInstructionBg(): void {
    this.instructionBg.clear();
    this.instructionBg.fillStyle(0xffff88, 0.9);
    this.instructionBg.fillRoundedRect(30, 28, this.PLAY_AREA_W - 60, 44, 8);
    this.instructionBg.lineStyle(1, 0xcccc00);
    this.instructionBg.strokeRoundedRect(30, 28, this.PLAY_AREA_W - 60, 44, 8);
  }

  // --- Dice ---

  private createDice(): void {
    for (let i = 0; i < 6; i++) {
      this.scatterPositions.push({ x: 0, y: 0, angle: 0 });

      const highlight = this.add.graphics();
      highlight.setVisible(false);
      this.diceHighlights.push(highlight);

      const sprite = this.add.sprite(this.PLAY_AREA_W / 2, 200, 'fdie1');
      sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
      sprite.setVisible(false);
      sprite.setInteractive({ useHandCursor: true });
      const idx = i;
      sprite.on('pointerdown', () => {
        if (!this.isRolling && this.onDieClick) this.onDieClick(idx);
      });
      this.diceSprites.push(sprite);
    }
  }

  private randomScatterPos(existing: { x: number; y: number }[] = []): { x: number; y: number; angle: number } {
    const minDist = this.DICE_SIZE + 16;
    let attempts = 0;
    while (attempts < 50) {
      const x = Phaser.Math.Between(this.SCATTER_LEFT, this.SCATTER_RIGHT);
      const y = Phaser.Math.Between(this.SCATTER_TOP, this.SCATTER_BOTTOM);
      const tooClose = existing.some(p => {
        const dx = p.x - x;
        const dy = p.y - y;
        return Math.sqrt(dx * dx + dy * dy) < minDist;
      });
      if (!tooClose) return { x, y, angle: Phaser.Math.Between(-20, 20) };
      attempts++;
    }
    return {
      x: Phaser.Math.Between(this.SCATTER_LEFT, this.SCATTER_RIGHT),
      y: Phaser.Math.Between(this.SCATTER_TOP, this.SCATTER_BOTTOM),
      angle: Phaser.Math.Between(-20, 20)
    };
  }

  private generateScatterPositions(indices: number[]): void {
    const placed: { x: number; y: number }[] = [];
    for (const i of indices) {
      this.scatterPositions[i] = this.randomScatterPos(placed);
      placed.push(this.scatterPositions[i]);
    }
  }

  private getKeptSlotX(slotIndex: number, totalKept: number): number {
    const gap = this.DICE_SIZE + 14;
    const totalWidth = totalKept * gap - 14;
    const startX = this.PLAY_AREA_W / 2 - totalWidth / 2 + this.DICE_SIZE / 2;
    return startX + slotIndex * gap;
  }

  // --- Buttons ---

  private createButtons(): void {
    const cx = this.PLAY_AREA_W / 2;

    // Roll button
    this.rollBg = this.add.graphics();
    this.drawButton(this.rollBg, cx, this.ROLL_BTN_Y, 0xe94560);
    this.rollText = this.add.text(cx, this.ROLL_BTN_Y, 'Roll Dice', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.rollZone = this.add.zone(cx, this.ROLL_BTN_Y, 220, 44);
    this.rollZone.setInteractive({ useHandCursor: true });
    this.rollZone.on('pointerdown', () => {
      if (!this.isRolling && this.onRollClick) this.onRollClick();
    });
    this.rollZone.on('pointerover', () => this.drawButton(this.rollBg, cx, this.ROLL_BTN_Y, 0xff6b8a));
    this.rollZone.on('pointerout', () => this.drawButton(this.rollBg, cx, this.ROLL_BTN_Y, 0xe94560));

    // Bank button
    this.bankBg = this.add.graphics();
    this.drawButton(this.bankBg, cx, this.BANK_BTN_Y, 0x4a90d9);
    this.bankText = this.add.text(cx, this.BANK_BTN_Y, 'Bank Points', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.bankZone = this.add.zone(cx, this.BANK_BTN_Y, 220, 44);
    this.bankZone.setInteractive({ useHandCursor: true });
    this.bankZone.on('pointerdown', () => {
      if (!this.isRolling && this.onBankClick) this.onBankClick();
    });
    this.bankZone.on('pointerover', () => this.drawButton(this.bankBg, cx, this.BANK_BTN_Y, 0x6aace6));
    this.bankZone.on('pointerout', () => this.drawButton(this.bankBg, cx, this.BANK_BTN_Y, 0x4a90d9));
  }

  private drawButton(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color);
    gfx.fillRoundedRect(cx - 110, cy - 22, 220, 44, 8);
  }

  // --- Score Panel ---

  private createScorePanel(): void {
    const x = this.SCORE_PANEL_X;
    const w = this.SCORE_PANEL_W;

    const bg = this.add.graphics();
    bg.fillStyle(0x16213e);
    bg.fillRoundedRect(x, 10, w, this.CANVAS_H - 20, 8);
    bg.lineStyle(1, 0x0f3460);
    bg.strokeRoundedRect(x, 10, w, this.CANVAS_H - 20, 8);

    // Title
    this.add.text(x + w / 2, 36, 'SCORES', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Goal line
    this.add.text(x + w - 20, 36, '10,000', {
      fontSize: '11px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(1, 0.5);

    // Divider
    const d = this.add.graphics();
    d.lineStyle(1, 0x0f3460);
    d.lineBetween(x + 10, 56, x + w - 10, 56);

    // Player rows (create 4 slots, show/hide as needed)
    const colors = [0x4a90d9, 0xe94560, 0x4caf50, 0xff9800];
    const colorStr = ['#4a90d9', '#e94560', '#4caf50', '#ff9800'];

    for (let i = 0; i < 4; i++) {
      const rowY = 80 + i * 60;

      const indicator = this.add.graphics();
      indicator.setVisible(false);
      this.turnIndicators.push(indicator);

      const nameText = this.add.text(x + 55, rowY, '', {
        fontSize: '14px', color: colorStr[i], fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setVisible(false);
      this.playerNameTexts.push(nameText);

      const scoreText = this.add.text(x + w - 20, rowY, '0', {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(1, 0.5).setVisible(false);
      this.playerScoreTexts.push(scoreText);

      // Progress bar
      const bar = this.add.graphics();
      bar.setVisible(false);
      this.playerBars.push(bar);
    }

    // Current turn label
    const infoY = 330;
    const infoDivider = this.add.graphics();
    infoDivider.lineStyle(1, 0x0f3460);
    infoDivider.lineBetween(x + 10, infoY - 10, x + w - 10, infoY - 10);

    this.add.text(x + w / 2, infoY + 10, 'Current Turn', {
      fontSize: '12px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.currentPlayerText = this.add.text(x + w / 2, infoY + 34, '', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(x + w / 2, infoY + 65, 'Turn Score', {
      fontSize: '12px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.turnScoreText = this.add.text(x + w / 2, infoY + 88, '0', {
      fontSize: '28px', color: '#ffff00', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.rollScoreText = this.add.text(x + w / 2, infoY + 118, '', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5);
  }

  // --- State Update ---

  public updateState(state: FarkleVisualState): void {
    // Update dice positions and visuals
    const keptSet = new Set(state.keptIndices);
    const selectedSet = new Set(state.selectedIndices);
    const selectableSet = new Set(state.selectableIndices);

    // Bottom row holds both kept (red) and selected (white-border) dice
    const totalBottom = state.keptIndices.length + state.selectedIndices.length;
    let bottomSlot = 0;

    for (let i = 0; i < 6; i++) {
      const val = state.dice[i];
      const sprite = this.diceSprites[i];
      const highlight = this.diceHighlights[i];

      if (val < 1 || val > 6) {
        sprite.setVisible(false);
        highlight.setVisible(false);
        continue;
      }

      sprite.setVisible(true);
      highlight.setVisible(false);

      if (keptSet.has(i)) {
        // Permanently kept dice — red, in bottom row, not clickable
        sprite.setTexture(`fdieRed${val}`);
        sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const targetX = this.getKeptSlotX(bottomSlot, totalBottom);
        this.tweens.add({
          targets: sprite, x: targetX, y: this.KEPT_ROW_Y, angle: 0,
          duration: 250, ease: 'Power2'
        });
        sprite.disableInteractive();
        bottomSlot++;
      } else if (selectedSet.has(i)) {
        // Selected dice — white with border, in bottom row, clickable to un-select
        sprite.setTexture(`fdieSel${val}`);
        sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const targetX = this.getKeptSlotX(bottomSlot, totalBottom);
        this.tweens.add({
          targets: sprite, x: targetX, y: this.KEPT_ROW_Y, angle: 0,
          duration: 250, ease: 'Power2'
        });
        if (state.isMyTurn) {
          sprite.setInteractive({ useHandCursor: true });
        } else {
          sprite.disableInteractive();
        }
        bottomSlot++;
      } else {
        // Active dice in scatter area
        sprite.setTexture(`fdie${val}`);
        sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const pos = this.scatterPositions[i];

        if (this.prevInBottomRow.has(i)) {
          // Was in bottom row, now back in scatter — tween back smoothly
          this.tweens.add({
            targets: sprite, x: pos.x, y: pos.y, angle: pos.angle,
            duration: 250, ease: 'Power2'
          });
        } else {
          sprite.setPosition(pos.x, pos.y);
          sprite.setAngle(pos.angle);
        }

        if (state.isMyTurn && selectableSet.has(i)) {
          sprite.setInteractive({ useHandCursor: true });
        } else {
          sprite.disableInteractive();
        }
      }
    }

    // Track which dice are in the bottom row for next update
    this.prevInBottomRow = new Set([...state.keptIndices, ...state.selectedIndices]);

    // Update instruction
    this.drawInstructionBg();
    this.instructionText.setText(state.message);
    this.instructionText.setY(50);

    // Update buttons
    const cx = this.PLAY_AREA_W / 2;
    if (state.canRoll || state.canKeep) {
      this.rollText.setText('Roll Dice');
      this.drawButton(this.rollBg, cx, this.ROLL_BTN_Y, 0xe94560);
      this.rollZone.setInteractive({ useHandCursor: true });
    } else {
      this.rollText.setText(state.isMyTurn ? 'Select dice first' : '...');
      this.drawButton(this.rollBg, cx, this.ROLL_BTN_Y, 0x555555);
      this.rollZone.disableInteractive();
    }

    if (state.canBank) {
      this.drawButton(this.bankBg, cx, this.BANK_BTN_Y, 0x4a90d9);
      const bankTotal = state.turnScore + state.rollScore;
      this.bankText.setText(`Bank ${bankTotal} pts`);
      this.bankZone.setInteractive({ useHandCursor: true });
    } else {
      this.drawButton(this.bankBg, cx, this.BANK_BTN_Y, 0x555555);
      this.bankText.setText('Bank Points');
      this.bankZone.disableInteractive();
    }

    // Clear old avatars
    this.playerAvatars.forEach(a => a.destroy());
    this.playerAvatars = [];

    // Update score panel
    const colors = [0x4a90d9, 0xe94560, 0x4caf50, 0xff9800];
    for (let i = 0; i < 4; i++) {
      if (i < state.players.length) {
        const p = state.players[i];
        this.playerNameTexts[i].setText(p.name).setVisible(true);
        this.playerScoreTexts[i].setText(p.totalScore.toLocaleString()).setVisible(true);

        // Draw avatar next to name
        const avatarX = this.SCORE_PANEL_X + 35;
        const avatarY = 80 + i * 60;
        const r = 14;
        if (!p.isHuman) {
          const imageKey = `avatar_${p.name}`;
          if (this.textures.exists(imageKey)) {
            const img = this.add.image(avatarX, avatarY, imageKey)
              .setDisplaySize(r * 2, r * 2).setDepth(1);
            this.playerAvatars.push(img);
          } else {
            const config = getAvatarConfig(p.name);
            const gfx = this.add.graphics().setDepth(1);
            gfx.fillStyle(config.color);
            gfx.fillCircle(avatarX, avatarY, r);
            gfx.lineStyle(1, 0xd4a847, 0.6);
            gfx.strokeCircle(avatarX, avatarY, r);
            this.playerAvatars.push(gfx);
            const initial = this.add.text(avatarX, avatarY, config.initial, {
              fontSize: '11px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(2);
            this.playerAvatars.push(initial);
          }
        }

        // Progress bar
        const barX = this.SCORE_PANEL_X + 55;
        const barY = 80 + i * 60 + 14;
        const barW = this.SCORE_PANEL_W - 75;
        const progress = Math.min(p.totalScore / 10000, 1);

        this.playerBars[i].clear();
        this.playerBars[i].setVisible(true);
        // Background
        this.playerBars[i].fillStyle(0x0f3460);
        this.playerBars[i].fillRoundedRect(barX, barY, barW, 8, 4);
        // Fill
        if (progress > 0) {
          this.playerBars[i].fillStyle(colors[i]);
          this.playerBars[i].fillRoundedRect(barX, barY, Math.max(barW * progress, 8), 8, 4);
        }

        // Turn indicator (arrow)
        this.turnIndicators[i].clear();
        if (i === state.currentPlayerIndex) {
          this.turnIndicators[i].setVisible(true);
          this.turnIndicators[i].fillStyle(0xffff00);
          const arrowX = this.SCORE_PANEL_X + 18;
          const arrowY = 80 + i * 60;
          this.turnIndicators[i].fillTriangle(
            arrowX - 6, arrowY - 6,
            arrowX + 6, arrowY,
            arrowX - 6, arrowY + 6
          );
        } else {
          this.turnIndicators[i].setVisible(false);
        }
      } else {
        this.playerNameTexts[i].setVisible(false);
        this.playerScoreTexts[i].setVisible(false);
        this.playerBars[i].setVisible(false);
        this.turnIndicators[i].setVisible(false);
      }
    }

    // Current turn info
    const cp = state.players[state.currentPlayerIndex];
    if (cp) {
      this.currentPlayerText.setText(cp.name);
    }
    this.turnScoreText.setText(state.turnScore.toString());
    this.rollScoreText.setText(state.rollScore > 0 ? `+${state.rollScore} selected` : '');
  }

  // --- Roll Animation ---

  public animateRoll(finalDice: number[], rollingIndices: number[], callback: () => void): void {
    this.isRolling = true;

    // Generate new scatter positions for rolling dice
    const placed: { x: number; y: number }[] = [];
    // Collect positions of non-rolling dice
    for (let i = 0; i < 6; i++) {
      if (!rollingIndices.includes(i) && this.diceSprites[i].visible) {
        placed.push({ x: this.diceSprites[i].x, y: this.diceSprites[i].y });
      }
    }
    for (const i of rollingIndices) {
      this.scatterPositions[i] = this.randomScatterPos(placed);
      placed.push(this.scatterPositions[i]);
    }

    for (const i of rollingIndices) {
      this.diceSprites[i].setVisible(true);
      this.diceSprites[i].setAlpha(1);
      this.diceHighlights[i].setVisible(false);
    }

    let ticks = 0;
    const totalTicks = 10;
    const interval = 45;

    const doTick = () => {
      ticks++;
      for (const i of rollingIndices) {
        const rv = Phaser.Math.Between(1, 6);
        this.diceSprites[i].setTexture(`fdie${rv}`);
        this.diceSprites[i].setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const tmp = this.randomScatterPos();
        this.diceSprites[i].setPosition(tmp.x, tmp.y);
        this.diceSprites[i].setAngle(tmp.angle);
      }
      if (ticks < totalTicks) {
        this.time.delayedCall(interval, doTick);
      } else {
        for (const i of rollingIndices) {
          this.diceSprites[i].setTexture(`fdie${finalDice[i]}`);
          this.diceSprites[i].setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
          const pos = this.scatterPositions[i];
          this.diceSprites[i].setPosition(pos.x, pos.y);
          this.diceSprites[i].setAngle(pos.angle);
        }
        this.isRolling = false;
        callback();
      }
    };
    doTick();
  }

  // --- Special Animations ---

  public showFarkle(callback: () => void): void {
    const cx = this.PLAY_AREA_W / 2;
    const cy = 200;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.5);
    overlay.fillRect(0, 0, this.PLAY_AREA_W, this.CANVAS_H);

    const text = this.add.text(cx, cy, 'FARKLE!', {
      fontSize: '48px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);

    const subText = this.add.text(cx, cy + 50, 'No scoring dice — turn lost!', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial'
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [text, subText],
      alpha: 1,
      duration: 300,
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: [text, subText, overlay],
            alpha: 0,
            duration: 300,
            onComplete: () => {
              text.destroy();
              subText.destroy();
              overlay.destroy();
              callback();
            }
          });
        });
      }
    });
  }

  public showHotDice(callback: () => void): void {
    const cx = this.PLAY_AREA_W / 2;
    const cy = 200;

    const text = this.add.text(cx, cy, 'HOT DICE!', {
      fontSize: '42px', color: '#ff9800', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);

    const subText = this.add.text(cx, cy + 45, 'All 6 dice scored — roll them all again!', {
      fontSize: '15px', color: '#ffffff', fontFamily: 'Arial'
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [text, subText],
      alpha: 1,
      duration: 300,
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: [text, subText],
            alpha: 0,
            duration: 300,
            onComplete: () => {
              text.destroy();
              subText.destroy();
              callback();
            }
          });
        });
      }
    });
  }

  public showGameOver(players: FarklePlayer[], winnerIndex: number): void {
    const cw = this.CANVAS_W;
    const ch = this.CANVAS_H;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, cw, ch);
    this.gameOverElements.push(overlay);

    const pw = 380;
    const ph = 60 + players.length * 40 + 30;
    const px = cw / 2 - pw / 2;
    const py = ch / 2 - ph / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(px, py, pw, ph, 12);
    panel.lineStyle(2, 0xe94560);
    panel.strokeRoundedRect(px, py, pw, ph, 12);
    this.gameOverElements.push(panel);

    const winner = players[winnerIndex];
    const title = this.add.text(cw / 2, py + 30, `${winner.name} Wins!`, {
      fontSize: '26px', color: '#00ff00', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.gameOverElements.push(title);

    // Player scores listing
    const colorStr = ['#4a90d9', '#e94560', '#4caf50', '#ff9800'];
    for (let i = 0; i < players.length; i++) {
      const rowY = py + 70 + i * 36;
      const p = players[i];
      const medal = i === winnerIndex ? ' \u2B50' : '';
      const scoreStr = this.add.text(cw / 2, rowY,
        `${p.name}: ${p.totalScore.toLocaleString()}${medal}`, {
        fontSize: '18px', color: colorStr[i], fontFamily: 'Arial',
        fontStyle: i === winnerIndex ? 'bold' : 'normal'
      }).setOrigin(0.5);
      this.gameOverElements.push(scoreStr);
    }

    this.rollZone.disableInteractive();
    this.bankZone.disableInteractive();
  }

  public resetGame(): void {
    for (const el of this.gameOverElements) el.destroy();
    this.gameOverElements = [];
    this.isRolling = false;
    this.currentKeptIndices = [];
    this.prevInBottomRow = new Set();

    for (let i = 0; i < 6; i++) {
      this.diceSprites[i].setVisible(false);
      this.diceHighlights[i].setVisible(false);
    }

    this.generateScatterPositions([0, 1, 2, 3, 4, 5]);

    const cx = this.PLAY_AREA_W / 2;
    this.drawButton(this.rollBg, cx, this.ROLL_BTN_Y, 0xe94560);
    this.rollText.setText('Roll Dice');
    this.rollZone.setInteractive({ useHandCursor: true });
    this.drawButton(this.bankBg, cx, this.BANK_BTN_Y, 0x555555);
    this.bankText.setText('Bank Points');
    this.bankZone.disableInteractive();

    this.instructionText.setText('Roll the dice to begin!');
    this.turnScoreText.setText('0');
    this.rollScoreText.setText('');
  }
}
