import Phaser from 'phaser';
import { AI_NAMES, getAvatarConfig } from '../../core/ai/ai-names';

export interface YahtzeePlayerState {
  name: string;
  lockedScores: Record<string, number | null>;
  topTotal: number;
  topBonus: boolean;
  totalScore: number;
}

export interface YahtzeeVisualState {
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  round: number;
  currentScores: Record<string, number>;
  players: YahtzeePlayerState[];
  currentPlayerIndex: number;
  myIndex: number;
  isMyTurn: boolean;
}

const TOP_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const BOTTOM_CATEGORIES = ['threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'chance', 'yahtzee'];

const CATEGORY_LABELS: Record<string, string> = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  threeOfAKind: '3 of a Kind', fourOfAKind: '4 of a Kind', fullHouse: 'Full House',
  smallStraight: 'Sm Straight', largeStraight: 'Lg Straight', chance: 'Chance', yahtzee: 'Yahtzee'
};

const PLAYER_COLORS = ['#4a90d9', '#e94560', '#44cc44', '#ffaa00'];
const PLAYER_COLORS_HEX = [0x4a90d9, 0xe94560, 0x44cc44, 0xffaa00];

export class YahtzeeScene extends Phaser.Scene {
  private readonly DICE_SIZE = 60;
  private readonly PLAY_AREA_W = 530;
  private readonly SCATTER_LEFT = 50;
  private readonly SCATTER_RIGHT = 480;
  private readonly SCATTER_TOP = 110;
  private readonly SCATTER_BOTTOM = 340;
  private readonly KEPT_ROW_Y = 540;
  private readonly AI_KEPT_ROW_Y = 30;
  private readonly ROLL_BTN_Y = 430;
  private readonly SCOREBOARD_X = 545;
  private readonly SCOREBOARD_W = 345;

  // Dice
  private diceSprites: Phaser.GameObjects.Sprite[] = [];
  private scatterPositions: { x: number; y: number; angle: number }[] = [];
  private prevHeld: boolean[] = [false, false, false, false, false];

  // Instruction
  private instructionBg!: Phaser.GameObjects.Graphics;
  private instructionText!: Phaser.GameObjects.Text;

  // Roll button
  private rollBg!: Phaser.GameObjects.Graphics;
  private rollText!: Phaser.GameObjects.Text;
  private rollZone!: Phaser.GameObjects.Zone;

  // Turn text
  private turnText!: Phaser.GameObjects.Text;

  // Scoreboard — N columns
  private playerCount = 2;
  private scoreTexts: Record<string, Phaser.GameObjects.Text[]> = {};
  private scoreZones: Record<string, Phaser.GameObjects.Zone> = {};
  private scoreRowBgs: Record<string, Phaser.GameObjects.Graphics> = {};
  private headerTexts: Phaser.GameObjects.Text[] = [];
  private topTexts: Phaser.GameObjects.Text[] = [];
  private bonusTexts: Phaser.GameObjects.Text[] = [];
  private totalTexts: Phaser.GameObjects.Text[] = [];

  // Avatars in scoreboard header
  private headerAvatars: Phaser.GameObjects.GameObject[] = [];

  // Game over
  private gameOverElements: Phaser.GameObjects.GameObject[] = [];

  // State
  private isRolling = false;

