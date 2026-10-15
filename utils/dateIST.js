/** Calendar date YYYY-MM-DD in Asia/Kolkata (matches CRM business timezone). */
function getTodayDateStringIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Validates whether a string is a genuine calendar date in YYYY-MM-DD format.
 * Correctly rejects impossible calendar dates such as 2024-02-30, 2026-99-99, 2023-04-31, etc.
 */
function isValidCalendarDateString(str) {
  if (!str) return false;
  if (typeof str !== 'string') {
    if (str instanceof Date) return !isNaN(str.getTime());
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() === day;
}

module.exports = {
  getTodayDateStringIST,
  isValidCalendarDateString,
};

