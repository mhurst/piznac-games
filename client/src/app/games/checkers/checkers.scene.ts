import Phaser from 'phaser';

const BOARD_SIZE = 8;

export interface CheckersMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export class CheckersScene extends Phaser.Scene {
  private board: (null | 'r' | 'R' | 'b' | 'B')[][] = [];
  private cellSize = 60;
  private gridOffset = { x: 0, y: 0 };
  private isMyTurn = false;
  private mySymbol: 'R' | 'B' = 'R';
  private gameOver = false;
  private pieceGraphics: Map<string, Phaser.GameObjects.Container> = new Map();
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private validMoves: CheckersMove[] = [];
  private selectedPiece: { row: number; col: number } | null = null;
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private mustContinueFrom: { row: number; col: number } | null = null;

  // Colors
  private readonly LIGHT_SQUARE = 0xc4a776;
  private readonly DARK_SQUARE = 0x8b5a2b;
  private readonly RED_PIECE = 0xe94560;
  private readonly BLACK_PIECE = 0x2d2d2d;
  private readonly SELECTION_COLOR = 0xffff00;
  private readonly VALID_MOVE_COLOR = 0x00ff00;
  private readonly KING_CROWN_COLOR = 0xffd700;

  // Callbacks
  public onMoveSelected: ((move: CheckersMove) => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'CheckersScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.initBoard();

    this.gridOffset = {
      x: (width - this.cellSize * BOARD_SIZE) / 2,
      y: (height - this.cellSize * BOARD_SIZE) / 2 + 20
    };

    this.drawBoard();
    this.createClickZones();

    this.turnText = this.add.text(width / 2, 30, 'Waiting...', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, height - 25, '', {
      fontSize: '18px',
      color: '#888888',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    if (this.onReady) this.onReady();
  }

  private initBoard(): void {
    this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

    // Red at top (rows 0-2)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if ((row + col) % 2 === 1) {
          this.board[row][col] = 'r';
        }
      }
    }

