'use strict';
const { DAY, MIN, ECONOMY, ITEMS, FOCUS, MILESTONES } = require('./catalog');
const { clamp, dayKey, today } = require('./save');
const { earn, resetDailyEcon } = require('./econ');
const quests = require('./quests');

/** Can the pet react to things right now? */
function responsive(save) {
  const p = save.pet;
  return !save.paused && !p.dead && !p.asleep && p.species !== 'egg';
}

function daysAgo(now, n) {
  const d = new Date(now);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime());
}

/**
 * A day counts toward your streak the first time you're active in it. Missing exactly one day
 * is forgiven if you hold a Streak Shield.
 * @returns {Array<{type: string, [k: string]: any}>}
 */
function checkIn(save, now) {
  const k = dayKey(now);
  const st = save.streak;
  if (st.lastDay === k) return [];
  const events = [];
  if (st.lastDay === daysAgo(now, 1)) {
    st.current += 1;
  } else if (st.lastDay === daysAgo(now, 2) && save.items.streakShield > 0 && st.current > 0) {
    save.items.streakShield--;
    save.totals.shieldsUsed++;
    st.current += 1;
    events.push({ type: 'shieldUsed', streak: st.current });
  } else {
    st.current = 1;
  }
  st.best = Math.max(st.best, st.current);
  st.lastDay = k;
  const bonus = Math.min(ECONOMY.checkInMaxBonus, (st.current - 1) * ECONOMY.checkInPerStreakDay);
  const coins = earn(save, ECONOMY.checkInBase + bonus, now);
  events.push({ type: 'checkIn', streak: st.current, coins });
  return events;
}

/** Languages coded in today for at least a minute. */
function languagesToday(save, now) {
  return Object.values(today(save, now).langs || {}).filter(ms => ms >= MIN).length;
}

/**
 * Apply a batch of editor activity.
 * @param {{chars?: number, codingMs?: number, saves?: number, commits?: number, testSaves?: number, langs?: Record<string, number>}} a
 * @param {{codingRewards?: boolean}} opts
 */
