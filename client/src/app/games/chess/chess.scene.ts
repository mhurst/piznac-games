import Phaser from 'phaser';

const BOARD_SIZE = 8;

export interface ChessMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotion?: string;
}

export type ChessPiece = string | null; // 'wP','wR','wN','wB','wQ','wK','bP','bR','bN','bB','bQ','bK' or null
export type ChessBoard = ChessPiece[][];

export interface ChessGameState {
  board: ChessBoard;
  currentTurn: 'W' | 'B';
  currentPlayerId: string;
  validMoves: ChessMove[];
  lastMove: ChessMove | null;
  inCheck: { W: boolean; B: boolean };
  gameOver: boolean;
  winner: string | null;
  isDraw: boolean;
}

// Unicode chess piece symbols — use filled set for both sides, color via text style
const PIECE_SYMBOLS: Record<string, string> = {
  'wK': '\u265A', 'wQ': '\u265B', 'wR': '\u265C', 'wB': '\u265D', 'wN': '\u265E', 'wP': '\u265F',
  'bK': '\u265A', 'bQ': '\u265B', 'bR': '\u265C', 'bB': '\u265D', 'bN': '\u265E', 'bP': '\u265F'
};

export class ChessScene extends Phaser.Scene {
  private board: ChessBoard = [];
  private cellSize = 60;
  private gridOffset = { x: 0, y: 0 };
  private isMyTurn = false;
  private myColor: 'W' | 'B' = 'W';
  private gameOver = false;
  private pieceTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private validMoves: ChessMove[] = [];
  private selectedPiece: { row: number; col: number } | null = null;
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private lastMove: ChessMove | null = null;
  private lastMoveGraphics: Phaser.GameObjects.Graphics | null = null;
  private checkGraphics: Phaser.GameObjects.Graphics | null = null;
  private inCheck: { W: boolean; B: boolean } = { W: false, B: false };
  private promotionOverlay: Phaser.GameObjects.Container | null = null;
  private pendingPromotionMove: { fromRow: number; fromCol: number; toRow: number; toCol: number } | null = null;

  // Colors
  private readonly LIGHT_SQUARE = 0xf0d9b5;
  private readonly DARK_SQUARE = 0xb58863;
  private readonly SELECTION_COLOR = 0xffff00;
  private readonly VALID_MOVE_COLOR = 0x00ff00;
  private readonly LAST_MOVE_COLOR = 0xffff00;
  private readonly CHECK_COLOR = 0xff0000;

