'use strict';
// A minimal stand-in for the `vscode` module, enough to exercise the host layer in plain Node.
const Module = require('module');
const path = require('path');

const calls = { info: [], statusMessages: [], commands: [], opened: [] };
const config = {};

class Memento {
  constructor() { this.map = new Map(); this.synced = []; }
  get(k, d) { return this.map.has(k) ? JSON.parse(JSON.stringify(this.map.get(k))) : d; }
  update(k, v) { if (v === undefined) this.map.delete(k); else this.map.set(k, JSON.parse(JSON.stringify(v))); return Promise.resolve(); }
  keys() { return [...this.map.keys()]; }
  setKeysForSync(keys) { this.synced = keys; }
}

class MarkdownString {
  constructor(v = '') { this.value = v; }
  appendMarkdown(s) { this.value += s; return this; }
}

const Uri = {
  file: p => ({ fsPath: p, toString: () => `file://${p}` }),
  parse: s => ({ toString: () => s }),
  joinPath: (base, ...parts) => {
    const p = path.join(base.fsPath, ...parts);
    return { fsPath: p, toString: () => `file://${p}` };
  },
};

const noopDisposable = { dispose() {} };
const event = () => () => noopDisposable;
const registered = { commands: new Map(), views: [], serializers: [] };

const vscode = {
  registered,
  extensions: { getExtension: () => undefined },
  languages: { onDidChangeDiagnostics: event(), getDiagnostics: () => [] },
  tasks: { onDidEndTaskProcess: event() },
  debug: { onDidStartDebugSession: event() },
  Uri,
  MarkdownString,
  ThemeColor: class { constructor(id) { this.id = id; } },
  StatusBarAlignment: { Left: 1, Right: 2 },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  ViewColumn: { Active: -1 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  window: {
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {}, text: '', tooltip: null }),
    showInformationMessage: (text, ...items) => { calls.info.push(text); return Promise.resolve(undefined); },
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    setStatusBarMessage: text => { calls.statusMessages.push(text); return noopDisposable; },
    createOutputChannel: () => ({ info() {}, warn() {}, error() {}, debug() {}, show() {}, dispose() {} }),
    registerWebviewViewProvider: (id, provider) => { registered.views.push(id); return noopDisposable; },
    registerWebviewPanelSerializer: id => { registered.serializers.push(id); return noopDisposable; },
    onDidChangeWindowState: event(),
  },
  workspace: {
    getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d) }),
    onDidChangeTextDocument: event(),
    onDidSaveTextDocument: event(),
    onDidChangeConfiguration: event(),
    onDidChangeWorkspaceFolders: event(),
    workspaceFolders: undefined,
    isTrusted: true,
    findFiles: () => Promise.resolve([]),
  },
  commands: {
    executeCommand: (...a) => { calls.commands.push(a); return Promise.resolve(); },
    registerCommand: (id, fn) => { registered.commands.set(id, fn); return noopDisposable; },
  },
  env: { clipboard: { writeText: () => Promise.resolve() }, openExternal: uri => { calls.opened.push(String(uri)); return Promise.resolve(true); } },
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;
  return origLoad.call(this, request, ...rest);
};

function reset() {
  calls.info.length = 0;
  calls.statusMessages.length = 0;
  calls.commands.length = 0;
  calls.opened.length = 0;
  for (const k of Object.keys(config)) delete config[k];
}

const log = { info() {}, warn() {}, error() {}, debug() {} };

module.exports = { vscode, Memento, calls, config, reset, log };
