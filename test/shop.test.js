'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { ACCESSORIES, SCREENS, SHOP, BUNDLES, FOODS, DECOR } = require('../src/core/catalog');
const { createSave, migrate } = require('../src/core/save');
const { simulate } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const { recordActivity, completeFocus } = require('../src/core/rewards');
const shop = require('../src/core/shop');
const { snapshot } = require('../src/core/derive');

function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const T0 = new Date(2026, 8, 21, 10).getTime();
const day = d => new Date(2026, 8, d, 12).getTime();
function fresh(coins = 5000) {
  const rand = seeded(1);
  const s = createSave(T0, rand);
  simulate(s, 90e3, { now: T0 + 90e3, rand });
  s.coins = coins;
  return { s, rand, ctx: { now: T0, rand } };
}

test('daily deals: 3 distinct, stable within a day, excluding owned cosmetics and exclusives', () => {
  const { s } = fresh();
  shop.ensureShop(s, T0);
  const deals = s.shop.deals.slice();
  assert.equal(deals.length, SHOP.dealCount);
  assert.equal(new Set(deals).size, deals.length);
  for (const id of deals) {
    assert.ok(shop.purchasable(id), `${id} purchasable`);
    assert.ok(!shop.itemOf(id).exclusive, `${id} not exclusive`);
  }
  shop.ensureShop(s, T0 + 3600e3);
  assert.deepEqual(s.shop.deals, deals, 'same deals later that day');
  const other = fresh().s;
  shop.ensureShop(other, T0);
  assert.deepEqual(other.shop.deals, deals, 'another window computes the same deals');
  for (const id of [...Object.keys(ACCESSORIES), ...Object.keys(SCREENS), ...Object.keys(DECOR)]) s.owned[id] = true;
  shop.ensureShop(s, day(22));
  assert.ok(s.shop.deals.every(id => !shop.isCosmetic(id)), 'owned cosmetics never on sale');
});

test('pricing: the best of deal and Ship-It discount applies; a deal is single-use', () => {
  const { s, ctx } = fresh();
  shop.ensureShop(s, T0);
  const id = s.shop.deals.find(x => shop.kindOf(x) === 'food' || shop.kindOf(x) === 'item') || s.shop.deals[0];
  const base = shop.itemOf(id).price;
  assert.equal(shop.priceFor(s, id, T0).price, Math.ceil(base * 0.7));
  assert.equal(shop.priceFor(s, id, T0).reason, 'deal');

  const notDeal = ['apple', 'cake', 'coffee', 'sushi'].find(x => !s.shop.deals.includes(x));
  assert.equal(shop.priceFor(s, notDeal, T0).price, FOODS[notDeal].price);
  recordActivity(s, { commits: 3 }, T0 + 1000);
  assert.equal(shop.priceFor(s, notDeal, T0).reason, 'commit');
  assert.equal(shop.priceFor(s, notDeal, T0).pct, 0.06);
  recordActivity(s, { commits: 50 }, T0 + 2000);
  const plain = Object.keys(ACCESSORIES).find(x => !s.shop.deals.includes(x) && shop.purchasable(x));
  assert.equal(shop.priceFor(s, plain, T0).pct, SHOP.commitDiscountMax, 'capped at 20%');
  assert.equal(shop.priceFor(s, plain, T0).price, Math.ceil(ACCESSORIES[plain].price * 0.8));
  const onSale = s.shop.deals.find(x => !s.shop.used[x]);
  assert.equal(shop.priceFor(s, onSale, T0).pct, SHOP.dealDiscount, 'a 30% deal still beats the 20% cap');

  const before = s.coins;
  assert.equal(applyAction(s, 'buy', id, ctx).ok, true);
  assert.ok(s.shop.used[id]);
  assert.equal(before - s.coins, Math.ceil(base * (1 - Math.max(0.3, 0.2))));
  if (!shop.isCosmetic(id)) assert.notEqual(shop.priceFor(s, id, T0).reason, 'deal', 'deal used up');
});

test('exclusives cannot be bought or put on sale, only unboxed', () => {
  const { s, ctx } = fresh();
  for (const id of ['halo', 'mask', 'aurora']) {
    assert.equal(applyAction(s, 'buy', id, ctx).ok, false, id);
    assert.equal(shop.priceFor(s, id, T0), null);
    assert.equal(applyAction(s, 'setGoal', id, ctx).ok, false);
    assert.equal(applyAction(s, 'haggle', { id, offer: 10 }, ctx).ok, false);
  }
});

