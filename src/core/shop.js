'use strict';
// The shop: daily deals, Ship-It (commit) discount, haggling, mystery box, bundles, sell-back.
// Everything random is seeded by the day, so every window agrees and reloading can't reroll it.
const { FOODS, ACCESSORIES, SCREENS, ITEMS, BUNDLES, SHOP, FOOD_RULES, DECOR } = require('./catalog');
const { dayKey } = require('./save');
const { seedFrom, rng } = require('./quests');

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const TABLES = { food: FOODS, accessory: ACCESSORIES, screen: SCREENS, item: ITEMS, decor: DECOR };
const ALL_IDS = () => Object.keys(TABLES).flatMap(k => Object.keys(TABLES[k]));

/** What kind of thing an id is, or null. */
function kindOf(id) {
  for (const k of Object.keys(TABLES)) if (own(TABLES[k], id)) return k;
  return null;
}

function itemOf(id) {
  const k = kindOf(id);
  return k ? TABLES[k][id] : null;
}

/** Cosmetics are owned once (never stacked): wardrobe, screens and room decorations. */
const isCosmetic = id => ['accessory', 'screen', 'decor'].includes(kindOf(id));
const purchasable = id => { const it = itemOf(id); return !!it && it.price > 0 && !it.exclusive && !it.vault && !it.rare; };

/** Today's deals and haggle state. Rolls over at local midnight. */
function ensureShop(save, now) {
  const k = dayKey(now);
  if (save.shop.day === k) return false;
  const r = rng(seedFrom(`shop:${k}:${Math.floor(save.createdAt / 1000)}`));
  // Candidates: consumables always, cosmetics you don't own yet.
  const pool = ALL_IDS().filter(id => purchasable(id) && !(isCosmetic(id) && save.owned[id]));
  const deals = [];
  while (deals.length < SHOP.dealCount && pool.length) deals.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  save.shop = { day: k, deals, used: {}, haggles: {}, goal: save.shop.goal };
  return true;
}

/** Ship-It discount from today's commits. */
function commitDiscount(save, now) {
  const commits = (save.history[dayKey(now)] || { commits: 0 }).commits || 0;
  return Math.min(SHOP.commitDiscountMax, commits * SHOP.commitDiscountPer);
}

/** Best price available right now, and why. */
function priceFor(save, id, now) {
  const it = itemOf(id);
  if (!it || !purchasable(id)) return null;
  ensureShop(save, now);
  const base = it.price;
  const deal = save.shop.deals.includes(id) && !save.shop.used[id] ? SHOP.dealDiscount : 0;
  const ship = commitDiscount(save, now);
  const special = kindOf(id) === 'food' && id === require('./food').dailySpecial(save, now) ? FOOD_RULES.specialDiscount : 0;
  const pct = Math.max(deal, ship, special);
  const reason = pct === 0 ? null : pct === deal ? 'deal' : pct === special ? 'special' : 'commit';
  return { base, price: Math.max(1, Math.ceil(base * (1 - pct))), pct, reason };
}

/** Mx. Stash's secret lowest acceptable price for an item today. */
function haggleFloor(save, id, now) {
  const it = itemOf(id);
  const r = rng(seedFrom(`haggle:${dayKey(now)}:${id}:${Math.floor(save.createdAt / 1000)}`));
  const pct = SHOP.haggle.floorMin + r() * (SHOP.haggle.floorMax - SHOP.haggle.floorMin);
  return Math.ceil(it.price * pct);
}

const canHaggle = id => purchasable(id) && kindOf(id) !== 'food';

/** Cosmetics the Mystery Box can still give you, with weights. */
function mysteryPool(save) {
  return [...Object.keys(ACCESSORIES), ...Object.keys(SCREENS)]
    .filter(id => !save.owned[id] && itemOf(id) && !itemOf(id).vault && (itemOf(id).exclusive || itemOf(id).price > 0))
    .map(id => ({ id, weight: itemOf(id).exclusive ? SHOP.mysteryWeights.exclusive : SHOP.mysteryWeights.normal }));
}

