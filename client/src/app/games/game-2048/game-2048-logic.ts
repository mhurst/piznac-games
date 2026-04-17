export const BOARD_SIZE = 4;
export const WIN_TILE = 2048;

export type Board = number[][];
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveResult {
  board: Board;
  moved: boolean;
  scoreGained: number;
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

export function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

export function spawnRandomTile(board: Board): {
  board: Board;
  spawned: { r: number; c: number; value: number } | null;
} {
  const empty: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return { board, spawned: null };
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  const next = cloneBoard(board);
  next[r][c] = value;
  return { board: next, spawned: { r, c, value } };
}

function transpose(board: Board): Board {
  const n = board.length;
  const out: Board = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out[c][r] = board[r][c];
    }
  }
  return out;
}

function reverseRows(board: Board): Board {
  return board.map(row => [...row].reverse());
}

function slideRowLeft(row: number[]): { row: number[]; score: number } {
  const compact = row.filter(v => v !== 0);
  const merged: number[] = [];
  let score = 0;
  for (let i = 0; i < compact.length; i++) {
    if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
      const v = compact[i] * 2;
      merged.push(v);
      score += v;
      i++;
    } else {
      merged.push(compact[i]);
    }
  }
  while (merged.length < BOARD_SIZE) merged.push(0);
  return { row: merged, score };
}

export function move(board: Board, dir: Direction): MoveResult {
  let working = cloneBoard(board);

  if (dir === 'right') working = reverseRows(working);
  if (dir === 'up') working = transpose(working);
  if (dir === 'down') working = reverseRows(transpose(working));

  let total = 0;
  const result = working.map(row => {
    const { row: r, score } = slideRowLeft(row);
    total += score;
    return r;
  });

  let final = result;
  if (dir === 'right') final = reverseRows(final);
  if (dir === 'up') final = transpose(final);
  if (dir === 'down') final = transpose(reverseRows(final));

  const moved = !boardsEqual(board, final);
  return { board: final, moved, scoreGained: total };
}

function boardsEqual(a: Board, b: Board): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export function hasReachedTile(board: Board, target: number = WIN_TILE): boolean {
  for (const row of board) for (const v of row) if (v >= target) return true;
  return false;
}

export function canMove(board: Board): boolean {
  for (const row of board) for (const v of row) if (v === 0) return true;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = board[r][c];
      if (r + 1 < BOARD_SIZE && board[r + 1][c] === v) return true;
      if (c + 1 < BOARD_SIZE && board[r][c + 1] === v) return true;
    }
  }
  return false;
}
