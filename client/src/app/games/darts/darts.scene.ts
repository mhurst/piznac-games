import Phaser from 'phaser';

// Standard dartboard segment order (clockwise from top)
const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const SEG_ANGLE = Math.PI * 2 / 20;

// Board colors
const BLACK = 0x1e1e1e;
const CREAM = 0xf0d9b5;
const RED = 0xd62839;
const GREEN = 0x007a33;
const WIRE = 0xc0c0c0;

export interface DartHit {
  x: number;
  y: number;
  score: number;
  label: string;
}

export class DartsScene extends Phaser.Scene {
  // Board geometry
  private readonly CX = 280;
  private readonly CY = 300;
  private readonly DBULL_R = 10;
  private readonly BULL_R = 24;
  private readonly TRIPLE_IN = 120;
  private readonly TRIPLE_OUT = 136;
  private readonly DOUBLE_IN = 200;
  private readonly DOUBLE_OUT = 220;
  private readonly NUMBER_R = 245;

  // UI elements
  private crosshair!: Phaser.GameObjects.Graphics;
  private dartMarkers: Phaser.GameObjects.GameObject[] = [];
  private dartInHand!: Phaser.GameObjects.Graphics;

  // Score panel texts
  private lastThrowText!: Phaser.GameObjects.Text;
  private totalScoreText!: Phaser.GameObjects.Text;
  private dartCountText!: Phaser.GameObjects.Text;

  // State
  private totalScore = 0;
  private dartCount = 0;
  private canThrow = true;
  private throwState: 'idle' | 'holding' = 'idle';
  private holdStartTime = 0;
  private mouseHistory: { x: number; y: number; time: number }[] = [];
  private wobbleX = 0;
  private wobbleY = 0;

