'use strict';
const vscode = require('vscode');
const { Store } = require('./host/store');
const { Controller } = require('./host/controller');
const { WebviewHost, PANEL_TYPE } = require('./host/webview');
const { Files } = require('./host/files');
const { watchGit, watchDiagnostics, watchTasks } = require('./host/integrations');

const TICK_MS = 5000;
const WELCOMED_KEY = 'idlepal.welcomed';
const EDITABLE_SCHEMES = new Set(['file', 'untitled', 'vscode-remote', 'vscode-vfs']);

/** Does this path look like a test file? (foo.test.js, foo_spec.rb, tests/foo.py, __tests__/foo.tsx, FooTest.java…) */
function isTestFile(p) {
  const s = String(p || '').replace(/\\/g, '/');
  const base = s.split('/').pop() || '';
  return /[._-](test|tests|spec)\.[^.]+$/i.test(base) || /^(test_|spec_)/i.test(base) || /Tests?\.[a-z]+$/.test(base)
    || /(^|\/)(tests?|specs?|__tests__|spec)\//i.test(s);
}

function activate(context) {
  const log = vscode.window.createOutputChannel('IdlePal', { log: true });
  const store = new Store(context.globalState, log);
  const controller = new Controller(store, log);
  const files = new Files(store, controller, log);
  const host = new WebviewHost(context, controller, files, log);
  store.enableSync(controller.config.sync);

  // The pet lives in the Explorer by default, or in its own activity-bar tab (idlepal.location).
  const viewId = () => (vscode.workspace.getConfiguration('idlepal').get('location') === 'activityBar' ? 'idlepal.sidebarView' : 'idlepal.view');
  const showView = () => vscode.commands.executeCommand(`${viewId()}.focus`);
  const withView = async msg => { await showView(); host.postUi(msg); };
  const cmd = (id, fn) => vscode.commands.registerCommand(`idlepal.${id}`, fn);

  context.subscriptions.push(
    log,
    controller,
    vscode.window.registerWebviewViewProvider('idlepal.view', host, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewViewProvider('idlepal.sidebarView', host, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewPanelSerializer(PANEL_TYPE, { deserializeWebviewPanel: async panel => host.restorePanel(panel) }),

    cmd('menu', () => showMenu(controller)),
    cmd('show', showView),
    cmd('openInEditor', () => host.openPanel()),
    cmd('focusStart', () => controller.focusStart()),
    cmd('focusStop', () => controller.focusStop()),
    cmd('focusToggle', () => controller.focusToggle()),
    cmd('quests', () => withView({ type: 'tab', tab: 'pet', scrollTo: 'quests' })),
    cmd('journal', () => withView({ type: 'tab', tab: 'journal' })),
    cmd('expedition', () => withView({ type: 'tab', tab: 'pet', scrollTo: 'expedition' })),
    cmd('duck', () => withView({ type: 'openDuck' })),
    cmd('showRecap', () => withView({ type: 'recap' })),
    cmd('feed', () => controller.dispatch('feed', 'meal')),
    cmd('snack', () => controller.dispatch('feed', 'snack')),
    cmd('play', () => withView({ type: 'openGames' })),
    cmd('clean', () => controller.dispatch('clean')),
    cmd('medicine', () => controller.dispatch('medicine')),
    cmd('lights', () => controller.dispatch('lights')),
    cmd('togglePause', () => controller.dispatch('pause')),
    cmd('openShop', () => withView({ type: 'tab', tab: 'shop' })),
    cmd('toggleTeamShare', () => controller.toggleTeamShare()),
    cmd('shareCard', () => withView({ type: 'share' })),
    cmd('exportSave', () => files.exportSave()),
    cmd('importSave', () => files.importSave()),
    cmd('exportCsv', () => files.exportCsv()),
    cmd('redeemCode', async () => {
      const code = await vscode.window.showInputBox({ title: 'Redeem a promo code', placeHolder: 'e.g. ABCD-1234', ignoreFocusOut: true });
      if (code && code.trim()) controller.redeemCode(code);
    }),
    cmd('resetAll', () => files.resetAll()),
    cmd('showLog', () => log.show()),
    cmd('openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:idlepal.idlepal')),
    cmd('walkthrough', () => vscode.commands.executeCommand('workbench.action.openWalkthrough', 'idlepal.idlepal#idlepal.welcome', false)),
    cmd('rename', async () => {
      const save = store.load(Date.now(), Math.random);
      const name = await vscode.window.showInputBox({
        title: 'Rename your pet',
        value: save.pet.name,
        validateInput: v => (!v.trim() ? 'Give them a name!' : v.trim().length > 20 ? 'Keep it to 20 characters or fewer' : null),
      });
      if (name !== undefined) controller.dispatch('rename', name);
    }),
    cmd('newPet', async () => {
      const save = store.load(Date.now(), Math.random);
      if (save.pet.dead) return controller.dispatch('newEgg');
      const ok = await vscode.window.showWarningMessage(
        `Say goodbye to ${save.pet.name} and start over with a new egg?`,
        { modal: true, detail: 'They\'ll be rehomed and remembered in your memorial. You keep your coins, items and achievements.' },
        'Start Over',
      );
      if (ok === 'Start Over') controller.dispatch('newEgg', true);
    }),

    vscode.workspace.onDidChangeTextDocument(e => {
      if (!EDITABLE_SCHEMES.has(e.document.uri.scheme)) return;
      let n = 0;
      for (const c of e.contentChanges) n += c.text.length || (c.rangeLength ? 1 : 0);
      // Ignore big pastes, formatters and undo storms: they aren't typing.
      if (n > 0 && n < 200) controller.onEdit(n, e.document.languageId);
    }),
    vscode.workspace.onDidSaveTextDocument(doc => controller.onSave(doc.languageId, isTestFile(doc.uri.path))),
    watchDiagnostics(n => { if (controller.config.diagnostics) controller.onErrors(n); }),
    watchTasks(ok => { if (controller.config.tasks) controller.onTask(ok); }),
    vscode.debug.onDidStartDebugSession(() => controller.onDebugStart()),
    vscode.window.onDidChangeWindowState(s => { if (s.focused) controller.tick(); }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration('idlepal')) return;
      if (e.affectsConfiguration('idlepal.promoCode')) {
        // The Settings field is a one-shot input: redeem what was typed, then clear it.
        const cfg = vscode.workspace.getConfiguration('idlepal');
        const code = String(cfg.get('promoCode', '') || '').trim();
        if (code) {
          controller.redeemCode(code);
          cfg.update('promoCode', undefined, vscode.ConfigurationTarget.Global);
        }
        return;
      }
      controller.reloadConfig();
      host.refreshSettings();
      if (e.affectsConfiguration('idlepal.syncAcrossMachines')) store.enableSync(controller.config.sync);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => controller.refreshTeam()),
    controller.team,
  );

  controller.team.watch(() => controller.refreshTeam());
  watchGit(() => { if (controller.config.git) controller.onCommit(); }, log).then(subs => context.subscriptions.push(...subs));

  controller.tick();
  const timer = setInterval(() => controller.tick(), TICK_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  if (!context.globalState.get(WELCOMED_KEY)) {
    context.globalState.update(WELCOMED_KEY, true);
    vscode.commands.executeCommand('idlepal.walkthrough');
  }
  log.info(`Activated (window ${controller.id})`);
}

/** One keyboard-friendly entry point for everything (Ctrl+Alt+T). */
async function showMenu(controller) {
  const save = controller.store.load(Date.now(), Math.random);
  const focusing = controller.focus.active;
  const items = [
    { label: `$(target) ${focusing ? 'Stop focus session' : 'Start focus session'}`, description: focusing ? 'End the current block' : `${controller.config.focusWork} min`, command: 'idlepal.focusToggle' },
    { label: '$(checklist) Daily quests', description: `${save.quests.list.filter(q => q.done).length}/${save.quests.list.length || 3} done`, command: 'idlepal.quests' },
    { label: '$(comment-discussion) Rubber duck a bug', description: 'Explain it to your pet', command: 'idlepal.duck' },
    { label: '$(compass) Expedition', description: save.expedition ? 'Away right now' : 'Send your pet exploring', command: 'idlepal.expedition' },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(heart) Feed a meal', command: 'idlepal.feed' },
    { label: '$(game) Play a game', command: 'idlepal.play' },
    { label: '$(sparkle) Clean up', command: 'idlepal.clean' },
    { label: '$(pulse) Give medicine', command: 'idlepal.medicine' },
    { label: '$(lightbulb) Toggle lights', command: 'idlepal.lights' },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(eye) Show pet', command: 'idlepal.show' },
    { label: '$(tag) Shop', description: `${save.coins} coins`, command: 'idlepal.openShop' },
    { label: '$(book) Journal', command: 'idlepal.journal' },
    { label: '$(graph) Weekly recap', command: 'idlepal.showRecap' },
    { label: '$(organization) Share my pet with this repo', description: controller.config.teamShare ? 'on' : 'off', command: 'idlepal.toggleTeamShare' },
    { label: `$(debug-pause) ${save.paused ? 'End vacation' : 'Vacation mode'}`, command: 'idlepal.togglePause' },
    { label: '$(gear) Settings', command: 'idlepal.openSettings' },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: `IdlePal · ${save.pet.name}`, placeHolder: 'What would you like to do?', matchOnDescription: true });
  if (pick && pick.command) vscode.commands.executeCommand(pick.command);
}

function deactivate() {}

module.exports = { activate, deactivate, isTestFile };