test('mystery box: pays once, never duplicates, can yield exclusives, sells out cleanly', () => {
  const { s, ctx } = fresh(100000);
  const vault = Object.values(ACCESSORIES).filter(a => a.vault).length;
  const total = Object.keys(ACCESSORIES).length + Object.keys(SCREENS).length - 1 - vault; // minus Classic and Vault items
  const exclusiveCount = [...Object.values(ACCESSORIES), ...Object.values(SCREENS)].filter(a => a.exclusive).length;
  const seen = new Set();
  let exclusives = 0;
  for (let i = 0; i < total; i++) {
    const coins = s.coins;
    const r = applyAction(s, 'mystery', null, ctx);
    assert.equal(r.ok, true);
    assert.equal(coins - s.coins, SHOP.mysteryPrice);
    assert.ok(!seen.has(r.reveal.id), `duplicate ${r.reveal.id}`);
    seen.add(r.reveal.id);
    if (r.reveal.exclusive) exclusives++;
  }
  assert.equal(exclusives, exclusiveCount, 'every exclusive comes out eventually');
  const coins = s.coins;
  assert.equal(applyAction(s, 'mystery', null, ctx).ok, false, 'sold out');
  assert.equal(s.coins, coins, 'no charge when sold out');
  assert.equal(s.totals.mysteryBoxes, total);
});

test('mystery odds: exclusives are rarer than regular cosmetics', () => {
  let excl = 0, n = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const { s } = fresh();
    const r = applyAction(s, 'mystery', null, { now: T0, rand: seeded(seed * 7) });
    n++;
    if (r.reveal.exclusive) excl++;
  }
  const expected = snapshot(fresh().s, T0).view.shop.mystery.exclusiveOdds;
  assert.ok(Math.abs(excl / n - expected) < 0.05, `observed ${excl / n} vs advertised ${expected}`);
});

test('haggling: fair offers win, lowballs lock the item for the day, bounds are enforced', () => {
  const { s, ctx } = fresh();
  const floor = shop.haggleFloor(s, 'wizard', T0);
  assert.ok(floor >= Math.ceil(250 * 0.65) && floor <= Math.ceil(250 * 0.9), `floor ${floor}`);
  assert.equal(shop.haggleFloor(s, 'wizard', T0), floor, 'deterministic');
  assert.equal(applyAction(s, 'haggle', { id: 'wizard', offer: 10 }, ctx).ok, false, 'below 50% is rejected outright');
  assert.equal(applyAction(s, 'haggle', { id: 'wizard', offer: 9999 }, ctx).ok, false, 'above list price rejected');
  assert.equal(applyAction(s, 'haggle', { id: 'wizard', offer: 'lots' }, ctx).ok, false);
  const r = applyAction(s, 'haggle', { id: 'wizard', offer: floor - 1 }, ctx);
  assert.match(r.message, /insulted/);
  assert.equal(s.owned.wizard, undefined);
  assert.equal(applyAction(s, 'haggle', { id: 'wizard', offer: 250 }, ctx).ok, false, 'locked after an insult');

  const f2 = shop.haggleFloor(s, 'crown', T0);
  const coins = s.coins;
  assert.equal(applyAction(s, 'haggle', { id: 'crown', offer: f2 }, ctx).ok, true);
  assert.equal(s.owned.crown, true);
  assert.equal(s.equipped.hat, 'crown');
  assert.equal(coins - s.coins, f2);
  assert.equal(s.totals.haggles, 1);
  assert.equal(applyAction(s, 'haggle', { id: 'focusBoost', offer: 29 }, ctx).ok !== undefined, true);
  assert.equal(applyAction(s, 'haggle', { id: 'coffee', offer: 10 }, ctx).ok, false, 'no haggling over food');

  // Tomorrow the lock lifts.
  const tmr = { now: day(22), rand: ctx.rand };
  shop.ensureShop(s, day(22));
  assert.notEqual(applyAction(s, 'haggle', { id: 'wizard', offer: 250 }, tmr).message, 'Mx. Stash won\'t haggle on that again today.');
});

