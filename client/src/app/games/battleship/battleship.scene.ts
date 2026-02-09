import Phaser from 'phaser';

const BOARD_SIZE = 10;
const CELL_SIZE = 36;
const BOARD_PADDING = 20;

export interface ShipConfig {
  type: string;
  size: number;
  name: string;
}

export interface ShipPlacement {
  shipType: string;
  row: number;
  col: number;
  horizontal: boolean;
}

export interface PlacedShip extends ShipPlacement {
  size: number;
  hits: { row: number; col: number }[];
  sunk: boolean;
}

export const SHIPS: ShipConfig[] = [
  { type: 'carrier', size: 5, name: 'Carrier' },
  { type: 'battleship', size: 4, name: 'Battleship' },
  { type: 'cruiser', size: 3, name: 'Cruiser' },
  { type: 'submarine', size: 3, name: 'Submarine' },
  { type: 'destroyer', size: 2, name: 'Destroyer' }
];

export class BattleshipScene extends Phaser.Scene {
  // Phase management
  private phase: 'setup' | 'battle' = 'setup';
  private isMyTurn = false;
  private gameOver = false;

  // Boards
  private myBoard: (string | null)[][] = [];
  private trackingBoard: (string | null)[][] = [];

  // Ships
  private myShips: Record<string, PlacedShip> = {};
  private opponentSunkShips: string[] = [];  // Track which enemy ships are sunk
  private sunkEnemyShipsData: PlacedShip[] = [];  // Full data for sunk enemy ships (for strikethrough)
  private placingShip: ShipConfig | null = null;
  private placingHorizontal = true;

  // Graphics containers
  private myBoardGraphics: Phaser.GameObjects.Graphics | null = null;
  private trackingBoardGraphics: Phaser.GameObjects.Graphics | null = null;
  private shipGraphics: Phaser.GameObjects.Graphics[] = [];
  private markerGraphics: Phaser.GameObjects.Graphics[] = [];
  private hoverGraphics: Phaser.GameObjects.Graphics | null = null;
  private shipDockGraphics: Phaser.GameObjects.Graphics[] = [];
  private dynamicElements: Phaser.GameObjects.GameObject[] = [];  // Track all dynamic elements for cleanup

  // Board positions
  private myBoardOffset = { x: 0, y: 0 };
  private trackingBoardOffset = { x: 0, y: 0 };
  private shipDockOffset = { x: 0, y: 0 };

  // UI elements
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private myBoardLabel!: Phaser.GameObjects.Text;
  private trackingBoardLabel!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  // Colors
  private readonly WATER_COLOR = 0x1a1a2e;
  private readonly WATER_LIGHT = 0x16213e;
  private readonly GRID_COLOR = 0x0f3460;
  private readonly SHIP_COLOR = 0x4a5568;
  private readonly SHIP_PLACED_COLOR = 0x2d3748;
  private readonly HIT_COLOR = 0xe94560;
  private readonly MISS_COLOR = 0xffffff;
  private readonly HOVER_VALID = 0x00ff00;
  private readonly HOVER_INVALID = 0xff0000;
  private readonly SUNK_COLOR = 0x8b0000;

  // Callbacks to communicate with Angular
  public onCellClick: ((row: number, col: number) => void) | null = null;
  public onShipPlaced: ((placement: ShipPlacement) => void) | null = null;
  public onSetupComplete: (() => void) | null = null;
  public onAutoPlace: (() => void) | null = null;
  public onReady: (() => void) | null = null;

