'use strict';
const vscode = require('vscode');
const os = require('os');
const path = require('path');
const { migrate, createSave } = require('../core/save');

const EXPORT_FORMAT = 'idlepal';
const MAX_IMAGE_CHARS = 10 * 1024 * 1024;

function safeFileName(name) { return String(name).replace(/[^\w.-]+/g, '_').slice(0, 40) || 'pet'; }

/** Export, import, share-card and reset flows. */
class Files {
  constructor(store, controller, log) {
    this.store = store;
    this.controller = controller;
    this.log = log;
  }

  async exportSave() {
    const now = Date.now();
    const save = this.store.load(now, Math.random);
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `${safeFileName(save.pet.name)}-idlepal.json`)),
      filters: { 'IdlePal save': ['json'] },
      saveLabel: 'Export',
    });
    if (!target) return;
    const body = JSON.stringify({ format: EXPORT_FORMAT, exportedAt: new Date(now).toISOString(), save }, null, 2);
    await vscode.workspace.fs.writeFile(target, Buffer.from(body, 'utf8'));
    vscode.window.showInformationMessage(`Saved ${save.pet.name} to ${path.basename(target.fsPath)}.`);
  }

  async importSave() {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'IdlePal save': ['json'] }, openLabel: 'Import' });
    if (!picked || !picked[0]) return;
    let data;
    try {
      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('File is too large');
      data = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch (err) {
      vscode.window.showErrorMessage(`Couldn't read that file: ${err.message}`);
      return;
    }
    // Accept any export wrapper ({ format, save }), including files from builds made before the
    // extension was renamed, plus a bare save object.
    const raw = data && typeof data.format === 'string' && data.save && typeof data.save === 'object' ? data.save : data;
    if (!raw || typeof raw !== 'object' || !raw.schema) {
      vscode.window.showErrorMessage('That doesn\'t look like a IdlePal save file.');
      return;
    }
    const now = Date.now();
    const incoming = migrate(raw, now, Math.random);
    incoming.lastUpdate = now; // don't apply the time since export
    const current = this.store.load(now, Math.random);
    const ok = await vscode.window.showWarningMessage(
      `Replace ${current.pet.name} with ${incoming.pet.name} (generation ${incoming.pet.generation}, ${incoming.coins} coins)?`,
      { modal: true, detail: 'Your current save will be overwritten. Export it first if you want to keep it.' },
      'Replace',
    );
    if (ok !== 'Replace') return;
    await this.store.write(incoming);
    this.log.info('Imported save from', picked[0].fsPath);
    this.controller.tick();
  }

  async saveShareImage(dataUrl, caption) {
    const prefix = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix) || dataUrl.length > MAX_IMAGE_CHARS) return;
    const save = this.store.load(Date.now(), Math.random);
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `${safeFileName(save.pet.name)}.png`)),
      filters: { 'PNG image': ['png'] },
      saveLabel: 'Save card',
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
    const choice = await vscode.window.showInformationMessage(`Saved ${path.basename(target.fsPath)}.`, 'Open', 'Copy caption');
    if (choice === 'Open') vscode.commands.executeCommand('vscode.open', target);
    if (choice === 'Copy caption' && typeof caption === 'string') vscode.env.clipboard.writeText(caption.slice(0, 500));
  }

  /** Your coding history as a spreadsheet-friendly CSV. */
  async exportCsv() {
    const now = Date.now();
    const save = this.store.load(now, Math.random);
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), 'idlepal-coding-stats.csv')),
      filters: { 'CSV': ['csv'] },
      saveLabel: 'Export CSV',
    });
    if (!target) return;
    const cell = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const rows = [['day', 'coding_minutes', 'characters', 'saves', 'commits', 'coins', 'top_language']];
    for (const day of Object.keys(save.history).sort()) {
      const h = save.history[day];
      const top = Object.entries(h.langs || {}).sort((a, b) => b[1] - a[1])[0];
      rows.push([day, Math.round(h.codingMs / 60000), h.chars, h.saves, h.commits, h.coins, top ? top[0] : '']);
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(rows.map(r => r.map(cell).join(',')).join('\n') + '\n', 'utf8'));
    const open = await vscode.window.showInformationMessage(`Exported ${rows.length - 1} days to ${path.basename(target.fsPath)}.`, 'Open');
    if (open) vscode.commands.executeCommand('vscode.open', target);
  }

  async resetAll() {
    const ok = await vscode.window.showWarningMessage(
      'Erase everything? This deletes your pet, coins, items, achievements, stats and memorial.',
      { modal: true, detail: 'This cannot be undone. Consider exporting your save first.' },
      'Erase Everything',
    );
    if (ok !== 'Erase Everything') return;
    await this.store.write(createSave(Date.now(), Math.random));
    this.log.info('Save reset by user');
    this.controller.tick();
  }
}

module.exports = { Files };
