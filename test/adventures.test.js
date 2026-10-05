'use strict';
// Tests for expeditions and artefacts, the Weekly Challenge, the journal, rubber-duck sessions,
// the room, items, the evolution branches, test-file detection and team cards.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/vscode-mock');

const { MIN, HOUR, DAY, EXPEDITIONS, ARTEFACTS, DECOR, DECOR_ZONES, GAMES, ECONOMY, ITEMS, CHALLENGE, ACCESSORIES, FOODS, TUNING } = require('../src/core/catalog');
const { createSave, migrate, weekKey } = require('../src/core/save');
const { simulate, pickSpecies } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const { recordActivity, checkAchievements } = require('../src/core/rewards');
const expedition = require('../src/core/expedition');
const challenge = require('../src/core/challenge');
const journal = require('../src/core/journal');
const shop = require('../src/core/shop');
const { snapshot } = require('../src/core/derive');
const { TeamSync, sanitizeCard } = require('../src/host/team');
const { isTestFile } = require('../src/extension');

function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const T0 = new Date(2026, 8, 21, 10, 0, 0).getTime(); // a Monday
function hatched(seed = 1) {
  const rand = seeded(seed);
  const s = createSave(T0, rand);
  simulate(s, 90 * 1000, { now: T0 + 90 * 1000, rand });
  s.pet.energy = 100;
  return { s, rand, ctx: { now: T0, rand } };
}

// ---------- expeditions ----------

test('expedition: costs energy, freezes needs, blocks care, settles with loot', () => {
  const { s, rand } = hatched();
  s.pet.hunger = 60; s.pet.happy = 60;
  assert.equal(applyAction(s, 'expedition', 'nowhere', { now: T0, rand }).ok, false);
  const r = applyAction(s, 'expedition', 'monolith', { now: T0, rand });
  assert.equal(r.ok, true, r.message);
  assert.equal(s.pet.energy, 100 - EXPEDITIONS.monolith.energy);
  assert.ok(s.expedition && s.expedition.dest === 'monolith');
  assert.equal(s.expedition.endsAt - s.expedition.startedAt, EXPEDITIONS.monolith.minutes * MIN);
  assert.equal(applyAction(s, 'feed', 'meal', { now: T0, rand }).ok, false, 'no feeding while away');
  assert.equal(applyAction(s, 'expedition', 'cloud', { now: T0, rand }).ok, false, 'one trip at a time');
  assert.equal(applyAction(s, 'buy', 'cookie', { now: T0, rand: () => 0.5 }).ok, false, 'shopping is allowed (fails only on coins)');
  assert.equal(snapshot(s, T0).view.mood, 'away');
  assert.deepEqual(snapshot(s, T0).view.alerts, []);

  // Needs do not move while away, but the pet still ages.
  const before = { hunger: s.pet.hunger, happy: s.pet.happy, age: s.pet.ageMs };
  for (let t = 5000; t <= 20 * MIN; t += 5000) simulate(s, 5000, { now: T0 + t, rand });
  assert.equal(s.pet.hunger, before.hunger);
  assert.equal(s.pet.happy, before.happy);
  assert.ok(s.pet.ageMs > before.age);

  assert.deepEqual(expedition.settle(s, T0 + 20 * MIN, rand), [], 'not back yet');
  const coins = s.coins;
  const ev = expedition.settle(s, T0 + 31 * MIN, rand);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'expeditionDone');
  assert.equal(s.expedition, null);
  assert.ok(s.coins - coins >= EXPEDITIONS.monolith.loot.coins[0] && s.coins - coins <= EXPEDITIONS.monolith.loot.coins[1]);
  assert.ok(EXPEDITIONS.monolith.loot.foods.includes(ev[0].food) && s.inventory[ev[0].food] === 1);
  assert.equal(s.totals.expeditions, 1);
  assert.equal(s.quests.counters.expedition, 1);
  assert.ok(checkAchievements(s, T0 + 31 * MIN).some(e => e.id === 'explorer.0'));
});

test('expedition: recall brings the pet home without loot; too tired or sick can\'t go', () => {
  const { s, rand } = hatched();
  applyAction(s, 'expedition', 'kernel', { now: T0, rand });
  assert.equal(applyAction(s, 'recall', null, { now: T0 + MIN, rand }).ok, true);
  assert.equal(s.expedition, null);
  assert.equal(s.totals.expeditions, 0);
  s.pet.energy = 20;
  assert.match(applyAction(s, 'expedition', 'kernel', { now: T0, rand }).message, /energy/);
  s.pet.energy = 100; s.pet.sick = true; s.pet.sickSince = T0;
  assert.match(applyAction(s, 'expedition', 'monolith', { now: T0, rand }).message, /ill/);
});

