import Phaser from 'phaser';

export interface BlackjackCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string; // 'A','2'...'10','J','Q','K'
  faceDown?: boolean;
}

export interface BlackjackPlayerHand {
  name: string;
  cards: BlackjackCard[];
  total: number;
  busted: boolean;
  blackjack: boolean;
  done: boolean;
  bet: number;
  chips: number;
  isActive: boolean;
  result?: string; // 'win','lose','push','blackjack'
  payout?: number;
}

export interface BlackjackVisualState {
  phase: 'betting' | 'dealing' | 'playerTurn' | 'dealerTurn' | 'settlement';
  dealer: {
    cards: BlackjackCard[];
    total: number;
    busted: boolean;
    blackjack: boolean;
    revealHole: boolean;
  };
  players: BlackjackPlayerHand[];
  myIndex: number;
  currentPlayerIndex: number;
  message: string;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canDeal: boolean;
  currentBet: number;
  isBetting: boolean;
}

export class BlackjackScene extends Phaser.Scene {
  private readonly CARD_W = 80;
  private readonly CARD_H = 112;
  private readonly CARD_OVERLAP = 25;
  private readonly CANVAS_W = 900;
  private readonly CANVAS_H = 680;

  // Casino colors
  private readonly FELT_GREEN = 0x1a6b37;
  private readonly RIM_BROWN = 0x5c2e0e;
  private readonly GOLD = 0xd4a847;
  private readonly DARK_BG = 0x0b0b15;

  // Dynamic elements for cleanup
  private dynamicElements: Phaser.GameObjects.GameObject[] = [];

