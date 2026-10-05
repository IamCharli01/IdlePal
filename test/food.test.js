'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { FOODS, FOOD_CATS, FOOD_RULES, BUNDLES } = require('../src/core/catalog');
const { createSave, migrate } = require('../src/core/save');
const { simulate } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const { tastesOf, dailySpecial } = require('../src/core/food');
const shop = require('../src/core/shop');
const { snapshot } = require('../src/core/derive');
const { checkAchievements } = require('../src/core/achievements');

const MIN = 60e3;
const T0 = new Date(2026, 8, 21, 10).getTime();
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fresh(seed = 1) {
  const rand = seeded(seed);
  const s = createSave(T0, rand);
  simulate(s, 90e3, { now: T0 + 90e3, rand });
  for (const id of Object.keys(FOODS)) if (FOODS[id].price) s.inventory[id] = 10;
  Object.assign(s.pet, { hunger: 40, happy: 40, energy: 40, health: 60 });
  return { s, ctx: { now: T0, rand } };
}
/** Pick foods that are neither this pet's favourite nor its dislike, so taste doesn't skew a test. */
const neutral = (s, ids) => ids.filter(id => { const t = tastesOf(s.pet); return id !== t.fav && id !== t.dislike; });

test('catalog: 24 foods in four groups, every food has a sprite, line and effects', () => {
  assert.equal(Object.keys(FOODS).length, 24);
  assert.ok(Object.values(FOODS).some(f => f.rare), 'at least one expedition-only food');
  for (const [id, f] of Object.entries(FOODS)) {
    assert.ok(FOOD_CATS[f.cat], `${id} group`);
    assert.ok(f.sprite && f.line && f.desc && Object.keys(f.effects).length, `${id} fields`);
  }
  for (const c of Object.keys(FOOD_CATS)) assert.ok(Object.values(FOODS).some(f => f.cat === c), `${c} has food`);
  for (const b of Object.values(BUNDLES)) for (const f of Object.keys(b.contents)) assert.ok(FOODS[f], `bundle food ${f}`);
  assert.equal(FOODS.meal.price, 0, 'a free meal always exists');
});

test('tastes: stable per pet, favourite and dislike differ, and the free rice ball is never disliked', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const { s } = fresh(seed);
    const t = tastesOf(s.pet);
    assert.deepEqual(tastesOf(s.pet), t, 'deterministic');
    assert.notEqual(t.fav, t.dislike);
    assert.notEqual(t.dislike, 'meal');
    assert.ok(FOODS[t.fav] && FOODS[t.dislike]);
    seen.add(t.fav);
  }
  assert.ok(seen.size >= 12, `favourites vary (${seen.size} distinct)`);
});

test('tastes are hidden until tasted, then revealed; favourites delight and dislikes disappoint', () => {
  const { s, ctx } = fresh(3);
  const t = tastesOf(s.pet);
  let v = snapshot(s, T0).view.food;
  assert.equal(v.fav, null);
  assert.equal(v.dislike, null);
  s.pet.happy = 40;
  const favMsg = applyAction(s, 'feed', t.fav, ctx).message;
  assert.match(favMsg, /LOVES/);
  const happyAfterFav = s.pet.happy;
  assert.ok(happyAfterFav >= 40 + FOOD_RULES.favHappy, 'favourite bonus');
  s.pet.happy = 40;
  assert.match(applyAction(s, 'feed', t.dislike, ctx).message, /pulls a face/);
  assert.equal(s.pet.happy, 40 + FOOD_RULES.dislikeHappy, 'dislike costs happiness');
  v = snapshot(s, T0).view.food;
  assert.equal(v.fav, t.fav);
  assert.equal(v.dislike, t.dislike);
});

test('variety: the same food three times in a row loses its punch', () => {
  const { s, ctx } = fresh(5);
  const [id] = neutral(s, ['pizza', 'ramen', 'taco']);
  const gains = [];
  for (let i = 0; i < 3; i++) {
    s.pet.hunger = 10;
    applyAction(s, 'feed', id, ctx);
    gains.push(s.pet.hunger - 10);
  }
  assert.equal(gains[0], FOODS[id].effects.hunger);
  assert.equal(gains[1], FOODS[id].effects.hunger * FOOD_RULES.repeatOnce);
  assert.equal(gains[2], FOODS[id].effects.hunger * FOOD_RULES.repeatTwice);
  s.pet.hunger = 10;
  const [other] = neutral(s, ['sushi', 'bento', 'salad']).filter(x => x !== id);
  applyAction(s, 'feed', other, ctx);
  assert.equal(s.pet.hunger - 10, FOODS[other].effects.hunger, 'switching resets the novelty');
});

test('caffeine: an energy boost now, a crash 45 minutes later; three a day makes a pet jittery', () => {
  const { s, ctx } = fresh(7);
  s.pet.energy = 20;
  applyAction(s, 'feed', 'coffee', ctx);
  const boosted = s.pet.energy;
  assert.ok(boosted > 20);
  assert.ok(s.pet.caffeine && s.pet.caffeine.crashAt === T0 + FOOD_RULES.caffeineCrashMs);
  let t = T0, events = [];
  for (let i = 1; i <= 44; i++) { t = T0 + i * MIN; events.push(...simulate(s, MIN, { now: t, rand: ctx.rand })); }
  assert.ok(!events.some(e => e.type === 'caffeineCrash'), 'no crash before 45 minutes');
  const before = s.pet.energy;
  events = [];
  for (let i = 45; i <= 47; i++) { t = T0 + i * MIN; events.push(...simulate(s, MIN, { now: t, rand: ctx.rand })); }
  assert.ok(events.some(e => e.type === 'caffeineCrash'), 'crash lands');
  assert.ok(s.pet.energy < before - FOOD_RULES.crashPerLevel + 2, 'energy drops');
  assert.equal(s.pet.caffeine, null);

  s.pet.energy = 10;
  applyAction(s, 'feed', 'energyDrink', ctx);
  s.pet.energy = 10;
  assert.match(applyAction(s, 'feed', 'coffee', ctx).message, /jittery/, 'third caffeinated drink today');
});

