'use strict';
const { dayKey, today } = require('./save');

function resetDailyEcon(save, now) {
  const k = dayKey(now);
  if (save.econ.day !== k) {
    save.econ.day = k;
    save.econ.activityCoins = 0;
    save.econ.commitCoins = 0;
    save.econ.gameCoins = 0;
  }
}

/** Grant coins and record them in the totals and today's history. Returns the amount granted. */
function earn(save, amount, now) {
  const n = Math.max(0, Math.floor(amount));
  if (!n) return 0;
  save.coins += n;
  save.totals.coinsEarned += n;
  today(save, now).coins += n;
  return n;
}

module.exports = { earn, resetDailyEcon };
