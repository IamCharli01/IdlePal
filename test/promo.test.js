'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PROMOS, ACCESSORIES, THEMES } = require('../src/core/catalog');
const { createSave, migrate } = require('../src/core/save');
const { simulate } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const { normalizeCode, hashCode, redeem } = require('../src/core/promo');
const shop = require('../src/core/shop');
const { snapshot } = require('../src/core/derive');

const T0 = new Date(2026, 6, 4, 9).getTime();
const VAULT_IDS = Object.keys(ACCESSORIES).filter(id => ACCESSORIES[id].vault);

function fresh() {
  const s = createSave(T0, () => 0.3);
  simulate(s, 90e3, { now: T0 + 90e3, rand: () => 0.3 });
  s.coins = 100000;
  return { s, ctx: { now: T0, rand: Math.random } };
}

/** Run fn with a test-only promo installed (never shipped), then remove it. */
function withTestPromo(unlock, fn, extra = {}) {
  const code = 'TEST-ONLY-' + Math.random().toString(36).slice(2, 10);
  PROMOS.__testPromo = { hash: hashCode(code), unlock, ...extra };
  try { return fn(code); } finally { delete PROMOS.__testPromo; }
}

// ---------- shipping state ----------

test('the Vault ships sealed: no input unlocks anything while no promos are configured', () => {
  assert.equal(Object.keys(PROMOS).length, 0, 'no promo codes ship until a drop is announced');
  const { s, ctx } = fresh();
  const guesses = ['', 'FREE', 'VAULT', 'UNLOCK', 'ADMIN', 'LAUNCH', 'IDLEPAL', 'GALACTIC', 'MAY-THE-4TH', 'JULY4',
    ...VAULT_IDS, ...Array.from({ length: 300 }, (_, i) => `CODE${i}-${(i * 7919).toString(36)}`)];
  for (const g of guesses) assert.equal(applyAction(s, 'redeem', g, ctx).ok, false, g);
  assert.ok(VAULT_IDS.every(id => !s.owned[id]), 'nothing unlocked');
  assert.equal(VAULT_IDS.length, 6);
});

test('every Vault item is a complete theme with a teaser, drop number and rarity', () => {
  const drops = new Set();
  for (const id of VAULT_IDS) {
    const a = ACCESSORIES[id];
    assert.equal(a.slot, 'theme', id);
    assert.ok(a.teaser && a.drop && a.rarity && a.desc, `${id} metadata`);
    assert.ok(!drops.has(a.drop), `${id} drop number unique`);
    drops.add(a.drop);
    const th = THEMES[id];
    assert.ok(th, `${id} has a theme`);
    for (const k of ['bg', 'ghost', 'ink', 'shine', 'star', 'glow']) assert.match(th.palette[k], /^#[0-9a-f]{6}$/i, `${id}.${k}`);
    assert.ok(['stars', 'rain', 'bubbles', 'bats', 'snow', 'petals'].includes(th.ambient), `${id} ambient`);
  }
});

test('locked items reveal only drop, rarity and teaser to the UI', () => {
  const { s } = fresh();
  const vault = snapshot(s, T0).view.shop.vault;
  assert.deepEqual(vault.map(v => v.drop), [1, 2, 3, 4, 5, 6], 'sorted by drop');
  for (const v of vault) {
    assert.equal(v.unlocked, false);
    assert.equal(v.name, null, `${v.id} name hidden`);
    assert.equal(v.desc, null, `${v.id} desc hidden`);
    assert.ok(v.teaser);
  }
});

test('no plain-text code ever ships: PROMOS entries hold only hashes', () => {
  for (const [id, p] of Object.entries(PROMOS)) {
    assert.match(p.hash, /^[0-9a-f]{64}$/, `${id} hash`);
    assert.ok(!('code' in p), `${id} must not store the code`);
    assert.ok(ACCESSORIES[p.unlock] && ACCESSORIES[p.unlock].vault, `${id} unlocks a Vault item`);
  }
  // Code fingerprints live only in the catalog: no stray hashes (or codes next to them) anywhere else that ships.
  const root = path.join(__dirname, '..');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const shipped = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'media')), ...walk(path.join(root, 'walkthrough')),
    ...['package.json', 'README.md', 'CHANGELOG.md'].map(f => path.join(root, f))]
    .filter(f => /\.(js|json|md|html|css|svg)$/.test(f) && !f.endsWith(path.join('core', 'catalog.js')));
  for (const f of shipped) assert.ok(!/\b[0-9a-f]{64}\b/.test(fs.readFileSync(f, 'utf8')), `stray hash in ${path.relative(root, f)}`);
});

// ---------- redemption plumbing (with a test-only promo) ----------

test('codes are normalised: case, spaces and dashes do not matter', () => {
  assert.equal(normalizeCode(' ab-cd 12 '), 'ABCD12');
  assert.equal(hashCode('abcd-12'), hashCode('ABCD 12'));
});

test('once a drop is configured, its code unlocks exactly that item, once', () => {
  withTestPromo('abyss', code => {
    const { s, ctx } = fresh();
    assert.equal(applyAction(s, 'redeem', 'wrong-code', ctx).ok, false);
    const r = applyAction(s, 'redeem', code.toLowerCase().replace(/-/g, ' '), ctx);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.unlock, 'abyss');
    assert.ok(s.owned.abyss);
    assert.ok(VAULT_IDS.filter(id => id !== 'abyss').every(id => !s.owned[id]), 'only that item');
    assert.equal(applyAction(s, 'redeem', code, ctx).ok, false, 'one redemption per save');
    const v = snapshot(s, T0).view.shop.vault.find(x => x.id === 'abyss');
    assert.equal(v.name, 'Abyss', 'revealed once unlocked');
  });
});

