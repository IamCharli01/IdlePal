'use strict';
// Smoke-tests the real webview script (media/view.js) against a stub DOM, so runtime errors in
// rendering, tabs, games and the share card are caught without launching VS Code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const catalog = require('../src/core/catalog');
const { createSave } = require('../src/core/save');
const { snapshot } = require('../src/core/derive');
const { applyAction } = require('../src/core/actions');

function makeEnv() {
  const elements = new Map();
  const handlers = {};
  const intervals = [];
  const posted = [];
  const ctx2d = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  function el(id = '') {
    const e = {
      id, textContent: '', innerHTML: '', hidden: false, title: '', tabIndex: 0, disabled: false, className: '',
      dataset: {}, style: {}, attrs: {}, width: 0, height: 0,
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      firstElementChild: { style: {}, className: '' },
      parentElement: null,
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener(type, fn) { (this.listeners = this.listeners || {})[type] = fn; },
      querySelector: () => el(), querySelectorAll: () => [], appendChild() {}, closest() { return this; }, focus() {}, scrollIntoView() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 192 }),
      getContext: () => ctx2d, toDataURL: () => 'data:image/png;base64,AAAA',
    };
    return e;
  }
  const document = {
    hidden: false,
    body: el('body'),
    getElementById: id => { if (!elements.has(id)) elements.set(id, el(id)); return elements.get(id); },
    createElement: () => el(),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { handlers[type] = fn; },
  };
  const window = {
    __idlepalTest: {},
    addEventListener: (type, fn) => { handlers['win:' + type] = fn; },
    matchMedia: () => ({ matches: false }),
  };
  const sandbox = {
    window, document, console, Date, Math, JSON, Number, String, Object, Array, Infinity, Proxy,
    setInterval: fn => { intervals.push(fn); return intervals.length; },
    setTimeout: fn => { fn(); return 0; },
    clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    acquireVsCodeApi: () => ({ postMessage: m => posted.push(m), getState: () => ({ tab: 'pet' }), setState() {} }),
  };
  window.window = window;
  vm.createContext(sandbox);
  for (const f of ['icons.js', 'sprites.js', 'view.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8'), sandbox, { filename: f });
  }
  const send = data => handlers['win:message']({ data });
  const tickAll = () => intervals.forEach(fn => fn());
  const click = dataset => handlers.click({ target: { ...el(), dataset } });
  const key = k => handlers.keydown({ key: k, target: el(), preventDefault() {} });
  const input = target => handlers.input({ target });
  return { posted, send, tickAll, click, key, elements, input, game: () => window.__idlepalTest.game() };
}

function state(mut) {
  const s = createSave(Date.now(), Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'kitbit';
  if (mut) mut(s);
  return { type: 'state', state: JSON.parse(JSON.stringify(snapshot(s, Date.now(), { errors: 0 }))), message: 'hi', anim: 'eat:cake', sound: 'coin' };
}

// Send exactly the tables the host sends (read from the host source, so this can't drift).
const HOST_TABLES = /const { ([A-Z_, ]+) } = catalog;/.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'host', 'webview.js'), 'utf8'))[1].split(',').map(x => x.trim());
const initMsg = {
  type: 'init',
  catalog: JSON.parse(JSON.stringify(Object.fromEntries(HOST_TABLES.map(k => [k, catalog[k]])))),
  settings: { sound: false },
};

test('webview boots and announces readiness', () => {
  const env = makeEnv();
  assert.equal(env.posted[0].type, 'ready');
});