    // Black at bottom (rows 5-7)
    for (let row = 5; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if ((row + col) % 2 === 1) {
          this.board[row][col] = 'b';
        }
      }
    }
  }

  private drawBoard(): void {
    const graphics = this.add.graphics();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const x = this.gridOffset.x + col * this.cellSize;
        const y = this.gridOffset.y + row * this.cellSize;
        const isLight = (row + col) % 2 === 0;

        graphics.fillStyle(isLight ? this.LIGHT_SQUARE : this.DARK_SQUARE);
        graphics.fillRect(x, y, this.cellSize, this.cellSize);
      }
    }

    // Board border
    graphics.lineStyle(3, 0x1a1a2e);
    graphics.strokeRect(
      this.gridOffset.x,
      this.gridOffset.y,
      this.cellSize * BOARD_SIZE,
      this.cellSize * BOARD_SIZE
    );
  }

  private createClickZones(): void {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        // Only dark squares are playable
        if ((row + col) % 2 === 0) continue;

        const x = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
        const y = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;

        const zone = this.add.zone(x, y, this.cellSize, this.cellSize);
        zone.setInteractive({ useHandCursor: true });

        zone.on('pointerdown', () => this.handleClick(row, col));
      }
    }
  }

  private handleClick(row: number, col: number): void {
    if (this.gameOver || !this.isMyTurn) return;

    const piece = this.board[row][col];

    // If we must continue chain jump, only allow clicking valid destinations
    if (this.mustContinueFrom) {
      if (this.isValidMoveDestination(row, col)) {
        this.makeMove(this.mustContinueFrom.row, this.mustContinueFrom.col, row, col);
      }
      return;
    }

    // Clicking on own piece - select it
    if (piece && this.isMyPiece(piece)) {
      this.selectPiece(row, col);
      return;
    }

    // Clicking on valid move destination
    if (this.selectedPiece && this.isValidMoveDestination(row, col)) {
      this.makeMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
      return;
    }

    // Clicking elsewhere - deselect
    this.clearSelection();
  }

  private isMyPiece(piece: 'r' | 'R' | 'b' | 'B'): boolean {
    return piece.toUpperCase() === this.mySymbol;
  }

  private selectPiece(row: number, col: number): void {
    this.selectedPiece = { row, col };
    this.drawHighlights();
  }

  private clearSelection(): void {
    this.selectedPiece = null;
    this.clearHighlights();
  }

  private isValidMoveDestination(row: number, col: number): boolean {
    if (!this.selectedPiece && !this.mustContinueFrom) return false;

    const from = this.mustContinueFrom || this.selectedPiece!;
    return this.validMoves.some(m =>
      m.fromRow === from.row &&
      m.fromCol === from.col &&
      m.toRow === row &&
      m.toCol === col
    );
  }

  private makeMove(fromRow: number, fromCol: number, toRow: number, toCol: number): void {
    const move: CheckersMove = { fromRow, fromCol, toRow, toCol };
    this.clearSelection();
    if (this.onMoveSelected) {
      this.onMoveSelected(move);
    }
  }

  private drawHighlights(): void {
    this.clearHighlights();
    this.highlightGraphics = this.add.graphics();

    const from = this.mustContinueFrom || this.selectedPiece;
    if (!from) return;

    // Highlight selected piece
    const sx = this.gridOffset.x + from.col * this.cellSize;
    const sy = this.gridOffset.y + from.row * this.cellSize;
    this.highlightGraphics.fillStyle(this.SELECTION_COLOR, 0.4);
    this.highlightGraphics.fillRect(sx, sy, this.cellSize, this.cellSize);

    // Highlight valid destinations
    const movesForPiece = this.validMoves.filter(m =>
      m.fromRow === from.row && m.fromCol === from.col
    );

    for (const move of movesForPiece) {
      const mx = this.gridOffset.x + move.toCol * this.cellSize;
      const my = this.gridOffset.y + move.toRow * this.cellSize;
      this.highlightGraphics.fillStyle(this.VALID_MOVE_COLOR, 0.3);
      this.highlightGraphics.fillRect(mx, my, this.cellSize, this.cellSize);

      // Draw dot indicator
      this.highlightGraphics.fillStyle(this.VALID_MOVE_COLOR, 0.6);
      this.highlightGraphics.fillCircle(
        mx + this.cellSize / 2,
        my + this.cellSize / 2,
        this.cellSize * 0.15
      );
    }
  }

  private clearHighlights(): void {
    if (this.highlightGraphics) {
      this.highlightGraphics.destroy();
      this.highlightGraphics = null;
    }
  }

  public updateState(
    board: (null | 'r' | 'R' | 'b' | 'B')[][],
    currentPlayerId: string,
    myId: string,
    validMoves: CheckersMove[],
    mustContinueFrom: { row: number; col: number } | null
  ): void {
    this.board = board.map(row => [...row]) as (null | 'r' | 'R' | 'b' | 'B')[][];
    this.isMyTurn = currentPlayerId === myId;
    this.validMoves = this.isMyTurn ? validMoves : [];
    this.mustContinueFrom = mustContinueFrom;

    if (mustContinueFrom && this.isMyTurn) {
      this.turnText.setText('Continue jumping!');
      this.turnText.setColor('#ffff00');
    } else {
      this.turnText.setText(this.isMyTurn ? 'Your turn!' : "Opponent's turn...");
      this.turnText.setColor(this.isMyTurn ? '#e94560' : '#888888');
    }

    this.redrawPieces();

    // Handle chain jump highlighting
    if (mustContinueFrom && this.isMyTurn) {
      this.selectedPiece = mustContinueFrom;
      this.drawHighlights();
    } else {
      this.clearSelection();
    }
  }

  public setSymbol(symbol: 'R' | 'B'): void {
    this.mySymbol = symbol;
    const colorName = symbol === 'R' ? 'Red' : 'Black';
    this.statusText.setText(`You are ${colorName} (${symbol === 'R' ? 'first' : 'second'})`);
  }

  private redrawPieces(): void {
    // Clear existing pieces
    this.pieceGraphics.forEach(container => container.destroy());
    this.pieceGraphics.clear();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (piece) {
          this.drawPiece(row, col, piece);
        }
      }
    }
  }

  private drawPiece(row: number, col: number, piece: 'r' | 'R' | 'b' | 'B'): void {
    const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
    const cy = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;
    const radius = this.cellSize * 0.38;

    const container = this.add.container(cx, cy);
    const graphics = this.add.graphics();

    const isRed = piece === 'r' || piece === 'R';
    const isKing = piece === 'R' || piece === 'B';
    const color = isRed ? this.RED_PIECE : this.BLACK_PIECE;

    // Shadow
    graphics.fillStyle(0x000000, 0.3);
    graphics.fillCircle(3, 3, radius);

    // Main circle
    graphics.fillStyle(color);
    graphics.fillCircle(0, 0, radius);

    // Inner ring for depth
    graphics.lineStyle(2, isRed ? 0xc73550 : 0x1a1a1a);
    graphics.strokeCircle(0, 0, radius * 0.7);

    // Highlight
    graphics.fillStyle(0xffffff, 0.15);
    graphics.fillCircle(-radius * 0.25, -radius * 0.25, radius * 0.35);

    container.add(graphics);

    // King crown
    if (isKing) {
      const crownGraphics = this.add.graphics();

      // Crown shape
      crownGraphics.fillStyle(this.KING_CROWN_COLOR);
      crownGraphics.lineStyle(1, 0xb8860b);

      const cw = radius * 0.8;  // Crown width
      const ch = radius * 0.5;  // Crown height

      // Draw crown polygon
      crownGraphics.beginPath();
      crownGraphics.moveTo(-cw / 2, ch / 3);  // Bottom left
      crownGraphics.lineTo(-cw / 2, -ch / 3);  // Left side
      crownGraphics.lineTo(-cw / 3, 0);  // Left valley
      crownGraphics.lineTo(-cw / 6, -ch / 2);  // Left peak
      crownGraphics.lineTo(0, -ch / 4);  // Center valley
      crownGraphics.lineTo(cw / 6, -ch / 2);  // Right peak
      crownGraphics.lineTo(cw / 3, 0);  // Right valley
      crownGraphics.lineTo(cw / 2, -ch / 3);  // Right side
      crownGraphics.lineTo(cw / 2, ch / 3);  // Bottom right
      crownGraphics.closePath();
      crownGraphics.fillPath();
      crownGraphics.strokePath();

      container.add(crownGraphics);
    }

    this.pieceGraphics.set(`${row}-${col}`, container);
  }

  public animateMove(move: CheckersMove, captured: { row: number; col: number } | null): Promise<void> {
    return new Promise((resolve) => {
      const key = `${move.fromRow}-${move.fromCol}`;
      const container = this.pieceGraphics.get(key);

      if (!container) {
        resolve();
        return;
      }

      const targetX = this.gridOffset.x + move.toCol * this.cellSize + this.cellSize / 2;
      const targetY = this.gridOffset.y + move.toRow * this.cellSize + this.cellSize / 2;

      // Animate captured piece fade out
      if (captured) {
        const capturedKey = `${captured.row}-${captured.col}`;
        const capturedContainer = this.pieceGraphics.get(capturedKey);
        if (capturedContainer) {
          this.tweens.add({
            targets: capturedContainer,
            alpha: 0,
            scale: 0.5,
            duration: 200,
            onComplete: () => {
              capturedContainer.destroy();
              this.pieceGraphics.delete(capturedKey);
            }
          });
        }
      }

      // Animate piece movement
      this.tweens.add({
        targets: container,
        x: targetX,
        y: targetY,
        duration: 250,
        ease: 'Power2',
        onComplete: () => {
          // Update key in map
          this.pieceGraphics.delete(key);
          this.pieceGraphics.set(`${move.toRow}-${move.toCol}`, container);
          resolve();
        }
      });
    });
  }

  public showGameOver(winner: string | null, isDraw: boolean, myId: string): void {
    this.gameOver = true;
    this.clearSelection();

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

  public resetGame(): void {
    this.initBoard();
    this.gameOver = false;
    this.selectedPiece = null;
    this.mustContinueFrom = null;
    this.validMoves = [];
    this.turnText.setFontSize(24);
    this.clearHighlights();

    this.pieceGraphics.forEach(container => container.destroy());
    this.pieceGraphics.clear();

    this.redrawPieces();
  }
}