test('artefacts: every expedition eventually yields all of its artefacts, never a duplicate, and the pool is complete', () => {
  const all = new Set(Object.values(EXPEDITIONS).flatMap(x => x.loot.artefacts));
  assert.deepEqual([...all].sort(), Object.keys(ARTEFACTS).sort(), 'every artefact is reachable and every listed one exists');
  for (const f of Object.values(EXPEDITIONS).flatMap(x => x.loot.foods)) assert.ok(FOODS[f], `loot food ${f}`);
  const { s } = hatched();
  const rand = seeded(5);
  let trips = 0;
  while (Object.keys(s.artefacts).length < Object.keys(ARTEFACTS).length && trips < 2000) {
    for (const dest of Object.keys(EXPEDITIONS)) {
      s.expedition = { dest, startedAt: 0, endsAt: 1 };
      expedition.settle(s, T0 + trips, rand);
      trips++;
    }
  }
  assert.equal(Object.keys(s.artefacts).length, Object.keys(ARTEFACTS).length, `collected all after ${trips} trips`);
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'archaeologist.3'));
  const v = snapshot(s, T0).view.expedition;
  assert.ok(v.artefacts.every(a => a.found && a.name));
  assert.ok(v.destinations.every(d => d.artefactsLeft === 0));
});

test('trail mix shortens the next trip; the explorer trait shortens and enriches every trip', () => {
  const { s, rand } = hatched();
  s.items.trailMix = 1;
  applyAction(s, 'expedition', 'cloud', { now: T0, rand });
  assert.equal(s.expedition.endsAt - T0, Math.round(EXPEDITIONS.cloud.minutes * MIN * 0.75));
  assert.equal(s.items.trailMix, 0);
  const e = hatched(2);
  e.s.pet.trait = 'explorer';
  applyAction(e.s, 'expedition', 'cloud', { now: T0, rand: e.rand });
  assert.equal(e.s.expedition.endsAt - T0, Math.round(EXPEDITIONS.cloud.minutes * MIN * 0.8));
});

test('a hand-edited expedition is sanitised, and a new egg cancels any trip', () => {
  const s = migrate({ schema: 2, expedition: { dest: 'moon', startedAt: 1, endsAt: 2 } }, T0, seeded(1));
  assert.equal(s.expedition, null);
  const ok = migrate({ schema: 2, pet: { ageMs: HOUR, species: 'kitbit' }, expedition: { dest: 'cloud', startedAt: T0, endsAt: T0 + HOUR } }, T0, seeded(1));
  assert.deepEqual(ok.expedition, { dest: 'cloud', startedAt: T0, endsAt: T0 + HOUR });
  const { s: s2, rand } = hatched();
  applyAction(s2, 'expedition', 'monolith', { now: T0, rand });
  applyAction(s2, 'newEgg', true, { now: T0, rand });
  assert.equal(s2.expedition, null);
});

// ---------- weekly challenge ----------

test('weekly challenge: same game for everyone all week, double coins, best travels on the team card', () => {
  const g = challenge.gameOfWeek(T0);
  assert.ok(GAMES[g]);
  assert.equal(challenge.gameOfWeek(T0 + 6 * DAY), g, 'same all week (Mon→Sun)');
  const weeks = new Set();
  for (let w = 0; w < 20; w++) weeks.add(challenge.gameOfWeek(T0 + w * 7 * DAY));
  assert.ok(weeks.size >= 5, 'varies across weeks');

  const { s, rand } = hatched();
  const other = Object.keys(GAMES).find(id => id !== g && GAMES[id].reward.coinDiv === GAMES[g].reward.coinDiv) || Object.keys(GAMES).find(id => id !== g);
  const coinsFor = (id, score) => { const t = hatched().s; t.pet.energy = 100; applyAction(t, 'playResult', { game: id, score }, { now: T0, rand }); return t.coins; };
  const score = Math.min(GAMES[g].maxScore, GAMES[other].maxScore);
  assert.equal(coinsFor(g, score), Math.min(ECONOMY.maxGameCoinsPerDay, Math.floor(score / GAMES[g].reward.coinDiv) * CHALLENGE.multiplier));
  assert.equal(coinsFor(other, score), Math.min(ECONOMY.maxGameCoinsPerDay, Math.floor(score / GAMES[other].reward.coinDiv)));

  const r = applyAction(s, 'playResult', { game: g, score: 3 }, { now: T0, rand });
  assert.match(r.message, /Weekly Challenge/);
  assert.equal(s.challenge.best, 3);
  assert.equal(s.challenge.plays, 1);
  assert.equal(s.totals.challengeWeeks, 1);
  s.pet.energy = 100;
  applyAction(s, 'playResult', { game: g, score: 2 }, { now: T0, rand });
  assert.equal(s.challenge.best, 3, 'best is kept');
  assert.equal(s.totals.challengeWeeks, 1, 'a week counts once');
  const card = TeamSync.cardFrom(snapshot(s, T0), 'me');
  assert.deepEqual(card.challenge, { week: weekKey(T0), game: g, score: 3 });
  // Next week it resets, and a new play counts another week.
  s.pet.energy = 100;
  applyAction(s, 'playResult', { game: challenge.gameOfWeek(T0 + 7 * DAY), score: 1 }, { now: T0 + 7 * DAY, rand });
  assert.equal(s.challenge.week, weekKey(T0 + 7 * DAY));
  assert.equal(s.totals.challengeWeeks, 2);
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'challenger.0'));
});

