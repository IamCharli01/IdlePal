'use strict';
// Tests for quests, traits and shinies, Streak Shield, focus, milestones, languages, recap and team cards.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/vscode-mock');

const { MIN, HOUR, DAY, TRAITS, QUESTS, QUEST_BONUS, ITEMS } = require('../src/core/catalog');
const { createSave, migrate, weekKey } = require('../src/core/save');
const { simulate } = require('../src/core/sim');
const { applyAction } = require('../src/core/actions');
const { recordActivity, checkIn, completeFocus, checkMilestones, checkAchievements } = require('../src/core/rewards');
const { ensureQuests, bump, updateQuests, questView } = require('../src/core/quests');
const { snapshot } = require('../src/core/derive');
const { FocusSession } = require('../src/host/focus');
const { TeamSync, sanitizeCard, slugify } = require('../src/host/team');

function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const T0 = new Date(2026, 8, 21, 10, 0, 0).getTime(); // a Monday
const day = d => new Date(2026, 8, d, 12).getTime();

function hatched(seed = 1) {
  const rand = seeded(seed);
  const s = createSave(T0, rand);
  simulate(s, 90 * 1000, { now: T0 + 90 * 1000, rand });
  return { s, rand };
}

// ---------- quests ----------

test('quests: three distinct quests per day, stable across calls, new set tomorrow', () => {
  const { s } = hatched();
  ensureQuests(s, T0);
  const first = s.quests.list.map(q => `${q.id}:${q.target}`);
  assert.equal(first.length, 3);
  assert.equal(new Set(s.quests.list.map(q => q.id)).size, 3);
  for (const q of s.quests.list) assert.ok(QUESTS[q.id].targets.includes(q.target));
  assert.equal(ensureQuests(s, T0 + HOUR), false);
  assert.deepEqual(s.quests.list.map(q => `${q.id}:${q.target}`), first);

  // Another window computing from the same save gets the same quests.
  const copy = JSON.parse(JSON.stringify(s));
  copy.quests = { day: null, list: [], counters: {}, bonusClaimed: false };
  ensureQuests(copy, T0);
  assert.deepEqual(copy.quests.list.map(q => `${q.id}:${q.target}`), first);

  // Different days give different quest sets somewhere in a week.
  const sets = new Set();
  for (let d = 21; d < 28; d++) { ensureQuests(s, day(d)); sets.add(s.quests.list.map(q => q.id).sort().join()); }
  assert.ok(sets.size > 1);
});

test('quests: completing each pays once, all three pay the bonus once', () => {
  const { s } = hatched();
  ensureQuests(s, T0);
  const coins0 = s.coins;
  for (const q of s.quests.list) bump(s, QUESTS[q.id].counter, q.target, T0);
  const ev = updateQuests(s, T0);
  const expected = s.quests.list.reduce((sum, q) => sum + QUESTS[q.id].reward, 0) + QUEST_BONUS;
  assert.equal(ev.filter(e => e.type === 'quest').length, 3);
  assert.ok(ev.some(e => e.type === 'questsAllDone'));
  assert.equal(s.coins - coins0, expected);
  assert.deepEqual(updateQuests(s, T0), [], 'no double pay');
  assert.ok(questView(s).every(q => q.done && q.progress === q.target));
  assert.ok(checkAchievements(s, T0).some(e => e.id === 'questMaster.0'));
});

test('quests: real activity advances counters (typing, minutes, languages, feeding)', () => {
  const { s, rand } = hatched();
  recordActivity(s, { chars: 700, codingMs: 5 * MIN, langs: { typescript: 3 * MIN, python: 2 * MIN } }, T0 + 1000);
  applyAction(s, 'feed', 'snack', { now: T0 + 1000, rand });
  const c = s.quests.counters;
  assert.equal(c.chars, 700);
  assert.equal(Math.round(c.minutes), 5);
  assert.equal(c.languages, 2);
  assert.equal(c.feeds, 1);
});

// ---------- traits and shinies ----------

test('hatching rolls a trait and sometimes a shiny', () => {
  let shinies = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { s } = hatched(seed);
    assert.ok(TRAITS[s.pet.trait], 'has a trait');
    if (s.pet.shiny) { shinies++; assert.ok(s.shinies.blip); assert.equal(s.totals.shinies, 1); }
  }
  // 1/16 over 400 hatches ≈ 25; allow a wide band.
  assert.ok(shinies > 8 && shinies < 50, `shinies ${shinies}`);
});

