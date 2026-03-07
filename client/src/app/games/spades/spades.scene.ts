import Phaser from 'phaser';
import { AI_NAMES, getAvatarConfig } from '../../core/ai/ai-names';
import {
  SpadesVisualState, SpadesCard, Suit, TrickCard,
  SUIT_ORDER, CARD_VALUES, PlayerBid
} from './spades-types';

export class SpadesScene extends Phaser.Scene {
  private readonly CANVAS_W = 990;
  private readonly CANVAS_H = 748;
  private readonly CARD_W = 88;
  private readonly CARD_H = 122;
  private readonly CARD_OVERLAP = 18;
  private readonly OPP_CARD_W = 40;
  private readonly OPP_CARD_H = 56;
  private readonly AVATAR_R = 26;

  // Casino colors
  private readonly FELT_GREEN = 0x1a6b37;
  private readonly RIM_BROWN = 0x5c2e0e;
  private readonly GOLD = 0xd4a847;

  // Dynamic elements for cleanup
  private dynamicElements: Phaser.GameObjects.GameObject[] = [];

  // Bid UI elements (created on demand, tracked in dynamic)
  // Message
  private messageBg!: Phaser.GameObjects.Graphics;
  private messageText!: Phaser.GameObjects.Text;

  // Callbacks
  public onReady: (() => void) | null = null;
  public onCardClick: ((handIndex: number) => void) | null = null;
  public onBidSelect: ((bid: number) => void) | null = null;

  // Trick area positions (diamond layout, center of canvas)
  private readonly TRICK_POS: Record<number, { x: number; y: number }> = {
    0: { x: 495, y: 420 },  // bottom (human)
    1: { x: 395, y: 355 },  // left (opp)
    2: { x: 495, y: 290 },  // top (partner)
    3: { x: 595, y: 355 },  // right (opp)
  };

  // Player seat layout positions
  private readonly SEAT_POS: Record<number, { x: number; y: number }> = {
    0: { x: 495, y: 620 },  // bottom center (human)
    1: { x: 100, y: 374 },  // left
    2: { x: 495, y: 90 },   // top
    3: { x: 890, y: 374 },  // right
  };

  constructor() {
    super({ key: 'SpadesScene' });
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

    const avatarPath = 'assets/sprites/board-game/avatars/images/';
    for (const name of AI_NAMES) {
      this.load.image(`avatar_${name}`, avatarPath + `${name}.png`);
    }
  }

  create(): void {
    this.removeWhiteBackground();
    this.drawTable();
    this.createMessage();
    if (this.onReady) this.onReady();
  }

  // ──── table ────

  private drawTable(): void {
    const gfx = this.add.graphics().setDepth(0);
    const cx = this.CANVAS_W / 2;
    const cy = 370;

    gfx.fillStyle(this.RIM_BROWN);
    gfx.fillEllipse(cx, cy, 920, 520);
    gfx.fillStyle(this.FELT_GREEN);
    gfx.fillEllipse(cx, cy, 888, 488);

    gfx.lineStyle(2, this.GOLD, 0.35);
    gfx.strokeEllipse(cx, cy, 640, 320);

    this.add.text(cx, cy - 10, 'SPADES', {
      fontSize: '14px', color: '#2a8f4f', fontFamily: 'Georgia', fontStyle: 'italic'
    }).setOrigin(0.5).setDepth(1).setAlpha(0.5);
  }

  // ──── message ────

