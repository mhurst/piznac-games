// Backgammon Types & Game Logic
// Board: 24 points (indices 0-23), positive = White checkers, negative = Black checkers
// White moves from high to low (24→1), Black moves from low to high (1→24)
// Point index 0 = White's 1-point (home), Point index 23 = White's 24-point

export type Color = 'W' | 'B';
export type Board = number[]; // length 24, + = white, - = black

export interface Bar {
  W: number;
  B: number;
}

export interface BorneOff {
  W: number;
  B: number;
}

export interface BackgammonMove {
  from: number | 'bar';  // point index or 'bar'
  to: number | 'off';    // point index or 'off' (bear off)
  die: number;           // which die value was used
}

export interface BackgammonState {
  board: Board;
  bar: Bar;
  borneOff: BorneOff;
  dice: [number, number] | null;
  remainingDice: number[];
  currentPlayer: Color;
  phase: 'rolling' | 'moving' | 'gameOver';
  gameOver: boolean;
  winner: Color | null;
  winType: 'normal' | 'gammon' | 'backgammon' | null;
  lastMove: BackgammonMove | null;
}

export interface BackgammonVisualState {
  board: Board;
  bar: Bar;
  borneOff: BorneOff;
  dice: [number, number] | null;
  remainingDice: number[];
  currentPlayer: Color;
  isMyTurn: boolean;
  validMoves: BackgammonMove[];
  selectedPoint: number | 'bar' | null;
  phase: 'rolling' | 'moving' | 'gameOver';
  message: string;
  myColor: Color;
  myName: string;
  opponentName: string;
  myAvatar?: string;
  opponentAvatar?: string;
  gameOver: boolean;
  winner: string | null;
  winType: 'normal' | 'gammon' | 'backgammon' | null;
}

// Standard starting position
// White (positive): 2 on point 23, 5 on point 12, 3 on point 7, 5 on point 5
// Black (negative): 2 on point 0, 5 on point 11, 3 on point 16, 5 on point 18
export function createStartingBoard(): Board {
  const board = new Array(24).fill(0);
  // White checkers (positive)
  board[23] = 2;
  board[12] = 5;
  board[7] = 3;
  board[5] = 5;
  // Black checkers (negative)
  board[0] = -2;
  board[11] = -5;
  board[16] = -3;
  board[18] = -5;
  return board;
}

export function rollDice(): [number, number] {
  return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
}

