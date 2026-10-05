'use strict';
const vscode = require('vscode');
const os = require('os');
const catalog = require('../core/catalog');
const { simulate } = require('../core/sim');
const { applyAction } = require('../core/actions');
const { recordActivity, checkAchievements, bugFree, taskResult, completeFocus, checkMilestones } = require('../core/rewards');
const { updateQuests } = require('../core/quests');
const { snapshot } = require('../core/derive');
const { weekKey } = require('../core/save');
const expedition = require('../core/expedition');
const journal = require('../core/journal');
const { StatusBar, ALERT_TEXT } = require('./statusBar');
const { ActivityTracker } = require('./activity');
const { FocusSession } = require('./focus');
const { TeamSync } = require('./team');

const { MIN, SPECIES, QUESTS, EXPEDITIONS, ARTEFACTS, FOODS } = catalog;
const { tierInfo } = require('../core/achievements');
const NAG_INTERVAL = 30 * MIN;
const BUG_FREE_COOLDOWN = 10 * MIN;
const TASK_COOLDOWN = 60 * 1000;
const TEAM_REFRESH = 60 * 1000;

// Events that always deserve a notification (subject to the notifications setting).
const IMPORTANT = new Set(['hatched', 'evolved', 'sick', 'passedOut', 'died', 'achievement', 'questsAllDone', 'milestone', 'shiny', 'shieldUsed', 'focusDone', 'breakDone', 'expeditionDone']);
// Events notified only at the "all" level.
const CHATTY = new Set(['quest', 'checkIn']);

function readConfig() {
  const c = vscode.workspace.getConfiguration('idlepal');
  const n = c.get('notifications', 'all');
  const notifications = ['all', 'important', 'off'].includes(n) ? n : 'all';
  const clampNum = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number(v) || d));
  return {
    speed: clampNum(c.get('speed'), 0.1, 10, 1),
    notifications,
    statusBar: c.get('statusBar', 'full'),
    codingRewards: c.get('codingRewards', true),
    git: c.get('integrations.git', true),
    diagnostics: c.get('integrations.diagnostics', true),
    tasks: c.get('integrations.tasks', true),
    breakMinutes: clampNum(c.get('breakReminderMinutes', 90), 0, 480, 90),
    focusWork: clampNum(c.get('focus.workMinutes', 25), 5, 120, 25),
    focusBreak: clampNum(c.get('focus.breakMinutes', 5), 1, 60, 5),
    teamShare: c.get('team.share', false) === true,
    teamName: String(c.get('team.displayName', '') || '').trim() || safeUserName(),
    weeklyRecap: c.get('weeklyRecap', true) !== false,
    sound: c.get('sound', false),
    sync: c.get('syncAcrossMachines', true),
  };
}

function safeUserName() {
  try { return os.userInfo().username || 'dev'; } catch { return 'dev'; }
}

class Controller {
  constructor(store, log, deps = {}) {
    this.store = store;
    this.log = log;
    this.id = `${process.pid}-${Math.random().toString(36).slice(2)}`;
    this.views = new Set(); // { webview, isVisible(): boolean, setBadge?(n, tooltip) }
    this.status = new StatusBar();
    this.activity = new ActivityTracker();
    this.focus = deps.focus || new FocusSession({ onEvent: e => this.onFocusEvent(e) });
    this.team = deps.team || new TeamSync(log);
    this.config = readConfig();
    this.errors = 0;
    this.errorPeak = 0;
    this.lastBugFree = 0;
    this.lastTask = 0;
    this.lastNag = 0;
    this.lastTeamRefresh = 0;
    this.leader = false;
    this.flushTimer = undefined;
  }

  now() { return Date.now(); }
  ctx() { return { now: this.now(), rand: Math.random }; }

  reloadConfig() {
    const before = this.config;
    this.config = readConfig();
    const nameChanged = before.teamName !== this.config.teamName;
    if (before.teamShare && (!this.config.teamShare || nameChanged)) this.team.unpublish(before.teamName, this.teamTag());
    this.lastTeamRefresh = 0;
    this.tick();
  }

  anyViewVisible() { return [...this.views].some(v => v.isVisible()); }

