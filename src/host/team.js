'use strict';
const vscode = require('vscode');
const { SPECIES, ACCESSORIES, SCREENS, STAGES, GAMES } = require('../core/catalog');

const DIR = '.idlepal';
const GLOB = `**/${DIR}/*.json`;
const MAX_CARD_BYTES = 8 * 1024;
const MAX_MEMBERS = 50;
const MOODS = new Set(['dead', 'vacation', 'egg', 'asleep', 'sick', 'sad', 'worried', 'happy', 'ok', 'focused', 'away']);

function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'dev';
}

/** Accept only what we render. Everything in the file is untrusted (it came from the repo). */
function sanitizeCard(raw, fileName) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  const pet = raw.pet && typeof raw.pet === 'object' ? raw.pet : {};
  const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : 0);
  const species = SPECIES[pet.species] ? pet.species : 'blip';
  const wearable = (id, slot) => (ACCESSORIES[id] && ACCESSORIES[id].slot === slot ? id : null);
  const ch = raw.challenge && typeof raw.challenge === 'object' ? raw.challenge : {};
  return {
    id: fileName.replace(/\.json$/i, ''),
    name: str(raw.name, 30) || fileName.replace(/\.json$/i, ''),
    pet: {
      name: str(pet.name, 20) || '???',
      species,
      speciesName: SPECIES[species].name,
      stage: STAGES.some(s => s.id === pet.stage) ? pet.stage : SPECIES[species].stage,
      shiny: pet.shiny === true,
      mood: MOODS.has(pet.mood) ? pet.mood : 'ok',
      hat: wearable(pet.hat, 'hat'),
      face: wearable(pet.face, 'face'),
      prop: wearable(pet.prop, 'prop'),
      screen: SCREENS[pet.screen] ? pet.screen : 'classic',
      theme: wearable(pet.theme, 'theme'),
    },
    streak: num(raw.streak, 0, 100000),
    achievements: num(raw.achievements, 0, 10000),
    generation: num(raw.generation, 1, 100000) || 1,
    // Weekly Challenge best: only meaningful for the week it was set, and only for a real game.
    challenge: typeof ch.week === 'string' && /^\d{4}-W\d{2}$/.test(ch.week) && GAMES[ch.game]
      ? { week: ch.week, game: ch.game, score: num(ch.score, 0, GAMES[ch.game].maxScore) } : null,
    updatedAt: num(raw.updatedAt, 0, 4102444800000),
  };
}

/**
 * Zero-backend team pets: each developer who opts in writes a small card to `.idlepal/<name>-<tag>.json`
 * in the repo; git carries it to everyone else. Nothing leaves the machine except through git.
 * The tag comes from the save, so two people with the same name don't overwrite each other.
 */
class TeamSync {
  constructor(log, deps = {}) {
    this.log = log;
    this.fs = deps.fs || vscode.workspace.fs;
    this.findFiles = deps.findFiles || ((glob, exclude, max) => vscode.workspace.findFiles(glob, exclude, max));
    this.folders = deps.folders || (() => vscode.workspace.workspaceFolders || []);
    this.members = [];
    this.lastPublished = null;
    this.lastPublishAt = 0;
    this.watcher = null;
  }

  get hasWorkspace() { return this.folders().length > 0; }

  /** Four base-36 characters from the save's creation time: stable per save, different per person. */
  static tagFor(save) {
    const t = save && Number.isFinite(save.createdAt) ? Math.floor(save.createdAt / 1000) : 0;
    return (t % 1679616).toString(36).padStart(4, '0');
  }

  /** `name-tag.json` (just `name.json` when no tag is given). */
  ownFileName(displayName, tag) { return `${slugify(displayName)}${tag ? `-${tag}` : ''}.json`; }

  async refresh(displayName, tag) {
    if (!this.hasWorkspace) { this.members = []; return this.members; }
    const own = this.ownFileName(displayName, tag);
    let files = [];
    try { files = await this.findFiles(GLOB, '**/node_modules/**', MAX_MEMBERS); } catch (err) { this.log.warn('Team scan failed', err); }
    const members = [];
    for (const uri of files) {
      const fileName = uri.path.split('/').pop();
      if (fileName === own) continue;
      try {
        const bytes = await this.fs.readFile(uri);
        if (bytes.byteLength > MAX_CARD_BYTES) continue;
        const card = sanitizeCard(JSON.parse(Buffer.from(bytes).toString('utf8')), fileName);
        if (card) members.push(card);
      } catch { /* not one of ours, or malformed: ignore */ }
    }
    members.sort((a, b) => b.updatedAt - a.updatedAt);
    this.members = members;
    return members;
  }

  /** Build this user's card from a snapshot. Deliberately excludes coding time: this is a habitat, not a timesheet. */
  static cardFrom(snap, displayName) {
    const p = snap.pet;
    const ch = snap.view.challenge;
    return {
      v: 1,
      name: displayName,
      pet: { name: p.name, species: p.species, stage: snap.view.stage, shiny: p.shiny, mood: snap.view.mood, hat: snap.equipped.hat, face: snap.equipped.face, prop: snap.equipped.prop || null, screen: snap.equipped.screen, theme: snap.equipped.theme || null },
      streak: snap.streak.current,
      achievements: Object.keys(snap.achievements).length,
      generation: p.generation,
      challenge: ch && ch.plays > 0 ? { week: ch.week, game: ch.game, score: ch.best } : null,
      updatedAt: 0,
    };
  }

  /** Write the card if it changed (ignoring the timestamp), at most once a minute. */
  async publish(card, displayName, now = Date.now(), force = false, tag) {
    if (!this.hasWorkspace) return false;
    const key = JSON.stringify({ ...card, updatedAt: 0 });
    if (!force && (key === this.lastPublished || (this.lastPublishAt && now - this.lastPublishAt < 60000))) return false;
    const dir = vscode.Uri.joinPath(this.folders()[0].uri, DIR);
    try {
      await this.fs.createDirectory(dir);
      const body = JSON.stringify({ ...card, updatedAt: now }, null, 2) + '\n';
      await this.fs.writeFile(vscode.Uri.joinPath(dir, this.ownFileName(displayName, tag)), Buffer.from(body, 'utf8'));
      this.lastPublished = key;
      this.lastPublishAt = now;
      return true;
    } catch (err) {
      this.log.warn('Could not publish team card', err);
      return false;
    }
  }

  async unpublish(displayName, tag) {
    if (!this.hasWorkspace) return;
    const uri = vscode.Uri.joinPath(this.folders()[0].uri, DIR, this.ownFileName(displayName, tag));
    try { await this.fs.delete(uri); } catch { /* already gone */ }
    this.lastPublished = null;
    this.lastPublishAt = 0;
  }

  watch(onChange) {
    if (this.watcher || !vscode.workspace.createFileSystemWatcher) return;
    this.watcher = vscode.workspace.createFileSystemWatcher(GLOB);
    for (const ev of ['onDidCreate', 'onDidChange', 'onDidDelete']) this.watcher[ev](() => onChange());
  }

  dispose() { if (this.watcher) this.watcher.dispose(); }
}

module.exports = { TeamSync, sanitizeCard, slugify, DIR };