test('bundles: stock the pantry at a discount', () => {
  const { s, ctx } = fresh();
  for (const [id, b] of Object.entries(BUNDLES)) {
    const value = Object.entries(b.contents).reduce((a, [f, n]) => a + FOODS[f].price * n, 0);
    assert.ok(b.price < value, `${id} is a discount`);
  }
  const coins = s.coins;
  assert.equal(applyAction(s, 'buyBundle', 'snackPack', ctx).ok, true);
  assert.deepEqual(s.inventory, { coffee: 2, apple: 2, cake: 1 });
  assert.equal(coins - s.coins, BUNDLES.snackPack.price);
  assert.equal(applyAction(s, 'buyBundle', 'constructor', ctx).ok, false);
});

test('sell-back: pays 40%, unequips and clears the goal', () => {
  const { s, ctx } = fresh();
  applyAction(s, 'buy', 'crown', ctx);
  applyAction(s, 'buy', 'matrix', ctx);
  const coins = s.coins;
  assert.equal(applyAction(s, 'sell', 'crown', ctx).ok, true);
  assert.equal(s.coins - coins, 160);
  assert.equal(s.owned.crown, undefined);
  assert.equal(s.equipped.hat, null);
  applyAction(s, 'sell', 'matrix', ctx);
  assert.equal(s.equipped.screen, 'classic');
  assert.equal(applyAction(s, 'sell', 'classic', ctx).ok, false, 'the free screen is not sellable');
  assert.equal(applyAction(s, 'sell', 'crown', ctx).ok, false, 'already sold');
});

test('savings goal: validated, toggles, clears on purchase', () => {
  const { s, ctx } = fresh(10);
  assert.equal(applyAction(s, 'setGoal', 'wizard', ctx).ok, true);
  assert.equal(snapshot(s, T0).view.shop.goal.name, 'Wizard Hat');
  assert.equal(applyAction(s, 'setGoal', 'wizard', ctx).ok, true);
  assert.equal(s.shop.goal, null, 'toggles off');
  applyAction(s, 'setGoal', 'wizard', ctx);
  s.coins = 1000;
  applyAction(s, 'buy', 'wizard', ctx);
  assert.equal(s.shop.goal, null, 'cleared once bought');
  assert.equal(applyAction(s, 'setGoal', 'wizard', ctx).ok, false, 'can\'t save for something you own');
});

test('Quest Reroll swaps one open quest; Focus Booster doubles one session', () => {
  const { s, ctx } = fresh();
  applyAction(s, 'buy', 'questReroll', ctx);
  require('../src/core/quests').ensureQuests(s, T0);
  const before = s.quests.list.map(q => q.id);
  const r = applyAction(s, 'useItem', { item: 'questReroll', index: 1 }, ctx);
  assert.equal(r.ok, true, r.message);
  assert.notEqual(s.quests.list[1].id, before[1]);
  assert.ok(!before.includes(s.quests.list[1].id), 'new quest is not already in the list');
  assert.equal(new Set(s.quests.list.map(q => q.id)).size, 3);
  assert.equal(s.items.questReroll, 0);
  assert.equal(applyAction(s, 'useItem', { item: 'questReroll', index: 0 }, ctx).ok, false, 'none left');

  applyAction(s, 'buy', 'focusBoost', ctx);
  assert.equal(completeFocus(s, 25, T0).coins, 10);
  assert.equal(completeFocus(s, 25, T0).coins, 5, 'boost is single-use');
});

test('shop state migrates and sanitises', () => {
  const { s, ctx } = fresh();
  applyAction(s, 'setGoal', 'wizard', ctx);
  applyAction(s, 'haggle', { id: 'crown', offer: 200 }, ctx);
  shop.ensureShop(s, T0);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s)), T0, seeded(2)).shop, s.shop);
  const bad = migrate({ schema: 2, shop: { deals: ['crown', 'nope', 'constructor'], used: { crown: 'yes', apple: true }, haggles: { crown: 'maybe', wizard: 'won' }, goal: '__proto__' } }, T0, seeded(1));
  assert.deepEqual(bad.shop.deals, ['crown']);
  assert.deepEqual(bad.shop.used, { apple: true });
  assert.deepEqual(bad.shop.haggles, { wizard: 'won' });
  assert.equal(bad.shop.goal, null);
});
