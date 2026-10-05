'use strict';
const { FOODS, ACCESSORIES, SCREENS, GAMES, ECONOMY, ITEMS, TRAITS, DECOR, CHALLENGE, DAY } = require('./catalog');
const { clamp, newPet } = require('./save');
const { bury } = require('./sim');
const { earn, resetDailyEcon } = require('./econ');
const quests = require('./quests');
const shop = require('./shop');
const expedition = require('./expedition');
const challenge = require('./challenge');
const { QUESTS } = require('./catalog');

const modsOf = p => (TRAITS[p.trait] || { mods: {} }).mods;

function verdictFor(id, score, game, name) {
  switch (id) {
    case 'leftright': return score >= 4 ? `${score}/5 - ${name} is thrilled!` : score >= 2 ? `${score}/5 - that was fun!` : `${score}/5 - better luck next time.`;
    case 'bugs': return `Squashed ${score} bug${score === 1 ? '' : 's'}!`;
    case 'dash': return score >= 25 ? `Shipped past ${score} bugs! 🚀` : `Dodged ${score} bug${score === 1 ? '' : 's'} before the crash.`;
    case 'stack': return `Stacked ${score} layer${score === 1 ? '' : 's'}!`;
    case 'simon': return score ? `The duck is impressed: ${score} steps!` : 'The duck looks disappointed.';
    case 'hotkeys': return `${score} token${score === 1 ? '' : 's'} in 30 seconds!`;
    case 'merge': return score === 5 ? 'All conflicts resolved. Ship it!' : `${score}/5 resolved. Check the diff next time.`;
    case 'snake': return score >= 20 ? `A ${score}-node list with no dangling pointers!` : `${score} node${score === 1 ? '' : 's'} before the segfault.`;
    case 'pipeline': return score >= 15 ? `${score} green gates. The pipeline loves you.` : `${score} gate${score === 1 ? '' : 's'}, then the build broke.`;
    case 'breakout': return score >= 52 ? 'Debt-free! The wall is gone.' : `Paid down ${score} block${score === 1 ? '' : 's'} of tech debt.`;
    case 'pong': return score >= 15 ? `A ${score}-hit rally! ${name} is exhausted.` : `${score} return${score === 1 ? '' : 's'}. Packet lost.`;
    case 'bisect': return score === 5 ? 'Every bad commit found in budget. Textbook bisect.' : `${score}/5 found within budget.`;
    case 'regex': return score === 8 ? 'Perfect match, every time.' : `${score}/8 matched.`;
    case 'bigo': return score === 6 ? 'Asymptotically perfect.' : `${score}/6 called correctly.`;
  }
  return `Scored ${score} ${game.unit}.`;
}

// Which actions are allowed in each blocking state.
const ALWAYS = new Set(['buy', 'equip', 'rename', 'pause', 'buyBundle', 'mystery', 'haggle', 'sell', 'setGoal', 'useItem', 'redeem']);
const WHEN_DEAD = new Set([...ALWAYS, 'newEgg']);
const WHEN_EGG = new Set([...ALWAYS, 'newEgg']);
const WHEN_PAUSED = new Set([...ALWAYS]);
const WHEN_ASLEEP = new Set([...ALWAYS, 'lights', 'newEgg']);
const WHEN_AWAY = new Set([...ALWAYS, 'recall', 'newEgg']);

/**
 * Apply a user action. Every input is untrusted (it can come from the webview) and is validated here.
 * @returns {{ok: boolean, message?: string, anim?: string, events?: any[]}}
 */