function sellPrice(id) {
  const it = itemOf(id);
  if (!it || !isCosmetic(id) || id === 'classic' || it.vault) return 0;
  return it.exclusive ? SHOP.exclusiveSellPrice : Math.floor(it.price * SHOP.sellBack);
}

/** Everything the shop UI needs. */
function shopView(save, now) {
  ensureShop(save, now);
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const pool = mysteryPool(save);
  const totalW = pool.reduce((a, p) => a + p.weight, 0) || 1;
  const exclusives = pool.filter(p => itemOf(p.id).exclusive);
  const prices = {};
  for (const id of ALL_IDS()) {
    const p = priceFor(save, id, now);
    if (p) prices[id] = p;
  }
  const goal = save.shop.goal && prices[save.shop.goal] ? { id: save.shop.goal, name: itemOf(save.shop.goal).name, price: prices[save.shop.goal].price } : null;
  return {
    deals: save.shop.deals.map(id => ({ id, kind: kindOf(id), ...prices[id], used: !!save.shop.used[id] })),
    refreshInMs: midnight - now,
    commitDiscount: commitDiscount(save, now),
    commitsToday: (save.history[dayKey(now)] || {}).commits || 0,
    prices,
    haggles: { ...save.shop.haggles },
    sell: Object.fromEntries(Object.keys(save.owned).filter(id => sellPrice(id) > 0).map(id => [id, sellPrice(id)])),
    mystery: {
      price: SHOP.mysteryPrice,
      left: pool.length,
      exclusivesLeft: exclusives.length,
      exclusiveOdds: exclusives.reduce((a, p) => a + p.weight, 0) / totalW,
    },
    bundles: Object.entries(BUNDLES).map(([id, b]) => ({
      id, name: b.name, desc: b.desc, contents: b.contents, price: b.price,
      value: Object.entries(b.contents).reduce((a, [f, n]) => a + FOODS[f].price * n, 0),
    })),
    goal,
    // Locked items only reveal their drop number, rarity and teaser: the name and look stay secret.
    vault: Object.entries(ACCESSORIES).filter(([, a]) => a.vault).sort((a, b) => a[1].drop - b[1].drop).map(([id, a]) => {
      const unlocked = !!save.owned[id];
      return { id, drop: a.drop, rarity: a.rarity, teaser: a.teaser, unlocked, equipped: save.equipped.theme === id, name: unlocked ? a.name : null, desc: unlocked ? a.desc : null };
    }),
  };
}

// ---------- actions (called from actions.js; each returns an action result) ----------

function buyBundle(save, id) {
  if (!own(BUNDLES, id)) return { ok: false, message: 'That bundle isn\'t available.' };
  const b = BUNDLES[id];
  if (save.coins < b.price) return { ok: false, message: `${b.name} costs ${b.price}🪙, and you have ${save.coins}🪙.` };
  save.coins -= b.price;
  for (const [f, n] of Object.entries(b.contents)) save.inventory[f] = (save.inventory[f] || 0) + n;
  return { ok: true, message: `Bought the ${b.name}! Your pantry is stocked. 🧺`, anim: 'sparkle', shopkeeper: 'bundle' };
}

function openMystery(save, now, rand) {
  const pool = mysteryPool(save);
  if (!pool.length) return { ok: false, message: 'You own every cosmetic already. Mx. Stash is impressed.' };
  if (save.coins < SHOP.mysteryPrice) return { ok: false, message: `The Mystery Box costs ${SHOP.mysteryPrice}🪙, and you have ${save.coins}🪙.` };
  save.coins -= SHOP.mysteryPrice;
  let roll = rand() * pool.reduce((a, p) => a + p.weight, 0);
  let pick = pool[pool.length - 1].id;
  for (const p of pool) { roll -= p.weight; if (roll <= 0) { pick = p.id; break; } }
  save.owned[pick] = true;
  save.totals.mysteryBoxes++;
  const it = itemOf(pick);
  return {
    ok: true,
    message: `🎁 ${it.exclusive ? 'EXCLUSIVE! ' : ''}You unboxed ${it.name}!`,
    anim: 'sparkle',
    reveal: { id: pick, kind: kindOf(pick), exclusive: !!it.exclusive },
    shopkeeper: it.exclusive ? 'exclusive' : 'mystery',
  };
}

