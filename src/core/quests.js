'use strict';
const { QUESTS, QUESTS_PER_DAY, QUEST_BONUS } = require('./catalog');
const { dayKey } = require('./save');
const { earn } = require('./econ');

function seedFrom(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make sure today's quests exist. They're drawn deterministically from the day and the save's
 * creation time, so every window agrees and a reload never re-rolls them.
 * @returns {boolean} true if a new day started
 */
function ensureQuests(save, now) {
  const k = dayKey(now);
  if (save.quests.day === k && save.quests.list.length) return false;
  const r = rng(seedFrom(`${k}:${Math.floor(save.createdAt / 1000)}`));
  const pool = Object.keys(QUESTS);
  const list = [];
  while (list.length < QUESTS_PER_DAY && pool.length) {
    const id = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const q = QUESTS[id];
    list.push({ id, target: q.targets[Math.floor(r() * q.targets.length)], done: false });
  }
  save.quests = { day: k, list, counters: {}, bonusClaimed: false };
  return true;
}

/** Add to one of today's counters (chars, saves, commits, minutes, games, feeds, cleans, bugFree, tasks, focus). */
function bump(save, counter, n, now) {
  ensureQuests(save, now);
  const c = save.quests.counters;
  c[counter] = (c[counter] || 0) + n;
}

/** Set a counter to an absolute value (used for "languages today"). */
function setCounter(save, counter, value, now) {
  ensureQuests(save, now);
  save.quests.counters[counter] = Math.max(save.quests.counters[counter] || 0, value);
}

function progressOf(save, q) {
  return Math.min(q.target, save.quests.counters[QUESTS[q.id].counter] || 0);
}

/** Award any newly completed quests, and the bonus when all are done. */
function updateQuests(save, now) {
  ensureQuests(save, now);
  const events = [];
  for (const q of save.quests.list) {
    if (q.done || progressOf(save, q) < q.target) continue;
    q.done = true;
    save.totals.questsDone++;
    events.push({ type: 'quest', id: q.id, coins: earn(save, QUESTS[q.id].reward, now) });
  }
  if (!save.quests.bonusClaimed && save.quests.list.length && save.quests.list.every(q => q.done)) {
    save.quests.bonusClaimed = true;
    save.totals.questPerfectDays++;
    events.push({ type: 'questsAllDone', coins: earn(save, QUEST_BONUS, now) });
  }
  return events;
}

/** "Make 3 commits" style text for a quest. */
function describeQuest(q) {
  const n = q.target;
  return QUESTS[q.id].desc
    .replace('{n}', String(n))
    .replace('{s}', n === 1 ? '' : 's')
    .replace('{es}', n === 1 ? '' : 'es');
}

/** View model for the UI. */
function questView(save) {
  return save.quests.list.map(q => ({
    id: q.id,
    name: QUESTS[q.id].name,
    text: describeQuest(q),
    reward: QUESTS[q.id].reward,
    target: q.target,
    progress: Math.floor(progressOf(save, q)),
    done: q.done,
  }));
}

module.exports = { ensureQuests, bump, setCounter, updateQuests, describeQuest, questView, seedFrom, rng };
