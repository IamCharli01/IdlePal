'use strict';
// The pet's diary. Notable events become short first-person entries, and the first tick of each
// day adds a line about yesterday. Pure: the host passes in the events it already computed.
const { DAY, MIN, SPECIES, FOODS, GAMES, QUESTS, EXPEDITIONS, ARTEFACTS } = require('./catalog');
const { dayKey, MAX_JOURNAL } = require('./save');
const { tierInfo } = require('./achievements');

function fmt(ms) {
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function note(save, text, now, icon = 'star') {
  save.journal.entries.push({ t: now, icon, text: String(text).slice(0, 200) });
  if (save.journal.entries.length > MAX_JOURNAL) save.journal.entries.splice(0, save.journal.entries.length - MAX_JOURNAL);
}

/** One diary line for an event, or null for the ones not worth writing down. */
function lineFor(e, save) {
  const p = save.pet;
  const sp = id => (SPECIES[id] ? SPECIES[id].name : id);
  switch (e.type) {
    case 'hatched': return ['chick', `I hatched! I'm ${p.name} the ${sp(p.species)}${p.shiny ? ', and I\'m shiny' : ''}.`];
    case 'evolved': return ['sparkle', `I grew up a bit: I'm a ${sp(e.species)} now.`];
    case 'died': return ['grave', `${p.name} passed away from ${p.causeOfDeath}. Thank you for everything.`];
    case 'newEgg': return ['egg', `A new egg. Generation ${p.generation}. Something is wiggling.`];
    case 'achievement': { const a = tierInfo(e.id); return a ? ['trophy', `Achievement: ${a.name}. ${a.desc}.`] : null; }
    case 'questsAllDone': return ['scroll', 'We cleared every quest today. Bonus coins!'];
    case 'milestone': return ['cake', `I'm ${e.days} days old today. There was cake.`];
    case 'shieldUsed': return ['shield', `A Streak Shield saved our ${e.streak}-day streak.`];
    case 'checkIn': return e.streak > 1 && e.streak % 7 === 0 ? ['flame', `${e.streak} days in a row. We're on a roll.`] : null;
    case 'balancedDiet': return ['salad', 'I ate from every food group today. Very balanced. Very smug.'];
    case 'sick': return ['health', 'I got sick today. Not my best day.'];
    case 'cured': return ['pill', 'Medicine! Feeling better already.'];
    case 'favourite': return ['heart', `Discovered my favourite food: ${FOODS[e.food] ? FOODS[e.food].name : e.food}. Please take note.`];
    case 'dislike': return ['x', `Tried ${FOODS[e.food] ? FOODS[e.food].name : e.food}. Never again.`];
    case 'newBest': return ['trophy', `New personal best in ${GAMES[e.game] ? GAMES[e.game].name : e.game}: ${e.score}.`];
    case 'expeditionStart': return ['map', `Set off for ${EXPEDITIONS[e.dest] ? EXPEDITIONS[e.dest].name : e.dest}. Wish me luck.`];
    case 'expeditionDone': {
      const where = EXPEDITIONS[e.dest] ? EXPEDITIONS[e.dest].name : e.dest;
      const food = FOODS[e.food] ? FOODS[e.food].name.toLowerCase() : 'a snack';
      const art = e.artefact && ARTEFACTS[e.artefact] ? ` And I found the ${ARTEFACTS[e.artefact].name}!` : '';
      return ['map', `Back from ${where} with ${e.coins} coins and ${/^[aeiou]/i.test(food) ? 'an' : 'a'} ${food}.${art}`];
    }
    case 'duck': return ['duck', 'You explained a bug to me. I nodded in all the right places.'];
    case 'quest': return QUESTS[e.id] ? null : null;
    case 'shiny': return null;
  }
  return null;
}

/**
 * Write diary lines for this tick's events, plus a summary of yesterday the first time we see a new day.
 * @returns {boolean} whether anything was written
 */
function record(save, events, now) {
  let wrote = false;
  const day = dayKey(now);
  if (save.journal.lastDay !== day) {
    const had = save.journal.lastDay !== null;
    save.journal.lastDay = day;
    const y = save.history[dayKey(now - DAY)];
    if (had && y && (y.codingMs > 0 || y.commits > 0)) {
      const top = Object.entries(y.langs || {}).sort((a, b) => b[1] - a[1])[0];
      note(save, `Yesterday you coded for ${fmt(y.codingMs)}${y.commits ? ` and shipped ${y.commits} commit${y.commits === 1 ? '' : 's'}` : ''}${top ? `, mostly ${top[0]}` : ''}. I watched the whole time.`, now - 1, 'keyboard');
      wrote = true;
    }
  }
  for (const e of events || []) {
    const line = lineFor(e, save);
    if (line) { note(save, line[1], now, line[0]); wrote = true; }
  }
  return wrote;
}

/** Entries grouped by day, newest day first, newest entry first within a day. */
function view(save) {
  const groups = [];
  for (const en of save.journal.entries.slice().reverse()) {
    const day = dayKey(en.t);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) { g = { day, entries: [] }; groups.push(g); }
    g.entries.push(en);
  }
  return groups;
}

module.exports = { note, lineFor, record, view };