test('renders every tab across many pet states without throwing', () => {
  const env = makeEnv();
  env.send(initMsg);
  const variants = [
    s => { s.pet.ageMs = 0; s.pet.species = 'egg'; },
    null,
    s => { s.pet.asleep = true; },
    s => { s.pet.dead = true; s.pet.causeOfDeath = 'illness'; s.graveyard.push({ name: 'Old', species: 'blip', generation: 1, ageMs: 1e6, causeOfDeath: 'neglect', diedAt: Date.now(), bornAt: 0 }); },
    s => { s.paused = true; },
    s => { s.pet.sick = true; s.pet.poops = 4; s.pet.hunger = 5; },
    s => { s.coins = 999; s.owned.crown = true; s.owned.shades = true; s.equipped.hat = 'crown'; s.equipped.face = 'shades'; s.owned.synthwave = true; s.equipped.screen = 'synthwave'; s.inventory.cake = 2; },
  ];
  for (const species of Object.keys(catalog.SPECIES)) {
    variants.push(s => { s.pet.species = species; s.equipped.hat = 'cap'; s.owned.cap = true; s.equipped.face = 'glasses'; s.owned.glasses = true; });
  }
  variants.push(s => { s.expedition = { dest: 'cloud', startedAt: Date.now() - 1000, endsAt: Date.now() + 3600e3 }; });
  variants.push(s => { s.owned.plant = true; s.owned.server = true; s.owned.poster = true; s.owned.rug = true; s.room = { wallL: 'poster', wallR: null, floorL: 'plant', floorR: 'server', floor: 'rug' }; s.owned.mug = true; s.equipped.prop = 'mug'; s.owned.eyepatch = true; s.equipped.face = 'eyepatch'; });
  variants.push(s => { s.owned.heartGlasses = true; s.equipped.face = 'heartGlasses'; s.owned.balloon = true; s.equipped.prop = 'balloon'; s.owned.headphones = true; s.equipped.hat = 'headphones'; s.artefacts.rootKey = Date.now(); s.journal.entries.push({ t: Date.now(), icon: 'chick', text: 'I hatched!' }); });
  for (const v of variants) {
    env.send(state(v));
    for (const tab of ['pet', 'shop', 'dex', 'team', 'journal', 'stats']) {
      env.send({ type: 'tab', tab });
      for (let i = 0; i < 5; i++) env.tickAll();
    }
    env.send({ type: 'tab', tab: 'pet' });
    env.click({ drawer: 'feed' });
    env.click({ drawer: 'games' });
    env.click({ drawer: 'duck' });
    for (let i = 0; i < 3; i++) env.tickAll();
  }
});

