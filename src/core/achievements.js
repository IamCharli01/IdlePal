'use strict';
// Tiered achievements. Each track has ascending goals; unlocking tier N reveals tier N+1.
// Unlocks are stored flat as save.achievements["<track>.<tierIndex>"] = unlockedAt.
const { HOUR, DAY, MIN, ACHIEVEMENTS, SPECIES, ACCESSORIES, GAMES, DECOR } = require('./catalog');
const { earn } = require('./econ');

const adultSpecies = Object.keys(SPECIES).filter(k => SPECIES[k].stage === 'adult');
const langsInDay = h => Object.values(h.langs || {}).filter(ms => ms >= MIN).length;
const flag = b => (b ? 1 : 0);

/** How far along each track the save is, in the track's goal units. */
const METRICS = {
  hatch: s => s.totals.hatched,
  meals: s => s.totals.meals + s.totals.snacks,
  adults: s => s.totals.adults,
  mindReader: s => s.totals.perfectGames,
  bugBlitz: s => s.best.bugs || 0,
  exterminator: s => s.totals.bugsSquashed,
  cleans: s => s.totals.cleans,
  cures: s => s.totals.cures,
  streak: s => s.streak.best,
  deepWork: s => Math.max(0, ...Object.values(s.history).map(h => h.codingMs)) / HOUR,
  chars: s => s.totals.chars,
  commits: s => s.totals.commits,
  errors: s => s.totals.errorsCleared,
  tasks: s => s.totals.tasksPassed,
  collector: s => Object.keys(s.dex).filter(k => k !== 'egg').length,
  pokedex: s => flag(adultSpecies.every(k => s.dex[k])),
  shiny: s => s.totals.shinies,
  fashion: s => Object.keys(s.owned).filter(k => ACCESSORIES[k]).length,
  moneybags: s => s.coins,
  nightOwl: s => flag(s.totals.nightOwl),
  earlyBird: s => flag(s.totals.earlyBird),
  survivor: s => (s.pet.dead ? 0 : s.pet.ageMs / HOUR),
  dynasty: s => s.pet.generation,
  quests: s => s.totals.questsDone,
  questMaster: s => s.totals.questPerfectDays,
  focus: s => s.totals.focusSessions,
  polyglot: s => Math.max(0, ...Object.values(s.history).map(langsInDay)),
  milestones: s => Math.max(
    s.pet.dead || s.pet.species === 'egg' ? 0 : Math.max(...Object.keys(s.pet.milestones).map(Number), 0),
    ...s.graveyard.map(g => Math.floor((g.diedAt - g.bornAt) / DAY)),
    0,
  ),
  shielded: s => s.totals.shieldsUsed,
  team: s => flag(s.team.shared),
  dash: s => s.best.dash || 0,
  stack: s => s.best.stack || 0,
  simon: s => s.best.simon || 0,
  hotkeys: s => s.best.hotkeys || 0,
  merge: s => s.totals.mergePerfect,
  arcade: s => flag(Object.keys(GAMES).every(k => k in s.best)),
  gamesPlayed: s => s.totals.games,
  haggler: s => s.totals.haggles,
  lucky: s => s.totals.mysteryBoxes,
  gourmet: s => Object.keys(s.foodLog).length,
  balanced: s => s.totals.balancedDays,
  vaultHunter: s => Object.keys(s.owned).filter(k => ACCESSORIES[k] && ACCESSORIES[k].vault).length,
  snake: s => s.best.snake || 0,
  pipeline: s => s.best.pipeline || 0,
  breakout: s => s.best.breakout || 0,
  pong: s => s.best.pong || 0,
  bisect: s => s.totals.bisectPerfect,
  regex: s => s.totals.regexPerfect,
  bigo: s => s.totals.bigoPerfect,
  challenger: s => s.totals.challengeWeeks,
  explorer: s => s.totals.expeditions,
  archaeologist: s => Object.keys(s.artefacts).length,
  decorator: s => Object.keys(s.owned).filter(k => DECOR[k]).length,
  rubberDuck: s => s.totals.duckSessions,
  tester: s => s.totals.testSaves,
};

