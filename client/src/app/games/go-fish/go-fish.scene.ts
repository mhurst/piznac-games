import Phaser from 'phaser';
import { GoFishVisualState, GoFishPlayer, GoFishCard, RANKS, GoFishLastAction } from './go-fish-types';

export type { GoFishCard, GoFishVisualState, GoFishPlayer };

export class GoFishScene extends Phaser.Scene {

  // Canvas size
  readonly CANVAS_W = 990;
  readonly CANVAS_H = 748;

  // Colors
  private readonly FELT_GREEN = 0x1a6b37;
  private readonly RIM_BROWN = 0x5c2e0e;
  private readonly GOLD = 0xd4a847;
  private readonly DARK_BG = 0x0b0b15;

  // Card sizes
  private readonly CARD_W = 70;
  private readonly CARD_H = 98;
  private readonly CARD_SPACING = 32;

  // Dynamic elements (cleared each updateState)
  private dynamicElements: Phaser.GameObjects.GameObject[] = [];

  // Persistent UI elements
  private messageText!: Phaser.GameObjects.Text;
  private messageBg!: Phaser.GameObjects.Graphics;

  // ASK button
  private askBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };

  // Glow for active player
  private glowGraphics!: Phaser.GameObjects.Graphics;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private glowAlpha = 0.2;

  // Game over overlay
  private gameOverElements: Phaser.GameObjects.GameObject[] = [];

  // Callbacks set by component
  public onPlayerClick?: (index: number) => void;
  public onRankClick?: (rank: string) => void;
  public onAskClick?: () => void;
  public onReady?: () => void;

  // Current state for interaction
  private currentState: GoFishVisualState | null = null;

  constructor() {
    super({ key: 'GoFishScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/cards/';
    // Card sprites
    const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    for (const suit of suits) {
      for (const value of values) {
        const key = `card${suit}${value}`;
        this.load.image(key, basePath + `${key}.png`);
      }
    }
    this.load.image('cardBack_blue', basePath + 'cardBack_blue1.png');

    // Avatars
    const aiNames = ['JohnnyBoy', 'JayJay', 'JimBob', 'Sal', 'SallyJoe', 'June'];
    for (const name of aiNames) {
      this.load.image(`avatar_${name}`, `assets/sprites/board-game/avatars/images/${name}.png`);
    }
  }

  create(): void {
    this.drawTable();
    this.createMessage();
    this.createAskButton();
    this.glowGraphics = this.add.graphics().setDepth(4);

    if (this.onReady) this.onReady();
  }

  // --- Casino Table ---

  private drawTable(): void {
    const gfx = this.add.graphics().setDepth(0);
    const cx = this.CANVAS_W / 2;

    // Table rim (brown wood border)
    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillEllipse(cx, 360, 920, 600);
    // Flat bottom
    gfx.fillStyle(this.DARK_BG);
    gfx.fillRect(0, 570, this.CANVAS_W, 180);

    // Felt interior
    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillEllipse(cx, 360, 890, 570);
    gfx.fillStyle(this.DARK_BG);
    gfx.fillRect(0, 560, this.CANVAS_W, 190);

    // Felt bottom edge
    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillRect(50, 520, 890, 40);

    // Rim bottom edge
    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillRect(40, 555, 910, 10);

    // Title on felt
    this.add.text(cx, 45, 'GO FISH', {
      fontSize: '14px', color: '#2a8f4f', fontFamily: 'Georgia', fontStyle: 'italic', letterSpacing: 8
    }).setOrigin(0.5).setDepth(1).setAlpha(0.6);
  }

  // --- Message Banner ---

  private createMessage(): void {
    const cx = this.CANVAS_W / 2;
    this.messageBg = this.add.graphics().setDepth(19);
    this.messageText = this.add.text(cx, 365, '', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
  }

  private drawMessageBg(text: string, color: number = 0x16213e): void {
    this.messageBg.clear();
    if (!text) return;
    const cx = this.CANVAS_W / 2;
    const w = Math.max(text.length * 9 + 40, 200);
    this.messageBg.fillStyle(0x000000, 0.5);
    this.messageBg.fillRoundedRect(cx - w / 2, 349, w, 32, 8);
    this.messageBg.fillStyle(color, 0.85);
    this.messageBg.fillRoundedRect(cx - w / 2, 349, w, 32, 8);
    this.messageBg.lineStyle(1, this.GOLD, 0.5);
    this.messageBg.strokeRoundedRect(cx - w / 2, 349, w, 32, 8);
  }

  // --- ASK Button ---

  private createAskButton(): void {
    const cx = this.CANVAS_W / 2;
    const y = 640;
    const w = 160;
    const h = 44;

    const bg = this.add.graphics().setDepth(25);
    this.drawBtnBg(bg, cx, y, w, h, 0x8b1a1a);

    const text = this.add.text(cx, y, 'ASK!', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26);

    const zone = this.add.zone(cx, y, w, h).setInteractive({ useHandCursor: true }).setDepth(27);
    zone.on('pointerdown', () => {
      if (this.onAskClick) this.onAskClick();
    });
    zone.on('pointerover', () => this.drawBtnBg(bg, cx, y, w, h, 0xb02828));
    zone.on('pointerout', () => this.drawBtnBg(bg, cx, y, w, h, 0x8b1a1a));

    this.askBtn = { bg, text, zone };
    this.setButtonVisible(this.askBtn, false);
  }

  // --- Button Helpers ---

  private drawBtnBg(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    gfx.lineStyle(1, 0xffffff, 0.15);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }

  private setButtonVisible(
    btn: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone },
    visible: boolean
  ): void {
    btn.bg.setVisible(visible);
    btn.text.setVisible(visible);
    if (visible) btn.zone.setInteractive({ useHandCursor: true });
    else btn.zone.disableInteractive();
  }

  private setButtonEnabled(
    btn: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone },
    enabled: boolean
  ): void {
    if (enabled) {
      btn.zone.setInteractive({ useHandCursor: true });
    } else {
      btn.zone.disableInteractive();
    }
    btn.bg.setAlpha(enabled ? 1 : 0.4);
    btn.text.setAlpha(enabled ? 1 : 0.4);
  }

  // --- Dynamic Element Management ---

  private clearDynamic(): void {
    this.dynamicElements.forEach(el => el.destroy());
    this.dynamicElements = [];
  }

  private trackDynamic<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamicElements.push(obj);
    return obj;
  }

  // --- Card Helpers ---

  private getCardKey(card: GoFishCard): string {
    if (card.faceDown) return 'cardBack_blue';
    const suitMap: Record<string, string> = {
      hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades'
    };
    return `card${suitMap[card.suit]}${card.value}`;
  }

  // --- Player Positions ---

  private getPlayerPositions(count: number): { x: number; y: number; labelY: number; bookY: number; side: string }[] {
    // Bottom = human, then clockwise: Left, Top, Right
    if (count === 2) {
      return [
        { x: 495, y: 490, labelY: 420, bookY: 435, side: 'bottom' },
        { x: 495, y: 150, labelY: 80, bookY: 215, side: 'top' }
      ];
    }
    if (count === 3) {
      return [
        { x: 495, y: 490, labelY: 420, bookY: 435, side: 'bottom' },
        { x: 140, y: 290, labelY: 200, bookY: 365, side: 'left' },
        { x: 850, y: 290, labelY: 200, bookY: 365, side: 'right' }
      ];
    }
    // 4 players
    return [
      { x: 495, y: 490, labelY: 420, bookY: 435, side: 'bottom' },
      { x: 140, y: 300, labelY: 210, bookY: 375, side: 'left' },
      { x: 495, y: 120, labelY: 55, bookY: 185, side: 'top' },
      { x: 850, y: 300, labelY: 210, bookY: 375, side: 'right' }
    ];
  }

  // --- Active Player Glow ---

  private drawActiveGlow(x: number, y: number): void {
    this.glowGraphics.clear();

    if (!this.glowTween || !this.glowTween.isPlaying()) {
      this.glowAlpha = 0.2;
      this.glowTween = this.tweens.add({
        targets: this,
        glowAlpha: { from: 0.15, to: 0.45 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (this.glowGraphics && this.glowGraphics.active) {
            this.glowGraphics.clear();
            this.glowGraphics.fillStyle(this.GOLD, this.glowAlpha);
            this.glowGraphics.fillEllipse(x, y - 10, 200, 140);
          }
        }
      });
    }
  }

  private clearActiveGlow(): void {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = null;
    }
    if (this.glowGraphics) {
      this.glowGraphics.clear();
    }
  }

  // --- State Update ---

  public updateState(state: GoFishVisualState): void {
    this.currentState = state;
    this.clearDynamic();
    this.clearActiveGlow();

    const positions = this.getPlayerPositions(state.players.length);

    // Re-order: put myIndex at position 0 (bottom) and arrange others clockwise
    const reordered: { player: GoFishPlayer; origIndex: number }[] = [];
    for (let i = 0; i < state.players.length; i++) {
      const idx = (state.myIndex + i) % state.players.length;
      reordered.push({ player: state.players[idx], origIndex: idx });
    }

    for (let posIdx = 0; posIdx < reordered.length; posIdx++) {
      const { player, origIndex } = reordered[posIdx];
      const pos = positions[posIdx];
      const isMe = posIdx === 0;
      const isActive = origIndex === state.currentPlayerIndex;
      const isSelectedTarget = state.selectedTargetIndex === origIndex;

      if (isMe) {
        this.drawMyHand(player, pos, state, isActive);
      } else {
        this.drawOpponent(player, pos, origIndex, state, isActive, isSelectedTarget);
      }

      // Draw books for this player
      this.drawBooks(player, pos);
    }

    // Draw deck pile
    this.drawDeckPile(state.deckCount);

    // Update message
    this.messageText.setText(state.message);
    if (state.message) {
      let msgColor = 0x16213e;
      if (state.message.includes('Go Fish')) msgColor = 0x1a4a8b;
      else if (state.message.includes('book') || state.message.includes('Book')) msgColor = 0x2e7d32;
      else if (state.message.includes('Your turn')) msgColor = 0x8b6914;
      this.drawMessageBg(state.message, msgColor);
    } else {
      this.messageBg.clear();
    }

    // ASK button
    const canAsk = state.canAsk && state.selectedTargetIndex !== null && state.selectedRank !== null;
    this.setButtonVisible(this.askBtn, state.isMyTurn && state.phase === 'playing');
    if (state.isMyTurn && state.phase === 'playing') {
      this.setButtonEnabled(this.askBtn, canAsk);
      const btnY = 640;
      if (state.selectedRank && state.selectedTargetIndex !== null) {
        const targetName = state.players[state.selectedTargetIndex]?.name || '?';
        this.askBtn.text.setText(`ASK ${targetName} for ${state.selectedRank}s`);
        const w = Math.max(160, this.askBtn.text.width + 40);
        this.drawBtnBg(this.askBtn.bg, this.CANVAS_W / 2, btnY, w, 44, canAsk ? 0x8b1a1a : 0x444444);
        this.askBtn.zone.setSize(w, 44);
      } else {
        this.askBtn.text.setText('Select a player and card rank');
        this.drawBtnBg(this.askBtn.bg, this.CANVAS_W / 2, btnY, 280, 44, 0x444444);
        this.askBtn.zone.setSize(280, 44);
      }
    }
  }

  // --- Draw My Hand (bottom) ---

  private drawMyHand(player: GoFishPlayer, pos: { x: number; y: number; side: string }, state: GoFishVisualState, isActive: boolean): void {
    if (isActive && state.phase === 'playing') {
      this.drawActiveGlow(pos.x, pos.y);
    }

    // Player label
    const nameColor = isActive ? '#ffd700' : '#d4a847';
    this.trackDynamic(
      this.add.text(pos.x, pos.y - 68, 'YOU', {
        fontSize: '14px', color: nameColor, fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );

    // Draw cards face-up, clickable for rank selection
    if (player.hand.length > 0) {
      const maxSpacing = this.CARD_SPACING;
      const spacing = Math.min(maxSpacing, (this.CANVAS_W - 160) / Math.max(player.hand.length, 1));
      const totalW = this.CARD_W + (player.hand.length - 1) * spacing;
      const startX = pos.x - totalW / 2 + this.CARD_W / 2;

      for (let i = 0; i < player.hand.length; i++) {
        const card = player.hand[i];
        const key = this.getCardKey(card);
        const x = startX + i * spacing;
        const isSelected = state.selectedRank === card.value;

        const sprite = this.trackDynamic(
          this.add.sprite(x, pos.y, key)
            .setDisplaySize(this.CARD_W, this.CARD_H)
            .setDepth(5 + i)
        );

        // Make clickable for rank selection
        if (state.isMyTurn && state.phase === 'playing') {
          sprite.setInteractive({ useHandCursor: true });
          sprite.on('pointerdown', () => {
            if (this.onRankClick) this.onRankClick(card.value);
          });
        }

        // Highlight selected rank cards
        if (isSelected) {
          // Lift card up slightly
          sprite.setY(pos.y - 12);
          const highlight = this.trackDynamic(this.add.graphics().setDepth(15));
          highlight.lineStyle(3, 0xffd700, 1);
          highlight.strokeRoundedRect(
            x - this.CARD_W / 2 - 2, pos.y - 12 - this.CARD_H / 2 - 2,
            this.CARD_W + 4, this.CARD_H + 4, 4
          );
        }
      }
    }

    // Card count below
    this.trackDynamic(
      this.add.text(pos.x, pos.y + this.CARD_H / 2 + 10, `${player.hand.length} cards`, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  // --- Draw Opponent ---

  private drawOpponent(
    player: GoFishPlayer,
    pos: { x: number; y: number; labelY: number; side: string },
    origIndex: number,
    state: GoFishVisualState,
    isActive: boolean,
    isSelectedTarget: boolean
  ): void {
    if (isActive && state.phase === 'playing') {
      this.drawActiveGlow(pos.x, pos.y);
    }

    // Clickable area for target selection
    const areaW = 170;
    const areaH = 150;

    // Highlight if selected as target
    if (isSelectedTarget) {
      const highlight = this.trackDynamic(this.add.graphics().setDepth(3));
      highlight.lineStyle(3, 0xffd700, 0.9);
      highlight.strokeRoundedRect(pos.x - areaW / 2, pos.y - areaH / 2, areaW, areaH, 12);
      highlight.fillStyle(0xffd700, 0.1);
      highlight.fillRoundedRect(pos.x - areaW / 2, pos.y - areaH / 2, areaW, areaH, 12);
    } else if (state.isMyTurn && state.phase === 'playing' && player.cardCount > 0) {
      // Dashed gold outline — clickable target
      const outline = this.trackDynamic(this.add.graphics().setDepth(3));
      outline.lineStyle(2, this.GOLD, 0.4);
      outline.strokeRoundedRect(pos.x - areaW / 2, pos.y - areaH / 2, areaW, areaH, 12);
    }

    // Interactive zone for clicking opponent
    if (state.isMyTurn && state.phase === 'playing' && player.cardCount > 0) {
      const zone = this.trackDynamic(
        this.add.zone(pos.x, pos.y, areaW, areaH)
          .setInteractive({ useHandCursor: true })
          .setDepth(15)
      );
      zone.on('pointerdown', () => {
        if (this.onPlayerClick) this.onPlayerClick(origIndex);
      });
    }

    // Avatar
    const avatarY = pos.y - 28;
    const imageKey = `avatar_${player.name}`;
    const hasSprite = this.textures.exists(imageKey);

    if (hasSprite) {
      this.trackDynamic(
        this.add.image(pos.x, avatarY, imageKey)
          .setDisplaySize(52, 52)
          .setDepth(10)
      );
    } else {
      // Fallback circle
      const gfx = this.trackDynamic(this.add.graphics().setDepth(10));
      const borderColor = isActive ? 0xffd700 : this.GOLD;
      gfx.lineStyle(2, borderColor, 1);
      gfx.strokeCircle(pos.x, avatarY, 26);
      gfx.fillStyle(0x2980b9, 1);
      gfx.fillCircle(pos.x, avatarY, 25);
      this.trackDynamic(
        this.add.text(pos.x, avatarY, player.name.charAt(0).toUpperCase(), {
          fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11)
      );
    }

    // Player name
    const nameColor = isActive ? '#ffd700' : '#d4a847';
    this.trackDynamic(
      this.add.text(pos.x, pos.labelY, player.name, {
        fontSize: '13px', color: nameColor, fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );

    // Face-down card stack + count
    if (player.cardCount > 0) {
      const stackCount = Math.min(player.cardCount, 3);
      for (let i = 0; i < stackCount; i++) {
        this.trackDynamic(
          this.add.sprite(pos.x + i * 3, pos.y + 20 + i * 2, 'cardBack_blue')
            .setDisplaySize(this.CARD_W * 0.65, this.CARD_H * 0.65)
            .setDepth(5 + i)
        );
      }

      this.trackDynamic(
        this.add.text(pos.x, pos.y + 20 + this.CARD_H * 0.33 + 14, `${player.cardCount} cards`, {
          fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial'
        }).setOrigin(0.5).setDepth(10)
      );
    } else {
      this.trackDynamic(
        this.add.text(pos.x, pos.y + 20, 'No cards', {
          fontSize: '12px', color: '#666666', fontFamily: 'Arial', fontStyle: 'italic'
        }).setOrigin(0.5).setDepth(10)
      );
    }
  }

  // --- Draw Books ---

  private drawBooks(player: GoFishPlayer, pos: { x: number; bookY: number; side: string }): void {
    if (player.books.length === 0) return;

    const bookSize = 22;
    const gap = 4;
    const totalW = player.books.length * (bookSize + gap) - gap;
    const startX = pos.x - totalW / 2 + bookSize / 2;

    for (let i = 0; i < player.books.length; i++) {
      const bx = startX + i * (bookSize + gap);
      const by = pos.bookY;

      // Book circle
      const gfx = this.trackDynamic(this.add.graphics().setDepth(12));
      gfx.fillStyle(0x2e7d32, 0.9);
      gfx.fillCircle(bx, by, bookSize / 2);
      gfx.lineStyle(1, this.GOLD, 0.6);
      gfx.strokeCircle(bx, by, bookSize / 2);

      // Rank letter
      this.trackDynamic(
        this.add.text(bx, by, player.books[i], {
          fontSize: '12px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(13)
      );
    }

    // Books count
    this.trackDynamic(
      this.add.text(pos.x, pos.bookY + bookSize / 2 + 10, `${player.books.length} books`, {
        fontSize: '11px', color: '#888888', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  // --- Draw Deck Pile ---

  private drawDeckPile(count: number): void {
    const cx = this.CANVAS_W / 2;
    const cy = 310;

    if (count > 0) {
      const stackCount = Math.min(count, 4);
      for (let i = 0; i < stackCount; i++) {
        this.trackDynamic(
          this.add.sprite(cx + i * 2, cy - 20 + i * 2, 'cardBack_blue')
            .setDisplaySize(this.CARD_W * 0.75, this.CARD_H * 0.75)
            .setDepth(2 + i)
        );
      }
    }

    this.trackDynamic(
      this.add.text(cx, cy + 40, count > 0 ? `Deck: ${count}` : 'Deck empty', {
        fontSize: '13px', color: count > 0 ? '#d4a847' : '#666666', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  // --- Game Over ---

  public showGameOver(message: string, subMessage?: string): void {
    const cx = this.CANVAS_W / 2;
    const cy = this.CANVAS_H / 2;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, this.CANVAS_W, this.CANVAS_H);
    overlay.setDepth(90);
    this.gameOverElements.push(overlay);

    const panelH = subMessage ? 140 : 120;
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(cx - 200, cy - panelH / 2, 400, panelH, 12);
    panel.lineStyle(2, this.GOLD);
    panel.strokeRoundedRect(cx - 200, cy - panelH / 2, 400, panelH, 12);
    panel.setDepth(91);
    this.gameOverElements.push(panel);

    const text = this.add.text(cx, cy - (subMessage ? 20 : 0), message, {
      fontSize: '24px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(92);
    this.gameOverElements.push(text);

    if (subMessage) {
      const sub = this.add.text(cx, cy + 18, subMessage, {
        fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(92);
      this.gameOverElements.push(sub);
    }
  }

  // --- Reset ---

  public resetGame(): void {
    this.clearDynamic();
    this.clearActiveGlow();
    this.gameOverElements.forEach(el => el.destroy());
    this.gameOverElements = [];
    this.messageText.setText('');
    this.messageBg.clear();
    this.setButtonVisible(this.askBtn, false);
    this.currentState = null;
  }
}