test('UI: expedition panel, rubber duck drawer, journal, room shop and artefacts render and post the right actions', () => {
  const env = makeEnv();
  env.send(initMsg);
  const now = Date.now();
  const s = createSave(now, Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'dataray'; s.coins = 500;
  s.owned.plant = true; s.room.floorL = 'plant';
  s.artefacts.semicolon = now;
  s.journal.entries.push({ t: now, icon: 'map', text: 'Back from The Cloud.' });
  const st = () => JSON.parse(JSON.stringify(snapshot(s, now, { team: { sharing: true, hasWorkspace: true, displayName: 'me', members: [{ id: 'ada', name: 'Ada', pet: { name: 'Bit', species: 'kitbit', speciesName: 'Kitbit', stage: 'child', shiny: false, mood: 'away', hat: null, face: null, prop: 'mug', screen: 'mint' }, streak: 1, achievements: 1, generation: 1, challenge: { week: snapshot(s, now).view.challenge.week, game: snapshot(s, now).view.challenge.game, score: 3 }, updatedAt: now }] } })));
  env.send({ type: 'state', state: st() });

  const exp = env.elements.get('expedition').innerHTML;
  assert.ok(exp.includes('Expeditions') && exp.includes('data-arg="kernel"'), 'destinations listed');
  env.click({ act: 'expedition', arg: 'monolith' });
  assert.equal(JSON.stringify(env.posted.find(m => m.action === 'expedition')), JSON.stringify({ type: 'action', action: 'expedition', arg: 'monolith' }));

  env.send({ type: 'openDuck' });
  const duck = () => env.elements.get('drawer-duck').innerHTML;
  assert.ok(duck().includes('Explain it to'), 'duck drawer opens');
  env.input({ id: 'duck-text', value: 'x'.repeat(200) });
  env.click({ duckDone: '' });
  assert.equal(JSON.stringify(env.posted.find(m => m.action === 'duck')), JSON.stringify({ type: 'action', action: 'duck', arg: { chars: 200 } }));
  env.click({ duckClear: '' });
  assert.ok(duck().includes('0 / '), 'cleared');

  env.send({ type: 'tab', tab: 'journal' });
  assert.ok(env.elements.get('tab-journal').innerHTML.includes('Back from The Cloud'), 'journal entry shown');

  env.send({ type: 'tab', tab: 'shop' });
  env.click({ shopcat: 'room' });
  const shopHtml = env.elements.get('tab-shop').innerHTML;
  assert.ok(shopHtml.includes('data-preview="decor:server"') && shopHtml.includes('On display'), 'room cards with previews');
  env.click({ shopcat: 'wardrobe' });
  assert.ok(env.elements.get('tab-shop').innerHTML.includes('Held'), 'props section');
  env.click({ shopcat: 'items' });
  s.items.vitamins = 1;
  env.send({ type: 'state', state: st() });
  env.click({ shopcat: 'items' });
  assert.ok(env.elements.get('tab-shop').innerHTML.includes('data-use="vitamins"'), 'use button for vitamins');
  env.click({ use: 'vitamins' });
  assert.equal(JSON.stringify(env.posted.find(m => m.action === 'useItem' && m.arg.item === 'vitamins').arg), JSON.stringify({ item: 'vitamins' }));

  env.send({ type: 'tab', tab: 'dex' });
  const dex = env.elements.get('tab-dex').innerHTML;
  assert.ok(dex.includes('Artefacts') && dex.includes('The Lost Semicolon') && dex.includes('? ? ?'), 'found and hidden artefacts');

  env.send({ type: 'tab', tab: 'team' });
  const team = env.elements.get('tab-team').innerHTML;
  assert.ok(team.includes('Weekly Challenge') && team.includes('Bit'), 'leaderboard with the teammate');

  env.send({ type: 'tab', tab: 'pet' });
  env.click({ drawer: 'games' });
  const games = env.elements.get('drawer-games').innerHTML;
  assert.ok(games.includes('Weekly Challenge') && games.includes('Linked List') && games.includes('Big-O'), 'games drawer lists the new games and the challenge');
});

test('regex racer content is correct: exactly one of the four strings matches each pattern', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'view.js'), 'utf8');
  const m = /const REGEXES = (\[[\s\S]*?\n  \]);/.exec(src);
  assert.ok(m, 'REGEXES table found');
  const table = new Function('return ' + m[1])();
  assert.ok(table.length >= 20);
  for (const [pat, flags, match, nons] of table) {
    const re = new RegExp(pat, flags);
    assert.ok(re.test(match), `/${pat}/${flags} should match ${JSON.stringify(match)}`);
    assert.equal(nons.length, 3, pat);
    for (const n of nons) assert.ok(!re.test(n), `/${pat}/${flags} should not match ${JSON.stringify(n)}`);
  }
  const m2 = /const SNIPPETS = (\[[\s\S]*?\n  \]);/.exec(src);
  const snippets = new Function('return ' + m2[1])();
  const opts = new Set(['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2ⁿ)']);
  assert.ok(snippets.length >= 16);
  for (const [lines, answer] of snippets) { assert.ok(lines.length && opts.has(answer), answer); }
});

test('both mini-games run to completion and report a result', () => {
  const env = makeEnv();
  env.send(initMsg);
  env.send(state());
  env.click({ game: 'leftright' });
  for (let i = 0; i < 5; i++) env.key('ArrowLeft');
  const lr = env.posted.find(m => m.type === 'action' && m.action === 'playResult');
  assert.ok(lr, 'left/right posts a result');
  assert.equal(lr.arg.game, 'leftright');
  assert.ok(lr.arg.score >= 0 && lr.arg.score <= 5);

  env.click({ game: 'bugs' });
  for (let i = 0; i < 20; i++) { env.tickAll(); env.key(String(1 + (i % 9))); }
  const realNow = Date.now;
  Date.now = () => realNow() + 21000;
  try { env.tickAll(); } finally { Date.now = realNow; }
  const bugs = env.posted.filter(m => m.type === 'action' && m.action === 'playResult' && m.arg.game === 'bugs');
  assert.equal(bugs.length, 1);
});