test('team cards carry a sanitised challenge score and the tagged filename avoids collisions', async () => {
  const card = sanitizeCard({ v: 1, name: 'A', pet: {}, challenge: { week: '2026-W39', game: 'snake', score: 9999 } }, 'a.json');
  assert.deepEqual(card.challenge, { week: '2026-W39', game: 'snake', score: GAMES.snake.maxScore });
  assert.equal(sanitizeCard({ v: 1, name: 'A', pet: {}, challenge: { week: 'soon', game: 'snake', score: 1 } }, 'a.json').challenge, null);
  assert.equal(sanitizeCard({ v: 1, name: 'A', pet: { prop: 'mug', hat: 'mug' } }, 'a.json').pet.prop, 'mug');
  assert.equal(sanitizeCard({ v: 1, name: 'A', pet: { prop: 'mug', hat: 'mug' } }, 'a.json').pet.hat, null, 'a prop in the hat slot is rejected');
  assert.equal(sanitizeCard({ v: 1, name: 'A', pet: { mood: 'away' } }, 'a.json').pet.mood, 'away');

  const a = createSave(1700000000000, Math.random), b = createSave(1700000005000, Math.random);
  assert.notEqual(TeamSync.tagFor(a), TeamSync.tagFor(b));
  assert.match(TeamSync.tagFor(a), /^[0-9a-z]{4}$/);
  const files = {};
  const key = u => String(u.path || u.fsPath).replace(/\\/g, '/');
  const team = new TeamSync({ warn() {} }, {
    fs: { readFile: async u => Buffer.from(files[key(u)] || ''), writeFile: async (u, bytes) => { files[key(u)] = Buffer.from(bytes).toString('utf8'); }, createDirectory: async () => {}, delete: async u => { delete files[key(u)]; } },
    findFiles: async () => Object.keys(files).map(p => ({ path: p, fsPath: p })),
    folders: () => [{ uri: { fsPath: '/repo', path: '/repo' } }],
  });
  const c = { v: 1, name: 'alex', pet: { name: 'X' }, streak: 0, achievements: 0, generation: 1, challenge: null, updatedAt: 0 };
  await team.publish(c, 'alex', 1000, true, 'ab12');
  await team.publish({ ...c, pet: { name: 'Y' } }, 'alex', 70000, true, 'cd34');
  const names = Object.keys(files).map(p => p.split(/[\\/]/).pop()).sort();
  assert.deepEqual(names, ['alex-ab12.json', 'alex-cd34.json'], 'two people called alex both keep a card');
  const seen = await team.refresh('alex', 'ab12');
  assert.deepEqual(seen.map(m => m.pet.name), ['Y'], 'skips only my own card');
});