  /** Main loop: advance the simulation (leader only), flush activity, settle quests/achievements, render. */
  tick() {
    try {
      const now = this.now();
      this.leader = this.store.claimLeadership(this.id, now);
      const save = this.store.load(now, Math.random);
      const events = [];
      let dirty = false;

      if (this.leader) {
        events.push(...simulate(save, now - save.lastUpdate, { now, rand: Math.random, speed: this.config.speed }));
        save.lastUpdate = now;
        events.push(...checkMilestones(save, now));
        events.push(...expedition.settle(save, now, Math.random));
        dirty = true;
      }

      const a = this.activity.take();
      if (a.chars || a.codingMs || a.saves || a.commits) {
        events.push(...recordActivity(save, a, now, { codingRewards: this.config.codingRewards }));
        dirty = true;
      }

      if (this.config.teamShare && !save.team.shared) { save.team.shared = true; dirty = true; }
      events.push(...updateQuests(save, now));
      events.push(...checkAchievements(save, now));
      if (this.leader) events.push(...this.weeklyRecapDue(save, now));
      if (journal.record(save, events, now)) dirty = true;
      if (dirty || events.length) this.store.write(save);
      this.present(save, { events });
      this.syncTeam(save, now);

      if (this.leader && !events.some(e => IMPORTANT.has(e.type))) this.nag(save, now);
      if (!this.focus.active && this.activity.shouldRemindBreak(now, this.config.breakMinutes)) this.remindBreak(save, now);
    } catch (err) {
      this.log.error('Tick failed', err);
    }
  }

