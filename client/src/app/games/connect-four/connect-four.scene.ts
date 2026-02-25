import Phaser from 'phaser';
import { AI_NAMES, getAvatarConfig } from '../../core/ai/ai-names';

const ROWS = 6;
const COLS = 7;

export class ConnectFourScene extends Phaser.Scene {
  private board: (string | null)[][] = [];
  private cellSize = 70;
  private gridOffset = { x: 0, y: 0 };
  private isMyTurn = false;
  private mySymbol: 'R' | 'Y' = 'R';
  private gameOver = false;
  private discGraphics: Phaser.GameObjects.Graphics[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hoverColumn = -1;
  private hoverGraphics: Phaser.GameObjects.Graphics | null = null;
  private opponentName = 'Opponent';
  private avatarObjects: Phaser.GameObjects.GameObject[] = [];

  // Colors
  private readonly BOARD_COLOR = 0x0f3460;
  private readonly EMPTY_SLOT_COLOR = 0x1a1a2e;
  private readonly RED_COLOR = 0xe94560;
  private readonly YELLOW_COLOR = 0xf1c40f;
  private readonly HOVER_RED = 0xe94560;
  private readonly HOVER_YELLOW = 0xf1c40f;

  // Callbacks to communicate with Angular
  public onColumnClick: ((column: number) => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'ConnectFourScene' });
  }

  preload(): void {
    const avatarPath = 'assets/sprites/board-game/avatars/images/';
    for (const name of AI_NAMES) {
      this.load.image(`avatar_${name}`, avatarPath + `${name}.png`);
    }
    this.load.on('loaderror', (file: any) => {
      console.warn('Failed to load avatar:', file.key);
    });
  }

  create(): void {
    this.removeWhiteBackground();

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.initBoard();

    this.gridOffset = {
      x: (width - this.cellSize * COLS) / 2,
      y: (height - this.cellSize * ROWS) / 2 + 30
    };

    // Draw the board
    this.drawBoard();

    // Create clickable columns
    this.createColumns();

    // Turn text (right-aligned to leave room for avatar on left)
    this.turnText = this.add.text(width - 10, 35, 'Waiting...', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(1, 0.5);

    this.statusText = this.add.text(width - 10, height - 25, '', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'Arial'
    }).setOrigin(1, 0.5);

    if (this.onReady) this.onReady();
  }

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

  public setOpponentName(name: string): void {
    this.opponentName = name;
    this.drawPlayerInfo();
  }

  private drawPlayerInfo(): void {
    this.avatarObjects.forEach(obj => obj.destroy());
    this.avatarObjects = [];

    const avatarR = 18;
    const avatarX = 35;
    const topY = 35;
    const bottomY = this.cameras.main.height - 25;

    // --- Opponent avatar (top-left) ---
    const opBorderColor = !this.isMyTurn && !this.gameOver ? 0xffd700 : 0x888888;

    if (!this.isMyTurn && !this.gameOver) {
      const glowGfx = this.add.graphics().setDepth(9);
      glowGfx.fillStyle(0xffd700, 0.15);
      glowGfx.fillCircle(avatarX, topY, avatarR + 7);
      this.avatarObjects.push(glowGfx);
    }

    const imageKey = `avatar_${this.opponentName}`;
    const hasSprite = this.textures.exists(imageKey);

    const opAvatarGfx = this.add.graphics().setDepth(10);
    opAvatarGfx.fillStyle(0x1a1a2e, 1);
    opAvatarGfx.fillCircle(avatarX, topY, avatarR);
    opAvatarGfx.lineStyle(3, opBorderColor, 1);
    opAvatarGfx.strokeCircle(avatarX, topY, avatarR + 1);
    this.avatarObjects.push(opAvatarGfx);

    if (hasSprite) {
      const avatarImg = this.add.image(avatarX, topY, imageKey)
        .setDisplaySize(avatarR * 2, avatarR * 2)
        .setDepth(10);
      const maskGfx = this.make.graphics({});
      maskGfx.fillStyle(0xffffff);
      maskGfx.fillCircle(avatarX, topY, avatarR - 1);
      avatarImg.setMask(maskGfx.createGeometryMask());
      this.avatarObjects.push(avatarImg);
      this.avatarObjects.push(maskGfx as unknown as Phaser.GameObjects.GameObject);
    } else {
      const avatar = getAvatarConfig(this.opponentName);
      opAvatarGfx.fillStyle(avatar.color, 1);
      opAvatarGfx.fillCircle(avatarX, topY, avatarR - 2);
      const initialText = this.add.text(avatarX, topY, avatar.initial, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(11);
      this.avatarObjects.push(initialText);
    }

    const opNameText = this.add.text(avatarX + avatarR + 8, topY, this.opponentName, {
      fontSize: '14px', color: '#cccccc', fontFamily: 'Arial'
    }).setOrigin(0, 0.5).setDepth(10);
    this.avatarObjects.push(opNameText);

    // --- Player avatar (bottom-left) ---
    const myBorderColor = this.isMyTurn && !this.gameOver ? 0xffd700 : 0x888888;

    if (this.isMyTurn && !this.gameOver) {
      const glowGfx = this.add.graphics().setDepth(9);
      glowGfx.fillStyle(0xffd700, 0.15);
      glowGfx.fillCircle(avatarX, bottomY, avatarR + 7);
      this.avatarObjects.push(glowGfx);
    }

    const myAvatarGfx = this.add.graphics().setDepth(10);
    myAvatarGfx.fillStyle(0x2e7d32, 1);
    myAvatarGfx.fillCircle(avatarX, bottomY, avatarR);
    myAvatarGfx.lineStyle(3, myBorderColor, 1);
    myAvatarGfx.strokeCircle(avatarX, bottomY, avatarR + 1);
    this.avatarObjects.push(myAvatarGfx);

    const youText = this.add.text(avatarX, bottomY, 'Y', {
      fontSize: '13px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(11);
    this.avatarObjects.push(youText);

    const myNameText = this.add.text(avatarX + avatarR + 8, bottomY, 'YOU', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'Arial'
    }).setOrigin(0, 0.5).setDepth(10);
    this.avatarObjects.push(myNameText);
  }

  private initBoard(): void {
    this.board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
  }

  private drawBoard(): void {
    const graphics = this.add.graphics();

    // Draw blue board background
    graphics.fillStyle(this.BOARD_COLOR);
    graphics.fillRoundedRect(
      this.gridOffset.x - 10,
      this.gridOffset.y - 10,
      this.cellSize * COLS + 20,
      this.cellSize * ROWS + 20,
      12
    );

    // Draw empty slots
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
        const cy = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;
        const radius = this.cellSize * 0.4;

        graphics.fillStyle(this.EMPTY_SLOT_COLOR);
        graphics.fillCircle(cx, cy, radius);
      }
    }
  }

  private createColumns(): void {
    for (let col = 0; col < COLS; col++) {
      const x = this.gridOffset.x + col * this.cellSize;
      const y = this.gridOffset.y;

      const zone = this.add.zone(
        x + this.cellSize / 2,
        y + (this.cellSize * ROWS) / 2,
        this.cellSize,
        this.cellSize * ROWS
      );
      zone.setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => {
        if (!this.gameOver && this.isMyTurn && this.isColumnValid(col)) {
          this.showHoverDisc(col);
        }
      });

      zone.on('pointerout', () => {
        this.clearHoverDisc();
      });

      zone.on('pointerdown', () => {
        if (!this.gameOver && this.isMyTurn && this.isColumnValid(col) && this.onColumnClick) {
          this.onColumnClick(col);
        }
      });
    }
  }

  private isColumnValid(col: number): boolean {
    return this.board[0][col] === null;
  }

  private showHoverDisc(col: number): void {
    this.clearHoverDisc();
    this.hoverColumn = col;

    const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
    const cy = this.gridOffset.y - this.cellSize / 2;
    const radius = this.cellSize * 0.35;

    this.hoverGraphics = this.add.graphics();
    const color = this.mySymbol === 'R' ? this.HOVER_RED : this.HOVER_YELLOW;
    this.hoverGraphics.fillStyle(color, 0.6);
    this.hoverGraphics.fillCircle(cx, cy, radius);

    // Add drop arrow
    this.hoverGraphics.fillStyle(color, 0.8);
    this.hoverGraphics.fillTriangle(
      cx, cy + radius + 8,
      cx - 8, cy + radius,
      cx + 8, cy + radius
    );
  }

  private clearHoverDisc(): void {
    if (this.hoverGraphics) {
      this.hoverGraphics.destroy();
      this.hoverGraphics = null;
    }
    this.hoverColumn = -1;
  }

  public updateBoard(board: (string | null)[][], currentPlayerId: string, myId: string): void {
    this.board = board.map(row => [...row]);
    this.isMyTurn = currentPlayerId === myId;

    const opName = this.opponentName;
    this.turnText.setText(this.isMyTurn ? 'Your turn!' : `${opName}'s turn...`);
    this.turnText.setColor(this.isMyTurn ? '#e94560' : '#888888');

    this.redrawDiscs();
    this.drawPlayerInfo();

    // Update hover if still in valid column
    if (this.hoverColumn !== -1 && this.isMyTurn && this.isColumnValid(this.hoverColumn)) {
      this.showHoverDisc(this.hoverColumn);
    } else {
      this.clearHoverDisc();
    }
  }

  public setSymbol(symbol: 'R' | 'Y'): void {
    this.mySymbol = symbol;
    const colorName = symbol === 'R' ? 'Red' : 'Yellow';
    this.statusText.setText(`You are ${colorName}`);
  }

  private redrawDiscs(): void {
    // Clear old disc graphics
    this.discGraphics.forEach(g => g.destroy());
    this.discGraphics = [];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.board[row][col]) {
          this.drawDisc(row, col, this.board[row][col] as 'R' | 'Y');
        }
      }
    }
  }

  private drawDisc(row: number, col: number, symbol: 'R' | 'Y', highlight = false): void {
    const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
    const cy = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;
    const radius = this.cellSize * 0.4;

    const graphics = this.add.graphics();
    const color = symbol === 'R' ? this.RED_COLOR : this.YELLOW_COLOR;

    if (highlight) {
      // Draw glow effect
      graphics.fillStyle(0xffffff, 0.3);
      graphics.fillCircle(cx, cy, radius + 4);
    }

    graphics.fillStyle(color);
    graphics.fillCircle(cx, cy, radius);

    // Add slight 3D effect
    graphics.fillStyle(0xffffff, 0.2);
    graphics.fillCircle(cx - radius * 0.2, cy - radius * 0.2, radius * 0.3);

    this.discGraphics.push(graphics);
  }

  public animateDiscDrop(row: number, col: number, symbol: 'R' | 'Y'): Promise<void> {
    return new Promise((resolve) => {
      const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
      const startY = this.gridOffset.y - this.cellSize / 2;
      const endY = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;
      const radius = this.cellSize * 0.4;
      const color = symbol === 'R' ? this.RED_COLOR : this.YELLOW_COLOR;

      const graphics = this.add.graphics();

      // Animate the drop
      const duration = 300 + row * 50;  // Longer drop for lower rows

      this.tweens.add({
        targets: { y: startY },
        y: endY,
        duration,
        ease: 'Bounce.easeOut',
        onUpdate: (tween) => {
          const currentY = tween.getValue() as number;
          graphics.clear();
          graphics.fillStyle(color);
          graphics.fillCircle(cx, currentY, radius);
          graphics.fillStyle(0xffffff, 0.2);
          graphics.fillCircle(cx - radius * 0.2, currentY - radius * 0.2, radius * 0.3);
        },
        onComplete: () => {
          this.discGraphics.push(graphics);
          resolve();
        }
      });
    });
  }

  public showGameOver(
    winner: string | null,
    winningLine: { row: number; col: number }[] | null,
    isDraw: boolean,
    myId: string
  ): void {
    this.gameOver = true;
    this.clearHoverDisc();

    if (winningLine) {
      this.highlightWinningLine(winningLine);
    }

    let message: string;
    if (isDraw) {
      message = "It's a draw!";
    } else if (winner === myId) {
      message = 'You win!';
    } else {
      message = 'You lose!';
    }

    this.turnText.setText(message);
    this.turnText.setColor(isDraw ? '#ffff00' : (winner === myId ? '#00ff00' : '#e94560'));
    this.turnText.setFontSize(28);

    this.drawPlayerInfo();
  }

  private highlightWinningLine(line: { row: number; col: number }[]): void {
    // Redraw winning discs with highlight
    for (const { row, col } of line) {
      const symbol = this.board[row][col] as 'R' | 'Y';
      this.drawDisc(row, col, symbol, true);
    }

    // Draw connecting line
    if (line.length >= 2) {
      const graphics = this.add.graphics();
      graphics.setData('winningLine', true);
      graphics.lineStyle(6, 0xffffff, 0.7);

      const startCx = this.gridOffset.x + line[0].col * this.cellSize + this.cellSize / 2;
      const startCy = this.gridOffset.y + line[0].row * this.cellSize + this.cellSize / 2;
      const endCx = this.gridOffset.x + line[line.length - 1].col * this.cellSize + this.cellSize / 2;
      const endCy = this.gridOffset.y + line[line.length - 1].row * this.cellSize + this.cellSize / 2;

      graphics.moveTo(startCx, startCy);
      graphics.lineTo(endCx, endCy);
      graphics.strokePath();
    }
  }

  public resetGame(): void {
    this.initBoard();
    this.gameOver = false;
    this.turnText.setFontSize(20);
    this.clearHoverDisc();

    // Clear all disc graphics
    this.discGraphics.forEach(g => g.destroy());
    this.discGraphics = [];

    // Clear winning line
    const toDestroy: Phaser.GameObjects.GameObject[] = [];
    this.children.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Graphics && child.getData('winningLine')) {
        toDestroy.push(child);
      }
    });
    toDestroy.forEach(c => c.destroy());
  }
}
