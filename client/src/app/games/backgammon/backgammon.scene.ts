import Phaser from 'phaser';
import { Board, Bar, BorneOff, Color, BackgammonMove, BackgammonVisualState } from './backgammon-types';

// Layout constants
const BOARD_X = 40;
const BOARD_Y = 40;
const BOARD_W = 540;
const BOARD_H = 440;
const BAR_W = 30;
const POINT_W = (BOARD_W - BAR_W) / 12; // ~42.5px per point
const POINT_H = 180;
const CHECKER_R = 18;
const CHECKER_D = CHECKER_R * 2 - 2;
const BEAROFF_X = BOARD_X + BOARD_W + 15;

// Colors
const BOARD_BG = 0x3d2b1f;       // Dark wood
const BOARD_INNER = 0x5c3d2e;    // Inner board
const POINT_DARK = 0x8b0000;     // Dark red triangles
const POINT_LIGHT = 0xd2b48c;    // Tan triangles
const WHITE_CHECKER = 0xfff8dc;   // Cornsilk
const WHITE_STROKE = 0x888888;
const BLACK_CHECKER = 0x2f1b14;   // Very dark brown
const BLACK_STROKE = 0x666666;
const HIGHLIGHT_COLOR = 0x00ff66;
const SELECTED_COLOR = 0xffff00;
const BAR_COLOR = 0x2a1a0f;

