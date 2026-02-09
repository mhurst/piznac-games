/**
 * Reserved usernames that cannot be registered.
 * Case-insensitive matching is applied.
 */

// System/admin names
const SYSTEM_NAMES = [
  'admin',
  'administrator',
  'mod',
  'moderator',
  'system',
  'server',
  'root',
  'superuser',
  'owner',
  'staff',
  'support',
  'helpdesk',
];

// Generic reserved
const RESERVED_NAMES = [
  'guest',
  'anonymous',
  'unknown',
  'player',
  'user',
  'test',
  'null',
  'undefined',
  'ai',
  'bot',
  'computer',
  'cpu',
];

// Offensive/inappropriate (add more as needed)
const BANNED_NAMES = [
  'fuck',
  'shit',
  'ass',
  'bitch',
  'nigger',
  'faggot',
  'retard',
  'cunt',
];

// Combine all lists
const ALL_RESERVED = [
  ...SYSTEM_NAMES,
  ...RESERVED_NAMES,
  ...BANNED_NAMES,
];

module.exports = {
  SYSTEM_NAMES,
  RESERVED_NAMES,
  BANNED_NAMES,
  ALL_RESERVED,
};
