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
  bestMeldsText: string;    // e.g. "1; 1; 5; 5" or "" when not applicable
  localPlayerIndex: number; // index of the local player (always shown at bottom)
}

export class FarkleScene extends Phaser.Scene {
  private readonly DICE_SIZE = 60;
  private readonly CANVAS_W = 1100;
  private readonly CANVAS_H = 748;
  private readonly PLAY_AREA_W = 680;
  private readonly SCATTER_LEFT = 80;
  private readonly SCATTER_RIGHT = 580;
  private readonly SCATTER_TOP = 172;
  private readonly SCATTER_BOTTOM = 392;
  private readonly KEPT_ROW_Y = 438;
  private readonly ROLL_BTN_Y = 525;
  private readonly BANK_BTN_Y = 525;
  private readonly MELD_TABLE_X = 700;
  private readonly MELD_TABLE_Y = 130;
  private readonly RIGHT_PANEL_W = 380;

  // Dice sprites
  private diceSprites: Phaser.GameObjects.Sprite[] = [];
  private scatterPositions: { x: number; y: number; angle: number }[] = [];
  private diceHighlights: Phaser.GameObjects.Graphics[] = [];

  // Instruction/message text
  private messageText!: Phaser.GameObjects.Text;

  // Best melds banner
  private meldsBannerBg!: Phaser.GameObjects.Graphics;
  private meldsBannerText!: Phaser.GameObjects.Text;

  // Buttons
  private rollBg!: Phaser.GameObjects.Graphics;
  private rollText!: Phaser.GameObjects.Text;
  private rollZone!: Phaser.GameObjects.Zone;
  private bankBg!: Phaser.GameObjects.Graphics;
  private bankText!: Phaser.GameObjects.Text;
  private bankZone!: Phaser.GameObjects.Zone;

  // Turn score display
  private turnScoreText!: Phaser.GameObjects.Text;

  // Scoreboard elements (top-right, redrawn each update)
  private scoreboardElements: Phaser.GameObjects.GameObject[] = [];

  // Player avatar+nameplate elements (redrawn each update)
  private playerAvatarElements: Phaser.GameObjects.GameObject[] = [];

  // Game over
  private gameOverElements: Phaser.GameObjects.GameObject[] = [];

  // State
  private isRolling = false;
  private animationGen = 0;
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
    this.createMeldValuesTable();
    this.createMeldsBanner();
    this.createMessage();
    this.createDice();
    this.createButtons();
    this.createTurnScoreDisplay();
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

  // --- Meld Values Table (static, drawn once) ---

