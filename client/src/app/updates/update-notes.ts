export interface UpdateNote {
  date: string;       // MM-DD-YYYY
  note: string;       // Short summary
  details?: string[]; // Optional bullet points
}

export const APP_VERSION = 'v0.8.10';

export const UPDATE_NOTES: UpdateNote[] = [
  {
    date: '04-16-2026',
    note: 'Anagrams added! Two modes: Classic and Text Twist.',
    details: [
      'Classic: 2-minute sprint — find as many words as you can',
      'Text Twist: find a 7-letter word each round to advance, cumulative scoring',
      'ENABLE1 dictionary (172,823 words) for validation',
      'Per-mode high scores saved to localStorage',
      'Click tiles or type letters — full keyboard support (Enter, Backspace, Esc)',
    ]
  },
  {
    date: '03-09-2026',
    note: 'Backgammon added! Card game loading fixes.',
    details: [
      'Backgammon: full rules with dice rolling animation, 3 AI difficulties',
      'Backgammon: multiplayer support for 2 players',
      'Fixed card games (Gin Rummy, Spades) not loading card images',
      'Gin Rummy: AI hand now sorted when revealed at end of round',
    ]
  },
  {
    date: '03-08-2026',
    note: 'Spades multiplayer added! Gin Rummy improvements.',
    details: [
      'Spades: 4-player partnership multiplayer',
      'Gin Rummy: new game with drag-and-drop card sorting',
    ]
  },
  {
    date: '03-07-2026',
    note: 'Spades (single player) added! War layout improvements.',
    details: [
      'New game: Spades with AI partners and opponents',
      'War: fixed avatar positioning to avoid card overlap',
    ]
  },
  {
    date: '02-25-2026',
    note: 'Battleship: added player avatars and ship spacing rule.',
    details: [
      'AI opponent avatar and name displayed during battle phase',
      'Player "YOU" avatar with turn glow indicator',
      'Ships can no longer be placed touching each other (including diagonally)',
    ]
  },
  {
    date: '02-25-2026',
    note: 'Connect Four: added player avatars.',
    details: [
      'AI opponent avatar and name displayed at top of board',
      'Player "YOU" avatar at bottom with turn glow',
      'AI name shown in score display and turn indicator',
    ]
  },
  {
    date: '02-25-2026',
    note: 'Tic-Tac-Toe: added player avatars.',
    details: [
      'AI opponent avatar and name displayed at top of board',
      'Player "YOU" avatar at bottom with turn glow',
      'AI name shown in score display and turn indicator',
    ]
  },
  {
    date: '02-25-2026',
    note: 'Checkers: added player avatars and board orientation fix.',
    details: [
      'AI opponent avatar and name displayed at top of board',
      'Player "YOU" avatar at bottom of board with turn glow',
      'Board flips when playing as Red so your pieces are always at the bottom',
      'AI name shown in score display and turn indicator',
    ]
  },
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