  // Buttons
  private hitBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private standBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private doubleBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };

  // Betting UI
  private chipBtns: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone; amount: number }[] = [];
  private clearBetBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private dealBtn!: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };

  // Message banner
  private messageBg!: Phaser.GameObjects.Graphics;
  private messageText!: Phaser.GameObjects.Text;

  // Info texts
  private chipsText!: Phaser.GameObjects.Text;

  // Active player glow
  private glowGraphics!: Phaser.GameObjects.Graphics;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private glowAlpha = 0;

  // Game over overlay
  private gameOverElements: Phaser.GameObjects.GameObject[] = [];

  // Callbacks
  public onHitClick: (() => void) | null = null;
  public onStandClick: (() => void) | null = null;
  public onDoubleDownClick: (() => void) | null = null;
  public onDealClick: (() => void) | null = null;
  public onBetChange: ((amount: number) => void) | null = null;
  public onClearBet: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'BlackjackScene' });
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
  }

  create(): void {
    this.drawTable();
    this.createMessage();
    this.createActionButtons();
    this.createBettingUI();
    this.createInfoTexts();
    this.glowGraphics = this.add.graphics().setDepth(4);

    // Hide action buttons by default
    this.setButtonVisible(this.hitBtn, false);
    this.setButtonVisible(this.standBtn, false);
    this.setButtonVisible(this.doubleBtn, false);

    if (this.onReady) this.onReady();
  }

  // --- Casino Table ---

  private drawTable(): void {
    const gfx = this.add.graphics().setDepth(0);
    const cx = this.CANVAS_W / 2;

    // Table rim (brown wood border) — semi-ellipse
    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillEllipse(cx, 340, 860, 560);
    // Flat bottom cut — cover the lower half of the ellipse past the player area
    gfx.fillStyle(this.DARK_BG);
    gfx.fillRect(0, 540, this.CANVAS_W, 140);

    // Felt interior — slightly smaller ellipse
    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillEllipse(cx, 340, 830, 530);
    // Same flat bottom cut for felt
    gfx.fillStyle(this.DARK_BG);
    gfx.fillRect(0, 530, this.CANVAS_W, 150);

    // Felt bottom edge — straight line with slight padding
    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillRect(45, 490, 810, 40);

    // Rim bottom edge
    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillRect(35, 525, 830, 10);

    // Gold accent line — separates dealer zone from player zone
    gfx.lineStyle(2, this.GOLD, 0.6);
    gfx.beginPath();
    gfx.arc(cx, 340, 200, Math.PI * 1.15, Math.PI * 1.85, false);
    gfx.strokePath();

    // Decorative text on felt
    this.add.text(cx, 230, 'BLACKJACK PAYS 3 TO 2', {
      fontSize: '13px', color: '#2a8f4f', fontFamily: 'Georgia', fontStyle: 'italic'
    }).setOrigin(0.5).setDepth(1).setAlpha(0.7);

    this.add.text(cx, 250, 'INSURANCE PAYS 2 TO 1', {
      fontSize: '11px', color: '#2a8f4f', fontFamily: 'Georgia', fontStyle: 'italic'
    }).setOrigin(0.5).setDepth(1).setAlpha(0.5);

    // Dealer area label
    this.add.text(cx, 72, 'DEALER', {
      fontSize: '12px', color: '#d4a847', fontFamily: 'Georgia', letterSpacing: 6
    }).setOrigin(0.5).setDepth(1).setAlpha(0.5);
  }

  // --- Message Banner ---

  private createMessage(): void {
    const cx = this.CANVAS_W / 2;
    this.messageBg = this.add.graphics().setDepth(19);
    this.messageText = this.add.text(cx, 280, '', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
  }

  private drawMessageBg(text: string, color: number = 0x16213e): void {
    this.messageBg.clear();
    if (!text) return;
    const cx = this.CANVAS_W / 2;
    const w = Math.max(text.length * 10 + 40, 200);
    this.messageBg.fillStyle(0x000000, 0.5);
    this.messageBg.fillRoundedRect(cx - w / 2, 262, w, 36, 8);
    this.messageBg.fillStyle(color, 0.85);
    this.messageBg.fillRoundedRect(cx - w / 2, 262, w, 36, 8);
    this.messageBg.lineStyle(1, this.GOLD, 0.5);
    this.messageBg.strokeRoundedRect(cx - w / 2, 262, w, 36, 8);
  }

  // --- Action Buttons ---

  private createActionButtons(): void {
    const y = 580;
    const btnW = 130;
    const btnH = 40;
    const gap = 16;
    const totalW = btnW * 3 + gap * 2;
    const startX = this.CANVAS_W / 2 - totalW / 2 + btnW / 2;

    this.hitBtn = this.createButton(startX, y, btnW, btnH, 'HIT', 0x8b1a1a, () => {
      if (this.onHitClick) this.onHitClick();
    });

    this.standBtn = this.createButton(startX + btnW + gap, y, btnW, btnH, 'STAND', 0x1a4a8b, () => {
      if (this.onStandClick) this.onStandClick();
    });

    this.doubleBtn = this.createButton(startX + (btnW + gap) * 2, y, btnW, btnH, 'DOUBLE', 0x1a6b37, () => {
      if (this.onDoubleDownClick) this.onDoubleDownClick();
    });
  }

  // --- Betting UI ---

  private createBettingUI(): void {
    const y = 620;
    const chipAmounts = [10, 25, 50, 100];
    const chipRadius = 24;
    const gap = 14;
    const chipColors: Record<number, { fill: number; edge: number }> = {
      10: { fill: 0x1a4a8b, edge: 0x4a90d9 },
      25: { fill: 0x8b1a1a, edge: 0xe94560 },
      50: { fill: 0x1a6b37, edge: 0x4caf50 },
      100: { fill: 0x111111, edge: 0xd4a847 }
    };

    const totalChipW = chipAmounts.length * (chipRadius * 2) + (chipAmounts.length - 1) * gap;
    const clearW = 56;
    const dealW = 76;
    const totalW = totalChipW + gap * 2 + clearW + gap + dealW;
    let startX = this.CANVAS_W / 2 - totalW / 2 + chipRadius;

    for (const amount of chipAmounts) {
      const x = startX;
      const colors = chipColors[amount];
      const btn = this.createCircularChipButton(x, y, chipRadius, `$${amount}`, colors.fill, colors.edge, amount);
      this.chipBtns.push(btn);
      startX += chipRadius * 2 + gap;
    }

    startX += gap;
    this.clearBetBtn = this.createButton(startX + clearW / 2, y, clearW, 36, 'Clear', 0x444444, () => {
      if (this.onClearBet) this.onClearBet();
    });
    startX += clearW + gap;

    this.dealBtn = this.createButton(startX + dealW / 2, y, dealW, 36, 'DEAL', 0x8b1a1a, () => {
      if (this.onDealClick) this.onDealClick();
    });
  }

  // --- Info Texts ---

  private createInfoTexts(): void {
    this.chipsText = this.add.text(30, 650, 'Chips: 1,000', {
      fontSize: '15px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
    }).setDepth(25);
  }

  // --- Button Helpers ---

  private createButton(
    x: number, y: number, w: number, h: number,
    label: string, color: number, onClick: () => void
  ): { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone } {
    const bg = this.add.graphics().setDepth(25);
    this.drawBtnBg(bg, x, y, w, h, color);

    const text = this.add.text(x, y, label, {
      fontSize: '15px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26);

    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(27);
    zone.on('pointerdown', onClick);
    zone.on('pointerover', () => this.drawBtnBg(bg, x, y, w, h, Phaser.Display.Color.IntegerToColor(color).lighten(25).color));
    zone.on('pointerout', () => this.drawBtnBg(bg, x, y, w, h, color));

    return { bg, text, zone };
  }

  private createCircularChipButton(
    x: number, y: number, radius: number,
    label: string, fillColor: number, edgeColor: number, amount: number
  ): { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone; amount: number } {
    const bg = this.add.graphics().setDepth(25);
    this.drawCircularChip(bg, x, y, radius, fillColor, edgeColor);

    const text = this.add.text(x, y, label, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(26);

    const zone = this.add.zone(x, y, radius * 2, radius * 2).setInteractive({ useHandCursor: true }).setDepth(27);
    zone.on('pointerdown', () => {
      if (this.onBetChange) this.onBetChange(amount);
    });
    zone.on('pointerover', () => this.drawCircularChip(bg, x, y, radius, Phaser.Display.Color.IntegerToColor(fillColor).lighten(30).color, edgeColor));
    zone.on('pointerout', () => this.drawCircularChip(bg, x, y, radius, fillColor, edgeColor));

    return { bg, text, zone, amount };
  }

  private drawBtnBg(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    gfx.lineStyle(1, 0xffffff, 0.15);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }

  private drawCircularChip(gfx: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, fillColor: number, edgeColor: number): void {
    gfx.clear();
    // Outer ring
    gfx.fillStyle(edgeColor);
    gfx.fillCircle(x, y, radius);
    // Inner fill
    gfx.fillStyle(fillColor);
    gfx.fillCircle(x, y, radius - 3);
    // Inner decoration ring
    gfx.lineStyle(1, edgeColor, 0.6);
    gfx.strokeCircle(x, y, radius - 7);
    // Cross dashes on edge
    const dashLen = 4;
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = (angle * Math.PI) / 180;
      const r1 = radius - 5;
      const r2 = radius - 1;
      gfx.lineStyle(2, 0xffffff, 0.4);
      gfx.beginPath();
      gfx.moveTo(x + Math.cos(rad) * r1, y + Math.sin(rad) * r1);
      gfx.lineTo(x + Math.cos(rad) * r2, y + Math.sin(rad) * r2);
      gfx.strokePath();
    }
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

  // --- Card Helpers ---

  private getCardKey(card: BlackjackCard): string {
    if (card.faceDown) return 'cardBack_blue';
    const suitMap: Record<string, string> = {
      hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades'
    };
    return `card${suitMap[card.suit]}${card.value}`;
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

  // --- Player Arc Positions ---

  private getPlayerPositions(count: number): { x: number; y: number }[] {
    if (count === 1) return [{ x: 450, y: 410 }];
    if (count === 2) return [{ x: 280, y: 420 }, { x: 620, y: 420 }];
    if (count === 3) return [{ x: 180, y: 430 }, { x: 450, y: 410 }, { x: 720, y: 430 }];
    return [{ x: 130, y: 435 }, { x: 320, y: 418 }, { x: 580, y: 418 }, { x: 770, y: 435 }];
  }

  // --- Betting Circle ---

  private drawBettingCircle(gfx: Phaser.GameObjects.Graphics, x: number, y: number, isActive: boolean, isBetting: boolean): void {
    const radius = 30;
    // Base circle
    gfx.lineStyle(2, this.GOLD, 0.6);
    gfx.strokeCircle(x, y + 75, radius);

    // Pulsing glow during betting phase
    if (isBetting && isActive) {
      gfx.lineStyle(3, this.GOLD, 0.3 + Math.sin(Date.now() / 300) * 0.2);
      gfx.strokeCircle(x, y + 75, radius + 4);
    }
  }

  // --- Chip Stack Visual ---

  private drawChipStack(x: number, y: number, bet: number): void {
    if (bet <= 0) return;
    const centerY = y + 75;
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

    // Draw stacked chips (max 8 visible, bottom to top)
    const visible = chips.slice(0, 8);
    const chipR = 14;
    const stackGap = 4;
    const startY = centerY + (visible.length - 1) * stackGap / 2;

    for (let i = 0; i < visible.length; i++) {
      const cy = startY - i * stackGap;
      const chip = visible[i];
      const g = this.trackDynamic(this.add.graphics().setDepth(6));
      // Shadow
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(x + 1, cy + 2, chipR * 2, chipR);
      // Edge
      g.fillStyle(chip.edge);
      g.fillEllipse(x, cy, chipR * 2, chipR);
      // Face
      g.fillStyle(chip.fill);
      g.fillEllipse(x, cy - 1, (chipR - 2) * 2, chipR - 2);
      // Deco line
      g.lineStyle(1, chip.edge, 0.5);
      g.strokeEllipse(x, cy - 1, (chipR - 5) * 2, chipR - 5);
    }

    // Bet amount label below stack
    this.trackDynamic(
      this.add.text(x, centerY + visible.length * stackGap / 2 + 14, `$${bet}`, {
        fontSize: '11px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(7)
    );
  }

  // --- Active Player Glow ---

  private drawActiveGlow(x: number, y: number): void {
    this.glowGraphics.clear();

    // Start or continue the pulsing tween
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
            this.glowGraphics.fillEllipse(x, y - 10, 180, 130);
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

  public updateState(state: BlackjackVisualState): void {
    this.clearDynamic();
    this.clearActiveGlow();

    // Draw dealer hand
    this.drawDealerHand(state);

    // Draw player hand(s) in arc positions
    const positions = this.getPlayerPositions(state.players.length);
    for (let i = 0; i < state.players.length; i++) {
      const pos = positions[i];
      this.drawPlayerHand(state.players[i], pos.x, pos.y, state);
    }

    // Update message
    this.messageText.setText(state.message);
    if (state.message) {
      let msgColor = 0x16213e;
      if (state.message.includes('Win') || state.message.includes('Blackjack') || state.message.includes('win')) msgColor = 0x2e7d32;
      else if (state.message.includes('Bust') || state.message.includes('Lose') || state.message.includes('lose')) msgColor = 0x8b0000;
      else if (state.message.includes('Push')) msgColor = 0x555555;
      this.drawMessageBg(state.message, msgColor);
    } else {
      this.messageBg.clear();
    }

    // Update chips display
    const myPlayer = state.players[state.myIndex];
    if (myPlayer) {
      this.chipsText.setText(`Chips: ${myPlayer.chips.toLocaleString()}`);
    }

    // Show/hide action buttons
    const showActions = state.phase === 'playerTurn';
    this.setButtonVisible(this.hitBtn, showActions);
    this.setButtonVisible(this.standBtn, showActions);
    this.setButtonVisible(this.doubleBtn, showActions);
    if (showActions) {
      this.setButtonEnabled(this.hitBtn, state.canHit);
      this.setButtonEnabled(this.standBtn, state.canStand);
      this.setButtonEnabled(this.doubleBtn, state.canDouble);
    }

    // Show/hide betting UI
    const showBetting = state.isBetting;
    for (const chip of this.chipBtns) {
      chip.bg.setVisible(showBetting);
      chip.text.setVisible(showBetting);
      if (showBetting) chip.zone.setInteractive({ useHandCursor: true });
      else chip.zone.disableInteractive();
    }
    this.clearBetBtn.bg.setVisible(showBetting);
    this.clearBetBtn.text.setVisible(showBetting);
    if (showBetting) this.clearBetBtn.zone.setInteractive({ useHandCursor: true });
    else this.clearBetBtn.zone.disableInteractive();

    this.dealBtn.bg.setVisible(showBetting && state.canDeal);
    this.dealBtn.text.setVisible(showBetting && state.canDeal);
    if (showBetting && state.canDeal) this.dealBtn.zone.setInteractive({ useHandCursor: true });
    else this.dealBtn.zone.disableInteractive();
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

  // --- Draw Dealer Hand ---

  private drawDealerHand(state: BlackjackVisualState): void {
    const dealer = state.dealer;
    if (dealer.cards.length === 0) return;

    const cx = this.CANVAS_W / 2;

    // Dealer label
    const labelText = dealer.revealHole && dealer.total > 0
      ? `DEALER  [${dealer.total}]`
      : 'DEALER';
    this.trackDynamic(
      this.add.text(cx, 95, labelText, {
        fontSize: '15px', color: '#d4a847', fontFamily: 'Georgia', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );

    // Draw cards
    const totalW = this.CARD_W + (dealer.cards.length - 1) * this.CARD_OVERLAP;
    const startX = cx - totalW / 2 + this.CARD_W / 2;

    for (let i = 0; i < dealer.cards.length; i++) {
      const card = dealer.cards[i];
      const key = this.getCardKey(card);
      const x = startX + i * this.CARD_OVERLAP;
      this.trackDynamic(
        this.add.sprite(x, 160, key)
          .setDisplaySize(this.CARD_W, this.CARD_H)
          .setDepth(5 + i)
      );
    }

    // Busted/blackjack indicator
    if (dealer.busted) {
      this.trackDynamic(
        this.add.text(cx, 228, 'BUST!', {
          fontSize: '14px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );
    } else if (dealer.blackjack) {
      this.trackDynamic(
        this.add.text(cx, 228, 'BLACKJACK!', {
          fontSize: '14px', color: '#ffd700', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );
    }
  }

  // --- Draw Player Hand ---

  private drawPlayerHand(player: BlackjackPlayerHand, cx: number, cy: number, state: BlackjackVisualState): void {
    if (player.cards.length === 0 && state.phase === 'betting') {
      // Still draw betting circle during betting
      const bettingGfx = this.trackDynamic(this.add.graphics().setDepth(3));
      this.drawBettingCircle(bettingGfx, cx, cy, true, state.isBetting);

      // Draw chip stack for current bet if this is our player
      if (state.isBetting && player === state.players[state.myIndex]) {
        this.drawChipStack(cx, cy, state.currentBet);
      }

      // Player name during betting
      this.trackDynamic(
        this.add.text(cx, cy - 20, player.name, {
          fontSize: '13px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );

      // Chips count
      this.trackDynamic(
        this.add.text(cx, cy + 115, `$${player.chips.toLocaleString()}`, {
          fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial'
        }).setOrigin(0.5).setDepth(10)
      );
      return;
    }

    // Active player glow
    if (player.isActive && state.phase === 'playerTurn') {
      this.drawActiveGlow(cx, cy);
    }

    // Player label with total
    const totalStr = player.cards.length > 0 ? ` [${player.total}]` : '';
    const labelColor = player.isActive ? '#ffd700' : '#d4a847';
    this.trackDynamic(
      this.add.text(cx, cy - 75, `${player.name}${totalStr}`, {
        fontSize: '13px', color: labelColor, fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(10)
    );

    // Draw cards
    if (player.cards.length > 0) {
      const totalW = this.CARD_W + (player.cards.length - 1) * this.CARD_OVERLAP;
      const startX = cx - totalW / 2 + this.CARD_W / 2;

      for (let i = 0; i < player.cards.length; i++) {
        const card = player.cards[i];
        const key = this.getCardKey(card);
        const x = startX + i * this.CARD_OVERLAP;
        this.trackDynamic(
          this.add.sprite(x, cy, key)
            .setDisplaySize(this.CARD_W, this.CARD_H)
            .setDepth(5 + i)
        );
      }
    }

    // Betting circle (always visible behind cards)
    const bettingGfx = this.trackDynamic(this.add.graphics().setDepth(3));
    this.drawBettingCircle(bettingGfx, cx, cy, player.isActive, state.isBetting);

    // Chip stack for bet
    this.drawChipStack(cx, cy, player.bet);

    // Status below cards
    let statusText = '';
    let statusColor = '#ffffff';
    if (player.busted) {
      statusText = 'BUST!';
      statusColor = '#e94560';
    } else if (player.blackjack) {
      statusText = 'BLACKJACK!';
      statusColor = '#ffd700';
    } else if (player.result === 'win') {
      statusText = `WIN +$${player.payout}`;
      statusColor = '#4caf50';
    } else if (player.result === 'blackjack') {
      statusText = `BLACKJACK! +$${player.payout}`;
      statusColor = '#ffd700';
    } else if (player.result === 'lose') {
      statusText = `LOSE -$${player.bet}`;
      statusColor = '#e94560';
    } else if (player.result === 'push') {
      statusText = 'PUSH';
      statusColor = '#aaaaaa';
    }

    if (statusText) {
      this.trackDynamic(
        this.add.text(cx, cy + this.CARD_H / 2 + 16, statusText, {
          fontSize: '13px', color: statusColor, fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(10)
      );
    }

    // Chips count below everything
    this.trackDynamic(
      this.add.text(cx, cy + 115, `$${player.chips.toLocaleString()}`, {
        fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(10)
    );
  }

  // --- Deal Animation ---

  public animateDeal(cards: { target: 'player' | 'dealer'; card: BlackjackCard; playerIndex?: number }[], callback: () => void): void {
    let delay = 0;
    const delayStep = 300;

    for (const dealInfo of cards) {
      this.time.delayedCall(delay, () => {
        const key = this.getCardKey(dealInfo.card);
        let targetX: number;
        let targetY: number;

        if (dealInfo.target === 'dealer') {
          targetX = this.CANVAS_W / 2;
          targetY = 160;
        } else {
          const pos = this.getPlayerPositions(1)[0];
          targetX = pos.x;
          targetY = pos.y;
        }

        const sprite = this.add.sprite(this.CANVAS_W / 2, -50, key);
        sprite.setDisplaySize(this.CARD_W, this.CARD_H);
        sprite.setDepth(50);
        this.trackDynamic(sprite);

        this.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          duration: 250,
          ease: 'Power2'
        });
      });
      delay += delayStep;
    }

    this.time.delayedCall(delay + 100, callback);
  }

  // --- Dealer Reveal Animation ---

  public animateDealerReveal(callback: () => void): void {
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 300,
      onComplete: () => {
        callback();
      }
    });
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
    panel.fillRoundedRect(cx - 180, cy - 60, 360, 120, 12);
    panel.lineStyle(2, this.GOLD);
    panel.strokeRoundedRect(cx - 180, cy - 60, 360, 120, 12);
    panel.setDepth(91);
    this.gameOverElements.push(panel);

    const text = this.add.text(cx, cy - 15, message, {
      fontSize: '24px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(92);
    this.gameOverElements.push(text);

    const subText = this.add.text(cx, cy + 20, 'Out of chips!', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(92);
    this.gameOverElements.push(subText);
  }

  // --- Reset ---

  public resetGame(): void {
    this.clearDynamic();
    this.clearActiveGlow();
    this.gameOverElements.forEach(el => el.destroy());
    this.gameOverElements = [];
    this.messageText.setText('');
    this.messageBg.clear();
  }
}
