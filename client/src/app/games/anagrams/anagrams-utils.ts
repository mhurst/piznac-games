export const VOWELS = ['A', 'E', 'I', 'O', 'U'];
export const CONSONANTS = [
  'B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
  'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'
];

// Scrabble-like tile frequencies (relative weights)
const VOWEL_WEIGHTS: Record<string, number> = {
  A: 9, E: 12, I: 9, O: 8, U: 4
};

const CONSONANT_WEIGHTS: Record<string, number> = {
  B: 2, C: 2, D: 4, F: 2, G: 3, H: 2, J: 1, K: 1, L: 4, M: 2,
  N: 6, P: 2, Q: 1, R: 6, S: 4, T: 6, V: 2, W: 2, X: 1, Y: 2, Z: 1
};

export const LETTER_COUNT = 7;
export const MIN_WORD_LENGTH = 3;
export const MIN_POSSIBLE_WORDS = 10;

export type GameMode = 'classic' | 'text-twist';

export const CLASSIC_DURATION_SEC = 120;
export const TEXT_TWIST_DURATION_SEC = 150;

function weightedPick(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

/**
 * Generate a 7-letter set: 2-3 vowels + the rest consonants, weighted by frequency.
 */
export function generateLetters(): string[] {
  const vowelCount = Math.random() < 0.5 ? 2 : 3;
  const letters: string[] = [];

  for (let i = 0; i < vowelCount; i++) {
    letters.push(weightedPick(VOWEL_WEIGHTS));
  }
  for (let i = 0; i < LETTER_COUNT - vowelCount; i++) {
    letters.push(weightedPick(CONSONANT_WEIGHTS));
  }

  // Shuffle (Fisher-Yates)
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }

  return letters;
}

/**
 * Check whether a word can be built from the given letter pool (each letter
 * usable at most as many times as it appears in the pool).
 */
export function canBuildFromLetters(word: string, letters: string[]): boolean {
  const pool = [...letters.map(l => l.toUpperCase())];
  for (const ch of word.toUpperCase()) {
    const idx = pool.indexOf(ch);
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return true;
}

/**
 * Find every valid word in the dictionary that can be built from the letters
 * and meets the minimum length. Dictionary is an array of lowercase words.
 */
/**
 * Extract all LETTER_COUNT-letter words from the dictionary. Used as seed
 * words for Text Twist mode — guarantees at least one pangram exists.
 */
export function collectPangramSeeds(dictionary: Set<string>): string[] {
  const seeds: string[] = [];
  for (const w of dictionary) {
    if (w.length === LETTER_COUNT) seeds.push(w);
  }
  return seeds;
}

/**
 * Generate letters by picking a random LETTER_COUNT-letter word from the
 * seed list and shuffling its letters.
 */
export function generateLettersFromPangram(seeds: string[]): string[] {
  if (seeds.length === 0) return generateLetters();
  const word = seeds[Math.floor(Math.random() * seeds.length)];
  const letters = word.toUpperCase().split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

export function findAllPossibleWords(letters: string[], dictionary: Set<string>): string[] {
  const found: string[] = [];

  for (const word of dictionary) {
    if (word.length < MIN_WORD_LENGTH || word.length > LETTER_COUNT) continue;
    if (canBuildFromLetters(word, letters)) {
      found.push(word);
    }
  }

  return found.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * Score a word: length - 2 (so 3=1, 4=2, ..., 7=5), plus +3 pangram bonus
 * when the word uses all LETTER_COUNT letters.
 */
export function scoreWord(word: string): number {
  const base = Math.max(0, word.length - 2);
  const bonus = word.length === LETTER_COUNT ? 3 : 0;
  return base + bonus;
}
