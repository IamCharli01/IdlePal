'use strict';
const { MIN } = require('../core/catalog');

// Gaps shorter than this between edits count as coding time.
const CODING_GAP = 2 * MIN;
// A gap this long ends a coding session (for break reminders).
const SESSION_GAP = 5 * MIN;

function emptyPending() { return { chars: 0, codingMs: 0, saves: 0, testSaves: 0, commits: 0, langs: {} }; }

/** Tracks this window's editor activity, which the controller batches into the save every tick. */
class ActivityTracker {
  constructor() {
    this.lastEditAt = 0;
    this.sessionStart = 0;
    this.breakSnoozedUntil = 0;
    this.breakReminded = false;
    this.pending = emptyPending();
  }

  /** @param {string} [lang] VS Code languageId of the edited document */
  edit(chars, now, lang) {
    const gap = now - this.lastEditAt;
    if (this.lastEditAt && gap < CODING_GAP) {
      this.pending.codingMs += gap;
      if (lang) this.pending.langs[lang] = (this.pending.langs[lang] || 0) + gap;
    }
    if (!this.lastEditAt || gap >= SESSION_GAP) {
      this.sessionStart = now;
      this.breakReminded = false;
    }
    this.lastEditAt = now;
    this.pending.chars += chars;
  }

  save(now, lang, isTest = false) { this.edit(0, now, lang); this.pending.saves++; if (isTest) this.pending.testSaves++; }
  commit() { this.pending.commits++; }

  take() {
    const p = this.pending;
    this.pending = emptyPending();
    return p;
  }

  /** Length of the current unbroken coding session, or 0 if you're idle. */
  sessionMs(now) {
    return this.lastEditAt && now - this.lastEditAt < SESSION_GAP ? now - this.sessionStart : 0;
  }

  shouldRemindBreak(now, minutes) {
    if (!minutes || this.breakReminded || now < this.breakSnoozedUntil) return false;
    return this.sessionMs(now) >= minutes * MIN;
  }

  snoozeBreak(now, ms) { this.breakSnoozedUntil = now + ms; this.breakReminded = false; }
}

module.exports = { ActivityTracker, CODING_GAP, SESSION_GAP };