export class BackgammonScene extends Phaser.Scene {
  private state: BackgammonVisualState | null = null;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private dynamicLayer!: Phaser.GameObjects.Container;
  private diceAnimLayer!: Phaser.GameObjects.Container;
  private clickZones: Phaser.GameObjects.Zone[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private diceTexts: Phaser.GameObjects.Text[] = [];
  private rollBtn: { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } | null = null;
  private prevDice: [number, number] | null = null;
  private diceAnimating = false;
  private diceAnimTimer: any = null;

  // Callbacks
  public onMoveSelected: ((move: BackgammonMove) => void) | null = null;
  public onRollDice: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'BackgammonScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a472a).setOrigin(0.5);

    this.boardGraphics = this.add.graphics();
    this.dynamicLayer = this.add.container(0, 0);
    this.diceAnimLayer = this.add.container(0, 0);

    this.drawStaticBoard();
    this.createClickZones();
    this.setupBearOffClick();

    this.turnText = this.add.text(width / 2, 15, 'Waiting...', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.messageText = this.add.text(width / 2, height - 15, '', {
      fontSize: '16px', color: '#cccccc', fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Roll button (centered on board)
    const btnY = BOARD_Y + BOARD_H / 2;
    const btnX = BOARD_X + BOARD_W / 2;
    const btnBg = this.add.rectangle(btnX, btnY, 120, 40, 0x2196f3, 0.9)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    const btnText = this.add.text(btnX, btnY, 'Roll Dice', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);
    btnBg.on('pointerdown', () => { if (this.onRollDice) this.onRollDice(); });
    this.rollBtn = { bg: btnBg, text: btnText };
    this.setRollBtnVisible(false);

    if (this.onReady) this.onReady();
  }

  private setRollBtnVisible(vis: boolean): void {
    if (!this.rollBtn) return;
    this.rollBtn.bg.setVisible(vis);
    this.rollBtn.text.setVisible(vis);
  }

  private drawStaticBoard(): void {
    const g = this.boardGraphics;

    // Board border
    g.fillStyle(BOARD_BG);
    g.fillRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8);

    // Inner board
    g.fillStyle(BOARD_INNER);
    g.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

    // Bar
    const barX = BOARD_X + (BOARD_W - BAR_W) / 2;
    g.fillStyle(BAR_COLOR);
    g.fillRect(barX, BOARD_Y, BAR_W, BOARD_H);

    // Draw triangles (points)
    for (let i = 0; i < 24; i++) {
      this.drawTriangle(g, i);
    }

    // Bearing off area
    g.fillStyle(BOARD_BG);
    g.fillRect(BEAROFF_X - 5, BOARD_Y - 4, 50, BOARD_H + 8);
    g.fillStyle(BOARD_INNER);
    g.fillRect(BEAROFF_X - 2, BOARD_Y, 44, BOARD_H);
  }

  private getPointX(index: number): number {
    // Points 12-23 are top row left to right
    // Points 0-11 are bottom row right to left
    // Left half: points 12-17 (top), 11-6 (bottom)
    // Right half: points 18-23 (top), 5-0 (bottom)
    let col: number;
    if (index >= 12) {
      col = index - 12; // 0-11, left to right on top
    } else {
      col = 11 - index; // 0-11, left to right on bottom (11 is leftmost)
    }

    // Account for bar in the middle
    const halfW = (BOARD_W - BAR_W) / 2;
    if (col < 6) {
      return BOARD_X + col * POINT_W + POINT_W / 2;
    } else {
      return BOARD_X + halfW + BAR_W + (col - 6) * POINT_W + POINT_W / 2;
    }
  }

  private isTopRow(index: number): boolean {
    return index >= 12;
  }

  private drawTriangle(g: Phaser.GameObjects.Graphics, index: number): void {
    const x = this.getPointX(index);
    const top = this.isTopRow(index);
    const color = index % 2 === 0 ? POINT_DARK : POINT_LIGHT;
    const halfW = POINT_W / 2 - 1;

    g.fillStyle(color, 0.9);
    if (top) {
      // Points down from top
      const baseY = BOARD_Y;
      g.fillTriangle(x - halfW, baseY, x + halfW, baseY, x, baseY + POINT_H);
    } else {
      // Points up from bottom
      const baseY = BOARD_Y + BOARD_H;
      g.fillTriangle(x - halfW, baseY, x + halfW, baseY, x, baseY - POINT_H);
    }
  }

  private createClickZones(): void {
    // Point click zones
    for (let i = 0; i < 24; i++) {
      const x = this.getPointX(i);
      const top = this.isTopRow(i);
      const y = top ? BOARD_Y + POINT_H / 2 : BOARD_Y + BOARD_H - POINT_H / 2;

      const zone = this.add.zone(x, y, POINT_W, POINT_H)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      zone.setData('pointIndex', i);
      zone.on('pointerdown', () => this.onPointClick(i));
      this.clickZones.push(zone);
    }

    // Bar click zone
    const barX = BOARD_X + BOARD_W / 2;
    const barZone = this.add.zone(barX, BOARD_Y + BOARD_H / 2, BAR_W + 10, BOARD_H)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    barZone.setData('pointIndex', 'bar');
    barZone.on('pointerdown', () => this.onPointClick('bar'));
    this.clickZones.push(barZone);
  }

  private onPointClick(point: number | 'bar'): void {
    if (!this.state || !this.state.isMyTurn || this.state.phase !== 'moving') return;

    const validMoves = this.state.validMoves;
    if (!validMoves || validMoves.length === 0) return;

    if (this.state.selectedPoint === null) {
      // Select a source point
      const hasMove = validMoves.some(m => m.from === point);
      if (hasMove) {
        this.state.selectedPoint = point;
        this.redrawDynamic();
      }
    } else if (this.state.selectedPoint === point) {
      // Deselect
      this.state.selectedPoint = null;
      this.redrawDynamic();
    } else {
      // Try to make a move to this destination
      const move = validMoves.find(m =>
        m.from === this.state!.selectedPoint && m.to === point
      );
      if (move) {
        this.state.selectedPoint = null;
        if (this.onMoveSelected) this.onMoveSelected(move);
      } else {
        // Check if clicking bear-off area or different source
        const hasMove = validMoves.some(m => m.from === point);
        if (hasMove) {
          this.state.selectedPoint = point;
          this.redrawDynamic();
        } else {
          this.state.selectedPoint = null;
          this.redrawDynamic();
        }
      }
    }
  }

  // Also handle bear-off click
  private setupBearOffClick(): void {
    const zone = this.add.zone(BEAROFF_X + 17, BOARD_Y + BOARD_H / 2, 44, BOARD_H)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (!this.state || !this.state.isMyTurn || this.state.selectedPoint === null) return;
      const move = this.state.validMoves.find(m =>
        m.from === this.state!.selectedPoint && m.to === 'off'
      );
      if (move) {
        this.state.selectedPoint = null;
        if (this.onMoveSelected) this.onMoveSelected(move);
      }
    });
  }

