/**
 * Sound configuration and registry.
 * Add new sounds here - they'll be auto-loaded by AudioService.
 */

export interface SoundConfig {
  src: string;
  volume?: number;  // 0-1, default 1
}

// Base path for all sounds
export const SOUNDS_BASE_PATH = 'assets/sounds';

// UI sounds - buttons, notifications, etc.
export const UI_SOUNDS: Record<string, SoundConfig> = {
  'click': { src: 'board-game/cardPlace1.ogg', volume: 0.4 },
};

// Shared game sounds - used across all games
export const GAME_SOUNDS: Record<string, SoundConfig> = {
  // Using available board-game sounds as placeholders
};

// Game-specific sounds - keyed by game ID
export const GAME_SPECIFIC_SOUNDS: Record<string, Record<string, SoundConfig>> = {
  'tic-tac-toe': {
    'place': { src: 'board-game/cardPlace1.ogg', volume: 0.6 },
  },
  'connect-four': {
    'drop': { src: 'board-game/chipsCollide1.ogg', volume: 0.5 },
    'land': { src: 'board-game/chipsCollide2.ogg', volume: 0.7 },
  },
  'checkers': {
    'move': { src: 'board-game/chipsCollide1.ogg', volume: 0.5 },
    'capture': { src: 'board-game/chipsCollide3.ogg', volume: 0.7 },
    'king': { src: 'board-game/chipsCollide2.ogg', volume: 0.8 },
  },
  'war': {
    'flip': { src: 'board-game/cardPlace1.ogg', volume: 0.6 },
    'slide': { src: 'board-game/cardSlide1.ogg', volume: 0.5 },
    'win-round': { src: 'board-game/chipsCollide1.ogg', volume: 0.4 },
  },
  'yahtzee': {
    'roll': { src: 'board-game/dieThrow1.ogg', volume: 0.6 },
    'hold': { src: 'board-game/dieShuffle1.ogg', volume: 0.4 },
    'score': { src: 'board-game/cardPlace1.ogg', volume: 0.5 },
  },
  'farkle': {
    'roll': { src: 'board-game/dieThrow1.ogg', volume: 0.6 },
    'keep': { src: 'board-game/dieShuffle1.ogg', volume: 0.4 },
    'bank': { src: 'board-game/chipsCollide1.ogg', volume: 0.5 },
    'farkle': { src: 'board-game/dieThrow2.ogg', volume: 0.7 },
  },
  'solitaire': {
    'flip': { src: 'board-game/cardPlace1.ogg', volume: 0.6 },
    'place': { src: 'board-game/cardPlace2.ogg', volume: 0.5 },
    'slide': { src: 'board-game/cardSlide1.ogg', volume: 0.5 },
    'win': { src: 'board-game/chipsCollide1.ogg', volume: 0.8 },
  },
  'blackjack': {
    'deal': { src: 'board-game/cardSlide1.ogg', volume: 0.5 },
    'hit': { src: 'board-game/cardPlace1.ogg', volume: 0.6 },
    'flip': { src: 'board-game/cardPlace2.ogg', volume: 0.5 },
    'win': { src: 'board-game/chipsCollide1.ogg', volume: 0.6 },
    'lose': { src: 'board-game/cardSlide1.ogg', volume: 0.4 },
    'chips': { src: 'board-game/chipsCollide2.ogg', volume: 0.5 },
  },
  'mancala': {
    'sow': { src: 'board-game/chipsCollide1.ogg', volume: 0.5 },
    'capture': { src: 'board-game/chipsCollide3.ogg', volume: 0.7 },
    'extra-turn': { src: 'board-game/chipsCollide2.ogg', volume: 0.6 },
  },
};

// All sound IDs for type safety
export type UISoundId = keyof typeof UI_SOUNDS;
export type GameSoundId = keyof typeof GAME_SOUNDS;
export type GameSpecificSoundId<G extends keyof typeof GAME_SPECIFIC_SOUNDS> =
  keyof typeof GAME_SPECIFIC_SOUNDS[G];
