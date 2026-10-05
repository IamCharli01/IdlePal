'use strict';
const { migrate, createSave } = require('../core/save');

const SAVE_KEY = 'idlepal.save';
const LEADER_KEY = 'idlepal.leader';
const LEADER_TTL = 15000;

/**
 * Persistence on top of globalState. globalState is shared (and kept in sync) across every
 * VS Code window, so all windows see the same pet. Optionally it also syncs across machines.
 */
class Store {
  /** @param {import('vscode').Memento & {setKeysForSync?: (keys: string[]) => void}} memento */
  constructor(memento, log) {
    this.memento = memento;
    this.log = log;
  }

  enableSync(on) {
    if (typeof this.memento.setKeysForSync === 'function') this.memento.setKeysForSync(on ? [SAVE_KEY] : []);
  }

  load(now, rand) {
    const raw = this.memento.get(SAVE_KEY);
    try {
      return migrate(raw, now, rand);
    } catch (err) {
      // migrate() is defensive and shouldn't throw, but never lose the user's data if it does.
      this.log.error('Failed to read save; backing it up and starting fresh', err);
      this.memento.update(`idlepal.corrupt.${now}`, raw);
      return createSave(now, rand);
    }
  }

  async write(save) {
    await this.memento.update(SAVE_KEY, save);
  }

  /**
   * Only one window (the leader) advances the simulation and sends reminders. That stops
   * duplicate notifications and double-counted time when several windows are open.
   */
  claimLeadership(id, now) {
    const l = this.memento.get(LEADER_KEY);
    if (!l || l.id === id || now - l.beat > LEADER_TTL) {
      this.memento.update(LEADER_KEY, { id, beat: now });
      return true;
    }
    return false;
  }

  releaseLeadership(id) {
    const l = this.memento.get(LEADER_KEY);
    if (l && l.id === id) return this.memento.update(LEADER_KEY, undefined);
  }
}

module.exports = { Store, SAVE_KEY };