  public updateState(state: BackgammonVisualState): void {
    this.state = { ...state };
    if (this.state.selectedPoint === undefined) this.state.selectedPoint = null;

    // Update turn text
    if (state.gameOver) {
      const winMsg = state.winner === state.myName ? 'You win!' : `${state.opponentName} wins!`;
      const typeMsg = state.winType === 'backgammon' ? ' (Backgammon!)' :
                      state.winType === 'gammon' ? ' (Gammon!)' : '';
      this.turnText.setText(winMsg + typeMsg);
      this.turnText.setColor(state.winner === state.myName ? '#4caf50' : '#e94560');
    } else if (state.isMyTurn) {
      if (state.phase === 'rolling') {
        this.turnText.setText('Your turn — Roll dice!');
      } else {
        const diceLeft = state.remainingDice.length;
        this.turnText.setText(`Your turn — ${diceLeft} move${diceLeft !== 1 ? 's' : ''} left`);
      }
      this.turnText.setColor('#e94560');
    } else {
      this.turnText.setText("Opponent's turn...");
      this.turnText.setColor('#888888');
    }

    // Roll button
    const showRoll = state.isMyTurn && state.phase === 'rolling' && !state.gameOver;
    this.setRollBtnVisible(showRoll);

    // Check if new dice were rolled (trigger animation)
    const isNewRoll = state.dice !== null && (
      this.prevDice === null ||
      this.prevDice[0] !== state.dice[0] ||
      this.prevDice[1] !== state.dice[1]
    );

    if (isNewRoll && state.dice) {
      this.prevDice = [...state.dice] as [number, number];
      this.animateDiceRoll(state.dice[0], state.dice[1]);
    } else if (!state.dice) {
      this.prevDice = null;
      this.diceAnimLayer.removeAll(true);
    }

    this.redrawDynamic();
  }

  private redrawDynamic(): void {
    this.dynamicLayer.removeAll(true);
    if (!this.state) return;

    this.drawCheckers();
    this.drawBarCheckers();
    this.drawBorneOff();
    this.drawDice();
    this.drawHighlights();
    this.drawAvatars();
  }