test('unpublish removes my card and never a teammate\'s', async () => {
  const files = { '/repo/.idlepal/ada-zz99.json': JSON.stringify({ v: 1, name: 'Ada', pet: { name: 'Bit' }, updatedAt: 1 }) };
  const key = u => String(u.path || u.fsPath).replace(/\\/g, '/');
  const team = new TeamSync({ warn() {} }, {
    fs: { readFile: async u => Buffer.from(files[key(u)] || ''), writeFile: async (u, b) => { files[key(u)] = Buffer.from(b).toString('utf8'); }, createDirectory: async () => {}, delete: async u => { if (!(key(u) in files)) throw new Error('nope'); delete files[key(u)]; } },
    findFiles: async () => Object.keys(files).map(p => ({ path: p, fsPath: p })),
    folders: () => [{ uri: { fsPath: '/repo', path: '/repo' } }],
  });
  await team.publish({ v: 1, name: 'me', pet: { name: 'Me' }, streak: 0, achievements: 0, generation: 1, challenge: null, updatedAt: 0 }, 'me', 1000, true, 'ab12');
  assert.deepEqual(Object.keys(files).sort(), ['/repo/.idlepal/ada-zz99.json', '/repo/.idlepal/me-ab12.json']);
  assert.deepEqual((await team.refresh('me', 'ab12')).map(m => m.name), ['Ada']);
  await team.unpublish('me', 'ab12');
  assert.deepEqual(Object.keys(files), ['/repo/.idlepal/ada-zz99.json']);
});

// ---------- journal ----------

test('journal: events become diary lines, yesterday gets a summary, entries are capped and sanitised', () => {
  const { s, rand } = hatched();
  assert.ok(journal.record(s, [{ type: 'hatched' }, { type: 'quest', id: 'chars' }], T0));
  assert.equal(s.journal.entries.length, 1, 'quests are not diary-worthy');
  assert.match(s.journal.entries[0].text, /I hatched/);
  assert.equal(s.journal.lastDay, '2026-09-21');
  recordActivity(s, { codingMs: 90 * MIN, commits: 2, langs: { rust: 90 * MIN } }, T0 + HOUR);
  journal.record(s, [], T0 + DAY);
  const y = s.journal.entries[s.journal.entries.length - 1];
  assert.match(y.text, /Yesterday you coded for 1h 30m and shipped 2 commits, mostly rust/);
  assert.equal(journal.record(s, [], T0 + DAY + HOUR), false, 'nothing new: nothing written');

  // A food favourite, a new best and an expedition return all read naturally.
  journal.record(s, [{ type: 'favourite', food: 'sushi' }, { type: 'newBest', game: 'snake', score: 12 }, { type: 'expeditionDone', dest: 'cloud', coins: 20, food: 'apple', artefact: 'rootKey' }], T0 + DAY + HOUR);
  const texts = s.journal.entries.map(e => e.text).join('\n');
  assert.match(texts, /favourite food: Sushi/);
  assert.match(texts, /Linked List: 12/);
  assert.match(texts, /Back from The Cloud with 20 coins and an apple\. And I found the Root Key!/);
  const groups = snapshot(s, T0 + DAY + HOUR).view.journal;
  assert.equal(groups[0].day, '2026-09-22', 'newest day first');

  for (let i = 0; i < 200; i++) journal.note(s, `line ${i}`, T0 + i);
  assert.equal(s.journal.entries.length, 80, 'capped');
  const m = migrate({ schema: 2, journal: { lastDay: 'x', entries: [{ t: 1, icon: 'nope', text: 'ok\u0000' }, { text: '' }, 'junk', { t: 'soon', text: 'y'.repeat(500) }] } }, T0, rand);
  assert.equal(m.journal.entries.length, 2);
  assert.equal(m.journal.entries[0].text, 'ok');
  assert.equal(m.journal.entries[1].text.length, 200);
  assert.equal(m.journal.lastDay, 'x');
});

// ---------- rubber duck ----------

test('rubber duck: needs enough text, pays once per cooldown, counts for quests and achievements', () => {
  const { s, rand } = hatched();
  assert.equal(applyAction(s, 'duck', { chars: 10 }, { now: T0, rand }).ok, false);
  const coins = s.coins;
  const r = applyAction(s, 'duck', { chars: ECONOMY.duckMinChars }, { now: T0, rand });
  assert.equal(r.ok, true, r.message);
  assert.equal(s.coins - coins, ECONOMY.duckCoins);
  assert.equal(s.totals.duckSessions, 1);
  assert.equal(s.quests.counters.duck, 1);
  assert.match(applyAction(s, 'duck', { chars: 999 }, { now: T0 + MIN, rand }).message, /Try again in/);
  assert.equal(applyAction(s, 'duck', { chars: 999 }, { now: T0 + ECONOMY.duckCooldownMs, rand }).ok, true);
  assert.equal(applyAction(s, 'duck', 'lots', { now: T0 + DAY, rand }).ok, false, 'malformed arg');
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'rubberDuck.0'));
  s.pet.asleep = true;
  assert.equal(applyAction(s, 'duck', { chars: 999 }, { now: T0 + 2 * DAY, rand }).ok, false, 'not while asleep');
});

