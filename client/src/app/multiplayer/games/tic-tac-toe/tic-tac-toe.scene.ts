import Phaser from 'phaser';

export class TicTacToeScene extends Phaser.Scene {
  private board: (string | null)[] = Array(9).fill(null);
  private cellSize = 150;
  private gridOffset = { x: 0, y: 0 };
  private isMyTurn = false;
  private mySymbol: 'X' | 'O' = 'X';
  private gameOver = false;
  private cellGraphics: Phaser.GameObjects.Graphics[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  // Callbacks to communicate with Angular
  public onCellClick: ((cellIndex: number) => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'TicTacToeScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.gridOffset = {
      x: (width - this.cellSize * 3) / 2,
      y: (height - this.cellSize * 3) / 2 + 20
    };

    // Draw the grid
    this.drawGrid();

    // Create clickable cells
    this.createCells();

    // Status text
    this.turnText = this.add.text(width / 2, 40, 'Waiting...', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, height - 40, '', {
      fontSize: '18px',
      color: '#888888',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    if (this.onReady) this.onReady();
  }

  private drawGrid(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(4, 0x0f3460);

    const ox = this.gridOffset.x;
    const oy = this.gridOffset.y;
    const cs = this.cellSize;

    // Vertical lines
    graphics.moveTo(ox + cs, oy);
    graphics.lineTo(ox + cs, oy + cs * 3);
    graphics.moveTo(ox + cs * 2, oy);
    graphics.lineTo(ox + cs * 2, oy + cs * 3);

    // Horizontal lines
    graphics.moveTo(ox, oy + cs);
    graphics.lineTo(ox + cs * 3, oy + cs);
    graphics.moveTo(ox, oy + cs * 2);
    graphics.lineTo(ox + cs * 3, oy + cs * 2);

    graphics.strokePath();
  }

  private createCells(): void {
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = this.gridOffset.x + col * this.cellSize;
      const y = this.gridOffset.y + row * this.cellSize;

      const zone = this.add.zone(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize, this.cellSize);
      zone.setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => {
        if (!this.gameOver && this.isMyTurn && this.board[i] === null) {
          this.drawHover(i);
        }
      });

      zone.on('pointerout', () => {
        this.clearHover(i);
      });

      zone.on('pointerdown', () => {
        if (!this.gameOver && this.isMyTurn && this.board[i] === null && this.onCellClick) {
          this.onCellClick(i);
        }
      });
    }
  }

  private drawHover(index: number): void {
    this.clearHover(index);
    const row = Math.floor(index / 3);
    const col = index % 3;
    const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
    const cy = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;

    const graphics = this.add.graphics();
    graphics.fillStyle(0x0f3460, 0.3);
    graphics.fillRect(
      this.gridOffset.x + col * this.cellSize + 4,
      this.gridOffset.y + row * this.cellSize + 4,
      this.cellSize - 8,
      this.cellSize - 8
    );
    graphics.setData('hover', true);
    graphics.setData('cellIndex', index);
  }

  private clearHover(index: number): void {
    this.children.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Graphics &&
          child.getData('hover') === true &&
          child.getData('cellIndex') === index) {
        child.destroy();
      }
    });
  }

  public updateBoard(board: (string | null)[], currentPlayerId: string, myId: string): void {
    this.board = board;
    this.isMyTurn = currentPlayerId === myId;

    // Determine my symbol
    this.turnText.setText(this.isMyTurn ? 'Your turn!' : "Opponent's turn...");
    this.turnText.setColor(this.isMyTurn ? '#e94560' : '#888888');

    // Redraw all pieces
    this.redrawPieces();
  }

  public setSymbol(symbol: 'X' | 'O'): void {
    this.mySymbol = symbol;
    this.statusText.setText(`You are ${symbol}`);
  }

  private redrawPieces(): void {
    // Clear old piece graphics
    this.cellGraphics.forEach(g => g.destroy());
    this.cellGraphics = [];

    for (let i = 0; i < 9; i++) {
      if (this.board[i]) {
        this.drawPiece(i, this.board[i] as 'X' | 'O');
      }
    }
  }

  private drawPiece(index: number, symbol: 'X' | 'O'): void {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
    const cy = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;
    const size = this.cellSize * 0.3;

    const graphics = this.add.graphics();

    if (symbol === 'X') {
      graphics.lineStyle(6, 0xe94560);
      graphics.moveTo(cx - size, cy - size);
      graphics.lineTo(cx + size, cy + size);
      graphics.moveTo(cx + size, cy - size);
      graphics.lineTo(cx - size, cy + size);
      graphics.strokePath();
    } else {
      graphics.lineStyle(6, 0x0f3460);
      graphics.strokeCircle(cx, cy, size);
    }

    this.cellGraphics.push(graphics);
  }

  public showGameOver(winner: string | null, winningLine: number[] | null, isDraw: boolean, myId: string): void {
    this.gameOver = true;

    if (winningLine) {
      this.drawWinningLine(winningLine);
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
    this.turnText.setFontSize(32);
  }

  private drawWinningLine(line: number[]): void {
    const getCenter = (index: number) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      return {
        x: this.gridOffset.x + col * this.cellSize + this.cellSize / 2,
        y: this.gridOffset.y + row * this.cellSize + this.cellSize / 2
      };
    };

    const start = getCenter(line[0]);
    const end = getCenter(line[2]);

    const graphics = this.add.graphics();
    graphics.setData('winningLine', true);
    graphics.lineStyle(8, 0xffff00, 0.8);
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.strokePath();
  }

  public resetGame(): void {
    this.board = Array(9).fill(null);
    this.gameOver = false;
    this.turnText.setFontSize(24);

    // Clear all piece graphics
    this.cellGraphics.forEach(g => g.destroy());
    this.cellGraphics = [];

    // Clear winning line and hover effects
    const toDestroy: Phaser.GameObjects.GameObject[] = [];
    this.children.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Graphics && (child.getData('hover') || child.getData('winningLine'))) {
        toDestroy.push(child);
      }
    });
    toDestroy.forEach(c => c.destroy());
  }
}
