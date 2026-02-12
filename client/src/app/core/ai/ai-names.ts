/**
 * Shared AI opponent names — used across all games.
 * Each name has a matching avatar image in assets/sprites/board-game/avatars/images/{name}.png
 */
export const AI_NAMES: string[] = [
  'JohnnyBoy',
  'JayJay',
  'JimBob',
  'Sal',
  'SallyJoe',
  'June',
];

/**
 * Avatar config for AI players.
 * `color`/`initial` used as fallback if avatar image fails to load.
 */
export interface AvatarConfig {
  color: number;
  initial: string;
}

export const AI_AVATARS: Record<string, AvatarConfig> = {
  JohnnyBoy: { color: 0xc0392b, initial: 'J' },
  JayJay:    { color: 0x2980b9, initial: 'J' },
  JimBob:    { color: 0x27ae60, initial: 'J' },
  Sal:       { color: 0xe67e22, initial: 'S' },
  SallyJoe:  { color: 0x8e44ad, initial: 'S' },
  June:      { color: 0xd4a847, initial: 'J' },
};

/** Get avatar config for an AI name. Returns a default gray circle if name unknown. */
export function getAvatarConfig(name: string): AvatarConfig {
  return AI_AVATARS[name] ?? { color: 0x555555, initial: name.charAt(0).toUpperCase() };
}

/**
 * Pick `count` random unique names from the list.
 */
export function getRandomAINames(count: number): string[] {
  const shuffled = [...AI_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
