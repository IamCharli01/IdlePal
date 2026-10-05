'use strict';
const { MIN, HOUR, TUNING, SPECIES, TRAITS, SHINY_CHANCE } = require('./catalog');
const { clamp, stageFor, MAX_GRAVEYARD } = require('./save');

function chance(rand, perMinute, minutes) { return rand() < 1 - Math.pow(1 - perMinute, minutes); }

/** Choose the next form. Care quality during each stage decides the branch; how you coded decides the adult. */
function pickSpecies(p, stage) {
  switch (stage) {
    case 'egg': return 'egg';
    case 'baby': return 'blip';
    case 'child': return p.stageMistakes <= 1 ? 'kitbit' : 'spud';
    case 'teen': return p.stageMistakes <= 2 ? 'sprocket' : 'squib';
    default: {
      const langs = Object.values(p.langMs || {}).filter(ms => ms >= TUNING.polyglotMsPerLang).length;
      if ((p.generation || 1) >= 3 && p.mistakes <= 1) return 'phoenix';
      if (p.mistakes <= 3 && p.wins >= 15) return 'starlet';
      if (p.codingMs >= 4 * HOUR && p.mistakes <= 6) return 'octocoder';
      if (langs >= TUNING.polyglotLangs && p.mistakes <= 6) return 'dataray';
      if ((p.nightMs || 0) >= TUNING.nocturneNightMs && p.mistakes <= 6) return 'nocturne';
      if (p.mistakes <= 3) return 'mochimon';
      if (p.mistakes >= 10) return 'gremlin';
      return 'blobbo';
    }
  }
}

function evolve(save, stage, t, events, rand) {
  const p = save.pet;
  const from = p.species;
  p.species = pickSpecies(p, stage);
  p.stageMistakes = 0;
  if (from === 'egg') {
    // Personality and colour are rolled once, at hatch. A Lucky Charm quadruples the shiny odds and is used up.
    const traits = Object.keys(TRAITS);
    p.trait = traits[Math.floor(rand() * traits.length)];
    const charm = (save.items.luckyCharm || 0) > 0;
    if (charm) save.items.luckyCharm--;
    p.shiny = rand() < SHINY_CHANCE * (charm ? 4 : 1);
    if (p.shiny) {
      save.totals.shinies++;
      events.push({ type: 'shiny' });
    }
  }
  if (p.shiny) save.shinies[p.species] = true;
  if (!save.dex[p.species]) {
    save.dex[p.species] = t;
    events.push({ type: 'discovered', species: p.species });
  }
  if (from === 'egg') save.totals.hatched++;
  if (stage === 'adult') save.totals.adults++;
  events.push({ type: from === 'egg' ? 'hatched' : 'evolved', species: p.species, stage });
}

function trackMistakes(p, t, events) {
  const conditions = {
    starving: p.hunger <= 0,
    miserable: p.happy <= 0,
    filthy: p.poops >= 3,
    untreated: p.sick && p.sickSince != null && t - p.sickSince >= TUNING.sickMistakeAfter,
  };
  for (const [k, on] of Object.entries(conditions)) {
    if (on && !p.flags[k]) {
      p.flags[k] = true;
      p.mistakes++;
      p.stageMistakes++;
      events.push({ type: 'mistake', reason: k });
    } else if (!on && p.flags[k]) {
      p.flags[k] = false;
    }
  }
}

function bury(save, t) {
  const p = save.pet;
  save.graveyard.unshift({
    name: p.name, species: p.species, generation: p.generation, ageMs: p.ageMs,
    causeOfDeath: p.causeOfDeath, diedAt: t, bornAt: p.bornAt,
  });
  save.graveyard.length = Math.min(save.graveyard.length, MAX_GRAVEYARD);
}

/**
 * Advance the world by dtMs ending at `now`.
 * A long gap means the editor was closed: time runs slower, is capped, and can't cause sickness or death.
 * @returns {Array<{type: string, [k: string]: any}>}
 */