  // Callbacks
  public onMoveSelected: ((move: ChessMove) => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'ChessScene' });
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

    // Black pieces (top)
    this.board[0] = ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'];
    this.board[1] = ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'];

    // White pieces (bottom)
    this.board[6] = ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'];
    this.board[7] = ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'];
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

    // Rank/file labels
    const labelStyle = { fontSize: '10px', color: '#888888', fontFamily: 'Arial' };
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let col = 0; col < 8; col++) {
      this.add.text(
        this.gridOffset.x + col * this.cellSize + this.cellSize / 2,
        this.gridOffset.y + BOARD_SIZE * this.cellSize + 4,
        files[col], labelStyle
      ).setOrigin(0.5, 0);
    }
    for (let row = 0; row < 8; row++) {
      this.add.text(
        this.gridOffset.x - 12,
        this.gridOffset.y + row * this.cellSize + this.cellSize / 2,
        String(8 - row), labelStyle
      ).setOrigin(0.5);
    }
  }

  private createClickZones(): void {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const x = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
        const y = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;

        const zone = this.add.zone(x, y, this.cellSize, this.cellSize);
        zone.setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.handleClick(row, col));
      }
    }
  }

  private handleClick(row: number, col: number): void {
    if (this.gameOver || !this.isMyTurn || this.promotionOverlay) return;

    const piece = this.board[row][col];

    // Clicking on own piece - select it
    if (piece && this.isMyPiece(piece)) {
      this.selectPiece(row, col);
      return;
    }

    // Clicking on valid move destination
    if (this.selectedPiece && this.isValidMoveDestination(row, col)) {
      const fromRow = this.selectedPiece.row;
      const fromCol = this.selectedPiece.col;
      const movingPiece = this.board[fromRow][fromCol];

      // Check for pawn promotion
      if (movingPiece && movingPiece[1] === 'P' && (row === 0 || row === 7)) {
        this.pendingPromotionMove = { fromRow, fromCol, toRow: row, toCol: col };
        this.showPromotionDialog(row, col);
        return;
      }

      this.makeMove(fromRow, fromCol, row, col);
      return;
    }

    // Clicking elsewhere - deselect
    this.clearSelection();
  }

  private isMyPiece(piece: string): boolean {
    const pieceColor = piece[0] === 'w' ? 'W' : 'B';
    return pieceColor === this.myColor;
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
    if (!this.selectedPiece) return false;
    return this.validMoves.some(m =>
      m.fromRow === this.selectedPiece!.row &&
      m.fromCol === this.selectedPiece!.col &&
      m.toRow === row &&
      m.toCol === col
    );
  }

  private makeMove(fromRow: number, fromCol: number, toRow: number, toCol: number, promotion?: string): void {
    const move: ChessMove = { fromRow, fromCol, toRow, toCol, promotion };
    this.clearSelection();
    if (this.onMoveSelected) {
      this.onMoveSelected(move);
    }
  }

  private showPromotionDialog(row: number, col: number): void {
    this.clearSelection();

    const overlay = this.add.container(0, 0);

    // Dim background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.6);
    bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    overlay.add(bg);

    const colorPrefix = this.myColor === 'W' ? 'w' : 'b';
    const pieces = ['Q', 'R', 'B', 'N'];
    const startX = this.gridOffset.x + col * this.cellSize;
    const startY = row === 0 ? this.gridOffset.y : this.gridOffset.y + (row - 3) * this.cellSize;

    // Background panel
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e, 0.95);
    panelBg.fillRoundedRect(startX - 5, startY - 5, this.cellSize + 10, this.cellSize * 4 + 10, 8);
    panelBg.lineStyle(2, 0xe94560);
    panelBg.strokeRoundedRect(startX - 5, startY - 5, this.cellSize + 10, this.cellSize * 4 + 10, 8);
    overlay.add(panelBg);

    pieces.forEach((p, i) => {
      const y = startY + i * this.cellSize;
      const symbol = PIECE_SYMBOLS[colorPrefix + p];

      const zone = this.add.zone(startX + this.cellSize / 2, y + this.cellSize / 2, this.cellSize, this.cellSize);
      zone.setInteractive({ useHandCursor: true });
      overlay.add(zone);

      const isWhite = this.myColor === 'W';
      const text = this.add.text(startX + this.cellSize / 2, y + this.cellSize / 2, symbol, {
        fontSize: '42px',
        fontFamily: 'Arial',
        color: isWhite ? '#ffffff' : '#1a1a1a',
        stroke: isWhite ? '#333333' : '#888888',
        strokeThickness: isWhite ? 2 : 1
      }).setOrigin(0.5);
      overlay.add(text);

      zone.on('pointerover', () => {
        text.setScale(1.2);
      });
      zone.on('pointerout', () => {
        text.setScale(1);
      });
      zone.on('pointerdown', () => {
        if (this.pendingPromotionMove) {
          const m = this.pendingPromotionMove;
          this.pendingPromotionMove = null;
          this.destroyPromotionOverlay();
          this.makeMove(m.fromRow, m.fromCol, m.toRow, m.toCol, p);
        }
      });
    });

    this.promotionOverlay = overlay;
  }

  private destroyPromotionOverlay(): void {
    if (this.promotionOverlay) {
      this.promotionOverlay.destroy();
      this.promotionOverlay = null;
    }
  }

  private drawHighlights(): void {
    this.clearHighlights();
    this.highlightGraphics = this.add.graphics();

    if (!this.selectedPiece) return;

    // Highlight selected piece
    const sx = this.gridOffset.x + this.selectedPiece.col * this.cellSize;
    const sy = this.gridOffset.y + this.selectedPiece.row * this.cellSize;
    this.highlightGraphics.fillStyle(this.SELECTION_COLOR, 0.4);
    this.highlightGraphics.fillRect(sx, sy, this.cellSize, this.cellSize);

    // Highlight valid destinations
    const movesForPiece = this.validMoves.filter(m =>
      m.fromRow === this.selectedPiece!.row && m.fromCol === this.selectedPiece!.col
    );

    for (const move of movesForPiece) {
      const mx = this.gridOffset.x + move.toCol * this.cellSize;
      const my = this.gridOffset.y + move.toRow * this.cellSize;

      const isCapture = this.board[move.toRow][move.toCol] !== null;

      if (isCapture) {
        // Capture highlight - ring around the square
        this.highlightGraphics.lineStyle(3, this.VALID_MOVE_COLOR, 0.7);
        this.highlightGraphics.strokeRect(mx + 2, my + 2, this.cellSize - 4, this.cellSize - 4);
      } else {
        // Move dot
        this.highlightGraphics.fillStyle(this.VALID_MOVE_COLOR, 0.5);
        this.highlightGraphics.fillCircle(
          mx + this.cellSize / 2,
          my + this.cellSize / 2,
          this.cellSize * 0.15
        );
      }
    }
  }

  private clearHighlights(): void {
    if (this.highlightGraphics) {
      this.highlightGraphics.destroy();
      this.highlightGraphics = null;
    }
  }

  private drawLastMove(): void {
    if (this.lastMoveGraphics) {
      this.lastMoveGraphics.destroy();
      this.lastMoveGraphics = null;
    }

    if (!this.lastMove) return;

    this.lastMoveGraphics = this.add.graphics();
    this.lastMoveGraphics.fillStyle(this.LAST_MOVE_COLOR, 0.2);

    const fromX = this.gridOffset.x + this.lastMove.fromCol * this.cellSize;
    const fromY = this.gridOffset.y + this.lastMove.fromRow * this.cellSize;
    this.lastMoveGraphics.fillRect(fromX, fromY, this.cellSize, this.cellSize);

    const toX = this.gridOffset.x + this.lastMove.toCol * this.cellSize;
    const toY = this.gridOffset.y + this.lastMove.toRow * this.cellSize;
    this.lastMoveGraphics.fillRect(toX, toY, this.cellSize, this.cellSize);
  }

  private drawCheckHighlight(): void {
    if (this.checkGraphics) {
      this.checkGraphics.destroy();
      this.checkGraphics = null;
    }

    // Highlight king in check
    for (const color of ['W', 'B'] as const) {
      if (this.inCheck[color]) {
        const kingPiece = color === 'W' ? 'wK' : 'bK';
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (this.board[r][c] === kingPiece) {
              this.checkGraphics = this.add.graphics();
              const x = this.gridOffset.x + c * this.cellSize;
              const y = this.gridOffset.y + r * this.cellSize;
              this.checkGraphics.fillStyle(this.CHECK_COLOR, 0.4);
              this.checkGraphics.fillRect(x, y, this.cellSize, this.cellSize);
              return;
            }
          }
        }
      }
    }
  }

  public updateState(
    board: ChessBoard,
    currentPlayerId: string,
    myId: string,
    validMoves: ChessMove[],
    lastMove: ChessMove | null,
    inCheck: { W: boolean; B: boolean }
  ): void {
    this.board = board.map(row => [...row]);
    this.isMyTurn = currentPlayerId === myId;
    this.validMoves = this.isMyTurn ? validMoves : [];
    this.lastMove = lastMove;
    this.inCheck = inCheck;

    const checkMsg = this.isMyTurn && inCheck[this.myColor] ? ' - Check!' : '';
    this.turnText.setText(this.isMyTurn ? `Your turn!${checkMsg}` : "Opponent's turn...");
    this.turnText.setColor(this.isMyTurn ? '#e94560' : '#888888');

    this.drawLastMove();
    this.drawCheckHighlight();
    this.redrawPieces();
    this.clearSelection();
  }

  public setSymbol(color: 'W' | 'B'): void {
    this.myColor = color;
    const colorName = color === 'W' ? 'White' : 'Black';
    this.statusText.setText(`You are ${colorName} (${color === 'W' ? 'first' : 'second'})`);
  }

  private redrawPieces(): void {
    this.pieceTexts.forEach(text => text.destroy());
    this.pieceTexts.clear();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (piece) {
          this.drawPiece(row, col, piece);
        }
      }
    }
  }

  private drawPiece(row: number, col: number, piece: string): void {
    const cx = this.gridOffset.x + col * this.cellSize + this.cellSize / 2;
    const cy = this.gridOffset.y + row * this.cellSize + this.cellSize / 2;

    const symbol = PIECE_SYMBOLS[piece] || '?';
    const isWhite = piece[0] === 'w';

    const text = this.add.text(cx, cy, symbol, {
      fontSize: '42px',
      fontFamily: 'Arial',
      color: isWhite ? '#ffffff' : '#1a1a1a',
      stroke: isWhite ? '#333333' : '#888888',
      strokeThickness: isWhite ? 2 : 1
    }).setOrigin(0.5);

    this.pieceTexts.set(`${row}-${col}`, text);
  }

  public animateMove(move: ChessMove): Promise<void> {
    return new Promise((resolve) => {
      const key = `${move.fromRow}-${move.fromCol}`;
      const text = this.pieceTexts.get(key);

      if (!text) {
        resolve();
        return;
      }

      const targetX = this.gridOffset.x + move.toCol * this.cellSize + this.cellSize / 2;
      const targetY = this.gridOffset.y + move.toRow * this.cellSize + this.cellSize / 2;

      // Fade out captured piece
      const capturedKey = `${move.toRow}-${move.toCol}`;
      const capturedText = this.pieceTexts.get(capturedKey);
      if (capturedText) {
        this.tweens.add({
          targets: capturedText,
          alpha: 0,
          scale: 0.5,
          duration: 200,
          onComplete: () => {
            capturedText.destroy();
            this.pieceTexts.delete(capturedKey);
          }
        });
      }

      // Animate piece movement
      this.tweens.add({
        targets: text,
        x: targetX,
        y: targetY,
        duration: 250,
        ease: 'Power2',
        onComplete: () => {
          this.pieceTexts.delete(key);
          this.pieceTexts.set(`${move.toRow}-${move.toCol}`, text);
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
      message = "Draw!";
    } else if (winner === myId) {
      message = 'Checkmate - You win!';
    } else {
      message = 'Checkmate - You lose!';
    }

    this.turnText.setText(message);
    this.turnText.setColor(isDraw ? '#ffff00' : (winner === myId ? '#00ff00' : '#e94560'));
    this.turnText.setFontSize(32);
  }

  public resetGame(): void {
    this.initBoard();
    this.gameOver = false;
    this.selectedPiece = null;
    this.validMoves = [];
    this.lastMove = null;
    this.inCheck = { W: false, B: false };
    this.pendingPromotionMove = null;
    this.turnText.setFontSize(24);
    this.clearHighlights();
    this.destroyPromotionOverlay();

    if (this.lastMoveGraphics) {
      this.lastMoveGraphics.destroy();
      this.lastMoveGraphics = null;
    }
    if (this.checkGraphics) {
      this.checkGraphics.destroy();
      this.checkGraphics = null;
    }

    this.pieceTexts.forEach(text => text.destroy());
    this.pieceTexts.clear();

    this.redrawPieces();
  }
}
