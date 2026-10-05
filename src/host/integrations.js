'use strict';
const vscode = require('vscode');

/**
 * Hooks into the built-in Git extension and calls onCommit for each local commit.
 * Uses Repository.onDidCommit when available, and otherwise infers a commit from HEAD
 * moving forward on the same branch with `ahead` going up by one.
 */
async function watchGit(onCommit, log) {
  const disposables = [];
  try {
    const ext = vscode.extensions.getExtension('vscode.git');
    if (!ext) return disposables;
    const exports = ext.isActive ? ext.exports : await ext.activate();
    if (!exports || !exports.enabled) return disposables;
    const git = exports.getAPI(1);

    const hook = repo => {
      if (typeof repo.onDidCommit === 'function') {
        disposables.push(repo.onDidCommit(() => onCommit()));
        return;
      }
      let head = repo.state.HEAD;
      let last = head ? { commit: head.commit, name: head.name, ahead: head.ahead || 0 } : null;
      disposables.push(repo.state.onDidChange(() => {
        const h = repo.state.HEAD;
        if (!h) return;
        const now = { commit: h.commit, name: h.name, ahead: h.ahead || 0 };
        if (last && now.commit && now.commit !== last.commit && now.name === last.name && now.ahead === last.ahead + 1) onCommit();
        last = now;
      }));
    };

    git.repositories.forEach(hook);
    disposables.push(git.onDidOpenRepository(hook));
    log.info(`Git integration active (${git.repositories.length} repositories)`);
  } catch (err) {
    log.warn('Git integration unavailable', err);
  }
  return disposables;
}

/** Calls onChange with the workspace-wide error count (debounced). */
function watchDiagnostics(onChange) {
  let timer;
  const count = () => {
    let errors = 0;
    for (const [, diags] of vscode.languages.getDiagnostics()) {
      for (const d of diags) if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
    }
    onChange(errors);
  };
  const sub = vscode.languages.onDidChangeDiagnostics(() => {
    clearTimeout(timer);
    timer = setTimeout(count, 1500);
  });
  setTimeout(count, 3000);
  return { dispose: () => { clearTimeout(timer); sub.dispose(); } };
}

/** Calls onResult(ok, name) when a task process exits. */
function watchTasks(onResult) {
  return vscode.tasks.onDidEndTaskProcess(e => {
    if (typeof e.exitCode !== 'number') return;
    onResult(e.exitCode === 0, e.execution.task.name);
  });
}

module.exports = { watchGit, watchDiagnostics, watchTasks };