test('expired codes are refused', () => {
  withTestPromo('sakura', code => {
    const { s, ctx } = fresh();
    assert.equal(applyAction(s, 'redeem', code, ctx).ok, false);
    assert.ok(!s.owned.sakura);
  }, { expires: T0 - 1 });
});

test('Vault items cannot be bought, boxed, dealt, haggled, sold or set as a goal', () => {
  const { s, ctx } = fresh();
  for (const id of VAULT_IDS) {
    assert.equal(applyAction(s, 'buy', id, ctx).ok, false, id);
    assert.equal(applyAction(s, 'haggle', { id, offer: 1 }, ctx).ok, false, id);
    assert.equal(applyAction(s, 'setGoal', id, ctx).ok, false, id);
    assert.equal(applyAction(s, 'equip', id, ctx).ok, false, `${id} can't be equipped while locked`);
  }
  assert.ok(!shop.mysteryPool(s).some(p => VAULT_IDS.includes(p.id)));
  for (let d = 1; d <= 30; d++) { shop.ensureShop(s, new Date(2026, 6, d, 12).getTime()); assert.ok(!s.shop.deals.some(x => VAULT_IDS.includes(x))); }
  for (let i = 0; i < 40; i++) applyAction(s, 'mystery', null, ctx);
  assert.ok(VAULT_IDS.every(id => !s.owned[id]), 'never from the box');
  s.owned.manor = true;
  assert.equal(applyAction(s, 'sell', 'manor', ctx).ok, false, 'can\'t be pawned');
});

test('themes transform and restore; only one theme at a time', () => {
  const { s, ctx } = fresh();
  applyAction(s, 'buy', 'crown', ctx);
  s.owned.galactic = true; s.owned.frostbyte = true;
  assert.match(applyAction(s, 'equip', 'galactic', ctx).message, /Transformation complete/);
  assert.equal(s.equipped.theme, 'galactic');
  applyAction(s, 'equip', 'frostbyte', ctx);
  assert.equal(s.equipped.theme, 'frostbyte', 'switches theme');
  assert.equal(s.equipped.hat, 'crown', 'hat remembered underneath');
  applyAction(s, 'equip', 'frostbyte', ctx);
  assert.equal(s.equipped.theme, null);
});

test('Vault Hunter achievement tiers track unlocked Vault items', () => {
  const { checkAchievements } = require('../src/core/achievements');
  const { s } = fresh();
  checkAchievements(s, T0);
  assert.ok(!s.achievements['vaultHunter.0']);
  s.owned.galactic = true;
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'vaultHunter.0'));
});

test('forged saves cannot equip an unowned theme; unknown promo records are dropped', () => {
  const forged = migrate({ schema: 2, equipped: { theme: 'mainframe' }, promos: { anything: 1 } }, T0, Math.random);
  assert.equal(forged.equipped.theme, null);
  assert.deepEqual(forged.promos, {});
});

test('host limits code attempts', () => {
  const { Memento, reset, log } = require('./helpers/vscode-mock');
  reset();
  const { Store } = require('../src/host/store');
  const { Controller } = require('../src/host/controller');
  const c = new Controller(new Store(new Memento(), log), log);
  c.tick();
  withTestPromo('galactic', code => {
    for (let i = 0; i < 5; i++) assert.equal(c.redeemCode('WRONG' + i).ok, false);
    assert.match(c.redeemCode(code).message, /Too many attempts/, 'even the right code waits out the limit');
    c.promoAttempts = [];
    assert.equal(c.redeemCode(code).ok, true);
  });
  c.dispose();
});

test('a Vault item whose promo is no longer configured is relocked on load (and taken off the pet)', () => {
  // A code was redeemed, then its entry was deleted from PROMOS (which is why codes are retired by expiring them).
  const { s } = fresh();
  s.owned.galactic = true;
  s.equipped.theme = 'galactic';
  s.promos = { removedDrop: T0 };
  const loaded = migrate(JSON.parse(JSON.stringify(s)), T0, Math.random);
  assert.equal(loaded.owned.galactic, undefined, 'relocked');
  assert.equal(loaded.equipped.theme, null, 'transformation removed');
  assert.deepEqual(loaded.promos, {});
  assert.equal(snapshot(loaded, T0).view.shop.vault.find(v => v.id === 'galactic').unlocked, false);
});

test('a genuine redemption survives reloads while its promo is configured', () => {
  withTestPromo('mainframe', code => {
    const { s, ctx } = fresh();
    applyAction(s, 'redeem', code, ctx);
    applyAction(s, 'equip', 'mainframe', ctx);
    s.owned.sakura = true; // a claim with no redemption behind it
    const loaded = migrate(JSON.parse(JSON.stringify(s)), T0, Math.random);
    assert.equal(loaded.owned.mainframe, true, 'kept');
    assert.equal(loaded.equipped.theme, 'mainframe');
    assert.equal(loaded.owned.sakura, undefined, 'unbacked claim dropped');
  });
});

test('expired codes keep their past redemptions (so retire codes by expiring, not deleting)', () => {
  withTestPromo('abyss', code => {
    const { s, ctx } = fresh();
    applyAction(s, 'redeem', code, ctx);
    PROMOS.__testPromo.expires = T0 - 1; // the code expires later
    const loaded = migrate(JSON.parse(JSON.stringify(s)), T0 + 1, Math.random);
    assert.equal(loaded.owned.abyss, true);
    assert.equal(applyAction(fresh().s, 'redeem', code, ctx).ok, false, 'but new redemptions are refused');
  });
});
