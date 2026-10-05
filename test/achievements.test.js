'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { ACHIEVEMENTS } = require('../src/core/catalog');
const { createSave, migrate } = require('../src/core/save');
const { simulate } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const {
  METRICS, checkAchievements, achievementView, tierInfo, tiersUnlocked, TOTAL_TIERS,
} = require('../src/core/achievements');

function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const T0 = new Date(2026, 8, 21, 10).getTime();
function hatched() {
  const rand = seeded(1);
  const s = createSave(T0, rand);
  simulate(s, 90e3, { now: T0 + 90e3, rand });
  checkAchievements(s, T0); // settle the hatch tier so tests start clean
  return { s, rand };
}

test('catalog: every track has ascending goals, a reward per tier and a metric', () => {
  for (const [id, t] of Object.entries(ACHIEVEMENTS)) {
    assert.ok(t.goals.length >= 1, id);
    assert.equal(t.goals.length, t.rewards.length, `${id} rewards`);
    for (let i = 1; i < t.goals.length; i++) {
      assert.ok(t.goals[i] > t.goals[i - 1], `${id} goals ascend`);
      assert.ok(t.rewards[i] >= t.rewards[i - 1], `${id} rewards don't shrink`);
    }
    assert.equal(typeof METRICS[id], 'function', `${id} metric`);
    assert.ok(Number.isFinite(METRICS[id](createSave(T0, seeded(2)))), `${id} metric on a fresh save`);
  }
  assert.equal(TOTAL_TIERS, Object.values(ACHIEVEMENTS).reduce((a, t) => a + t.goals.length, 0));
});

test('tiers unlock one after another as the metric grows (30 → 60 → 100 bugs)', () => {
  const { s } = hatched();
  const coins0 = s.coins;
  s.totals.bugsSquashed = 45;
  let ids = checkAchievements(s, T0).map(e => e.id);
  assert.deepEqual(ids, ['exterminator.0']);
  assert.equal(tiersUnlocked(s, 'exterminator'), 1);
  s.totals.bugsSquashed = 100;
  ids = checkAchievements(s, T0).map(e => e.id);
  assert.deepEqual(ids, ['exterminator.1', 'exterminator.2'], 'crossing two goals at once unlocks both');
  assert.equal(s.coins - coins0, 10 + 20 + 40);
  assert.deepEqual(checkAchievements(s, T0), [], 'never twice');
});

test('bug blitz tracks the best single round, fed by real game results', () => {
  const { s, rand } = hatched();
  const play = score => { s.pet.energy = 100; applyAction(s, 'playResult', { game: 'bugs', score }, { now: T0, rand }); return checkAchievements(s, T0).map(e => e.id); };
  assert.ok(play(12).includes('bugBlitz.0'));
  assert.ok(!play(15).includes('bugBlitz.1'));
  const ids = play(31);
  assert.ok(ids.includes('bugBlitz.1') && ids.includes('bugBlitz.2'));
  assert.equal(tiersUnlocked(s, 'bugBlitz'), 3);
  // 12 + 15 + 31 = 58 lifetime: Exterminator I (30) but not II (60).
  assert.equal(tiersUnlocked(s, 'exterminator'), 1);
});

test('tier names and descriptions read naturally', () => {
  assert.equal(tierInfo('exterminator.2').name, 'Exterminator III');
  assert.equal(tierInfo('exterminator.2').desc, 'Squash 100 bugs in total');
  assert.equal(tierInfo('commits.0').desc, 'Make 1 commit');
  assert.equal(tierInfo('commits.3').desc, 'Make 1,000 commits');
  assert.equal(tierInfo('cures.0').desc, 'Cure 1 illness');
  assert.equal(tierInfo('cures.1').desc, 'Cure 10 illnesses');
  assert.equal(tierInfo('nightOwl.0').name, 'Night Owl', 'single-tier tracks have no numeral');
  assert.equal(tierInfo('exterminator.9'), null);
  assert.equal(tierInfo('bogus.0'), null);
});

test('the view shows the next goal and progress within the current tier', () => {
  const { s } = hatched();
  s.totals.bugsSquashed = 45;
  checkAchievements(s, T0);
  const ext = achievementView(s).find(a => a.id === 'exterminator');
  assert.equal(ext.done, 1);
  assert.equal(ext.name, 'Exterminator I');
  assert.equal(ext.next.goal, 60);
  assert.equal(ext.next.tierName, 'II');
  assert.equal(Math.round(ext.progress * 100), 50, '45 is halfway from 30 to 60');
  s.totals.bugsSquashed = 5000;
  checkAchievements(s, T0);
  const maxed = achievementView(s).find(a => a.id === 'exterminator');
  assert.equal(maxed.maxed, true);
  assert.equal(maxed.next, null);
  assert.equal(maxed.progress, 1);
});

test('stored tiers survive a reload and are never paid twice', () => {
  const raw = { schema: 2, achievements: { 'exterminator.2': T0 - 1000, 'streak.1': T0 - 2000, exterminator: T0, bogus: T0 }, totals: { bugsSquashed: 120, hatched: 1 }, streak: { current: 7, best: 7 } };
  const s = migrate(raw, T0, seeded(3));
  for (const k of ['exterminator.0', 'exterminator.1', 'exterminator.2', 'streak.0', 'streak.1']) assert.ok(s.achievements[k], k);
  assert.equal(s.achievements.bogus, undefined);
  assert.equal(s.achievements.exterminator, undefined, 'non-tier keys are dropped');
  const coins0 = s.coins;
  const ids = checkAchievements(s, T0).map(e => e.id);
  assert.ok(!ids.some(id => id.startsWith('exterminator') || id.startsWith('streak')), `no re-pay: ${ids}`);
  assert.ok(ids.includes('hatch.0'), 'genuinely new tiers still unlock');
  assert.equal(s.coins - coins0, ACHIEVEMENTS.hatch.rewards[0]);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s)), T0, seeded(4)).achievements, s.achievements);
});

test('hostile achievement keys are dropped', () => {
  const s = migrate({ schema: 2, achievements: { 'streak.99': 1, 'constructor.0': 1, '__proto__': 1, 'streak.-1': 1, 'streak.2': 'x' } }, T0, seeded(1));
  assert.deepEqual(Object.keys(s.achievements).sort(), ['streak.0', 'streak.1', 'streak.2'], 'a valid tier marks the ones below it');
});

test('prototype-named ids never resolve to catalog entries (webview input is untrusted)', () => {
  const { s, rand } = hatched();
  const ctx = { now: T0, rand };
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.doesNotThrow(() => applyAction(s, 'feed', bad, ctx), `feed ${bad}`);
    assert.equal(applyAction(s, 'buy', bad, ctx).ok, false, `buy ${bad}`);
    assert.equal(applyAction(s, 'equip', bad, ctx).ok, false, `equip ${bad}`);
    s.pet.energy = 100;
    assert.equal(applyAction(s, 'playResult', { game: bad, score: 5 }, ctx).ok, false, `play ${bad}`);
  }
});
