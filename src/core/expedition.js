'use strict';
// Expeditions: send your pet away for a while. Its needs freeze while it's gone, and it comes back
// with coins, a food and sometimes an artefact. The idle loop for heads-down days.
const { EXPEDITIONS, ARTEFACTS, FOODS, TRAITS, MIN } = require('./catalog');
const { clamp } = require('./save');
const { earn } = require('./econ');
const quests = require('./quests');

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const modsOf = p => (TRAITS[p.trait] || { mods: {} }).mods;
const fail = message => ({ ok: false, message });

function start(save, dest, now) {
  const p = save.pet;
  if (!own(EXPEDITIONS, dest)) return fail('Unknown destination.');
  const x = EXPEDITIONS[dest];
  if (save.expedition) return fail(`${p.name} is already away.`);
  if (p.sick) return fail(`${p.name} is too ill to travel. Medicine first.`);
  if (p.energy < x.energy + 10) return fail(`${p.name} needs at least ${x.energy + 10} energy for ${x.name}.`);
  let ms = x.minutes * MIN * (modsOf(p).expedition || 1);
  const mix = (save.items.trailMix || 0) > 0;
  if (mix) { save.items.trailMix--; ms *= 0.75; }
  p.energy = clamp(p.energy - x.energy);
  save.expedition = { dest, startedAt: now, endsAt: now + Math.round(ms) };
  const mins = Math.round(ms / MIN);
  return {
    ok: true,
    message: `${p.name} sets off for ${x.name}. Back in about ${mins} minutes.${mix ? ' Trail Mix packed: a quicker trip.' : ''} 🧭`,
    anim: 'sparkle',
    events: [{ type: 'expeditionStart', dest }],
  };
}

function recall(save) {
  const p = save.pet;
  if (!save.expedition) return fail(`${p.name} is right here.`);
  save.expedition = null;
  return { ok: true, message: `${p.name} turns back early. No loot this time.` };
}

/** Called every tick. When the trip is over, roll the loot and bring the pet home. */
function settle(save, now, rand) {
  const e = save.expedition;
  if (!e || now < e.endsAt) return [];
  save.expedition = null;
  const x = EXPEDITIONS[e.dest];
  if (!x) return [];
  const p = save.pet;
  const lootMul = modsOf(p).loot || 1;
  const [lo, hi] = x.loot.coins;
  const coins = earn(save, Math.round((lo + rand() * (hi - lo)) * lootMul), now);
  const food = x.loot.foods[Math.floor(rand() * x.loot.foods.length)];
  if (FOODS[food]) save.inventory[food] = (save.inventory[food] || 0) + 1;
  let artefact = null;
  const pool = x.loot.artefacts.filter(id => ARTEFACTS[id] && !save.artefacts[id]);
  if (pool.length && rand() < Math.min(0.9, x.loot.artefactChance * lootMul)) {
    artefact = pool[Math.floor(rand() * pool.length)];
    save.artefacts[artefact] = now;
  }
  save.totals.expeditions++;
  quests.bump(save, 'expedition', 1, now);
  if (!p.dead) p.happy = clamp(p.happy + 10);
  return [{ type: 'expeditionDone', dest: e.dest, coins, food, artefact }];
}

/** View model: the trip in progress, the destinations, and the artefact collection. */
function view(save, now) {
  const e = save.expedition;
  const active = e && EXPEDITIONS[e.dest] ? {
    dest: e.dest, name: EXPEDITIONS[e.dest].name, icon: EXPEDITIONS[e.dest].icon,
    startedAt: e.startedAt, endsAt: e.endsAt,
    progress: Math.max(0, Math.min(1, (now - e.startedAt) / Math.max(1, e.endsAt - e.startedAt))),
    leftMs: Math.max(0, e.endsAt - now),
  } : null;
  return {
    active,
    destinations: Object.entries(EXPEDITIONS).map(([id, x]) => ({
      id, name: x.name, desc: x.desc, icon: x.icon, minutes: x.minutes, energy: x.energy,
      artefactsLeft: x.loot.artefacts.filter(a => !save.artefacts[a]).length, artefactsTotal: x.loot.artefacts.length,
    })),
    artefacts: Object.entries(ARTEFACTS).map(([id, a]) => {
      const found = !!save.artefacts[id];
      const from = Object.entries(EXPEDITIONS).find(([, x]) => x.loot.artefacts.includes(id));
      return { id, found, foundAt: found ? save.artefacts[id] : null, rarity: a.rarity, icon: found ? a.icon : 'lock', name: found ? a.name : null, desc: found ? a.desc : null, from: from ? from[1].name : null };
    }),
  };
}

module.exports = { start, recall, settle, view };
