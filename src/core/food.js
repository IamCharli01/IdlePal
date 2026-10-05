'use strict';
// Eating: taste profiles, variety, caffeine, the daily Chef's Special and the Balanced Diet bonus.
const { FOODS, FOOD_CATS, FOOD_RULES, TRAITS } = require('./catalog');
const { clamp, dayKey } = require('./save');
const { seedFrom } = require('./quests');
const quests = require('./quests');

const R = FOOD_RULES;
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/**
 * A pet's favourite and least favourite food. Derived from the pet's id, so it's stable, the same
 * in every window, and needs no storage. The free rice ball is never disliked.
 */
function tastesOf(pet) {
  const ids = Object.keys(FOODS);
  const h = seedFrom(`taste:${pet.id}`);
  const fav = ids[h % ids.length];
  const dislikable = ids.filter(id => id !== 'meal' && id !== fav);
  const dislike = dislikable[(h >>> 11) % dislikable.length];
  return { fav, dislike };
}

/** One purchasable food a day is 25% off and gives a little extra happiness. */
function dailySpecial(save, now) {
  const ids = Object.keys(FOODS).filter(id => FOODS[id].price > 0 && !FOODS[id].rare);
  return ids[seedFrom(`special:${dayKey(now)}:${Math.floor(save.createdAt / 1000)}`) % ids.length];
}

function ensureDay(p, now) {
  const k = dayKey(now);
  if (!p.diet || p.diet.day !== k) p.diet = { day: k, cats: [], bonus: false };
  if (!p.caffeineDay || p.caffeineDay.day !== k) p.caffeineDay = { day: k, n: 0 };
}

/** Feed one food. All input is untrusted: validated here. */
function eat(save, id, now, rand) {
  const p = save.pet;
  const fid = own(FOODS, id) ? id : 'meal';
  const food = FOODS[fid];
  const e = food.effects;
  const stocked = food.price > 0 || food.rare; // rare foods are never free: they come back from expeditions
  if (stocked && !(save.inventory[fid] > 0)) return { ok: false, message: food.rare ? `You don't have a ${food.name}. Expeditions sometimes find one.` : `You don't have any ${food.name.toLowerCase()}. Buy some in the shop.` };
  if ((e.hunger || 0) >= 30 && p.hunger >= 95) return { ok: false, message: `${p.name} is full and refuses to eat.` };
  if ((e.energy || 0) >= 30 && p.energy >= 95) return { ok: false, message: `${p.name} is already buzzing.` };
  if (stocked) save.inventory[fid]--;
  ensureDay(p, now);

  const { fav, dislike } = tastesOf(p);
  const isFav = fid === fav, isDislike = fid === dislike;
  const firstTaste = !p.tasted[fid];
  const repeats = p.recentFoods.slice(-R.repeatWindow).filter(x => x === fid).length;
  const variety = repeats >= 2 ? R.repeatTwice : repeats === 1 ? R.repeatOnce : 1;
  const special = fid === dailySpecial(save, now);
  const traitMods = (TRAITS[p.trait] || { mods: {} }).mods;
  const up = v => (v > 0 ? v * variety : v); // only the good stuff wears off with repetition

  p.hunger = clamp(p.hunger + up(e.hunger || 0) * (isDislike ? R.dislikeHunger : 1));
  p.energy = clamp(p.energy + up(e.energy || 0));
  p.health = clamp(p.health + up(e.health || 0));
  let happy = isDislike ? R.dislikeHappy : up(e.happy || 0) + (isFav ? R.favHappy : 0) + (special ? R.specialHappy : 0);
  if (food.cat === 'meals' && !isDislike) happy += traitMods.mealHappy || 0;
  p.weight = Math.max(1, p.weight + (e.weight || 0));

  const notes = [];
  if (isFav) notes.push(firstTaste ? `❤️ ${p.name} LOVES this! Favourite food discovered.` : `❤️ ${p.name}'s favourite!`);
  if (isDislike) notes.push(firstTaste ? `😖 ${p.name} pulls a face. Not a fan.` : `😖 ${p.name} still isn't a fan.`);
  if (special) notes.push('Chef\'s special!');
  if (repeats >= 2) notes.push(`${p.name} is getting bored of ${food.name.toLowerCase()}.`);

  if (food.caffeine) {
    p.caffeine = { crashAt: now + R.caffeineCrashMs, amount: ((p.caffeine && p.caffeine.amount) || 0) + R.crashPerLevel * food.caffeine };
    p.caffeineDay.n += 1;
    if (p.caffeineDay.n >= R.jitterAfter) { happy -= 6; notes.push(`${p.name} is getting jittery. Maybe switch to tea?`); }
  }

  if (food.cure && p.sick && rand() < food.cure) {
    p.sick = false;
    p.sickSince = null;
    notes.push(`${p.name} feels much better!`);
  }
  p.happy = clamp(p.happy + happy);

  p.tasted[fid] = true;
  save.foodLog[fid] = true;
  p.recentFoods.push(fid);
  if (p.recentFoods.length > 5) p.recentFoods.shift();
  if (food.cat === 'treats') save.totals.snacks++; else save.totals.meals++;
  quests.bump(save, 'feeds', 1, now);

  const events = [];
  if (firstTaste && isFav) events.push({ type: 'favourite', food: fid });
  if (firstTaste && isDislike) events.push({ type: 'dislike', food: fid });
  if (!p.diet.cats.includes(food.cat)) p.diet.cats.push(food.cat);
  if (!p.diet.bonus && Object.keys(FOOD_CATS).every(c => p.diet.cats.includes(c))) {
    p.diet.bonus = true;
    p.health = clamp(p.health + R.balanced.health);
    p.happy = clamp(p.happy + R.balanced.happy);
    save.totals.balancedDays++;
    events.push({ type: 'balancedDiet' });
  }

  return { ok: true, message: [food.line, ...notes].join(' '), anim: `eat:${food.sprite}`, events };
}

/** Called by the simulation: a caffeine crash lands when its timer runs out. */
function caffeineCrash(p, t) {
  if (!p.caffeine || t < p.caffeine.crashAt) return false;
  p.energy = clamp(p.energy - p.caffeine.amount);
  p.caffeine = null;
  return true;
}

/** Food info for the UI. Tastes only show once discovered. */
function foodView(save, now) {
  const p = save.pet;
  const t = tastesOf(p);
  const dietDay = p.diet && p.diet.day === dayKey(now) ? p.diet : { cats: [], bonus: false };
  return {
    fav: p.tasted[t.fav] ? t.fav : null,
    dislike: p.tasted[t.dislike] ? t.dislike : null,
    tasted: Object.keys(p.tasted),
    special: dailySpecial(save, now),
    recent: p.recentFoods.slice(-3),
    diet: { cats: dietDay.cats.slice(), bonus: !!dietDay.bonus },
    caffeine: p.caffeine ? { inMs: Math.max(0, p.caffeine.crashAt - now), amount: p.caffeine.amount } : null,
    caffeineToday: p.caffeineDay && p.caffeineDay.day === dayKey(now) ? p.caffeineDay.n : 0,
  };
}

module.exports = { tastesOf, dailySpecial, eat, caffeineCrash, foodView };
