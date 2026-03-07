/**
 * Shared types and constants for the Spades card game.
 */

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SpadesCard {
  suit: Suit;
  value: string; // '2'...'A'
}

export type SpadesPhase =
  | 'setup'
  | 'bidding'
  | 'playing'
  | 'trickEnd'
  | 'roundEnd'
  | 'gameOver';

export interface PlayerBid {
  amount: number; // 0 = nil
  blind: boolean; // blind nil
}

export interface SpadesPlayer {
  name: string;
  seat: number;        // 0=human, 1=opp, 2=partner, 3=opp
  hand: SpadesCard[];
  bid: PlayerBid | null;
  tricksWon: number;
  isAI: boolean;
  difficulty: Difficulty;
}

export interface TeamScore {
  score: number;
  bags: number;
}

export interface TrickCard {
  seat: number;
  card: SpadesCard;
}

export interface RoundSummary {
  round: number;
  teamBids: [number, number];       // [team0 bid, team1 bid]
  teamTricks: [number, number];     // [team0 tricks, team1 tricks]
  teamDeltas: [number, number];     // [team0 pts gained, team1 pts gained]
  nilResults: { seat: number; name: string; success: boolean; blind: boolean }[];
  bagPenalty: [boolean, boolean];    // did team get bag penalty this round?
}

export interface SpadesVisualState {
  phase: SpadesPhase;
  players: {
    name: string;
    seat: number;
    cardCount: number;
    bid: PlayerBid | null;
    tricksWon: number;
    isCurrentTurn: boolean;
    isHuman: boolean;
    isPartner: boolean;
  }[];
  humanHand: SpadesCard[];
  currentTrick: TrickCard[];
  teamScores: [TeamScore, TeamScore];
  message: string;
  round: number;
  dealer: number;
  currentPlayer: number;
  spadesbroken: boolean;
  trickLeader: number;
  roundSummary: RoundSummary | null;
  gameWinner: string | null; // 'Your Team' or 'Opponents'
  legalIndices: number[];    // indices into humanHand that can be played
  blindNilOffer: boolean;    // true = offering blind nil before showing cards
}

/** Numeric card values for comparison (2 lowest, Ace highest). */
export const CARD_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

/** Suit sort order for hand display — alternates black/red so same-color suits aren't adjacent. */
export const SUIT_ORDER: Record<Suit, number> = {
  spades: 0, hearts: 1, clubs: 2, diamonds: 3
};

export const SEAT_LABELS = ['You', 'Opponent', 'Partner', 'Opponent'];

/** Team index for each seat: seats 0,2 = team 0, seats 1,3 = team 1. */
export const TEAM_FOR_SEAT: Record<number, number> = {
  0: 0, 1: 1, 2: 0, 3: 1
};

export const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
