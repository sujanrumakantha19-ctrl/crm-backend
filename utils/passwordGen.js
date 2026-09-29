/**
 * Random password generator for admin-created accounts (Staff / Channel Partner).
 * Avoids ambiguous characters (l, I, O, 0, 1) and guarantees at least one
 * character from each category (upper, lower, digit, symbol).
 */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';

function pick(set, random) {
  return set[Math.floor(random() * set.length)];
}

function generateRandomPassword(length = 10) {
  if (length < 4) {
    throw new Error('Password length must be at least 4');
  }

  const random = Math.random;

  // Guarantee at least one from each category
  const parts = [pick(UPPER, random), pick(LOWER, random), pick(DIGITS, random), pick(SYMBOLS, random)];

  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  for (let i = parts.length; i < length; i += 1) {
    parts.push(pick(all, random));
  }

  // Shuffle (Fisher-Yates)
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join('');
}

module.exports = {
  generateRandomPassword,
};