function recordActivity(save, a, now, opts = {}) {
  const events = [];
  resetDailyEcon(save, now);
  const chars = Math.max(0, a.chars || 0);
  const codingMs = Math.max(0, a.codingMs || 0);
  const saves = Math.max(0, a.saves || 0);
  const commits = Math.max(0, a.commits || 0);
  const testSaves = Math.max(0, Math.min(saves, a.testSaves || 0));
  if (!chars && !codingMs && !saves && !commits) return events;

  events.push(...checkIn(save, now));

  const day = today(save, now);
  const t = save.totals;
  const p = save.pet;
  const petAlive = !p.dead && !save.paused;
  day.chars += chars; day.codingMs += codingMs; day.saves += saves; day.commits += commits;
  t.chars += chars; t.codingMs += codingMs; t.saves += saves; t.commits += commits; t.testSaves += testSaves;
  if (petAlive) p.codingMs += codingMs;

  for (const [lang, ms] of Object.entries(a.langs || {})) {
    if (!/^[a-z0-9_.+#-]{1,40}$/i.test(lang) || !(ms > 0)) continue;
    day.langs[lang] = (day.langs[lang] || 0) + ms;
    save.langs[lang] = (save.langs[lang] || 0) + ms;
    // Per-pet language time decides the Dataray branch. Keep the map small.
    if (petAlive && (p.langMs[lang] !== undefined || Object.keys(p.langMs).length < 40)) p.langMs[lang] = (p.langMs[lang] || 0) + ms;
  }

  if (codingMs > 0) {
    const h = new Date(now).getHours();
    if (h < 4) t.nightOwl = true;
    if (h >= 5 && h < 7) t.earlyBird = true;
    if (petAlive && (h >= 22 || h < 5)) p.nightMs += codingMs; // the Nocturne branch
  }

  if (chars) quests.bump(save, 'chars', chars, now);
  if (saves) quests.bump(save, 'saves', saves, now);
  if (testSaves) quests.bump(save, 'tests', testSaves, now);
  if (commits) quests.bump(save, 'commits', commits, now);
  if (codingMs) quests.bump(save, 'minutes', codingMs / MIN, now);
  quests.setCounter(save, 'languages', languagesToday(save, now), now);

  if (opts.codingRewards === false) return events;

  // Coins for typing and saving, capped per day.
  save.econ.charCarry += chars;
  let activity = Math.floor(save.econ.charCarry / ECONOMY.charsPerCoin);
  save.econ.charCarry -= activity * ECONOMY.charsPerCoin;
  if (saves && now - save.econ.lastSaveReward >= ECONOMY.saveThrottleMs) {
    save.econ.lastSaveReward = now;
    activity += ECONOMY.saveCoin;
  }
  activity = Math.min(activity, ECONOMY.maxActivityCoinsPerDay - save.econ.activityCoins);
  if (activity > 0) save.econ.activityCoins += earn(save, activity, now);

  if (commits) {
    const commitCoins = Math.min(commits * ECONOMY.commitCoins, ECONOMY.maxCommitCoinsPerDay - save.econ.commitCoins);
    if (commitCoins > 0) save.econ.commitCoins += earn(save, commitCoins, now);
    events.push({ type: 'commit', coins: Math.max(0, commitCoins) });
  }

  if (responsive(save)) {
    const p = save.pet;
    p.happy = clamp(p.happy + chars / 400 + (saves ? 1 : 0) + commits * 8);
  }
  return events;
}

function bugFree(save, now) {
  save.totals.errorsCleared++;
  quests.bump(save, 'bugFree', 1, now);
  const coins = earn(save, ECONOMY.bugFreeCoins, now);
  if (responsive(save)) save.pet.happy = clamp(save.pet.happy + 5);
  return { type: 'bugFree', coins };
}

function taskResult(save, ok, now) {
  if (!ok) {
    if (responsive(save)) save.pet.happy = clamp(save.pet.happy - 1);
    return { type: 'taskFailed' };
  }
  save.totals.tasksPassed++;
  quests.bump(save, 'tasks', 1, now);
  const coins = earn(save, ECONOMY.taskSuccessCoins, now);
  if (responsive(save)) save.pet.happy = clamp(save.pet.happy + 2);
  return { type: 'taskPassed', coins };
}

/** A focus (Pomodoro) work block finished. */
function completeFocus(save, minutes, now) {
  const mins = Math.max(1, Math.min(180, Math.floor(minutes)));
  save.totals.focusSessions++;
  save.totals.focusMs += mins * MIN;
  quests.bump(save, 'focus', 1, now);
  const boosted = (save.items.focusBoost || 0) > 0;
  if (boosted) save.items.focusBoost--;
  const coins = earn(save, Math.floor(mins / 5) * FOCUS.coinsPerFiveMinutes * (boosted ? 2 : 1), now);
  if (responsive(save)) save.pet.happy = clamp(save.pet.happy + FOCUS.happy);
  return { type: 'focusDone', minutes: mins, coins, boosted };
}

/**
 * A rubber-duck session: you explained a bug to your pet (the text never leaves the webview; we only
 * get a character count). Pays a little, with a cooldown so it can't be farmed.
 */
function duck(save, chars, now) {
  const p = save.pet;
  const n = Math.floor(Number(chars) || 0);
  if (n < ECONOMY.duckMinChars) return { ok: false, message: `Keep going. ${p.name} is listening, but needs a little more detail (${ECONOMY.duckMinChars}+ characters).` };
  const wait = ECONOMY.duckCooldownMs - (now - (save.econ.lastDuck || 0));
  if (wait > 0) return { ok: false, message: `${p.name} is still thinking about the last one. Try again in ${Math.ceil(wait / MIN)} min.` };
  save.econ.lastDuck = now;
  save.totals.duckSessions++;
  quests.bump(save, 'duck', 1, now);
  const coins = earn(save, ECONOMY.duckCoins, now);
  if (responsive(save)) p.happy = clamp(p.happy + 8);
  const lines = ['Did explaining it help? It usually does.', 'Quack. I mean: I think you already know the answer.', 'So the bug was in the part you skipped over. Classic.', 'I followed about half of that, and I believe in you.'];
  return { ok: true, message: `${lines[n % lines.length]} +${coins}🪙`, anim: 'heart', events: [{ type: 'duck', coins }] };
}

/** Real-time age milestones: a free cake and some coins. */
function checkMilestones(save, now) {
  const p = save.pet;
  const events = [];
  if (p.dead || p.species === 'egg') return events;
  const days = Math.floor((now - p.bornAt) / DAY);
  for (const [k, reward] of Object.entries(MILESTONES)) {
    const d = Number(k);
    if (days < d || p.milestones[k]) continue;
    p.milestones[k] = true;
    save.inventory.cake = (save.inventory.cake || 0) + 1;
    events.push({ type: 'milestone', days: d, coins: earn(save, reward, now) });
  }
  return events;
}

const { checkAchievements } = require('./achievements');

module.exports = {
  earn, resetDailyEcon, responsive, checkIn, recordActivity, bugFree, taskResult, completeFocus, checkMilestones, duck,
  checkAchievements, languagesToday, ITEMS,
};
