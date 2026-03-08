import Phaser from 'phaser';
import { GinRummyVisualState, GinRummyCard, GinRummyMeld } from './gin-rummy-types';

export class GinRummyScene extends Phaser.Scene {

  readonly CANVAS_W = 700;
  readonly CANVAS_H = 520;

  private readonly FELT_GREEN = 0x1a6b37;
  private readonly RIM_BROWN = 0x5c2e0e;
  private readonly GOLD = 0xd4a847;
  private readonly DARK_BG = 0x0b0b15;

  private readonly CARD_W = 70;
  private readonly CARD_H = 98;
  private readonly CARD_SPACING = 30;

  private dynamicElements: Phaser.GameObjects.GameObject[] = [];
  private messageText!: Phaser.GameObjects.Text;
  private messageBg!: Phaser.GameObjects.Graphics;

  // Buttons
  private ginBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private discardBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };

  private gameOverElements: Phaser.GameObjects.GameObject[] = [];
  private currentState: GinRummyVisualState | null = null;

  // Drag-and-drop card sorting
  private myCardOrder: number[] = [];
  private myCardSlotXs: number[] = [];
  private isDragging = false;
  private lastHandSize = 0;
  private handSprites: Phaser.GameObjects.Sprite[] = [];
  private dragSourceSlot = -1;
  private dragCurrentTarget = -1;
  private dragMarker!: Phaser.GameObjects.Graphics;
  private readonly HAND_Y = 405;

  // Callbacks
  public onStockClick?: () => void;
  public onDiscardPileClick?: () => void;
  public onHandCardClick?: (index: number) => void;
  public onDiscardClick?: () => void;
  public onGinClick?: () => void;
  public onHandReorder?: (order: number[]) => void;
  public onReady?: () => void;

  constructor() {
    super({ key: 'GinRummyScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/cards/';
    const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    for (const suit of suits) {
      for (const value of values) {
        const key = `card${suit}${value}`;
        this.load.image(key, basePath + `${key}.png`);
      }
    }
    this.load.image('cardBack_blue', basePath + 'cardBack_blue1.png');

    const aiNames = ['JohnnyBoy', 'JayJay', 'JimBob', 'Sal', 'SallyJoe', 'June'];
    for (const name of aiNames) {
      this.load.image(`avatar_${name}`, `assets/sprites/board-game/avatars/images/${name}.png`);
    }
  }

  create(): void {
    this.drawTable();
    this.createMessage();
    this.createButtons();
    this.dragMarker = this.add.graphics().setDepth(60).setVisible(false);
    this.setupCardDrag();
    if (this.onReady) this.onReady();
  }

  private drawTable(): void {
    const gfx = this.add.graphics().setDepth(0);
    const cx = this.CANVAS_W / 2;
    const cy = 240;

    // Rim (brown wood border)
    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillEllipse(cx, cy, 660, 400);

    // Felt interior
    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillEllipse(cx, cy, 630, 370);

    // Gold accent oval
    gfx.lineStyle(2, this.GOLD, 0.35);
    gfx.strokeEllipse(cx, cy, 440, 240);

    // Title on felt
    this.add.text(cx, cy, 'GIN RUMMY', {
      fontSize: '13px', color: '#2a8f4f', fontFamily: 'Georgia', fontStyle: 'italic'
    }).setOrigin(0.5).setDepth(1).setAlpha(0.5);
  }

  private createMessage(): void {
    const cx = this.CANVAS_W / 2;
    this.messageBg = this.add.graphics().setDepth(19);
    this.messageText = this.add.text(cx, 310, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
  }

  private drawMessageBg(text: string, color: number = 0x16213e): void {
    this.messageBg.clear();
    if (!text) return;
    const cx = this.CANVAS_W / 2;
    const w = Math.max(text.length * 8 + 36, 180);
    const msgY = 296;
    this.messageBg.fillStyle(0x000000, 0.5);
    this.messageBg.fillRoundedRect(cx - w / 2, msgY, w, 28, 8);
    this.messageBg.fillStyle(color, 0.85);
    this.messageBg.fillRoundedRect(cx - w / 2, msgY, w, 28, 8);
    this.messageBg.lineStyle(1, this.GOLD, 0.5);
    this.messageBg.strokeRoundedRect(cx - w / 2, msgY, w, 28, 8);
  }

  private createButtons(): void {
    this.ginBtn = this.createBtn(this.CANVAS_W / 2 + 100, 495, 100, 34, 'GIN!', 0x2e7d32);
    this.discardBtn = this.createBtn(this.CANVAS_W / 2 - 100, 495, 100, 34, 'DISCARD', 0x8b1a1a);
    this.setButtonVisible(this.ginBtn, false);
    this.setButtonVisible(this.discardBtn, false);
  }

  private createBtn(x: number, y: number, w: number, h: number, label: string, color: number) {
    const bg = this.add.graphics().setDepth(25);
    this.drawBtnBg(bg, x, y, w, h, color);
    const text = this.add.text(x, y, label, {
      fontSize: '15px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(27);
    const hoverColor = Phaser.Display.Color.ValueToColor(color).lighten(20).color;
    zone.on('pointerover', () => this.drawBtnBg(bg, x, y, w, h, hoverColor));
    zone.on('pointerout', () => this.drawBtnBg(bg, x, y, w, h, color));

    if (label === 'GIN!') {
      zone.on('pointerdown', () => { if (this.onGinClick) this.onGinClick(); });
    } else {
      zone.on('pointerdown', () => { if (this.onDiscardClick) this.onDiscardClick(); });
    }

    return { bg, text, zone };
  }

  private drawBtnBg(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    gfx.lineStyle(1, 0xffffff, 0.15);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }

  private setButtonVisible(btn: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }, visible: boolean): void {
    btn.bg.setVisible(visible);
    btn.text.setVisible(visible);
    if (visible) btn.zone.setInteractive({ useHandCursor: true });
    else btn.zone.disableInteractive();
  }

  private clearDynamic(): void {
    this.dynamicElements.forEach(el => el.destroy());
    this.dynamicElements = [];
  }

  private trackDynamic<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamicElements.push(obj);
    return obj;
  }

  private getCardKey(card: GinRummyCard): string {
    if (card.faceDown) return 'cardBack_blue';
    const suitMap: Record<string, string> = {
      hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades'
    };
    return `card${suitMap[card.suit]}${card.value}`;
  }

  private removeWhiteBackground(sprite: Phaser.GameObjects.Sprite): void {
    if (!sprite.preFX) return;
    // No-op: cards don't need background removal here
  }

  // --- State Update ---

  public updateState(state: GinRummyVisualState): void {
    this.currentState = state;
    this.clearDynamic();

    this.drawOpponentHand(state);
    this.drawStockAndDiscard(state);
    this.drawMyHand(state);
    this.drawAvatars(state);

    // Message
    this.messageText.setText(state.message);
    if (state.message) {
      let msgColor = 0x16213e;
      if (state.message.includes('Gin')) msgColor = 0x2e7d32;
      else if (state.message.includes('Draw')) msgColor = 0x8b6914;
      else if (state.message.includes('Your turn')) msgColor = 0x8b6914;
      this.drawMessageBg(state.message, msgColor);
    } else {
      this.messageBg.clear();
    }

    // Buttons
    const showDiscard = state.phase === 'discarding' && state.isMyTurn && state.selectedCardIndex !== null;
    const showGin = state.phase === 'discarding' && state.isMyTurn && state.canGin;
    this.setButtonVisible(this.discardBtn, showDiscard);
    this.setButtonVisible(this.ginBtn, showGin);

    // Show melds after gin
    if (state.phase === 'gameOver' || state.phase === 'gin') {
      if (state.myMelds) this.drawMeldHighlights(state.myHand, state.myMelds, this.HAND_Y);
      if (state.opponentMelds && state.opponentHand) this.drawRevealedOpponentHand(state);
    }
  }

  private drawAvatars(state: GinRummyVisualState): void {
    // Opponent avatar (top left)
    this.drawAvatar(55, 72, state.opponentName, state.opponentAvatar);
    // Player avatar (bottom left)
    this.drawAvatar(55, this.HAND_Y, state.myName, state.myAvatar);
  }

  private drawAvatar(x: number, y: number, name: string, avatarKey?: string): void {
    const imageKey = avatarKey ? `avatar_${avatarKey}` : null;
    const hasSprite = imageKey && this.textures.exists(imageKey);

    if (hasSprite) {
      this.trackDynamic(
        this.add.image(x, y, imageKey!)
          .setDisplaySize(44, 44)
          .setDepth(10)
      );
    } else {
      const gfx = this.trackDynamic(this.add.graphics().setDepth(10));
      gfx.lineStyle(2, this.GOLD, 1);
      gfx.strokeCircle(x, y, 22);
      gfx.fillStyle(0x2980b9, 1);
      gfx.fillCircle(x, y, 21);
      this.trackDynamic(
        this.add.text(x, y, name.charAt(0).toUpperCase(), {
          fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11)
      );
    }
    this.trackDynamic(
      this.add.text(x, y + 30, name, {
        fontSize: '11px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  private drawOpponentHand(state: GinRummyVisualState): void {
    if (state.phase === 'gameOver' || state.phase === 'gin') return; // drawn by drawRevealedOpponentHand

    const count = state.opponentCardCount;
    const cx = this.CANVAS_W / 2 + 30;
    const y = 72;
    const cardW = this.CARD_W * 0.6;
    const cardH = this.CARD_H * 0.6;
    const spacing = Math.min(22, (350) / Math.max(count, 1));
    const totalW = cardW + (count - 1) * spacing;
    const startX = cx - totalW / 2 + cardW / 2;

    for (let i = 0; i < count; i++) {
      this.trackDynamic(
        this.add.sprite(startX + i * spacing, y, 'cardBack_blue')
          .setDisplaySize(cardW, cardH)
          .setDepth(5 + i)
      );
    }

    this.trackDynamic(
      this.add.text(cx, y + cardH / 2 + 10, `${count} cards`, {
        fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  private drawRevealedOpponentHand(state: GinRummyVisualState): void {
    if (!state.opponentHand) return;
    const hand = state.opponentHand;
    const cx = this.CANVAS_W / 2 + 30;
    const y = 72;
    const cardW = this.CARD_W * 0.6;
    const cardH = this.CARD_H * 0.6;
    const spacing = Math.min(22, 350 / Math.max(hand.length, 1));
    const totalW = cardW + (hand.length - 1) * spacing;
    const startX = cx - totalW / 2 + cardW / 2;

    for (let i = 0; i < hand.length; i++) {
      const key = this.getCardKey(hand[i]);
      this.trackDynamic(
        this.add.sprite(startX + i * spacing, y, key)
          .setDisplaySize(cardW, cardH)
          .setDepth(5 + i)
      );
    }

    if (state.opponentMelds) {
      this.drawMeldHighlights(hand, state.opponentMelds, 72, 0.6, cx);
    }
  }

  private drawStockAndDiscard(state: GinRummyVisualState): void {
    const stockX = this.CANVAS_W / 2 - 50;
    const discardX = this.CANVAS_W / 2 + 50;
    const y = 195;
    const cardW = this.CARD_W * 0.8;
    const cardH = this.CARD_H * 0.8;

    // Stock pile
    if (state.stockCount > 0) {
      const stackCount = Math.min(state.stockCount, 3);
      for (let i = 0; i < stackCount; i++) {
        this.trackDynamic(
          this.add.sprite(stockX + i * 2, y + i * 1, 'cardBack_blue')
            .setDisplaySize(cardW, cardH)
            .setDepth(2 + i)
        );
      }

      // Clickable if drawing phase
      if (state.phase === 'drawing' && state.isMyTurn) {
        const zone = this.trackDynamic(
          this.add.zone(stockX, y, cardW + 10, cardH + 10)
            .setInteractive({ useHandCursor: true })
            .setDepth(15)
        );
        zone.on('pointerdown', () => { if (this.onStockClick) this.onStockClick(); });

        // Glow
        const glow = this.trackDynamic(this.add.graphics().setDepth(1));
        glow.lineStyle(2, this.GOLD, 0.7);
        glow.strokeRoundedRect(stockX - cardW / 2 - 4, y - cardH / 2 - 4, cardW + 8, cardH + 8, 6);
      }
    }

    this.trackDynamic(
      this.add.text(stockX, y + cardH / 2 + 12, state.stockCount > 0 ? `Stock: ${state.stockCount}` : 'Empty', {
        fontSize: '11px', color: state.stockCount > 0 ? '#d4a847' : '#666', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );

    // Discard pile
    if (state.discardTop) {
      const key = this.getCardKey(state.discardTop);
      this.trackDynamic(
        this.add.sprite(discardX, y, key)
          .setDisplaySize(cardW, cardH)
          .setDepth(3)
      );

      if (state.phase === 'drawing' && state.isMyTurn) {
        const zone = this.trackDynamic(
          this.add.zone(discardX, y, cardW + 10, cardH + 10)
            .setInteractive({ useHandCursor: true })
            .setDepth(15)
        );
        zone.on('pointerdown', () => { if (this.onDiscardPileClick) this.onDiscardPileClick(); });

        const glow = this.trackDynamic(this.add.graphics().setDepth(1));
        glow.lineStyle(2, this.GOLD, 0.7);
        glow.strokeRoundedRect(discardX - cardW / 2 - 4, y - cardH / 2 - 4, cardW + 8, cardH + 8, 6);
      }
    } else {
      const gfx = this.trackDynamic(this.add.graphics().setDepth(2));
      gfx.lineStyle(2, 0x444444, 0.5);
      gfx.strokeRoundedRect(discardX - cardW / 2, y - cardH / 2, cardW, cardH, 4);
    }

    this.trackDynamic(
      this.add.text(discardX, y + cardH / 2 + 12, 'Discard', {
        fontSize: '11px', color: '#d4a847', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  private setupCardDrag(): void {
    this.input.dragDistanceThreshold = 10;

    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
      if (!gameObject.getData('draggable')) return;
      this.isDragging = true;
      this.dragSourceSlot = gameObject.getData('visualPos') as number;
      this.dragCurrentTarget = this.dragSourceSlot;
      gameObject.setDepth(50);
      gameObject.setAlpha(0.85);
    });

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite, dragX: number) => {
      if (!gameObject.getData('draggable')) return;
      // Lock Y, only move horizontally (lifted slightly)
      gameObject.x = dragX;
      gameObject.y = this.HAND_Y - 20;

      // Find nearest slot
      const target = this.findNearestSlot(dragX);
      if (target !== this.dragCurrentTarget) {
        this.dragCurrentTarget = target;
        this.previewReorder(this.dragSourceSlot, target);
      }
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
      if (!gameObject.getData('draggable')) return;
      gameObject.setAlpha(1);
      this.dragMarker.setVisible(false);

      const source = this.dragSourceSlot;
      const target = this.dragCurrentTarget;
      this.dragSourceSlot = -1;
      this.dragCurrentTarget = -1;

      // Commit the reorder
      if (source !== target && source >= 0 && this.myCardOrder.length > 0) {
        const [moved] = this.myCardOrder.splice(source, 1);
        this.myCardOrder.splice(target, 0, moved);
        if (this.onHandReorder) {
          this.onHandReorder([...this.myCardOrder]);
          this.myCardOrder = Array.from({ length: this.myCardOrder.length }, (_, i) => i);
        }
      }

      // Clear drag flag after a tick so pointerup doesn't trigger selection
      this.time.delayedCall(50, () => { this.isDragging = false; });

      // Re-render to finalize positions
      if (this.currentState) {
        this.updateState(this.currentState);
      }
    });
  }

  private findNearestSlot(x: number): number {
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < this.myCardSlotXs.length; i++) {
      const dist = Math.abs(x - this.myCardSlotXs[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  private previewReorder(source: number, target: number): void {
    // Slide non-dragged cards to show where the card will land
    for (let i = 0; i < this.handSprites.length; i++) {
      if (i === source) continue; // skip the dragged card
      const sprite = this.handSprites[i];
      if (!sprite || !sprite.active) continue;

      let destSlot = i;
      if (source < target) {
        // Dragging right: cards between source+1..target shift left by 1
        if (i > source && i <= target) destSlot = i - 1;
      } else {
        // Dragging left: cards between target..source-1 shift right by 1
        if (i >= target && i < source) destSlot = i + 1;
      }

      this.tweens.add({
        targets: sprite,
        x: this.myCardSlotXs[destSlot],
        duration: 120,
        ease: 'Power2'
      });
    }

    // Show insertion marker at target slot
    this.dragMarker.clear();
    const markerX = this.myCardSlotXs[target];
    this.dragMarker.lineStyle(3, this.GOLD, 0.9);
    this.dragMarker.strokeRoundedRect(
      markerX - this.CARD_W / 2 - 3, this.HAND_Y - this.CARD_H / 2 - 3,
      this.CARD_W + 6, this.CARD_H + 6, 5
    );
    this.dragMarker.setVisible(true);
  }

  private drawMyHand(state: GinRummyVisualState): void {
    const hand = state.myHand;
    this.handSprites = [];
    if (hand.length === 0) return;

    const cx = this.CANVAS_W / 2 + 30;
    const y = this.HAND_Y;
    const handSize = hand.length;
    const spacing = Math.min(this.CARD_SPACING, (450) / Math.max(handSize, 1));
    const totalW = this.CARD_W + (handSize - 1) * spacing;
    const startX = cx - totalW / 2 + this.CARD_W / 2;

    // Initialize/reset card order when hand size changes
    if (handSize !== this.lastHandSize) {
      this.myCardOrder = Array.from({ length: handSize }, (_, i) => i);
      this.lastHandSize = handSize;
    }
    if (this.myCardOrder.length !== handSize) {
      this.myCardOrder = Array.from({ length: handSize }, (_, i) => i);
    }

    // Compute slot positions for drag snapping
    this.myCardSlotXs = [];
    for (let i = 0; i < handSize; i++) {
      this.myCardSlotXs.push(startX + i * spacing);
    }

    for (let visualPos = 0; visualPos < handSize; visualPos++) {
      const actualIndex = this.myCardOrder[visualPos];
      const card = hand[actualIndex];
      const key = this.getCardKey(card);
      const x = startX + visualPos * spacing;
      const isSelected = state.selectedCardIndex === actualIndex;
      const cardY = isSelected ? y - 14 : y;

      const sprite = this.trackDynamic(
        this.add.sprite(x, cardY, key)
          .setDisplaySize(this.CARD_W, this.CARD_H)
          .setDepth(5 + visualPos)
      );

      this.handSprites[visualPos] = sprite;

      // Make draggable and clickable
      sprite.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(sprite);
      sprite.setData('draggable', true);
      sprite.setData('visualPos', visualPos);

      // Click to select during discard phase (use pointerup to avoid drag conflicts)
      if (state.phase === 'discarding' && state.isMyTurn) {
        sprite.on('pointerup', () => {
          if (!this.isDragging) {
            if (this.onHandCardClick) this.onHandCardClick(actualIndex);
          }
        });
      }

      if (isSelected) {
        const highlight = this.trackDynamic(this.add.graphics().setDepth(15));
        highlight.lineStyle(3, 0xffd700, 1);
        highlight.strokeRoundedRect(
          x - this.CARD_W / 2 - 2, cardY - this.CARD_H / 2 - 2,
          this.CARD_W + 4, this.CARD_H + 4, 4
        );
      }
    }

    this.trackDynamic(
      this.add.text(cx, y + this.CARD_H / 2 + 10, `${handSize} cards`, {
        fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  private drawMeldHighlights(hand: GinRummyCard[], melds: GinRummyMeld[], baseY: number, scale: number = 1, cx?: number): void {
    if (!melds.length) return;
    const cardW = this.CARD_W * scale;
    const spacing = Math.min(this.CARD_SPACING * scale, (450 * scale) / Math.max(hand.length, 1));
    const centerX = cx || (this.CANVAS_W / 2 + 30);
    const totalW = cardW + (hand.length - 1) * spacing;
    const startX = centerX - totalW / 2 + cardW / 2;
    const cardH = this.CARD_H * scale;

    for (const meld of melds) {
      const color = meld.type === 'set' ? 0x2196f3 : 0x4caf50;
      for (const mc of meld.cards) {
        const idx = hand.findIndex(c => c.suit === mc.suit && c.value === mc.value);
        if (idx >= 0) {
          const x = startX + idx * spacing;
          const gfx = this.trackDynamic(this.add.graphics().setDepth(14));
          gfx.lineStyle(2, color, 0.8);
          gfx.strokeRoundedRect(
            x - cardW / 2 - 2, baseY - cardH / 2 - 2,
            cardW + 4, cardH + 4, 3
          );
        }
      }
    }
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

    const panelH = subMessage ? 130 : 110;
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(cx - 180, cy - panelH / 2, 360, panelH, 12);
    panel.lineStyle(2, this.GOLD);
    panel.strokeRoundedRect(cx - 180, cy - panelH / 2, 360, panelH, 12);
    panel.setDepth(91);
    this.gameOverElements.push(panel);

    const text = this.add.text(cx, cy - (subMessage ? 18 : 0), message, {
      fontSize: '22px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(92);
    this.gameOverElements.push(text);

    if (subMessage) {
      const sub = this.add.text(cx, cy + 16, subMessage, {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(92);
      this.gameOverElements.push(sub);
    }
  }

  public resetGame(): void {
    this.clearDynamic();
    this.gameOverElements.forEach(el => el.destroy());
    this.gameOverElements = [];
    if (this.messageText) this.messageText.setText('');
    if (this.messageBg) this.messageBg.clear();
    if (this.ginBtn) this.setButtonVisible(this.ginBtn, false);
    if (this.discardBtn) this.setButtonVisible(this.discardBtn, false);
    this.currentState = null;
    this.myCardOrder = [];
    this.myCardSlotXs = [];
    this.handSprites = [];
    this.lastHandSize = 0;
    this.isDragging = false;
    this.dragSourceSlot = -1;
    this.dragCurrentTarget = -1;
  }
}