function simulate(save, dtMs, { now, rand, speed = 1 }) {
  const events = [];
  const p = save.pet;
  if (save.paused || p.dead || !(dtMs > 0)) return events;

  const offline = dtMs > TUNING.offlineGap;
  let remaining = offline ? Math.min(dtMs, TUNING.offlineCap) : dtMs;
  let t = now - remaining;

  while (remaining > 0 && !p.dead) {
    const chunk = Math.min(remaining, MIN);
    remaining -= chunk;
    t += chunk;

    const mods = (TRAITS[p.trait] || { mods: {} }).mods;
    if (!offline) {
      const before = stageFor(p.ageMs).id;
      p.ageMs += chunk * (mods.age || 1);
      const after = stageFor(p.ageMs).id;
      if (before !== after) evolve(save, after, t, events, rand);
      if (before === 'egg') continue;
    } else if (SPECIES[p.species].stage === 'egg') {
      continue;
    }
    // Away on an expedition: it looks after itself (needs freeze), but it still grows up.
    if (save.expedition) continue;

    if (require('./food').caffeineCrash(p, t)) events.push({ type: 'caffeineCrash' });
    const m = (chunk / MIN) * speed * (offline ? TUNING.offlineRate : 1);
    const healthBefore = p.health;
    const heavy = p.weight >= TUNING.overweight;
    const hour = new Date(t).getHours();
    const night = hour >= 22 || hour < 5;

    if (p.asleep) {
      p.hunger -= TUNING.asleep.hunger * m;
      p.happy -= TUNING.asleep.happy * m;
      p.energy -= TUNING.asleep.energy * m * (mods.sleepRecover || 1);
      if (p.energy >= 100) {
        p.energy = 100;
        p.asleep = false;
        events.push({ type: 'woke' });
      }
    } else {
      p.hunger -= TUNING.awake.hunger * m * (mods.hunger || 1);
      p.happy -= TUNING.awake.happy * m * (heavy ? 1.3 : 1) * (mods.happy || 1);
      p.energy -= TUNING.awake.energy * m * (mods.energy || 1) * (night && mods.energyNight ? mods.energyNight : 1);
      if (p.energy <= 0) {
        p.energy = 0;
        p.asleep = true;
        p.happy -= 10;
        events.push({ type: 'passedOut' });
      }
      if (p.hunger > 20 && p.poops < TUNING.maxPoops && chance(rand, TUNING.poopChance * (mods.poop || 1), m)) {
        p.poops++;
        events.push({ type: 'pooped' });
      }
    }

    const d = TUNING.damage;
    let damage = d.perPoop * p.poops;
    if (p.hunger <= 0) damage += d.starving;
    if (p.happy <= 0) damage += d.miserable;
    if (p.sick) damage += d.sick;
    if (damage > 0) p.health -= damage * m;
    else if (p.hunger > 40 && p.happy > 40) p.health += TUNING.regen * m;

    if (!offline && !p.sick && !(p.immuneUntil && t < p.immuneUntil)) {
      const r = TUNING.sickRisk;
      const risk = (p.poops >= 2 ? r.messy : 0) + (p.health < 50 ? r.weak : 0) + (p.hunger <= 0 ? r.starving : 0) + (heavy ? r.overweight : 0);
      if (risk > 0 && chance(rand, risk * (mods.sick || 1), m)) {
        p.sick = true;
        p.sickSince = t;
        events.push({ type: 'sick' });
      }
    }

    p.hunger = clamp(p.hunger);
    p.happy = clamp(p.happy);
    p.energy = clamp(p.energy);
    p.health = clamp(p.health);
    if (p.immuneUntil && t >= p.immuneUntil) p.immuneUntil = null;

    if (offline) {
      p.health = Math.max(p.health, Math.min(TUNING.offlineHealthFloor, healthBefore));
      continue;
    }

    trackMistakes(p, t, events);

    if (p.health <= 0) {
      p.dead = true;
      p.asleep = false;
      p.diedAt = t;
      p.causeOfDeath = p.hunger <= 0 ? 'starvation' : p.sick ? 'illness' : 'neglect';
      bury(save, t);
      events.push({ type: 'died', cause: p.causeOfDeath });
    }
  }
  return events;
}

module.exports = { simulate, pickSpecies, bury };