  private createMessage(): void {
    const cx = this.CANVAS_W / 2;
    this.messageBg = this.add.graphics().setDepth(50);
    this.messageText = this.add.text(cx, 365, '', {
      fontSize: '17px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(51);
  }

  private setMessage(text: string, color: number = 0x16213e): void {
    if (!this.messageText) return;
    this.messageText.setText(text);
    this.messageBg.clear();
    if (!text) return;
    const cx = this.CANVAS_W / 2;
    const w = Math.max(text.length * 9 + 40, 180);
    this.messageBg.fillStyle(0x000000, 0.5);
    this.messageBg.fillRoundedRect(cx - w / 2, 348, w, 33, 8);
    this.messageBg.fillStyle(color, 0.85);
    this.messageBg.fillRoundedRect(cx - w / 2, 348, w, 33, 8);
    this.messageBg.lineStyle(1, this.GOLD, 0.5);
    this.messageBg.strokeRoundedRect(cx - w / 2, 348, w, 33, 8);
  }

  // ──── avatar helpers ────

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
      const d = imageData.data;
      for (let p = 0; p < d.length; p += 4) {
        if (d[p] >= 240 && d[p + 1] >= 240 && d[p + 2] >= 240) d[p + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      this.textures.remove(key);
      this.textures.addCanvas(key, canvas);
    }
  }

  private drawAvatar(x: number, y: number, name: string, isHuman: boolean, active: boolean): void {
    const r = this.AVATAR_R;
    const borderColor = active ? 0xffd700 : this.GOLD;

    const gfx = this.trackDynamic(this.add.graphics().setDepth(10));
    gfx.fillStyle(0x1a1a2e, 1);
    gfx.fillCircle(x, y, r);
    gfx.lineStyle(3, borderColor, 1);
    gfx.strokeCircle(x, y, r + 1);

    if (active) {
      const glowGfx = this.trackDynamic(this.add.graphics().setDepth(9));
      glowGfx.fillStyle(0xffd700, 0.2);
      glowGfx.fillCircle(x, y, r + 8);
    }

    if (isHuman) {
      gfx.fillStyle(0x2e7d32, 1);
      gfx.fillCircle(x, y, r - 2);
      this.trackDynamic(this.add.text(x, y, 'Y', {
        fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(11));
      return;
    }

    const imageKey = `avatar_${name}`;
    if (this.textures.exists(imageKey)) {
      const img = this.trackDynamic(
        this.add.image(x, y, imageKey).setDisplaySize(r * 2, r * 2).setDepth(10)
      );
      const maskGfx = this.make.graphics({});
      maskGfx.fillStyle(0xffffff);
      maskGfx.fillCircle(x, y, r - 1);
      img.setMask(maskGfx.createGeometryMask());
      this.trackDynamic(maskGfx as unknown as Phaser.GameObjects.GameObject);
    } else {
      const av = getAvatarConfig(name);
      gfx.fillStyle(av.color, 1);
      gfx.fillCircle(x, y, r - 2);
      this.trackDynamic(this.add.text(x, y, av.initial, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(11));
    }
  }

  // ──── card helper ────

  private getCardKey(card: SpadesCard): string {
    const suitMap: Record<string, string> = {
      hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades'
    };
    return `card${suitMap[card.suit]}${card.value}`;
  }

  // ──── dynamic element management ────

  private clearDynamic(): void {
    this.dynamicElements.forEach(el => el.destroy());
    this.dynamicElements = [];
  }

  private trackDynamic<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamicElements.push(obj);
    return obj;
  }

  // ──── button helper ────

  private createButton(
    x: number, y: number, w: number, h: number,
    label: string, color: number, onClick: () => void
  ): void {
    const bg = this.trackDynamic(this.add.graphics().setDepth(55));
    this.drawBtnBg(bg, x, y, w, h, color);

    this.trackDynamic(this.add.text(x, y, label, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(56));

    const zone = this.trackDynamic(
      this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(57)
    );
    zone.on('pointerdown', onClick);
    zone.on('pointerover', () => this.drawBtnBg(bg, x, y, w, h,
      Phaser.Display.Color.IntegerToColor(color).lighten(25).color));
    zone.on('pointerout', () => this.drawBtnBg(bg, x, y, w, h, color));
  }

  private drawBtnBg(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    gfx.lineStyle(1, 0xffffff, 0.15);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }

  // ──── main update ────

  public updateState(state: SpadesVisualState): void {
    this.clearDynamic();

    // Draw scores panel
    this.drawScores(state);

    // Draw player seats
    for (const p of state.players) {
      this.drawPlayerSeat(p, state);
    }

    // Draw human's hand
    if (state.phase !== 'setup' && state.phase !== 'gameOver') {
      this.drawHumanHand(state);
    }

    // Draw trick
    if (state.currentTrick.length > 0) {
      this.drawTrick(state.currentTrick);
    }

    // Draw bid UI
    if (state.phase === 'bidding' && state.blindNilOffer) {
      this.drawBlindNilOffer();
    } else if (state.phase === 'bidding' && state.currentPlayer === 0) {
      this.drawBidUI(state);
    }

    // Draw round summary overlay
    if (state.roundSummary) {
      this.drawRoundSummary(state);
    }

    // Draw game over
    if (state.phase === 'gameOver' && state.gameWinner) {
      this.drawGameOver(state.gameWinner, state.teamScores);
    }

    // Message
    this.setMessage(state.message, this.getMessageColor(state.message));
  }

  private getMessageColor(msg: string): number {
    if (!msg) return 0x16213e;
    if (msg.includes('win') || msg.includes('Win') || msg.includes('made')) return 0x2e7d32;
    if (msg.includes('lose') || msg.includes('Lose') || msg.includes('set')) return 0x8b0000;
    return 0x16213e;
  }

  // ──── scores panel ────

  private drawScores(state: SpadesVisualState): void {
    const x = 16;
    const y = 10;
    const w = 185;
    const h = 80;

    const bg = this.trackDynamic(this.add.graphics().setDepth(40));
    bg.fillStyle(0x0c0f1c, 0.9);
    bg.fillRoundedRect(x, y, w, h, 8);
    bg.lineStyle(1, this.GOLD, 0.3);
    bg.strokeRoundedRect(x, y, w, h, 8);

    this.trackDynamic(this.add.text(x + w / 2, y + 12, `Round ${state.round}`, {
      fontSize: '11px', color: '#888', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(41));

    const t0 = state.teamScores[0];
    const t1 = state.teamScores[1];

    this.trackDynamic(this.add.text(x + 10, y + 30, 'Your Team:', {
      fontSize: '12px', color: '#4caf50', fontFamily: 'Arial', fontStyle: 'bold'
    }).setDepth(41));
    this.trackDynamic(this.add.text(x + w - 10, y + 30, `${t0.score}  (${t0.bags} bags)`, {
      fontSize: '12px', color: '#ccc', fontFamily: 'Arial'
    }).setOrigin(1, 0).setDepth(41));

    this.trackDynamic(this.add.text(x + 10, y + 52, 'Opponents:', {
      fontSize: '12px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setDepth(41));
    this.trackDynamic(this.add.text(x + w - 10, y + 52, `${t1.score}  (${t1.bags} bags)`, {
      fontSize: '12px', color: '#ccc', fontFamily: 'Arial'
    }).setOrigin(1, 0).setDepth(41));
  }

  // ──── player seat ────

  private drawPlayerSeat(
    p: { name: string; seat: number; cardCount: number; bid: PlayerBid | null; tricksWon: number; isCurrentTurn: boolean; isHuman: boolean; isPartner: boolean },
    state: SpadesVisualState
  ): void {
    const pos = this.SEAT_POS[p.seat];
    const { x: cx, y: cy } = pos;

    // Avatar
    const avatarY = p.seat === 0 ? cy + 36 : cy - 36;
    this.drawAvatar(cx, avatarY, p.name, p.isHuman, p.isCurrentTurn);

    // Nameplate
    const plateY = p.seat === 0 ? cy + 72 : cy;
    let label = p.isHuman ? 'You' : p.name;
    if (p.isPartner && !p.isHuman) label += ' (Partner)';
    const labelColor = p.isCurrentTurn ? '#ffd700' : '#d4a847';

    this.trackDynamic(this.add.text(cx, plateY, label, {
      fontSize: '12px', color: labelColor, fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(11));

    // Bid display
    if (p.bid !== null) {
      const bidLabel = p.bid.blind ? 'BLIND NIL' : p.bid.amount === 0 ? 'NIL' : `Bid: ${p.bid.amount}`;
      const bidColor = p.bid.amount === 0 ? '#ff9800' : '#e0e0e0';
      // Seat 0 (you): show well above hand; Seat 2 (partner): show below cards; others: below name
      const bidY = p.seat === 0 ? cy - 46 : p.seat === 2 ? cy + 80 : plateY + 15;
      this.trackDynamic(this.add.text(cx, bidY, bidLabel, {
        fontSize: '12px', color: bidColor, fontFamily: 'Arial', fontStyle: 'bold',
        shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
      }).setOrigin(0.5).setDepth(11));

      // Tricks won
      if (state.phase === 'playing' || state.phase === 'trickEnd') {
        this.trackDynamic(this.add.text(cx, bidY + 16, `Tricks: ${p.tricksWon}`, {
          fontSize: '11px', color: '#e0e0e0', fontFamily: 'Arial',
          shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5).setDepth(11));
      }
    }

    // Face-down cards for AI players
    if (!p.isHuman && p.cardCount > 0 && state.phase !== 'gameOver') {
      this.drawFaceDownCards(p.seat, p.cardCount);
    }
  }

  private drawFaceDownCards(seat: number, count: number): void {
    const pos = this.SEAT_POS[seat];
    const isVertical = seat === 1 || seat === 3;
    const cw = this.OPP_CARD_W;
    const ch = this.OPP_CARD_H;

    if (isVertical) {
      // Vertical fan
      const overlap = 8;
      const totalH = ch + (count - 1) * overlap;
      const startY = pos.y - totalH / 2;
      const offsetX = seat === 1 ? 70 : -70;
      for (let i = 0; i < count; i++) {
        this.trackDynamic(
          this.add.sprite(pos.x + offsetX, startY + i * overlap + ch / 2, 'cardBack_blue')
            .setDisplaySize(cw, ch)
            .setDepth(5 + i)
        );
      }
    } else {
      // Horizontal fan (top)
      const overlap = 10;
      const totalW = cw + (count - 1) * overlap;
      const startX = pos.x - totalW / 2 + cw / 2;
      const offsetY = seat === 2 ? 40 : -40;
      for (let i = 0; i < count; i++) {
        this.trackDynamic(
          this.add.sprite(startX + i * overlap, pos.y + offsetY, 'cardBack_blue')
            .setDisplaySize(cw, ch)
            .setDepth(5 + i)
        );
      }
    }
  }

  // ──── human hand ────

  private drawHumanHand(state: SpadesVisualState): void {
    const hand = state.humanHand;
    if (hand.length === 0) return;

    const y = this.CANVAS_H - 90;
    const totalW = this.CARD_W + (hand.length - 1) * this.CARD_OVERLAP;
    const startX = this.CANVAS_W / 2 - totalW / 2 + this.CARD_W / 2;
    const isPlayPhase = state.phase === 'playing' && state.currentPlayer === 0;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      const key = this.getCardKey(card);
      const x = startX + i * this.CARD_OVERLAP;
      const isLegal = state.legalIndices.includes(i);
      const cardY = isPlayPhase && isLegal ? y - 6 : y;

      const sprite = this.trackDynamic(
        this.add.sprite(x, cardY, key)
          .setDisplaySize(this.CARD_W, this.CARD_H)
          .setDepth(20 + i)
      );

      if (isPlayPhase && isLegal) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => {
          if (this.onCardClick) this.onCardClick(i);
        });
        sprite.on('pointerover', () => sprite.setY(cardY - 8));
        sprite.on('pointerout', () => sprite.setY(cardY));
      } else if (isPlayPhase && !isLegal) {
        sprite.setAlpha(0.4);
      }
    }
  }

  // ──── trick display ────

  private drawTrick(trick: TrickCard[]): void {
    for (const t of trick) {
      const pos = this.TRICK_POS[t.seat];
      const key = this.getCardKey(t.card);
      this.trackDynamic(
        this.add.sprite(pos.x, pos.y, key)
          .setDisplaySize(this.CARD_W, this.CARD_H)
          .setDepth(30)
      );
    }
  }

  // ──── bid UI ────

  private drawBlindNilOffer(): void {
    const cx = this.CANVAS_W / 2;
    const baseY = 400;
    const panelW = 340;
    const panelH = 90;

    const bg = this.trackDynamic(this.add.graphics().setDepth(54));
    bg.fillStyle(0x0c0f1c, 0.95);
    bg.fillRoundedRect(cx - panelW / 2, baseY - 10, panelW, panelH, 10);
    bg.lineStyle(1, this.GOLD, 0.4);
    bg.strokeRoundedRect(cx - panelW / 2, baseY - 10, panelW, panelH, 10);

    this.trackDynamic(this.add.text(cx, baseY + 10, 'Bid Blind Nil? (+200 / -200)', {
      fontSize: '14px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(55));

    this.createButton(cx - 70, baseY + 50, 110, 32, 'BLIND NIL', 0x6b1a6b, () => {
      if (this.onBidSelect) this.onBidSelect(-1);
    });
    this.createButton(cx + 70, baseY + 50, 110, 32, 'No Thanks', 0x444444, () => {
      if (this.onBidSelect) this.onBidSelect(-2); // -2 = decline
    });
  }

  private drawBidUI(state: SpadesVisualState): void {
    const cx = this.CANVAS_W / 2;
    const baseY = 440;

    // Panel background
    const panelW = 500;
    const panelH = 115;
    const bg = this.trackDynamic(this.add.graphics().setDepth(54));
    bg.fillStyle(0x0c0f1c, 0.95);
    bg.fillRoundedRect(cx - panelW / 2, baseY - 10, panelW, panelH, 10);
    bg.lineStyle(1, this.GOLD, 0.4);
    bg.strokeRoundedRect(cx - panelW / 2, baseY - 10, panelW, panelH, 10);

    this.trackDynamic(this.add.text(cx, baseY + 5, 'Your Bid', {
      fontSize: '14px', color: '#d4a847', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(55));

    // Number buttons 1-13
    const btnW = 32;
    const btnH = 28;
    const gap = 4;
    const totalBtnW = 13 * btnW + 12 * gap;
    let startX = cx - totalBtnW / 2 + btnW / 2;
    const numY = baseY + 35;

    for (let n = 1; n <= 13; n++) {
      const bx = startX + (n - 1) * (btnW + gap);
      this.createButton(bx, numY, btnW, btnH, `${n}`, 0x1a4a8b, () => {
        if (this.onBidSelect) this.onBidSelect(n);
      });
    }

    // NIL button (blind nil already offered before cards were shown)
    const specialY = baseY + 73;
    this.createButton(cx, specialY, 110, 30, 'NIL', 0x8b1a1a, () => {
      if (this.onBidSelect) this.onBidSelect(0);
    });
  }

  // ──── round summary overlay ────

  private drawRoundSummary(state: SpadesVisualState): void {
    const s = state.roundSummary!;
    const cx = this.CANVAS_W / 2;
    const cy = this.CANVAS_H / 2;
    const panelW = 380;
    const panelH = 260;

    const overlay = this.trackDynamic(this.add.graphics().setDepth(80));
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, this.CANVAS_W, this.CANVAS_H);

    const panel = this.trackDynamic(this.add.graphics().setDepth(81));
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
    panel.lineStyle(2, this.GOLD);
    panel.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);

    this.trackDynamic(this.add.text(cx, cy - panelH / 2 + 25, `Round ${s.round} Results`, {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));

    const col1 = cx - 80;
    const col2 = cx + 80;
    let row = cy - panelH / 2 + 60;

    // Headers
    this.trackDynamic(this.add.text(col1, row, 'Your Team', {
      fontSize: '13px', color: '#4caf50', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));
    this.trackDynamic(this.add.text(col2, row, 'Opponents', {
      fontSize: '13px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));
    row += 25;

    // Bid / Tricks
    this.trackDynamic(this.add.text(col1, row, `Bid: ${s.teamBids[0]}  Won: ${s.teamTricks[0]}`, {
      fontSize: '12px', color: '#ccc', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(82));
    this.trackDynamic(this.add.text(col2, row, `Bid: ${s.teamBids[1]}  Won: ${s.teamTricks[1]}`, {
      fontSize: '12px', color: '#ccc', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(82));
    row += 22;

    // Points change
    const d0 = s.teamDeltas[0];
    const d1 = s.teamDeltas[1];
    const fmtDelta = (d: number) => d >= 0 ? `+${d}` : `${d}`;
    this.trackDynamic(this.add.text(col1, row, fmtDelta(d0), {
      fontSize: '14px', color: d0 >= 0 ? '#4caf50' : '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));
    this.trackDynamic(this.add.text(col2, row, fmtDelta(d1), {
      fontSize: '14px', color: d1 >= 0 ? '#4caf50' : '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));
    row += 25;

    // Nil results
    for (const nr of s.nilResults) {
      const nilLabel = nr.blind ? 'Blind Nil' : 'Nil';
      const resultText = nr.success ? `${nr.name}: ${nilLabel} SUCCESS!` : `${nr.name}: ${nilLabel} FAILED`;
      const resultColor = nr.success ? '#4caf50' : '#e94560';
      this.trackDynamic(this.add.text(cx, row, resultText, {
        fontSize: '12px', color: resultColor, fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(82));
      row += 18;
    }

    // Bag penalties
    for (let t = 0; t < 2; t++) {
      if (s.bagPenalty[t]) {
        const teamName = t === 0 ? 'Your Team' : 'Opponents';
        this.trackDynamic(this.add.text(cx, row, `${teamName}: BAG PENALTY -100!`, {
          fontSize: '12px', color: '#ff9800', fontFamily: 'Arial', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(82));
        row += 18;
      }
    }

    // Totals
    row = cy + panelH / 2 - 30;
    this.trackDynamic(this.add.text(col1, row, `Total: ${state.teamScores[0].score}`, {
      fontSize: '14px', color: '#fff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));
    this.trackDynamic(this.add.text(col2, row, `Total: ${state.teamScores[1].score}`, {
      fontSize: '14px', color: '#fff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82));
  }

  // ──── game over ────

  private drawGameOver(winner: string, scores: [{ score: number; bags: number }, { score: number; bags: number }]): void {
    const cx = this.CANVAS_W / 2;
    const cy = this.CANVAS_H / 2;

    const overlay = this.trackDynamic(this.add.graphics().setDepth(90));
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, this.CANVAS_W, this.CANVAS_H);

    const panel = this.trackDynamic(this.add.graphics().setDepth(91));
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(cx - 200, cy - 80, 400, 160, 12);
    panel.lineStyle(2, this.GOLD);
    panel.strokeRoundedRect(cx - 200, cy - 80, 400, 160, 12);

    const isWin = winner === 'Your Team';
    this.trackDynamic(this.add.text(cx, cy - 40, isWin ? 'YOU WIN!' : 'YOU LOSE', {
      fontSize: '28px', color: isWin ? '#4caf50' : '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(92));

    this.trackDynamic(this.add.text(cx, cy, `${winner} wins!`, {
      fontSize: '16px', color: '#ccc', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(92));

    this.trackDynamic(this.add.text(cx, cy + 35, `Your Team: ${scores[0].score}  |  Opponents: ${scores[1].score}`, {
      fontSize: '14px', color: '#aaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(92));
  }

  // ──── reset ────

  public resetGame(): void {
    this.clearDynamic();
    this.setMessage('');
  }
}