function haggle(save, arg, now) {
  const a = arg && typeof arg === 'object' ? arg : {};
  const id = a.id;
  if (!canHaggle(id)) return { ok: false, message: 'Mx. Stash doesn\'t haggle over that.' };
  const it = itemOf(id);
  ensureShop(save, now);
  if (isCosmetic(id) && save.owned[id]) return { ok: false, message: `You already own ${it.name}.` };
  if (kindOf(id) === 'item' && (save.items[id] || 0) >= it.max) return { ok: false, message: `You can hold at most ${it.max} ${it.name}s.` };
  const state = save.shop.haggles[id];
  if (state === 'refused') return { ok: false, message: 'Mx. Stash won\'t haggle on that again today.', shopkeeper: 'grumpy' };
  if (state === 'won') return { ok: false, message: 'One haggle per item per day. That was the deal.', shopkeeper: 'grumpy' };
  const offer = Math.floor(Number(a.offer));
  const min = Math.ceil(it.price * SHOP.haggle.minOffer);
  if (!Number.isFinite(offer) || offer < min || offer > it.price) return { ok: false, message: `Offers must be between ${min} and ${it.price}🪙.` };
  if (save.coins < offer) return { ok: false, message: `You can't cover an offer of ${offer}🪙.` };
  if (offer < haggleFloor(save, id, now)) {
    save.shop.haggles[id] = 'refused';
    return { ok: true, message: `"${offer}🪙?! For ${it.name}? I'm insulted." No more haggling on that today.`, shopkeeper: 'insulted' };
  }
  save.shop.haggles[id] = 'won';
  save.totals.haggles++;
  save.coins -= offer;
  grant(save, id);
  return { ok: true, message: `"Fine, fine. ${offer}🪙 it is." You got ${it.name} (${Math.round((1 - offer / it.price) * 100)}% off)!`, anim: 'sparkle', shopkeeper: 'deal' };
}

function sell(save, id) {
  const price = sellPrice(id);
  if (!price || !save.owned[id]) return { ok: false, message: 'You can\'t sell that.' };
  delete save.owned[id];
  for (const slot of ['hat', 'face', 'prop', 'theme']) if (save.equipped[slot] === id) save.equipped[slot] = null;
  if (save.equipped.screen === id) save.equipped.screen = 'classic';
  for (const z of Object.keys(save.room)) if (save.room[z] === id) save.room[z] = null;
  if (save.shop.goal === id) save.shop.goal = null;
  save.coins += price;
  return { ok: true, message: `Sold ${itemOf(id).name} for ${price}🪙.`, shopkeeper: 'sold' };
}

function setGoal(save, id) {
  if (id === null || id === '' || save.shop.goal === id) { save.shop.goal = null; return { ok: true, message: 'Savings goal cleared.' }; }
  if (!purchasable(id) || (isCosmetic(id) && save.owned[id])) return { ok: false, message: 'You can\'t save up for that.' };
  save.shop.goal = id;
  return { ok: true, message: `Saving up for ${itemOf(id).name}. ⭐` };
}

/** Give a purchased thing to the player (and wear/use cosmetics straight away). */
function grant(save, id) {
  const k = kindOf(id);
  if (k === 'food') save.inventory[id] = (save.inventory[id] || 0) + 1;
  else if (k === 'item') save.items[id] = (save.items[id] || 0) + 1;
  else {
    save.owned[id] = true;
    if (k === 'accessory') save.equipped[ACCESSORIES[id].slot] = id;
    else if (k === 'decor') save.room[DECOR[id].zone] = id;
    else save.equipped.screen = id;
    if (save.shop.goal === id) save.shop.goal = null;
  }
}

module.exports = {
  kindOf, itemOf, isCosmetic, purchasable, ensureShop, commitDiscount, priceFor, haggleFloor, canHaggle,
  mysteryPool, sellPrice, shopView, buyBundle, openMystery, haggle, sell, setGoal, grant,
};
