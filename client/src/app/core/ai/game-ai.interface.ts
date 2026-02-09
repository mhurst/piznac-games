export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GameAI<TBoard, TMove> {
  /**
   * Get the AI's move for the current board state
   * @param board Current game board state
   * @param difficulty AI difficulty level
   * @returns The move the AI wants to make
   */
  getMove(board: TBoard, difficulty: Difficulty): TMove;

  /**
   * Check if the game is over
   * @param board Current game board state
   * @returns Winner identifier, 'draw', or null if game continues
   */
  checkGameOver(board: TBoard): string | 'draw' | null;
}

export interface GameAIConfig {
  /** Delay in ms before AI makes a move (for UX) */
  moveDelay: number;
  /** Default difficulty */
  defaultDifficulty: Difficulty;
}

export const DEFAULT_AI_CONFIG: GameAIConfig = {
  moveDelay: 500,
  defaultDifficulty: 'medium'
};