test('traits change the simulation: neat pets make less mess, zen pets bore slower', () => {
  const run = trait => {
    let poops = 0, happy = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { s, rand } = hatched(seed);
      s.pet.trait = trait;
      for (let t = 60e3; t <= HOUR; t += 60e3) { simulate(s, 60e3, { now: T0 + t, rand }); poops += s.pet.poops; s.pet.poops = 0; s.pet.hunger = 80; }
      happy += s.pet.happy;
    }
    return { poops, happy };
  };
  const neat = run('neat'), zen = run('zen'), base = run('gamer');
  assert.ok(neat.poops < base.poops, `neat ${neat.poops} vs ${base.poops}`);
  assert.ok(zen.happy > base.happy, `zen ${zen.happy} vs ${base.happy}`);
});

test('sprinter pets grow up faster; foodie meals add happiness; gamer games add more joy', () => {
  const a = hatched(3).s, b = hatched(3).s;
  a.pet.trait = 'sprinter'; b.pet.trait = 'zen';
  for (let t = 5000; t <= 10 * MIN; t += 5000) {
    simulate(a, 5000, { now: T0 + t, rand: seeded(9) });
    simulate(b, 5000, { now: T0 + t, rand: seeded(9) });
  }
  assert.ok(a.pet.ageMs > b.pet.ageMs);

  const f = hatched(4); f.s.pet.trait = 'foodie'; f.s.pet.hunger = 40; f.s.pet.happy = 50;
  applyAction(f.s, 'feed', 'meal', { now: T0, rand: f.rand });
  assert.equal(f.s.pet.happy, 58);

  const g = hatched(5); g.s.pet.trait = 'gamer'; g.s.pet.happy = 10;
  applyAction(g.s, 'playResult', { game: 'leftright', score: 1 }, { now: T0, rand: g.rand });
  assert.equal(g.s.pet.happy, 10 + (3 + 6) * 2);
});

// ---------- Streak Shield ----------

test('a Streak Shield bridges exactly one missed day, then runs out', () => {
  const { s, rand } = hatched();
  s.coins = 1000;
  assert.equal(applyAction(s, 'buy', 'streakShield', { now: T0, rand }).ok, true);
  checkIn(s, day(1)); checkIn(s, day(2));
  assert.equal(s.streak.current, 2);
  const ev = checkIn(s, day(4)); // missed the 3rd
  assert.ok(ev.some(e => e.type === 'shieldUsed'));
  assert.equal(s.streak.current, 3);
  assert.equal(s.items.streakShield, 0);
  checkIn(s, day(6)); // missed the 5th, no shield left
  assert.equal(s.streak.current, 1);
  s.items.streakShield = 1;
  checkIn(s, day(10)); // missed three days: shield can't help
  assert.equal(s.streak.current, 1);
  assert.equal(s.items.streakShield, 1, 'not wasted on a gap it cannot bridge');
});

test('shield purchases are capped', () => {
  const { s, rand } = hatched();
  s.coins = 10000;
  for (let i = 0; i < ITEMS.streakShield.max; i++) assert.equal(applyAction(s, 'buy', 'streakShield', { now: T0, rand }).ok, true);
  assert.equal(applyAction(s, 'buy', 'streakShield', { now: T0, rand }).ok, false);
});

// ---------- focus ----------

test('focus: a work block pays out and counts toward quests', () => {
  const { s } = hatched();
  const coins0 = s.coins;
  const e = completeFocus(s, 25, T0);
  assert.equal(e.coins, 5);
  assert.equal(s.coins, coins0 + 5);
  assert.equal(s.totals.focusSessions, 1);
  assert.equal(s.quests.counters.focus, 1);
  assert.equal(completeFocus(s, 99999, T0).minutes, 180, 'clamped');
});

test('focus session timer: work → break → done, and survives sleep without phantom rounds', () => {
  const events = [];
  const f = new FocusSession({ onEvent: e => events.push(e.type), statusBar: false });
  f.arm = () => {}; // no real timers in tests
  f.start(25 * MIN, 5 * MIN, T0);
  f.tick(T0 + 10 * MIN);
  assert.equal(f.state.phase, 'work');
  f.tick(T0 + 25 * MIN);
  assert.equal(f.state.phase, 'break');
  f.tick(T0 + 31 * MIN);
  assert.equal(f.state, null);
  assert.deepEqual(events, ['focusStarted', 'workDone', 'breakDone']);

  events.length = 0;
  f.start(25 * MIN, 5 * MIN, T0);
  f.tick(T0 + 5 * HOUR); // laptop was asleep
  assert.equal(f.state, null);
  assert.deepEqual(events, ['focusStarted', 'workDone', 'focusStopped']);
  f.dispose();
});

// ---------- milestones ----------

