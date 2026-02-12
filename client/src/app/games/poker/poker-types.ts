export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';

export interface Card {
  suit: Suit;
  value: string; // 'A','2'...'10','J','Q','K'
  faceDown?: boolean;
}

export enum HandRank {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
  FiveOfAKind = 10
}

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.OnePair]: 'One Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush',
  [HandRank.RoyalFlush]: 'Royal Flush',
  [HandRank.FiveOfAKind]: 'Five of a Kind'
};

export interface HandResult {
  rank: HandRank;
  name: string;
  tiebreakers: number[]; // ordered kicker values for comparing equal ranks
}

export type PokerPhase = 'variant-select' | 'wild-select' | 'ante' | 'dealing' | 'betting1' | 'draw' | 'betting2' | 'showdown' | 'settlement'
  | 'street3' | 'street4' | 'street5' | 'street6' | 'street7' | 'betting3' | 'betting4' | 'betting5';

export type PokerVariant = 'five-card-draw' | 'seven-card-stud';

export const POKER_VARIANTS: { id: PokerVariant; name: string; description: string }[] = [
  { id: 'five-card-draw', name: '5-Card Draw', description: 'Classic draw poker — discard and draw up to 5 cards' },
  { id: 'seven-card-stud', name: '7-Card Stud', description: 'Progressive dealing — 7 cards, best 5 wins' },
];

export const VARIANT_NAMES: Record<PokerVariant, string> = {
  'five-card-draw': '5-Card Draw',
  'seven-card-stud': '7-Card Stud',
};

// --- Wild Cards ---

/** Special themed wilds + any card value ('2'..'A') for value-based wilds. */
export type WildCardOption =
  | 'jokers' | 'one-eyed-jacks' | 'suicide-king' | 'deuces'
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

/** Themed special wild card options (shown as toggle buttons with descriptions). */
export const WILD_CARD_OPTIONS: { id: WildCardOption; name: string; description: string }[] = [
  { id: 'jokers', name: 'Jokers', description: 'Two Joker cards added to the deck' },
  { id: 'one-eyed-jacks', name: 'One-Eyed Jacks', description: 'J\u2660 and J\u2665 are wild' },
  { id: 'suicide-king', name: 'Suicide King', description: 'K\u2665 is wild' },
];

/** Card values available for value-based wild selection. */
export const WILD_VALUE_OPTIONS: string[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export interface WildCardConfig {
  options: WildCardOption[];
}

/** Check if a specific card is wild given the active wild options. */
export function isCardWild(card: Card, wilds: WildCardOption[]): boolean {
  if (card.suit === 'joker') return true;
  if (wilds.includes('one-eyed-jacks') && card.value === 'J' && (card.suit === 'spades' || card.suit === 'hearts')) return true;
  if (wilds.includes('suicide-king') && card.value === 'K' && card.suit === 'hearts') return true;
  if (wilds.includes('deuces') && card.value === '2') return true;
  // Value-based wilds (e.g. '3', '6', '9' means all cards of that value are wild)
  if (wilds.includes(card.value as WildCardOption)) return true;
  return false;
}

/** Whether a variant allows wild cards. */
export const VARIANT_ALLOWS_WILDS: Record<PokerVariant, boolean> = {
  'five-card-draw': true,
  'seven-card-stud': true,
};

export type BettingAction = 'check' | 'call' | 'raise' | 'fold' | 'allin';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PokerPlayer {
  id: string;
  name: string;
  chips: number;
  hand: Card[];
  bet: number;          // current bet this round
  totalBet: number;     // total chips committed this hand
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;
  isActive: boolean;    // currently making a decision
  result?: string;      // 'win', 'lose', 'split'
  payout?: number;
  handResult?: HandResult;
  isAI?: boolean;
  difficulty?: Difficulty;
  discards?: number[];  // indices of cards to discard during draw phase
  hasActed?: boolean;   // has acted this betting round
  isEliminated?: boolean;
}

export interface PotInfo {
  amount: number;
  eligible: string[]; // player IDs eligible for this pot
}

export interface PokerVisualState {
  phase: PokerPhase;
  players: PokerPlayer[];
  myIndex: number;
  currentPlayerIndex: number;
  pot: number;
  pots: PotInfo[];
  dealerIndex: number;
  message: string;

  // Action availability
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  canFold: boolean;
  canAllIn: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;

  // Draw phase
  isDrawPhase: boolean;
  canDiscard: boolean;
  maxDiscards: number;  // 3 normally, 4 if holding an ace

  // Betting/dealing flags
  isBetting: boolean;
  isShowdown: boolean;
  wonByFold: boolean;

  // Variant selection (dealer's choice)
  isVariantSelect: boolean;
  isDealerForSelect: boolean;
  variantName: string;
  availableVariants: { id: PokerVariant; name: string; description: string }[];

  // Wild card selection
  isWildSelect: boolean;
  isDealerForWildSelect: boolean;
  activeWilds: WildCardOption[];

  // Buy-in phase (shows game announcement + buy-in button)
  isBuyIn: boolean;

  // 7-Card Stud
  currentStreet: number;    // 3-7, which street we're on (0 for draw)
  lastCardDown: boolean;    // whether 7th card is dealt face-down
  isStud: boolean;          // convenience flag
}

export interface DrawSelection {
  playerIndex: number;
  cardIndices: number[]; // which cards to discard
}

export const CARD_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export const ANTE_AMOUNT = 1;
export const MIN_BET = 5;
export const STARTING_CHIPS = 1000;
