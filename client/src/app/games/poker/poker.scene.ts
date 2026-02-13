import Phaser from 'phaser';
import { Card, PokerVisualState, PokerPlayer, PokerVariant, WildCardOption, WILD_CARD_OPTIONS, WILD_VALUE_OPTIONS, HAND_RANK_NAMES, HandRank, isCardWild, POKER_VARIANTS } from './poker-types';
import { getAvatarConfig, AI_NAMES } from '../../core/ai/ai-names';

export class PokerScene extends Phaser.Scene {
  private readonly CARD_W = 85;
  private readonly CARD_H = 119;
  private readonly CARD_SPACING = 36;
  private readonly CANVAS_W = 990;
  private readonly CANVAS_H = 748;

  // Casino colors (matching Blackjack)
  private readonly FELT_GREEN = 0x1a6b37;
  private readonly RIM_BROWN = 0x5c2e0e;
  private readonly GOLD = 0xd4a847;
  private readonly DARK_BG = 0x0b0b15;

  private dynamicElements: Phaser.GameObjects.GameObject[] = [];

  // Action buttons
  private checkBtn!: ReturnType<typeof this.createButton>;
  private callBtn!: ReturnType<typeof this.createButton>;
  private raiseBtn!: ReturnType<typeof this.createButton>;
  private foldBtn!: ReturnType<typeof this.createButton>;
  private allInBtn!: ReturnType<typeof this.createButton>;

  // Raise amount controls
  private raiseAmountText!: Phaser.GameObjects.Text;
  private raiseAmount = 0;
  private raisePresetBtns: ReturnType<typeof this.createButton>[] = [];

  // Draw phase buttons
  private discardBtn!: ReturnType<typeof this.createButton>;
  private standPatBtn!: ReturnType<typeof this.createButton>;

  // Card selection for draw phase
  private selectedCards: Set<number> = new Set();
  private cardSprites: Phaser.GameObjects.Sprite[] = [];
  private cardSelectionMarkers: Phaser.GameObjects.Graphics[] = [];

  // Drag-and-drop card sorting
  private myCardOrder: number[] = [];
  private myCardSlotXs: number[] = [];
  private isDragging = false;
  private lastHandSize = 0;

  // Message
  private messageBg!: Phaser.GameObjects.Graphics;
  private messageText!: Phaser.GameObjects.Text;

  // Pot display
  private potText!: Phaser.GameObjects.Text;

  // Active player glow
  private glowGraphics!: Phaser.GameObjects.Graphics;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private glowAlpha = 0;

  // Game over overlay
  private gameOverElements: Phaser.GameObjects.GameObject[] = [];

  // Variant selection elements
  private variantSelectElements: Phaser.GameObjects.GameObject[] = [];

  // Wild card selection elements
  private wildSelectElements: Phaser.GameObjects.GameObject[] = [];
  private wildToggleState: Set<WildCardOption> = new Set();

  // Buy-in elements
  private buyInElements: Phaser.GameObjects.GameObject[] = [];

  // Table label (dynamic variant name)
  private tableLabel!: Phaser.GameObjects.Text;

  // Current visual state
  private currentState: PokerVisualState | null = null;

  // Callbacks
  public onCheckClick: (() => void) | null = null;
  public onCallClick: (() => void) | null = null;
  public onRaiseClick: ((amount: number) => void) | null = null;
  public onFoldClick: (() => void) | null = null;
  public onAllInClick: (() => void) | null = null;
  public onDiscardClick: ((indices: number[]) => void) | null = null;
  public onStandPatClick: (() => void) | null = null;
  public onVariantSelect: ((variant: PokerVariant) => void) | null = null;
  public onWildCardSelect: ((wilds: WildCardOption[], lastCardDown?: boolean) => void) | null = null;
  private selectedVariantForWild: PokerVariant | null = null;
  private lastCardDownToggle = true; // default: 7th card down
  public onBuyInClick: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'PokerScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/cards/';
    this.load.image('cardBack_blue', basePath + 'cardBack_blue1.png');

    const suits = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    for (const suit of suits) {
      for (const value of values) {
        const key = `card${suit}${value}`;
        this.load.image(key, basePath + `card${suit}${value}.png`);
      }
    }
    this.load.image('cardJoker', basePath + 'cardJoker.png');

