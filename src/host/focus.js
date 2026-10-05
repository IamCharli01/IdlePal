'use strict';
const vscode = require('vscode');
const { MIN } = require('../core/catalog');

/**
 * A Pomodoro-style focus timer: a work block, then a break. Pure timing lives in `tick(now)` so
 * it can be tested without real timers; the status bar item is the UI.
 */
class FocusSession {
  /**
   * @param {{ onEvent: (e: {type: string, minutes?: number}) => void, statusBar?: boolean }} opts
   */
  constructor(opts) {
    this.onEvent = opts.onEvent;
    /** @type {null | {phase: 'work'|'break', startedAt: number, endsAt: number, total: number}} */
    this.state = null;
    this.item = opts.statusBar === false ? null : vscode.window.createStatusBarItem('idlepal.focus', vscode.StatusBarAlignment.Right, 101);
    if (this.item) {
      this.item.name = 'IdlePal Focus';
      this.item.command = 'idlepal.focusToggle';
    }
    this.timer = undefined;
  }

  get active() { return this.state !== null; }

  start(workMs, breakMs, now = Date.now()) {
    this.workMs = workMs;
    this.breakMs = breakMs;
    this.state = { phase: 'work', startedAt: now, endsAt: now + workMs, total: workMs };
    this.arm();
    this.render(now);
    this.onEvent({ type: 'focusStarted', minutes: Math.round(workMs / MIN) });
  }

  startBreak(now = Date.now()) {
    this.state = { phase: 'break', startedAt: now, endsAt: now + this.breakMs, total: this.breakMs };
    this.arm();
    this.render(now);
  }

  stop(now = Date.now()) {
    const was = this.state;
    this.state = null;
    this.disarm();
    this.render(now);
    if (was) this.onEvent({ type: 'focusStopped', phase: was.phase, minutes: Math.floor((now - was.startedAt) / MIN) });
  }

  /** Advance: fires phase transitions. Safe to call often. */
  tick(now = Date.now()) {
    const s = this.state;
    if (!s) return;
    if (now < s.endsAt) { this.render(now); return; }
    if (s.phase === 'work') {
      this.onEvent({ type: 'workDone', minutes: Math.round(s.total / MIN) });
      this.startBreak(s.endsAt);
      // Long gap (machine asleep)? Don't chain phantom phases.
      if (now >= this.state.endsAt) this.stop(now);
    } else {
      this.state = null;
      this.disarm();
      this.render(now);
      this.onEvent({ type: 'breakDone' });
    }
  }

  arm() {
    this.disarm();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  disarm() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  remainingText(now) {
    const left = Math.max(0, this.state.endsAt - now);
    const m = Math.floor(left / MIN);
    const s = Math.floor((left % MIN) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  render(now) {
    if (!this.item) return;
    const s = this.state;
    if (!s) { this.item.hide(); return; }
    const work = s.phase === 'work';
    this.item.text = `${work ? '$(target)' : '$(coffee)'} ${this.remainingText(now)}`;
    this.item.tooltip = work ? 'Focus session: click to stop' : 'Break: click to end it early';
    this.item.backgroundColor = work ? undefined : new vscode.ThemeColor('statusBarItem.prominentBackground');
    this.item.show();
  }

  dispose() {
    this.disarm();
    if (this.item) this.item.dispose();
  }
}

module.exports = { FocusSession };
