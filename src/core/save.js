'use strict';
const { NAMES, STAGES, SPECIES, FOODS, ACCESSORIES, SCREENS, ACHIEVEMENTS, TRAITS, ITEMS, QUESTS, GAMES, DECOR, DECOR_ZONES, EXPEDITIONS, ARTEFACTS } = require('./catalog');

const SCHEMA = 2;
const MAX_GRAVEYARD = 50;
const HISTORY_DAYS = 30;
const MAX_JOURNAL = 80;

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }
function num(v, fallback, lo = -Infinity, hi = Infinity) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}
function bool(v, fallback = false) { return typeof v === 'boolean' ? v : fallback; }
function str(v, fallback, max = 40) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

/** Local-time YYYY-MM-DD, so streaks follow the user's own day. */
function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stageFor(ageMs) { return STAGES.find(s => ageMs < s.until); }

function randomName(rand) { return NAMES[Math.floor(rand() * NAMES.length)]; }

function newPet(generation, now, rand) {
  return {
    id: `${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`,
    name: randomName(rand),
    generation,
    species: 'egg',
    bornAt: now,
    ageMs: 0,
    hunger: 80,
    happy: 80,
    energy: 100,
    health: 100,
    weight: 5,
    poops: 0,
    sick: false,
    sickSince: null,
    asleep: false,
    dead: false,
    diedAt: null,
    causeOfDeath: null,
    mistakes: 0,        // lifetime care mistakes, which shape its adult form
    stageMistakes: 0,   // mistakes during the current stage
    flags: {},          // edge-trigger flags for care mistakes
    codingMs: 0,        // coding time during this pet's life
    wins: 0,            // mini-game wins during this pet's life
    trait: null,        // personality, rolled at hatch (see TRAITS)
    shiny: false,       // rare colour variant, rolled at hatch
    milestones: {},     // real-time age milestones already celebrated, e.g. { "7": true }
    tasted: {},         // foodId -> true once this pet has eaten it (reveals favourites and dislikes)
    recentFoods: [],    // last few foods eaten, for the variety rule
    caffeine: null,     // { crashAt, amount } while a caffeine crash is pending
    caffeineDay: null,  // { day, n } caffeinated drinks today
    diet: null,         // { day, cats: [], bonus } food groups eaten today
    langMs: {},         // languageId -> coding ms during this pet's life (decides the Dataray branch)
    nightMs: 0,         // coding ms between 22:00 and 05:00 during this pet's life (Nocturne)
    immuneUntil: null,  // Vitamins: no sickness until this time
  };
}

function emptyTotals() {
  return {
    hatched: 0, adults: 0, meals: 0, snacks: 0, cleans: 0, cures: 0, games: 0, perfectGames: 0,
    bugsSquashed: 0, codingMs: 0, chars: 0, saves: 0, commits: 0, errorsCleared: 0, tasksPassed: 0,
    coinsEarned: 0, nightOwl: false, earlyBird: false,
    focusSessions: 0, focusMs: 0, questsDone: 0, questPerfectDays: 0, shinies: 0, shieldsUsed: 0, mergePerfect: 0, haggles: 0, mysteryBoxes: 0, balancedDays: 0,
    bisectPerfect: 0, regexPerfect: 0, bigoPerfect: 0, duckSessions: 0, expeditions: 0, challengeWeeks: 0, testSaves: 0,
  };
}

function emptyRoom() {
  return Object.fromEntries(DECOR_ZONES.map(z => [z, null]));
}

function emptyDay() {
  return { codingMs: 0, chars: 0, saves: 0, commits: 0, coins: 0, langs: {} };
}

function emptyQuests() {
  return { day: null, list: [], counters: {}, bonusClaimed: false };
}

