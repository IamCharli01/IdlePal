'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { MIN, HOUR, SPECIES, ACHIEVEMENTS, ECONOMY } = require('../src/core/catalog');
const { createSave, migrate, dayKey } = require('../src/core/save');
const { simulate, pickSpecies } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const { recordActivity, checkAchievements, checkIn } = require('../src/core/rewards');
const { snapshot } = require('../src/core/derive');

function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = new Date(2026, 8, 1, 10, 0, 0).getTime();

function hatched(seed = 1) {
  const rand = seeded(seed);
  const s = createSave(T0, rand);
  simulate(s, 90 * 1000, { now: T0 + 90 * 1000, rand });
  return { s, rand };
}

/** Advance in 5s "online" ticks, like the real extension does. */
function runOnline(s, rand, ms, start, step = 5000) {
  const events = [];
  for (let t = step; t <= ms; t += step) events.push(...simulate(s, step, { now: start + t, rand }));
  return events;
}

test('egg hatches after a minute of active time', () => {
  const rand = seeded(1);
  const s = createSave(T0, rand);
  const ev = runOnline(s, rand, 65 * 1000, T0);
  assert.equal(s.pet.species, 'blip');
  assert.ok(ev.some(e => e.type === 'hatched'));
  assert.equal(s.totals.hatched, 1);
  assert.ok(s.dex.blip);
});

test('stats do not decay while the pet is an egg', () => {
  const rand = seeded(2);
  const s = createSave(T0, rand);
  simulate(s, 50 * 1000, { now: T0 + 50 * 1000, rand });
  assert.equal(s.pet.hunger, 80);
});

test('offline time never kills or sickens the pet, and keeps a health floor', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { s, rand } = hatched(seed);
    simulate(s, 5 * 24 * HOUR, { now: T0 + 5 * 24 * HOUR, rand });
    assert.equal(s.pet.dead, false);
    assert.equal(s.pet.sick, false);
    assert.ok(s.pet.health >= 25, `health ${s.pet.health}`);
  }
});

test('offline time does not age the pet', () => {
  const { s, rand } = hatched();
  const age = s.pet.ageMs;
  simulate(s, 10 * HOUR, { now: T0 + 10 * HOUR, rand });
  assert.equal(s.pet.ageMs, age);
});

test('total neglect while online eventually kills the pet and buries it', () => {
  const { s, rand } = hatched(3);
  runOnline(s, rand, 8 * HOUR, T0, 60 * 1000);
  assert.equal(s.pet.dead, true);
  assert.ok(['starvation', 'illness', 'neglect'].includes(s.pet.causeOfDeath));
  assert.equal(s.graveyard.length, 1);
  assert.ok(s.pet.mistakes > 0);
});

test('vacation mode freezes time', () => {
  const { s, rand } = hatched();
  applyAction(s, 'pause', null, { now: T0, rand });
  const before = JSON.stringify(s.pet);
  runOnline(s, rand, HOUR, T0, 60 * 1000);
  assert.equal(JSON.stringify(s.pet), before);
  const r = applyAction(s, 'feed', 'meal', { now: T0, rand });
  assert.equal(r.ok, false);
});

test('evolution branches follow care quality', () => {
  const p = { stageMistakes: 0, mistakes: 0, wins: 0, codingMs: 0 };
  assert.equal(pickSpecies(p, 'child'), 'kitbit');
  assert.equal(pickSpecies({ ...p, stageMistakes: 3 }, 'child'), 'spud');
  assert.equal(pickSpecies({ ...p, stageMistakes: 3 }, 'teen'), 'squib');
  assert.equal(pickSpecies({ ...p, wins: 20 }, 'adult'), 'starlet');
  assert.equal(pickSpecies({ ...p, codingMs: 5 * HOUR, mistakes: 5 }, 'adult'), 'octocoder');
  assert.equal(pickSpecies(p, 'adult'), 'mochimon');
  assert.equal(pickSpecies({ ...p, mistakes: 6 }, 'adult'), 'blobbo');
  assert.equal(pickSpecies({ ...p, mistakes: 12 }, 'adult'), 'gremlin');
  for (const st of ['baby', 'child', 'teen', 'adult']) {
    assert.equal(SPECIES[pickSpecies(p, st)].stage, st);
  }
});