function parseKey(key) {
  const m = /^([A-Za-z]+)\.(\d+)$/.exec(String(key));
  if (!m || !ACHIEVEMENTS[m[1]]) return null;
  const tier = Number(m[2]);
  return tier < ACHIEVEMENTS[m[1]].goals.length ? { track: m[1], tier } : null;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function describeGoal(track, tier) {
  const t = ACHIEVEMENTS[track];
  const n = t.goals[tier];
  return t.desc
    .replace('{n}', n.toLocaleString('en-US'))
    .replace('{s}', n === 1 ? '' : 's')
    .replace('{es}', n === 1 ? '' : 'es');
}

/** Display info for one unlocked tier, e.g. "Exterminator III". */
function tierInfo(key) {
  const k = parseKey(key);
  if (!k) return null;
  const t = ACHIEVEMENTS[k.track];
  return {
    track: k.track,
    tier: k.tier,
    name: t.goals.length > 1 ? `${t.name} ${ROMAN[k.tier]}` : t.name,
    desc: describeGoal(k.track, k.tier),
    icon: t.icon,
    reward: t.rewards[k.tier],
  };
}

/** Number of tiers unlocked on a track (tiers unlock in order). */
function tiersUnlocked(save, track) {
  let n = 0;
  while (n < ACHIEVEMENTS[track].goals.length && save.achievements[`${track}.${n}`]) n++;
  return n;
}

/**
 * Unlock every tier whose goal is met, in order, paying each tier's reward.
 * Repeats until stable, because rewards can push the Moneybags track.
 */
function checkAchievements(save, now) {
  const unlocked = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [track, t] of Object.entries(ACHIEVEMENTS)) {
      let tier = tiersUnlocked(save, track);
      if (tier >= t.goals.length) continue;
      const value = METRICS[track](save);
      while (tier < t.goals.length && value >= t.goals[tier]) {
        const key = `${track}.${tier}`;
        save.achievements[key] = now;
        earn(save, t.rewards[tier], now);
        unlocked.push({ type: 'achievement', id: key });
        tier++;
        changed = true;
      }
    }
  }
  return unlocked;
}

/** Keep only valid tier keys from a stored achievements object. A tier also marks the tiers below it. */
function migrateAchievements(raw, now, num) {
  const out = {};
  const mark = (key, at) => {
    const k = parseKey(key);
    if (!k) return;
    for (let i = 0; i <= k.tier; i++) {
      const kk = `${k.track}.${i}`;
      if (!out[kk]) out[kk] = at;
    }
  };
  for (const [k, v] of Object.entries(raw || {})) {
    const at = num(v, now);
    mark(k, at);
  }
  return out;
}

/** Per-track view model for the UI. */
function achievementView(save) {
  return Object.entries(ACHIEVEMENTS).map(([track, t]) => {
    const done = tiersUnlocked(save, track);
    const maxed = done >= t.goals.length;
    const value = METRICS[track](save);
    const nextTier = maxed ? t.goals.length - 1 : done;
    const prevGoal = done > 0 ? t.goals[done - 1] : 0;
    const goal = t.goals[nextTier];
    return {
      id: track,
      name: t.goals.length > 1 && done > 0 ? `${t.name} ${ROMAN[done - 1]}` : t.name,
      icon: t.icon,
      tiers: t.goals.length,
      done,
      maxed,
      next: maxed ? null : { desc: describeGoal(track, nextTier), reward: t.rewards[nextTier], goal, tierName: t.goals.length > 1 ? ROMAN[nextTier] : null },
      progress: maxed ? 1 : Math.max(0, Math.min(1, (value - (t.flag ? 0 : prevGoal)) / Math.max(1e-9, goal - (t.flag ? 0 : prevGoal)))),
      value: Math.floor(value),
      lastDesc: done > 0 ? describeGoal(track, done - 1) : null,
      unlockedAt: done > 0 ? save.achievements[`${track}.${done - 1}`] : null,
    };
  });
}

const TOTAL_TIERS = Object.values(ACHIEVEMENTS).reduce((a, t) => a + t.goals.length, 0);

module.exports = { METRICS, checkAchievements, migrateAchievements, achievementView, tierInfo, tiersUnlocked, parseKey, describeGoal, TOTAL_TIERS };