  // Callbacks
  public onDieClick: ((index: number) => void) | null = null;
  public onRollClick: (() => void) | null = null;
  public onScoreClick: ((category: string) => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'YahtzeeScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/dice/';
    for (let i = 1; i <= 6; i++) {
      this.load.image(`die${i}`, basePath + `dieWhite${i}.png`);
      this.load.image(`dieHeld${i}`, basePath + `dieWhite_border${i}.png`);
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
    this.createRollButton();
    this.createTurnText();
    this.createScoreboard(2, ['You', 'CPU']);
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

  /** Rebuild scoreboard for a given number of players with names */
  public setupPlayers(names: string[]): void {
    this.destroyScoreboard();
    this.playerCount = names.length;
    this.createScoreboard(names.length, names);
  }

  // --- Instruction ---

  private createInstruction(): void {
    const cx = this.PLAY_AREA_W / 2;
    this.instructionBg = this.add.graphics();
    this.drawInstructionBg();
    this.instructionText = this.add.text(cx, 50, "Click 'Roll Dice' to begin.", {
      fontSize: '15px', color: '#333333', fontFamily: 'Arial',
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
    for (let i = 0; i < 5; i++) {
      this.scatterPositions.push({ x: 0, y: 0, angle: 0 });
      const sprite = this.add.sprite(this.PLAY_AREA_W / 2, 250, 'die1');
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

  // --- Roll Button ---

  private createRollButton(): void {
    const cx = this.PLAY_AREA_W / 2;
    const y = this.ROLL_BTN_Y;
    this.rollBg = this.add.graphics();
    this.rollBg.fillStyle(0xe94560);
    this.rollBg.fillRoundedRect(cx - 110, y - 22, 220, 44, 8);

    this.rollText = this.add.text(cx, y, 'Roll Dice', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.rollZone = this.add.zone(cx, y, 220, 44);
    this.rollZone.setInteractive({ useHandCursor: true });
    this.rollZone.on('pointerdown', () => {
      if (!this.isRolling && this.onRollClick) this.onRollClick();
    });
    this.rollZone.on('pointerover', () => this.redrawRollBtn(0xff6b8a));
    this.rollZone.on('pointerout', () => this.redrawRollBtn(0xe94560));
  }

  private redrawRollBtn(color: number): void {
    const cx = this.PLAY_AREA_W / 2;
    this.rollBg.clear();
    this.rollBg.fillStyle(color);
    this.rollBg.fillRoundedRect(cx - 110, this.ROLL_BTN_Y - 22, 220, 44, 8);
  }

  private createTurnText(): void {
    this.turnText = this.add.text(this.PLAY_AREA_W / 2, this.ROLL_BTN_Y + 34, 'Round 1 of 13', {
      fontSize: '14px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(0.5);
  }

  // --- Scoreboard (N columns) ---

  private scoreboardElements: Phaser.GameObjects.GameObject[] = [];

  private destroyScoreboard(): void {
    for (const el of this.scoreboardElements) el.destroy();
    this.scoreboardElements = [];
    this.scoreTexts = {};
    this.scoreZones = {};
    this.scoreRowBgs = {};
    this.headerTexts = [];
    this.topTexts = [];
    this.bonusTexts = [];
    this.totalTexts = [];
  }

  private createScoreboard(numPlayers: number, names: string[]): void {
    const x = this.SCOREBOARD_X;
    const y = 4;
    const w = this.SCOREBOARD_W;
    const rowH = 30;

    // Column layout: category label takes ~120px, rest split among players
    const labelW = 120;
    const colSpace = w - labelW - 10;
    const colW = colSpace / numPlayers;
    const colXs: number[] = [];
    for (let p = 0; p < numPlayers; p++) {
      colXs.push(x + labelW + colW * p + colW / 2);
    }

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e);
    panelBg.fillRoundedRect(x, y, w, 590, 8);
    panelBg.lineStyle(1, 0x0f3460);
    panelBg.strokeRoundedRect(x, y, w, 590, 8);
    this.scoreboardElements.push(panelBg);

    // Clear old header avatars
    this.headerAvatars.forEach(a => a.destroy());
    this.headerAvatars = [];

    // Header — avatar above name for AI players, taller header area
    const headerCenterY = y + 30;
    const catHeader = this.add.text(x + 15, headerCenterY, 'Category', {
      fontSize: '13px', color: '#888888', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.scoreboardElements.push(catHeader);

    for (let p = 0; p < numPlayers; p++) {
      const maxLen = numPlayers <= 2 ? 10 : numPlayers === 3 ? 6 : 5;
      const displayName = names[p].length > maxLen ? names[p].substring(0, maxLen) : names[p];
      const isHuman = names[p] === 'You';

      if (!isHuman) {
        // Avatar above name
        const avatarR = 14;
        const ax = colXs[p];
        const ay = headerCenterY - 10;

        const imageKey = `avatar_${names[p]}`;
        if (this.textures.exists(imageKey)) {
          const img = this.add.image(ax, ay, imageKey)
            .setDisplaySize(avatarR * 2, avatarR * 2).setDepth(1);
          this.headerAvatars.push(img);
          this.scoreboardElements.push(img);
        } else {
          const config = getAvatarConfig(names[p]);
          const gfx = this.add.graphics().setDepth(1);
          gfx.fillStyle(config.color);
          gfx.fillCircle(ax, ay, avatarR);
          gfx.lineStyle(1, 0xd4a847, 0.6);
          gfx.strokeCircle(ax, ay, avatarR);
          this.headerAvatars.push(gfx);
          this.scoreboardElements.push(gfx);
          const initial = this.add.text(ax, ay, config.initial, {
            fontSize: '12px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
          }).setOrigin(0.5).setDepth(2);
          this.headerAvatars.push(initial);
          this.scoreboardElements.push(initial);
        }

        // Name below avatar
        const ht = this.add.text(colXs[p], headerCenterY + 12, displayName, {
          fontSize: '13px', color: PLAYER_COLORS[p % PLAYER_COLORS.length], fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5, 0.5);
        this.scoreboardElements.push(ht);
        this.headerTexts.push(ht);
      } else {
        // Human — just centered name
        const ht = this.add.text(colXs[p], headerCenterY, displayName, {
          fontSize: '13px', color: PLAYER_COLORS[p % PLAYER_COLORS.length], fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5, 0.5);
        this.scoreboardElements.push(ht);
        this.headerTexts.push(ht);
      }
    }

    // Divider under header
    const hd = this.add.graphics();
    hd.lineStyle(1, 0x0f3460);
    hd.lineBetween(x + 8, y + 52, x + w - 8, y + 52);
    this.scoreboardElements.push(hd);

    let rowY = y + 68;

    // Top section
    for (const cat of TOP_CATEGORIES) {
      this.createScoreRow(cat, CATEGORY_LABELS[cat], x, rowY, w, rowH, colXs, numPlayers);
      rowY += rowH;
    }

    // Top section summary
    rowY += 2;
    const d1 = this.add.graphics();
    d1.lineStyle(1, 0x0f3460);
    d1.lineBetween(x + 8, rowY, x + w - 8, rowY);
    this.scoreboardElements.push(d1);
    rowY += 12;

    const topLabel = this.add.text(x + 15, rowY, 'Top', {
      fontSize: '13px', color: '#666666', fontFamily: 'Arial'
    }).setOrigin(0, 0.5);
    this.scoreboardElements.push(topLabel);

    for (let p = 0; p < numPlayers; p++) {
      const tt = this.add.text(colXs[p], rowY, '0/63', {
        fontSize: '13px', color: '#888888', fontFamily: 'Arial'
      }).setOrigin(0.5, 0.5);
      this.scoreboardElements.push(tt);
      this.topTexts.push(tt);
    }

    rowY += 18;
    const bonusLabel = this.add.text(x + 15, rowY, 'Bonus', {
      fontSize: '13px', color: '#666666', fontFamily: 'Arial'
    }).setOrigin(0, 0.5);
    this.scoreboardElements.push(bonusLabel);

    for (let p = 0; p < numPlayers; p++) {
      const bt = this.add.text(colXs[p], rowY, '--', {
        fontSize: '13px', color: '#888888', fontFamily: 'Arial'
      }).setOrigin(0.5, 0.5);
      this.scoreboardElements.push(bt);
      this.bonusTexts.push(bt);
    }

    rowY += 16;
    const d2 = this.add.graphics();
    d2.lineStyle(1, 0x0f3460);
    d2.lineBetween(x + 8, rowY, x + w - 8, rowY);
    this.scoreboardElements.push(d2);
    rowY += 8;

    // Bottom section
    for (const cat of BOTTOM_CATEGORIES) {
      this.createScoreRow(cat, CATEGORY_LABELS[cat], x, rowY, w, rowH, colXs, numPlayers);
      rowY += rowH;
    }

    // Total
    rowY += 4;
    const d3 = this.add.graphics();
    d3.lineStyle(1, 0x0f3460);
    d3.lineBetween(x + 8, rowY, x + w - 8, rowY);
    this.scoreboardElements.push(d3);
    rowY += 14;

    const totalLabel = this.add.text(x + 15, rowY, 'TOTAL', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.scoreboardElements.push(totalLabel);

    for (let p = 0; p < numPlayers; p++) {
      const tt = this.add.text(colXs[p], rowY, '0', {
        fontSize: '16px', color: PLAYER_COLORS[p % PLAYER_COLORS.length], fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5, 0.5);
      this.scoreboardElements.push(tt);
      this.totalTexts.push(tt);
    }
  }

  private createScoreRow(cat: string, label: string, px: number, ry: number, pw: number, rh: number, colXs: number[], numPlayers: number): void {
    const rowBg = this.add.graphics();
    this.scoreRowBgs[cat] = rowBg;
    this.scoreboardElements.push(rowBg);

    const lbl = this.add.text(px + 15, ry, label, {
      fontSize: '14px', color: '#cccccc', fontFamily: 'Arial'
    }).setOrigin(0, 0.5);
    this.scoreboardElements.push(lbl);

    this.scoreTexts[cat] = [];
    for (let p = 0; p < numPlayers; p++) {
      const st = this.add.text(colXs[p], ry, '--', {
        fontSize: '14px', color: '#666666', fontFamily: 'Arial'
      }).setOrigin(0.5, 0.5);
      this.scoreboardElements.push(st);
      this.scoreTexts[cat].push(st);
    }

    const zone = this.add.zone(px + pw / 2, ry, pw - 10, rh);
    zone.setInteractive({ useHandCursor: true });
    this.scoreZones[cat] = zone;
    this.scoreboardElements.push(zone);

    zone.on('pointerdown', () => {
      if (this.onScoreClick) this.onScoreClick(cat);
    });
    zone.on('pointerover', () => {
      rowBg.clear();
      rowBg.fillStyle(0x0f3460, 0.4);
      rowBg.fillRect(px + 4, ry - rh / 2, pw - 8, rh);
    });
    zone.on('pointerout', () => rowBg.clear());
  }

  // --- State Update ---

  public updateState(state: YahtzeeVisualState): void {
    // Dice positions
    const keptIndices: number[] = [];
    const scatteredIndices: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (state.held[i]) keptIndices.push(i);
      else scatteredIndices.push(i);
    }

    const keptY = state.isMyTurn ? this.KEPT_ROW_Y : this.AI_KEPT_ROW_Y;

    for (let slot = 0; slot < keptIndices.length; slot++) {
      const i = keptIndices[slot];
      const val = state.dice[i];
      const sprite = this.diceSprites[i];
      if (val >= 1 && val <= 6) {
        sprite.setTexture(`die${val}`);
        sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        sprite.setAlpha(1);
        sprite.setVisible(true);
        const targetX = this.getKeptSlotX(slot, keptIndices.length);
        this.tweens.add({
          targets: sprite, x: targetX, y: keptY, angle: 0,
          duration: this.prevHeld[i] ? 150 : 300, ease: 'Power2'
        });
      }
    }

    for (const i of scatteredIndices) {
      const val = state.dice[i];
      const sprite = this.diceSprites[i];
      if (val >= 1 && val <= 6) {
        sprite.setTexture(`die${val}`);
        sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        sprite.setAlpha(1);
        sprite.setVisible(true);
        if (this.prevHeld[i]) {
          const others = scatteredIndices.filter(j => j !== i).map(j => this.scatterPositions[j]);
          this.scatterPositions[i] = this.randomScatterPos(others);
          const pos = this.scatterPositions[i];
          this.tweens.add({
            targets: sprite, x: pos.x, y: pos.y, angle: pos.angle, duration: 300, ease: 'Power2'
          });
        } else {
          const pos = this.scatterPositions[i];
          sprite.setPosition(pos.x, pos.y);
          sprite.setAngle(pos.angle);
        }
      } else {
        sprite.setVisible(false);
      }
    }
    this.prevHeld = [...state.held];

    // Instruction
    if (!state.isMyTurn) {
      const currentName = state.players[state.currentPlayerIndex]?.name || 'Opponent';
      this.instructionText.setText(`${currentName} is playing...`);
      this.instructionBg.clear();
      this.instructionBg.fillStyle(0xffff88, 0.9);
      this.instructionBg.fillRoundedRect(30, this.ROLL_BTN_Y - 70, this.PLAY_AREA_W - 60, 44, 8);
      this.instructionBg.lineStyle(1, 0xcccc00);
      this.instructionBg.strokeRoundedRect(30, this.ROLL_BTN_Y - 70, this.PLAY_AREA_W - 60, 44, 8);
      this.instructionText.setY(this.ROLL_BTN_Y - 48);
    } else {
      this.drawInstructionBg();
      this.instructionText.setY(50);
      if (state.rollsLeft === 3) {
        this.instructionText.setText("Click 'Roll Dice' to begin your turn.");
      } else if (state.rollsLeft > 0) {
        this.instructionText.setText(`Click dice to keep. ${state.rollsLeft} throw${state.rollsLeft > 1 ? 's' : ''} left.`);
      } else {
        this.instructionText.setText('Pick a scoring category.');
      }
    }

    // Roll button
    this.rollBg.clear();
    if (state.isMyTurn && state.rollsLeft > 0) {
      this.rollText.setText('Roll Dice');
      this.rollBg.fillStyle(0xe94560);
      this.rollZone.setInteractive({ useHandCursor: true });
    } else {
      this.rollText.setText(state.isMyTurn ? 'Pick a Score' : '...');
      this.rollBg.fillStyle(0x555555);
      this.rollZone.disableInteractive();
    }
    this.rollBg.fillRoundedRect(this.PLAY_AREA_W / 2 - 110, this.ROLL_BTN_Y - 22, 220, 44, 8);

    // Turn
    this.turnText.setText(`Round ${state.round} of 13`);

    // Scoreboard
    const allCats = [...TOP_CATEGORIES, ...BOTTOM_CATEGORIES];
    const hasRolled = state.rollsLeft < 3;

    for (const cat of allCats) {
      const texts = this.scoreTexts[cat];
      if (!texts) continue;

      for (let p = 0; p < state.players.length && p < texts.length; p++) {
        const txt = texts[p];
        const locked = state.players[p].lockedScores[cat];

        if (locked !== null && locked !== undefined) {
          txt.setText(locked.toString());
          txt.setColor(PLAYER_COLORS[p % PLAYER_COLORS.length]);
        } else if (p === state.myIndex && state.isMyTurn && hasRolled && state.currentScores[cat] !== undefined) {
          // Show preview score for the active (local) player
          txt.setText(state.currentScores[cat].toString());
          txt.setColor('#e94560');
        } else {
          txt.setText('--');
          txt.setColor('#666666');
        }
      }

      // Interactive zones — only during my turn after rolling, for my unlocked categories
      if (state.isMyTurn && hasRolled && state.players[state.myIndex]?.lockedScores[cat] === null) {
        this.scoreZones[cat]?.setInteractive({ useHandCursor: true });
      } else {
        this.scoreZones[cat]?.disableInteractive();
      }
    }

    // Top totals and bonus
    for (let p = 0; p < state.players.length; p++) {
      if (this.topTexts[p]) {
        this.topTexts[p].setText(`${state.players[p].topTotal}/63`);
      }
      if (this.bonusTexts[p]) {
        this.bonusTexts[p].setText(state.players[p].topBonus ? '+35' : '--');
        this.bonusTexts[p].setColor(state.players[p].topBonus ? '#00ff00' : '#888888');
      }
      if (this.totalTexts[p]) {
        this.totalTexts[p].setText(state.players[p].totalScore.toString());
      }
    }
  }

  // --- Roll Animation ---

  public animateRoll(finalDice: number[], held: boolean[], callback: () => void): void {
    this.isRolling = true;
    const rollingIndices = held.map((h, i) => h ? -1 : i).filter(i => i >= 0);
    this.generateScatterPositions(rollingIndices);
    for (const i of rollingIndices) {
      this.diceSprites[i].setVisible(true);
      this.diceSprites[i].setAlpha(1);
    }

    let ticks = 0;
    const totalTicks = 10;
    const interval = 45;

    const doTick = () => {
      ticks++;
      for (const i of rollingIndices) {
        const rv = Phaser.Math.Between(1, 6);
        this.diceSprites[i].setTexture(`die${rv}`);
        this.diceSprites[i].setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const tmp = this.randomScatterPos();
        this.diceSprites[i].setPosition(tmp.x, tmp.y);
        this.diceSprites[i].setAngle(tmp.angle);
      }
      if (ticks < totalTicks) {
        this.time.delayedCall(interval, doTick);
      } else {
        for (const i of rollingIndices) {
          this.diceSprites[i].setTexture(`die${finalDice[i]}`);
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

  public flashScoreRow(category: string, playerIndex: number): void {
    const texts = this.scoreTexts[category];
    if (texts && texts[playerIndex]) {
      this.tweens.add({ targets: texts[playerIndex], alpha: { from: 1, to: 0.3 }, yoyo: true, repeat: 2, duration: 120 });
    }
  }

  public showGameOver(players: YahtzeePlayerState[], winnerIndex: number): void {
    const cw = 900;
    const ch = 600;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, cw, ch);
    this.gameOverElements.push(overlay);

    const pw = 380;
    const ph = 180 + players.length * 30;
    const px = cw / 2 - pw / 2;
    const py = ch / 2 - ph / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(px, py, pw, ph, 12);
    panel.lineStyle(2, 0xe94560);
    panel.strokeRoundedRect(px, py, pw, ph, 12);
    this.gameOverElements.push(panel);

    // Check for tie
    const winnerScore = players[winnerIndex].totalScore;
    const tiedPlayers = players.filter(p => p.totalScore === winnerScore);
    const isTie = tiedPlayers.length > 1;

    const msg = isTie ? 'TIE GAME!' : `${players[winnerIndex].name} WINS!`;
    const color = isTie ? '#ffffff' : PLAYER_COLORS[winnerIndex % PLAYER_COLORS.length];

    const title = this.add.text(cw / 2, py + 36, msg, {
      fontSize: '26px', color, fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.gameOverElements.push(title);

    // Show all player scores
    let scoreY = py + 80;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const pColor = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const scoreText = this.add.text(cw / 2, scoreY, `${p.name}: ${p.totalScore}`, {
        fontSize: '18px', color: pColor, fontFamily: 'Arial',
        fontStyle: i === winnerIndex ? 'bold' : 'normal'
      }).setOrigin(0.5);
      this.gameOverElements.push(scoreText);
      scoreY += 30;
    }

    this.rollZone.disableInteractive();
  }

  public resetGame(): void {
    for (const el of this.gameOverElements) el.destroy();
    this.gameOverElements = [];
    this.isRolling = false;
    this.prevHeld = [false, false, false, false, false];

    this.generateScatterPositions([0, 1, 2, 3, 4]);
    for (let i = 0; i < 5; i++) this.diceSprites[i].setVisible(false);

    this.redrawRollBtn(0xe94560);
    this.rollText.setText('Roll Dice');
    this.rollZone.setInteractive({ useHandCursor: true });

    this.turnText.setText('Round 1 of 13');
    this.instructionText.setText("Click 'Roll Dice' to begin your turn.");

    const allCats = [...TOP_CATEGORIES, ...BOTTOM_CATEGORIES];
    for (const cat of allCats) {
      const texts = this.scoreTexts[cat];
      if (texts) {
        for (const txt of texts) {
          txt.setText('--');
          txt.setColor('#666666');
        }
      }
      this.scoreZones[cat]?.disableInteractive();
    }

    for (const txt of this.topTexts) txt.setText('0/63');
    for (const txt of this.bonusTexts) { txt.setText('--'); txt.setColor('#888888'); }
    for (let p = 0; p < this.totalTexts.length; p++) {
      this.totalTexts[p].setText('0');
    }
  }
}
