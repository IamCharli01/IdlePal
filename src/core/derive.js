'use strict';
const { MIN, HOUR, DAY, STAGES, SPECIES, TRAITS, MILESTONES } = require('./catalog');
const { dayKey, weekKey, stageFor, emptyDay } = require('./save');
const { questView } = require('./quests');
const { achievementView, TOTAL_TIERS } = require('./achievements');
const { shopView } = require('./shop');
const { foodView } = require('./food');
const expedition = require('./expedition');
const journal = require('./journal');
const challenge = require('./challenge');

function moodOf(save, errors = 0, focus = null) {
  const p = save.pet;
  if (p.dead) return 'dead';
  if (save.paused) return 'vacation';
  if (p.species === 'egg') return 'egg';
  if (save.expedition) return 'away';
  if (p.asleep) return 'asleep';
  if (p.sick) return 'sick';
  if (p.hunger < 20 || p.happy < 20 || p.health < 30) return 'sad';
  if (focus && focus.phase === 'work') return 'focused';
  if (errors >= 10) return 'worried';
  if (p.happy > 70 && p.hunger > 50) return 'happy';
  return 'ok';
}

function alertsOf(save) {
  const p = save.pet;
  if (p.dead || save.paused || p.species === 'egg' || save.expedition) return [];
  const a = [];
  if (p.hunger < 25) a.push('hungry');
  if (p.happy < 25) a.push('bored');
  if (p.poops > 0) a.push('dirty');
  if (p.sick) a.push('sick');
  if (!p.asleep && p.energy < 15) a.push('tired');
  return a;
}

function formatDuration(ms) {
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function dayAt(now, offset) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

/** Top languages as [{id, ms, share}] from a languageId -> ms map. */
function topLanguages(map, limit = 5) {
  const entries = Object.entries(map || {}).filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, ms]) => s + ms, 0) || 1;
  return entries.slice(0, limit).map(([id, ms]) => ({ id, ms, share: ms / total }));
}

/** Totals for the last 7 full days before today (Mon–Sun when shown on a Monday). */
function weeklyRecap(save, now) {
  const days = [];
  for (let i = 7; i >= 1; i--) {
    const t = dayAt(now, -i);
    days.push({ day: dayKey(t), ...(save.history[dayKey(t)] || emptyDay()) });
  }
  const sum = k => days.reduce((s, d) => s + (d[k] || 0), 0);
  const langs = {};
  for (const d of days) for (const [l, ms] of Object.entries(d.langs || {})) langs[l] = (langs[l] || 0) + ms;
  const best = days.reduce((b, d) => (d.codingMs > (b ? b.codingMs : -1) ? d : b), null);
  return {
    from: days[0].day,
    to: days[days.length - 1].day,
    codingMs: sum('codingMs'),
    chars: sum('chars'),
    commits: sum('commits'),
    coins: sum('coins'),
    activeDays: days.filter(d => d.codingMs > 0 || d.chars > 0).length,
    bestDay: best && best.codingMs ? { day: best.day, codingMs: best.codingMs } : null,
    topLanguages: topLanguages(langs, 3),
    streak: save.streak.current,
    pet: { name: save.pet.name, species: SPECIES[save.pet.species].name },
  };
}

/** Everything the UI needs, computed in one place. */
function snapshot(save, now, extra = {}) {
  const p = save.pet;
  const stage = stageFor(p.ageMs);
  const idx = STAGES.indexOf(stage);
  const next = STAGES[idx + 1];
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const t = dayAt(now, -i);
    const k = dayKey(t);
    const h = save.history[k] || emptyDay();
    week.push({ day: k, label: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }), ...h });
  }
  const errors = extra.errors || 0;
  const focus = extra.focus || null;
  const trait = TRAITS[p.trait] || null;
  const daysOld = Math.floor((now - p.bornAt) / DAY);
  const nextMilestone = Object.keys(MILESTONES).map(Number).find(d => d > daysOld);
  return {
    ...save,
    view: {
      stage: stage.id,
      stageLabel: stage.label,
      speciesName: SPECIES[p.species].name,
      speciesBlurb: SPECIES[p.species].blurb,
      trait: trait ? { id: p.trait, name: trait.name, desc: trait.desc } : null,
      ageText: formatDuration(p.ageMs),
      daysOld,
      nextMilestone: nextMilestone ? { days: nextMilestone, inDays: nextMilestone - daysOld } : null,
      nextStageIn: next && !p.dead ? formatDuration(stage.until - p.ageMs) : null,
      nextStageLabel: next ? next.label : null,
      eggProgress: stage.id === 'egg' ? p.ageMs / stage.until : 1,
      mood: moodOf(save, errors, focus),
      alerts: alertsOf(save),
      care: Math.max(0, 5 - Math.floor(p.mistakes / 2)), // 0–5 stars
      today: week[6],
      week,
      errors,
      focus,
      quests: questView(save),
      achievements: achievementView(save),
      shop: shopView(save, now),
      food: foodView(save, now),
      achievementTiers: { unlocked: Object.keys(save.achievements).length, total: TOTAL_TIERS },
      codingToday: formatDuration(week[6].codingMs),
      codingTotal: formatDuration(save.totals.codingMs),
      focusTotal: formatDuration(save.totals.focusMs),
      languagesToday: topLanguages(week[6].langs, 5),
      languagesAll: topLanguages(save.langs, 6),
      recap: weeklyRecap(save, now),
      weekKey: weekKey(now),
      team: extra.team || null,
      expedition: expedition.view(save, now),
      journal: journal.view(save),
      challenge: challenge.view(save, now),
      immuneLeftMs: p.immuneUntil && p.immuneUntil > now ? p.immuneUntil - now : 0,
    },
  };
}

module.exports = { moodOf, alertsOf, formatDuration, snapshot, weeklyRecap, topLanguages, HOUR };
