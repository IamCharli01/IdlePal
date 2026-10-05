'use strict';
const vscode = require('vscode');

const MOOD_EMOJI = { dead: '🪦', vacation: '🏖️', egg: '🥚', asleep: '😴', sick: '🤒', sad: '😢', worried: '😰', happy: '😄', ok: '🙂', focused: '🍅', away: '🧭' };
const ALERT_EMOJI = { hungry: '🍙', bored: '💔', dirty: '💩', sick: '💊', tired: '💤' };
const ALERT_TEXT = { hungry: 'is hungry', bored: 'is bored', dirty: 'made a mess', sick: 'is sick', tired: 'is exhausted' };

class StatusBar {
  constructor() {
    this.item = vscode.window.createStatusBarItem('idlepal.status', vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'IdlePal';
    this.item.command = 'idlepal.show';
  }

  update(snap, mode) {
    if (mode === 'hidden') { this.item.hide(); return; }
    const v = snap.view;
    const p = snap.pet;
    const alerts = v.alerts.map(a => ALERT_EMOJI[a]).join('');
    this.item.text = mode === 'compact'
      ? `${MOOD_EMOJI[v.mood]}${alerts}`
      : `${MOOD_EMOJI[v.mood]} ${p.name}${alerts ? ' ' + alerts : ''}`;
    this.item.accessibilityInformation = {
      label: `IdlePal: ${p.name} is ${v.mood}${v.alerts.length ? ', ' + v.alerts.map(a => ALERT_TEXT[a]).join(', ') : ''}`,
    };

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ['idlepal.feed', 'idlepal.play', 'idlepal.clean', 'idlepal.medicine', 'idlepal.lights', 'idlepal.show', 'idlepal.newPet', 'idlepal.togglePause'] };
    const bar = n => '▰'.repeat(Math.round(n / 10)) + '▱'.repeat(10 - Math.round(n / 10));
    if (p.dead) {
      md.appendMarkdown(`**${p.name}** passed away from ${p.causeOfDeath} at ${v.ageText} old.\n\n[$(add) New egg](command:idlepal.newPet)`);
    } else if (snap.paused) {
      md.appendMarkdown(`**${p.name}** is on vacation 🏖️. Time is frozen.\n\n[$(debug-start) Resume](command:idlepal.togglePause)`);
    } else if (v.stage === 'egg') {
      md.appendMarkdown(`**An egg**, hatching soon (${Math.round(v.eggProgress * 100)}%)`);
    } else if (v.expedition && v.expedition.active) {
      const x = v.expedition.active;
      md.appendMarkdown(`**${p.name}** is exploring **${x.name}** 🧭. Back in about ${Math.max(1, Math.ceil(x.leftMs / 60000))} min.\n\n[$(eye) Show pet](command:idlepal.show)`);
    } else {
      md.appendMarkdown(`**${p.name}** the ${v.speciesName} · ${v.stageLabel} · ${v.ageText}${p.asleep ? ' · 💤' : ''}\n\n`);
      md.appendMarkdown(`\`Hunger ${bar(p.hunger)}\`  \n\`Happy  ${bar(p.happy)}\`  \n\`Energy ${bar(p.energy)}\`  \n\`Health ${bar(p.health)}\`\n\n`);
      if (v.alerts.length) md.appendMarkdown(v.alerts.map(a => `${ALERT_EMOJI[a]} ${p.name} ${ALERT_TEXT[a]}`).join('  \n') + '\n\n');
      md.appendMarkdown(`🪙 ${snap.coins} · 🔥 ${snap.streak.current}-day streak · ⌨️ ${v.codingToday} today\n\n`);
      md.appendMarkdown('[🍙 Feed](command:idlepal.feed) · [🎾 Play](command:idlepal.play) · [🧽 Clean](command:idlepal.clean) · [💊 Medicine](command:idlepal.medicine) · [💡 Lights](command:idlepal.lights)');
    }
    this.item.tooltip = md;
    const urgent = p.dead || p.sick || p.hunger < 15 || p.health < 30;
    this.item.backgroundColor = urgent && !snap.paused ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.item.show();
  }

  dispose() { this.item.dispose(); }
}

module.exports = { StatusBar, ALERT_TEXT };