test('milestones: celebrate once each, with a cake and coins', () => {
  const { s } = hatched();
  assert.deepEqual(checkMilestones(s, T0 + 3 * DAY), []);
  const ev = checkMilestones(s, T0 + 8 * DAY);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].days, 7);
  assert.equal(s.inventory.cake, 1);
  assert.deepEqual(checkMilestones(s, T0 + 9 * DAY), []);
  assert.equal(checkMilestones(s, T0 + 40 * DAY).length, 1, '30 days');
});

// ---------- languages, recap, snapshot ----------

test('languages are tracked per day and all-time, and junk ids are rejected', () => {
  const { s } = hatched();
  recordActivity(s, { codingMs: 10 * MIN, langs: { javascript: 6 * MIN, css: 4 * MIN, '<script>': 5 * MIN } }, T0 + 1000);
  const v = snapshot(s, T0 + 1000).view;
  assert.deepEqual(v.languagesToday.map(l => l.id), ['javascript', 'css']);
  assert.equal(Math.round(v.languagesToday[0].share * 100), 60);
  assert.equal(s.langs['<script>'], undefined);
});

test('weekly recap summarises the previous 7 days', () => {
  const { s } = hatched();
  for (let d = 14; d <= 20; d++) recordActivity(s, { codingMs: 30 * MIN, chars: 100, commits: 1, langs: { go: 30 * MIN } }, day(d));
  const r = snapshot(s, T0).view.recap;
  assert.equal(r.activeDays, 7);
  assert.equal(r.codingMs, 7 * 30 * MIN);
  assert.equal(r.commits, 7);
  assert.equal(r.topLanguages[0].id, 'go');
  assert.equal(weekKey(T0), '2026-W39');
  assert.equal(weekKey(day(27)), '2026-W39', 'Sunday belongs to the same ISO week');
  assert.equal(weekKey(day(28)), '2026-W40');
});

test('snapshot mood is "focused" during a work block', () => {
  const { s } = hatched();
  assert.equal(snapshot(s, T0, { focus: { phase: 'work', endsAt: T0 + MIN, total: 25 * MIN } }).view.mood, 'focused');
});

test('quest, trait, item and language fields migrate and sanitise', () => {
  const { s } = hatched();
  s.items.streakShield = 2;
  recordActivity(s, { codingMs: 2 * MIN, langs: { rust: 2 * MIN } }, T0 + 1000);
  const round = migrate(JSON.parse(JSON.stringify(s)), T0, seeded(2));
  assert.deepEqual(round, s);

  const hostile = migrate({ schema: 2, pet: { trait: 'godmode', shiny: 'yes', milestones: { '7': true, x: true } }, items: { streakShield: 99, bogus: 1 }, quests: { list: [{ id: 'nope' }, { id: 'chars', target: -5 }], counters: { chars: 'lots' } }, langs: { 'a b': 5 } }, T0, seeded(1));
  assert.equal(hostile.pet.trait, null);
  assert.equal(hostile.pet.shiny, false);
  assert.deepEqual(hostile.pet.milestones, { 7: true });
  assert.equal(hostile.items.streakShield, ITEMS.streakShield.max);
  assert.equal(hostile.items.bogus, undefined);
  assert.deepEqual(hostile.quests.list, [{ id: 'chars', target: 1, done: false }]);
  assert.deepEqual(hostile.quests.counters, {});
  assert.deepEqual(hostile.langs, {});
});

// ---------- team ----------

test('team cards: sanitised strictly, never include coding stats', () => {
  const card = sanitizeCard({
    v: 1, name: 'Ada <img src=x>', streak: 12.7, achievements: -3, generation: 2, updatedAt: 1e20,
    pet: { name: 'Bit', species: 'dragon', mood: 'plotting', hat: 'crown', face: 'crown', screen: 'nope', shiny: 'true' },
  }, 'ada.json');
  assert.equal(card.name, 'Ada <img src=x>', 'kept as text: the webview escapes it');
  assert.equal(card.pet.species, 'blip');
  assert.equal(card.pet.mood, 'ok');
  assert.equal(card.pet.hat, 'crown');
  assert.equal(card.pet.face, null, 'a hat in the face slot is rejected');
  assert.equal(card.pet.screen, 'classic');
  assert.equal(card.pet.shiny, false);
  assert.equal(card.streak, 12);
  assert.equal(card.achievements, 0);
  assert.equal(sanitizeCard({ v: 2 }, 'x.json'), null);
  assert.equal(sanitizeCard(null, 'x.json'), null);

  const { s } = hatched();
  recordActivity(s, { codingMs: HOUR, chars: 5000, commits: 3 }, T0 + 1000);
  const mine = TeamSync.cardFrom(snapshot(s, T0 + 1000), 'me');
  const json = JSON.stringify(mine);
  for (const leak of ['codingMs', 'chars', 'commits', 'langs', 'coins']) assert.ok(!json.includes(leak), `card leaks ${leak}`);
  assert.equal(slugify('Ada Lovelace!'), 'ada-lovelace');
  assert.equal(slugify('../../etc'), 'etc');
});