  private createMeldValuesTable(): void {
    const x = this.MELD_TABLE_X;
    const y = this.MELD_TABLE_Y;
    const w = this.RIGHT_PANEL_W;
    const rowH = 28;

    const melds = [
      ['Ones', '100'],
      ['Fives', '50'],
      ['Triple ones', '1,000'],
      ['Triple twos', '200'],
      ['Triple threes', '300'],
      ['Triple fours', '400'],
      ['Triple fives', '500'],
      ['Triple sixes', '600'],
      ['Four of a kind', '2\u00D7 triple'],
      ['Five of a kind', '4\u00D7 triple'],
      ['Six of a kind', '8\u00D7 triple'],
      ['Three pairs', '1,500'],
      ['Straight', '1,500'],
    ];

    const totalH = 46 + melds.length * rowH + 14;

    // Background panel
    const bg = this.add.graphics();
    bg.fillStyle(0x16213e, 0.95);
    bg.fillRoundedRect(x, y, w, totalH, 8);
    bg.lineStyle(1, 0x0f3460);
    bg.strokeRoundedRect(x, y, w, totalH, 8);

    // Title
    this.add.text(x + w / 2, y + 18, 'Meld Values', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Header row
    const headerY = y + 40;
    this.add.text(x + 18, headerY, 'Meld', {
      fontSize: '14px', color: '#888888', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    this.add.text(x + w - 18, headerY, 'Value', {
      fontSize: '14px', color: '#888888', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(1, 0.5);

    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x0f3460);
    divider.lineBetween(x + 12, headerY + 12, x + w - 12, headerY + 12);

    // Meld rows
    for (let i = 0; i < melds.length; i++) {
      const rowY = headerY + 24 + i * rowH;
      const color = i % 2 === 0 ? '#cccccc' : '#aaaaaa';
      this.add.text(x + 18, rowY, melds[i][0], {
        fontSize: '15px', color, fontFamily: 'Arial'
      }).setOrigin(0, 0.5);
      this.add.text(x + w - 18, rowY, melds[i][1], {
        fontSize: '15px', color, fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(1, 0.5);
    }
  }

  // --- Best Melds Banner ---

  private createMeldsBanner(): void {
    const cx = this.PLAY_AREA_W / 2;
    this.meldsBannerBg = this.add.graphics();
    this.meldsBannerText = this.add.text(cx, 120, '', {
      fontSize: '13px', color: '#333333', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.meldsBannerBg.setVisible(false);
    this.meldsBannerText.setVisible(false);
  }

  private drawMeldsBanner(text: string): void {
    const cx = this.PLAY_AREA_W / 2;
    const bannerW = 520;
    this.meldsBannerBg.clear();
    if (!text) {
      this.meldsBannerBg.setVisible(false);
      this.meldsBannerText.setVisible(false);
      return;
    }
    this.meldsBannerBg.setVisible(true);
    this.meldsBannerText.setVisible(true);
    this.meldsBannerBg.fillStyle(0xffff88, 0.92);
    this.meldsBannerBg.fillRoundedRect(cx - bannerW / 2, 104, bannerW, 32, 8);
    this.meldsBannerBg.lineStyle(1, 0xcccc00);
    this.meldsBannerBg.strokeRoundedRect(cx - bannerW / 2, 104, bannerW, 32, 8);
    this.meldsBannerText.setText(`Your highest possible melds are ${text}`);
    this.meldsBannerText.setPosition(cx, 120);
  }

  // --- Message Text ---

  private createMessage(): void {
    const cx = this.PLAY_AREA_W / 2;
    this.messageText = this.add.text(cx, 482, 'Roll the dice to begin!', {
      fontSize: '14px', color: '#ffff88', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  // --- Dice ---

  private createDice(): void {
    for (let i = 0; i < 6; i++) {
      this.scatterPositions.push({ x: 0, y: 0, angle: 0 });

      const highlight = this.add.graphics();
      highlight.setVisible(false);
      this.diceHighlights.push(highlight);

      const sprite = this.add.sprite(this.PLAY_AREA_W / 2, 280, 'fdie1');
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
    const minDist = this.DICE_SIZE + 20;
    let attempts = 0;
    while (attempts < 150) {
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
    // Grid fallback
    const cols = Math.floor((this.SCATTER_RIGHT - this.SCATTER_LEFT) / minDist);
    const rows = Math.floor((this.SCATTER_BOTTOM - this.SCATTER_TOP) / minDist);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = this.SCATTER_LEFT + c * minDist + minDist / 2;
        const y = this.SCATTER_TOP + r * minDist + minDist / 2;
        const tooClose = existing.some(p => {
          const dx = p.x - x;
          const dy = p.y - y;
          return Math.sqrt(dx * dx + dy * dy) < minDist;
        });
        if (!tooClose) return { x, y, angle: Phaser.Math.Between(-20, 20) };
      }
    }
    return { x: this.SCATTER_LEFT + 40, y: this.SCATTER_TOP + 40, angle: 0 };
  }

  private generateScatterPositions(indices: number[]): void {
    const placed: { x: number; y: number }[] = [];
    for (const i of indices) {
      this.scatterPositions[i] = this.randomScatterPos(placed);
      placed.push(this.scatterPositions[i]);
    }
  }

  private getKeptSlotX(slotIndex: number, totalKept: number): number {
    const cx = this.PLAY_AREA_W / 2;
    const gap = this.DICE_SIZE + 14;
    const totalWidth = totalKept * gap - 14;
    const startX = cx - totalWidth / 2 + this.DICE_SIZE / 2;
    return startX + slotIndex * gap;
  }

  // --- Buttons (side by side) ---

  private createButtons(): void {
    const cx = this.PLAY_AREA_W / 2;
    const rollX = cx - 110;
    const bankX = cx + 110;
    const btnW = 200;
    const btnH = 44;

    // Roll button
    this.rollBg = this.add.graphics();
    this.drawButtonAt(this.rollBg, rollX, this.ROLL_BTN_Y, btnW, btnH, 0x4caf50);
    this.rollText = this.add.text(rollX, this.ROLL_BTN_Y, 'Roll Dice', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.rollZone = this.add.zone(rollX, this.ROLL_BTN_Y, btnW, btnH);
    this.rollZone.setInteractive({ useHandCursor: true });
    this.rollZone.on('pointerdown', () => {
      if (!this.isRolling && this.onRollClick) this.onRollClick();
    });
    this.rollZone.on('pointerover', () => this.drawButtonAt(this.rollBg, rollX, this.ROLL_BTN_Y, btnW, btnH, 0x66bb6a));
    this.rollZone.on('pointerout', () => this.drawButtonAt(this.rollBg, rollX, this.ROLL_BTN_Y, btnW, btnH, 0x4caf50));

    // Bank button
    this.bankBg = this.add.graphics();
    this.drawButtonAt(this.bankBg, bankX, this.BANK_BTN_Y, btnW, btnH, 0x4a90d9);
    this.bankText = this.add.text(bankX, this.BANK_BTN_Y, 'Bank Points', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.bankZone = this.add.zone(bankX, this.BANK_BTN_Y, btnW, btnH);
    this.bankZone.setInteractive({ useHandCursor: true });
    this.bankZone.on('pointerdown', () => {
      if (!this.isRolling && this.onBankClick) this.onBankClick();
    });
    this.bankZone.on('pointerover', () => this.drawButtonAt(this.bankBg, bankX, this.BANK_BTN_Y, btnW, btnH, 0x6aace6));
    this.bankZone.on('pointerout', () => this.drawButtonAt(this.bankBg, bankX, this.BANK_BTN_Y, btnW, btnH, 0x4a90d9));
  }

  private drawButtonAt(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color);
    gfx.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
  }

  // --- Turn Score Display ---

  private createTurnScoreDisplay(): void {
    const cx = this.PLAY_AREA_W / 2;
    this.turnScoreText = this.add.text(cx, 562, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial'
    }).setOrigin(0.5);
  }

  // --- Scoreboard (small table at top-right) ---

  private drawScoreboard(players: FarklePlayer[], currentPlayerIndex: number): void {
    // Clear previous
    this.scoreboardElements.forEach(el => el.destroy());
    this.scoreboardElements = [];

    const x = this.MELD_TABLE_X;
    const y = 16;
    const w = this.RIGHT_PANEL_W;
    const colW = Math.min(85, (w - 20) / Math.max(players.length, 1));
    const totalW = colW * players.length;
    const startX = x + (w - totalW) / 2 + colW / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x16213e, 0.95);
    bg.fillRoundedRect(x, y, w, 90, 8);
    bg.lineStyle(1, 0x0f3460);
    bg.strokeRoundedRect(x, y, w, 90, 8);
    this.scoreboardElements.push(bg);

    // Title
    const title = this.add.text(x + w / 2, y + 16, 'SCORES', {
      fontSize: '14px', color: '#888888', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.scoreboardElements.push(title);

    const colors = ['#4a90d9', '#e94560', '#4caf50', '#ff9800'];

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const cx = startX + i * colW;
      const isCurrent = i === currentPlayerIndex;

      // Highlight current player
      if (isCurrent) {
        const hlGfx = this.add.graphics();
        hlGfx.fillStyle(0xffd700, 0.15);
        hlGfx.fillRoundedRect(cx - colW / 2 + 2, y + 30, colW - 4, 56, 4);
        this.scoreboardElements.push(hlGfx);
      }

      // Name (truncate to fit)
      const displayName = p.name.length > 9 ? p.name.substring(0, 8) + '.' : p.name;
      const nameColor = colors[i % colors.length];
      const nameText = this.add.text(cx, y + 46, displayName, {
        fontSize: '14px', color: nameColor, fontFamily: 'Arial', fontStyle: isCurrent ? 'bold' : 'normal'
      }).setOrigin(0.5);
      this.scoreboardElements.push(nameText);

      // Score
      const scoreText = this.add.text(cx, y + 68, p.totalScore.toLocaleString(), {
        fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.scoreboardElements.push(scoreText);
    }
  }

  // --- Player Avatar + Nameplate ---

  private drawPlayerAvatars(players: FarklePlayer[], currentPlayerIndex: number, localPlayerIndex: number): void {
    this.playerAvatarElements.forEach(el => el.destroy());
    this.playerAvatarElements = [];

    if (players.length === 0) return;

    const meIndex = localPlayerIndex;

    // Opponents are all players except "me"
    const opponents: { player: FarklePlayer; originalIndex: number }[] = [];
    for (let i = 0; i < players.length; i++) {
      if (i !== meIndex) opponents.push({ player: players[i], originalIndex: i });
    }

    const cx = this.PLAY_AREA_W / 2;

    // Draw "me" at bottom center
    this.drawNameplate(
      players[meIndex], meIndex, currentPlayerIndex,
      cx, 625, true
    );

    // Draw opponents across the top
    if (opponents.length === 1) {
      this.drawNameplate(opponents[0].player, opponents[0].originalIndex, currentPlayerIndex, cx, 40, false);
    } else if (opponents.length === 2) {
      this.drawNameplate(opponents[0].player, opponents[0].originalIndex, currentPlayerIndex, cx - 120, 40, false);
      this.drawNameplate(opponents[1].player, opponents[1].originalIndex, currentPlayerIndex, cx + 120, 40, false);
    } else if (opponents.length >= 3) {
      const spacing = (this.PLAY_AREA_W - 160) / (opponents.length + 1);
      for (let i = 0; i < opponents.length; i++) {
        const ox = 80 + spacing * (i + 1);
        this.drawNameplate(opponents[i].player, opponents[i].originalIndex, currentPlayerIndex, ox, 40, false);
      }
    }
  }

  private drawNameplate(
    player: FarklePlayer, playerIndex: number, currentPlayerIndex: number,
    cx: number, cy: number, isMe: boolean
  ): void {
    const isActive = playerIndex === currentPlayerIndex;
    const borderColor = isActive ? 0xffd700 : 0xd4a847;

    // Nameplate background
    const npW = 100;
    const npH = 32;
    const npY = cy + 8;
    const npGfx = this.add.graphics();
    npGfx.fillStyle(0x0c0f1c, 0.88);
    npGfx.fillRoundedRect(cx - npW / 2, npY, npW, npH, 8);
    npGfx.lineStyle(isActive ? 2 : 1, borderColor);
    npGfx.strokeRoundedRect(cx - npW / 2, npY, npW, npH, 8);
    this.playerAvatarElements.push(npGfx);

    // Name text
    const displayName = player.name.length > 10 ? player.name.substring(0, 9) + '.' : player.name;
    const nameText = this.add.text(cx, npY + 10, displayName, {
      fontSize: '12px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(3);
    this.playerAvatarElements.push(nameText);

    // Score text
    const scoreText = this.add.text(cx, npY + 24, player.totalScore.toLocaleString(), {
      fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(3);
    this.playerAvatarElements.push(scoreText);

    // Avatar circle — sit above nameplate with slight overlap (matches poker layout)
    const avatarR = isMe ? 18 : 26;
    const avatarY = npY - avatarR + 2;

    if (isMe) {
      // Green circle with "Y"
      const gfx = this.add.graphics().setDepth(2);
      gfx.fillStyle(0x2e7d32);
      gfx.fillCircle(cx, avatarY, avatarR);
      gfx.lineStyle(3, borderColor);
      gfx.strokeCircle(cx, avatarY, avatarR);
      this.playerAvatarElements.push(gfx);
      const initial = this.add.text(cx, avatarY, 'Y', {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(3);
      this.playerAvatarElements.push(initial);
    } else if (!player.isHuman) {
      // AI avatar image
      const imageKey = `avatar_${player.name}`;
      if (this.textures.exists(imageKey)) {
        const img = this.add.image(cx, avatarY, imageKey)
          .setDisplaySize(avatarR * 2, avatarR * 2).setDepth(2);
        this.playerAvatarElements.push(img);

        // Circular mask
        const maskShape = this.add.graphics().setDepth(0);
        maskShape.fillStyle(0xffffff);
        maskShape.fillCircle(cx, avatarY, avatarR);
        const mask = maskShape.createGeometryMask();
        img.setMask(mask);
        this.playerAvatarElements.push(maskShape);

        // Border circle
        const borderGfx = this.add.graphics().setDepth(2);
        borderGfx.lineStyle(3, borderColor);
        borderGfx.strokeCircle(cx, avatarY, avatarR);
        this.playerAvatarElements.push(borderGfx);
      } else {
        // Fallback colored circle
        const config = getAvatarConfig(player.name);
        const gfx = this.add.graphics().setDepth(2);
        gfx.fillStyle(config.color);
        gfx.fillCircle(cx, avatarY, avatarR);
        gfx.lineStyle(3, borderColor);
        gfx.strokeCircle(cx, avatarY, avatarR);
        this.playerAvatarElements.push(gfx);
        const initial = this.add.text(cx, avatarY, config.initial, {
          fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(3);
        this.playerAvatarElements.push(initial);
      }
    } else {
      // Human (MP) — colored circle + initial
      const config = getAvatarConfig(player.name);
      const gfx = this.add.graphics().setDepth(2);
      gfx.fillStyle(config.color);
      gfx.fillCircle(cx, avatarY, avatarR);
      gfx.lineStyle(3, borderColor);
      gfx.strokeCircle(cx, avatarY, avatarR);
      this.playerAvatarElements.push(gfx);
      const initial = this.add.text(cx, avatarY, player.name.charAt(0).toUpperCase(), {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(3);
      this.playerAvatarElements.push(initial);
    }
  }

  // --- State Update ---

  public updateState(state: FarkleVisualState): void {
    // Clear any stale rolling flag so buttons respond to clicks
    this.isRolling = false;

    // If all dice are zero (fresh turn), clear immediately
    const allZero = state.dice.every(v => v < 1);
    if (allZero) {
      this.animationGen++;
      for (let i = 0; i < 6; i++) {
        this.tweens.killTweensOf(this.diceSprites[i]);
        this.diceSprites[i].setVisible(false);
        this.diceSprites[i].setAlpha(1);
        this.diceSprites[i].disableInteractive();
        this.diceHighlights[i].setVisible(false);
      }
      this.prevInBottomRow = new Set();
    }

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
        sprite.setAlpha(1);
        sprite.disableInteractive();
        highlight.setVisible(false);
        continue;
      }

      sprite.setVisible(true);
      highlight.setVisible(false);

      if (keptSet.has(i)) {
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
        sprite.setTexture(`fdie${val}`);
        sprite.setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const pos = this.scatterPositions[i];

        if (this.prevInBottomRow.has(i)) {
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

    // Update message
    this.messageText.setText(state.message);

    // Update best melds banner
    this.drawMeldsBanner(state.isMyTurn ? state.bestMeldsText : '');

    // Update buttons
    const cx = this.PLAY_AREA_W / 2;
    const rollX = cx - 110;
    const bankX = cx + 110;
    const btnW = 200;
    const btnH = 44;

    if (state.canRoll || state.canKeep) {
      this.rollText.setText('Roll Dice');
      this.drawButtonAt(this.rollBg, rollX, this.ROLL_BTN_Y, btnW, btnH, 0x4caf50);
      this.rollZone.setInteractive({ useHandCursor: true });
    } else {
      this.rollText.setText(state.isMyTurn ? 'Select dice first' : 'Waiting...');
      this.drawButtonAt(this.rollBg, rollX, this.ROLL_BTN_Y, btnW, btnH, 0x555555);
      this.rollZone.disableInteractive();
    }

    if (state.canBank) {
      this.drawButtonAt(this.bankBg, bankX, this.BANK_BTN_Y, btnW, btnH, 0x4a90d9);
      const bankTotal = state.turnScore + state.rollScore;
      this.bankText.setText(`Bank ${bankTotal} pts`);
      this.bankZone.setInteractive({ useHandCursor: true });
    } else {
      this.drawButtonAt(this.bankBg, bankX, this.BANK_BTN_Y, btnW, btnH, 0x555555);
      this.bankText.setText(state.isMyTurn ? 'Bank Points' : 'Waiting...');
      this.bankZone.disableInteractive();
    }

    // Turn score display
    if (state.turnScore > 0 || state.rollScore > 0) {
      let turnStr = `Turn: ${state.turnScore}`;
      if (state.rollScore > 0) turnStr += ` (+${state.rollScore} selected)`;
      this.turnScoreText.setText(turnStr);
    } else {
      this.turnScoreText.setText('');
    }

    // Draw scoreboard
    this.drawScoreboard(state.players, state.currentPlayerIndex);

    // Draw player avatars+nameplates
    this.drawPlayerAvatars(state.players, state.currentPlayerIndex, state.localPlayerIndex);
  }

  // --- Roll Animation ---

  public animateRoll(finalDice: number[], rollingIndices: number[], callback: () => void): void {
    this.isRolling = true;
    const gen = ++this.animationGen;

    // Generate new scatter positions for rolling dice
    const fixedPositions: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      if (!rollingIndices.includes(i) && this.diceSprites[i].visible) {
        fixedPositions.push({ x: this.diceSprites[i].x, y: this.diceSprites[i].y });
      }
    }
    const placed = [...fixedPositions];
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
      if (gen !== this.animationGen) return;
      ticks++;
      const tickPlaced: { x: number; y: number }[] = [...fixedPositions];
      for (const i of rollingIndices) {
        const rv = Phaser.Math.Between(1, 6);
        this.diceSprites[i].setTexture(`fdie${rv}`);
        this.diceSprites[i].setDisplaySize(this.DICE_SIZE, this.DICE_SIZE);
        const tmp = this.randomScatterPos(tickPlaced);
        tickPlaced.push(tmp);
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

  /** Sweep all visible dice off the board (animate down and fade out). */
  public sweepDice(callback?: () => void): void {
    this.animationGen++;
    this.isRolling = false;
    let anyVisible = false;
    for (let i = 0; i < 6; i++) {
      const sprite = this.diceSprites[i];
      if (sprite.visible) {
        anyVisible = true;
        sprite.disableInteractive();
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          y: this.KEPT_ROW_Y + 60,
          alpha: 0,
          duration: 300,
          ease: 'Power2',
          onComplete: () => {
            sprite.setVisible(false);
            sprite.setAlpha(1);
          }
        });
      }
      this.diceHighlights[i].setVisible(false);
    }
    this.prevInBottomRow = new Set();
    const delay = anyVisible ? 350 : 0;
    this.time.delayedCall(delay, () => {
      if (callback) callback();
    });
  }

  // --- Special Animations ---

  public showFarkle(callback: () => void): void {
    const cx = 340;
    const cy = 280;

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
    const cx = 340;
    const cy = 280;
    let called = false;
    const safeCallback = () => {
      if (called) return;
      called = true;
      callback();
    };

    const text = this.add.text(cx, cy, 'HOT DICE!', {
      fontSize: '42px', color: '#ff9800', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0);

    const subText = this.add.text(cx, cy + 45, 'All 6 dice scored — roll them all again!', {
      fontSize: '15px', color: '#ffffff', fontFamily: 'Arial'
    }).setOrigin(0.5).setAlpha(0);

    // Safety timeout
    this.time.delayedCall(4000, () => {
      if (!called) {
        console.warn('[FARKLE SCENE] showHotDice safety timeout — forcing callback');
        text.destroy();
        subText.destroy();
        safeCallback();
      }
    });

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
              safeCallback();
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

    const colorStr = ['#4a90d9', '#e94560', '#4caf50', '#ff9800'];
    for (let i = 0; i < players.length; i++) {
      const rowY = py + 70 + i * 36;
      const p = players[i];
      const medal = i === winnerIndex ? ' \u2B50' : '';
      const scoreStr = this.add.text(cw / 2, rowY,
        `${p.name}: ${p.totalScore.toLocaleString()}${medal}`, {
        fontSize: '18px', color: colorStr[i % colorStr.length], fontFamily: 'Arial',
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
    const rollX = cx - 110;
    const bankX = cx + 110;
    const btnW = 200;
    const btnH = 44;
    this.drawButtonAt(this.rollBg, rollX, this.ROLL_BTN_Y, btnW, btnH, 0x4caf50);
    this.rollText.setText('Roll Dice');
    this.rollZone.setInteractive({ useHandCursor: true });
    this.drawButtonAt(this.bankBg, bankX, this.BANK_BTN_Y, btnW, btnH, 0x555555);
    this.bankText.setText('Bank Points');
    this.bankZone.disableInteractive();

    this.messageText.setText('Roll the dice to begin!');
    this.turnScoreText.setText('');
    this.drawMeldsBanner('');
  }
}