    // Avatar images (one per AI name)
    const avatarPath = 'assets/sprites/board-game/avatars/images/';
    for (const name of AI_NAMES) {
      this.load.image(`avatar_${name}`, avatarPath + `${name}.png`);
    }
  }

  create(): void {
    this.removeWhiteBackground();
    this.drawTable();
    this.createMessage();
    this.createPotDisplay();
    this.createActionButtons();
    this.createDrawButtons();
    this.createRaiseControls();
    this.glowGraphics = this.add.graphics().setDepth(4);

    this.hideAllButtons();
    this.setupCardDrag();

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
      const threshold = 240; // pixels with R,G,B all above this become transparent

      for (let p = 0; p < data.length; p += 4) {
        if (data[p] >= threshold && data[p + 1] >= threshold && data[p + 2] >= threshold) {
          data[p + 3] = 0; // set alpha to 0
        }
      }

      ctx.putImageData(imageData, 0, 0);
      this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
    }
  }

  // --- Card Drag-and-Drop ---

  private setupCardDrag(): void {
    this.input.dragDistanceThreshold = 10;

    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
      if (!gameObject.getData('draggable')) return;
      this.isDragging = true;
      gameObject.setDepth(50);
      gameObject.setAlpha(0.85);
    });

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite, dragX: number, dragY: number) => {
      if (!gameObject.getData('draggable')) return;
      gameObject.x = dragX;
      gameObject.y = dragY;
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
      if (!gameObject.getData('draggable')) return;
      gameObject.setAlpha(1);
      const visualPos = gameObject.getData('visualPos') as number;
      const dropX = gameObject.x;

      // Find the nearest slot
      let nearestSlot = 0;
      let minDist = Infinity;
      for (let i = 0; i < this.myCardSlotXs.length; i++) {
        const dist = Math.abs(dropX - this.myCardSlotXs[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestSlot = i;
        }
      }

      // Reorder: remove from old position, insert at new
      if (nearestSlot !== visualPos && this.myCardOrder.length > 0) {
        const [moved] = this.myCardOrder.splice(visualPos, 1);
        this.myCardOrder.splice(nearestSlot, 0, moved);
      }

      // Clear drag flag after a tick so pointerup doesn't trigger selection
      this.time.delayedCall(50, () => { this.isDragging = false; });

      // Re-render
      if (this.currentState) {
        this.updateState(this.currentState);
      }
    });
  }

  // --- Casino Table ---

  private drawTable(): void {
    const gfx = this.add.graphics().setDepth(0);
    const cx = this.CANVAS_W / 2;

    // Full ellipse table (poker is oval, not half-circle like blackjack)
    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillEllipse(cx, 341, 935, 528);

    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillEllipse(cx, 341, 902, 495);

    // Gold accent oval
    gfx.lineStyle(2, this.GOLD, 0.4);
    gfx.strokeEllipse(cx, 341, 660, 330);

    // Table label (dynamic — updated by variant)
    this.tableLabel = this.add.text(cx, 341, "DEALER'S CHOICE", {
      fontSize: '14px', color: '#2a8f4f', fontFamily: 'Georgia', fontStyle: 'italic'
    }).setOrigin(0.5).setDepth(1).setAlpha(0.5);
  }

  // --- Message ---

  private createMessage(): void {
    const cx = this.CANVAS_W / 2;
    this.messageBg = this.add.graphics().setDepth(19);
    this.messageText = this.add.text(cx, 341, '', {
      fontSize: '17px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
  }

  private drawMessageBg(text: string, color: number = 0x16213e, yOffset: number = 0): void {
    this.messageBg.clear();
    if (!text) return;
    const cx = this.CANVAS_W / 2;
    const y = 325 + yOffset;
    const w = Math.max(text.length * 10 + 44, 220);
    this.messageBg.fillStyle(0x000000, 0.5);
    this.messageBg.fillRoundedRect(cx - w / 2, y, w, 33, 8);
    this.messageBg.fillStyle(color, 0.85);
    this.messageBg.fillRoundedRect(cx - w / 2, y, w, 33, 8);
    this.messageBg.lineStyle(1, this.GOLD, 0.5);
    this.messageBg.strokeRoundedRect(cx - w / 2, y, w, 33, 8);
  }

  // --- Pot Display ---

  private createPotDisplay(): void {
    const cx = this.CANVAS_W / 2;
    this.potText = this.add.text(cx, 292, '', {
      fontSize: '16px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
  }

  // --- Action Buttons ---

  private createActionButtons(): void {
    const y = 660;
    const btnW = 110;
    const btnH = 40;
    const gap = 11;
    const totalW = btnW * 5 + gap * 4;
    const startX = this.CANVAS_W / 2 - totalW / 2 + btnW / 2;

    this.checkBtn = this.createButton(startX, y, btnW, btnH, 'CHECK', 0x1a6b37, () => {
      if (this.onCheckClick) this.onCheckClick();
    });
    this.callBtn = this.createButton(startX + btnW + gap, y, btnW, btnH, 'CALL', 0x1a4a8b, () => {
      if (this.onCallClick) this.onCallClick();
    });
    this.raiseBtn = this.createButton(startX + (btnW + gap) * 2, y, btnW, btnH, 'RAISE', 0x8b6b1a, () => {
      if (this.onRaiseClick) this.onRaiseClick(this.raiseAmount);
    });
    this.foldBtn = this.createButton(startX + (btnW + gap) * 3, y, btnW, btnH, 'FOLD', 0x8b1a1a, () => {
      if (this.onFoldClick) this.onFoldClick();
    });
    this.allInBtn = this.createButton(startX + (btnW + gap) * 4, y, btnW, btnH, 'ALL IN', 0x6b1a8b, () => {
      if (this.onAllInClick) this.onAllInClick();
    });
  }

  // --- Raise Controls ---

  private createRaiseControls(): void {
    const y = 704;
    const btnW = 66;
    const btnH = 31;
    const gap = 9;
    const labels = ['Min', '2x', 'Pot', 'All-In'];
    const totalW = labels.length * (btnW + gap) - gap + 132;
    const startX = this.CANVAS_W / 2 - totalW / 2 + btnW / 2;

    for (let i = 0; i < labels.length; i++) {
      const btn = this.createButton(startX + i * (btnW + gap), y, btnW, btnH, labels[i], 0x444444, () => {
        this.handleRaisePreset(labels[i]);
      });
      this.raisePresetBtns.push(btn);
    }

    this.raiseAmountText = this.add.text(startX + labels.length * (btnW + gap) + 33, y, 'Raise: $0', {
      fontSize: '14px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(26);
  }

  private handleRaisePreset(preset: string): void {
    if (!this.currentState) return;
    const min = this.currentState.minRaise;
    const max = this.currentState.maxRaise;
    switch (preset) {
      case 'Min':
        this.raiseAmount = min;
        break;
      case '2x':
        this.raiseAmount = Math.min(min * 2, max);
        break;
      case 'Pot': {
        // Round pot to nearest MIN_BET increment, but at least minRaise
        const potRounded = Math.max(min, Math.round(this.currentState.pot / min) * min);
        this.raiseAmount = Math.min(potRounded, max);
        break;
      }
      case 'All-In':
        this.raiseAmount = max;
        break;
    }
    this.raiseAmountText.setText(`Raise: $${this.raiseAmount}`);
  }

  // --- Draw Phase Buttons ---

  private createDrawButtons(): void {
    const y = 660;
    const cx = this.CANVAS_W / 2;
    this.discardBtn = this.createButton(cx - 99, y, 176, 40, 'DISCARD SELECTED', 0x8b1a1a, () => {
      if (this.onDiscardClick) this.onDiscardClick([...this.selectedCards]);
      this.selectedCards.clear();
    });
    this.standPatBtn = this.createButton(cx + 99, y, 154, 40, 'STAND PAT', 0x1a6b37, () => {
      if (this.onStandPatClick) this.onStandPatClick();
      this.selectedCards.clear();
    });
  }

  // --- Button Helpers ---

  private createButton(
    x: number, y: number, w: number, h: number,
    label: string, color: number, onClick: () => void
  ): { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone } {
    const bg = this.add.graphics().setDepth(25);
    this.drawBtnBg(bg, x, y, w, h, color);

    const text = this.add.text(x, y, label, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26);

    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(27);
    zone.on('pointerdown', onClick);
    zone.on('pointerover', () => this.drawBtnBg(bg, x, y, w, h, Phaser.Display.Color.IntegerToColor(color).lighten(25).color));
    zone.on('pointerout', () => this.drawBtnBg(bg, x, y, w, h, color));

    return { bg, text, zone };
  }

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
    if (enabled) btn.zone.setInteractive({ useHandCursor: true });
    else btn.zone.disableInteractive();
    btn.bg.setAlpha(enabled ? 1 : 0.4);
    btn.text.setAlpha(enabled ? 1 : 0.4);
  }

  private hideAllButtons(): void {
    if (!this.checkBtn) return; // scene not yet created
    this.setButtonVisible(this.checkBtn, false);
    this.setButtonVisible(this.callBtn, false);
    this.setButtonVisible(this.raiseBtn, false);
    this.setButtonVisible(this.foldBtn, false);
    this.setButtonVisible(this.allInBtn, false);
    this.setButtonVisible(this.discardBtn, false);
    this.setButtonVisible(this.standPatBtn, false);
    for (const btn of this.raisePresetBtns) {
      this.setButtonVisible(btn, false);
    }
    this.raiseAmountText.setVisible(false);
  }

  // --- Card Helpers ---

  private getCardKey(card: Card): string {
    if (card.faceDown) return 'cardBack_blue';
    return this.getCardFaceKey(card);
  }

  private getCardFaceKey(card: Card): string {
    if (card.suit === 'joker') return 'cardJoker';
    const suitMap: Record<string, string> = {
      hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades'
    };
    return `card${suitMap[card.suit]}${card.value}`;
  }

  // --- Dynamic Element Management ---

  private clearDynamic(): void {
    this.dynamicElements.forEach(el => el.destroy());
    this.dynamicElements = [];
    this.cardSprites = [];
    this.cardSelectionMarkers = [];
  }

  private trackDynamic<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamicElements.push(obj);
    return obj;
  }

  // --- Player Positions (6 seats around oval) ---

  private getPlayerPositions(count: number): { x: number; y: number }[] {
    // Positions around an oval table for up to 6 players
    const positions6 = [
      { x: 495, y: 550 },  // bottom center (seat 0 - typically "you")
      { x: 165, y: 462 },  // bottom left
      { x: 110, y: 264 },  // top left
      { x: 385, y: 132 },  // top center-left
      { x: 605, y: 132 },  // top center-right
      { x: 880, y: 264 },  // top right
    ];

    if (count <= 2) return [positions6[0], positions6[3]];
    if (count === 3) return [positions6[0], positions6[2], positions6[5]];
    if (count === 4) return [positions6[0], positions6[1], positions6[3], positions6[5]];
    if (count === 5) return [positions6[0], positions6[1], positions6[2], positions6[4], positions6[5]];
    return positions6;
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
            this.glowGraphics.fillEllipse(x, y - 11, 198, 132);
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

  // --- Variant Selection ---

  private clearVariantSelect(): void {
    this.variantSelectElements.forEach(el => el.destroy());
    this.variantSelectElements = [];
  }

  private showVariantSelect(state: PokerVisualState): void {
    this.clearVariantSelect();
    const cx = this.CANVAS_W / 2;
    const cy = 341;

    // Semi-transparent overlay on table area — size adapts to variant count
    const variantCount = state.isDealerForSelect ? state.availableVariants.length : 0;
    const panelH = Math.max(220, 120 + variantCount * 62);
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRoundedRect(cx - 220, cy - panelH / 2, 440, panelH, 16);
    overlay.lineStyle(2, this.GOLD, 0.7);
    overlay.strokeRoundedRect(cx - 220, cy - panelH / 2, 440, panelH, 16);
    this.variantSelectElements.push(overlay);

    // Title
    const title = this.add.text(cx, cy - panelH / 2 + 28, "DEALER'S CHOICE", {
      fontSize: '22px', color: '#d4a847', fontFamily: 'Georgia', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(31);
    this.variantSelectElements.push(title);

    if (state.isDealerForSelect) {
      // Subtitle for dealer
      const sub = this.add.text(cx, cy - panelH / 2 + 56, 'Choose the game:', {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(31);
      this.variantSelectElements.push(sub);

      // Variant buttons
      const variants = state.availableVariants;
      const btnW = 380;
      const btnH = 50;
      const gap = 12;
      const startY = cy - panelH / 2 + 94;

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const by = startY + i * (btnH + gap);

        const bg = this.add.graphics().setDepth(31);
        bg.fillStyle(0x1a6b37);
        bg.fillRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 10);
        bg.lineStyle(1, this.GOLD, 0.4);
        bg.strokeRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 10);
        this.variantSelectElements.push(bg);

        const nameText = this.add.text(cx, by - 8, v.name, {
          fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(32);
        this.variantSelectElements.push(nameText);

        const descText = this.add.text(cx, by + 14, v.description, {
          fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial'
        }).setOrigin(0.5).setDepth(32);
        this.variantSelectElements.push(descText);

        const zone = this.add.zone(cx, by, btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(33);
        zone.on('pointerover', () => {
          bg.clear();
          bg.fillStyle(0x238b4a);
          bg.fillRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 10);
          bg.lineStyle(1, this.GOLD, 0.6);
          bg.strokeRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 10);
        });
        zone.on('pointerout', () => {
          bg.clear();
          bg.fillStyle(0x1a6b37);
          bg.fillRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 10);
          bg.lineStyle(1, this.GOLD, 0.4);
          bg.strokeRoundedRect(cx - btnW / 2, by - btnH / 2, btnW, btnH, 10);
        });
        zone.on('pointerdown', () => {
          if (this.onVariantSelect) this.onVariantSelect(v.id);
          this.clearVariantSelect();
        });
        this.variantSelectElements.push(zone);
      }
    } else {
      // Not the dealer — waiting message
      const waiting = this.add.text(cx, cy, 'Waiting for dealer to choose...', {
        fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial', fontStyle: 'italic'
      }).setOrigin(0.5).setDepth(31);
      this.variantSelectElements.push(waiting);
    }
  }

  // --- Wild Card Selection ---

  private clearWildCardSelect(): void {
    this.wildSelectElements.forEach(el => el.destroy());
    this.wildSelectElements = [];
  }

  private showWildCardSelect(state: PokerVisualState): void {
    this.clearWildCardSelect();
    const cx = this.CANVAS_W / 2;
    const cy = 341;
    const isStud = state.isStud;

    // Panel — taller when stud to fit the toggle
    const panelH = isStud ? 390 : 340;
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRoundedRect(cx - 250, cy - panelH / 2, 500, panelH, 16);
    overlay.lineStyle(2, this.GOLD, 0.7);
    overlay.strokeRoundedRect(cx - 250, cy - panelH / 2, 500, panelH, 16);
    this.wildSelectElements.push(overlay);

    // Title
    const title = this.add.text(cx, cy - panelH / 2 + 28, 'WILD CARDS', {
      fontSize: '22px', color: '#d4a847', fontFamily: 'Georgia', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(31);
    this.wildSelectElements.push(title);

    if (state.isDealerForWildSelect) {
      const sub = this.add.text(cx, cy - panelH / 2 + 52, 'Toggle wild cards, then DEAL:', {
        fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(31);
      this.wildSelectElements.push(sub);

      // Reset toggle state
      this.wildToggleState.clear();
      this.lastCardDownToggle = true; // default: 7th card down

      // --- Themed special wild options ---
      const options = WILD_CARD_OPTIONS;
      const btnW = 440;
      const btnH = 34;
      const gap = 5;
      const startY = cy - panelH / 2 + 80;

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const by = startY + i * (btnH + gap);

        const bg = this.add.graphics().setDepth(31);
        this.drawWildToggle(bg, cx, by, btnW, btnH, false);
        this.wildSelectElements.push(bg);

        const check = this.add.text(cx - btnW / 2 + 14, by, '\u2610', {
          fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial'
        }).setOrigin(0, 0.5).setDepth(32);
        this.wildSelectElements.push(check);

        const nameText = this.add.text(cx - btnW / 2 + 36, by - 5, opt.name, {
          fontSize: '13px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(32);
        this.wildSelectElements.push(nameText);

        const descText = this.add.text(cx - btnW / 2 + 36, by + 9, opt.description, {
          fontSize: '10px', color: '#999999', fontFamily: 'Arial'
        }).setOrigin(0, 0.5).setDepth(32);
        this.wildSelectElements.push(descText);

        const zone = this.add.zone(cx, by, btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(33);
        zone.on('pointerdown', () => {
          if (this.wildToggleState.has(opt.id)) {
            this.wildToggleState.delete(opt.id);
            this.drawWildToggle(bg, cx, by, btnW, btnH, false);
            check.setText('\u2610').setColor('#aaaaaa');
          } else {
            this.wildToggleState.add(opt.id);
            this.drawWildToggle(bg, cx, by, btnW, btnH, true);
            check.setText('\u2611').setColor('#4caf50');
          }
        });
        zone.on('pointerover', () => bg.setAlpha(0.85));
        zone.on('pointerout', () => bg.setAlpha(1));
        this.wildSelectElements.push(zone);
      }

      // --- Value-based wild picker grid ---
      const valuesY = startY + options.length * (btnH + gap) + 16;
      const valLabel = this.add.text(cx, valuesY, 'Values wild:', {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(31);
      this.wildSelectElements.push(valLabel);

      const values = WILD_VALUE_OPTIONS;
      const vBtnW = 30;
      const vBtnH = 28;
      const vGap = 4;
      const totalVW = values.length * (vBtnW + vGap) - vGap;
      const vStartX = cx - totalVW / 2 + vBtnW / 2;
      const vY = valuesY + 24;

      for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const vx = vStartX + i * (vBtnW + vGap);

        const vBg = this.add.graphics().setDepth(31);
        vBg.fillStyle(0x2a2a3a);
        vBg.fillRoundedRect(vx - vBtnW / 2, vY - vBtnH / 2, vBtnW, vBtnH, 4);
        vBg.lineStyle(1, 0x555555, 0.5);
        vBg.strokeRoundedRect(vx - vBtnW / 2, vY - vBtnH / 2, vBtnW, vBtnH, 4);
        this.wildSelectElements.push(vBg);

        const vText = this.add.text(vx, vY, val, {
          fontSize: '12px', color: '#cccccc', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(32);
        this.wildSelectElements.push(vText);

        const vZone = this.add.zone(vx, vY, vBtnW, vBtnH).setInteractive({ useHandCursor: true }).setDepth(33);
        vZone.on('pointerdown', () => {
          const wildVal = val as WildCardOption;
          if (this.wildToggleState.has(wildVal)) {
            this.wildToggleState.delete(wildVal);
            vBg.clear();
            vBg.fillStyle(0x2a2a3a);
            vBg.fillRoundedRect(vx - vBtnW / 2, vY - vBtnH / 2, vBtnW, vBtnH, 4);
            vBg.lineStyle(1, 0x555555, 0.5);
            vBg.strokeRoundedRect(vx - vBtnW / 2, vY - vBtnH / 2, vBtnW, vBtnH, 4);
            vText.setColor('#cccccc');
          } else {
            this.wildToggleState.add(wildVal);
            vBg.clear();
            vBg.fillStyle(0x2e5930);
            vBg.fillRoundedRect(vx - vBtnW / 2, vY - vBtnH / 2, vBtnW, vBtnH, 4);
            vBg.lineStyle(1, 0x4caf50, 0.7);
            vBg.strokeRoundedRect(vx - vBtnW / 2, vY - vBtnH / 2, vBtnW, vBtnH, 4);
            vText.setColor('#4caf50');
          }
        });
        this.wildSelectElements.push(vZone);
      }

      let nextY = vY + vBtnH / 2 + 16;

      // --- 7th Card Down/Up toggle (stud only) ---
      if (isStud) {
        const toggleLabel = this.add.text(cx, nextY, '7th card dealt:', {
          fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial'
        }).setOrigin(0.5).setDepth(31);
        this.wildSelectElements.push(toggleLabel);

        nextY += 22;
        const toggleBtnW = 140;
        const toggleBtnH = 30;
        const toggleGap = 10;

        // "Face Down" button
        const downX = cx - toggleBtnW / 2 - toggleGap / 2;
        const downBg = this.add.graphics().setDepth(31);
        const upX = cx + toggleBtnW / 2 + toggleGap / 2;
        const upBg = this.add.graphics().setDepth(31);

        const drawToggleBtns = () => {
          downBg.clear();
          downBg.fillStyle(this.lastCardDownToggle ? 0x2e5930 : 0x2a2a3a);
          downBg.fillRoundedRect(downX - toggleBtnW / 2, nextY - toggleBtnH / 2, toggleBtnW, toggleBtnH, 6);
          downBg.lineStyle(1, this.lastCardDownToggle ? 0x4caf50 : 0x555555, 0.7);
          downBg.strokeRoundedRect(downX - toggleBtnW / 2, nextY - toggleBtnH / 2, toggleBtnW, toggleBtnH, 6);

          upBg.clear();
          upBg.fillStyle(!this.lastCardDownToggle ? 0x2e5930 : 0x2a2a3a);
          upBg.fillRoundedRect(upX - toggleBtnW / 2, nextY - toggleBtnH / 2, toggleBtnW, toggleBtnH, 6);
          upBg.lineStyle(1, !this.lastCardDownToggle ? 0x4caf50 : 0x555555, 0.7);
          upBg.strokeRoundedRect(upX - toggleBtnW / 2, nextY - toggleBtnH / 2, toggleBtnW, toggleBtnH, 6);
        };
        drawToggleBtns();
        this.wildSelectElements.push(downBg, upBg);

        const downText = this.add.text(downX, nextY, 'Face Down', {
          fontSize: '13px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(32);
        const upText = this.add.text(upX, nextY, 'Face Up', {
          fontSize: '13px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(32);
        this.wildSelectElements.push(downText, upText);

        const downZone = this.add.zone(downX, nextY, toggleBtnW, toggleBtnH).setInteractive({ useHandCursor: true }).setDepth(33);
        downZone.on('pointerdown', () => { this.lastCardDownToggle = true; drawToggleBtns(); });
        const upZone = this.add.zone(upX, nextY, toggleBtnW, toggleBtnH).setInteractive({ useHandCursor: true }).setDepth(33);
        upZone.on('pointerdown', () => { this.lastCardDownToggle = false; drawToggleBtns(); });
        this.wildSelectElements.push(downZone, upZone);

        nextY += toggleBtnH / 2 + 6;
      }

      // --- DEAL button ---
      const dealY = nextY + 6;
      const dealW = 160;
      const dealH = 40;
      const dealBg = this.add.graphics().setDepth(31);
      dealBg.fillStyle(0x1a6b37);
      dealBg.fillRoundedRect(cx - dealW / 2, dealY - dealH / 2, dealW, dealH, 10);
      dealBg.lineStyle(1, this.GOLD, 0.5);
      dealBg.strokeRoundedRect(cx - dealW / 2, dealY - dealH / 2, dealW, dealH, 10);
      this.wildSelectElements.push(dealBg);

      const dealText = this.add.text(cx, dealY, 'DEAL!', {
        fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(32);
      this.wildSelectElements.push(dealText);

      const dealZone = this.add.zone(cx, dealY, dealW, dealH).setInteractive({ useHandCursor: true }).setDepth(33);
      dealZone.on('pointerdown', () => {
        if (this.onWildCardSelect) {
          this.onWildCardSelect([...this.wildToggleState], isStud ? this.lastCardDownToggle : undefined);
        }
        this.clearWildCardSelect();
      });
      dealZone.on('pointerover', () => {
        dealBg.clear();
        dealBg.fillStyle(0x238b4a);
        dealBg.fillRoundedRect(cx - dealW / 2, dealY - dealH / 2, dealW, dealH, 10);
        dealBg.lineStyle(1, this.GOLD, 0.7);
        dealBg.strokeRoundedRect(cx - dealW / 2, dealY - dealH / 2, dealW, dealH, 10);
      });
      dealZone.on('pointerout', () => {
        dealBg.clear();
        dealBg.fillStyle(0x1a6b37);
        dealBg.fillRoundedRect(cx - dealW / 2, dealY - dealH / 2, dealW, dealH, 10);
        dealBg.lineStyle(1, this.GOLD, 0.5);
        dealBg.strokeRoundedRect(cx - dealW / 2, dealY - dealH / 2, dealW, dealH, 10);
      });
      this.wildSelectElements.push(dealZone);
    } else {
      // Not the dealer — waiting message
      const waiting = this.add.text(cx, cy, 'Waiting for dealer to choose wild cards...', {
        fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial', fontStyle: 'italic'
      }).setOrigin(0.5).setDepth(31);
      this.wildSelectElements.push(waiting);
    }
  }

  // --- Buy-In Announcement ---

  private clearBuyIn(): void {
    this.buyInElements.forEach(el => el.destroy());
    this.buyInElements = [];
  }

  private showBuyIn(state: PokerVisualState): void {
    this.clearBuyIn();
    const cx = this.CANVAS_W / 2;
    const cy = 341;

    // Panel
    const panelH = 200;
    const panelW = 440;
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 16);
    overlay.lineStyle(2, this.GOLD, 0.7);
    overlay.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 16);
    this.buyInElements.push(overlay);

    // Game name
    const gameName = state.variantName || "DEALER'S CHOICE";
    const nameText = this.add.text(cx, cy - 60, gameName, {
      fontSize: '28px', color: '#ffffff', fontFamily: 'Georgia', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(31);
    this.buyInElements.push(nameText);

    // Wild info
    if (state.activeWilds && state.activeWilds.length > 0) {
      const themed: string[] = [];
      const values: string[] = [];
      for (const w of state.activeWilds) {
        const opt = WILD_CARD_OPTIONS.find(o => o.id === w);
        if (opt) { themed.push(opt.name); }
        else { values.push(`${w}s`); }
      }
      const parts = [...themed];
      if (values.length > 0) parts.push(values.join(', ') + ' wild');
      const wildStr = parts.join(', ');
      const wildText = this.add.text(cx, cy - 28, `Wild: ${wildStr}`, {
        fontSize: '15px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'italic'
      }).setOrigin(0.5).setDepth(31);
      this.buyInElements.push(wildText);
    } else {
      const noWilds = this.add.text(cx, cy - 28, 'No wild cards', {
        fontSize: '15px', color: '#888888', fontFamily: 'Arial', fontStyle: 'italic'
      }).setOrigin(0.5).setDepth(31);
      this.buyInElements.push(noWilds);
    }

    // Follow the Queen description
    if (state.variantName === 'FOLLOW THE QUEEN') {
      const ftqDesc = this.add.text(cx, cy - 10, 'Face-up Queen → next card\'s value wild too', {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial', fontStyle: 'italic'
      }).setOrigin(0.5).setDepth(31);
      this.buyInElements.push(ftqDesc);
    }

    // Divider
    const div = this.add.graphics().setDepth(31);
    div.lineStyle(1, this.GOLD, 0.3);
    div.lineBetween(cx - 140, cy - 6, cx + 140, cy - 6);
    this.buyInElements.push(div);

    // Ante / Blinds info
    const isHoldem = state.isHoldem || false;
    const costText = isHoldem ? 'Blinds: $1 / $2' : 'Ante: $1';
    const anteText = this.add.text(cx, cy + 14, costText, {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(31);
    this.buyInElements.push(anteText);

    // BUY IN / DEAL button
    const btnY = cy + 56;
    const btnW = 180;
    const btnH = 42;
    const btnBg = this.add.graphics().setDepth(31);
    btnBg.fillStyle(0x1a6b37);
    btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
    btnBg.lineStyle(1, this.GOLD, 0.5);
    btnBg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
    this.buyInElements.push(btnBg);

    const btnLabel = isHoldem ? 'DEAL' : 'BUY IN  $1';
    const btnText = this.add.text(cx, btnY, btnLabel, {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(32);
    this.buyInElements.push(btnText);

    const btnZone = this.add.zone(cx, btnY, btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(33);
    btnZone.on('pointerdown', () => {
      if (this.onBuyInClick) this.onBuyInClick();
      this.clearBuyIn();
    });
    btnZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x238b4a);
      btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
      btnBg.lineStyle(1, this.GOLD, 0.7);
      btnBg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
    });
    btnZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x1a6b37);
      btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
      btnBg.lineStyle(1, this.GOLD, 0.5);
      btnBg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
    });
    this.buyInElements.push(btnZone);
  }

  private drawWildToggle(gfx: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, h: number, active: boolean): void {
    gfx.clear();
    gfx.fillStyle(active ? 0x2e5930 : 0x2a2a3a);
    gfx.fillRoundedRect(cx - w / 2, y - h / 2, w, h, 6);
    gfx.lineStyle(1, active ? 0x4caf50 : 0x555555, 0.5);
    gfx.strokeRoundedRect(cx - w / 2, y - h / 2, w, h, 6);
  }

  // --- Community Cards (Hold'em) ---

  private drawCommunityCards(cards: Card[]): void {
    if (cards.length === 0) return;
    const cx = this.CANVAS_W / 2;
    const y = 275;
    const totalSlots = 5;
    const spacing = this.CARD_W + 8;
    const totalW = spacing * (totalSlots - 1);
    const startX = cx - totalW / 2;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const key = this.getCardKey(card);
      const x = startX + i * spacing;

      this.trackDynamic(
        this.add.sprite(x, y, key)
          .setDisplaySize(this.CARD_W, this.CARD_H)
          .setDepth(8)
      );
    }

    // Draw empty slots for undealt community cards
    const slotGfx = this.trackDynamic(this.add.graphics().setDepth(7));
    for (let i = cards.length; i < totalSlots; i++) {
      const x = startX + i * spacing;
      slotGfx.lineStyle(1, this.GOLD, 0.2);
      slotGfx.strokeRoundedRect(
        x - this.CARD_W / 2, y - this.CARD_H / 2,
        this.CARD_W, this.CARD_H, 4
      );
    }
  }

  // --- State Update ---

  public updateState(state: PokerVisualState): void {
    this.currentState = state;
    this.clearDynamic();
    this.clearActiveGlow();

    // Update table label with current variant and wild info
    if (this.tableLabel) {
      let label = state.variantName || "DEALER'S CHOICE";
      if (state.activeWilds && state.activeWilds.length > 0) {
        const themed: string[] = [];
        const values: string[] = [];
        for (const w of state.activeWilds) {
          const opt = WILD_CARD_OPTIONS.find(o => o.id === w);
          if (opt) { themed.push(opt.name); }
          else { values.push(`${w}s`); }
        }
        const parts = [...themed];
        if (values.length > 0) parts.push(values.join(', ') + ' wild');
        if (parts.length > 0) label += ` \u2022 ${parts.join(', ')}`;
      }
      this.tableLabel.setText(label);
    }

    // Handle variant selection phase
    if (state.isVariantSelect) {
      this.hideAllButtons();
      this.clearWildCardSelect();
      this.clearBuyIn();
      this.showVariantSelect(state);
      return;
    } else {
      this.clearVariantSelect();
    }

    // Handle wild card selection phase
    if (state.isWildSelect) {
      this.hideAllButtons();
      this.clearBuyIn();
      this.showWildCardSelect(state);
      return;
    } else {
      this.clearWildCardSelect();
    }

    // Handle buy-in phase
    if (state.isBuyIn) {
      this.hideAllButtons();
      this.showBuyIn(state);
      return;
    } else {
      this.clearBuyIn();
    }

    // Draw players
    const activePlayers = state.players.filter(p => !p.isEliminated);
    const positions = this.getPlayerPositions(activePlayers.length);
    let activePlayerIdx = 0;

    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i];
      if (player.isEliminated) continue;

      const pos = positions[activePlayerIdx];
      const isMe = i === state.myIndex;
      this.drawPlayer(player, pos.x, pos.y, state, isMe);
      activePlayerIdx++;
    }

    // Community cards (Hold'em)
    if (state.isHoldem && state.communityCards && state.communityCards.length > 0) {
      this.drawCommunityCards(state.communityCards);
    }

    // Pot display — shift above community cards for Hold'em
    this.potText.setY(state.isHoldem ? 205 : 292);
    if (state.pot > 0) {
      this.potText.setText(`Pot: $${state.pot.toLocaleString()}`);
    } else {
      this.potText.setText('');
    }

    // Message — shift below community cards for Hold'em
    const msgY = state.isHoldem ? 360 : 341;
    this.messageText.setY(msgY);
    this.messageText.setText(state.message);
    if (state.message) {
      let msgColor = 0x16213e;
      if (state.message.includes('win') || state.message.includes('Win')) msgColor = 0x2e7d32;
      else if (state.message.includes('fold') || state.message.includes('Fold')) msgColor = 0x8b0000;
      else if (state.message.includes('split') || state.message.includes('Split')) msgColor = 0x555555;
      this.drawMessageBg(state.message, msgColor, state.isHoldem ? 19 : 0);
    } else {
      this.messageBg.clear();
    }

    // Update buttons
    this.hideAllButtons();

    if (state.isBetting) {
      this.setButtonVisible(this.checkBtn, true);
      this.setButtonEnabled(this.checkBtn, state.canCheck);
      this.setButtonVisible(this.callBtn, true);
      this.setButtonEnabled(this.callBtn, state.canCall);
      if (state.canCall) {
        this.callBtn.text.setText(`CALL $${state.callAmount}`);
      } else {
        this.callBtn.text.setText('CALL');
      }
      this.setButtonVisible(this.raiseBtn, true);
      this.setButtonEnabled(this.raiseBtn, state.canRaise);
      this.setButtonVisible(this.foldBtn, true);
      this.setButtonEnabled(this.foldBtn, state.canFold);
      this.setButtonVisible(this.allInBtn, true);
      this.setButtonEnabled(this.allInBtn, state.canAllIn);

      // Raise controls
      if (state.canRaise) {
        for (const btn of this.raisePresetBtns) {
          this.setButtonVisible(btn, true);
        }
        this.raiseAmountText.setVisible(true);
        this.raiseAmount = state.minRaise;
        this.raiseAmountText.setText(`Raise: $${this.raiseAmount}`);
      }
    }

    if (state.isDrawPhase && state.canDiscard) {
      this.setButtonVisible(this.discardBtn, true);
      this.setButtonVisible(this.standPatBtn, true);
      this.discardBtn.text.setText(this.selectedCards.size > 0
        ? `DISCARD (${this.selectedCards.size}/${state.maxDiscards})`
        : `DISCARD (max ${state.maxDiscards})`);
    }
  }

  // --- Draw Individual Player ---

  private drawPlayer(player: PokerPlayer, cx: number, cy: number, state: PokerVisualState, isMe: boolean): void {
    // Active player glow (works for both draw and stud betting phases)
    if (player.isActive && (state.isBetting || state.isDrawPhase)) {
      this.drawActiveGlow(cx, cy);
    }

    // AI avatar
    if (!isMe) {
      const avatar = getAvatarConfig(player.name);
      const ax = cx;
      const r = 36;
      const ay = Math.max(r + 4, cy - 122);
      const borderColor = player.isActive ? 0xffd700 : 0xd4a847;
      const imageKey = `avatar_${player.name}`;
      const hasSprite = this.textures.exists(imageKey);

      if (hasSprite) {
        this.trackDynamic(
          this.add.image(ax, ay, imageKey)
            .setDisplaySize(r * 2, r * 2)
            .setDepth(10)
            .setAlpha(player.folded ? 0.4 : 1)
        );
      } else {
        // Fallback: colored circle with initial
        const gfx = this.trackDynamic(this.add.graphics().setDepth(10));
        gfx.lineStyle(2, borderColor, 1);
        gfx.strokeCircle(ax, ay, r);
        gfx.fillStyle(avatar.color, player.folded ? 0.4 : 1);
        gfx.fillCircle(ax, ay, r - 1);

        this.trackDynamic(
          this.add.text(ax, ay, avatar.initial, {
            fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
          }).setOrigin(0.5).setDepth(10).setAlpha(player.folded ? 0.4 : 1)
        );
      }
    }

    // Player name label
    const nameColor = player.isActive ? '#ffd700' : (player.folded ? '#666666' : '#d4a847');
    const nameStr = isMe ? 'YOU' : player.name;
    this.trackDynamic(
      this.add.text(cx, cy - 77, nameStr, {
        fontSize: '14px', color: nameColor, fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );

    // Dealer button
    if (player.isDealer) {
      const dbX = cx + 61;
      const dbY = cy - 61;
      const dbGfx = this.trackDynamic(this.add.graphics().setDepth(11));
      dbGfx.fillStyle(0xffffff);
      dbGfx.fillCircle(dbX, dbY, 11);
      dbGfx.fillStyle(0x000000);
      dbGfx.fillCircle(dbX, dbY, 9);
      this.trackDynamic(
        this.add.text(dbX, dbY, 'D', {
          fontSize: '11px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(12)
      );
    }

    // SB/BB badges (Hold'em)
    if (state.isHoldem) {
      const playerIdx = state.players.indexOf(player);
      const isSB = playerIdx === state.smallBlindIndex;
      const isBB = playerIdx === state.bigBlindIndex;
      if (isSB || isBB) {
        const badgeX = cx - 61;
        const badgeY = cy - 61;
        const badgeLabel = isSB ? 'SB' : 'BB';
        const badgeColor = isSB ? 0x1a4a8b : 0x8b6b1a;
        const badgeGfx = this.trackDynamic(this.add.graphics().setDepth(11));
        badgeGfx.fillStyle(badgeColor);
        badgeGfx.fillRoundedRect(badgeX - 14, badgeY - 9, 28, 18, 4);
        this.trackDynamic(
          this.add.text(badgeX, badgeY, badgeLabel, {
            fontSize: '10px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
          }).setOrigin(0.5).setDepth(12)
        );
      }
    }

    // Cards
    if (player.hand.length > 0 && !player.folded) {
      const handSize = player.hand.length;
      // Reduce card spacing for hands > 5 cards (stud)
      const cardSpacing = handSize > 5 ? 28 : this.CARD_SPACING;
      const totalW = this.CARD_W + (handSize - 1) * cardSpacing;
      const startX = cx - totalW / 2 + this.CARD_W / 2;

      // For "my" hand, use drag-sortable order
      if (isMe) {
        // Reset card order if hand size changed (new deal or after draw)
        if (handSize !== this.lastHandSize) {
          this.myCardOrder = Array.from({ length: handSize }, (_, i) => i);
          this.lastHandSize = handSize;
        }
        // Ensure order array matches hand size
        if (this.myCardOrder.length !== handSize) {
          this.myCardOrder = Array.from({ length: handSize }, (_, i) => i);
        }

        // Store slot X positions for drop target calculation
        this.myCardSlotXs = [];
        for (let i = 0; i < handSize; i++) {
          this.myCardSlotXs.push(startX + i * cardSpacing);
        }
      }

      // Stud: face-up (show) cards shift toward table center, hole cards stay at player baseline
      const TABLE_CENTER_Y = this.CANVAS_H / 2;
      const STUD_OFFSET = 18;

      for (let visualPos = 0; visualPos < handSize; visualPos++) {
        // For my hand, render in myCardOrder (but not for stud — no reorder); for others, render in order
        const canReorder = isMe && !state.isStud && !state.isHoldem;
        const actualIndex = canReorder ? this.myCardOrder[visualPos] : visualPos;
        const card = player.hand[actualIndex];
        // For human player in stud, hole cards keep faceDown for positioning but show face-up
        const key = (isMe && state.isStud && card.faceDown) ? this.getCardFaceKey(card) : this.getCardKey(card);
        const x = startX + visualPos * cardSpacing;
        // In stud, face-up cards shift toward center: up for bottom players, down for top players
        const cardY = (state.isStud && !card.faceDown) ? cy + (cy > TABLE_CENTER_Y ? -STUD_OFFSET : STUD_OFFSET) : cy;

        const sprite = this.trackDynamic(
          this.add.sprite(x, cardY, key)
            .setDisplaySize(this.CARD_W, this.CARD_H)
            .setDepth(5 + visualPos)
        );

        // Make my face-up cards draggable for sorting (not in stud — fixed order)
        if (isMe && !card.faceDown && !state.isStud && !state.isHoldem) {
          sprite.setInteractive({ useHandCursor: true, draggable: true });
          this.input.setDraggable(sprite);
          sprite.setData('draggable', true);
          sprite.setData('visualPos', visualPos);
          sprite.setData('actualIndex', actualIndex);
          this.cardSprites.push(sprite);

          // Card selection during draw phase (use pointerup to avoid conflict with drag)
          if (state.isDrawPhase && state.canDiscard) {
            sprite.on('pointerup', () => {
              if (!this.isDragging) {
                this.toggleCardSelection(actualIndex);
              }
            });
          }

          // Draw selection marker (uses actual hand index)
          if (this.selectedCards.has(actualIndex)) {
            const marker = this.trackDynamic(this.add.graphics().setDepth(15));
            marker.lineStyle(3, 0xe94560, 1);
            marker.strokeRoundedRect(x - this.CARD_W / 2 - 2, cy - this.CARD_H / 2 - 2, this.CARD_W + 4, this.CARD_H + 4, 4);
            this.trackDynamic(
              this.add.text(x, cy - this.CARD_H / 2 - 13, 'X', {
                fontSize: '15px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
              }).setOrigin(0.5).setDepth(16)
            );
            this.cardSelectionMarkers.push(marker);
          }
        }
      }
    }

    // Folded indicator
    if (player.folded) {
      this.trackDynamic(
        this.add.text(cx, cy, 'FOLDED', {
          fontSize: '15px', color: '#666666', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );
    }

    // All-in indicator
    if (player.allIn && !player.folded) {
      this.trackDynamic(
        this.add.text(cx, cy + this.CARD_H / 2 + 15, 'ALL IN', {
          fontSize: '13px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );
    }

    // Current bet display
    if (player.bet > 0 && !player.folded) {
      this.drawChipStack(cx, cy + this.CARD_H / 2 + 33, player.bet);
    }

    // Chips count
    this.trackDynamic(
      this.add.text(cx, cy + this.CARD_H / 2 + 61, `$${player.chips.toLocaleString()}`, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );

    // Hand result (showdown)
    if (player.handResult && state.isShowdown) {
      this.trackDynamic(
        this.add.text(cx, cy + this.CARD_H / 2 + 15, player.handResult.name, {
          fontSize: '13px', color: '#ffd700', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );
    }

    // Win/lose result
    if (player.result) {
      let resultText = '';
      let resultColor = '#ffffff';
      if (player.result === 'win') {
        resultText = `WIN +$${player.payout}`;
        resultColor = '#4caf50';
      } else if (player.result === 'split') {
        resultText = `SPLIT +$${player.payout}`;
        resultColor = '#d4a847';
      } else if (player.result === 'lose') {
        resultText = 'LOSE';
        resultColor = '#e94560';
      }
      if (resultText) {
        const ry = player.handResult && state.isShowdown ? cy + this.CARD_H / 2 + 33 : cy + this.CARD_H / 2 + 15;
        this.trackDynamic(
          this.add.text(cx, ry, resultText, {
            fontSize: '14px', color: resultColor, fontFamily: 'Arial', fontStyle: 'bold'
          }).setOrigin(0.5).setDepth(10)
        );
      }
    }
  }

  // --- Card Selection ---

  private toggleCardSelection(index: number): void {
    if (this.selectedCards.has(index)) {
      this.selectedCards.delete(index);
    } else {
      const max = this.currentState?.maxDiscards ?? 3;
      if (this.selectedCards.size < max) {
        this.selectedCards.add(index);
      }
    }
    // Re-render with updated selections
    if (this.currentState) {
      this.updateState(this.currentState);
    }
  }

  // --- Chip Stack ---

  private drawChipStack(x: number, y: number, bet: number): void {
    if (bet <= 0) return;
    const chipColors: { threshold: number; fill: number; edge: number }[] = [
      { threshold: 100, fill: 0x111111, edge: 0xd4a847 },
      { threshold: 50, fill: 0x1a6b37, edge: 0x4caf50 },
      { threshold: 25, fill: 0x8b1a1a, edge: 0xe94560 },
      { threshold: 10, fill: 0x1a4a8b, edge: 0x4a90d9 }
    ];

    const chips: { fill: number; edge: number }[] = [];
    let remaining = bet;
    for (const { threshold, fill, edge } of chipColors) {
      while (remaining >= threshold) {
        chips.push({ fill, edge });
        remaining -= threshold;
      }
    }

    const visible = chips.slice(0, 6);
    const chipR = 11;
    const stackGap = 3;

    for (let i = 0; i < visible.length; i++) {
      const cy = y - i * stackGap;
      const chip = visible[i];
      const g = this.trackDynamic(this.add.graphics().setDepth(6));
      g.fillStyle(chip.edge);
      g.fillEllipse(x, cy, chipR * 2, chipR);
      g.fillStyle(chip.fill);
      g.fillEllipse(x, cy - 1, (chipR - 2) * 2, chipR - 2);
    }

    this.trackDynamic(
      this.add.text(x, y + visible.length * stackGap / 2 + 11, `$${bet}`, {
        fontSize: '11px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(7)
    );
  }

  // --- Game Over ---

  public showGameOver(message: string): void {
    const cx = this.CANVAS_W / 2;
    const cy = this.CANVAS_H / 2;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, this.CANVAS_W, this.CANVAS_H);
    overlay.setDepth(90);
    this.gameOverElements.push(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(cx - 198, cy - 66, 396, 132, 12);
    panel.lineStyle(2, this.GOLD);
    panel.strokeRoundedRect(cx - 198, cy - 66, 396, 132, 12);
    panel.setDepth(91);
    this.gameOverElements.push(panel);

    const text = this.add.text(cx, cy - 17, message, {
      fontSize: '26px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(92);
    this.gameOverElements.push(text);

    const subText = this.add.text(cx, cy + 22, 'Out of chips!', {
      fontSize: '17px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(92);
    this.gameOverElements.push(subText);
  }

  // --- Reset ---

  public resetGame(): void {
    this.clearDynamic();
    this.clearActiveGlow();
    this.clearVariantSelect();
    this.clearWildCardSelect();
    this.clearBuyIn();
    this.wildToggleState.clear();
    this.selectedCards.clear();
    this.myCardOrder = [];
    this.myCardSlotXs = [];
    this.lastHandSize = 0;
    this.isDragging = false;
    this.gameOverElements.forEach(el => el.destroy());
    this.gameOverElements = [];
    if (this.messageText) this.messageText.setText('');
    if (this.messageBg) this.messageBg.clear();
    if (this.potText) this.potText.setText('');
    this.hideAllButtons();
  }
}