test('team sync: reads teammates, skips own card, oversized and malformed files', async () => {
  const files = {
    '/repo/.idlepal/ada.json': JSON.stringify({ v: 1, name: 'Ada', pet: { name: 'Bit', species: 'kitbit' }, updatedAt: 2 }),
    '/repo/.idlepal/me.json': JSON.stringify({ v: 1, name: 'Me', pet: { name: 'Mine' } }),
    '/repo/.idlepal/big.json': 'x'.repeat(9000),
    '/repo/.idlepal/bad.json': '{nope',
  };
  const written = {};
  const fakeFs = {
    readFile: async uri => Buffer.from(files[uri.path], 'utf8'),
    writeFile: async (uri, bytes) => { written[uri.fsPath] = Buffer.from(bytes).toString('utf8'); },
    createDirectory: async () => {},
    delete: async () => {},
  };
  const team = new TeamSync({ warn() {} }, {
    fs: fakeFs,
    findFiles: async () => Object.keys(files).map(p => ({ path: p })),
    folders: () => [{ uri: { fsPath: '/repo', path: '/repo' } }],
  });
  const members = await team.refresh('me');
  assert.deepEqual(members.map(m => m.name), ['Ada']);
  assert.equal(members[0].pet.speciesName, 'Kitbit');

  const card = { v: 1, name: 'me', pet: { name: 'Mine' }, streak: 1, achievements: 0, generation: 1, updatedAt: 0 };
  assert.equal(await team.publish(card, 'me', 1000), true);
  assert.equal(await team.publish(card, 'me', 2000), false, 'unchanged: no rewrite');
  assert.equal(await team.publish({ ...card, streak: 2 }, 'me', 30000), false, 'throttled');
  assert.equal(await team.publish({ ...card, streak: 2 }, 'me', 70000), true);
  const path = Object.keys(written).find(p => p.endsWith('me.json'));
  assert.ok(path && path.includes('.idlepal'));
  assert.equal(JSON.parse(written[path]).updatedAt, 70000);
});

// ---------- arcade ----------

test('arcade: every game pays by its reward table, caps scores and tracks personal bests', () => {
  const { GAMES, ECONOMY, CHALLENGE } = require('../src/core/catalog');
  const weekly = require('../src/core/challenge').gameOfWeek(T0);
  for (const [id, g] of Object.entries(GAMES)) {
    const { s, rand } = hatched(7);
    s.pet.happy = 0;
    const r = applyAction(s, 'playResult', { game: id, score: g.maxScore * 10 }, { now: T0, rand });
    assert.equal(r.ok, true, id);
    assert.equal(s.best[id], g.maxScore, `${id} best is capped`);
    const mult = id === weekly ? CHALLENGE.multiplier : 1;
    const expectCoins = Math.min(Math.floor(g.maxScore / g.reward.coinDiv) * mult, ECONOMY.maxGameCoinsPerDay);
    assert.equal(s.coins, expectCoins, `${id} coins`);
    assert.ok(s.pet.happy > 0 && s.pet.happy <= g.reward.happyMax * 2, `${id} happy ${s.pet.happy}`);
  }
});

test('arcade: "New best!" only when beating a previous score', () => {
  const { s, rand } = hatched();
  const play = score => { s.pet.energy = 100; return applyAction(s, 'playResult', { game: 'stack', score }, { now: T0, rand }).message; };
  assert.ok(!play(3).includes('New best'), 'the first game sets a best silently');
  assert.ok(play(5).includes('New best'));
  assert.ok(!play(4).includes('New best'));
  assert.equal(s.best.stack, 5);
});

test('arcade achievements unlock from personal bests', () => {
  const { s } = hatched();
  Object.assign(s.best, { dash: 25, stack: 10, simon: 8, hotkeys: 20, merge: 5 });
  let ids = checkAchievements(s, T0).map(e => e.id);
  for (const a of ['dash.1', 'stack.1', 'simon.1', 'hotkeys.1']) assert.ok(ids.includes(a), a);
  assert.ok(!ids.includes('arcade.0'), 'needs every game');
  for (const id of Object.keys(require('../src/core/catalog').GAMES)) if (!(id in s.best)) s.best[id] = 0;
  ids = checkAchievements(s, T0).map(e => e.id);
  assert.ok(ids.includes('arcade.0'));
});

test('best scores migrate and reject unknown games or inflated values', () => {
  const s = migrate({ schema: 2, best: { dash: 9999, nope: 3, stack: -2, merge: 4 } }, T0, seeded(1));
  assert.deepEqual(s.best, { dash: 80, stack: 0, merge: 4 });
});
