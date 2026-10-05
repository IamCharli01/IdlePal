'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { vscode, Memento, calls } = require('./helpers/vscode-mock');
const pkg = require('../package.json');

test('activate() wires up every contributed command, the view and the panel serializer', async () => {
  const { activate } = require('../src/extension');
  const context = { subscriptions: [], globalState: new Memento(), extensionUri: { fsPath: path.join(__dirname, '..') } };
  activate(context);
  try {
  await new Promise(r => setImmediate(r));

  const contributed = pkg.contributes.commands.map(c => c.command);
  for (const id of contributed) assert.ok(vscode.registered.commands.has(id), `command not registered: ${id}`);
  for (const id of vscode.registered.commands.keys()) assert.ok(contributed.includes(id), `registered but not contributed: ${id}`);

  const contributedViews = Object.values(pkg.contributes.views).flat().map(v => v.id).sort();
  assert.deepEqual([...vscode.registered.views].sort(), contributedViews);
  assert.deepEqual(contributedViews, ['idlepal.sidebarView', 'idlepal.view']);
  assert.equal(pkg.contributes.views.explorer[0].id, 'idlepal.view', 'lives in the Explorer by default');
  assert.deepEqual(vscode.registered.serializers, ['idlepal.panel']);
  assert.ok(pkg.activationEvents.includes('onWebviewPanel:idlepal.panel'));

  // First run opens the walkthrough, whose id must match the manifest.
  assert.ok(calls.commands.some(c => c[0] === 'idlepal.walkthrough'), 'walkthrough requested on first run');
  await vscode.registered.commands.get('idlepal.walkthrough')();
  const walk = calls.commands.find(c => c[0] === 'workbench.action.openWalkthrough');
  assert.ok(walk, 'walkthrough opened on first run');
  assert.equal(walk[1], `${pkg.publisher}.${pkg.name}#${pkg.contributes.walkthroughs[0].id}`);

  // Commands run without throwing.
  await vscode.registered.commands.get('idlepal.feed')();
  await vscode.registered.commands.get('idlepal.togglePause')();
  assert.equal(context.globalState.get('idlepal.save').paused, true);

  // Every walkthrough media file exists.
  for (const step of pkg.contributes.walkthroughs[0].steps) {
    require('fs').accessSync(path.join(__dirname, '..', step.media.markdown));
  }

  } finally {
    for (const d of context.subscriptions) if (d && typeof d.dispose === 'function') d.dispose();
  }
});
