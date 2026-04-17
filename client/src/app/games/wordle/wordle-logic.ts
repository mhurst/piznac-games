export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export type TileState = 'empty' | 'pending' | 'correct' | 'present' | 'absent';
export type KeyState = 'unused' | 'correct' | 'present' | 'absent';

export interface Tile {
  letter: string;
  state: TileState;
}

export type Grid = Tile[][];

export function makeEmptyGrid(): Grid {
  return Array.from({ length: MAX_GUESSES }, () =>
    Array.from({ length: WORD_LENGTH }, () => ({ letter: '', state: 'empty' as TileState }))
  );
}

/**
 * Evaluate a guess against the answer with proper duplicate-letter handling.
 * First pass assigns 'correct' (green) and consumes those positions; second pass
 * assigns 'present' (yellow) only against positions not already consumed.
 */
export function evaluateGuess(guess: string, answer: string): TileState[] {
  const result: TileState[] = Array(WORD_LENGTH).fill('absent');
  const used: boolean[] = Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guess[i] === answer[j]) {
        result[i] = 'present';
        used[j] = true;
        break;
      }
    }
  }

  return result;
}

const KEY_RANK: Record<KeyState, number> = {
  unused: 0,
  absent: 1,
  present: 2,
  correct: 3
};

export function upgradeKeyState(current: KeyState, next: KeyState): KeyState {
  return KEY_RANK[next] > KEY_RANK[current] ? next : current;
}

export function tileStateToKeyState(t: TileState): KeyState {
  if (t === 'correct') return 'correct';
  if (t === 'present') return 'present';
  if (t === 'absent') return 'absent';
  return 'unused';
}