  private drawCheckers(): void {
    const board = this.state!.board;
    for (let i = 0; i < 24; i++) {
      const val = board[i];
      if (val === 0) continue;
      const color: Color = val > 0 ? 'W' : 'B';
      const count = Math.abs(val);
      const x = this.getPointX(i);
      const top = this.isTopRow(i);

      const maxVisible = Math.min(count, 5);
      for (let j = 0; j < maxVisible; j++) {
        const y = top
          ? BOARD_Y + CHECKER_R + 2 + j * (CHECKER_D - 4)
          : BOARD_Y + BOARD_H - CHECKER_R - 2 - j * (CHECKER_D - 4);

        this.drawChecker(x, y, color);
      }

      // Show count if more than 5
      if (count > 5) {
        const y = top
          ? BOARD_Y + CHECKER_R + 2 + 2 * (CHECKER_D - 4)
          : BOARD_Y + BOARD_H - CHECKER_R - 2 - 2 * (CHECKER_D - 4);
        this.dynamicLayer.add(
          this.add.text(x, y, `${count}`, {
            fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)
        );
      }
    }
  }

  private drawChecker(x: number, y: number, color: Color): void {
    const g = this.add.graphics();
    const fill = color === 'W' ? WHITE_CHECKER : BLACK_CHECKER;
    const stroke = color === 'W' ? WHITE_STROKE : BLACK_STROKE;

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(x + 1, y + 1, CHECKER_R);

    // Main circle
    g.fillStyle(fill);
    g.fillCircle(x, y, CHECKER_R);
    g.lineStyle(2, stroke, 0.8);
    g.strokeCircle(x, y, CHECKER_R);

    // Inner ring for detail
    g.lineStyle(1, stroke, 0.3);
    g.strokeCircle(x, y, CHECKER_R - 5);

    this.dynamicLayer.add(g);
  }

  private drawBarCheckers(): void {
    const barX = BOARD_X + BOARD_W / 2;

    // White on bar (shown in bottom half of bar)
    for (let i = 0; i < this.state!.bar.W; i++) {
      const y = BOARD_Y + BOARD_H / 2 + 25 + i * (CHECKER_D - 8);
      this.drawChecker(barX, y, 'W');
    }

    // Black on bar (shown in top half of bar)
    for (let i = 0; i < this.state!.bar.B; i++) {
      const y = BOARD_Y + BOARD_H / 2 - 25 - i * (CHECKER_D - 8);
      this.drawChecker(barX, y, 'B');
    }
  }

  private drawBorneOff(): void {
    const x = BEAROFF_X + 17;

    // White borne off (bottom)
    for (let i = 0; i < this.state!.borneOff.W; i++) {
      const y = BOARD_Y + BOARD_H - 8 - i * 14;
      const g = this.add.graphics();
      g.fillStyle(WHITE_CHECKER);
      g.fillRect(x - 15, y - 6, 30, 12);
      g.lineStyle(1, WHITE_STROKE, 0.5);
      g.strokeRect(x - 15, y - 6, 30, 12);
      this.dynamicLayer.add(g);
    }

    // Black borne off (top)
    for (let i = 0; i < this.state!.borneOff.B; i++) {
      const y = BOARD_Y + 8 + i * 14;
      const g = this.add.graphics();
      g.fillStyle(BLACK_CHECKER);
      g.fillRect(x - 15, y - 6, 30, 12);
      g.lineStyle(1, BLACK_STROKE, 0.5);
      g.strokeRect(x - 15, y - 6, 30, 12);
      this.dynamicLayer.add(g);
    }
  }

  private drawDice(): void {
    if (!this.state?.dice || this.diceAnimating) return;

    const centerX = BOARD_X + BOARD_W / 2;
    const centerY = BOARD_Y + BOARD_H / 2;

    const remaining = [...this.state.remainingDice];
    const allDice = this.state.dice[0] === this.state.dice[1]
      ? [this.state.dice[0], this.state.dice[0], this.state.dice[0], this.state.dice[0]]
      : [this.state.dice[0], this.state.dice[1]];

    // Mark each die as used or available by matching against remaining values
    const usedFlags: boolean[] = [];
    const remainCopy = [...remaining];
    for (const die of allDice) {
      const idx = remainCopy.indexOf(die);
      if (idx !== -1) {
        usedFlags.push(false); // still available
        remainCopy.splice(idx, 1);
      } else {
        usedFlags.push(true); // used up
      }
    }

    const totalDice = allDice.length;
    const startX = centerX - (totalDice * 25) / 2;

    for (let i = 0; i < totalDice; i++) {
      const dx = startX + i * 30 + 12;
      const dy = centerY;
      const val = allDice[i];

      this.drawSingleDie(dx, dy, val, usedFlags[i] ? 0.3 : 1, this.dynamicLayer);
    }
  }

  private drawSingleDie(cx: number, cy: number, val: number, alpha: number, layer: Phaser.GameObjects.Container, angle?: number): void {
    const g = this.add.graphics();

    g.fillStyle(0xffffff, alpha);
    g.fillRoundedRect(cx - 14, cy - 14, 28, 28, 4);
    g.lineStyle(1, 0x333333, alpha);
    g.strokeRoundedRect(cx - 14, cy - 14, 28, 28, 4);
    layer.add(g);

    // Pips
    this.drawDiePips(cx, cy, val, alpha, layer);
  }

  private animateDiceRoll(finalD1: number, finalD2: number): void {
    if (this.diceAnimTimer) clearInterval(this.diceAnimTimer);
    this.diceAnimating = true;
    this.diceAnimLayer.removeAll(true);

    const centerX = BOARD_X + BOARD_W / 2;
    const centerY = BOARD_Y + BOARD_H / 2;
    const isDoubles = finalD1 === finalD2;
    const diceCount = isDoubles ? 4 : 2;

    let frame = 0;
    const totalFrames = 8;
    const interval = 60; // ms between frames

    const renderFrame = () => {
      this.diceAnimLayer.removeAll(true);

      const startX = centerX - (diceCount * 25) / 2;

      for (let i = 0; i < diceCount; i++) {
        // Random value for tumbling, final value on last frame
        const isFinal = frame >= totalFrames;
        const val = isFinal
          ? (isDoubles ? finalD1 : (i === 0 ? finalD1 : finalD2))
          : Math.ceil(Math.random() * 6);

        // Wobble offset for tumbling effect
        const wobbleX = isFinal ? 0 : (Math.random() - 0.5) * 6;
        const wobbleY = isFinal ? 0 : (Math.random() - 0.5) * 6;
        const dx = startX + i * 30 + 12 + wobbleX;
        const dy = centerY + wobbleY;

        // Scale bounce — start big, settle to normal
        const scale = isFinal ? 1 : 0.9 + Math.random() * 0.2;

        const g = this.add.graphics();
        const halfSize = 14 * scale;
        g.fillStyle(0xffffff);
        g.fillRoundedRect(dx - halfSize, dy - halfSize, halfSize * 2, halfSize * 2, 4);
        g.lineStyle(1, 0x333333);
        g.strokeRoundedRect(dx - halfSize, dy - halfSize, halfSize * 2, halfSize * 2, 4);
        this.diceAnimLayer.add(g);

        this.drawDiePips(dx, dy, val, 1, this.diceAnimLayer);
      }

      frame++;
      if (frame > totalFrames) {
        clearInterval(this.diceAnimTimer);
        this.diceAnimTimer = null;
        this.diceAnimating = false;
        // Clear animation layer and let normal drawDice take over
        this.diceAnimLayer.removeAll(true);
        this.redrawDynamic();
      }
    };

    // First frame immediately
    renderFrame();
    this.diceAnimTimer = setInterval(renderFrame, interval);
  }

  private drawDiePips(cx: number, cy: number, val: number, alpha: number, layer?: Phaser.GameObjects.Container): void {
    const target = layer || this.dynamicLayer;
    const g = this.add.graphics();
    g.fillStyle(0x000000, alpha);
    const r = 3;
    const off = 7;

    const positions: Record<number, [number, number][]> = {
      1: [[0, 0]],
      2: [[-off, -off], [off, off]],
      3: [[-off, -off], [0, 0], [off, off]],
      4: [[-off, -off], [off, -off], [-off, off], [off, off]],
      5: [[-off, -off], [off, -off], [0, 0], [-off, off], [off, off]],
      6: [[-off, -off], [off, -off], [-off, 0], [off, 0], [-off, off], [off, off]],
    };

    for (const [px, py] of (positions[val] || [])) {
      g.fillCircle(cx + px, cy + py, r);
    }
    target.add(g);
  }

  private drawHighlights(): void {
    if (!this.state || !this.state.isMyTurn || this.state.phase !== 'moving') return;

    const g = this.add.graphics();
    const validMoves = this.state.validMoves;

    if (this.state.selectedPoint !== null) {
      // Highlight selected point
      const sel = this.state.selectedPoint;
      if (sel === 'bar') {
        const barX = BOARD_X + BOARD_W / 2;
        g.lineStyle(3, SELECTED_COLOR, 0.8);
        g.strokeRect(barX - 15, BOARD_Y, 30, BOARD_H);
      } else {
        const x = this.getPointX(sel);
        const top = this.isTopRow(sel);
        const y = top ? BOARD_Y : BOARD_Y + BOARD_H - POINT_H;
        g.fillStyle(SELECTED_COLOR, 0.2);
        g.fillRect(x - POINT_W / 2, y, POINT_W, POINT_H);
      }

      // Highlight valid destinations
      const destMoves = validMoves.filter(m => m.from === sel);
      for (const m of destMoves) {
        if (m.to === 'off') {
          // Highlight bear off area
          g.fillStyle(HIGHLIGHT_COLOR, 0.3);
          g.fillRect(BEAROFF_X - 2, BOARD_Y, 44, BOARD_H);
        } else {
          const dx = this.getPointX(m.to as number);
          const dtop = this.isTopRow(m.to as number);
          const dy = dtop ? BOARD_Y : BOARD_Y + BOARD_H - POINT_H;
          g.fillStyle(HIGHLIGHT_COLOR, 0.25);
          g.fillRect(dx - POINT_W / 2, dy, POINT_W, POINT_H);
        }
      }
    } else {
      // Highlight all source points that have valid moves
      const sources = new Set(validMoves.map(m => m.from));
      for (const src of sources) {
        if (src === 'bar') {
          const barX = BOARD_X + BOARD_W / 2;
          g.fillStyle(HIGHLIGHT_COLOR, 0.15);
          g.fillRect(barX - 15, BOARD_Y, 30, BOARD_H);
        } else {
          const x = this.getPointX(src as number);
          const top = this.isTopRow(src as number);
          const y = top ? BOARD_Y : BOARD_Y + BOARD_H - POINT_H;
          g.fillStyle(HIGHLIGHT_COLOR, 0.15);
          g.fillRect(x - POINT_W / 2, y, POINT_W, POINT_H);
        }
      }
    }

    this.dynamicLayer.add(g);
  }

  private drawAvatars(): void {
    if (!this.state) return;

    // Opponent (top-left)
    const oppText = this.add.text(BOARD_X, BOARD_Y - 22, this.state.opponentName || 'Opponent', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'Arial'
    }).setOrigin(0, 0.5);
    this.dynamicLayer.add(oppText);

    // Player (bottom-left)
    const myText = this.add.text(BOARD_X, BOARD_Y + BOARD_H + 22, this.state.myName || 'You', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'Arial'
    }).setOrigin(0, 0.5);
    this.dynamicLayer.add(myText);

    // Borne off counts
    const boText = this.add.text(BEAROFF_X + 17, BOARD_Y - 22,
      `Off: W ${this.state.borneOff.W} / B ${this.state.borneOff.B}`, {
        fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5, 0.5);
    this.dynamicLayer.add(boText);
  }

  public setMessage(msg: string): void {
    if (this.messageText) this.messageText.setText(msg);
  }

  public resetGame(): void {
    this.state = null;
    this.prevDice = null;
    this.diceAnimating = false;
    if (this.diceAnimTimer) { clearInterval(this.diceAnimTimer); this.diceAnimTimer = null; }
    if (this.dynamicLayer) this.dynamicLayer.removeAll(true);
    if (this.diceAnimLayer) this.diceAnimLayer.removeAll(true);
    if (this.turnText) this.turnText.setText('Waiting...');
    if (this.messageText) this.messageText.setText('');
    this.setRollBtnVisible(false);
  }

  public setColor(color: Color): void {
    // For now both perspectives share the same board rendering
    // White is always at bottom. In MP, if player is Black, we can flip.
    // TODO: add perspective flipping for Black player
  }
}
