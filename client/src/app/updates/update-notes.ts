export interface UpdateNote {
  date: string;       // MM-DD-YYYY
  note: string;       // Short summary
  details?: string[]; // Optional bullet points
}

export const APP_VERSION = 'v0.8.1';

export const UPDATE_NOTES: UpdateNote[] = [
  {
    date: '02-24-2026',
    note: 'Poker: added next hand modal for clearer round transitions.',
    details: [
      'Settlement modal replaces the old message bar between hands',
    ]
  },
  {
    date: '02-24-2026',
    note: 'Chess added! Play vs AI or multiplayer.',
    details: [
      'Full chess rules: castling, en passant, promotion, check/checkmate',
      'AI with 3 difficulty levels (easy, medium, hard)',
      'Multiplayer support with rematch',
      'Draw detection: stalemate, 50-move rule, threefold repetition',
    ]
  },
];