// ---------- the room ----------

test('room: decorations are bought, auto-placed one per zone, toggled, previewed, sold and migrated', () => {
  const { s, rand } = hatched();
  s.coins = 5000;
  const ctx = { now: T0, rand };
  assert.equal(shop.kindOf('plant'), 'decor');
  assert.ok(shop.purchasable('plant'));
  assert.equal(applyAction(s, 'buy', 'plant', ctx).ok, true);
  assert.equal(s.room.floorL, 'plant');
  assert.equal(applyAction(s, 'buy', 'plant', ctx).ok, false, 'owned once');
  assert.equal(applyAction(s, 'buy', 'cactus', ctx).ok, true);
  assert.equal(s.room.floorL, 'cactus', 'the newest piece takes the spot');
  assert.equal(applyAction(s, 'equip', 'plant', ctx).ok, true);
  assert.equal(s.room.floorL, 'plant');
  assert.equal(applyAction(s, 'equip', 'plant', ctx).ok, true);
  assert.equal(s.room.floorL, null, 'toggles off');
  assert.equal(applyAction(s, 'equip', 'lamp', ctx).ok, false, 'not owned');
  for (const z of DECOR_ZONES) assert.ok(Object.values(DECOR).some(d => d.zone === z), `${z} has decorations`);
  applyAction(s, 'equip', 'plant', ctx);
  assert.equal(applyAction(s, 'sell', 'plant', ctx).ok, true);
  assert.equal(s.room.floorL, null, 'selling clears the spot');
  assert.equal(s.owned.plant, undefined);
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'decorator.0'));

  const m = migrate({ schema: 2, owned: { lamp: true, rug: true }, room: { floorR: 'lamp', floor: 'lamp', wallL: 'rug', floorL: 'plant' } }, T0, rand);
  assert.deepEqual(m.room, { wallL: null, wallR: null, floorL: null, floorR: 'lamp', floor: null }, 'only owned pieces in their own zone');
  const round = migrate(JSON.parse(JSON.stringify(s)), T0, rand);
  assert.deepEqual(round.room, s.room);
  assert.deepEqual(round, s, 'newer fields round-trip');
});

// ---------- items ----------

test('vitamins block sickness for a day; lucky charm quadruples shiny odds once', () => {
  const { s, rand } = hatched();
  s.items.vitamins = 1;
  const r = applyAction(s, 'useItem', { item: 'vitamins' }, { now: T0, rand });
  assert.equal(r.ok, true, r.message);
  assert.equal(s.pet.immuneUntil, T0 + DAY);
  assert.equal(applyAction(s, 'useItem', { item: 'vitamins' }, { now: T0, rand }).ok, false, 'already protected (and none left)');
  s.pet.poops = 4; s.pet.health = 10; s.pet.hunger = 0; s.pet.weight = 60;
  for (let t = 5000; t <= 6 * HOUR; t += 5000) { simulate(s, 5000, { now: T0 + t, rand }); s.pet.health = 10; s.pet.hunger = 0; if (s.pet.dead) break; }
  assert.equal(s.pet.sick, false, 'immune all day despite every risk factor');
  assert.equal(snapshot(s, T0 + HOUR).view.immuneLeftMs, 23 * HOUR);
  assert.equal(migrate({ schema: 2, pet: { immuneUntil: T0 - 1 } }, T0, rand).pet.immuneUntil, null, 'expired immunity is dropped on load');

  let plain = 0, charmed = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const a = createSave(T0, seeded(seed));
    simulate(a, 90e3, { now: T0 + 90e3, rand: seeded(seed) });
    if (a.pet.shiny) plain++;
    const b = createSave(T0, seeded(seed));
    b.items.luckyCharm = 1;
    simulate(b, 90e3, { now: T0 + 90e3, rand: seeded(seed) });
    if (b.pet.shiny) charmed++;
    assert.equal(b.items.luckyCharm, 0, 'used at hatch');
  }
  assert.ok(charmed > plain * 2, `charm helps: ${charmed} vs ${plain}`);
  assert.equal(ITEMS.luckyCharm.max, 1);
});

// ---------- species ----------