test('feeding: full pets refuse, paid food needs inventory', () => {
  const { s, rand } = hatched();
  const ctx = { now: T0, rand };
  s.pet.hunger = 50;
  assert.equal(applyAction(s, 'feed', 'meal', ctx).ok, true);
  assert.equal(s.pet.hunger, 80);
  s.pet.hunger = 99;
  assert.equal(applyAction(s, 'feed', 'meal', ctx).ok, false);
  assert.equal(applyAction(s, 'feed', 'sushi', ctx).ok, false);
  s.coins = 100;
  assert.equal(applyAction(s, 'buy', 'coffee', ctx).ok, true);
  assert.equal(s.inventory.coffee, 1);
  s.pet.energy = 20;
  assert.equal(applyAction(s, 'feed', 'coffee', ctx).ok, true);
  assert.equal(s.inventory.coffee, 0);
  assert.equal(s.pet.energy, 55);
});

test('shop: cannot overspend or double-buy, buying auto-equips, equip toggles', () => {
  const { s, rand } = hatched();
  const ctx = { now: T0, rand };
  s.coins = 50;
  assert.equal(applyAction(s, 'buy', 'crown', ctx).ok, false);
  assert.equal(s.coins, 50);
  s.coins = 500;
  assert.equal(applyAction(s, 'buy', 'crown', ctx).ok, true);
  assert.equal(s.equipped.hat, 'crown');
  assert.equal(applyAction(s, 'buy', 'crown', ctx).ok, false);
  assert.equal(applyAction(s, 'equip', 'crown', ctx).ok, true);
  assert.equal(s.equipped.hat, null);
  assert.equal(applyAction(s, 'equip', 'shades', ctx).ok, false);
  assert.equal(applyAction(s, 'buy', 'meal', ctx).ok, false, 'free items are not for sale');
  assert.equal(applyAction(s, 'buy', '__proto__', ctx).ok, false);
});

test('game results are validated and capped', () => {
  const { s, rand } = hatched();
  const ctx = { now: T0, rand };
  const r = applyAction(s, 'playResult', { game: 'leftright', score: 9999 }, ctx);
  assert.equal(r.ok, true);
  assert.equal(s.coins, 5);
  assert.equal(s.totals.perfectGames, 1);
  assert.equal(applyAction(s, 'playResult', { game: 'nope', score: 1 }, ctx).ok, false);
  s.coins = 0;
  for (let i = 0; i < 30; i++) { s.pet.energy = 100; applyAction(s, 'playResult', { game: 'bugs', score: 40 }, ctx); }
  assert.ok(s.coins <= ECONOMY.maxGameCoinsPerDay, `coins ${s.coins}`);
});

test('rename validates input', () => {
  const { s, rand } = hatched();
  const ctx = { now: T0, rand };
  assert.equal(applyAction(s, 'rename', '', ctx).ok, false);
  assert.equal(applyAction(s, 'rename', 'x'.repeat(21), ctx).ok, false);
  assert.equal(applyAction(s, 'rename', '  Waffles ', ctx).ok, true);
  assert.equal(s.pet.name, 'Waffles');
});

test('starting over keeps coins and cosmetics, bumps generation, records the old pet', () => {
  const { s, rand } = hatched();
  const ctx = { now: T0, rand };
  s.coins = 123;
  s.owned.bow = true;
  assert.equal(applyAction(s, 'newEgg', null, ctx).ok, false, 'requires confirmation while alive');
  assert.equal(applyAction(s, 'newEgg', true, ctx).ok, true);
  assert.equal(s.pet.generation, 2);
  assert.equal(s.pet.species, 'egg');
  assert.equal(s.coins, 123);
  assert.equal(s.owned.bow, true);
  assert.equal(s.graveyard[0].causeOfDeath, 'rehomed');
});

test('typing earns coins with a daily cap, and commits pay out', () => {
  const { s } = hatched();
  recordActivity(s, { chars: 400 * 500 }, T0 + 1000);
  assert.ok(s.econ.activityCoins <= ECONOMY.maxActivityCoinsPerDay);
  const before = s.coins;
  const ev = recordActivity(s, { commits: 1 }, T0 + 2000);
  assert.ok(ev.some(e => e.type === 'commit'));
  assert.equal(s.coins, before + ECONOMY.commitCoins);
  assert.equal(s.totals.commits, 1);
});