export function getDiceValues(dice: [number, number]): number[] {
  if (dice[0] === dice[1]) {
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return [dice[0], dice[1]];
}

// Direction: White moves from high index to low (subtract), Black from low to high (add)
export function moveDirection(color: Color): number {
  return color === 'W' ? -1 : 1;
}

// Home board: White = points 0-5, Black = points 18-23
export function isInHomeBoard(point: number, color: Color): boolean {
  if (color === 'W') return point >= 0 && point <= 5;
  return point >= 18 && point <= 23;
}

export function allInHomeBoard(board: Board, bar: Bar, color: Color): boolean {
  if (bar[color] > 0) return false;
  for (let i = 0; i < 24; i++) {
    const count = color === 'W' ? board[i] : -board[i];
    if (count > 0 && !isInHomeBoard(i, color)) return false;
  }
  return true;
}

// Get the count of a color's checkers on a point (always positive)
export function checkerCount(board: Board, point: number, color: Color): number {
  const val = board[point];
  if (color === 'W') return val > 0 ? val : 0;
  return val < 0 ? -val : 0;
}

// Check if a point is open for a color (empty, own checkers, or single opponent = blot)
export function isPointOpen(board: Board, point: number, color: Color): boolean {
  const val = board[point];
  if (color === 'W') return val >= -1; // open if no more than 1 black
  return val <= 1; // open if no more than 1 white
}

// Bar entry point for a die value
function barEntryPoint(color: Color, die: number): number {
  if (color === 'W') return 24 - die; // White enters on points 23-18 (opponent's home)
  return die - 1; // Black enters on points 0-5 (opponent's home)
}

// Bearing off destination point for a die value from a given point
function bearOffTarget(point: number, die: number, color: Color): number {
  if (color === 'W') return point - die;
  return point + die;
}

// Get the farthest checker from bearing off edge
function farthestChecker(board: Board, color: Color): number {
  if (color === 'W') {
    for (let i = 5; i >= 0; i--) {
      if (board[i] > 0) return i;
    }
  } else {
    for (let i = 18; i <= 23; i++) {
      if (board[i] < 0) return i;
    }
  }
  return -1;
}

// Generate all valid moves for a single die value
export function getMovesForDie(
  board: Board, bar: Bar, borneOff: BorneOff, color: Color, die: number
): BackgammonMove[] {
  const moves: BackgammonMove[] = [];

  // Must enter from bar first
  if (bar[color] > 0) {
    const entry = barEntryPoint(color, die);
    if (isPointOpen(board, entry, color)) {
      moves.push({ from: 'bar', to: entry, die });
    }
    return moves; // Can't do anything else while on bar
  }

  const canBearOff = allInHomeBoard(board, bar, color);

  for (let i = 0; i < 24; i++) {
    const count = checkerCount(board, i, color);
    if (count === 0) continue;

    const target = bearOffTarget(i, die, color);

    // Regular move
    if (target >= 0 && target <= 23) {
      if (isPointOpen(board, target, color)) {
        moves.push({ from: i, to: target, die });
      }
    }
    // Bearing off
    else if (canBearOff && isInHomeBoard(i, color)) {
      if (color === 'W' && target < 0) {
        // Exact bear off, or overshoot only if this is the farthest checker
        if (target === -1 || i === farthestChecker(board, color)) {
          moves.push({ from: i, to: 'off', die });
        }
      } else if (color === 'B' && target > 23) {
        if (target === 24 || i === farthestChecker(board, color)) {
          moves.push({ from: i, to: 'off', die });
        }
      }
    }
  }

  return moves;
}

// Apply a move to state (mutates a copy)
export function applyMove(
  board: Board, bar: Bar, borneOff: BorneOff, color: Color, move: BackgammonMove
): { board: Board; bar: Bar; borneOff: BorneOff; hit: boolean } {
  const b = [...board];
  const br = { ...bar };
  const bo = { ...borneOff };
  let hit = false;
  const opp: Color = color === 'W' ? 'B' : 'W';
  const sign = color === 'W' ? 1 : -1;

  // Remove from source
  if (move.from === 'bar') {
    br[color]--;
  } else {
    b[move.from] -= sign;
  }

  // Place at destination
  if (move.to === 'off') {
    bo[color]++;
  } else {
    // Check for hit
    const oppCount = checkerCount(b, move.to, opp);
    if (oppCount === 1) {
      hit = true;
      b[move.to] = 0; // Remove opponent's blot
      br[opp]++;
    }
    b[move.to] += sign;
  }

  return { board: b, bar: br, borneOff: bo, hit };
}

// Find all valid complete turns (all combinations of using remaining dice)
// Returns arrays of move sequences
export function findAllTurns(
  board: Board, bar: Bar, borneOff: BorneOff, color: Color, remainingDice: number[]
): BackgammonMove[][] {
  const results: BackgammonMove[][] = [];
  let maxDiceUsed = 0;

  function search(b: Board, br: Bar, bo: BorneOff, dice: number[], movesSoFar: BackgammonMove[]) {
    if (dice.length === 0) {
      if (movesSoFar.length > maxDiceUsed) maxDiceUsed = movesSoFar.length;
      results.push([...movesSoFar]);
      return;
    }

    let anyMoveFound = false;
    // Try each unique remaining die
    const triedDice = new Set<number>();
    for (let i = 0; i < dice.length; i++) {
      if (triedDice.has(dice[i])) continue;
      triedDice.add(dice[i]);

      const moves = getMovesForDie(b, br, bo, color, dice[i]);
      for (const move of moves) {
        anyMoveFound = true;
        const { board: nb, bar: nbr, borneOff: nbo } = applyMove(b, br, bo, color, move);
        const newDice = [...dice];
        newDice.splice(i, 1);
        movesSoFar.push(move);
        search(nb, nbr, nbo, newDice, movesSoFar);
        movesSoFar.pop();
      }
    }

    if (!anyMoveFound) {
      if (movesSoFar.length > maxDiceUsed) maxDiceUsed = movesSoFar.length;
      results.push([...movesSoFar]);
    }
  }

  search(board, bar, borneOff, remainingDice, []);

  // Must use maximum number of dice possible
  // If only one die can be used and both are possible individually, must use higher
  const filtered = results.filter(r => r.length === maxDiceUsed);

  if (maxDiceUsed === 1 && remainingDice.length === 2 && remainingDice[0] !== remainingDice[1]) {
    // Check if we must use the higher die
    const highDie = Math.max(...remainingDice);
    const hasHighDieMoves = filtered.some(r => r[0].die === highDie);
    if (hasHighDieMoves) {
      const onlyHigh = filtered.filter(r => r[0].die === highDie);
      if (onlyHigh.length > 0) return onlyHigh;
    }
  }

  return filtered.length > 0 ? filtered : [[]];
}

// Get valid moves for the current step (first move of remaining dice)
export function getValidFirstMoves(
  board: Board, bar: Bar, borneOff: BorneOff, color: Color, remainingDice: number[]
): BackgammonMove[] {
  const allTurns = findAllTurns(board, bar, borneOff, color, remainingDice);
  const validFirstMoves: BackgammonMove[] = [];
  const seen = new Set<string>();

  for (const turn of allTurns) {
    if (turn.length === 0) continue;
    const key = `${turn[0].from}-${turn[0].to}-${turn[0].die}`;
    if (!seen.has(key)) {
      seen.add(key);
      validFirstMoves.push(turn[0]);
    }
  }

  return validFirstMoves;
}

// Check game over
export function checkGameOver(borneOff: BorneOff): Color | null {
  if (borneOff.W === 15) return 'W';
  if (borneOff.B === 15) return 'B';
  return null;
}

// Determine win type
export function getWinType(
  winner: Color, board: Board, bar: Bar, borneOff: BorneOff
): 'normal' | 'gammon' | 'backgammon' {
  const loser: Color = winner === 'W' ? 'B' : 'W';
  if (borneOff[loser] > 0) return 'normal';

  // Check if loser has checker in winner's home board or on bar
  if (bar[loser] > 0) return 'backgammon';
  for (let i = 0; i < 24; i++) {
    const count = checkerCount(board, i, loser);
    if (count > 0 && isInHomeBoard(i, winner)) return 'backgammon';
  }

  return 'gammon';
}

// Pip count for a color (lower = closer to bearing off)
export function pipCount(board: Board, bar: Bar, color: Color): number {
  let total = 0;
  for (let i = 0; i < 24; i++) {
    const count = checkerCount(board, i, color);
    if (count > 0) {
      // Distance to bear off
      const dist = color === 'W' ? (i + 1) : (24 - i);
      total += count * dist;
    }
  }
  // Bar checkers must travel full 25 pips
  total += bar[color] * 25;
  return total;
}

// Count blots (single exposed checkers)
export function countBlots(board: Board, color: Color): number {
  let count = 0;
  for (let i = 0; i < 24; i++) {
    const val = board[i];
    if (color === 'W' && val === 1) count++;
    if (color === 'B' && val === -1) count++;
  }
  return count;
}

// Count home board points controlled (2+ checkers)
export function homePointsControlled(board: Board, color: Color): number {
  let count = 0;
  const start = color === 'W' ? 0 : 18;
  const end = color === 'W' ? 5 : 23;
  for (let i = start; i <= end; i++) {
    if (checkerCount(board, i, color) >= 2) count++;
  }
  return count;
}
