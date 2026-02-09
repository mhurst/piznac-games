const BOARD_SIZE = 10;

const SHIPS = {
  carrier: { size: 5, name: 'Carrier' },
  battleship: { size: 4, name: 'Battleship' },
  cruiser: { size: 3, name: 'Cruiser' },
  submarine: { size: 3, name: 'Submarine' },
  destroyer: { size: 2, name: 'Destroyer' }
};

function createEmptyBoard() {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
}

class Battleship {
  constructor(player1Id, player2Id) {
    this.players = {
      P1: player1Id,
      P2: player2Id
    };

    // Each player has their own board for ships and tracking opponent
    this.boards = {
      P1: { ships: createEmptyBoard(), tracking: createEmptyBoard() },
      P2: { ships: createEmptyBoard(), tracking: createEmptyBoard() }
    };

    // Ship placements for each player
    this.ships = {
      P1: {},  // { carrier: { row, col, horizontal, hits: [], sunk: false }, ... }
      P2: {}
    };

    this.phase = 'setup';  // 'setup' | 'battle'
    this.setupComplete = { P1: false, P2: false };
    this.currentTurn = 'P1';
    this.winner = null;
    this.gameOver = false;
    this.lastShot = null;  // { row, col, hit, sunk, shipType }
  }

  getPlayerSymbol(playerId) {
    if (this.players.P1 === playerId) return 'P1';
    if (this.players.P2 === playerId) return 'P2';
    return null;
  }

  getOpponentSymbol(playerSymbol) {
    return playerSymbol === 'P1' ? 'P2' : 'P1';
  }

  // ===== SHIP PLACEMENT =====

