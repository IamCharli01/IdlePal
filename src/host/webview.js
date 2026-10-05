'use strict';
const vscode = require('vscode');
const fs = require('fs');
const catalog = require('../core/catalog');

const PANEL_TYPE = 'idlepal.panel';
const ACTIONS = new Set(['feed', 'playResult', 'clean', 'medicine', 'lights', 'buy', 'equip', 'pause', 'buyBundle', 'mystery', 'haggle', 'sell', 'setGoal', 'useItem',
  'expedition', 'recall', 'duck']);
const COMMANDS = new Set(['rename', 'newPet', 'exportSave', 'importSave', 'exportCsv', 'openSettings', 'openInEditor', 'walkthrough', 'resetAll',
  'focusStart', 'focusStop', 'focusToggle', 'toggleTeamShare', 'showRecap', 'quests', 'menu', 'journal', 'expedition', 'duck']);
// The only external pages the webview may open, by name. It never sends a URL itself.
const LINKS = { drops: 'https://au.linkedin.com/in/charlie-al-batty-1895b911a' };

function nonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Serves the pet UI to the sidebar view and to an optional editor-tab panel. */
class WebviewHost {
  constructor(context, controller, files, log) {
    this.context = context;
    this.controller = controller;
    this.files = files;
    this.log = log;
    this.media = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.template = fs.readFileSync(vscode.Uri.joinPath(this.media, 'index.html').fsPath, 'utf8');
    this.panel = undefined;
    this.queue = [];
  }

  // WebviewViewProvider
  resolveWebviewView(view) {
    const entry = this.attach(view.webview, () => view.visible, cb => view.onDidDispose(cb), 'sidebar');
    // Activity-bar badge: how many things the pet needs right now.
    entry.setBadge = (n, tooltip) => { try { view.badge = n ? { value: n, tooltip } : undefined; } catch { /* older VS Code */ } };
    view.onDidChangeVisibility(() => { if (view.visible) this.controller.tick(); });
  }

  openPanel() {
    if (this.panel) { this.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel(PANEL_TYPE, 'IdlePal', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.media],
    });
    this.restorePanel(panel);
  }

  restorePanel(panel) {
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.media, 'icon.png');
    this.attach(panel.webview, () => panel.visible, cb => panel.onDidDispose(() => { this.panel = undefined; cb(); }), 'panel');
    panel.onDidChangeViewState(() => { if (panel.visible) this.controller.tick(); });
  }

  attach(webview, isVisible, onDispose, layout) {
    webview.options = { enableScripts: true, localResourceRoots: [this.media] };
    webview.html = this.html(webview, layout);
    const entry = { webview, isVisible };
    const sub = webview.onDidReceiveMessage(m => {
      try { this.onMessage(m, entry); } catch (err) { this.log.error('Bad webview message', err); }
    });
    onDispose(() => { this.controller.views.delete(entry); sub.dispose(); });
    return entry;
  }

  sendInit(webview) {
    const { STAGES, SPECIES, FOODS, ACCESSORIES, SCREENS, GAMES, ACHIEVEMENTS, TRAITS, ITEMS, QUESTS, BUNDLES, SHOP, THEMES, FOOD_CATS, FOOD_RULES, DECOR, DECOR_ZONES, EXPEDITIONS, ARTEFACTS, CHALLENGE, ECONOMY } = catalog;
    webview.postMessage({
      type: 'init',
      catalog: { STAGES, SPECIES, FOODS, ACCESSORIES, SCREENS, GAMES, ACHIEVEMENTS, TRAITS, ITEMS, QUESTS, BUNDLES, SHOP, THEMES, FOOD_CATS, FOOD_RULES, DECOR, DECOR_ZONES, EXPEDITIONS, ARTEFACTS, CHALLENGE, ECONOMY },
      settings: { sound: this.controller.config.sound },
    });
  }

  /** Send a UI-only message (switch tab, open games…), queueing it until a view is ready. */
  postUi(msg) {
    if (this.controller.views.size) for (const v of this.controller.views) v.webview.postMessage(msg);
    else this.queue.push(msg);
  }

  refreshSettings() { for (const v of this.controller.views) this.sendInit(v.webview); }

  onMessage(m, entry) {
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'ready':
        this.controller.views.add(entry);
        this.sendInit(entry.webview);
        this.controller.tick();
        for (const q of this.queue.splice(0)) entry.webview.postMessage(q);
        return;
      case 'action':
        if (ACTIONS.has(m.action)) this.controller.dispatch(m.action, m.arg);
        return;
      case 'command':
        if (COMMANDS.has(m.id)) vscode.commands.executeCommand(`idlepal.${m.id}`);
        return;
      case 'redeem':
        if (typeof m.code === 'string') this.controller.redeemCode(m.code);
        return;
      case 'openLink':
        if (typeof m.id === 'string' && Object.prototype.hasOwnProperty.call(LINKS, m.id)) vscode.env.openExternal(vscode.Uri.parse(LINKS[m.id]));
        return;
      case 'shareImage':
        this.files.saveShareImage(m.dataUrl, m.caption);
        return;
    }
  }

  html(webview, layout) {
    const n = nonce();
    const uri = f => webview.asWebviewUri(vscode.Uri.joinPath(this.media, f)).toString();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${n}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');
    return this.template
      .replace(/{{csp}}/g, csp)
      .replace(/{{nonce}}/g, n)
      .replace(/{{layout}}/g, layout)
      .replace(/{{css}}/g, uri('view.css'))
      .replace(/{{icons}}/g, uri('icons.js'))
      .replace(/{{sprites}}/g, uri('sprites.js'))
      .replace(/{{js}}/g, uri('view.js'));
  }
}

module.exports = { WebviewHost, PANEL_TYPE, LINKS };