test('green tea gives energy with no crash', () => {
  const { s, ctx } = fresh(8);
  applyAction(s, 'feed', 'tea', ctx);
  assert.equal(s.pet.caffeine, null);
});

test('chicken soup sometimes cures a cold (about 40% of the time)', () => {
  let cured = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { s } = fresh(seed);
    s.pet.sick = true; s.pet.sickSince = T0;
    applyAction(s, 'feed', 'soup', { now: T0, rand: seeded(seed * 31) });
    if (!s.pet.sick) cured++;
  }
  assert.ok(Math.abs(cured / 400 - FOODS.soup.cure) < 0.07, `cured ${cured}/400`);
});

test('balanced diet: all four groups in a day pays once, then resets tomorrow', () => {
  const { s, ctx } = fresh(9);
  const picks = { meals: 'sushi', snacks: 'apple', drinks: 'tea', treats: 'cookie' };
  const events = [];
  for (const id of Object.values(picks)) { s.pet.hunger = 30; events.push(...(applyAction(s, 'feed', id, ctx).events || [])); }
  assert.equal(events.filter(e => e.type === 'balancedDiet').length, 1);
  assert.equal(s.totals.balancedDays, 1);
  s.pet.hunger = 30;
  assert.ok(!(applyAction(s, 'feed', 'donut', ctx).events || []).length, 'once per day');
  const tomorrow = { now: T0 + 24 * 3600e3, rand: ctx.rand };
  const e2 = [];
  for (const id of Object.values(picks)) { s.pet.hunger = 30; e2.push(...(applyAction(s, 'feed', id, tomorrow).events || [])); }
  assert.equal(e2.filter(e => e.type === 'balancedDiet').length, 1, 'again tomorrow');
  assert.equal(checkAchievements(s, T0).some(e => e.id === 'balanced.0') || s.achievements['balanced.0'] !== undefined, true);
});

test('chef\'s special: one purchasable food a day at 25% off, stable within the day', () => {
  const { s } = fresh(10);
  const sp = dailySpecial(s, T0);
  assert.ok(FOODS[sp].price > 0);
  assert.equal(dailySpecial(s, T0 + 3600e3), sp);
  shop.ensureShop(s, T0);
  s.shop.deals = s.shop.deals.filter(d => d !== sp);
  const p = shop.priceFor(s, sp, T0);
  assert.equal(p.reason, 'special');
  assert.equal(p.price, Math.ceil(FOODS[sp].price * 0.75));
  const specials = new Set();
  for (let d = 1; d <= 20; d++) specials.add(dailySpecial(s, new Date(2026, 9, d, 12).getTime()));
  assert.ok(specials.size > 3, 'rotates');
});

test('free foods are always available; paid foods need stock; bad ids fall back safely', () => {
  const { s, ctx } = fresh(11);
  s.inventory = {};
  s.pet.hunger = 20;
  assert.equal(applyAction(s, 'feed', 'meal', ctx).ok, true);
  assert.equal(applyAction(s, 'feed', 'ramen', ctx).ok, false);
  for (const bad of ['constructor', '__proto__', 'toString']) assert.doesNotThrow(() => applyAction(s, 'feed', bad, ctx));
});

test('Gourmet tracks every food ever tasted, across pets', () => {
  const { s, ctx } = fresh(12);
  for (const id of Object.keys(FOODS).slice(0, 5)) { s.pet.hunger = 20; s.pet.energy = 20; applyAction(s, 'feed', id, ctx); }
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'gourmet.0'));
});

test('food state migrates and sanitises', () => {
  const { s, ctx } = fresh(13);
  applyAction(s, 'feed', 'coffee', ctx);
  applyAction(s, 'feed', 'apple', ctx);
  const round = migrate(JSON.parse(JSON.stringify(s)), T0, Math.random);
  assert.deepEqual(round.pet.tasted, s.pet.tasted);
  assert.deepEqual(round.pet.recentFoods, s.pet.recentFoods);
  assert.deepEqual(round.pet.caffeine, s.pet.caffeine);
  assert.deepEqual(round.foodLog, s.foodLog);
  const bad = migrate({ schema: 2, pet: { tasted: { pizza: true, nope: true }, recentFoods: ['pizza', 'x', 5], caffeine: { crashAt: 'soon' }, diet: { day: '2026-09-21', cats: ['meals', 'rocks'] } }, foodLog: { __proto__: true, cake: true } }, T0, Math.random);
  assert.deepEqual(bad.pet.tasted, { pizza: true });
  assert.deepEqual(bad.pet.recentFoods, ['pizza']);
  assert.equal(bad.pet.caffeine, null);
  assert.deepEqual(bad.pet.diet.cats, ['meals']);
  assert.deepEqual(bad.foodLog, { cake: true });
});