  placeShip(playerId, { shipType, row, col, horizontal }) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) return { valid: false, message: 'Invalid player' };
    if (this.phase !== 'setup') return { valid: false, message: 'Game already started' };
    if (this.setupComplete[playerSymbol]) return { valid: false, message: 'Setup already complete' };

    const shipConfig = SHIPS[shipType];
    if (!shipConfig) return { valid: false, message: 'Invalid ship type' };

    // Check bounds
    if (horizontal) {
      if (col + shipConfig.size > BOARD_SIZE) return { valid: false, message: 'Ship out of bounds' };
    } else {
      if (row + shipConfig.size > BOARD_SIZE) return { valid: false, message: 'Ship out of bounds' };
    }

    // Check for overlaps (excluding this ship if it's being repositioned)
    const cells = this.getShipCells(row, col, shipConfig.size, horizontal);
    for (const cell of cells) {
      const existing = this.boards[playerSymbol].ships[cell.row][cell.col];
      if (existing && existing !== shipType) {
        return { valid: false, message: 'Ships cannot overlap' };
      }
    }

    // Remove old placement if repositioning
    this.removeShip(playerId, shipType);

    // Place the ship
    for (const cell of cells) {
      this.boards[playerSymbol].ships[cell.row][cell.col] = shipType;
    }

    this.ships[playerSymbol][shipType] = {
      row, col, horizontal,
      size: shipConfig.size,
      hits: [],
      sunk: false
    };

    return { valid: true, ship: this.ships[playerSymbol][shipType] };
  }

  removeShip(playerId, shipType) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) return { valid: false };

    const ship = this.ships[playerSymbol][shipType];
    if (!ship) return { valid: true };  // Nothing to remove

    const cells = this.getShipCells(ship.row, ship.col, ship.size, ship.horizontal);
    for (const cell of cells) {
      this.boards[playerSymbol].ships[cell.row][cell.col] = null;
    }

    delete this.ships[playerSymbol][shipType];
    return { valid: true };
  }

  autoPlaceShips(playerId) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) return { valid: false, message: 'Invalid player' };
    if (this.phase !== 'setup') return { valid: false, message: 'Game already started' };
    if (this.setupComplete[playerSymbol]) return { valid: false, message: 'Setup already complete' };

    // Clear existing ships
    this.boards[playerSymbol].ships = createEmptyBoard();
    this.ships[playerSymbol] = {};

    // Place each ship randomly
    const shipTypes = Object.keys(SHIPS);
    for (const shipType of shipTypes) {
      let placed = false;
      let attempts = 0;
      const maxAttempts = 100;

      while (!placed && attempts < maxAttempts) {
        attempts++;
        const horizontal = Math.random() < 0.5;
        const maxRow = horizontal ? BOARD_SIZE : BOARD_SIZE - SHIPS[shipType].size;
        const maxCol = horizontal ? BOARD_SIZE - SHIPS[shipType].size : BOARD_SIZE;
        const row = Math.floor(Math.random() * maxRow);
        const col = Math.floor(Math.random() * maxCol);

        const result = this.placeShip(playerId, { shipType, row, col, horizontal });
        if (result.valid) placed = true;
      }

      if (!placed) {
        return { valid: false, message: 'Could not place all ships' };
      }
    }

    return { valid: true, ships: this.ships[playerSymbol] };
  }

  confirmSetup(playerId) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) return { valid: false, message: 'Invalid player' };
    if (this.phase !== 'setup') return { valid: false, message: 'Game already started' };

    // Check all ships are placed
    const placedShips = Object.keys(this.ships[playerSymbol]);
    const requiredShips = Object.keys(SHIPS);
    if (placedShips.length !== requiredShips.length) {
      return { valid: false, message: 'All ships must be placed' };
    }

    this.setupComplete[playerSymbol] = true;

    // Check if both players are ready
    if (this.setupComplete.P1 && this.setupComplete.P2) {
      this.phase = 'battle';
      return { valid: true, bothReady: true, phase: 'battle' };
    }

    return { valid: true, bothReady: false, waiting: true };
  }

  // ===== BATTLE PHASE =====

  makeMove(playerId, { row, col }) {
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) return { valid: false, message: 'Invalid player' };

    if (this.phase !== 'battle') {
      return { valid: false, message: 'Game not in battle phase' };
    }

    if (this.gameOver) {
      return { valid: false, message: 'Game is over' };
    }

    if (this.players[this.currentTurn] !== playerId) {
      return { valid: false, message: 'Not your turn' };
    }

    // Validate coordinates
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return { valid: false, message: 'Invalid coordinates' };
    }

    const opponentSymbol = this.getOpponentSymbol(playerSymbol);

    // Check if already fired at this cell
    if (this.boards[playerSymbol].tracking[row][col] !== null) {
      return { valid: false, message: 'Already fired at this location' };
    }

    // Check opponent's ship board
    const targetCell = this.boards[opponentSymbol].ships[row][col];
    let hit = false;
    let sunk = false;
    let sunkShipType = null;

    if (targetCell) {
      // It's a hit!
      hit = true;
      this.boards[playerSymbol].tracking[row][col] = 'hit';
      this.boards[opponentSymbol].ships[row][col] = 'hit';  // Mark on their board too

      // Record hit on ship
      const ship = this.ships[opponentSymbol][targetCell];
      ship.hits.push({ row, col });

      // Check if sunk
      if (ship.hits.length === ship.size) {
        ship.sunk = true;
        sunk = true;
        sunkShipType = targetCell;
      }
    } else {
      // Miss
      this.boards[playerSymbol].tracking[row][col] = 'miss';
    }

    this.lastShot = { row, col, hit, sunk, shipType: sunkShipType };

    // Check for win
    const allSunk = this.checkAllShipsSunk(opponentSymbol);
    if (allSunk) {
      this.gameOver = true;
      this.winner = playerSymbol;
      return {
        valid: true,
        hit,
        sunk,
        sunkShipType,
        gameOver: true,
        winner: playerId
      };
    }

    // Only switch turns on a miss - if hit, same player goes again
    if (!hit) {
      this.currentTurn = this.currentTurn === 'P1' ? 'P2' : 'P1';
    }

    return {
      valid: true,
      hit,
      sunk,
      sunkShipType,
      gameOver: false
    };
  }

  checkAllShipsSunk(playerSymbol) {
    const ships = this.ships[playerSymbol];
    for (const shipType of Object.keys(ships)) {
      if (!ships[shipType].sunk) return false;
    }
    return true;
  }

  // ===== HELPERS =====

  getShipCells(row, col, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      if (horizontal) {
        cells.push({ row, col: col + i });
      } else {
        cells.push({ row: row + i, col });
      }
    }
    return cells;
  }

  countRemainingShips(playerSymbol) {
    let count = 0;
    const ships = this.ships[playerSymbol];
    for (const shipType of Object.keys(ships)) {
      if (!ships[shipType].sunk) count++;
    }
    return count;
  }

  // ===== STATE =====

  getState(forPlayerId = null) {
    const forPlayerSymbol = forPlayerId ? this.getPlayerSymbol(forPlayerId) : null;

    // Base state (always included)
    const state = {
      phase: this.phase,
      setupComplete: { ...this.setupComplete },
      currentTurn: this.currentTurn,
      currentPlayerId: this.players[this.currentTurn],
      players: { ...this.players },
      gameOver: this.gameOver,
      winner: this.winner ? this.players[this.winner] : null,
      lastShot: this.lastShot,
      shipTypes: SHIPS
    };

    // If requesting for a specific player, include their view
    if (forPlayerSymbol) {
      const opponentSymbol = this.getOpponentSymbol(forPlayerSymbol);

      state.mySymbol = forPlayerSymbol;
      state.myBoard = this.boards[forPlayerSymbol].ships.map(row => [...row]);
      state.trackingBoard = this.boards[forPlayerSymbol].tracking.map(row => [...row]);
      state.myShips = { ...this.ships[forPlayerSymbol] };
      state.myShipsRemaining = this.countRemainingShips(forPlayerSymbol);
      state.opponentShipsRemaining = this.countRemainingShips(opponentSymbol);

      // In battle phase, also include info about which opponent ships are sunk (but not positions)
      if (this.phase === 'battle') {
        state.opponentSunkShips = [];
        for (const [shipType, ship] of Object.entries(this.ships[opponentSymbol])) {
          if (ship.sunk) {
            state.opponentSunkShips.push(shipType);
          }
        }
      }
    }

    return state;
  }
}

module.exports = Battleship;