  // Callbacks
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'DartsScene' });
  }

  create(): void {
    this.drawBoard();
    this.createDartInHand();
    this.createCrosshair();
    this.createScorePanel();
    this.setupInput();
    if (this.onReady) this.onReady();
  }

  override update(): void {
    const pointer = this.input.activePointer;

    if (this.throwState === 'idle') {
      // Normal crosshair follows mouse
      this.crosshair.setPosition(pointer.x, pointer.y);
      const dx = pointer.x - this.CX;
      const dy = pointer.y - this.CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.crosshair.setVisible(dist < this.DOUBLE_OUT + 80);
      this.dartInHand.setVisible(false);
    } else if (this.throwState === 'holding') {
      // Hide crosshair, show dart in hand
      this.crosshair.setVisible(false);

      // Track mouse for velocity calculation
      this.mouseHistory.push({ x: pointer.x, y: pointer.y, time: Date.now() });
      if (this.mouseHistory.length > 20) this.mouseHistory.shift();

      // Calculate wobble (grows after 0.8s of holding)
      const holdTime = (Date.now() - this.holdStartTime) / 1000;
      const wobbleAmp = Math.min(Math.max(0, (holdTime - 0.8)) * 8, 25);
      this.wobbleX = Math.sin(holdTime * 4.0) * wobbleAmp;
      this.wobbleY = Math.cos(holdTime * 5.5) * wobbleAmp;

      // Position dart at mouse + wobble
      this.dartInHand.setPosition(pointer.x + this.wobbleX, pointer.y + this.wobbleY);
      this.dartInHand.setVisible(true);
    }
  }

  // ===== Board Drawing =====

  private drawBoard(): void {
    const g = this.add.graphics();

    // Outer backing circle
    g.fillStyle(0x111111);
    g.fillCircle(this.CX, this.CY, this.DOUBLE_OUT + 30);

    // Draw rings from outside in (each layer covers the center of the previous)
    this.drawSegmentRing(g, this.DOUBLE_OUT, RED, GREEN);
    this.drawSegmentRing(g, this.DOUBLE_IN, BLACK, CREAM);
    this.drawSegmentRing(g, this.TRIPLE_OUT, RED, GREEN);
    this.drawSegmentRing(g, this.TRIPLE_IN, BLACK, CREAM);

    // Bull (outer)
    g.fillStyle(GREEN);
    g.fillCircle(this.CX, this.CY, this.BULL_R);

    // Double bull (inner)
    g.fillStyle(RED);
    g.fillCircle(this.CX, this.CY, this.DBULL_R);

    // Wire lines
    this.drawWires(g);

    // Numbers around the outside
    this.drawNumbers();
  }

  private drawSegmentRing(g: Phaser.GameObjects.Graphics, radius: number, colorEven: number, colorOdd: number): void {
    for (let i = 0; i < 20; i++) {
      const color = i % 2 === 0 ? colorEven : colorOdd;
      const start = -Math.PI / 2 + i * SEG_ANGLE - SEG_ANGLE / 2;
      const end = start + SEG_ANGLE;

      g.fillStyle(color);
      g.beginPath();
      g.moveTo(this.CX, this.CY);
      g.arc(this.CX, this.CY, radius, start, end, false);
      g.closePath();
      g.fillPath();
    }
  }

  private drawWires(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(1, WIRE, 0.5);

    g.strokeCircle(this.CX, this.CY, this.DBULL_R);
    g.strokeCircle(this.CX, this.CY, this.BULL_R);
    g.strokeCircle(this.CX, this.CY, this.TRIPLE_IN);
    g.strokeCircle(this.CX, this.CY, this.TRIPLE_OUT);
    g.strokeCircle(this.CX, this.CY, this.DOUBLE_IN);
    g.strokeCircle(this.CX, this.CY, this.DOUBLE_OUT);

    for (let i = 0; i < 20; i++) {
      const angle = -Math.PI / 2 + i * SEG_ANGLE - SEG_ANGLE / 2;
      const ix = this.CX + Math.cos(angle) * this.BULL_R;
      const iy = this.CY + Math.sin(angle) * this.BULL_R;
      const ox = this.CX + Math.cos(angle) * this.DOUBLE_OUT;
      const oy = this.CY + Math.sin(angle) * this.DOUBLE_OUT;
      g.lineBetween(ix, iy, ox, oy);
    }
  }

  private drawNumbers(): void {
    for (let i = 0; i < 20; i++) {
      const angle = -Math.PI / 2 + i * SEG_ANGLE;
      const x = this.CX + Math.cos(angle) * this.NUMBER_R;
      const y = this.CY + Math.sin(angle) * this.NUMBER_R;

      this.add.text(x, y, SEGMENTS[i].toString(), {
        fontSize: '17px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5);
    }
  }

  // ===== Dart In Hand =====

  private createDartInHand(): void {
    this.dartInHand = this.add.graphics();
    // Dart tip
    this.dartInHand.fillStyle(0xffcc00);
    this.dartInHand.fillCircle(0, 0, 5);
    // Outline
    this.dartInHand.lineStyle(1.5, 0xcc8800);
    this.dartInHand.strokeCircle(0, 0, 5);
    // Tail/flight
    this.dartInHand.lineStyle(2, 0xff8800);
    this.dartInHand.lineBetween(0, 5, 0, 18);
    this.dartInHand.lineBetween(-5, 16, 5, 16);
    this.dartInHand.setVisible(false);
    this.dartInHand.setDepth(95);
  }

  // ===== Crosshair =====

  private createCrosshair(): void {
    this.crosshair = this.add.graphics();
    this.crosshair.lineStyle(2, 0xffffff, 0.8);
    this.crosshair.strokeCircle(0, 0, 12);
    this.crosshair.lineBetween(-18, 0, -6, 0);
    this.crosshair.lineBetween(6, 0, 18, 0);
    this.crosshair.lineBetween(0, -18, 0, -6);
    this.crosshair.lineBetween(0, 6, 0, 18);
    this.crosshair.setVisible(false);
    this.crosshair.setDepth(100);
  }

  // ===== Input =====

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canThrow || this.throwState !== 'idle') return;

      // Start holding the dart
      this.throwState = 'holding';
      this.holdStartTime = Date.now();
      this.mouseHistory = [{ x: pointer.x, y: pointer.y, time: Date.now() }];
      this.wobbleX = 0;
      this.wobbleY = 0;
    });

    this.input.on('pointerup', () => {
      if (this.throwState !== 'holding') return;
      this.throwState = 'idle';
      this.dartInHand.setVisible(false);

      const pointer = this.input.activePointer;

      // Calculate velocity from last ~120ms of mouse movement
      const now = Date.now();
      const recent = this.mouseHistory.filter(p => now - p.time < 120);

      let vx = 0, vy = 0;
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = (last.time - first.time) / 1000;
        if (dt > 0.005) {
          vx = (last.x - first.x) / dt;
          vy = (last.y - first.y) / dt;
        }
      }

      // Dart position = mouse + current wobble offset
      const dartX = pointer.x + this.wobbleX;
      const dartY = pointer.y + this.wobbleY;

      // Velocity drift: faster mouse movement at release = more drift
      const driftX = vx * 0.03;
      const driftY = vy * 0.03;

      // Tiny natural jitter
      const jitterX = (Math.random() - 0.5) * 4;
      const jitterY = (Math.random() - 0.5) * 4;

      const landX = dartX + driftX + jitterX;
      const landY = dartY + driftY + jitterY;

      this.launchDart(dartX, dartY, landX, landY);
    });
  }

  // ===== Throwing =====

  private launchDart(fromX: number, fromY: number, landX: number, landY: number): void {
    this.canThrow = false;
    const hit = this.detectHit(landX, landY);

    // Create dart marker
    const marker = this.add.graphics();
    marker.fillStyle(0xffee00);
    marker.fillCircle(0, 0, 4);
    marker.lineStyle(1.5, 0x000000);
    marker.strokeCircle(0, 0, 4);
    marker.setPosition(fromX, fromY);
    marker.setDepth(50);
    this.dartMarkers.push(marker);

    // Quick snap animation from dart position to landing
    this.tweens.add({
      targets: marker,
      x: landX,
      y: landY,
      duration: 80,
      ease: 'Power1',
      onComplete: () => {
        this.canThrow = true;
        this.dartCount++;
        this.totalScore += hit.score;
        this.showScorePopup(landX, landY, hit);
        this.updateScorePanel(hit);
      }
    });
  }

  // ===== Hit Detection =====

  private detectHit(x: number, y: number): DartHit {
    const dx = x - this.CX;
    const dy = y - this.CY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > this.DOUBLE_OUT) {
      return { x, y, score: 0, label: 'MISS' };
    }
    if (dist <= this.DBULL_R) {
      return { x, y, score: 50, label: 'D-BULL' };
    }
    if (dist <= this.BULL_R) {
      return { x, y, score: 25, label: 'BULL' };
    }

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    const topOffset = Math.PI * 3 / 2 - SEG_ANGLE / 2;
    let adjusted = angle - topOffset;
    if (adjusted < 0) adjusted += Math.PI * 2;
    const segIndex = Math.floor(adjusted / SEG_ANGLE) % 20;
    const segValue = SEGMENTS[segIndex];

    if (dist <= this.TRIPLE_IN) {
      return { x, y, score: segValue, label: `${segValue}` };
    }
    if (dist <= this.TRIPLE_OUT) {
      return { x, y, score: segValue * 3, label: `T${segValue}` };
    }
    if (dist <= this.DOUBLE_IN) {
      return { x, y, score: segValue, label: `${segValue}` };
    }
    return { x, y, score: segValue * 2, label: `D${segValue}` };
  }

  // ===== Score Popup =====

  private showScorePopup(x: number, y: number, hit: DartHit): void {
    const color = hit.score === 0 ? '#ff4444'
      : hit.score >= 40 ? '#00ff00'
      : hit.score >= 20 ? '#ffff00'
      : '#ffffff';

    const text = hit.score > 0 ? `${hit.label}\n+${hit.score}` : 'MISS!';
    const popup = this.add.text(x, y - 25, text, {
      fontSize: '16px', color, fontFamily: 'Arial', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5).setDepth(60);

    this.tweens.add({
      targets: popup,
      y: y - 60,
      alpha: 0,
      duration: 1400,
      ease: 'Power1',
      onComplete: () => popup.destroy()
    });
  }

  // ===== Score Panel =====

  private createScorePanel(): void {
    const px = 580;
    const py = 30;
    const pw = 195;

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e);
    panel.fillRoundedRect(px, py, pw, 300, 8);
    panel.lineStyle(1, 0x0f3460);
    panel.strokeRoundedRect(px, py, pw, 300, 8);

    // Title
    this.add.text(px + pw / 2, py + 24, 'DARTS', {
      fontSize: '22px', color: '#e94560', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    panel.lineBetween(px + 10, py + 48, px + pw - 10, py + 48);

    // Last throw
    this.add.text(px + 15, py + 65, 'Last Throw:', {
      fontSize: '13px', color: '#888888', fontFamily: 'Arial'
    });
    this.lastThrowText = this.add.text(px + pw - 15, py + 65, '--', {
      fontSize: '15px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(1, 0);

    // Total
    this.add.text(px + 15, py + 98, 'Total Score:', {
      fontSize: '13px', color: '#888888', fontFamily: 'Arial'
    });
    this.totalScoreText = this.add.text(px + pw - 15, py + 95, '0', {
      fontSize: '22px', color: '#4a90d9', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(1, 0);

    // Count
    this.add.text(px + 15, py + 132, 'Darts Thrown:', {
      fontSize: '13px', color: '#888888', fontFamily: 'Arial'
    });
    this.dartCountText = this.add.text(px + pw - 15, py + 132, '0', {
      fontSize: '13px', color: '#ffffff', fontFamily: 'Arial'
    }).setOrigin(1, 0);

    // Clear Board button
    panel.lineBetween(px + 10, py + 162, px + pw - 10, py + 162);

    const btnY = py + 185;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0xe94560);
    btnBg.fillRoundedRect(px + 20, btnY, pw - 40, 40, 8);

    this.add.text(px + pw / 2, btnY + 20, 'Clear Board', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    const btnZone = this.add.zone(px + pw / 2, btnY + 20, pw - 40, 40);
    btnZone.setInteractive({ useHandCursor: true });
    btnZone.on('pointerdown', () => this.clearBoard());
    btnZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0xff6b8a);
      btnBg.fillRoundedRect(px + 20, btnY, pw - 40, 40, 8);
    });
    btnZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0xe94560);
      btnBg.fillRoundedRect(px + 20, btnY, pw - 40, 40, 8);
    });

    // Instructions
    this.add.text(px + pw / 2, py + 260, 'Click & hold to grab\nMove to aim, release!', {
      fontSize: '11px', color: '#666666', fontFamily: 'Arial', align: 'center'
    }).setOrigin(0.5);
  }

  private updateScorePanel(hit: DartHit): void {
    const color = hit.score === 0 ? '#ff4444'
      : hit.score >= 40 ? '#00ff00'
      : '#ffffff';
    this.lastThrowText.setText(hit.score > 0 ? `${hit.label} (+${hit.score})` : 'MISS');
    this.lastThrowText.setColor(color);
    this.totalScoreText.setText(this.totalScore.toString());
    this.dartCountText.setText(this.dartCount.toString());
  }

  // ===== Clear =====

  public clearBoard(): void {
    for (const m of this.dartMarkers) m.destroy();
    this.dartMarkers = [];
    this.totalScore = 0;
    this.dartCount = 0;
    this.lastThrowText.setText('--');
    this.lastThrowText.setColor('#ffffff');
    this.totalScoreText.setText('0');
    this.dartCountText.setText('0');
  }
}