test('share card posts a PNG data URL with a caption', () => {
  const env = makeEnv();
  env.send(initMsg);
  env.send(state());
  env.send({ type: 'share' });
  const m = env.posted.find(x => x.type === 'shareImage');
  assert.ok(m);
  assert.ok(m.dataUrl.startsWith('data:image/png;base64,'));
  assert.match(m.caption, /VS Code/);
});

test('every action the UI can send is one the engine understands', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'view.js'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'media', 'index.html'), 'utf8');
  const sent = new Set([...src.matchAll(/data-act(?:ion)?="(\w+)"/g)].map(m => m[1]).concat(['pause', 'lights', 'playResult']));
  const s = createSave(Date.now(), Math.random);
  s.pet.species = 'kitbit'; s.pet.ageMs = 2 * 3600e3;
  for (const a of sent) {
    const r = applyAction(s, a, undefined, { now: Date.now(), rand: Math.random });
    assert.notEqual(r.message, 'Unknown action.', `engine doesn't know "${a}"`);
  }
});

test('every pixel icon the UI references exists and is well-formed', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'media', 'icons.js'), 'utf8'), sandbox);
  const { icons, pxIcon, richText } = sandbox.window.PX;
  for (const [k, v] of Object.entries(icons)) {
    assert.equal(v.px.length, 9, `${k} rows`);
    for (const r of v.px) assert.match(r, /^[.#oyw]{9}$/, `${k} row "${r}"`);
  }
  const view = fs.readFileSync(path.join(__dirname, '..', 'media', 'view.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'media', 'index.html'), 'utf8');
  const names = new Set([
    ...[...view.matchAll(/\bic\(["'](\w+)["']/g)].map(m => m[1]),
    ...[...html.matchAll(/data-icon="(\w+)"/g)].map(m => m[1]),
    ...[...view.matchAll(/(?:FOOD_ICON|GAME_ICON|ACH_ICON) = \{([^}]+)\}/g)].flatMap(m => [...m[1].matchAll(/:\s*'(\w+)'/g)].map(x => x[1])),
    ...Object.keys(catalog.ACCESSORIES),
  ]);
  for (const n of names) assert.ok(icons[n], `missing icon "${n}"`);
  for (const id of Object.keys(catalog.ACHIEVEMENTS)) assert.ok(view.includes(` ${id}: '`), `achievement ${id} has no icon`);
  assert.match(pxIcon('coin'), /^<svg class="px /);
  assert.equal(richText('<b>'), '&lt;b&gt;', 'escapes HTML');
  assert.match(richText('Ship it! 🚢 +10🪙'), /<svg[^>]*>.*<svg/);
});

test('UI: shiny pet, focus mode, quests, team tab and weekly recap render without throwing', () => {
  const env = makeEnv();
  env.send(initMsg);
  const now = Date.now();
  const s = createSave(now, Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'octocoder'; s.pet.shiny = true; s.pet.trait = 'gamer';
  s.items.streakShield = 1; s.shinies.octocoder = true;
  require('../src/core/quests').ensureQuests(s, now);
  require('../src/core/rewards').recordActivity(s, { chars: 900, codingMs: 20 * 60e3, langs: { python: 20 * 60e3 } }, now);
  const team = {
    sharing: true, hasWorkspace: true, displayName: 'me',
    members: [{ id: 'ada', name: 'Ada', pet: { name: 'Bit', species: 'kitbit', speciesName: 'Kitbit', stage: 'child', shiny: true, mood: 'happy', hat: null, face: null, screen: 'mint' }, streak: 4, achievements: 9, generation: 1, updatedAt: now - 60e3 }],
  };
  for (const focus of [null, { phase: 'work', startedAt: now, endsAt: now + 25 * 60e3, total: 25 * 60e3 }, { phase: 'break', startedAt: now, endsAt: now + 5 * 60e3, total: 5 * 60e3 }]) {
    const st = JSON.parse(JSON.stringify(snapshot(s, now, { focus, team })));
    env.send({ type: 'state', state: st, message: 'Ship it! 🚢 +10🪙', anim: 'heart' });
    for (const tab of ['pet', 'shop', 'dex', 'team', 'stats']) {
      env.send({ type: 'tab', tab, scrollTo: 'quests' });
      for (let i = 0; i < 3; i++) env.tickAll();
    }
  }
  env.send({ type: 'recap' });
  assert.ok(env.elements.get('recap').innerHTML.includes('Your week with'));
  env.click({ close: '' });
  assert.equal(env.elements.get('recap').hidden, true);
  assert.ok(env.elements.get('quests').innerHTML.includes('Daily quests'));
  assert.ok(env.elements.get('info').innerHTML.includes('Shiny'));
  assert.ok(env.elements.get('tab-team') !== undefined);
});

test('arcade: every new game starts, takes input and reports a valid score', () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    for (const id of ['dash', 'stack', 'simon', 'hotkeys', 'merge', 'snake', 'pipeline', 'breakout', 'pong', 'bisect', 'regex', 'bigo']) {
      const env = makeEnv();
      env.send(initMsg);
      env.send(state());
      env.click({ game: id });
      for (let i = 0; i < 400; i++) {
        clock += 50;
        env.tickAll();
        if (i % 7 === 0) env.key(' ');
        if (i % 9 === 0) env.key(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'][i % 4]);
        if (i % 11 === 0) env.click({ gamebtn: { dash: 'jump', stack: 'drop', simon: 'dir:up', hotkeys: 'noop', merge: 'pick:ours', snake: 'dir:up', pipeline: 'flap', breakout: 'launch', pong: 'up', bisect: 'test', regex: 'opt:0', bigo: 'opt:1' }[id] });
        if (env.posted.some(m => m.action === 'playResult')) break;
      }
      // Time-limited games (hot keys) and survival games end on their own; the rest can be quit.
      clock += 60000;
      for (let i = 0; i < 5; i++) env.tickAll();
      let result = env.posted.find(m => m.type === 'action' && m.action === 'playResult');
      if (!result) { env.click({ gamebtn: 'quit' }); }
      result = env.posted.find(m => m.type === 'action' && m.action === 'playResult');
      if (result) {
        assert.equal(result.arg.game, id);
        assert.ok(Number.isInteger(result.arg.score) && result.arg.score >= 0 && result.arg.score <= catalog.GAMES[id].maxScore, `${id} score ${result.arg.score}`);
      }
      assert.ok(result || ['merge', 'simon', 'bisect', 'bigo', 'breakout', 'snake'].includes(id), `${id} should end by itself`);
    }
  } finally {
    Date.now = realNow;
  }
});

test('sprites are well-formed rectangles', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'media', 'sprites.js'), 'utf8'), sandbox);
  for (const [k, rows] of Object.entries(sandbox.window.SPRITES)) {
    for (const r of rows) {
      assert.equal(r.length, rows[0].length, `${k}: ragged row "${r}"`);
      assert.match(r, /^[.#Eem]+$/, `${k}: bad char in "${r}"`);
    }
  }
});

test('every game in the catalog has a UI and an icon', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'media', 'view.js'), 'utf8');
  for (const id of Object.keys(catalog.GAMES)) {
    assert.ok(view.includes(`${id}: '`), `${id} missing from GAME_ICON`);
    assert.ok(['leftright', 'bugs'].includes(id) || view.includes(`const ${id} = {`), `${id} has no implementation`);
  }
});

test('arcade games are winnable: an autopilot scores well in each', () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const scores = {};
  try {
    const play = (id, pilot, maxMs = 120000) => {
      const env = makeEnv();
      env.send(initMsg);
      env.send(state());
      env.click({ game: id });
      for (let t = 0; t < maxMs && env.game(); t += 16) {
        clock += 16;
        env.tickAll();
        const g = env.game();
        if (g && !g.over) pilot(g, env);
      }
      const r = env.posted.find(m => m.action === 'playResult' && m.arg.game === id);
      const live = env.game();
      scores[id] = r ? r.arg.score : live ? live.score : -1; // still going when time ran out: that's a survival
      return scores[id];
    };

    // Dash: jump when the next bug is a few cells away (a reasonable human reaction).
    play('dash', (g, env) => {
      const next = g.obstacles.find(o => o.x + 4 > 5);
      if (next && g.y === 0 && next.x < 9 + g.speed * 0.25) env.key(" ");
    }, 90000);
    assert.ok(scores.dash >= 20, `dash autopilot only dodged ${scores.dash}`);

    // Stack: drop when the sliding layer lines up with the one below.
    play('stack', (g, env) => {
      const prev = g.layers[g.layers.length - 1];
      if (Math.abs(g.cur.x - prev.x) < 0.6) env.key(' ');
    });
    assert.ok(scores.stack >= 15, `stack autopilot only stacked ${scores.stack}`);

    // Simon: repeat the sequence once it's our turn.
    const keyFor = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    play('simon', (g, env) => { if (g.phase === 'input') env.key(keyFor[g.seq[g.input]]); }, 600000);
    assert.equal(scores.simon, catalog.GAMES.simon.maxScore);

    // Hot Keys: type the token (through the real input handler).
    play('hotkeys', (g, env) => {
      const input = env.elements.get('hk-input') || { value: '' };
      input.id = 'hk-input';
      input.value = g.token;
      env.input(input);
    }, 35000);
    assert.equal(scores.hotkeys, catalog.GAMES.hotkeys.maxScore);

    // Merge: always pick the correct side.
    play('merge', (g, env) => { if (g.phase === 'choose') env.key(g.rounds[g.round].correct === 'ours' ? 'ArrowLeft' : 'ArrowRight'); });
    assert.equal(scores.merge, 5);

    // Linked List: greedy toward the food, never into a wall or yourself.
    play('snake', (g, env) => {
      const [hx, hy] = g.body[0];
      const dirs = [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]
        .filter(([, dx, dy]) => !(dx === -g.dir[0] && dy === -g.dir[1]))
        .filter(([, dx, dy]) => { const x = hx + dx, y = hy + dy; return x >= 0 && x < 40 && y >= 1 && y < 24 && !g.body.some(b => b[0] === x && b[1] === y); })
        .sort((a, b) => (Math.abs(hx + a[1] - g.food[0]) + Math.abs(hy + a[2] - g.food[1])) - (Math.abs(hx + b[1] - g.food[0]) + Math.abs(hy + b[2] - g.food[1])));
      if (dirs.length) env.key(dirs[0][0]);
    }, 90000);
    assert.ok(scores.snake >= 8, `snake autopilot only reached ${scores.snake}`);

    // Pipeline: flap whenever we're below the safe line for the next gate.
    play('pipeline', (g, env) => {
      const next = g.gates.find(o => o.x + 3 >= 6) || { gapY: 8, gapH: 9 };
      const target = next.gapY + next.gapH - 5 - 1.5;
      if (!g.started || (g.y > target && g.vy > -6)) env.key(' ');
    }, 90000);
    assert.ok(scores.pipeline >= 8, `pipeline autopilot only passed ${scores.pipeline}`);

    // Tech Debt: keep the paddle under the ball.
    play('breakout', (g, env) => {
      if (!g.ball.live) env.key(' ');
      const c = g.px + 3.5;
      if (g.ball.x < c - 0.6) env.key('ArrowLeft'); else if (g.ball.x > c + 0.6) env.key('ArrowRight');
    }, 240000);
    assert.ok(scores.breakout >= 15, `breakout autopilot only cleared ${scores.breakout}`);

    // Packet Pong: track the ball.
    play('pong', (g, env) => {
      const c = g.py + 2.5;
      if (g.ball.y < c - 0.6) env.key('ArrowUp'); else if (g.ball.y > c + 0.6) env.key('ArrowDown');
    }, 120000);
    assert.ok(scores.pong >= 10, `pong autopilot only returned ${scores.pong}`);

    // Git Bisect: a real binary search always fits the budget.
    play('bisect', (g, env) => {
      if (g.phase !== 'pick') return;
      env.input({ id: 'bisect-range', value: String(Math.floor((g.lo + g.hi) / 2)) });
      env.click({ gamebtn: 'test' });
    });
    assert.equal(scores.bisect, 5);

    // Regex Racer and Big-O: pick the right answer.
    play('regex', (g, env) => { if (g.phase === 'choose') env.click({ gamebtn: 'opt:' + g.rounds[g.round].answer }); });
    assert.equal(scores.regex, 8);
    play('bigo', (g, env) => { if (g.phase === 'choose') env.key(String(g.rounds[g.round].answer + 1)); });
    assert.equal(scores.bigo, 6);
  } finally {
    Date.now = realNow;
  }
});

