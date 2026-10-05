'use strict';
// The Weekly Challenge: one mini-game a week pays double, chosen from the ISO week so every window
// and every teammate gets the same one. Your best score travels on your team card.
const { GAMES, CHALLENGE } = require('./catalog');
const { weekKey } = require('./save');
const { seedFrom } = require('./quests');
const quests = require('./quests');

function gameOfWeek(now) {
  const ids = Object.keys(GAMES);
  return ids[seedFrom(`challenge:${weekKey(now)}`) % ids.length];
}

function ensure(save, now) {
  const wk = weekKey(now);
  if (save.challenge.week !== wk) save.challenge = { week: wk, best: 0, plays: 0 };
}

/** Record a finished game. @returns {{isChallenge: boolean, newBest?: boolean}} */
function record(save, gameId, score, now) {
  ensure(save, now);
  if (gameId !== gameOfWeek(now)) return { isChallenge: false };
  if (save.challenge.plays === 0) save.totals.challengeWeeks++;
  save.challenge.plays++;
  quests.bump(save, 'challenge', 1, now);
  const newBest = score > save.challenge.best;
  if (newBest) save.challenge.best = score;
  return { isChallenge: true, newBest };
}

/** Local-time start of next Monday. */
function nextReset(now) {
  const d = new Date(now);
  const daysToMonday = (8 - d.getDay()) % 7 || 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToMonday).getTime();
}

function view(save, now) {
  const wk = weekKey(now);
  const game = gameOfWeek(now);
  const current = save.challenge.week === wk;
  return {
    week: wk, game, name: GAMES[game].name, multiplier: CHALLENGE.multiplier,
    best: current ? save.challenge.best : 0, plays: current ? save.challenge.plays : 0,
    resetInMs: Math.max(0, nextReset(now) - now),
  };
}

module.exports = { gameOfWeek, ensure, record, view, nextReset };