test('streaks count consecutive days and reset after a gap', () => {
  const { s } = hatched();
  const day = d => new Date(2026, 8, d, 12).getTime();
  const streakOf = ev => ev.find(e => e.type === 'checkIn').streak;
  assert.equal(streakOf(checkIn(s, day(1))), 1);
  assert.deepEqual(checkIn(s, day(1)), [], 'only once per day');
  assert.equal(streakOf(checkIn(s, day(2))), 2);
  assert.equal(streakOf(checkIn(s, day(3))), 3);
  assert.equal(streakOf(checkIn(s, day(5))), 1, 'no shield: the streak resets');
  assert.equal(s.streak.best, 3);
  assert.equal(dayKey(day(5)), '2026-09-05');
});

test('achievements unlock once and pay rewards', () => {
  const { s } = hatched();
  const first = checkAchievements(s, T0).map(e => e.id);
  assert.ok(first.includes('hatch.0'));
  assert.equal(s.coins, ACHIEVEMENTS.hatch.rewards[0]);
  assert.deepEqual(checkAchievements(s, T0), []);
});

test('an older save without the newer fields loads with sensible defaults and keeps the pet', () => {
  const old = {
    schema: 2, createdAt: T0 - 30 * 24 * HOUR, lastUpdate: T0 - 10 * MIN, coins: 321,
    pet: { name: 'Mochi', generation: 2, bornAt: T0 - HOUR, ageMs: 2 * HOUR, species: 'kitbit', hunger: 55, happy: 66, energy: 77, health: 88, wins: 3 },
    totals: { hatched: 2 }, achievements: { 'hatch.0': T0 - HOUR },
  };
  const s = migrate(old, T0, seeded(1));
  assert.equal(s.pet.name, 'Mochi');
  assert.equal(s.pet.species, 'kitbit');
  assert.equal(s.pet.hunger, 55);
  assert.equal(s.pet.wins, 3);
  assert.equal(s.coins, 321);
  assert.equal(s.lastUpdate, T0 - 10 * MIN);
  assert.equal(s.totals.hatched, 2);
  assert.equal(s.totals.expeditions, 0, 'new totals start at zero');
  assert.deepEqual(s.pet.langMs, {});
  assert.equal(s.expedition, null);
  assert.deepEqual(s.journal, { lastDay: null, entries: [] });
  assert.ok(Object.values(s.room).every(v => v === null));
  assert.equal(s.equipped.prop, null);
});

test('migrate survives garbage and hostile input', () => {
  for (const junk of [null, 42, 'x', [], { schema: 2, pet: { hunger: 'lots', ageMs: -5, species: 'dragon' }, coins: NaN, owned: { hacker: true }, equipped: { hat: 'crown' }, graveyard: 'no' }]) {
    const s = migrate(junk, T0, seeded(1));
    assert.equal(s.schema, 2);
    assert.ok(Number.isFinite(s.pet.hunger));
    assert.equal(s.pet.species, 'egg');
    assert.equal(s.coins, 0);
    assert.equal(s.owned.hacker, undefined);
    assert.equal(s.equipped.hat, null, 'cannot equip unowned items');
    assert.ok(Array.isArray(s.graveyard));
  }
});

test('a v2 save round-trips through migrate unchanged', () => {
  const { s, rand } = hatched();
  recordActivity(s, { chars: 1000, codingMs: MIN, saves: 1 }, T0 + 5000);
  s.coins = 999;
  applyAction(s, 'buy', 'crown', { now: T0, rand });
  checkAchievements(s, T0);
  const again = migrate(JSON.parse(JSON.stringify(s)), T0, seeded(9));
  assert.deepEqual(again, s);
});

test('snapshot exposes a 7-day history and a mood', () => {
  const { s } = hatched();
  recordActivity(s, { codingMs: 30 * MIN }, T0 + 1000);
  const snap = snapshot(s, T0 + 1000, { errors: 12 });
  assert.equal(snap.view.week.length, 7);
  assert.equal(snap.view.today.codingMs, 30 * MIN);
  assert.equal(snap.view.mood, 'worried');
});