test('shop UI: every section, haggle form, sell confirm, mystery reveal and quest reroll render', () => {
  const env = makeEnv();
  const init = JSON.parse(JSON.stringify(initMsg));
  Object.assign(init.catalog, JSON.parse(JSON.stringify({ TRAITS: catalog.TRAITS, ITEMS: catalog.ITEMS, QUESTS: catalog.QUESTS, BUNDLES: catalog.BUNDLES, SHOP: catalog.SHOP })));
  env.send(init);
  const now = Date.now();
  const s = createSave(now, Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'mochimon';
  s.coins = 180; s.owned.crown = true; s.owned.matrix = true; s.owned.halo = true; s.equipped.hat = 'halo'; s.equipped.screen = 'matrix';
  s.items.questReroll = 1;
  require('../src/core/quests').ensureQuests(s, now);
  const st = () => JSON.parse(JSON.stringify(snapshot(s, now)));
  env.send({ type: 'state', state: st(), shopkeeper: 'welcome' });
  env.send({ type: 'tab', tab: 'shop' });
  const shopHtml = () => env.elements.get('tab-shop').innerHTML;
  for (const cat of ['featured', 'wardrobe', 'screens', 'food', 'items', 'owned']) {
    env.click({ shopcat: cat });
    assert.ok(shopHtml().includes('Mx. Stash'), `${cat}: shopkeeper`);
    env.tickAll();
  }
  env.click({ shopcat: 'wardrobe' });
  assert.ok(shopHtml().includes('Wizard Hat') && shopHtml().includes('Halo'), 'owned exclusives show in the wardrobe');
  env.click({ haggle: 'wizard' });
  assert.ok(shopHtml().includes('haggle-range'), 'haggle form opens');
  env.elements.set('haggle-range', { value: '200' });
  env.click({ haggleOffer: 'wizard' });
  const offer = env.posted.find(m => m.action === 'haggle');
  assert.equal(JSON.stringify(offer && offer.arg), JSON.stringify({ id: 'wizard', offer: 200 }));

  env.click({ shopcat: 'owned' });
  env.click({ sell: 'crown' });
  assert.ok(shopHtml().includes('Sell for'), 'sell asks for confirmation first');

  env.send({ type: 'state', state: st(), reveal: { id: 'mask', kind: 'accessory', exclusive: true }, shopkeeper: 'exclusive', message: '🎁 EXCLUSIVE! You unboxed Bandit Mask!' });
  assert.ok(shopHtml().includes('Box exclusive'), 'mystery reveal card');
  env.click({ revealClose: '' });

  env.send({ type: 'tab', tab: 'pet' });
  assert.ok(env.elements.get('quests').innerHTML.includes('data-reroll'), 'quest reroll button shows when you own a reroll');
  env.click({ reroll: '1' });
  assert.equal(JSON.stringify(env.posted.find(m => m.action === 'useItem').arg), JSON.stringify({ item: 'questReroll', index: 1 }));
});

test('shop renders deals of every kind (consumable, food, accessory, screen) deterministically', () => {
  const env = makeEnv();
  env.send(initMsg);
  const now = Date.now();
  const s = createSave(now, Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'kitbit'; s.coins = 50;
  require('../src/core/shop').ensureShop(s, now);
  for (const deals of [['questReroll', 'apple', 'wizard'], ['focusBoost', 'matrix', 'streakShield'], ['cake', 'monocle', 'sunset']]) {
    s.shop.deals = deals;
    env.send({ type: 'state', state: JSON.parse(JSON.stringify(snapshot(s, now))) });
    env.send({ type: 'tab', tab: 'shop' });
    env.click({ shopcat: 'featured' });
    const html = env.elements.get('tab-shop').innerHTML;
    for (const id of deals) assert.ok(html.includes(`data-arg="${id}"`), `${id} deal card rendered`);
  }
});

test('vault: locked teaser, redeem box posts the code, and the galactic transformation renders', () => {
  const env = makeEnv();
  env.send(initMsg);
  const now = Date.now();
  const s = createSave(now, Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'octocoder';
  const st = () => JSON.parse(JSON.stringify(snapshot(s, now)));
  env.send({ type: 'state', state: st() });
  env.send({ type: 'tab', tab: 'shop' });
  const html = () => env.elements.get('tab-shop').innerHTML;
  assert.ok(html().includes('The Vault') && html().includes('data-preview="locked:galactic"'), 'locked teaser');
  env.elements.set('promo-input', { value: 'my-code' });
  env.click({ redeem: '' });
  assert.equal(JSON.stringify(env.posted.find(m => m.type === 'redeem')), JSON.stringify({ type: 'redeem', code: 'my-code' }));
  assert.ok(html().includes('data-link="drops"'), 'code-drop link shown');
  env.click({ link: 'drops' });
  assert.equal(JSON.stringify(env.posted.find(m => m.type === 'openLink')), JSON.stringify({ type: 'openLink', id: 'drops' }), 'asks the host by name, never sends a URL');

  s.owned.galactic = true;
  s.equipped.theme = 'galactic';
  env.send({ type: 'state', state: st() });
  assert.ok(html().includes('Transform back'), 'unlocked + equipped');
  for (const tab of ['pet', 'shop', 'team']) { env.send({ type: 'tab', tab }); for (let i = 0; i < 6; i++) env.tickAll(); }
  s.pet.asleep = true;
  env.send({ type: 'state', state: st() });
  for (let i = 0; i < 3; i++) env.tickAll();
});

test('feed drawer: suggestion fits the need, diet tracker, chips filter, tastes and specials show', () => {
  const env = makeEnv();
  env.send(initMsg);
  const now = Date.now();
  const s = createSave(now, Math.random);
  s.pet.ageMs = 2 * 3600e3; s.pet.species = 'kitbit';
  Object.assign(s.pet, { hunger: 70, happy: 70, energy: 70, health: 40, sick: true, sickSince: now });
  s.inventory = { soup: 1, cookie: 2 };
  const st = () => JSON.parse(JSON.stringify(snapshot(s, now)));
  env.send({ type: 'state', state: st() });
  env.click({ drawer: 'feed' });
  const html = () => env.elements.get('drawer-feed').innerHTML;
  assert.ok(html().includes('Suggested'), 'has a suggestion');
  assert.ok(/Suggested[^<]*is sick[\s\S]*Chicken Soup/.test(html()), 'suggests soup for a sick pet');
  assert.ok(html().includes('Balanced diet'), 'diet tracker');
  assert.ok(html().includes('untasted'), 'untasted foods are flagged');
  env.click({ foodcat: 'pantry' });
  assert.ok(html().includes('Chicken Soup') && html().includes('Cookie') && !html().includes('>Ramen<'), 'pantry shows only what you have');
  env.click({ foodcat: 'drinks' });
  assert.ok(html().includes('Green Tea') && !html().includes('>Cookie<'), 'drinks only');
  const { tastesOf } = require('../src/core/food');
  const t = tastesOf(s.pet);
  s.pet.tasted[t.fav] = true;
  env.send({ type: 'state', state: st() });
  env.click({ foodcat: 'all' });
  assert.ok(html().includes('fave'), 'discovered favourite is marked');
  assert.ok(html().includes('Chef') , 'chef special is marked');
});
