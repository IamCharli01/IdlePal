'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Memento, calls, config, reset, log } = require('./helpers/vscode-mock');

const { Store, SAVE_KEY } = require('../src/host/store');
const { Controller } = require('../src/host/controller');
const { WebviewHost } = require('../src/host/webview');
const { ECONOMY } = require('../src/core/catalog');

function fakeView() {
  const posted = [];
  return { posted, entry: { webview: { postMessage: m => { posted.push(m); return Promise.resolve(true); } }, isVisible: () => true } };
}

function setup(memento = new Memento()) {
  const store = new Store(memento, log);
  const c = new Controller(store, log);
  return { memento, store, c };
}

test.beforeEach(() => reset());

test('first tick creates and persists a save', () => {
  const { memento, c } = setup();
  c.tick();
  const s = memento.get(SAVE_KEY);
  assert.equal(s.schema, 2);
  assert.equal(s.pet.species, 'egg');
});

test('an existing save is loaded, ticked and written back', async () => {
  const memento = new Memento();
  await memento.update(SAVE_KEY, { schema: 2, lastUpdate: Date.now(), pet: { name: 'Mochi', ageMs: 3 * 3600e3, species: 'kitbit', hunger: 50, happy: 50, energy: 50, health: 90 } });
  const { c } = setup(memento);
  c.tick();
  await new Promise(r => setImmediate(r));
  const s = memento.get(SAVE_KEY);
  assert.equal(s.pet.name, 'Mochi');
  assert.equal(s.pet.species, 'kitbit');
});

test('only one window leads the simulation', () => {
  const memento = new Memento();
  const a = setup(memento).c;
  const b = setup(memento).c;
  a.tick();
  b.tick();
  assert.equal(a.leader, true);
  assert.equal(b.leader, false);
  a.dispose();
  b.tick();
  assert.equal(b.leader, true, 'leadership passes on when the leader closes');
});

test('dispatch applies an action and pushes state to views', () => {
  const { memento, c } = setup();
  c.tick();
  const s = memento.get(SAVE_KEY);
  s.pet.ageMs = 5 * 60e3; s.pet.species = 'blip'; s.pet.hunger = 40;
  memento.update(SAVE_KEY, s);
  const v = fakeView();
  c.views.add(v.entry);
  const r = c.dispatch('feed', 'meal');
  assert.equal(r.ok, true);
  assert.ok(Math.abs(memento.get(SAVE_KEY).pet.hunger - 70) < 0.01);
  const last = v.posted[v.posted.length - 1];
  assert.equal(last.type, 'state');
  // The pet's secret favourite may add a note after the line, so check how it starts.
  assert.ok(last.message.startsWith('Nom nom nom!'), last.message);
  assert.equal(last.anim, 'eat:food');
});

test('commits earn coins through the activity pipeline', () => {
  const { memento, c } = setup();
  c.tick();
  const before = memento.get(SAVE_KEY).coins;
  c.onCommit();
  c.tick();
  clearTimeout(c.flushTimer);
  const after = memento.get(SAVE_KEY);
  assert.equal(after.totals.commits, 1);
  assert.ok(after.coins >= before + ECONOMY.commitCoins);
});

test('clearing a burst of errors is rewarded once', () => {
  const { memento, c } = setup();
  c.tick();
  c.onErrors(5);
  c.onErrors(0);
  c.onErrors(4);
  c.onErrors(0);
  assert.equal(memento.get(SAVE_KEY).totals.errorsCleared, 1, 'cooldown prevents farming');
});

test('notifications respect the setting', () => {
  config.notifications = 'off';
  const { c } = setup();
  c.tick();
  c.notify('hello', 'important');
  assert.equal(calls.info.length, 0);
  config.notifications = 'important';
  c.reloadConfig();
  c.notify('reminder', 'all');
  c.notify('big news', 'important');
  assert.deepEqual(calls.info, ['big news']);
});

test('webview host validates messages and renders a complete HTML shell', () => {
  const dispatched = [];
  const controller = { views: new Set(), config: { sound: false }, dispatch: (a, arg) => dispatched.push([a, arg]), tick() {} };
  const context = { extensionUri: { fsPath: path.join(__dirname, '..') } };
  const host = new WebviewHost(context, controller, { saveShareImage() {} }, log);
  const wv = { cspSource: 'vscode-resource:', asWebviewUri: u => u, postMessage() {} };
  const html = host.html(wv, 'sidebar');
  assert.ok(!/{{\w+}}/.test(html), 'no unreplaced placeholders');
  assert.match(html, /script-src 'nonce-[A-Za-z0-9]{32}'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(html));

  const entry = { webview: wv, isVisible: () => true };
  host.onMessage({ type: 'action', action: 'feed', arg: 'meal' }, entry);
  host.onMessage({ type: 'action', action: 'newEgg', arg: true }, entry); // must go through the confirm command, not directly
  host.onMessage({ type: 'action', action: 'constructor' }, entry);
  host.onMessage({ type: 'command', id: '../../evil' }, entry);
  host.onMessage(null, entry);
  host.onMessage('nope', entry);
  assert.deepEqual(dispatched, [['feed', 'meal']]);

  // External links: only known names open, and a URL from the webview is never used.
  host.onMessage({ type: 'openLink', id: 'drops' }, entry);
  host.onMessage({ type: 'openLink', id: 'https://evil.example' }, entry);
  host.onMessage({ type: 'openLink', id: '__proto__' }, entry);
  host.onMessage({ type: 'openLink', url: 'https://evil.example' }, entry);
  assert.deepEqual(calls.opened, [require('../src/host/webview').LINKS.drops]);
  assert.match(calls.opened[0], /^https:\/\/[a-z.]*linkedin\.com\//);
});