  constructor() {
    super({ key: 'BattleshipScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.initBoards();
    this.calculateLayouts(width, height);

    // Status text at top
    this.turnText = this.add.text(width / 2, 25, 'Place your ships!', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, height - 20, '', {
      fontSize: '16px',
      color: '#888888',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Instruction text
    this.instructionText = this.add.text(width / 2, 50, 'Click a ship to select, then click the grid to place. Press R to rotate.', {
      fontSize: '14px',
      color: '#aaaaaa',
      fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Draw initial setup phase
    this.drawSetupPhase();

    // Keyboard for rotation
    this.input.keyboard?.on('keydown-R', () => {
      if (this.phase === 'setup' && this.placingShip) {
        this.placingHorizontal = !this.placingHorizontal;
        this.statusText.setText(`Placing ${this.placingShip.name} (${this.placingHorizontal ? 'Horizontal' : 'Vertical'})`);
      }
    });

    if (this.onReady) this.onReady();
  }

  private initBoards(): void {
    this.myBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.trackingBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    this.myShips = {};
  }

  private calculateLayouts(width: number, height: number): void {
    const boardWidth = CELL_SIZE * BOARD_SIZE;
    const boardHeight = CELL_SIZE * BOARD_SIZE;

    if (this.phase === 'setup') {
      // Setup: board on left, ship dock on right
      this.myBoardOffset = {
        x: (width - boardWidth - 180) / 2,
        y: (height - boardHeight) / 2 + 30
      };
      this.shipDockOffset = {
        x: this.myBoardOffset.x + boardWidth + 30,
        y: this.myBoardOffset.y
      };
    } else {
      // Battle: two boards side by side
      const totalWidth = boardWidth * 2 + 60;
      const startX = (width - totalWidth) / 2;

      this.myBoardOffset = {
        x: startX,
        y: (height - boardHeight) / 2 + 30
      };
      this.trackingBoardOffset = {
        x: startX + boardWidth + 60,
        y: (height - boardHeight) / 2 + 30
      };
    }
  }

  // ===== SETUP PHASE =====

  private drawSetupPhase(): void {
    this.clearAllGraphics();
    this.calculateLayouts(this.cameras.main.width, this.cameras.main.height);

    // Draw my board
    this.drawBoard(this.myBoardOffset, 'Your Fleet', true);

    // Draw ship dock
    this.drawShipDock();

    // Create interactive zones for my board
    this.createBoardInteraction(this.myBoardOffset, 'my');
  }

  private drawBoard(offset: { x: number; y: number }, label: string, isMyBoard: boolean): void {
    const graphics = this.add.graphics();

    // Background
    graphics.fillStyle(this.WATER_COLOR);
    graphics.fillRoundedRect(
      offset.x - 10,
      offset.y - 10,
      CELL_SIZE * BOARD_SIZE + 20,
      CELL_SIZE * BOARD_SIZE + 20,
      8
    );

    // Grid
    graphics.lineStyle(1, this.GRID_COLOR, 0.5);

    for (let i = 0; i <= BOARD_SIZE; i++) {
      // Vertical lines
      graphics.moveTo(offset.x + i * CELL_SIZE, offset.y);
      graphics.lineTo(offset.x + i * CELL_SIZE, offset.y + BOARD_SIZE * CELL_SIZE);
      // Horizontal lines
      graphics.moveTo(offset.x, offset.y + i * CELL_SIZE);
      graphics.lineTo(offset.x + BOARD_SIZE * CELL_SIZE, offset.y + i * CELL_SIZE);
    }
    graphics.strokePath();

    // Cell backgrounds with slight variation
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const shade = (row + col) % 2 === 0 ? this.WATER_COLOR : this.WATER_LIGHT;
        graphics.fillStyle(shade);
        graphics.fillRect(
          offset.x + col * CELL_SIZE + 1,
          offset.y + row * CELL_SIZE + 1,
          CELL_SIZE - 2,
          CELL_SIZE - 2
        );
      }
    }

    // Row labels (1-10)
    for (let i = 0; i < BOARD_SIZE; i++) {
      const rowLabel = this.add.text(offset.x - 15, offset.y + i * CELL_SIZE + CELL_SIZE / 2, `${i + 1}`, {
        fontSize: '12px',
        color: '#666666',
        fontFamily: 'Arial'
      }).setOrigin(0.5);
      this.dynamicElements.push(rowLabel);
    }

    // Column labels (A-J)
    const cols = 'ABCDEFGHIJ';
    for (let i = 0; i < BOARD_SIZE; i++) {
      const colLabel = this.add.text(offset.x + i * CELL_SIZE + CELL_SIZE / 2, offset.y - 15, cols[i], {
        fontSize: '12px',
        color: '#666666',
        fontFamily: 'Arial'
      }).setOrigin(0.5);
      this.dynamicElements.push(colLabel);
    }

    // Label
    const labelText = this.add.text(
      offset.x + (CELL_SIZE * BOARD_SIZE) / 2,
      offset.y + CELL_SIZE * BOARD_SIZE + 20,
      label,
      { fontSize: '16px', color: '#ffffff', fontFamily: 'Arial' }
    ).setOrigin(0.5);
    this.dynamicElements.push(labelText);

    if (isMyBoard) {
      this.myBoardGraphics = graphics;
      this.myBoardLabel = labelText;
    } else {
      this.trackingBoardGraphics = graphics;
      this.trackingBoardLabel = labelText;
    }
  }

  private drawShipDock(): void {
    const dockX = this.shipDockOffset.x;
    const dockY = this.shipDockOffset.y;

    // Title
    const titleText = this.add.text(dockX + 60, dockY - 25, 'Ships', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);
    this.dynamicElements.push(titleText);

    let yPos = dockY;

    SHIPS.forEach((ship) => {
      const isPlaced = !!this.myShips[ship.type];
      const graphics = this.add.graphics();

      // Ship rectangle in dock
      const shipWidth = ship.size * 20;
      const shipHeight = 25;

      graphics.fillStyle(isPlaced ? this.SHIP_PLACED_COLOR : this.SHIP_COLOR);
      graphics.fillRoundedRect(dockX, yPos, shipWidth, shipHeight, 4);

      // Border
      graphics.lineStyle(2, isPlaced ? 0x555555 : 0x666666);
      graphics.strokeRoundedRect(dockX, yPos, shipWidth, shipHeight, 4);

      this.shipDockGraphics.push(graphics);

      // Ship name
      const nameText = this.add.text(dockX + shipWidth + 10, yPos + shipHeight / 2, ship.name, {
        fontSize: '12px',
        color: isPlaced ? '#555555' : '#ffffff',
        fontFamily: 'Arial'
      }).setOrigin(0, 0.5);
      this.dynamicElements.push(nameText);

      // Make clickable if not placed
      if (!isPlaced) {
        const zone = this.add.zone(dockX + shipWidth / 2, yPos + shipHeight / 2, shipWidth, shipHeight);
        zone.setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          this.selectShipToPlace(ship);
        });
      }

      yPos += shipHeight + 10;
    });

    // Auto-place button
    yPos += 20;
    this.createButton(dockX, yPos, 120, 35, 'Auto-Place', () => {
      if (this.onAutoPlace) this.onAutoPlace();
    });

    // Ready button (only when all ships placed)
    yPos += 45;
    const allPlaced = SHIPS.every(s => !!this.myShips[s.type]);
    if (allPlaced) {
      this.createButton(dockX, yPos, 120, 35, 'Ready!', () => {
        if (this.onSetupComplete) this.onSetupComplete();
      }, 0x00aa00);
    }
  }

  private createButton(x: number, y: number, width: number, height: number, text: string, onClick: () => void, color = 0x0f3460): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(color);
    graphics.fillRoundedRect(x, y, width, height, 6);
    graphics.lineStyle(2, 0xffffff, 0.3);
    graphics.strokeRoundedRect(x, y, width, height, 6);
    this.shipDockGraphics.push(graphics);

    const buttonText = this.add.text(x + width / 2, y + height / 2, text, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'Arial'
    }).setOrigin(0.5);
    this.dynamicElements.push(buttonText);

    const zone = this.add.zone(x + width / 2, y + height / 2, width, height);
    zone.setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      graphics.clear();
      graphics.fillStyle(color, 0.8);
      graphics.fillRoundedRect(x, y, width, height, 6);
      graphics.lineStyle(2, 0xffffff, 0.5);
      graphics.strokeRoundedRect(x, y, width, height, 6);
    });

    zone.on('pointerout', () => {
      graphics.clear();
      graphics.fillStyle(color);
      graphics.fillRoundedRect(x, y, width, height, 6);
      graphics.lineStyle(2, 0xffffff, 0.3);
      graphics.strokeRoundedRect(x, y, width, height, 6);
    });

    zone.on('pointerdown', onClick);
  }

  private selectShipToPlace(ship: ShipConfig): void {
    this.placingShip = ship;
    this.statusText.setText(`Placing ${ship.name} (${this.placingHorizontal ? 'Horizontal' : 'Vertical'}) - Press R to rotate`);
  }

  private createBoardInteraction(offset: { x: number; y: number }, boardType: 'my' | 'tracking'): void {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const x = offset.x + col * CELL_SIZE;
        const y = offset.y + row * CELL_SIZE;

        const zone = this.add.zone(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
        zone.setInteractive({ useHandCursor: true });
        zone.setData('row', row);
        zone.setData('col', col);
        zone.setData('boardType', boardType);

        zone.on('pointerover', () => this.handleCellHover(row, col, boardType));
        zone.on('pointerout', () => this.clearHover());
        zone.on('pointerdown', () => this.handleCellClick(row, col, boardType));
      }
    }
  }

  private handleCellHover(row: number, col: number, boardType: 'my' | 'tracking'): void {
    this.clearHover();

    if (this.phase === 'setup' && boardType === 'my' && this.placingShip) {
      // Show ship placement preview
      const valid = this.isValidPlacement(row, col, this.placingShip.size, this.placingHorizontal);
      this.drawShipPreview(row, col, this.placingShip.size, this.placingHorizontal, valid);
    } else if (this.phase === 'battle' && boardType === 'tracking' && this.isMyTurn && !this.gameOver) {
      // Show targeting crosshair
      if (this.trackingBoard[row][col] === null) {
        this.drawTargetingCrosshair(row, col);
      }
    }
  }

  private drawShipPreview(row: number, col: number, size: number, horizontal: boolean, valid: boolean): void {
    this.hoverGraphics = this.add.graphics();
    const color = valid ? this.HOVER_VALID : this.HOVER_INVALID;

    for (let i = 0; i < size; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;

      if (r < BOARD_SIZE && c < BOARD_SIZE) {
        this.hoverGraphics.fillStyle(color, 0.4);
        this.hoverGraphics.fillRect(
          this.myBoardOffset.x + c * CELL_SIZE + 2,
          this.myBoardOffset.y + r * CELL_SIZE + 2,
          CELL_SIZE - 4,
          CELL_SIZE - 4
        );
      }
    }
  }

  private drawTargetingCrosshair(row: number, col: number): void {
    this.hoverGraphics = this.add.graphics();
    const cx = this.trackingBoardOffset.x + col * CELL_SIZE + CELL_SIZE / 2;
    const cy = this.trackingBoardOffset.y + row * CELL_SIZE + CELL_SIZE / 2;

    // Crosshair
    this.hoverGraphics.lineStyle(2, this.HIT_COLOR, 0.8);
    this.hoverGraphics.strokeCircle(cx, cy, CELL_SIZE / 3);

    // Cross lines
    this.hoverGraphics.moveTo(cx - CELL_SIZE / 2 + 4, cy);
    this.hoverGraphics.lineTo(cx + CELL_SIZE / 2 - 4, cy);
    this.hoverGraphics.moveTo(cx, cy - CELL_SIZE / 2 + 4);
    this.hoverGraphics.lineTo(cx, cy + CELL_SIZE / 2 - 4);
    this.hoverGraphics.strokePath();
  }

  private clearHover(): void {
    if (this.hoverGraphics) {
      this.hoverGraphics.destroy();
      this.hoverGraphics = null;
    }
  }

  private handleCellClick(row: number, col: number, boardType: 'my' | 'tracking'): void {
    if (this.phase === 'setup' && boardType === 'my' && this.placingShip) {
      if (this.isValidPlacement(row, col, this.placingShip.size, this.placingHorizontal)) {
        const placement: ShipPlacement = {
          shipType: this.placingShip.type,
          row,
          col,
          horizontal: this.placingHorizontal
        };

        if (this.onShipPlaced) {
          this.onShipPlaced(placement);
        }

        this.placingShip = null;
        this.statusText.setText('Ship placed! Select another ship.');
      }
    } else if (this.phase === 'battle' && boardType === 'tracking' && this.isMyTurn && !this.gameOver) {
      if (this.trackingBoard[row][col] === null && this.onCellClick) {
        this.onCellClick(row, col);
      }
    }
  }

  private isValidPlacement(row: number, col: number, size: number, horizontal: boolean): boolean {
    // Check bounds
    if (horizontal && col + size > BOARD_SIZE) return false;
    if (!horizontal && row + size > BOARD_SIZE) return false;

    // Check overlaps
    for (let i = 0; i < size; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;

      if (this.myBoard[r][c] !== null) return false;
    }

    return true;
  }

  // ===== BATTLE PHASE =====

  private drawBattlePhase(): void {
    this.clearAllGraphics();
    this.calculateLayouts(this.cameras.main.width, this.cameras.main.height);

    // Update instruction
    this.instructionText.setText('Click on enemy waters to fire!');

    // Draw my board (view only)
    this.drawBoard(this.myBoardOffset, 'Your Fleet', true);
    this.drawShipCells();        // Draw ship cells first
    this.drawMarkersOnMyBoard(); // Draw damage indicators
    this.drawSunkStrikethroughs(); // Draw strikethroughs on top

    // Draw tracking board (clickable)
    this.drawBoard(this.trackingBoardOffset, 'Enemy Waters', false);
    this.drawMarkersOnTrackingBoard();
    this.drawEnemySunkStrikethroughs();  // Draw strikethroughs on tracking board for sunk enemy ships

    // Create interaction for tracking board
    this.createBoardInteraction(this.trackingBoardOffset, 'tracking');
  }

  private drawShipCells(): void {
    const graphics = this.add.graphics();

    for (const [shipType, ship] of Object.entries(this.myShips)) {
      if (!ship || ship.size === undefined || ship.row === undefined || ship.col === undefined) {
        continue;
      }

      const color = ship.sunk ? this.SUNK_COLOR : this.SHIP_COLOR;
      graphics.fillStyle(color);

      for (let i = 0; i < ship.size; i++) {
        const row = ship.horizontal ? ship.row : ship.row + i;
        const col = ship.horizontal ? ship.col + i : ship.col;

        graphics.fillRoundedRect(
          this.myBoardOffset.x + col * CELL_SIZE + 3,
          this.myBoardOffset.y + row * CELL_SIZE + 3,
          CELL_SIZE - 6,
          CELL_SIZE - 6,
          4
        );
      }
    }

    this.shipGraphics.push(graphics);
  }

  private drawSunkStrikethroughs(): void {
    const graphics = this.add.graphics();

    for (const [shipType, ship] of Object.entries(this.myShips)) {
      if (!ship.sunk) continue;

      const startRow = ship.row;
      const startCol = ship.col;
      const endRow = ship.horizontal ? ship.row : ship.row + ship.size - 1;
      const endCol = ship.horizontal ? ship.col + ship.size - 1 : ship.col;

      const startX = this.myBoardOffset.x + startCol * CELL_SIZE + CELL_SIZE / 2;
      const startY = this.myBoardOffset.y + startRow * CELL_SIZE + CELL_SIZE / 2;
      const endX = this.myBoardOffset.x + endCol * CELL_SIZE + CELL_SIZE / 2;
      const endY = this.myBoardOffset.y + endRow * CELL_SIZE + CELL_SIZE / 2;

      // Black outline for contrast
      graphics.lineStyle(10, 0x000000, 0.8);
      graphics.beginPath();
      graphics.moveTo(startX, startY);
      graphics.lineTo(endX, endY);
      graphics.strokePath();

      // Thick white strikethrough line on top
      graphics.lineStyle(6, 0xffffff, 1);
      graphics.beginPath();
      graphics.moveTo(startX, startY);
      graphics.lineTo(endX, endY);
      graphics.strokePath();

      // Red X marks at each end
      const markSize = 8;
      graphics.lineStyle(3, this.HIT_COLOR);
      // Start X
      graphics.beginPath();
      graphics.moveTo(startX - markSize, startY - markSize);
      graphics.lineTo(startX + markSize, startY + markSize);
      graphics.moveTo(startX + markSize, startY - markSize);
      graphics.lineTo(startX - markSize, startY + markSize);
      graphics.strokePath();
      // End X
      graphics.beginPath();
      graphics.moveTo(endX - markSize, endY - markSize);
      graphics.lineTo(endX + markSize, endY + markSize);
      graphics.moveTo(endX + markSize, endY - markSize);
      graphics.lineTo(endX - markSize, endY + markSize);
      graphics.strokePath();

      // "SUNK" banner - position to the side of the ship
      const centerX = (startX + endX) / 2;
      const centerY = (startY + endY) / 2;
      const labelX = ship.horizontal ? centerX : startX + CELL_SIZE + 5;
      const labelY = ship.horizontal ? startY - CELL_SIZE / 2 - 8 : centerY;

      // Background for SUNK label
      const labelBg = this.add.graphics();
      labelBg.fillStyle(0x000000, 0.7);
      labelBg.fillRoundedRect(labelX - 22, labelY - 8, 44, 16, 4);
      this.shipGraphics.push(labelBg);

      const sunkLabel = this.add.text(labelX, labelY, 'SUNK', {
        fontSize: '12px',
        color: '#ff4444',
        fontFamily: 'Arial',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.dynamicElements.push(sunkLabel);
    }

    this.shipGraphics.push(graphics);
  }

  private drawMarkersOnMyBoard(): void {
    const graphics = this.add.graphics();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = this.myBoard[row][col];
        if (cell === 'hit') {
          // On your own board, just draw a small flame/damage indicator (not the big marker)
          this.drawDamageIndicator(graphics, this.myBoardOffset, row, col);
        } else if (cell === 'miss') {
          this.drawMissMarker(graphics, this.myBoardOffset, row, col);
        }
      }
    }

    this.markerGraphics.push(graphics);
  }

  private drawDamageIndicator(graphics: Phaser.GameObjects.Graphics, offset: { x: number; y: number }, row: number, col: number): void {
    const cx = offset.x + col * CELL_SIZE + CELL_SIZE / 2;
    const cy = offset.y + row * CELL_SIZE + CELL_SIZE / 2;

    // Red X marker to show where AI hit your ship
    const size = CELL_SIZE * 0.25;
    graphics.lineStyle(4, 0xff0000, 0.9);
    graphics.beginPath();
    graphics.moveTo(cx - size, cy - size);
    graphics.lineTo(cx + size, cy + size);
    graphics.moveTo(cx + size, cy - size);
    graphics.lineTo(cx - size, cy + size);
    graphics.strokePath();
  }

  private drawMarkersOnTrackingBoard(): void {
    const graphics = this.add.graphics();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = this.trackingBoard[row][col];
        if (cell === 'hit') {
          this.drawHitMarker(graphics, this.trackingBoardOffset, row, col);
        } else if (cell === 'miss') {
          this.drawMissMarker(graphics, this.trackingBoardOffset, row, col);
        }
      }
    }

    this.markerGraphics.push(graphics);
  }

  private drawEnemySunkStrikethroughs(): void {
    if (this.sunkEnemyShipsData.length === 0) return;

    const graphics = this.add.graphics();

    for (const ship of this.sunkEnemyShipsData) {
      const startRow = ship.row;
      const startCol = ship.col;
      const endRow = ship.horizontal ? ship.row : ship.row + ship.size - 1;
      const endCol = ship.horizontal ? ship.col + ship.size - 1 : ship.col;

      const startX = this.trackingBoardOffset.x + startCol * CELL_SIZE + CELL_SIZE / 2;
      const startY = this.trackingBoardOffset.y + startRow * CELL_SIZE + CELL_SIZE / 2;
      const endX = this.trackingBoardOffset.x + endCol * CELL_SIZE + CELL_SIZE / 2;
      const endY = this.trackingBoardOffset.y + endRow * CELL_SIZE + CELL_SIZE / 2;

      // Black outline for contrast
      graphics.lineStyle(10, 0x000000, 0.8);
      graphics.beginPath();
      graphics.moveTo(startX, startY);
      graphics.lineTo(endX, endY);
      graphics.strokePath();

      // Thick white strikethrough line on top
      graphics.lineStyle(6, 0xffffff, 1);
      graphics.beginPath();
      graphics.moveTo(startX, startY);
      graphics.lineTo(endX, endY);
      graphics.strokePath();

      // Red X marks at each end
      const markSize = 8;
      graphics.lineStyle(3, this.HIT_COLOR);
      // Start X
      graphics.beginPath();
      graphics.moveTo(startX - markSize, startY - markSize);
      graphics.lineTo(startX + markSize, startY + markSize);
      graphics.moveTo(startX + markSize, startY - markSize);
      graphics.lineTo(startX - markSize, startY + markSize);
      graphics.strokePath();
      // End X
      graphics.beginPath();
      graphics.moveTo(endX - markSize, endY - markSize);
      graphics.lineTo(endX + markSize, endY + markSize);
      graphics.moveTo(endX + markSize, endY - markSize);
      graphics.lineTo(endX - markSize, endY + markSize);
      graphics.strokePath();

      // Ship name label
      const centerX = (startX + endX) / 2;
      const centerY = (startY + endY) / 2;
      const labelX = ship.horizontal ? centerX : endX + CELL_SIZE / 2 + 5;
      const labelY = ship.horizontal ? startY - CELL_SIZE / 2 - 8 : centerY;

      // Find ship name
      const shipConfig = SHIPS.find(s => s.type === ship.shipType);
      const shipName = shipConfig ? shipConfig.name : ship.shipType;

      // Background for label
      const labelBg = this.add.graphics();
      labelBg.fillStyle(0x000000, 0.7);
      labelBg.fillRoundedRect(labelX - 30, labelY - 8, 60, 16, 4);
      this.markerGraphics.push(labelBg);

      const sunkLabel = this.add.text(labelX, labelY, shipName, {
        fontSize: '10px',
        color: '#ff4444',
        fontFamily: 'Arial',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.dynamicElements.push(sunkLabel);
    }

    this.markerGraphics.push(graphics);
  }

  private drawHitMarker(graphics: Phaser.GameObjects.Graphics, offset: { x: number; y: number }, row: number, col: number): void {
    const cx = offset.x + col * CELL_SIZE + CELL_SIZE / 2;
    const cy = offset.y + row * CELL_SIZE + CELL_SIZE / 2;
    const size = CELL_SIZE * 0.28;

    // Red filled circle (explosion)
    graphics.fillStyle(this.HIT_COLOR);
    graphics.fillCircle(cx, cy, CELL_SIZE / 3);

    // White X on top for contrast
    graphics.lineStyle(3, 0xffffff);
    graphics.beginPath();
    graphics.moveTo(cx - size, cy - size);
    graphics.lineTo(cx + size, cy + size);
    graphics.moveTo(cx + size, cy - size);
    graphics.lineTo(cx - size, cy + size);
    graphics.strokePath();
  }

  private drawMissMarker(graphics: Phaser.GameObjects.Graphics, offset: { x: number; y: number }, row: number, col: number): void {
    const cx = offset.x + col * CELL_SIZE + CELL_SIZE / 2;
    const cy = offset.y + row * CELL_SIZE + CELL_SIZE / 2;

    // Blue splash dot (water)
    graphics.fillStyle(0x4a90d9);
    graphics.fillCircle(cx, cy, CELL_SIZE / 4);

    // Lighter center for depth
    graphics.fillStyle(0x87ceeb, 0.6);
    graphics.fillCircle(cx - 2, cy - 2, CELL_SIZE / 8);
  }

  private clearAllGraphics(): void {
    this.shipGraphics.forEach(g => g.destroy());
    this.shipGraphics = [];

    this.markerGraphics.forEach(g => g.destroy());
    this.markerGraphics = [];

    this.shipDockGraphics.forEach(g => g.destroy());
    this.shipDockGraphics = [];

    // Clear all dynamic elements (text labels, etc.)
    this.dynamicElements.forEach(e => e.destroy());
    this.dynamicElements = [];

    // Clear board graphics
    if (this.myBoardGraphics) {
      this.myBoardGraphics.destroy();
      this.myBoardGraphics = null;
    }
    if (this.trackingBoardGraphics) {
      this.trackingBoardGraphics.destroy();
      this.trackingBoardGraphics = null;
    }

    this.clearHover();

    // Clear zones
    const zonesToDestroy: Phaser.GameObjects.Zone[] = [];
    this.children.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Zone) {
        zonesToDestroy.push(child);
      }
    });
    zonesToDestroy.forEach(z => z.destroy());
  }

  // ===== PUBLIC METHODS =====

  public updateState(state: {
    phase: 'setup' | 'battle';
    myBoard: (string | null)[][];
    trackingBoard: (string | null)[][];
    myShips: Record<string, PlacedShip>;
    currentPlayerId: string;
    myId: string;
    opponentShipsRemaining?: number;
    myShipsRemaining?: number;
    opponentSunkShips?: string[];
    sunkEnemyShipsData?: PlacedShip[];
  }): void {
    const phaseChanged = this.phase !== state.phase;
    this.phase = state.phase;
    this.myBoard = state.myBoard.map(row => [...row]);
    this.trackingBoard = state.trackingBoard.map(row => [...row]);
    this.myShips = { ...state.myShips };
    this.isMyTurn = state.currentPlayerId === state.myId;
    if (state.opponentSunkShips) {
      this.opponentSunkShips = [...state.opponentSunkShips];
    }
    if (state.sunkEnemyShipsData) {
      this.sunkEnemyShipsData = [...state.sunkEnemyShipsData];
    }

    if (state.phase === 'setup') {
      if (phaseChanged) {
        this.drawSetupPhase();
      } else {
        // Redraw ships in setup
        this.drawSetupPhase();
      }
      this.turnText.setText('Place your ships!');
    } else if (state.phase === 'battle') {
      if (phaseChanged) {
        this.instructionText.setVisible(true);
        this.drawBattlePhase();
      } else {
        // Just update markers
        this.drawBattlePhase();
      }

      this.turnText.setText(this.isMyTurn ? 'Your turn - Fire!' : "Opponent's turn...");
      this.turnText.setColor(this.isMyTurn ? '#e94560' : '#888888');

      if (state.opponentShipsRemaining !== undefined && state.myShipsRemaining !== undefined) {
        let statusMsg = `Your ships: ${state.myShipsRemaining}/5 | Enemy ships: ${state.opponentShipsRemaining}/5`;
        if (this.opponentSunkShips.length > 0) {
          const sunkNames = this.opponentSunkShips.map(type => {
            const ship = SHIPS.find(s => s.type === type);
            return ship ? ship.name : type;
          }).join(', ');
          statusMsg += ` | Sunk: ${sunkNames}`;
        }
        this.statusText.setText(statusMsg);
      }
    }
  }

  public showSetupWaiting(): void {
    this.turnText.setText('Waiting for opponent to place ships...');
    this.turnText.setColor('#888888');
    this.instructionText.setText('');
  }

  public showHitResult(row: number, col: number, hit: boolean, sunk: boolean, sunkShipType: string | null): void {
    // Animate the shot result
    const cx = this.trackingBoardOffset.x + col * CELL_SIZE + CELL_SIZE / 2;
    const cy = this.trackingBoardOffset.y + row * CELL_SIZE + CELL_SIZE / 2;

    // Explosion/splash animation
    const circle = this.add.graphics();
    circle.fillStyle(hit ? this.HIT_COLOR : this.MISS_COLOR, 0.8);
    circle.fillCircle(cx, cy, 5);

    this.tweens.add({
      targets: { scale: 1 },
      scale: 3,
      duration: 300,
      ease: 'Power2',
      onUpdate: (tween) => {
        const scale = tween.getValue() as number;
        circle.clear();
        circle.fillStyle(hit ? this.HIT_COLOR : this.MISS_COLOR, 1 - scale / 4);
        circle.fillCircle(cx, cy, 5 * scale);
      },
      onComplete: () => {
        circle.destroy();
      }
    });

    if (sunk && sunkShipType) {
      // Add to sunk ships list
      if (!this.opponentSunkShips.includes(sunkShipType)) {
        this.opponentSunkShips.push(sunkShipType);
      }

      // Show sunk notification - bigger and more visible
      const shipConfig = SHIPS.find(s => s.type === sunkShipType);
      if (shipConfig) {
        // Big centered notification
        const centerX = this.cameras.main.width / 2;
        const centerY = 80;

        const sunkText = this.add.text(centerX, centerY, `${shipConfig.name} SUNK!`, {
          fontSize: '28px',
          color: '#ff0000',
          fontFamily: 'Arial',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3
        }).setOrigin(0.5);

        this.tweens.add({
          targets: sunkText,
          scale: 1.2,
          alpha: 0,
          duration: 2000,
          ease: 'Power2',
          onComplete: () => sunkText.destroy()
        });
      }

      // Redraw to update the legend
      this.drawBattlePhase();
    }
  }

  public showGameOver(winner: string, myId: string): void {
    this.gameOver = true;
    this.clearHover();

    const isWinner = winner === myId;
    const message = isWinner ? 'Victory!' : 'Defeat!';

    this.turnText.setText(message);
    this.turnText.setColor(isWinner ? '#00ff00' : '#ff0000');
    this.turnText.setFontSize(36);
    this.instructionText.setText(isWinner ? 'You sank all enemy ships!' : 'All your ships were sunk!');
  }

  public resetGame(): void {
    this.phase = 'setup';
    this.gameOver = false;
    this.isMyTurn = false;
    this.placingShip = null;
    this.placingHorizontal = true;
    this.opponentSunkShips = [];
    this.turnText.setFontSize(22);
    this.initBoards();
    this.drawSetupPhase();
  }
}
