const { ALL_RESERVED, BANNED_NAMES } = require('../config/reserved-names');

/**
 * Common letter substitutions people use to bypass filters
 */
const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  '$': 's',
};

/**
 * Normalize a string for comparison
 * - lowercase
 * - replace leet speak
 * - remove special chars
 */
function normalize(str) {
  let result = str.toLowerCase();

  // Replace leet speak
  for (const [leet, letter] of Object.entries(LEET_MAP)) {
    result = result.split(leet).join(letter);
  }

  // Remove non-alphanumeric
  result = result.replace(/[^a-z]/g, '');

  return result;
}

/**
 * Check if username is valid
 * Returns { valid: true } or { valid: false, reason: string }
 */
function validateUsername(username) {
  // Length check
  if (!username || username.length < 2) {
    return { valid: false, reason: 'Username must be at least 2 characters' };
  }

  if (username.length > 20) {
    return { valid: false, reason: 'Username must be 20 characters or less' };
  }

  // Character check (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, reason: 'Username can only contain letters, numbers, underscore, and hyphen' };
  }

  const normalized = normalize(username);

  // Exact match against reserved names
  if (ALL_RESERVED.some(name => normalize(name) === normalized)) {
    return { valid: false, reason: 'This username is not available' };
  }

  // Contains check for banned words
  for (const banned of BANNED_NAMES) {
    if (normalized.includes(normalize(banned))) {
      return { valid: false, reason: 'This username is not allowed' };
    }
  }

  return { valid: true };
}

module.exports = { validateUsername, normalize };