function createSave(now, rand) {
  return {
    schema: SCHEMA,
    createdAt: now,
    lastUpdate: now,
    paused: false,
    pet: newPet(1, now, rand),
    coins: 0,
    inventory: {},                 // foodId -> count
    owned: { classic: true },      // accessory, screen and decoration ids
    equipped: { hat: null, face: null, prop: null, screen: 'classic', theme: null },
    room: emptyRoom(),             // zone -> decoration id on display
    achievements: {},              // id -> unlockedAt
    dex: {},                       // speciesId -> first seen
    totals: emptyTotals(),
    history: {},                   // dayKey -> { codingMs, chars, saves, commits, coins }
    streak: { current: 0, best: 0, lastDay: null },
    econ: { charCarry: 0, lastSaveReward: 0, day: null, activityCoins: 0, commitCoins: 0, gameCoins: 0, lastDuck: 0 },
    graveyard: [],
    items: {},                     // itemId -> count (consumables such as Streak Shields)
    quests: emptyQuests(),         // today's daily quests and their counters
    shinies: {},                   // speciesId -> true, once a shiny of that species has been seen
    langs: {},                     // languageId -> lifetime coding ms
    recap: { lastWeek: null },     // ISO week key of the last weekly recap shown
    team: { shared: false },       // has the user ever shared their pet with a repo
    best: {},                      // gameId -> personal best score
    promos: {},                    // promoId -> redeemedAt
    foodLog: {},                   // foodId -> true once any of your pets has tasted it
    shop: { day: null, deals: [], used: {}, haggles: {}, goal: null }, // daily deals, haggles, savings goal
    expedition: null,              // { dest, startedAt, endsAt } while the pet is away
    artefacts: {},                 // artefactId -> foundAt
    journal: { lastDay: null, entries: [] }, // the pet's diary: [{ t, icon, text }], newest last
    challenge: { week: null, best: 0, plays: 0 }, // this week's Weekly Challenge best score
  };
}

function sanitizePet(raw, now, rand) {
  const r = obj(raw);
  const base = newPet(num(r.generation, 1, 1, 1e6), now, rand);
  const ageMs = num(r.ageMs, 0, 0);
  const stage = stageFor(ageMs).id;
  let species = typeof r.species === 'string' && SPECIES[r.species] ? r.species : null;
  if (!species || SPECIES[species].stage !== stage) species = defaultSpecies(stage);
  return {
    ...base,
    id: str(r.id, base.id, 64),
    name: str(r.name, base.name, 20),
    species,
    bornAt: num(r.bornAt, now),
    ageMs,
    hunger: num(r.hunger, 80, 0, 100),
    happy: num(r.happy, 80, 0, 100),
    energy: num(r.energy, 100, 0, 100),
    health: num(r.health, 100, 0, 100),
    weight: num(r.weight, 5, 1, 99),
    poops: Math.floor(num(r.poops, 0, 0, 4)),
    sick: bool(r.sick),
    sickSince: r.sick ? num(r.sickSince, now) : null,
    asleep: bool(r.asleep),
    dead: bool(r.dead),
    diedAt: r.dead ? num(r.diedAt, now) : null,
    causeOfDeath: r.dead ? str(r.causeOfDeath, 'neglect', 20) : null,
    mistakes: num(r.mistakes, 0, 0),
    stageMistakes: num(r.stageMistakes, 0, 0),
    flags: Object.fromEntries(Object.entries(obj(r.flags)).filter(([, v]) => typeof v === 'boolean')),
    codingMs: num(r.codingMs, 0, 0),
    wins: num(r.wins, 0, 0),
    trait: typeof r.trait === 'string' && TRAITS[r.trait] ? r.trait : null,
    shiny: bool(r.shiny),
    milestones: Object.fromEntries(Object.entries(obj(r.milestones)).filter(([k, v]) => /^\d+$/.test(k) && v === true)),
    tasted: Object.fromEntries(Object.entries(obj(r.tasted)).filter(([k, v]) => FOODS[k] && v === true)),
    recentFoods: (Array.isArray(r.recentFoods) ? r.recentFoods : []).filter(k => typeof k === 'string' && FOODS[k]).slice(-5),
    caffeine: r.caffeine && typeof r.caffeine === 'object' && Number.isFinite(r.caffeine.crashAt)
      ? { crashAt: r.caffeine.crashAt, amount: num(r.caffeine.amount, 0, 0, 100) } : null,
    caffeineDay: r.caffeineDay && typeof r.caffeineDay.day === 'string' ? { day: r.caffeineDay.day, n: Math.floor(num(r.caffeineDay.n, 0, 0, 99)) } : null,
    diet: r.diet && typeof r.diet.day === 'string'
      ? { day: r.diet.day, cats: (Array.isArray(r.diet.cats) ? r.diet.cats : []).filter(c => ['meals', 'snacks', 'drinks', 'treats'].includes(c)), bonus: bool(r.diet.bonus) } : null,
    langMs: langMap(r.langMs),
    nightMs: num(r.nightMs, 0, 0),
    immuneUntil: Number.isFinite(r.immuneUntil) && r.immuneUntil > now ? r.immuneUntil : null,
  };
}

function defaultSpecies(stage) {
  return { egg: 'egg', baby: 'blip', child: 'kitbit', teen: 'sprocket', adult: 'mochimon' }[stage];
}

/**
 * Turn anything we find in storage or an imported file (a save, an older save missing newer fields,
 * or garbage) into a valid save. Never throws.
 */