  /** Run a tick soon, to react quickly to activity like commits without writing on every keystroke. */
  flushSoon() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.tick(), 400);
  }

  /** Apply a mutation to the latest save, then persist and render. */
  mutate(fn) {
    this.tick();
    const now = this.now();
    const save = this.store.load(now, Math.random);
    const result = fn(save, now) || { ok: true };
    const events = [...(result.events || []), ...updateQuests(save, now), ...checkAchievements(save, now)];
    journal.record(save, events, now);
    if (result.ok !== false || events.length) this.store.write(save);
    this.present(save, { message: result.message, anim: result.anim, events, sound: result.ok === false ? 'nope' : result.anim ? 'happy' : 'blip', shopkeeper: result.shopkeeper || (result.ok === false && /costs|can't cover/.test(result.message || '') ? 'broke' : null), reveal: result.reveal || null });
    return result;
  }

  dispatch(action, arg) {
    this.log.debug('action', action);
    return this.mutate(save => applyAction(save, action, arg, this.ctx()));
  }

  // ----- weekly recap -----

  weeklyRecapDue(save, now) {
    const wk = weekKey(now);
    if (save.recap.lastWeek === wk) return [];
    const firstWeek = weekKey(save.createdAt) === wk;
    save.recap.lastWeek = wk;
    if (!this.config.weeklyRecap || firstWeek) return [];
    const recap = snapshot(save, now).view.recap;
    if (!recap.activeDays) return [];
    return [{ type: 'recapReady', recap }];
  }

  // ----- focus -----

  focusStart() {
    if (this.focus.active) return;
    this.focus.start(this.config.focusWork * MIN, this.config.focusBreak * MIN, this.now());
  }

  focusStop() { if (this.focus.active) this.focus.stop(this.now()); }
  focusToggle() { if (this.focus.active) this.focusStop(); else this.focusStart(); }

  onFocusEvent(e) {
    switch (e.type) {
      case 'workDone':
        this.mutate((save, now) => ({ ok: true, events: [completeFocus(save, e.minutes, now)], anim: 'heart' }));
        return;
      case 'breakDone':
        this.tick();
        this.notify('Break\'s over. Another round? 🍅', 'important', ['Start focus', 'Not now']).then(c => { if (c === 'Start focus') this.focusStart(); });
        return;
      case 'focusStarted':
        this.say(`Focus mode: ${e.minutes} minutes. I'll keep quiet 🤫`);
        this.tick();
        return;
      case 'focusStopped':
        this.say(e.phase === 'work' ? 'Focus session stopped.' : 'Back to it!');
        this.tick();
        return;
    }
  }

  // ----- team -----

  /** A short, stable per-save tag that keeps two "alex"es on one team from overwriting each other's card. */
  teamTag(save) { return TeamSync.tagFor(save || this.store.load(this.now(), Math.random)); }

  syncTeam(save, now) {
    const t = this.team;
    if (!t.hasWorkspace) return;
    if (this.config.teamShare && vscode.workspace.isTrusted !== false) {
      const snap = snapshot(save, now, { errors: this.errors, focus: this.focus.state });
      t.publish(TeamSync.cardFrom(snap, this.config.teamName), this.config.teamName, now, false, this.teamTag(save)).then(wrote => {
        if (wrote) this.log.debug('Published team card');
      });
    }
    if (now - this.lastTeamRefresh >= TEAM_REFRESH) {
      this.lastTeamRefresh = now;
      this.refreshTeam();
    }
  }

  refreshTeam() {
    const before = JSON.stringify(this.team.members);
    this.team.refresh(this.config.teamName, this.teamTag()).then(members => {
      if (JSON.stringify(members) !== before) this.present(this.store.load(this.now(), Math.random), {});
    }).catch(err => this.log.warn('Team refresh failed', err));
  }

  async toggleTeamShare() {
    const cfg = vscode.workspace.getConfiguration('idlepal');
    const on = !cfg.get('team.share', false);
    if (on && !this.team.hasWorkspace) {
      vscode.window.showInformationMessage('Open a folder or repo first. Team pets live in a .idlepal/ folder inside it.');
      return;
    }
    if (on && vscode.workspace.isTrusted === false) {
      vscode.window.showInformationMessage('Team sharing writes into the workspace, so it needs a trusted workspace.');
      return;
    }
    await cfg.update('team.share', on, vscode.ConfigurationTarget.Global);
    this.reloadConfig();
    if (on) {
      const save = this.store.load(this.now(), Math.random);
      await this.team.publish(TeamSync.cardFrom(snapshot(save, this.now()), this.config.teamName), this.config.teamName, this.now(), true, this.teamTag(save));
      vscode.window.showInformationMessage(`Your pet now lives in .idlepal/ in this repo. Commit the folder and teammates will see ${save.pet.name}.`, 'Show Team').then(c => {
        if (c) vscode.commands.executeCommand('idlepal.show');
      });
    } else {
      vscode.window.showInformationMessage('Stopped sharing. Your card was removed from .idlepal/.');
    }
  }

  teamView() {
    return {
      members: this.team.members,
      sharing: this.config.teamShare,
      displayName: this.config.teamName,
      hasWorkspace: this.team.hasWorkspace,
    };
  }

  // ----- promo codes -----

  /** Redeem a code, with a small attempt limit so the box can't be hammered. */
  redeemCode(code) {
    const now = this.now();
    this.promoAttempts = (this.promoAttempts || []).filter(t => now - t < 10 * MIN);
    if (this.promoAttempts.length >= 5) {
      const msg = 'Too many attempts. Try again in a few minutes.';
      vscode.window.showWarningMessage(msg);
      return { ok: false, message: msg };
    }
    this.promoAttempts.push(now);
    const r = this.dispatch('redeem', String(code || '').slice(0, 64));
    if (r.ok) {
      this.promoAttempts = [];
      vscode.window.showInformationMessage(r.message, 'Equip it').then(c => { if (c) this.dispatch('equip', r.unlock); });
    } else {
      vscode.window.showWarningMessage(r.message);
    }
    return r;
  }

  // ----- activity hooks -----

  onEdit(chars, lang) { this.activity.edit(chars, this.now(), lang); }
  onSave(lang, isTest = false) { this.activity.save(this.now(), lang, isTest); }
  onCommit() {
    this.activity.commit();
    this.flushSoon();
  }

  onErrors(count) {
    this.errors = count;
    this.errorPeak = Math.max(this.errorPeak, count);
    const now = this.now();
    if (count === 0 && this.errorPeak >= 3 && now - this.lastBugFree > BUG_FREE_COOLDOWN) {
      this.errorPeak = 0;
      this.lastBugFree = now;
      this.mutate((save, t) => ({ ok: true, events: [bugFree(save, t)], anim: 'heart' }));
    } else if (count === 0) {
      this.errorPeak = 0;
    }
  }

  onTask(ok) {
    const now = this.now();
    if (now - this.lastTask < TASK_COOLDOWN) return;
    this.lastTask = now;
    this.mutate((save, t) => ({ ok: true, events: [taskResult(save, ok, t)], anim: ok ? 'heart' : null }));
  }

  onDebugStart() {
    if (this.focus.active) return;
    const lines = ['Bug hunting time! 🔍', 'Breakpoints armed 🎯', 'I\'ll watch the variables 👀'];
    this.say(lines[Math.floor(Math.random() * lines.length)]);
  }

  // ----- rendering -----

  describe(e, save) {
    const p = save.pet;
    switch (e.type) {
      case 'hatched': return { text: `Your egg hatched! Meet ${p.name}${p.shiny ? ', a SHINY ' : ' the '}${SPECIES[p.species].name} 🐣`, anim: 'sparkle', sound: 'fanfare' };
      case 'shiny': return null; // folded into the hatch message
      case 'evolved': return { text: `${p.name} evolved into a ${SPECIES[e.species].name}! ✨`, anim: 'sparkle', sound: 'fanfare' };
      case 'sick': return { text: `${p.name} got sick 🤒 - give them medicine.`, sound: 'alert' };
      case 'passedOut': return { text: `${p.name} collapsed from exhaustion 😵`, sound: 'alert' };
      case 'died': return { text: `${p.name} has passed away 🪦`, sound: 'sad' };
      case 'woke': return { text: 'Good morning! ☀️' };
      case 'achievement': {
        const a = tierInfo(e.id);
        if (!a) return null;
        return { text: `${a.icon} ${a.tier > 0 ? 'Tier up' : 'Achievement unlocked'}: ${a.name}, ${a.desc.charAt(0).toLowerCase() + a.desc.slice(1)} (+${a.reward}🪙)`, anim: 'sparkle', sound: 'fanfare' };
      }
      case 'checkIn': return { text: e.streak > 1 ? `🔥 ${e.streak}-day streak! +${e.coins}🪙` : `Welcome back! +${e.coins}🪙`, sound: 'coin' };
      case 'shieldUsed': return { text: `🛡️ A Streak Shield saved your ${e.streak}-day streak!`, anim: 'sparkle', sound: 'coin' };
      case 'commit': return { text: e.coins ? `Ship it! 🚢 +${e.coins}🪙` : 'Ship it! 🚢', anim: 'heart', sound: 'coin' };
      case 'bugFree': return { text: `No more errors! ✅ +${e.coins}🪙`, anim: 'heart', sound: 'coin' };
      case 'taskPassed': return { text: 'Build passed! 🎉', anim: 'heart', sound: 'coin' };
      case 'taskFailed': return { text: 'Oh no, it failed 😿 You\'ve got this.', sound: 'sad' };
      case 'newEgg': return { text: 'A new egg appeared! 🥚', sound: 'blip' };
      case 'quest': return { text: `📜 Quest complete: ${QUESTS[e.id].name} +${e.coins}🪙`, anim: 'heart', sound: 'coin' };
      case 'questsAllDone': return { text: `🗺️ All quests done! Bonus +${e.coins}🪙`, anim: 'sparkle', sound: 'fanfare' };
      case 'focusDone': return { text: `Focus complete! +${e.coins}🪙${e.boosted ? ' (boosted ×2)' : ''} Time for a break ☕`, anim: 'heart', sound: 'fanfare' };
      case 'milestone': return { text: `🎂 ${p.name} is ${e.days} days old! A cake and +${e.coins}🪙`, anim: 'sparkle', sound: 'fanfare' };
      case 'caffeineCrash': return { text: `${p.name} crashed from the caffeine 😵 Energy dropped.`, sound: 'sad' };
      case 'balancedDiet': return { text: `🥗 Balanced diet! ${p.name} ate from every food group today. +health, +happy`, anim: 'sparkle', sound: 'fanfare' };
      case 'recapReady': return { text: `Your week with ${p.name} is ready 📊` };
      case 'expeditionDone': {
        const where = EXPEDITIONS[e.dest] ? EXPEDITIONS[e.dest].name : 'the expedition';
        const food = FOODS[e.food] ? FOODS[e.food].name : 'a snack';
        const art = e.artefact && ARTEFACTS[e.artefact] ? ` and found the ${ARTEFACTS[e.artefact].name}!` : '.';
        return { text: `${p.name} is back from ${where} with +${e.coins}🪙 and ${food}${art} 🧭`, anim: e.artefact ? 'sparkle' : 'heart', sound: e.artefact ? 'fanfare' : 'coin' };
      }
      // These ride along with an action that already has its own message.
      case 'expeditionStart': case 'cured': case 'favourite': case 'dislike': case 'newBest': case 'duck': return null;
    }
    return null;
  }

  present(save, { message, anim, events = [], sound, shopkeeper = null, reveal = null } = {}) {
    const snap = snapshot(save, this.now(), { errors: this.errors, focus: this.focus.state, team: this.teamView() });
    const described = events.map(e => ({ e, d: this.describe(e, save) })).filter(x => x.d);
    const last = described[described.length - 1];
    const text = message || (last && last.d.text) || null;
    const post = {
      type: 'state',
      state: snap,
      message: text,
      anim: anim || (last && last.d.anim) || null,
      sound: (last && last.d.sound) || sound || null,
      shopkeeper,
      reveal,
    };
    const alerts = snap.view.alerts;
    for (const v of this.views) {
      v.webview.postMessage(post);
      if (v.setBadge) v.setBadge(alerts.length, alerts.length ? `${save.pet.name} ${alerts.map(a => ALERT_TEXT[a]).join(' and ')}` : '');
    }
    this.status.update(snap, this.config.statusBar);
    if (text && !this.anyViewVisible() && !described.some(x => IMPORTANT.has(x.e.type))) {
      vscode.window.setStatusBarMessage(`${save.pet.name}: ${text}`, 4000);
    }
    for (const { e, d } of described) {
      if (e.type === 'recapReady') {
        this.notify(d.text, 'important', ['Show recap']).then(c => { if (c) vscode.commands.executeCommand('idlepal.showRecap'); });
      } else if (!this.anyViewVisible() && IMPORTANT.has(e.type)) {
        this.notify(d.text, 'important');
      } else if (!this.anyViewVisible() && CHATTY.has(e.type)) {
        this.notify(d.text, 'all');
      }
    }
  }

  say(text) {
    for (const v of this.views) v.webview.postMessage({ type: 'say', text });
    if (!this.anyViewVisible()) vscode.window.setStatusBarMessage(text, 4000);
  }

  // ----- notifications -----

  notify(text, level, actions = ['Show Pet']) {
    const n = this.config.notifications;
    if (n === 'off' || (n === 'important' && level !== 'important')) return Promise.resolve(undefined);
    // Quiet during focus, except for the focus session's own messages.
    if (this.focus.active && this.focus.state.phase === 'work' && !/Focus|Break/.test(text)) return Promise.resolve(undefined);
    return vscode.window.showInformationMessage(text, ...actions).then(choice => {
      if (choice === 'Show Pet') vscode.commands.executeCommand('idlepal.show');
      return choice;
    });
  }

  nag(save, now) {
    if (now - this.lastNag < NAG_INTERVAL || this.anyViewVisible() || this.focus.active) return;
    const alerts = snapshot(save, now).view.alerts;
    if (!alerts.length) return;
    this.lastNag = now;
    this.notify(`${save.pet.name} ${alerts.map(a => ALERT_TEXT[a]).join(' and ')}!`, 'all');
  }

  remindBreak(save, now) {
    this.activity.breakReminded = true;
    const mins = Math.round(this.activity.sessionMs(now) / MIN);
    const name = save.pet.dead ? 'Your pet' : save.pet.name;
    vscode.window
      .showInformationMessage(`${name} thinks you've earned a break: you've been coding for ${mins} minutes. Stretch, hydrate, look out a window 🧘`, 'Taking one', 'Snooze 15m')
      .then(c => {
        if (c === 'Snooze 15m') this.activity.snoozeBreak(this.now(), 15 * MIN);
        if (c === 'Taking one') this.say('Enjoy your break! 🌿');
      });
  }

  dispose() {
    clearTimeout(this.flushTimer);
    this.status.dispose();
    this.focus.dispose();
    this.team.dispose();
    this.store.releaseLeadership(this.id);
  }
}

module.exports = { Controller, readConfig };