test('new adults: Phoenix for dynasties, Dataray for polyglots, Nocturne for night coders', () => {
  const base = { stageMistakes: 0, mistakes: 0, wins: 0, codingMs: 0, generation: 1, langMs: {}, nightMs: 0 };
  assert.equal(pickSpecies({ ...base, generation: 3 }, 'adult'), 'phoenix');
  assert.equal(pickSpecies({ ...base, generation: 3, mistakes: 2 }, 'adult'), 'mochimon', 'phoenix needs near-perfect care');
  const langMs = { typescript: HOUR, python: HOUR, go: 31 * MIN, css: MIN };
  assert.equal(pickSpecies({ ...base, langMs, mistakes: 5 }, 'adult'), 'dataray');
  assert.equal(pickSpecies({ ...base, langMs: { typescript: HOUR, python: HOUR }, mistakes: 5 }, 'adult'), 'blobbo', 'two languages is not a polyglot');
  assert.equal(pickSpecies({ ...base, nightMs: TUNING.nocturneNightMs, mistakes: 5 }, 'adult'), 'nocturne');
  assert.equal(pickSpecies({ ...base, wins: 20, langMs }, 'adult'), 'starlet', 'games still win ties');

  // Real activity feeds the per-pet counters, and they reset with a new egg.
  const { s, rand } = hatched();
  const night = new Date(2026, 8, 21, 23, 30).getTime();
  recordActivity(s, { codingMs: 10 * MIN, langs: { rust: 10 * MIN } }, night);
  assert.equal(s.pet.nightMs, 10 * MIN);
  assert.equal(s.pet.langMs.rust, 10 * MIN);
  recordActivity(s, { codingMs: 10 * MIN, langs: { rust: 10 * MIN } }, T0);
  assert.equal(s.pet.nightMs, 10 * MIN, 'daytime does not count');
  applyAction(s, 'newEgg', true, { now: T0, rand });
  assert.deepEqual(s.pet.langMs, {});
  assert.equal(s.pet.nightMs, 0);
});

// ---------- activity ----------

test('test files are recognised across ecosystems and count toward the Test Pilot track', () => {
  for (const p of ['/x/src/foo.test.js', 'C:\\x\\foo.spec.ts', '/x/tests/foo.py', '/x/__tests__/Foo.tsx', '/x/test_models.py', '/x/spec/thing_spec.rb', '/x/FooTest.java', '/x/foo_test.go', '/x/src/test/java/A.java']) {
    assert.ok(isTestFile(p), p);
  }
  for (const p of ['/x/src/foo.js', '/x/contest/entry.py', '/x/latest.md', '/x/attestation.go', '']) assert.ok(!isTestFile(p), `not a test: ${p}`);
  const { s } = hatched();
  recordActivity(s, { saves: 3, testSaves: 2 }, T0 + 1000);
  assert.equal(s.totals.testSaves, 2);
  assert.equal(s.quests.counters.tests, 2);
  recordActivity(s, { saves: 1, testSaves: 5 }, T0 + 2000);
  assert.equal(s.totals.testSaves, 3, 'never more test saves than saves');
});

// ---------- catalog integrity for the new content ----------

test('new wardrobe slots, props and foods are consistent', () => {
  const slots = new Set(Object.values(ACCESSORIES).map(a => a.slot));
  assert.deepEqual([...slots].sort(), ['face', 'hat', 'prop', 'theme']);
  const { s, rand } = hatched();
  s.coins = 5000;
  assert.equal(applyAction(s, 'buy', 'mug', { now: T0, rand }).ok, true);
  assert.equal(s.equipped.prop, 'mug');
  assert.equal(applyAction(s, 'buy', 'laptop', { now: T0, rand }).ok, true);
  assert.equal(s.equipped.prop, 'laptop', 'one prop at a time');
  assert.equal(migrate({ schema: 2, owned: { mug: true }, equipped: { prop: 'mug', hat: 'mug' } }, T0, rand).equipped.prop, 'mug');
  assert.equal(migrate({ schema: 2, owned: { mug: true }, equipped: { prop: 'mug', hat: 'mug' } }, T0, rand).equipped.hat, null);
  assert.equal(applyAction(s, 'buy', 'goldenRice', { now: T0, rand }).ok, false, 'expedition food is not for sale');
  assert.equal(applyAction(s, 'feed', 'goldenRice', { now: T0, rand }).ok, false, 'and not free');
  s.inventory.goldenRice = 1; s.pet.hunger = 20;
  assert.equal(applyAction(s, 'feed', 'goldenRice', { now: T0, rand }).ok, true);
  assert.equal(s.inventory.goldenRice, 0);
  assert.equal(migrate({ schema: 2, inventory: { goldenRice: 2, meal: 5 } }, T0, rand).inventory.goldenRice, 2, 'rare food survives a reload');
});
