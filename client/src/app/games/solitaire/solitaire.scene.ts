import Phaser from 'phaser';

export interface SolCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: number; // 1=Ace, 2-10, 11=J, 12=Q, 13=K
  faceUp: boolean;
}

export interface SolitaireVisualState {
  columns: SolCard[][];       // 7 columns
  foundations: SolCard[][];    // 4 foundation piles (spades, hearts, diamonds, clubs)
  drawPile: number;           // count of cards remaining in draw pile
  wastePile: SolCard[];       // visible waste cards
  gameOver: boolean;
  won: boolean;
}

export type CardLocation =
  | { type: 'column'; colIndex: number; cardIndex: number }
  | { type: 'waste' }
  | { type: 'foundation'; pileIndex: number }
  | { type: 'draw' };

export class SolitaireScene extends Phaser.Scene {
  private cardWidth = 120;
  private cardHeight = 168;
  private colSpacing = 130;
  private faceDownOverlap = 28;
  private faceUpOverlap = 42;
  private topRowY = 100;
  private columnsStartY = 275;
  private columnsStartX = 65;

  // All dynamic objects — destroyed on each re-render
  private dynamicElements: Phaser.GameObjects.GameObject[] = [];

  // Sprite tracking for drag (rebuilt each render)
  private columnCardSprites: Phaser.GameObjects.Sprite[][] = [];

  // Drag state
  private isDragging = false;
  private dragFrom: CardLocation | null = null;
  private dragSprites: Phaser.GameObjects.Sprite[] = [];
  private dragOriginalPositions: { x: number; y: number }[] = [];
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerDownLocation: CardLocation | null = null;
  private readonly DRAG_THRESHOLD = 6;

  // Target highlights shown during drag
  private targetHighlights: Phaser.GameObjects.Graphics[] = [];

  // Double-click detection
  private lastClickTime = 0;
  private lastClickLocation: CardLocation | null = null;
  private readonly DOUBLE_CLICK_MS = 350;

  // State
  private currentState: SolitaireVisualState | null = null;
  private previousWasteTopKey: string | null = null;

  // Callbacks
  public onReady: (() => void) | null = null;
  public onDrawClick: (() => void) | null = null;
  public onCardDrop: ((from: CardLocation, to: CardLocation) => void) | null = null;
  public onDoubleClick: ((location: CardLocation) => void) | null = null;
  public onGetValidTargets: ((from: CardLocation) => CardLocation[]) | null = null;

  constructor() {
    super({ key: 'SolitaireScene' });
  }

  preload(): void {
    const basePath = 'assets/sprites/board-game/cards/';
    this.load.image('cardBack_blue', basePath + 'cardBack_blue1.png');

    const suits = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    for (const suit of suits) {
      for (const value of values) {
        const key = `card${suit}${value}`;
        this.load.image(key, basePath + key + '.png');
      }
    }
  }