function applyAction(save, action, arg, { now, rand }) {
  const p = save.pet;
  const fail = message => ({ ok: false, message });

  if (save.paused && !WHEN_PAUSED.has(action)) return fail(`${p.name} is on vacation 🏖️ - resume to interact.`);
  if (p.dead && !WHEN_DEAD.has(action)) return fail(`${p.name} has passed on. Start a new egg to try again.`);
  if (save.expedition && !WHEN_AWAY.has(action)) return fail(`${p.name} is away on an expedition 🧭 - wait for them, or recall them.`);
  if (p.species === 'egg' && !WHEN_EGG.has(action)) return fail('The egg is still incubating… keep it company.');
  if (p.asleep && !WHEN_ASLEEP.has(action)) return fail(`Shh… ${p.name} is sleeping. Turn the lights on to wake them.`);

  switch (action) {
    case 'feed': return require('./food').eat(save, typeof arg === 'string' ? arg : 'meal', now, rand);

    case 'playResult': {
      const a = arg && typeof arg === 'object' ? arg : {};
      const game = GAMES[a.game];
      if (!game) return fail('Unknown game.');
      if (p.energy < 10) return fail(`${p.name} is too tired to play.`);
      const score = Math.max(0, Math.min(game.maxScore, Math.floor(Number(a.score) || 0)));
      resetDailyEcon(save, now);
      const r = game.reward;
      let coins = Math.floor(score / r.coinDiv);
      const happy = Math.min(r.happyMax, r.happyBase + r.happyPer * score);
      p.wins += Math.floor(score / r.winDiv);
      if (a.game === 'leftright' && score === 5) save.totals.perfectGames++;
      if (a.game === 'bugs') save.totals.bugsSquashed += score;
      if (a.game === 'merge' && score === 5) save.totals.mergePerfect++;
      if (a.game === 'bisect' && score === 5) save.totals.bisectPerfect++;
      if (a.game === 'regex' && score === 8) save.totals.regexPerfect++;
      if (a.game === 'bigo' && score === 6) save.totals.bigoPerfect++;
      const prevBest = save.best[a.game];
      const newBest = score > 0 && (prevBest === undefined || score > prevBest);
      save.best[a.game] = Math.max(prevBest || 0, score);
      const ch = challenge.record(save, a.game, score, now);
      if (ch.isChallenge) coins *= CHALLENGE.multiplier;
      coins = Math.max(0, Math.min(coins, ECONOMY.maxGameCoinsPerDay - (save.econ.gameCoins || 0)));
      save.econ.gameCoins = (save.econ.gameCoins || 0) + earn(save, coins, now);
      p.happy = clamp(p.happy + happy * (modsOf(p).gameHappy || 1));
      quests.bump(save, 'games', 1, now);
      p.energy = clamp(p.energy - 10);
      p.weight = Math.max(1, p.weight - 1);
      save.totals.games++;
      const events = [];
      if (newBest && prevBest !== undefined) events.push({ type: 'newBest', game: a.game, score });
      const verdict = verdictFor(a.game, score, game, p.name)
        + (newBest && prevBest !== undefined ? ' New best! 🏆' : '')
        + (ch.isChallenge ? ` Weekly Challenge ×${CHALLENGE.multiplier}${ch.newBest ? ', new weekly best' : ''}!` : '');
      return { ok: true, message: coins ? `${verdict} +${coins}🪙` : verdict, anim: newBest ? 'sparkle' : 'heart', events };
    }

    case 'clean':
      if (p.poops === 0) return fail('Already squeaky clean!');
      p.poops = 0;
      p.happy = clamp(p.happy + 3);
      save.totals.cleans++;
      quests.bump(save, 'cleans', 1, now);
      return { ok: true, message: 'All clean! ✨', anim: 'clean' };

    case 'medicine':
      if (!p.sick) {
        p.happy = clamp(p.happy - 5);
        return { ok: true, message: `${p.name} isn't sick and hated that.` };
      }
      p.sick = false;
      p.sickSince = null;
      p.health = clamp(p.health + 25);
      save.totals.cures++;
      return { ok: true, message: `${p.name} feels better!`, anim: 'medicine', events: [{ type: 'cured' }] };

    case 'lights':
      if (p.asleep) {
        p.asleep = false;
        const grumpy = p.energy < 60;
        if (grumpy) p.happy = clamp(p.happy - 5);
        return { ok: true, message: grumpy ? `${p.name} woke up grumpy.` : 'Good morning! ☀️' };
      }
      if (p.energy > 75) return fail(`${p.name} isn't sleepy yet.`);
      p.asleep = true;
      return { ok: true, message: 'Lights out. Sweet dreams… 🌙' };

    case 'buy': {
      const id = String(arg);
      const item = shop.itemOf(id);
      const price = shop.priceFor(save, id, now);
      if (!item || !price) return fail('That item isn\'t for sale.');
      const kind = shop.kindOf(id);
      if (shop.isCosmetic(id) && save.owned[id]) return fail(`You already own ${item.name}.`);
      if (kind === 'item' && (save.items[id] || 0) >= item.max) return fail(`You can hold at most ${item.max} ${item.name}${item.max === 1 ? '' : 's'}.`);
      if (save.coins < price.price) return fail(`${item.name} costs ${price.price}🪙, and you have ${save.coins}🪙.`);
      save.coins -= price.price;
      if (price.reason === 'deal') save.shop.used[id] = true;
      shop.grant(save, id);
      const saved = price.base - price.price;
      return { ok: true, message: `Bought ${item.name}!${kind === 'decor' ? ' It\'s in your room.' : ''}${saved ? ` Saved ${saved}🪙 (${price.reason === 'deal' ? 'daily deal' : price.reason === 'special' ? 'Chef\'s special' : 'Ship-It discount'}).` : ''}`, anim: kind === 'food' ? null : 'sparkle', shopkeeper: 'bought' };
    }

    case 'redeem': return require('./promo').redeem(save, typeof arg === 'string' ? arg : '', now);
    case 'buyBundle': return shop.buyBundle(save, String(arg), now);
    case 'mystery': return shop.openMystery(save, now, rand);
    case 'haggle': return shop.haggle(save, arg, now);
    case 'sell': return shop.sell(save, String(arg));
    case 'setGoal': return shop.setGoal(save, arg === null ? null : String(arg));

    case 'expedition': return expedition.start(save, typeof arg === 'string' ? arg : '', now);
    case 'recall': return expedition.recall(save);
    case 'duck': return require('./rewards').duck(save, arg && typeof arg === 'object' ? arg.chars : 0, now);

    case 'useItem': {
      const a = arg && typeof arg === 'object' ? arg : {};
      if (a.item === 'vitamins') {
        if (!(save.items.vitamins > 0)) return fail('You don\'t have any Vitamins. Buy some in the shop.');
        if (p.immuneUntil && p.immuneUntil > now) return fail(`${p.name} is already protected for ${Math.ceil((p.immuneUntil - now) / 3600000)}h.`);
        save.items.vitamins--;
        p.immuneUntil = now + DAY;
        return { ok: true, message: `${p.name} takes their vitamins. No getting sick for 24 hours. 💊`, anim: 'sparkle' };
      }
      if (a.item !== 'questReroll') return fail('That item can\'t be used like that.');
      if (!(save.items.questReroll > 0)) return fail('You don\'t have a Quest Reroll. Buy one in the shop.');
      quests.ensureQuests(save, now);
      const i = Math.floor(Number(a.index));
      const q = save.quests.list[i];
      if (!q) return fail('Pick one of today\'s quests to reroll.');
      if (q.done) return fail('That quest is already done.');
      const taken = new Set(save.quests.list.map(x => x.id));
      const options = Object.keys(QUESTS).filter(id => !taken.has(id));
      if (!options.length) return fail('No other quests available.');
      const id = options[Math.floor(rand() * options.length)];
      const targets = QUESTS[id].targets;
      save.quests.list[i] = { id, target: targets[Math.floor(rand() * targets.length)], done: false };
      save.items.questReroll--;
      return { ok: true, message: `New quest: ${quests.describeQuest(save.quests.list[i])} 📜`, anim: 'sparkle' };
    }

    case 'equip': {
      const id = String(arg);
      if (SCREENS[id]) {
        if (!save.owned[id]) return fail('You don\'t own that screen yet.');
        save.equipped.screen = id;
        return { ok: true };
      }
      if (DECOR[id]) {
        if (!save.owned[id]) return fail('You don\'t own that decoration yet.');
        const zone = DECOR[id].zone;
        const showing = save.room[zone] === id;
        save.room[zone] = showing ? null : id;
        return { ok: true, message: showing ? `${DECOR[id].name} put away.` : `${DECOR[id].name} is on display.` };
      }
      const acc = ACCESSORIES[id];
      if (!acc || !save.owned[id]) return fail('You don\'t own that yet.');
      save.equipped[acc.slot] = save.equipped[acc.slot] === id ? null : id;
      if (acc.slot === 'theme') return save.equipped.theme ? { ok: true, message: `Transformation complete: ${acc.name}. ✨`, anim: 'sparkle' } : { ok: true, message: 'Back to normal.' };
      return { ok: true };
    }

    case 'rename': {
      const name = typeof arg === 'string' ? arg.replace(/[\u0000-\u001f]/g, '').trim() : '';
      if (!name || name.length > 20) return fail('Names must be 1–20 characters.');
      p.name = name;
      return { ok: true, message: `Hello, ${name}!`, anim: 'heart' };
    }

    case 'newEgg': {
      if (!p.dead) {
        if (arg !== true) return fail(`${p.name} is still alive!`);
        p.causeOfDeath = 'rehomed';
        bury(save, now);
      }
      const fresh = newPet(p.generation + 1, now, rand);
      save.pet = fresh;
      save.expedition = null;
      save.dex.egg = save.dex.egg || now;
      return { ok: true, message: 'A new egg appeared! 🥚', events: [{ type: 'newEgg' }] };
    }

    case 'pause':
      save.paused = !save.paused;
      return { ok: true, message: save.paused ? `${p.name} is off on vacation 🏖️. Time is frozen.` : `${p.name} is back from vacation!` };
  }
  return fail('Unknown action.');
}

module.exports = { applyAction };
