export interface GoFishCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value: string;
  faceDown?: boolean;
}

export type GoFishPhase = 'waiting' | 'playing' | 'gameOver';

export interface GoFishPlayer {
  id: string;
  name: string;
  hand: GoFishCard[];
  books: string[];       // ranks completed (e.g. ['A', '7', 'K'])
  cardCount: number;     // for opponents whose hand is hidden
  isActive: boolean;
  isAI?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface GoFishLastAction {
  askerId: string;
  askerName: string;
  targetId: string;
  targetName: string;
  rank: string;
  gotCards: boolean;      // did target have cards?
  cardsGiven: number;     // how many cards given
  drewMatch: boolean;     // did the fisher draw the asked rank?
  newBook?: string;       // rank of new book if one was made
}

export interface GoFishVisualState {
  phase: GoFishPhase;
  players: GoFishPlayer[];
  myIndex: number;
  currentPlayerIndex: number;
  deckCount: number;
  message: string;
  isMyTurn: boolean;
  canAsk: boolean;
  selectedTargetIndex: number | null;
  selectedRank: string | null;
  lastAction: GoFishLastAction | null;
  newBook: string | null;
  winner?: string;
  winnerBooks?: number;
}

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RANK_DISPLAY: Record<string, string> = {
  'A': 'A', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'J', 'Q': 'Q', 'K': 'K'
};