  create(): void {
    this.drawStaticLayout();

    // Scene-level pointer events for drag tracking
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));

    if (this.onReady) this.onReady();
  }

  // --- Static layout (drawn once) ---

  private drawStaticLayout(): void {
    this.drawCardOutline(this.columnsStartX, this.topRowY, 0x336633);

    const suitSymbols = ['♠', '♥', '♦', '♣'];
    const suitColors = [0xffffff, 0xff4444, 0xff4444, 0xffffff];
    for (let i = 0; i < 4; i++) {
      const fx = this.columnsStartX + (i + 3) * this.colSpacing;
      this.drawCardOutline(fx, this.topRowY, 0x335533);
      this.add.text(fx, this.topRowY, suitSymbols[i], {
        fontSize: '24px',
        color: suitColors[i] === 0xff4444 ? '#ff4444' : '#667766',
        fontFamily: 'Arial'
      }).setOrigin(0.5).setDepth(0);
    }
  }

  private drawCardOutline(x: number, y: number, color: number): void {
    const g = this.add.graphics();
    g.lineStyle(2, color, 0.5);
    g.strokeRoundedRect(x - this.cardWidth / 2, y - this.cardHeight / 2, this.cardWidth, this.cardHeight, 4);
  }

  // --- Card key helper ---

  public getCardKey(card: SolCard): string {
    const suitMap: Record<string, string> = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' };
    const valueMap: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    return `card${suitMap[card.suit]}${valueMap[card.value] || card.value.toString()}`;
  }

  // --- State update (full re-render) ---

  public updateState(state: SolitaireVisualState): void {
    this.currentState = state;
    this.cancelDrag();
    this.clearDynamic();
    this.renderAll(state);
  }

  private renderAll(state: SolitaireVisualState): void {
    this.columnCardSprites = [[], [], [], [], [], [], []];
    this.renderDrawPile(state.drawPile);
    this.renderWastePile(state.wastePile);
    this.renderFoundations(state.foundations);
    this.renderColumns(state.columns);
  }

  private clearDynamic(): void {
    for (const el of this.dynamicElements) el.destroy();
    this.dynamicElements = [];
  }

  private trackDynamic<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamicElements.push(obj);
    return obj;
  }

  // --- Render: draw pile ---

  private renderDrawPile(count: number): void {
    const x = this.columnsStartX;
    const y = this.topRowY;

    if (count > 0) {
      const sprite = this.trackDynamic(this.add.sprite(x, y, 'cardBack_blue'));
      sprite.setDisplaySize(this.cardWidth, this.cardHeight);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => { if (this.onDrawClick) this.onDrawClick(); });

      this.trackDynamic(this.add.text(x, y + this.cardHeight / 2 + 10, count.toString(), {
        fontSize: '12px', color: '#888', fontFamily: 'Arial'
      }).setOrigin(0.5));
    } else {
      const g = this.trackDynamic(this.add.graphics());
      g.lineStyle(2, 0x44aa44, 0.8);
      g.strokeRoundedRect(x - this.cardWidth / 2, y - this.cardHeight / 2, this.cardWidth, this.cardHeight, 4);

      this.trackDynamic(this.add.text(x, y, '↻', {
        fontSize: '32px', color: '#44aa44', fontFamily: 'Arial'
      }).setOrigin(0.5));

      const hitZone = this.trackDynamic(
        this.add.zone(x, y, this.cardWidth, this.cardHeight).setInteractive({ useHandCursor: true })
      );
      hitZone.on('pointerdown', () => { if (this.onDrawClick) this.onDrawClick(); });
    }
  }

  // --- Render: waste pile ---

  private renderWastePile(waste: SolCard[]): void {
    const x = this.columnsStartX + this.colSpacing;
    const y = this.topRowY;

    if (waste.length === 0) {
      this.previousWasteTopKey = null;
      return;
    }

    const card = waste[waste.length - 1];
    const cardKey = this.getCardKey(card);
    const isNewCard = cardKey !== this.previousWasteTopKey;
    this.previousWasteTopKey = cardKey;

    const sprite = this.trackDynamic(this.add.sprite(x, y, cardKey));
    sprite.setDisplaySize(this.cardWidth, this.cardHeight);
    sprite.setDepth(10);

    if (isNewCard) {
      sprite.setAlpha(0);
      this.tweens.add({
        targets: sprite,
        alpha: 1,
        duration: 250,
        ease: 'Power1'
      });
    }

    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.onCardPointerDown({ type: 'waste' }, pointer, [sprite]);
    });
  }

  // --- Render: foundations ---

  private renderFoundations(foundations: SolCard[][]): void {
    for (let i = 0; i < 4; i++) {
      const fx = this.columnsStartX + (i + 3) * this.colSpacing;
      const pile = foundations[i];

      if (pile.length > 0) {
        const topCard = pile[pile.length - 1];
        const sprite = this.trackDynamic(this.add.sprite(fx, this.topRowY, this.getCardKey(topCard)));
        sprite.setDisplaySize(this.cardWidth, this.cardHeight);
        sprite.setDepth(5);
        sprite.setInteractive({ useHandCursor: true });
        const pileIndex = i;
        sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          this.onCardPointerDown({ type: 'foundation', pileIndex }, pointer, [sprite]);
        });
      }
      // Empty foundations are drop targets only — detected via position in getDropTarget
    }
  }

  // --- Render: columns ---

  private renderColumns(columns: SolCard[][]): void {
    for (let col = 0; col < 7; col++) {
      const cards = columns[col];
      const x = this.columnsStartX + col * this.colSpacing;
      if (cards.length === 0) continue;

      let yOffset = 0;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const cardY = this.columnsStartY + yOffset;
        const key = card.faceUp ? this.getCardKey(card) : 'cardBack_blue';
        const sprite = this.trackDynamic(this.add.sprite(x, cardY, key));
        sprite.setDisplaySize(this.cardWidth, this.cardHeight);
        sprite.setDepth(20 + i);

        if (card.faceUp) {
          sprite.setInteractive({ useHandCursor: true });
          const colIndex = col;
          const cardIndex = i;
          sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Grab this card and everything below it in the column
            const stackSprites = this.columnCardSprites[colIndex].slice(cardIndex);
            this.onCardPointerDown({ type: 'column', colIndex, cardIndex }, pointer, stackSprites);
          });
        }

        this.columnCardSprites[col].push(sprite);
        yOffset += card.faceUp ? this.faceUpOverlap : this.faceDownOverlap;
      }
    }
  }

  // --- Drag & Drop ---

  private onCardPointerDown(location: CardLocation, pointer: Phaser.Input.Pointer, sprites: Phaser.GameObjects.Sprite[]): void {
    this.pointerDownLocation = location;
    this.pointerStartX = pointer.x;
    this.pointerStartY = pointer.y;
    this.dragFrom = location;
    this.dragSprites = sprites;
    this.dragOriginalPositions = sprites.map(s => ({ x: s.x, y: s.y }));
    this.isDragging = false;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerDownLocation || !this.dragFrom) return;

    const dx = pointer.x - this.pointerStartX;
    const dy = pointer.y - this.pointerStartY;

    if (!this.isDragging) {
      if (Math.abs(dx) > this.DRAG_THRESHOLD || Math.abs(dy) > this.DRAG_THRESHOLD) {
        this.isDragging = true;
        // Raise dragged sprites above everything
        for (let i = 0; i < this.dragSprites.length; i++) {
          this.dragSprites[i].setDepth(150 + i);
        }
        this.showTargetHighlights(this.dragFrom);
      }
    }

    if (this.isDragging) {
      for (let i = 0; i < this.dragSprites.length; i++) {
        this.dragSprites[i].x = this.dragOriginalPositions[i].x + dx;
        this.dragSprites[i].y = this.dragOriginalPositions[i].y + dy;
      }
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerDownLocation) return;
    const location = this.pointerDownLocation;

    if (this.isDragging) {
      // Finished dragging — check drop target
      const target = this.getDropTarget(pointer.x, pointer.y);
      this.clearTargetHighlights();

      if (target && this.onCardDrop) {
        this.onCardDrop(this.dragFrom!, target);
      } else {
        // Invalid drop — animate back smoothly
        this.restoreDragDepths();
        for (let i = 0; i < this.dragSprites.length; i++) {
          this.tweens.add({
            targets: this.dragSprites[i],
            x: this.dragOriginalPositions[i].x,
            y: this.dragOriginalPositions[i].y,
            duration: 200,
            ease: 'Power2'
          });
        }
      }
    } else {
      // Was a click, not a drag — check for double-click
      const now = Date.now();
      if (this.lastClickLocation && this.isSameLocation(this.lastClickLocation, location)
          && (now - this.lastClickTime) < this.DOUBLE_CLICK_MS) {
        this.lastClickTime = 0;
        this.lastClickLocation = null;
        if (this.onDoubleClick) this.onDoubleClick(location);
      } else {
        this.lastClickTime = now;
        this.lastClickLocation = location;
      }
    }

    // Reset drag state
    this.pointerDownLocation = null;
    this.dragFrom = null;
    this.isDragging = false;
    this.dragSprites = [];
    this.dragOriginalPositions = [];
  }

  private cancelDrag(): void {
    this.clearTargetHighlights();
    this.pointerDownLocation = null;
    this.dragFrom = null;
    this.isDragging = false;
    this.dragSprites = [];
    this.dragOriginalPositions = [];
    this.lastClickTime = 0;
    this.lastClickLocation = null;
  }

  private restoreDragDepths(): void {
    if (this.dragFrom?.type === 'column') {
      for (let i = 0; i < this.dragSprites.length; i++) {
        this.dragSprites[i].setDepth(20 + this.dragFrom.cardIndex + i);
      }
    } else if (this.dragFrom?.type === 'waste') {
      for (const s of this.dragSprites) s.setDepth(10);
    } else if (this.dragFrom?.type === 'foundation') {
      for (const s of this.dragSprites) s.setDepth(5);
    }
  }

  // --- Drop target detection ---

  private getDropTarget(x: number, y: number): CardLocation | null {
    if (!this.currentState) return null;

    // Check foundations (top row, right side)
    for (let i = 0; i < 4; i++) {
      const fx = this.columnsStartX + (i + 3) * this.colSpacing;
      if (Math.abs(x - fx) < this.cardWidth * 0.6 && Math.abs(y - this.topRowY) < this.cardHeight * 0.6) {
        return { type: 'foundation', pileIndex: i };
      }
    }

    // Check columns
    for (let col = 0; col < 7; col++) {
      const cx = this.columnsStartX + col * this.colSpacing;
      if (Math.abs(x - cx) < this.colSpacing / 2) {
        const column = this.currentState.columns[col];
        if (column.length === 0) {
          if (y > this.columnsStartY - this.cardHeight) {
            return { type: 'column', colIndex: col, cardIndex: 0 };
          }
        } else {
          if (y > this.columnsStartY - this.cardHeight / 2) {
            return { type: 'column', colIndex: col, cardIndex: column.length };
          }
        }
      }
    }

    return null;
  }

  // --- Target highlights (shown during drag) ---

  private showTargetHighlights(from: CardLocation): void {
    this.clearTargetHighlights();
    if (!this.onGetValidTargets) return;

    const targets = this.onGetValidTargets(from);
    for (const target of targets) {
      const pos = this.getLocationPosition(target);
      if (pos) {
        const g = this.add.graphics();
        g.lineStyle(3, 0xffff44, 0.8);
        g.strokeRoundedRect(
          pos.x - this.cardWidth / 2 - 3,
          pos.y - this.cardHeight / 2 - 3,
          this.cardWidth + 6,
          this.cardHeight + 6,
          6
        );
        g.setDepth(99);
        this.targetHighlights.push(g);
      }
    }
  }

  private clearTargetHighlights(): void {
    for (const g of this.targetHighlights) g.destroy();
    this.targetHighlights = [];
  }

  private getLocationPosition(location: CardLocation): { x: number; y: number } | null {
    if (location.type === 'waste') {
      return { x: this.columnsStartX + this.colSpacing, y: this.topRowY };
    }
    if (location.type === 'foundation') {
      return { x: this.columnsStartX + (location.pileIndex + 3) * this.colSpacing, y: this.topRowY };
    }
    if (location.type === 'column') {
      const col = this.currentState?.columns[location.colIndex];
      if (!col) return null;
      if (col.length === 0) {
        return { x: this.columnsStartX + location.colIndex * this.colSpacing, y: this.columnsStartY };
      }
      let yOffset = 0;
      const limit = Math.min(location.cardIndex, col.length);
      for (let i = 0; i < limit; i++) {
        yOffset += col[i].faceUp ? this.faceUpOverlap : this.faceDownOverlap;
      }
      return { x: this.columnsStartX + location.colIndex * this.colSpacing, y: this.columnsStartY + yOffset };
    }
    if (location.type === 'draw') {
      return { x: this.columnsStartX, y: this.topRowY };
    }
    return null;
  }

  // --- Helpers ---

  private isSameLocation(a: CardLocation, b: CardLocation): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'column' && b.type === 'column') return a.colIndex === b.colIndex && a.cardIndex === b.cardIndex;
    if (a.type === 'foundation' && b.type === 'foundation') return a.pileIndex === b.pileIndex;
    return true;
  }

  // --- Win screen ---

  public showWin(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const overlay = this.trackDynamic(this.add.graphics());
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(200);

    const winText = this.trackDynamic(this.add.text(width / 2, height / 2 - 30, 'YOU WIN!', {
      fontSize: '42px', color: '#00ff00', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(201));

    this.tweens.add({
      targets: winText,
      scale: { from: 0.5, to: 1 },
      duration: 600,
      ease: 'Bounce.easeOut'
    });

    this.trackDynamic(this.add.text(width / 2, height / 2 + 20, 'All cards placed!', {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(201));

    for (let i = 0; i < 30; i++) {
      const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
      const rect = this.trackDynamic(this.add.graphics());
      rect.fillStyle(colors[i % colors.length]);
      rect.fillRect(-3, -3, 6, 6);
      rect.setPosition(width / 2, height / 2);
      rect.setDepth(202);

      this.tweens.add({
        targets: rect,
        x: Phaser.Math.Between(50, width - 50),
        y: Phaser.Math.Between(50, height - 50),
        alpha: 0,
        duration: Phaser.Math.Between(800, 1500),
        delay: Phaser.Math.Between(0, 300),
        ease: 'Power2'
      });
    }
  }
}