function migrate(raw, now, rand) {
  const fresh = createSave(now, rand);
  if (!raw || typeof raw !== 'object') return fresh;

  const r = raw;
  const s = fresh;
  s.createdAt = num(r.createdAt, now);
  s.lastUpdate = num(r.lastUpdate, now);
  s.paused = bool(r.paused);
  s.pet = sanitizePet(r.pet, now, rand);
  s.coins = Math.floor(num(r.coins, 0, 0, 1e9));

  for (const [k, v] of Object.entries(obj(r.inventory))) {
    if (FOODS[k] && (FOODS[k].price > 0 || FOODS[k].rare)) s.inventory[k] = Math.floor(num(v, 0, 0, 999));
  }
  for (const [k, v] of Object.entries(obj(r.owned))) {
    if ((ACCESSORIES[k] || SCREENS[k] || DECOR[k]) && v === true) s.owned[k] = true;
  }
  s.owned.classic = true;
  const eq = obj(r.equipped);
  const wearable = (id, slot) => ACCESSORIES[id] && ACCESSORIES[id].slot === slot && s.owned[id] ? id : null;
  s.equipped.hat = wearable(eq.hat, 'hat');
  s.equipped.face = wearable(eq.face, 'face');
  s.equipped.prop = wearable(eq.prop, 'prop');
  s.equipped.screen = SCREENS[eq.screen] && s.owned[eq.screen] ? eq.screen : 'classic';
  s.equipped.theme = wearable(eq.theme, 'theme');
  const room = obj(r.room);
  for (const z of DECOR_ZONES) s.room[z] = DECOR[room[z]] && DECOR[room[z]].zone === z && s.owned[room[z]] ? room[z] : null;

  // Lazy require: achievements.js depends on econ.js, which depends on this file.
  s.achievements = require('./achievements').migrateAchievements(obj(r.achievements), now, num);
  for (const [k, v] of Object.entries(obj(r.dex))) if (SPECIES[k]) s.dex[k] = num(v, now);
  s.dex[s.pet.species] = s.dex[s.pet.species] || now;

  const t = obj(r.totals);
  for (const k of Object.keys(s.totals)) {
    s.totals[k] = typeof s.totals[k] === 'boolean' ? bool(t[k]) : num(t[k], 0, 0);
  }

  for (const [k, v] of Object.entries(obj(r.history))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const h = obj(v);
    s.history[k] = { codingMs: num(h.codingMs, 0, 0), chars: num(h.chars, 0, 0), saves: num(h.saves, 0, 0), commits: num(h.commits, 0, 0), coins: num(h.coins, 0, 0), langs: langMap(h.langs) };
  }
  pruneHistory(s, now);

  for (const [k, v] of Object.entries(obj(r.items))) if (ITEMS[k]) s.items[k] = Math.floor(num(v, 0, 0, ITEMS[k].max));
  const q = obj(r.quests);
  s.quests = {
    day: typeof q.day === 'string' ? q.day : null,
    list: (Array.isArray(q.list) ? q.list : []).slice(0, 5).map(x => obj(x)).filter(x => QUESTS[x.id]).map(x => ({
      id: x.id, target: Math.max(1, Math.floor(num(x.target, 1, 1))), done: bool(x.done),
    })),
    counters: Object.fromEntries(Object.entries(obj(q.counters)).filter(([k, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Math.max(0, v)])),
    bonusClaimed: bool(q.bonusClaimed),
  };
  for (const [k, v] of Object.entries(obj(r.shinies))) if (SPECIES[k] && v === true) s.shinies[k] = true;
  s.langs = langMap(r.langs);
  const rc = obj(r.recap);
  s.recap = { lastWeek: typeof rc.lastWeek === 'string' ? rc.lastWeek : null };
  s.team = { shared: bool(obj(r.team).shared) };
  for (const [k, v] of Object.entries(obj(r.best))) if (GAMES[k]) s.best[k] = Math.floor(num(v, 0, 0, GAMES[k].maxScore));
  for (const [k, v] of Object.entries(obj(r.foodLog))) if (FOODS[k] && v === true) s.foodLog[k] = true;
  const { PROMOS } = require('./catalog');
  for (const [k, v] of Object.entries(obj(r.promos))) if (PROMOS[k]) s.promos[k] = num(v, now);
  // A Vault item stays unlocked only while a redeemed promo that unlocks it is still configured.
  // This relocks items from retired or unknown codes (and anything a hand-edited save claims).
  const backed = new Set(Object.keys(s.promos).map(k => PROMOS[k].unlock));
  for (const id of Object.keys(s.owned)) if (ACCESSORIES[id] && ACCESSORIES[id].vault && !backed.has(id)) delete s.owned[id];
  if (s.equipped.theme && !s.owned[s.equipped.theme]) s.equipped.theme = null;
  const sh = obj(r.shop);
  const sellable = id => typeof id === 'string' && (FOODS[id] || ACCESSORIES[id] || SCREENS[id] || ITEMS[id] || DECOR[id]);
  s.shop = {
    day: typeof sh.day === 'string' ? sh.day : null,
    deals: (Array.isArray(sh.deals) ? sh.deals : []).filter(sellable).slice(0, 5),
    used: Object.fromEntries(Object.entries(obj(sh.used)).filter(([k, v]) => sellable(k) && v === true)),
    haggles: Object.fromEntries(Object.entries(obj(sh.haggles)).filter(([k, v]) => sellable(k) && (v === 'won' || v === 'refused'))),
    goal: sellable(sh.goal) ? sh.goal : null,
  };

  const st = obj(r.streak);
  s.streak = { current: num(st.current, 0, 0), best: num(st.best, 0, 0), lastDay: typeof st.lastDay === 'string' ? st.lastDay : null };
  const e = obj(r.econ);
  s.econ = {
    charCarry: num(e.charCarry, 0, 0), lastSaveReward: num(e.lastSaveReward, 0, 0), day: typeof e.day === 'string' ? e.day : null,
    activityCoins: num(e.activityCoins, 0, 0), commitCoins: num(e.commitCoins, 0, 0), gameCoins: num(e.gameCoins, 0, 0), lastDuck: num(e.lastDuck, 0, 0),
  };
  const ex = obj(r.expedition);
  s.expedition = EXPEDITIONS[ex.dest] && Number.isFinite(ex.startedAt) && Number.isFinite(ex.endsAt) && ex.endsAt > ex.startedAt && !s.pet.dead
    ? { dest: ex.dest, startedAt: ex.startedAt, endsAt: ex.endsAt } : null;
  for (const [k, v] of Object.entries(obj(r.artefacts))) if (ARTEFACTS[k]) s.artefacts[k] = num(v, now);
  const j = obj(r.journal);
  s.journal = {
    lastDay: typeof j.lastDay === 'string' ? j.lastDay : null,
    entries: (Array.isArray(j.entries) ? j.entries : []).slice(-MAX_JOURNAL).map(x => obj(x))
      .filter(x => typeof x.text === 'string' && x.text.trim())
      .map(x => ({ t: num(x.t, now), icon: str(x.icon, 'star', 24), text: x.text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200) })),
  };
  const ch = obj(r.challenge);
  s.challenge = { week: typeof ch.week === 'string' ? ch.week : null, best: Math.floor(num(ch.best, 0, 0, 1e6)), plays: Math.floor(num(ch.plays, 0, 0, 1e6)) };
  s.graveyard = (Array.isArray(r.graveyard) ? r.graveyard : []).slice(0, MAX_GRAVEYARD).map(g => {
    const x = obj(g);
    return {
      name: str(x.name, '???', 20), species: SPECIES[x.species] ? x.species : 'blip', generation: num(x.generation, 1, 1),
      ageMs: num(x.ageMs, 0, 0), causeOfDeath: str(x.causeOfDeath, 'neglect', 20), diedAt: num(x.diedAt, now), bornAt: num(x.bornAt, now),
    };
  });
  return s;
}

function pruneHistory(save, now) {
  const cutoff = dayKey(now - HISTORY_DAYS * 24 * 3600 * 1000);
  for (const k of Object.keys(save.history)) if (k < cutoff) delete save.history[k];
}

function today(save, now) {
  const k = dayKey(now);
  if (!save.history[k]) save.history[k] = emptyDay();
  if (!save.history[k].langs) save.history[k].langs = {};
  return save.history[k];
}

/** languageId -> ms, with junk removed and at most 40 languages kept. */
function langMap(raw) {
  const out = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    if (!/^[a-z0-9_.+#-]{1,40}$/i.test(k)) continue;
    const n = num(v, 0, 0);
    if (n > 0) out[k] = n;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 40));
}

/** ISO-8601 week key (local time), e.g. "2026-W39". */
function weekKey(t) {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const week = 1 + Math.round(((thursday - jan1) / 86400000 - 3 + ((jan1.getDay() + 6) % 7)) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = { SCHEMA, MAX_GRAVEYARD, MAX_JOURNAL, clamp, dayKey, weekKey, stageFor, newPet, createSave, migrate, pruneHistory, today, emptyDay, emptyQuests, emptyRoom, randomName, defaultSpecies };
