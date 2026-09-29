/** Calendar date YYYY-MM-DD in Asia/Kolkata (matches CRM business timezone). */
function getTodayDateStringIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

module.exports = { getTodayDateStringIST };
