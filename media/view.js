// @ts-check
/* global acquireVsCodeApi */
(function () {
  'use strict';
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  // @ts-ignore
  const S = window.SPRITES;
  // @ts-ignore
  const HAT_OFFSET = window.HAT_OFFSET || {};
  // @ts-ignore
  const HAT_LIFT = window.HAT_LIFT || {};
  // @ts-ignore
  const PX = window.PX;
  const ic = (name, cls) => PX.pxIcon(name, cls);

  // Which pixel icon represents each catalog entry (accessories use their own id).
  // Pixel icon per food (most foods use their own id).
  const FOOD_ICON = new Proxy({ meal: 'rice', snack: 'candy' }, { get: (t, k) => (typeof k === 'string' ? t[k] || k : undefined) });
  const GAME_ICON = { leftright: 'arrows', bugs: 'bug', dash: 'rocket', stack: 'layers', simon: 'duck', hotkeys: 'keyboard', merge: 'code',
    snake: 'snake', pipeline: 'pipe', breakout: 'bricks', pong: 'paddle', bisect: 'bisect', regex: 'regex', bigo: 'bigo' };
  // Pixel icon per achievement track.
  const ACH_ICON = {
    hatch: 'chick', meals: 'rice', adults: 'star', mindReader: 'orb', bugBlitz: 'bug', exterminator: 'bug', cleans: 'sponge',
    cures: 'health', streak: 'flame', deepWork: 'bulb', chars: 'keyboard', commits: 'ship', errors: 'check', tasks: 'light',
    collector: 'book', pokedex: 'crown', shiny: 'sparkle', fashion: 'tophat', moneybags: 'coins', nightOwl: 'moon', earlyBird: 'sun',
    survivor: 'shield', dynasty: 'tree', quests: 'scroll', questMaster: 'trophy', focus: 'tomato', polyglot: 'code', milestones: 'cake',
    shielded: 'shield', team: 'team', dash: 'rocket', stack: 'layers', simon: 'duck', hotkeys: 'keyboard', merge: 'code',
    arcade: 'ball', gamesPlayed: 'trophy', haggler: 'keeper', lucky: 'gift', vaultHunter: 'lock', gourmet: 'bento', balanced: 'salad',
    snake: 'snake', pipeline: 'pipe', breakout: 'bricks', pong: 'paddle', bisect: 'bisect', regex: 'regex', bigo: 'bigo',
    challenger: 'trophy', explorer: 'map', archaeologist: 'compass', decorator: 'plant', rubberDuck: 'duck', tester: 'flask',
  };
  const QUEST_ICON = {
    chars: 'keyboard', saves: 'floppy', commits: 'ship', minutes: 'bulb', games: 'ball', feeds: 'rice', cleans: 'sponge',
    bugFree: 'check', tasks: 'light', focus: 'tomato', languages: 'code', tests: 'flask', duck: 'duck', expedition: 'map', challenge: 'trophy',
  };
  const MOOD_WORD = { dead: 'at rest', vacation: 'on vacation', egg: 'an egg', asleep: 'asleep', sick: 'sick', sad: 'sad', worried: 'worried', happy: 'happy', ok: 'content', focused: 'focused', away: 'away exploring' };
  const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };

  // Static markup uses <i data-icon="name">; fill those in once.
  document.querySelectorAll('[data-icon]').forEach(el => {
    const e = /** @type {HTMLElement} */ (el);
    e.outerHTML = ic(e.dataset.icon, e.className);
  });

  const W = 40, H = 24;
  const LIGHTS_OFF = { bg: '#3a4131', ghost: '#353c2d', ink: '#1a1e14' };
  const SHELLS = ['charcoal', 'snow', 'pink', 'blue', 'mint', 'lemon', 'grape'];
  const TABS = ['pet', 'shop', 'dex', 'team', 'journal', 'stats'];

  /** @type {any} */ let catalog = null;
  /** @type {any} */ let snap = null;
  let settings = { sound: false };

  const persisted = (() => { try { return vscode.getState() || {}; } catch { return {}; } })();
  const ui = {
    tab: TABS.includes(persisted.tab) ? persisted.tab : 'pet',
    shell: SHELLS.includes(persisted.shell) ? persisted.shell : 'charcoal',
    drawer: /** @type {string|null} */ (null),
    shopCat: typeof persisted.shopCat === 'string' ? persisted.shopCat : 'featured',
    haggle: /** @type {string|null} */ (null),
    confirmSell: /** @type {string|null} */ (null),
    reveal: /** @type {any} */ (null),
    keeper: /** @type {any} */ (null),
  };
  const persist = () => { try { vscode.setState({ tab: ui.tab, shell: ui.shell, shopCat: ui.shopCat }); } catch { /* ignore */ } };

  /** @type {any} */ let game = null;
  /** @type {{kind: string, sprite?: string, until: number, start: number} | null} */ let anim = null;
  let petX = 12, targetX = 12, look = 0, lastFrame = -1;
  /** The pet wandering over to use a room decoration: { zone, fx, until } */
  /** @type {{zone: string, fx: string|null, until: number} | null} */ let visit = null;
  let duckText = '';

  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const send = (action, arg) => vscode.postMessage({ type: 'action', action, arg });
  const command = id => vscode.postMessage({ type: 'command', id });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =====================================================================
  // LCD renderer
  // =====================================================================
  const grid = new Uint8Array(W * H);
  // Pixel value 1 = normal ink, 2 = shiny ink (used for a shiny pet's body).
  let inkVal = 1;
  const plot = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = inkVal; };
  /** Draw the pet itself, in shiny ink if it's a shiny. */
  function drawPet(key, x, y, opt) {
    inkVal = snap && snap.pet.shiny ? 2 : 1;
    draw(S[key], x, y, opt);
    inkVal = 1;
  }

  /** @param {string[]} sprite */
  function draw(sprite, ox, oy, opt = /** @type {{blink?: boolean, look?: number, crop?: number, noMouth?: boolean}} */ ({})) {
    if (!sprite) return;
    for (let y = 0; y < sprite.length; y++) {
      const row = sprite[y];
      for (let x = 0; x < row.length; x++) {
        if (opt.crop !== undefined && x >= opt.crop) continue;
        const c = row[x];
        if (c === '#') plot(ox + x, oy + y);
        else if (c === 'E') { if (!opt.blink) plot(ox + x + (opt.look || 0), oy + y); }
        else if (c === 'e') plot(ox + x + (opt.look || 0), oy + y);
        else if (c === 'm' && !opt.noMouth) plot(ox + x, oy + y);
      }
    }
  }

  /** Where hats and glasses go on a given pet sprite (computed from the pixels). */
  const anchorCache = {};
  function anchors(key) {
    if (anchorCache[key]) return anchorCache[key];
    const rows = S[key];
    let headTop = rows.findIndex(r => r.includes('#'));
    if (headTop < 0) headTop = 0;
    let bottom = rows.length - 1;
    while (bottom > 0 && !rows[bottom].includes('#')) bottom--;
    const top = rows[headTop];
    const cx = (top.indexOf('#') + top.lastIndexOf('#')) / 2;
    /** @type {number[][][]} */ const eyes = [[], []];
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'E' || c === 'e') eyes[x < 8 ? 0 : 1].push([x, y]); }));
    const boxes = eyes.filter(e => e.length).map(pts => ({
      x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])),
      y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])),
    }));
    return (anchorCache[key] = { headTop, bottom, cx, boxes });
  }

  /** A held prop sits beside the pet, on whichever side has room. Balloons float. */
  function drawProp(id, ox, oy, a, now) {
    const spr = S[id];
    if (!spr) return;
    const w = spr[0].length;
    const x = ox + 16 + w <= W ? ox + 16 : ox - w - 1;
    if (id === 'balloon') { draw(spr, x, oy + a.headTop - 3 + (Math.floor(now / 600) % 2)); return; }
    draw(spr, x, oy + a.bottom - spr.length + 1);
  }

  function drawAccessories(key, ox, oy, equipped, now = 0) {
    if (!equipped || key === 'egg' || key === 'grave') return;
    const a = anchors(key);
    const hat = equipped.hat && S[equipped.hat];
    if (hat) {
      const w = hat[0].length;
      draw(hat, Math.round(ox + a.cx - (w - 1) / 2 + (HAT_OFFSET[equipped.hat] || 0)), oy + a.headTop - hat.length - (HAT_LIFT[equipped.hat] || 0));
    }
    if (equipped.prop && S[equipped.prop]) drawProp(equipped.prop, ox, oy, a, now);
    const first = a.boxes[0], last = a.boxes[a.boxes.length - 1];
    if (equipped.face === 'eyepatch' && last) {
      // A solid patch over the right eye, with a strap across the brow.
      for (let y = last.y0 - 1; y <= last.y1 + 1; y++) for (let x = last.x0 - 1; x <= last.x1 + 1; x++) plot(ox + x, oy + y);
      for (let x = first.x0 - 2; x < last.x0 - 1; x++) plot(ox + x, oy + last.y0 - 1);
    } else if (equipped.face === 'mustache' && first && last) {
      const y = Math.max(first.y1, last.y1) + 2;
      const mid = Math.round((first.x1 + last.x0) / 2);
      for (let x = first.x0; x <= last.x1; x++) if (x !== mid) plot(ox + x, oy + y);
      plot(ox + first.x0 - 1, oy + y + 1); plot(ox + last.x1 + 1, oy + y + 1);
    } else if (equipped.face === 'heartGlasses') {
      // Glasses drawn in the shine colour, so the frames read as rosy.
      const keep = inkVal;
      inkVal = 2;
      for (const b of a.boxes) {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { plot(ox + x, oy + b.y0 - 1); plot(ox + x, oy + b.y1 + 1); }
        for (let y = b.y0 - 1; y <= b.y1 + 1; y++) { plot(ox + b.x0 - 1, oy + y); plot(ox + b.x1 + 1, oy + y); }
        plot(ox + b.x0, oy + b.y0 - 2); plot(ox + b.x1, oy + b.y0 - 2);
      }
      if (a.boxes.length === 2) for (let x = first.x1 + 2; x <= last.x0 - 2; x++) plot(ox + x, oy + first.y0);
      inkVal = keep;
    } else if (equipped.face === 'monocle') {
      // One lens on the right eye, with a little chain.
      const b = a.boxes[a.boxes.length - 1];
      if (b) {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { plot(ox + x, oy + b.y0 - 1); plot(ox + x, oy + b.y1 + 1); }
        for (let y = b.y0 - 1; y <= b.y1 + 1; y++) { plot(ox + b.x0 - 1, oy + y); plot(ox + b.x1 + 1, oy + y); }
        plot(ox + b.x1 + 2, oy + b.y1 + 2); plot(ox + b.x1 + 2, oy + b.y1 + 3);
      }
    } else if (equipped.face === 'mask') {
      // A bandit band across the eyes, with the eyes left showing.
      if (a.boxes.length) {
        const x0 = a.boxes[0].x0 - 2, x1 = a.boxes[a.boxes.length - 1].x1 + 2;
        const y0 = Math.min(...a.boxes.map(b => b.y0)) - 1, y1 = Math.max(...a.boxes.map(b => b.y1)) + 1;
        const eye = (x, y) => a.boxes.some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!eye(x, y)) plot(ox + x, oy + y);
      }
    } else if (equipped.face) {
      for (const b of a.boxes) {
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { plot(ox + x, oy + b.y0 - 1); plot(ox + x, oy + b.y1 + 1); }
        for (let y = b.y0 - 1; y <= b.y1 + 1; y++) { plot(ox + b.x0 - 1, oy + y); plot(ox + b.x1 + 1, oy + y); }
        if (equipped.face === 'shades') for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) plot(ox + x, oy + y);
      }
      if (a.boxes.length === 2) for (let x = a.boxes[0].x1 + 2; x <= a.boxes[1].x0 - 2; x++) plot(ox + x, oy + a.boxes[0].y0 - 1);
    }
  }

  // ----- themes (Vault transformations) -----
  const themeOf = eq => (eq && eq.theme && catalog && catalog.THEMES && catalog.THEMES[eq.theme]) || null;
  /** The look actually drawn: a theme overrides the hat and face. */
  const themedEquip = eq => { const th = themeOf(eq); return th ? { ...eq, ...th.look } : eq; };
  // Fixed starfield positions (LCG so they're the same every frame).
  const STARS = [];
  for (let i = 0, seed = 7; i < 26; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; STARS.push([seed % W, (seed >> 8) % H, i]); }
  function drawStarfield(now) {
    const f = Math.floor(now / 380);
    inkVal = 3;
    for (const [x, y, i] of STARS) if ((f + i * 3) % 7 !== 0 && !grid[y * W + x]) plot(x, y);
    // An occasional shooting star across the top.
    const t = (now % 7000) / 7000;
    if (t < 0.12) { const sx = Math.round(4 + t * 260), sy = Math.round(1 + t * 30); for (let k = 0; k < 3; k++) if (!grid[(sy - k) * W + sx - k] && sy - k >= 0) plot(sx - k, sy - k); }
    inkVal = 1;
  }
  /** A flickering laser sword held beside the pet. */
  function drawSaber(px, py, now) {
    const x = px + 16 < W - 1 ? px + 16 : px - 2;
    const len = 7 + (Math.floor(now / 90) % 3 === 0 ? -1 : 0);
    inkVal = 4;
    for (let y = py + 9 - len; y < py + 9; y++) plot(x, y);
    inkVal = 1;
    plot(x, py + 9); plot(x, py + 10);
  }

  /** Plot only on empty cells, so ambience always sits behind the pet. */
  const plotE = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H && !grid[y * W + x]) grid[y * W + x] = v; };
  function drawSpriteE(sprite, ox, oy, v) {
    sprite.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') plotE(ox + x, oy + y, v); }));
  }
  /** Each theme's living background. Values: 2 = shine, 3 = star (dim), 4 = glow (bright). */
  function drawAmbient(kind, now) {
    const cyc = (period, offset) => ((now + offset) % period) / period;
    switch (kind) {
      case 'stars': drawStarfield(now); return;
      case 'rain':
        for (let i = 0; i < 10; i++) {
          const x = 1 + i * 4;
          const y = Math.floor((now / (60 + (i % 3) * 22) + i * 11) % (H + 6)) - 3;
          plotE(x, y, 4); plotE(x, y - 1, 3); plotE(x, y - 2, 3); plotE(x, y - 4, 3);
        }
        return;
      case 'bubbles':
        for (let i = 0; i < 8; i++) {
          const t = cyc(5200 + i * 650, i * 1300);
          const y = Math.round(H - 1 - t * (H + 2));
          const x = (3 + i * 5 + Math.round(Math.sin(t * 6 + i) * 1.5) + W) % W;
          plotE(x, y, 3);
          if (i % 3 === 0) { plotE(x + 1, y - 1, 3); plotE(x - 1, y - 1, 3); plotE(x, y - 2, 3); }
        }
        [1, 4, 35, 38].forEach((x, i) => {
          for (let h = 0; h < 4 + (i % 3); h++) plotE(x + (h > 1 ? Math.round(Math.sin(now / 600 + i + h * 0.7)) : 0), H - 1 - h, 4);
        });
        return;
      case 'bats':
        drawSpriteE(S.moon, 33, 1, 2);
        drawSpriteE(S.pumpkin, 1, 19, 4);
        for (let i = 0; i < 3; i++) {
          const x = Math.round((now / 70 + i * 17) % (W + 10)) - 8;
          const y = 2 + i * 3 + Math.round(Math.sin(now / 300 + i));
          drawSpriteE(Math.floor(now / 180 + i) % 2 ? S.batA : S.batB, x, y, 3);
        }
        return;
      case 'snow':
        for (let i = 0; i < 16; i++) {
          const t = cyc(7000 + i * 420, i * 900);
          const y = Math.round(t * (H + 1)) - 1;
          const x = (i * 7 + 3 + Math.round(Math.sin(t * 8 + i) * 1.5) + W * 2) % W;
          plotE(x, y, 3);
        }
        for (let x = 0; x < W; x++) { plotE(x, H - 1, 3); if ((x * 7) % 5 < 2) plotE(x, H - 2, 3); }
        return;
      case 'petals':
        for (let i = 0; i < 10; i++) {
          const t = cyc(6400 + i * 480, i * 1100);
          const x = Math.round((i * 9 + t * 16) % W);
          const y = Math.round(t * (H + 2)) - 1 + Math.round(Math.sin(t * 10 + i));
          plotE(x, y, 4); plotE(x + 1, y, 3);
        }
        return;
    }
  }
  // ----- the room: decorations behind the pet -----
  /** Where each zone's decoration sits (top-left), given the sprite size. */
  function decorPos(zone, spr) {
    const w = spr[0].length, h = spr.length;
    switch (zone) {
      case 'wallL': return [2, 1];
      case 'wallR': return [W - 2 - w, 1];
      case 'floorL': return [1, H - 1 - h];
      case 'floorR': return [W - 1 - w, H - 1 - h];
      default: return [Math.floor((W - w) / 2), H - h];
    }
  }
  function drawDecorAt(id, zone, now, v = 3) {
    const spr = S[id];
    if (!spr) return;
    const [x, y] = decorPos(zone, spr);
    drawSpriteE(spr, x, y, v);
    const f = Math.floor(now / 500);
    // A little life: server lights blink, the aquarium bubbles, the lamp glows.
    if (id === 'server') for (let i = 0; i < 3; i++) if ((f + i) % 3 === 0) plotE(x + 2 + i * 2, y + 1 + (i % 2) * 3, 4);
    if (id === 'aquarium') plotE(x + 6 - (f % 3), y + 1 + ((f >> 1) % 2), 4);
    if (id === 'lamp') { plotE(x + 3, y + 3, 4); plotE(x + 2, y + 4, 4); plotE(x + 4, y + 4, 4); }
    if (id === 'monitor') for (let i = 0; i < 4; i++) if ((f + i) % 5 < 3) plotE(x + 2 + i, y + 2 + (i % 2), 4);
  }
  function drawRoom(now) {
    const room = snap && snap.room;
    if (!room || !catalog || !catalog.DECOR) return;
    for (const zone of catalog.DECOR_ZONES || Object.keys(room)) if (room[zone] && catalog.DECOR[room[zone]]) drawDecorAt(room[zone], zone, now);
  }
  /** A real sky: the moon and a few stars after dark (local time). */
  function drawSky(now) {
    const hour = new Date(now).getHours();
    if (hour < 21 && hour >= 5) return;
    drawSpriteE(S.moon, 34, 1, 3);
    const f = Math.floor(now / 700);
    [[3, 2], [9, 1], [15, 3], [22, 1], [28, 2], [31, 4]].forEach(([x, y], i) => { if ((f + i) % 4 !== 0) plotE(x, y, 3); });
  }
  /** Mid-tone for dim pixels on screens that don't define one. */
  const mixCache = {};
  function starOf(pal) {
    if (pal.star) return pal.star;
    const k = pal.bg + pal.ink;
    if (mixCache[k]) return mixCache[k];
    const a = parseInt(pal.bg.slice(1), 16), b = parseInt(pal.ink.slice(1), 16);
    const ch = s => Math.round(((a >> s) & 255) * 0.55 + ((b >> s) & 255) * 0.45);
    return (mixCache[k] = '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0'));
  }

  /** Dim a palette for sleep (lights off). */
  function dimPalette(pal) {
    const dim = hex => { const n = parseInt(hex.slice(1), 16); const c = k => Math.round(((n >> k) & 255) * 0.45); return '#' + ((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0'); };
    return Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, typeof v === 'string' && v[0] === '#' ? dim(v) : v]));
  }

  function flush(ctx, cell, pal, src = grid, w = W, h = H) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w * cell, h * cell);
    const gap = Math.max(1, Math.round(cell / 8));
    const star = starOf(pal);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = src[y * W + x];
        ctx.fillStyle = v === 2 ? (pal.shine || pal.ink) : v === 3 ? star : v === 4 ? (pal.glow || pal.shine || pal.ink) : v ? pal.ink : pal.ghost;
        ctx.fillRect(x * cell + gap, y * cell + gap, cell - gap, cell - gap);
      }
    }
  }

  function screenPalette() {
    if (!catalog || !snap) return { bg: '#c3cc9f', ghost: '#b5bf90', ink: '#2c3222' };
    const th = themeOf(snap.equipped);
    if (th) return snap.pet.asleep && !snap.pet.dead && !snap.paused ? (th.sleepPalette || dimPalette(th.palette)) : th.palette;
    if (snap.pet.asleep && !snap.pet.dead && !snap.paused) return { ...LIGHTS_OFF, shine: '#4a3a22' };
    return catalog.SCREENS[snap.equipped.screen] || catalog.SCREENS.classic;
  }

  const canvas = /** @type {HTMLCanvasElement} */ ($('screen'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  // =====================================================================
  // Scene
  // =====================================================================
  function scene(now) {
    grid.fill(0);
    if (!snap || !catalog) return;
    const p = snap.pet;
    const v = snap.view;
    const frame = Math.floor(now / 450);
    const tickFrame = frame !== lastFrame;
    lastFrame = frame;
    if (anim && now > anim.until) anim = null;

    if (game && game.kind === 'bugs') { bugsScene(now); return; }
    if (game && ARCADE[game.kind]) { ARCADE[game.kind].scene(now); return; }

    const key = S[p.species] ? p.species : 'blip';
    const eq = themedEquip(snap.equipped);
    const themed = !!themeOf(snap.equipped);
    const still = reducedMotion();

    if (p.dead) {
      draw(S.grave, 12, 4);
      const gy = still ? 4 : 8 - (frame % 8);
      plot(30, gy + 6); plot(31, gy + 5); plot(30, gy + 4);
    } else if (snap.paused) {
      drawPet(key, 12, 6, { blink: true });
      drawAccessories(key, 12, 6, eq, now);
      draw(S.sun, 33, 1);
    } else if (snap.expedition && v.expedition && v.expedition.active) {
      // Away: a winding trail across the map, the pet (tiny) somewhere along it, a pin at the end.
      const x = v.expedition.active;
      const prog = still ? 0.5 : Math.max(0, Math.min(1, (now - x.startedAt) / Math.max(1, x.endsAt - x.startedAt)));
      for (let px = 0; px < Math.round(W * prog); px++) plot(px, 0);
      const pathY = t => Math.round(17 - t * 10 + Math.sin(t * 9) * 3);
      for (let t = 0; t <= 1.001; t += 1 / 34) { const px = 2 + Math.round(t * 32); if (Math.round(t * 34) % 2 === 0) plot(px, pathY(t)); }
      draw(S.mapPin, 33, pathY(1) - 6);
      const tx = 2 + Math.round(prog * 32), ty = pathY(prog);
      const bob = still ? 0 : frame % 2;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 0; dy++) plot(tx + dx, ty + dy - 1 - bob);
      if (frame % 3 === 0) draw(S.sparkle, tx + 3, ty - 7);
      draw(S.flag, 1, 18);
    } else if (v.stage === 'egg') {
      const wobble = still ? 0 : v.eggProgress > 0.6 ? (frame % 2 ? 1 : -1) : (frame % 4 === 0 ? 1 : 0);
      draw(S.egg, 12 + wobble, 5);
    } else if (game && game.kind === 'leftright') {
      const reveal = game.phase === 'reveal';
      drawPet(key, 12, 6, { look: reveal ? game.dir : 0 });
      drawAccessories(key, 12, 6, eq, now);
      if (reveal) {
        draw(game.dir < 0 ? S.arrowL : S.arrowR, game.dir < 0 ? 5 : 30, 11);
        draw(game.guess === game.dir ? S.heart : S.cross, 31, 1);
      } else {
        draw(frame % 2 ? S.arrowL : S.arrowR, frame % 2 ? 5 : 30, 11);
      }
    } else if (v.focus && v.focus.phase === 'work' && !p.asleep) {
      // Focus: the pet sits still, eyes on the code, with a progress bar along the top.
      const f = v.focus;
      const done = Math.min(1, Math.max(0, (now - (f.endsAt - f.total)) / f.total));
      for (let x = 0; x < Math.round(W * done); x++) plot(x, 0);
      const blink = (frame * 7919) % 13 === 0;
      drawPet(key, 12, 6, { look: frame % 20 < 10 ? 1 : 0, blink });
      drawAccessories(key, 12, 6, eq, now);
      if (frame % 4 < 2) draw(S.sparkle, 31, 3);
    } else if (p.asleep) {
      drawPet(key, 12, 7, { blink: true, noMouth: true });
      drawAccessories(key, 12, 7, eq, now);
      const zf = still ? 4 : frame % 6;
      if (zf >= 1) draw(S.z, 30, 7 - Math.min(zf, 4));
      if (zf >= 3) draw(S.z, 35, 4 - Math.min(zf - 2, 3));
    } else if (ui.drawer === 'duck') {
      // Listening: sits still, faces you, nods along as you type.
      const nod = still ? 0 : Math.floor(now / 700) % 2;
      drawPet(key, 12, 6 + nod, { look: 0, blink: (frame * 7919) % 9 === 0 });
      drawAccessories(key, 12, 6 + nod, eq, now);
      if (duckText.length > 0 && frame % 6 < 3) draw(S.question, 31, 3);
    } else {
      const poops = p.poops;
      const maxX = Math.max(1, W - 17 - (poops > 2 ? 18 : poops > 0 ? 9 : 0));
      if (visit && now > visit.until) visit = null;
      if (tickFrame && !still && frame % 2 === 0) {
        if (petX === targetX && !visit && Math.random() < 0.35) {
          // Sometimes wander over to use something in the room.
          const room = snap.room || {};
          const spots = ['floorL', 'floorR'].filter(z => room[z] && catalog.DECOR[room[z]] && catalog.DECOR[room[z]].fx && S[room[z]]);
          if (spots.length && Math.random() < 0.3) {
            const zone = spots[Math.floor(Math.random() * spots.length)];
            const w = S[room[zone]][0].length;
            targetX = Math.min(maxX, Math.max(1, zone === 'floorL' ? 2 + w : W - 18 - w));
            visit = { zone, fx: catalog.DECOR[room[zone]].fx, until: now + 6000 };
          } else targetX = 1 + Math.floor(Math.random() * maxX);
        }
        if (petX < targetX) { petX++; look = 1; } else if (petX > targetX) { petX--; look = -1; } else if (visit) look = visit.zone === 'floorL' ? -1 : 1; else if (Math.random() < 0.2) look = 0;
      }
      petX = Math.min(Math.max(petX, 1), maxX);
      targetX = Math.min(targetX, maxX);
      const glum = v.mood === 'sad' || v.mood === 'sick';
      const bounce = glum || still ? 0 : frame % 2;
      const blink = (frame * 7919) % 11 === 0;
      const y = 6 + bounce;
      drawPet(key, petX, y, { look, blink, noMouth: v.mood === 'sad' && frame % 4 < 2 });
      drawAccessories(key, petX, y, eq, now);
      if (themed && themeOf(snap.equipped).prop === 'saber') drawSaber(petX, y, now);

      if (p.sick && frame % 2) draw(S.skull, 1, 1);
      else if (v.alerts.length && frame % 2) draw(S.alert, 1, 1);
      if (v.mood === 'worried') draw(S.sweat, petX + 14, y + 1 + (frame % 2));

      if (anim) {
        const side = petX + 17 > W - 8 ? petX - 9 : petX + 17;
        const left = anim.until - now;
        if (anim.kind === 'eat') {
          draw(S[anim.sprite || 'food'], side, 11, { crop: Math.max(0, Math.ceil((left / 2500) * 7)) });
        } else if (anim.kind === 'heart') {
          draw(S.heart, side, Math.max(0, 8 - Math.floor((now - anim.start) / 300)));
        } else if (anim.kind === 'medicine') {
          draw(S.cross, side, 9);
        } else if (anim.kind === 'clean' || anim.kind === 'sparkle') {
          for (let i = 0; i < 4; i++) draw(S.sparkle, 3 + i * 9, (frame + i) % 2 ? 1 : 18);
        }
      } else if (visit && petX === targetX && visit.fx) {
        // Using the decoration: a little effect over the pet's head.
        const fy = 2 + (frame % 2);
        const fx = Math.min(petX + 6, W - 8);
        if (visit.fx === 'heart') draw(S.heart, fx, fy);
        else if (visit.fx === 'z') draw(S.z, fx + 1, fy);
        else if (visit.fx === 'sparkle') draw(S.sparkle, fx + 1, fy);
        else if (visit.fx === 'cup') draw(S.cup, fx, fy);
        else if (visit.fx === 'sweat') draw(S.sweat, fx + 2, fy);
      } else if (v.mood === 'happy' && frame % 16 < 3) {
        draw(S.heart, Math.min(petX + 17, W - 8), 2);
      }
    }

    if (!p.dead && !(snap.expedition && v.expedition && v.expedition.active)) drawRoom(still ? 0 : now);
    if (themed && !p.dead) drawAmbient(themeOf(snap.equipped).ambient, still ? 0 : now);
    else if (!p.dead && !snap.paused) drawSky(now);

    if (!p.dead) {
      for (let i = 0; i < p.poops; i++) {
        const col = Math.floor(i / 2), row = i % 2;
        draw(S.poop, W - 9 - col * 9, H - 7 - row * 8);
        if (frame % 2 && !still) plot(W - 5 - col * 9, H - 9 - row * 8);
      }
    }
  }

  // Draw at the screen's real pixel size, so every LCD cell is a whole number of device pixels
  // (scaling a fixed-size canvas down makes the cell gaps shimmer).
  let cell = 8;
  function fitCanvas() {
    const w = canvas.clientWidth * (window.devicePixelRatio || 1);
    if (!(w > 0)) return;
    const c = Math.max(2, Math.floor(w / W));
    if (c !== cell) {
      cell = c;
      canvas.width = W * c;
      canvas.height = H * c;
    }
  }

  function render() {
    const now = Date.now();
    fitCanvas();
    scene(now);
    flush(ctx, cell, screenPalette());
  }

  // =====================================================================
  // UI: top bar, tabs, pet panel
  // =====================================================================
  function renderAll() {
    if (!snap || !catalog) return;
    $('coins').textContent = String(snap.coins);
    $('streak').textContent = String(snap.streak.current);
    $('chip-streak').title = `Daily streak: ${snap.streak.current} (best ${snap.streak.best})`;
    $('btn-vacation').classList.toggle('on', snap.paused);
    $('btn-vacation').setAttribute('aria-pressed', String(snap.paused));
    for (const t of TABS) {
      const on = t === ui.tab;
      $('tab-' + t).hidden = !on;
      const b = $('tabbtn-' + t);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    renderPet();
    if (ui.tab === 'shop') renderShop();
    if (ui.tab === 'dex') renderDex();
    if (ui.tab === 'stats') renderStats();
    if (ui.tab === 'team') renderTeam();
    if (ui.tab === 'journal') renderJournal();
  }

  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

  function renderPet() {
    if (!snap || !catalog) return;
    const p = snap.pet, v = snap.view;
    const device = $('device');
    device.dataset.shell = ui.shell;
    $('led').className = 'led' + (p.dead ? ' off' : p.asleep || snap.paused ? ' sleep' : '');

    $('info').innerHTML = p.dead ? esc(p.name)
      : v.stage === 'egg' ? `An egg · ${Math.round(v.eggProgress * 100)}%`
      : `${esc(p.name)} the ${p.shiny ? `<span class="shiny" title="Shiny! Only 1 in 16 hatch like this.">${ic('sparkle', 'inline')}Shiny</span> ` : ''}${esc(v.speciesName)}`
        + (v.trait ? ` <span class="trait" title="${esc(v.trait.desc)}">${esc(v.trait.name)}</span>` : '');
    const away = v.expedition && v.expedition.active;
    const immune = v.immuneLeftMs > 0 ? ` · ${ic('pill', 'inline')}${Math.ceil(v.immuneLeftMs / 3600000)}h` : '';
    $('sub').innerHTML = p.dead ? `${esc(v.speciesName)} · gen ${p.generation} · lived ${esc(v.ageText)}`
      : v.stage === 'egg' ? 'Keep coding nearby. It hatches in about a minute.'
      : away ? `Exploring ${esc(away.name)} · back in ${fmtLeft(away.leftMs)}`
      : `${esc(v.stageLabel)} · ${esc(v.ageText)}${v.nextStageIn ? ` · ${esc(v.nextStageLabel)} in ${esc(v.nextStageIn)}` : ''} · care ${stars(v.care)} · ${p.weight}g${immune}`;

    for (const k of ['hunger', 'happy', 'energy', 'health']) {
      const bar = $('bar-' + k);
      const val = Math.round(p[k]);
      bar.setAttribute('aria-valuenow', String(val));
      const fill = /** @type {HTMLElement} */ (bar.firstElementChild);
      fill.style.width = val + '%';
      fill.className = val < 25 ? 'low' : val < 50 ? 'mid' : '';
    }
    $('needs').classList.toggle('muted', v.stage === 'egg' || p.dead || snap.paused || !!away);

    const blocked = p.dead || v.stage === 'egg' || snap.paused || !!away;
    document.querySelectorAll('#actions button').forEach(el => {
      const b = /** @type {HTMLButtonElement} */ (el);
      if (b.dataset.goto) return;
      const isLights = b.dataset.action === 'lights';
      b.disabled = blocked || !!game || (p.asleep && !isLights);
      b.classList.toggle('attention', !b.disabled && v.alerts.includes(b.dataset.need || ''));
    });
    /** @type {HTMLElement} */ ($('btn-lights').querySelector('span')).textContent = p.asleep ? 'Wake' : 'Sleep';

    if ((blocked || p.asleep || game) && ui.drawer) ui.drawer = null;
    for (const d of ['feed', 'games', 'duck']) $('drawer-' + d).hidden = ui.drawer !== d;
    if (ui.drawer === 'feed') renderFeedDrawer();
    if (ui.drawer === 'games') renderGamesDrawer();
    if (ui.drawer === 'duck') renderDuckDrawer();
    document.querySelectorAll('[data-drawer]').forEach(b => b.setAttribute('aria-expanded', String(ui.drawer === /** @type {HTMLElement} */ (b).dataset.drawer)));

    const banner = $('banner');
    if (p.dead) {
      banner.hidden = false;
      banner.innerHTML = `<p>${esc(p.name)} passed away from ${esc(p.causeOfDeath)}. They're remembered in your Collection.</p><button class="primary" data-cmd="newPet">${ic("egg")} Hatch a new egg</button>`;
    } else if (snap.paused) {
      banner.hidden = false;
      banner.innerHTML = `<p>${ic("umbrella", "inline")} ${esc(p.name)} is on vacation. Time is frozen: no hunger, no ageing.</p><button class="primary" data-act="pause">Resume</button>`;
    } else {
      banner.hidden = true;
      banner.innerHTML = '';
    }

    renderFocusBar();
    renderExpedition();
    renderQuests();
    canvas.setAttribute('aria-label', describePet());
  }

  function fmtLeft(ms) {
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }

  // ----- expeditions -----
  function renderExpedition() {
    const el = $('expedition');
    const v = snap.view, p = snap.pet;
    const ex = v.expedition;
    if (!ex || p.dead || v.stage === 'egg') { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const found = ex.artefacts.filter(a => a.found).length;
    const head = `<div class="quests-head"><b>${ic('map', 'inline')} Expeditions</b><span class="count">${found}/${ex.artefacts.length} artefacts</span></div>`;
    if (ex.active) {
      const a = ex.active;
      el.innerHTML = head + `<div class="exped on"><span class="ico">${ic(a.icon || 'map')}</span><div class="grow"><b>${esc(p.name)} is exploring ${esc(a.name)}</b>`
        + `<div class="qbar" role="progressbar" aria-label="Expedition progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(a.progress * 100)}"><i data-w="${Math.round(a.progress * 100)}"></i></div>`
        + `<small>Back in ${fmtLeft(a.leftMs)}. Needs are frozen while away.</small></div><button data-act="recall" title="Come home now, without loot">Recall</button></div>`;
    } else {
      const blocked = snap.paused || p.asleep || p.sick;
      el.innerHTML = head + `<p class="hint">Send ${esc(p.name)} exploring. Needs freeze while away; it comes back with coins, food and sometimes an artefact.${(snap.items || {}).trailMix > 0 ? ` Trail Mix ready: next trip is 25% shorter.` : ''}</p>`
        + ex.destinations.map(d => {
          const tired = p.energy < d.energy + 10;
          const why = blocked ? (p.sick ? 'Too ill to travel' : 'Not right now') : tired ? `Needs ${d.energy + 10} energy` : `${d.minutes} min · −${d.energy} energy`;
          return `<div class="exped"><span class="ico">${ic(d.icon)}</span><div class="grow"><b>${esc(d.name)}</b><small>${esc(d.desc)}</small><small class="meta">${esc(why)}${d.artefactsLeft ? ` · ${d.artefactsLeft} artefact${d.artefactsLeft === 1 ? '' : 's'} undiscovered` : ' · all artefacts found'}</small></div>`
            + `<button class="primary" data-act="expedition" data-arg="${d.id}" ${blocked || tired || game ? 'disabled' : ''}>Go</button></div>`;
        }).join('');
    }
    el.querySelectorAll('.qbar i').forEach(x => { /** @type {HTMLElement} */ (x).style.width = /** @type {HTMLElement} */ (x).dataset.w + '%'; });
  }

  // ----- rubber duck -----
  const DUCK_PROMPTS = ['What did you expect to happen?', 'And what actually happened?', 'When did it last work?', 'What changed since then?',
    'Can you make it fail on purpose?', 'What is the smallest input that still fails?', 'Which assumption haven\'t you checked yet?',
    'Read the error message out loud. All of it.', 'Where does that value come from, exactly?', 'If you had to bet: which line?',
    'Is it the code, or the data?', 'What would you tell a teammate to look at first?'];
  function duckPrompt() {
    const n = duckText.length;
    if (!n) return `Tell ${snap.pet.name} about the bug. Start anywhere.`;
    return DUCK_PROMPTS[Math.floor(n / 70) % DUCK_PROMPTS.length];
  }
  function renderDuckDrawer() {
    const min = (catalog.ECONOMY && catalog.ECONOMY.duckMinChars) || 150;
    const ready = duckText.length >= min;
    $('drawer-duck').innerHTML = '<div class="drawer-title">' + ic('duck', 'inline') + ' Explain it to ' + esc(snap.pet.name) + '</div>'
      + '<p class="hint">Rubber-duck debugging: describe the bug in writing, step by step. Nothing you type leaves this panel.</p>'
      + '<div class="duck-say" id="duck-say">' + esc(duckPrompt()) + '</div>'
      + '<textarea id="duck-text" class="duck-text" rows="5" spellcheck="false" aria-label="Describe the bug" placeholder="So, this function is supposed to…"></textarea>'
      + '<div class="duck-foot"><small id="duck-count" class="count">' + duckText.length + ' / ' + min + '</small>'
      + '<button class="primary" id="duck-done" data-duck-done ' + (ready ? '' : 'disabled') + '>That helped</button><button data-duck-clear>Clear</button></div>';
    const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('duck-text'));
    if (ta) ta.value = duckText;
  }
  function duckTyped(value) {
    duckText = String(value || '').slice(0, 4000);
    const min = (catalog && catalog.ECONOMY && catalog.ECONOMY.duckMinChars) || 150;
    const say = document.getElementById('duck-say'), cnt = document.getElementById('duck-count');
    if (say) say.textContent = duckPrompt();
    if (cnt) cnt.textContent = duckText.length + ' / ' + min;
    const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('duck-done'));
    if (btn) btn.disabled = duckText.length < min;
  }

  function focusLeft(f) {
    const left = Math.max(0, f.endsAt - Date.now());
    return `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  }

  function renderFocusBar() {
    const el = $('focus-bar');
    const f = snap.view.focus;
    const blocked = snap.pet.dead || snap.paused;
    if (f) {
      const work = f.phase === 'work';
      el.className = 'focus-bar on' + (work ? '' : ' break');
      el.innerHTML = `${ic(work ? 'tomato' : 'coffee')}<span class="grow"><b>${work ? 'Focusing' : 'On a break'}</b> <span id="focus-left">${focusLeft(f)}</span></span><button data-cmd="focusStop">${work ? 'Stop' : 'Skip break'}</button>`;
    } else {
      el.className = 'focus-bar';
      el.innerHTML = `${ic('tomato')}<span class="grow"><b>Focus with ${esc(snap.pet.name)}</b><small>A timed session. Quiet notifications, coins at the end.</small></span><button class="primary" data-cmd="focusStart" ${blocked ? 'disabled' : ''}>Start</button>`;
    }
  }

  function renderQuests() {
    const qs = snap.view.quests || [];
    const el = $('quests');
    if (!qs.length) { el.innerHTML = ''; return; }
    const done = qs.filter(q => q.done).length;
    el.innerHTML = `<div class="quests-head"><b>${ic('scroll', 'inline')} Daily quests</b><span class="count">${done}/${qs.length}${done === qs.length ? ' · bonus earned' : ` · +20${ic('coin', 'inline')} for all`}</span></div>`
      + qs.map(q => `<div class="quest ${q.done ? 'done' : ''}"><span class="ico">${ic(q.done ? 'check' : QUEST_ICON[q.id] || 'star')}</span><div class="grow"><b>${esc(q.text)}</b>`
        + `<div class="qbar" role="progressbar" aria-label="${esc(q.text)}" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${q.progress}"><i data-w="${Math.round((q.progress / q.target) * 100)}"></i></div></div>`
        + `<small class="reward">${q.done ? 'Done' : `${n(q.progress)}/${n(q.target)} · +${q.reward}${ic('coin', 'inline')}`}</small>`
        + (!q.done && (snap.items || {}).questReroll > 0 ? `<button class="reroll" data-reroll="${qs.indexOf(q)}" title="Use a Quest Reroll (${snap.items.questReroll} left)" aria-label="Reroll this quest">↻</button>` : '') + '</div>').join('');
    el.querySelectorAll('.qbar i').forEach(x => { /** @type {HTMLElement} */ (x).style.width = /** @type {HTMLElement} */ (x).dataset.w + '%'; });
  }

  function describePet() {
    const p = snap.pet, v = snap.view;
    if (p.dead) return `${p.name} has died. A gravestone is shown.`;
    if (v.stage === 'egg') return 'An egg, wobbling as it gets ready to hatch.';
    if (v.expedition && v.expedition.active) return `${p.name} is away exploring ${v.expedition.active.name}. A trail across a map is shown.`;
    const alerts = v.alerts.length ? ` Needs: ${v.alerts.join(', ')}.` : '';
    return `${p.name} the ${p.shiny ? 'shiny ' : ''}${v.speciesName} is ${MOOD_WORD[v.mood] || v.mood}.${alerts}${p.poops ? ` ${p.poops} mess${p.poops > 1 ? 'es' : ''} on screen.` : ''}`;
  }

  const STAT_ICON = { hunger: 'rice', happy: 'heart', energy: 'bolt', health: 'health' };
  const CAT_ORDER = ['meals', 'snacks', 'drinks', 'treats'];

  /** Pick the food that best covers what the pet needs right now. */
  function suggestFood(fv) {
    const p = snap.pet;
    const need = { hunger: 100 - p.hunger, happy: 100 - p.happy, energy: 100 - p.energy, health: 100 - p.health };
    let best = null;
    for (const [id, f] of Object.entries(catalog.FOODS)) {
      if (id === fv.dislike) continue;
      const have = foodAvailable(id);
      const price = snap.view.shop && snap.view.shop.prices[id] ? snap.view.shop.prices[id].price : f.price;
      if (!have && (f.rare || snap.coins < price)) continue;
      let score = 0;
      for (const [k, v] of Object.entries(f.effects)) if (need[k] !== undefined) score += v > 0 ? Math.min(need[k], v) : v * 1.5;
      if (p.sick && f.cure) score += 40;
      if (id === fv.fav) score += 8;
      if (fv.recent.filter(x => x === id).length >= 2) score *= 0.5;
      if (f.caffeine && (fv.caffeineToday >= 2 || need.energy < 30)) score -= 20;
      score *= have ? 1 : 0.8;
      if (!best || score > best.score) best = { id, score, have, price };
    }
    if (!best || best.score < 8) return null;
    const f = catalog.FOODS[best.id];
    let reason;
    if (p.sick && f.cure) reason = p.name + ' is sick';
    else {
      const top = Object.entries(need).sort((x, y) => y[1] - x[1])[0][0];
      reason = p.name + ' is ' + { hunger: 'hungry', happy: 'feeling down', energy: 'low on energy', health: 'looking run-down' }[top];
    }
    return { ...best, reason };
  }

  function fxChips(f) {
    const chips = Object.entries(f.effects).filter(([k]) => STAT_ICON[k])
      .map(([k, v]) => '<span class="fx ' + (v < 0 ? 'neg' : '') + '">' + (v > 0 ? '+' : '') + v + ic(STAT_ICON[k], 'inline') + '</span>');
    if (f.caffeine) chips.push('<span class="fx warn" title="Energy crashes 45 minutes later">crash later</span>');
    if (f.cure) chips.push('<span class="fx good" title="Chance to cure sickness">may cure</span>');
    return chips.join('');
  }

  /** Free foods are always on hand; bought and expedition-only foods need stock. */
  const foodAvailable = id => { const f = catalog.FOODS[id]; return (f.price === 0 && !f.rare) || (snap.inventory[id] || 0) > 0; };

  function feedButton(id, f) {
    const have = snap.inventory[id] || 0;
    const p = snap.view.shop && snap.view.shop.prices[id];
    if (f.price === 0 && !f.rare) return '<button class="primary" data-act="feed" data-arg="' + id + '">Feed</button>';
    if (have > 0) return '<button class="primary" data-act="feed" data-arg="' + id + '">Feed <span class="n">×' + have + '</span></button>';
    if (f.rare) return '<button disabled title="Found on expeditions">Expedition</button>';
    const price = p ? p.price : f.price;
    return '<button data-act="buy" data-arg="' + id + '" ' + (snap.coins < price ? 'disabled' : '') + '>Buy ' + price + ic('coin', 'inline') + '</button>';
  }

  function renderFeedDrawer() {
    const p = snap.pet;
    const fv = snap.view.food || { fav: null, dislike: null, tasted: [], special: null, recent: [], diet: { cats: [], bonus: false }, caffeine: null, caffeineToday: 0 };
    const cat = ui.foodCat || 'all';
    const sug = suggestFood(fv);
    const tag = id => (id === fv.fav ? '<span class="ftag fav" title="Favourite food">❤ fave</span>' : '')
      + (id === fv.dislike ? '<span class="ftag dis" title="Not a fan">✗ dislikes</span>' : '')
      + (id === fv.special ? '<span class="ftag special" title="25% off today, and a little extra happiness">Chef\'s special</span>' : '')
      + (!fv.tasted.includes(id) ? '<span class="ftag untasted" title="Not tasted yet: could be a favourite">untasted</span>' : '');

    const suggest = sug
      ? '<div class="suggest">' + ic(FOOD_ICON[sug.id]) + '<div class="grow"><small>Suggested · ' + esc(sug.reason) + '</small><b>' + esc(catalog.FOODS[sug.id].name) + '</b></div>' + feedButton(sug.id, catalog.FOODS[sug.id]) + '</div>'
      : '';
    const diet = '<div class="diet" title="Eat from all four groups in a day for +15 health and +10 happiness">'
      + '<span class="dlabel">' + (fv.diet.bonus ? '✓ Balanced diet today' : 'Balanced diet') + '</span>'
      + CAT_ORDER.map(c => '<span class="dpill ' + (fv.diet.cats.includes(c) ? 'on' : '') + '">' + esc(catalog.FOOD_CATS ? catalog.FOOD_CATS[c] : c) + '</span>').join('')
      + '</div>';
    const caf = fv.caffeine ? '<div class="caf">' + ic('coffee', 'inline') + ' Caffeine crash in ' + Math.max(1, Math.round(fv.caffeine.inMs / 60000)) + 'm (−' + fv.caffeine.amount + ' energy)' + (fv.caffeineToday >= 3 ? ' · jittery' : '') + '</div>' : '';

    const chips = [['all', 'All'], ['pantry', 'Pantry'], ...CAT_ORDER.map(c => [c, catalog.FOOD_CATS ? catalog.FOOD_CATS[c] : c])]
      .map(([id, label]) => '<button role="tab" aria-selected="' + (cat === id) + '" data-foodcat="' + id + '">' + esc(label) + '</button>').join('');

    const available = foodAvailable;
    const ids = Object.keys(catalog.FOODS)
      .filter(id => cat === 'all' || (cat === 'pantry' ? available(id) : catalog.FOODS[id].cat === cat))
      .filter(id => !catalog.FOODS[id].rare || available(id) || cat === 'all')
      .sort((x, y) => (available(y) - available(x)) || (CAT_ORDER.indexOf(catalog.FOODS[x].cat) - CAT_ORDER.indexOf(catalog.FOODS[y].cat)));
    const rows = ids.map(id => {
      const f = catalog.FOODS[id];
      return '<div class="food' + (available(id) ? '' : ' empty') + (id === fv.dislike ? ' dis' : '') + (f.rare ? ' rare' : '') + '">'
        + '<span class="ico">' + ic(FOOD_ICON[id]) + '</span>'
        + '<div class="grow"><b>' + esc(f.name) + '</b>' + tag(id) + '<div class="fxs">' + fxChips(f) + '</div><small>' + esc(f.desc) + '</small></div>'
        + feedButton(id, f) + '</div>';
    }).join('');

    const pantry = Object.values(snap.inventory).reduce((x, y) => x + y, 0);
    $('drawer-feed').innerHTML = '<div class="drawer-title">Feed ' + esc(p.name) + ' <span class="count">' + pantry + ' in the pantry</span></div>'
      + suggest + diet + caf
      + '<div class="chips food-chips" role="tablist" aria-label="Food groups">' + chips + '</div>'
      + '<div class="foods">' + (rows || '<p class="hint">Nothing here yet. Stock up in the shop.</p>') + '</div>';
  }

  function renderGamesDrawer() {
    const tired = snap.pet.energy < 10;
    const ch = snap.view.challenge;
    const row = (id, g) => `<div class="row${ch && ch.game === id ? ' challenge' : ''}"><span class="ico">${ic(GAME_ICON[id])}</span><div class="grow"><b>${esc(g.name)}${ch && ch.game === id ? ` <span class="new chal">×${ch.multiplier}</span>` : ''}${snap.best && snap.best[id] !== undefined ? ` <span class="count">best ${snap.best[id]}</span>` : ' <span class="new">new</span>'}</b><small>${esc(g.desc)}</small></div><button class="primary" data-game="${id}" ${tired ? 'disabled' : ''}>Play</button></div>`;
    const ids = Object.keys(catalog.GAMES);
    const weekly = ch && catalog.GAMES[ch.game]
      ? `<div class="weekly">${ic('trophy')}<div class="grow"><b>Weekly Challenge: ${esc(ch.name)}</b><small>×${ch.multiplier} coins all week · your best ${ch.best}${ch.plays ? ` in ${ch.plays} play${ch.plays === 1 ? '' : 's'}` : ''} · new game in ${fmtDays(ch.resetInMs)}</small></div><button class="primary" data-game="${ch.game}" ${tired ? 'disabled' : ''}>Play</button></div>`
      : '';
    $('drawer-games').innerHTML = `<div class="drawer-title">Play${tired ? ` · ${esc(snap.pet.name)} is too tired` : ''} <span class="count">${ids.length} games</span></div>${weekly}`
      + `<h4 class="sub-h">Arcade</h4>` + ids.filter(id => ['bugs', 'dash', 'stack', 'snake', 'pipeline', 'breakout', 'pong'].includes(id)).map(id => row(id, catalog.GAMES[id])).join('')
      + `<h4 class="sub-h">Brain</h4>` + ids.filter(id => !['bugs', 'dash', 'stack', 'snake', 'pipeline', 'breakout', 'pong'].includes(id)).map(id => row(id, catalog.GAMES[id])).join('');
  }
  function fmtDays(ms) {
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? `${d}d ${h}h` : `${h}h`;
  }

  // =====================================================================
  // Journal
  // =====================================================================
  function renderJournal() {
    const groups = snap.view.journal || [];
    const el = $('tab-journal');
    const today = new Date().toDateString();
    const label = day => {
      const d = new Date(day + 'T12:00:00');
      if (d.toDateString() === today) return 'Today';
      const y = new Date(); y.setDate(y.getDate() - 1);
      if (d.toDateString() === y.toDateString()) return 'Yesterday';
      return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    };
    const time = t => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<h3>${esc(snap.pet.name)}'s journal <span class="count">${groups.reduce((n, g) => n + g.entries.length, 0)} entries</span></h3>`
      + (groups.length
        ? groups.map(g => `<div class="jday"><h4>${esc(label(g.day))}</h4>${g.entries.map(e => `<div class="jentry"><span class="ico">${ic(PX.icons[e.icon] ? e.icon : 'star')}</span><div class="grow">${esc(e.text)}</div><small class="jtime">${esc(time(e.t))}</small></div>`).join('')}</div>`).join('')
        : `<p class="hint">Nothing written yet. ${esc(snap.pet.name)} keeps a diary of hatchings, evolutions, firsts, personal bests and expeditions, and adds a line each morning about what you coded the day before.</p>`);
  }

  // =====================================================================
  // Shop
  // =====================================================================
  // Paint something into the shared LCD grid and copy it to a small canvas (the main LCD redraws every frame anyway).
  function paintMini(el, paint, pal, w = W, h = H) {
    const c = /** @type {HTMLCanvasElement} */ (el);
    const cell = Number(c.dataset.cell) || 3;
    c.width = w * cell; c.height = h * cell;
    const x = c.getContext('2d');
    if (!x) return;
    grid.fill(0);
    paint();
    flush(x, cell, pal, grid, w, h);
    grid.fill(0);
  }

  const petKeyForPreview = () => (snap.pet.species !== 'egg' && S[snap.pet.species] ? snap.pet.species : 'kitbit');

  function paintPreviews(root) {
    const key = petKeyForPreview();
    root.querySelectorAll('canvas[data-preview]').forEach(el => {
      const [kind, id] = String(/** @type {HTMLElement} */ (el).dataset.preview).split(':');
      const eq = { hat: snap.equipped.hat, face: snap.equipped.face };
      let pal = catalog.SCREENS[snap.equipped.screen] || catalog.SCREENS.classic;
      if (kind === 'acc' && catalog.ACCESSORIES[id]) eq[catalog.ACCESSORIES[id].slot] = id;
      if (kind === 'screen' && catalog.SCREENS[id]) pal = catalog.SCREENS[id];
      if (kind === 'decor' && catalog.DECOR && catalog.DECOR[id]) {
        const t = reducedMotion() ? 0 : Date.now();
        paintMini(el, () => {
          drawPet(key, 12, 6, {}); drawAccessories(key, 12, 6, eq);
          // The rest of the room stays, so you see how the new piece fits.
          for (const zone of catalog.DECOR_ZONES || []) {
            const cur = zone === catalog.DECOR[id].zone ? id : (snap.room || {})[zone];
            if (cur && catalog.DECOR[cur]) drawDecorAt(cur, zone, t, zone === catalog.DECOR[id].zone ? 1 : 3);
          }
        }, pal);
        return;
      }
      if ((kind === 'theme' || kind === 'locked') && catalog.THEMES && catalog.THEMES[id]) {
        const th = catalog.THEMES[id];
        const t = reducedMotion() ? 0 : Date.now();
        if (kind === 'locked') {
          // A silhouette: the shape of the look on your pet, in shadow, with the theme's ambience and a padlock.
          paintMini(el, () => {
            inkVal = 3;
            draw(S[key], 12, 6, {}); drawAccessories(key, 12, 6, { ...eq, ...th.look });
            inkVal = 2;
            draw(S.lockMini, 34, 1);
            inkVal = 1;
            drawAmbient(th.ambient, t);
          }, { ...th.palette, shine: '#ffd84d' });
        } else {
          paintMini(el, () => {
            drawPet(key, 12, 6, {}); drawAccessories(key, 12, 6, { ...eq, ...th.look });
            if (th.prop === 'saber') drawSaber(12, 6, t);
            drawAmbient(th.ambient, t);
          }, th.palette);
        }
        return;
      }
      paintMini(el, () => { drawPet(key, 12, 6, {}); drawAccessories(key, 12, 6, eq); }, pal);
    });
    const k = root.querySelector('#keeper-lcd');
    if (k) paintKeeper(k);
  }

  // ----- Mx. Stash, the shopkeeper -----
  const KEEPER_LINES = {
    welcome: ['Welcome in! Everything\'s priced to ship.', 'Looking for something shiny?', 'Fresh deals every midnight.', 'Browse all you like. Haggling costs extra. Kidding!'],
    bought: ['Pleasure doing business!', 'Excellent taste.', 'That\'ll look great on {pet}.', 'Sold! No refunds. Well, sell-backs.'],
    broke: ['Come back after a few commits.', 'Coins first, cosmetics second.', 'Ship something and I\'ll give you a discount.'],
    deal: ['You drive a hard bargain.', 'Fine, but don\'t tell the others.', 'Ugh. Deal.'],
    insulted: ['Hmph. Insulting.', 'I have rent too, you know.', 'Try that again tomorrow.'],
    grumpy: ['Not today, friend.', 'We\'ve been over this.'],
    mystery: ['Ooh, let\'s see what you got!', 'The box has chosen.'],
    exclusive: ['WOW. That\'s one of the rare ones!', 'I didn\'t even know that was in there!'],
    sold: ['I\'ll find it a good home.', 'Pleasure. I\'ll mark it up a little.'],
    bundle: ['Bulk buyer! My favourite.', 'Your pantry thanks you.'],
  };
  function keeperSay(mood) {
    const lines = KEEPER_LINES[mood] || KEEPER_LINES.welcome;
    let line = lines[Math.floor(Math.random() * lines.length)].replace('{pet}', snap ? snap.pet.name : 'your pet');
    const sv = snap && snap.view.shop;
    if (mood === 'welcome' && sv && sv.commitDiscount > 0 && Math.random() < 0.6) line = 'Ship-It discount active: ' + Math.round(sv.commitDiscount * 100) + '% off everything!';
    ui.keeper = { line, mood, until: Date.now() + 8000 };
    const el = document.getElementById('keeper-line');
    if (el) el.textContent = line;
  }
  function paintKeeper(el) {
    const blink = Math.floor(Date.now() / 1600) % 5 === 0;
    const happy = ui.keeper && ['bought', 'deal', 'exclusive', 'bundle', 'mystery', 'sold'].includes(ui.keeper.mood) && ui.keeper.until > Date.now();
    const cross = ui.keeper && ['insulted', 'grumpy', 'broke'].includes(ui.keeper.mood) && ui.keeper.until > Date.now();
    paintMini(el, () => {
      draw(S.keeper, 2, 2, { blink, noMouth: !!cross });
      if (happy) draw(S.heart, 13, 0);
      if (cross) draw(S.cross, 14, 1);
    }, catalog.SCREENS[snap.equipped.screen] || catalog.SCREENS.classic, 20, 20);
  }
  setInterval(() => { const k = document.getElementById('keeper-lcd'); if (k && snap && catalog && ui.tab === 'shop') paintKeeper(k); }, 400);

  // ----- cards -----
  const SHOP_CATS = [['featured', 'Featured'], ['wardrobe', 'Wardrobe'], ['room', 'Room'], ['screens', 'Screens'], ['food', 'Food'], ['items', 'Items'], ['owned', 'Owned']];
  const ZONE_LABEL = { wallL: 'Left wall', wallR: 'Right wall', floorL: 'Floor, left', floorR: 'Floor, right', floor: 'Floor' };
  const coin = () => ic('coin', 'inline');

  function priceTag(p) {
    if (!p) return '';
    return p.pct ? '<span class="ptag"><s>' + p.base + '</s> <b>' + p.price + '</b>' + coin() + ' <span class="off ' + p.reason + '">-' + Math.round(p.pct * 100) + '%</span></span>'
      : '<span class="ptag"><b>' + p.price + '</b>' + coin() + '</span>';
  }

  function thumbFor(id, kind) {
    if (kind === 'accessory') return '<canvas class="thumb" data-cell="3" data-preview="acc:' + id + '"></canvas>';
    if (kind === 'screen') return '<canvas class="thumb" data-cell="3" data-preview="screen:' + id + '"></canvas>';
    if (kind === 'decor') return '<canvas class="thumb" data-cell="3" data-preview="decor:' + id + '"></canvas>';
    const icon = kind === 'food' ? FOOD_ICON[id] : kind === 'item' ? ((catalog.ITEMS || {})[id] || {}).icon : id;
    return '<div class="thumb icon">' + ic(icon || 'star') + '</div>';
  }

  const SHOP_TABLE = { food: 'FOODS', accessory: 'ACCESSORIES', screen: 'SCREENS', item: 'ITEMS', decor: 'DECOR' };

  function shopCard(id, kind, opts = {}) {
    const sv = snap.view.shop;
    const table = catalog[SHOP_TABLE[kind]];
    const it = table && table[id];
    if (!it) return '';
    const p = sv.prices[id];
    const cosmetic = kind === 'accessory' || kind === 'screen' || kind === 'decor';
    const owned = cosmetic && snap.owned[id];
    const worn = kind === 'accessory' ? snap.equipped[it.slot] === id : kind === 'screen' ? snap.equipped.screen === id : kind === 'decor' ? (snap.room || {})[it.zone] === id : false;
    const have = kind === 'food' ? (snap.inventory[id] || 0) : kind === 'item' ? ((snap.items || {})[id] || 0) : 0;
    const full = kind === 'item' && have >= it.max;
    const afford = p && snap.coins >= p.price;
    const goal = sv.goal && sv.goal.id === id;
    const hag = sv.haggles[id];
    const canHaggle = p && kind !== 'food' && !owned && !full;
    let badge = '';
    if (it.exclusive) badge = '<span class="badge excl">Box exclusive</span>';
    else if (worn) badge = '<span class="badge on">' + (kind === 'screen' ? 'In use' : kind === 'decor' ? 'On display' : 'Wearing') + '</span>';
    else if (owned) badge = '<span class="badge">Owned</span>';
    else if (have) badge = '<span class="badge">×' + have + (kind === 'item' ? '/' + it.max : '') + '</span>';
    if (opts.deal && sv.deals.find(d => d.id === id && d.used)) badge = '<span class="badge">Deal used</span>';
    if (kind === 'decor' && !worn) badge += '<span class="badge zone">' + esc(ZONE_LABEL[it.zone] || it.zone) + '</span>';

    const actions = [];
    if (owned) {
      if (kind === 'accessory') actions.push('<button data-act="equip" data-arg="' + id + '" class="' + (worn ? '' : 'primary') + '">' + (worn ? 'Take off' : 'Wear') + '</button>');
      else if (kind === 'decor') actions.push('<button data-act="equip" data-arg="' + id + '" class="' + (worn ? '' : 'primary') + '">' + (worn ? 'Put away' : 'Display') + '</button>');
      else if (!worn) actions.push('<button class="primary" data-act="equip" data-arg="' + id + '">Use</button>');
    } else if (kind === 'item' && have > 0 && id === 'vitamins') {
      actions.push('<button class="primary" data-use="vitamins" ' + (snap.view.immuneLeftMs > 0 ? 'disabled title="Already protected"' : '') + '>Take one</button>');
      if (p && !full) actions.push('<button data-act="buy" data-arg="' + id + '" ' + (afford ? '' : 'disabled') + '>Buy</button>');
    } else if (p) {
      actions.push('<button class="primary" data-act="buy" data-arg="' + id + '" ' + (afford && !full ? '' : 'disabled') + '>' + (full ? 'Full' : 'Buy') + '</button>');
      if (canHaggle) actions.push('<button data-haggle="' + id + '" ' + (hag ? 'disabled title="' + (hag === 'won' ? 'Already haggled today' : 'Mx. Stash refused. Try tomorrow.') + '"' : 'title="Make Mx. Stash an offer"') + '>' + (hag === 'refused' ? 'Refused' : 'Haggle') + '</button>');
      if (kind !== 'food' && kind !== 'item') actions.push('<button class="star ' + (goal ? 'on' : '') + '" data-act="setGoal" data-arg="' + id + '" title="' + (goal ? 'Clear savings goal' : 'Save up for this') + '" aria-label="Savings goal">' + (goal ? '★' : '☆') + '</button>');
    }
    const short = p && !afford && !owned && !full ? '<small class="short">' + (p.price - snap.coins) + ' more to go</small>' : '';
    const haggleRow = ui.haggle === id && canHaggle && !hag ? haggleForm(id, it) : '';
    const effects = kind === 'food' ? Object.entries(it.effects).filter(([k]) => k !== 'weight').map(([k, v]) => (v > 0 ? '+' : '') + v + ' ' + k).join(', ')
      : kind === 'accessory' && it.slot === 'prop' ? 'Held · ' + it.desc : it.desc;
    return '<div class="card ' + (opts.deal ? 'deal ' : '') + (owned ? 'owned ' : '') + (it.exclusive ? 'exclusive ' : '') + (haggleRow ? 'haggling' : '') + '">'
      + thumbFor(id, kind)
      + '<div class="card-body"><b>' + esc(it.name) + '</b>' + badge + '<small>' + esc(effects || '') + '</small>'
      + (owned ? '' : priceTag(p)) + short + '</div>'
      + '<div class="card-actions">' + actions.join('') + '</div>' + haggleRow + '</div>';
  }

  function haggleForm(id, it) {
    const min = Math.ceil(it.price * catalog.SHOP.haggle.minOffer);
    const start = Math.min(snap.coins, Math.round(it.price * 0.8));
    const val = Math.max(min, start);
    return '<div class="haggle"><label>Your offer: <b id="haggle-val">' + val + '</b>' + coin() + '</label>'
      + '<input type="range" id="haggle-range" min="' + min + '" max="' + it.price + '" value="' + val + '" step="1" aria-label="Offer for ' + esc(it.name) + '">'
      + '<div class="haggle-actions"><button class="primary" data-haggle-offer="' + id + '">Make offer</button><button data-haggle-cancel>Cancel</button></div>'
      + '<small>Go too low and Mx. Stash won\'t haggle on it again today.</small></div>';
  }

  function renderShop() {
    const sv = snap.view.shop;
    if (!sv) return;
    const cat = ui.shopCat || 'featured';
    const hours = Math.floor(sv.refreshInMs / 3600000), mins = Math.floor((sv.refreshInMs % 3600000) / 60000);
    const goal = sv.goal
      ? '<div class="goal"><span>' + ic('star', 'inline') + ' Saving for <b>' + esc(sv.goal.name) + '</b></span><span class="gval">' + Math.min(snap.coins, sv.goal.price) + ' / ' + sv.goal.price + coin() + '</span><div class="gbar"><i data-w="' + Math.round(Math.min(1, snap.coins / sv.goal.price) * 100) + '"></i></div></div>' : '';
    const ship = sv.commitDiscount > 0
      ? '<div class="ship on">' + ic('ship', 'inline') + ' Ship-It discount: <b>' + Math.round(sv.commitDiscount * 100) + '% off</b> everything (' + sv.commitsToday + ' commit' + (sv.commitsToday === 1 ? '' : 's') + ' today)</div>'
      : '<div class="ship">' + ic('ship', 'inline') + ' Each commit today takes 2% off everything, up to 20%.</div>';
    const line = ui.keeper && ui.keeper.until > Date.now() ? ui.keeper.line : '';

    let body = '';
    const cards = (ids, kind, opts) => '<div class="cards">' + ids.map(id => shopCard(id, kind, opts)).join('') + '</div>';
    if (cat === 'featured') {
      const reveal = ui.reveal ? revealCard(ui.reveal) : '';
      const m = sv.mystery;
      const mystery = '<div class="mystery"><div class="thumb icon big">' + ic('gift') + '</div><div class="card-body"><b>Mystery Box</b>'
        + '<small>A random cosmetic you don\'t own yet. No duplicates, ever. ' + (m.exclusivesLeft ? m.exclusivesLeft + ' box-only exclusive' + (m.exclusivesLeft > 1 ? 's' : '') + ' left · ' + Math.round(m.exclusiveOdds * 100) + '% chance' : 'You\'ve found every exclusive!') + '</small>'
        + '<span class="ptag"><b>' + m.price + '</b>' + coin() + '</span></div>'
        + '<div class="card-actions"><button class="primary" data-act="mystery" ' + (m.left && snap.coins >= m.price ? '' : 'disabled') + '>' + (m.left ? 'Open' : 'Sold out') + '</button></div></div>';
      const bundles = sv.bundles.map(b => '<div class="row bundle"><span class="ico">' + ic('bag') + '</span><div class="grow"><b>' + esc(b.name) + '</b><small>'
        + Object.entries(b.contents).map(([f, n2]) => n2 + '× ' + esc(catalog.FOODS[f].name)).join(', ') + ' · worth ' + b.value + '</small></div>'
        + '<button data-act="buyBundle" data-arg="' + b.id + '" ' + (snap.coins >= b.price ? '' : 'disabled') + '>' + b.price + coin() + '</button></div>').join('');
      body = reveal
        + '<h3>Today\'s deals <span class="count">new in ' + hours + 'h ' + mins + 'm</span></h3>'
        + (sv.deals.length ? '<div class="cards">' + sv.deals.map(d => shopCard(d.id, d.kind, { deal: true })).join('') + '</div>' : '<p class="hint">You own everything on sale. Impressive.</p>')
        + '<h3>Mystery Box</h3>' + mystery
        + '<h3>Bundles</h3>' + bundles;
    } else if (cat === 'wardrobe') {
      const ids = Object.keys(catalog.ACCESSORIES).filter(id => !catalog.ACCESSORIES[id].vault && (!catalog.ACCESSORIES[id].exclusive || snap.owned[id]));
      const slot = s => cards(ids.filter(id => catalog.ACCESSORIES[id].slot === s), 'accessory');
      body = '<h3>Hats</h3>' + slot('hat') + '<h3>Face</h3>' + slot('face') + '<h3>Held</h3><p class="hint">Something for your pet to carry around.</p>' + slot('prop');
    } else if (cat === 'room') {
      const decor = catalog.DECOR || {};
      const zones = catalog.DECOR_ZONES || [];
      const placed = zones.filter(z => (snap.room || {})[z]).length;
      body = '<p class="hint">Decorations live on the LCD behind ' + esc(snap.pet.name) + ', one per spot. Floor pieces get used: your pet wanders over to nap, sip or admire. ' + placed + '/' + zones.length + ' spots filled.</p>'
        + zones.map(z => '<h3>' + esc(ZONE_LABEL[z] || z) + '</h3>' + cards(Object.keys(decor).filter(id => decor[id].zone === z), 'decor')).join('');
    } else if (cat === 'screens') {
      body = cards(Object.keys(catalog.SCREENS).filter(id => !catalog.SCREENS[id].exclusive || snap.owned[id]), 'screen');
    } else if (cat === 'food') {
      body = cards(Object.keys(catalog.FOODS).filter(id => catalog.FOODS[id].price > 0 && !catalog.FOODS[id].rare), 'food');
    } else if (cat === 'items') {
      body = cards(Object.keys(catalog.ITEMS || {}), 'item');
    } else {
      const owned = Object.keys(snap.owned).filter(id => sv.sell[id]);
      body = owned.length
        ? '<p class="hint">Sell cosmetics back to Mx. Stash for 40% of their price (exclusives: ' + catalog.SHOP.exclusiveSellPrice + ').</p>' + owned.map(id => {
          const kind = catalog.ACCESSORIES[id] ? 'accessory' : catalog.DECOR && catalog.DECOR[id] ? 'decor' : 'screen';
          const it = catalog[SHOP_TABLE[kind]][id];
          const confirm = ui.confirmSell === id;
          const SLOT_LABEL = { hat: 'Hat', face: 'Face', prop: 'Held', theme: 'Theme' };
          const icon = kind === 'accessory' ? ic(id) : kind === 'decor' ? '<canvas class="thumb mini" data-cell="2" data-preview="decor:' + id + '"></canvas>' : '<span class="swatch" data-bg="' + it.bg + '" data-ink="' + it.ink + '"></span>';
          return '<div class="row"><span class="ico">' + icon + '</span><div class="grow"><b>' + esc(it.name) + '</b><small>' + (kind === 'screen' ? 'Screen' : kind === 'decor' ? 'Room · ' + esc(ZONE_LABEL[it.zone] || it.zone) : SLOT_LABEL[it.slot] || it.slot) + '</small></div>'
            + (confirm ? '<button class="danger" data-act="sell" data-arg="' + id + '">Sell for ' + sv.sell[id] + coin() + '?</button><button data-sell-cancel>Keep</button>' : '<button data-sell="' + id + '">Sell ' + sv.sell[id] + coin() + '</button>') + '</div>';
        }).join('')
        : '<p class="hint">Nothing to sell yet. Cosmetics you own show up here.</p>';
    }

    $('tab-shop').innerHTML = '<div class="keeper"><canvas id="keeper-lcd" data-cell="3" width="60" height="60" aria-hidden="true"></canvas>'
      + '<div class="keeper-talk"><b>Mx. Stash</b><p id="keeper-line">' + esc(line || 'Welcome in! Browse all you like.') + '</p></div></div>'
      + goal + ship
      + '<div class="chips" role="tablist" aria-label="Shop sections">' + SHOP_CATS.map(([id, label]) => '<button role="tab" aria-selected="' + (cat === id) + '" data-shopcat="' + id + '">' + label + '</button>').join('') + '</div>'
      + body + vaultSection(sv);

    const root = $('tab-shop');
    root.querySelectorAll('.gbar i').forEach(el => { /** @type {HTMLElement} */ (el).style.width = /** @type {HTMLElement} */ (el).dataset.w + '%'; });
    root.querySelectorAll('.swatch').forEach(el => {
      const e = /** @type {HTMLElement} */ (el);
      e.style.background = e.dataset.bg || '';
      e.style.borderColor = e.dataset.ink || '';
    });
    paintPreviews(root);
  }

  function vaultSection(sv) {
    if (!sv.vault || !sv.vault.length) return '';
    const unlocked = sv.vault.filter(v => v.unlocked).length;
    const drop = n => 'Drop ' + String(n).padStart(2, '0');
    const cards = sv.vault.map(v => {
      const tag = '<small class="vtag"><span>' + drop(v.drop) + '</span><span class="rar ' + String(v.rarity).toLowerCase() + '">' + esc(v.rarity) + '</span></small>';
      if (!v.unlocked) {
        return '<div class="vault-card locked" title="Locked: unlocks with a promo code when this drop is announced">'
          + '<canvas class="thumb" data-cell="3" data-preview="locked:' + v.id + '" aria-label="A locked Vault item, shown in silhouette"></canvas>'
          + '<div class="card-body">' + tag + '<b>? ? ?</b><small class="riddle">“' + esc(v.teaser) + '”</small></div></div>';
      }
      return '<div class="vault-card unlocked' + (v.equipped ? ' on' : '') + '">'
        + '<canvas class="thumb" data-cell="3" data-preview="theme:' + v.id + '"></canvas>'
        + '<div class="card-body">' + tag + '<b>' + esc(v.name) + '</b><small>' + esc(v.desc) + '</small></div>'
        + '<div class="card-actions"><button class="' + (v.equipped ? '' : 'primary') + '" data-act="equip" data-arg="' + v.id + '">' + (v.equipped ? 'Transform back' : 'Transform') + '</button></div></div>';
    }).join('');
    return '<div class="vault">'
      + '<h3 class="vault-h">' + ic('lock', 'inline') + ' The Vault <span class="count">' + unlocked + ' / ' + sv.vault.length + ' unlocked</span></h3>'
      + '<p class="vhint">Secret transformations for your pet and screen. They can\'t be bought or won: each one unlocks with a promo code when it drops.</p>'
      + '<div class="redeem"><input id="promo-input" class="hk-input" placeholder="Enter a promo code" autocomplete="off" spellcheck="false" aria-label="Promo code" maxlength="64">'
      + '<button class="primary" data-redeem>Unlock</button></div>'
      + '<small class="vhint">Code drops are announced on <a href="#" class="vlink" data-link="drops">LinkedIn</a>.</small>'
      + '<div class="vault-grid">' + cards + '</div></div>';
  }

  function revealCard(r) {
    const it = r.kind === 'accessory' ? catalog.ACCESSORIES[r.id] : catalog.SCREENS[r.id];
    if (!it) return '';
    const worn = r.kind === 'accessory' ? snap.equipped[it.slot] === r.id : snap.equipped.screen === r.id;
    return '<div class="reveal ' + (r.exclusive ? 'exclusive' : '') + '">' + thumbFor(r.id, r.kind)
      + '<div class="card-body"><small>' + (r.exclusive ? '✦ Box exclusive ✦' : 'You unboxed') + '</small><b>' + esc(it.name) + '</b><small>' + esc(it.desc || '') + '</small></div>'
      + '<div class="card-actions">' + (worn ? '' : '<button class="primary" data-act="equip" data-arg="' + r.id + '">' + (r.kind === 'screen' ? 'Use it' : 'Wear it') + '</button>') + '<button data-reveal-close>Nice!</button></div></div>';
  }

  // =====================================================================
  // Collection: species, achievements, memorial
  // =====================================================================
  function spriteCanvas(key, silhouette) {
    const c = document.createElement('canvas');
    c.width = 16 * 4; c.height = 16 * 4;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const pal = catalog.SCREENS[snap.equipped.screen] || catalog.SCREENS.classic;
    x.fillStyle = pal.bg;
    x.fillRect(0, 0, c.width, c.height);
    const rows = S[key];
    x.fillStyle = pal.ink;
    x.globalAlpha = silhouette ? 0.22 : 1;
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
      if (ch === '.' || (silhouette && ch !== '#')) return;
      x.fillRect(xx * 4, yy * 4, 4, 4);
    }));
    x.globalAlpha = 1;
    if (silhouette) { x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.fillText('?', 32, 40); }
    return c;
  }

  function renderDex() {
    const species = Object.entries(catalog.SPECIES).filter(([id]) => id !== 'egg');
    const found = species.filter(([id]) => snap.dex[id]).length;
    const tracks = snap.view.achievements || [];
    const tiers = snap.view.achievementTiers || { unlocked: 0, total: 0 };
    // In progress first (closest to the next tier on top), then not started, then completed tracks.
    const order = a => (a.maxed ? 2 : a.done > 0 || a.progress > 0 ? 0 : 1);
    const sorted = tracks.slice().sort((a, b) => order(a) - order(b) || b.progress - a.progress);
    const stageLabel = s => (catalog.STAGES.find(x => x.id === s) || { label: s }).label;
    const causes = { starvation: 'starvation', illness: 'illness', neglect: 'neglect', rehomed: 'rehomed' };

    const graves = snap.graveyard.length
      ? snap.graveyard.map(g => `<div class="row"><span class="ico">${ic(g.causeOfDeath === "rehomed" ? "home" : "grave")}</span><div class="grow"><b>${esc(g.name)}</b><small>${esc(catalog.SPECIES[g.species] ? catalog.SPECIES[g.species].name : '?')} · gen ${g.generation} · ${fmtDur(g.ageMs)} · ${esc(causes[g.causeOfDeath] || g.causeOfDeath)} · ${new Date(g.diedAt).toLocaleDateString()}</small></div></div>`).join('')
      : '<p class="hint">No one here yet. Long may it stay that way.</p>';

    const arts = (snap.view.expedition && snap.view.expedition.artefacts) || [];
    const artsFound = arts.filter(a => a.found).length;
    const artefacts = arts.length ? `
      <h3>Artefacts <span class="count">${artsFound}/${arts.length}</span></h3>
      <p class="hint">Brought back from expeditions. No two trips are alike.</p>
      <div class="artefacts">${arts.map(a => `<div class="artefact ${a.found ? 'found' : ''} r-${String(a.rarity).toLowerCase()}" title="${esc(a.found ? a.desc : `Undiscovered · found in ${a.from}`)}"><span class="ico">${ic(a.found ? a.icon : 'lock')}</span><div class="grow"><b>${a.found ? esc(a.name) : '? ? ?'}</b><small>${esc(a.rarity)}${a.found ? '' : ` · ${esc(a.from || '')}`}</small></div></div>`).join('')}</div>` : '';

    $('tab-dex').innerHTML = `
      <h3>Species <span class="count">${found}/${species.length}</span></h3>
      <p class="hint">How well you care for your pet decides what it grows into, and how you code decides the adult: polyglots, night coders and long dynasties each have their own.</p>
      <div class="dex" id="dex-grid"></div>
      ${artefacts}
      <h3>Achievements <span class="count">${tiers.unlocked}/${tiers.total} tiers</span></h3>
      <p class="hint">Each achievement has tiers. Unlock one and the next, harder goal appears.</p>
      <div class="achievements">${sorted.map(a => {
        const pips = a.tiers > 1 ? `<span class="pips" aria-label="Tier ${a.done} of ${a.tiers}">${Array.from({ length: a.tiers }, (_, i) => `<i class="${i < a.done ? 'on' : ''}"></i>`).join('')}</span>` : '';
        const line = a.maxed
          ? `<small>${esc(a.lastDesc || '')} · complete</small>`
          : `<small>${a.next.tierName && a.done > 0 ? 'Next: ' : ''}${esc(a.next.desc)} · +${a.next.reward}${ic('coin', 'inline')}</small>`
            + (a.next.goal > 1 ? `<div class="abar" role="progressbar" aria-valuemin="0" aria-valuemax="${a.next.goal}" aria-valuenow="${Math.min(a.value, a.next.goal)}"><i data-w="${Math.round(a.progress * 100)}"></i></div><small class="aval">${n(Math.min(a.value, a.next.goal))} / ${n(a.next.goal)}</small>` : '');
        const title = a.unlockedAt ? `Last tier unlocked ${new Date(a.unlockedAt).toLocaleDateString()}` : 'Not started';
        return `<div class="ach ${a.done ? 'got' : ''} ${a.maxed ? 'maxed' : ''}" title="${esc(title)}"><span class="ico">${ic(ACH_ICON[a.id] || 'star')}</span><div class="grow"><b>${esc(a.name)} ${pips}</b>${line}</div></div>`;
      }).join('')}</div>
      <h3>Memorial</h3>${graves}`;

    $('tab-dex').querySelectorAll('.abar i').forEach(el => { /** @type {HTMLElement} */ (el).style.width = /** @type {HTMLElement} */ (el).dataset.w + '%'; });
    const gridEl = $('dex-grid');
    for (const [id, s] of species) {
      const seen = !!snap.dex[id];
      const card = document.createElement('div');
      card.className = 'dex-card' + (seen ? '' : ' unseen') + (snap.pet.species === id ? ' current' : '');
      card.title = seen ? s.blurb : `Undiscovered ${stageLabel(s.stage).toLowerCase()}`;
      card.appendChild(spriteCanvas(id, !seen));
      const label = document.createElement('div');
      const shinySeen = snap.shinies && snap.shinies[id];
      label.innerHTML = `<b>${seen ? esc(s.name) : '???'}${shinySeen ? ` <span title="You've raised a shiny ${esc(s.name)}">${ic('sparkle', 'inline')}</span>` : ''}</b><small>${esc(stageLabel(s.stage))}</small>`;
      card.appendChild(label);
      gridEl.appendChild(card);
    }
  }

  // =====================================================================
  // Stats
  // =====================================================================
  function fmtDur(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
  }
  const n = x => Number(x).toLocaleString();

  function renderStats() {
    const v = snap.view, t = snap.totals;
    const max = Math.max(30 * 60000, ...v.week.map(d => d.codingMs));
    const bars = v.week.map((d, i) => {
      const pct = Math.max(d.codingMs > 0 ? 3 : 0, (d.codingMs / max) * 100);
      const isToday = i === v.week.length - 1;
      const tip = `${d.label}: ${fmtDur(d.codingMs)} coding · ${n(d.chars)} chars · ${d.commits} commits · ${d.coins} coins`;
      return `<div class="col" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
        <div class="track"><i data-h="${pct.toFixed(1)}">${isToday && d.codingMs ? `<span class="val">${fmtDur(d.codingMs)}</span>` : ''}</i></div>
        <span class="lbl">${esc(d.label)}</span></div>`;
    }).join('');
    const table = v.week.map(d => `<tr><td>${esc(d.label)}</td><td>${fmtDur(d.codingMs)}</td><td>${n(d.chars)}</td><td>${d.commits}</td></tr>`).join('');

    $('tab-stats').innerHTML = `
      <h3>Today</h3>
      <div class="tiles">
        <div class="tile"><b>${v.codingToday}</b><small>coding</small></div>
        <div class="tile"><b>${n(v.today.chars)}</b><small>characters</small></div>
        <div class="tile"><b>${v.today.commits}</b><small>commits</small></div>
        <div class="tile"><b>${v.today.coins}</b><small>coins earned</small></div>
      </div>
      <h3>Coding time, last 7 days</h3>
      <div class="chart" role="group" aria-label="Coding time per day for the last 7 days">${bars}<div class="tooltip" id="chart-tip" hidden></div></div>
      <details class="table-view"><summary>Show as table</summary>
        <table><thead><tr><th>Day</th><th>Coding</th><th>Chars</th><th>Commits</th></tr></thead><tbody>${table}</tbody></table>
      </details>
      ${langBlock('Languages today', v.languagesToday)}
      ${langBlock('Languages, all time', v.languagesAll)}
      <h3>All time</h3>
      <div class="kv">
        <span>Focus time</span><b>${v.focusTotal} · ${n(t.focusSessions || 0)} sessions</b>
        <span>Quests completed</span><b>${n(t.questsDone || 0)}</b>
        <span>Coding time</span><b>${v.codingTotal}</b>
        <span>Characters typed</span><b>${n(t.chars)}</b>
        <span>Commits</span><b>${n(t.commits)}</b>
        <span>Errors cleared</span><b>${n(t.errorsCleared)}</b>
        <span>Games played</span><b>${n(t.games)}</b>
        <span>Bugs squashed</span><b>${n(t.bugsSquashed)}</b>
        <span>Expeditions</span><b>${n(t.expeditions || 0)} · ${n(Object.keys(snap.artefacts || {}).length)} artefacts</b>
        <span>Rubber-duck sessions</span><b>${n(t.duckSessions || 0)}</b>
        <span>Test files saved</span><b>${n(t.testSaves || 0)}</b>
        <span>Eggs hatched</span><b>${n(t.hatched)}</b>
        <span>Raised to adulthood</span><b>${n(t.adults)}</b>
        <span>Best streak</span><b>${snap.streak.best} days</b>
        <span>Coins earned</span><b>${n(t.coinsEarned)}</b>
      </div>
      <h3>Tools</h3>
      <div class="tools">
        <button data-cmd="showRecap">${ic("chart")} Weekly recap</button>
        <button data-tab="journal">${ic("book")} Journal</button>
        <button data-share>${ic("camera")} Share card</button>
        <button data-cmd="exportCsv">${ic("chart")} Export CSV</button>
        <button data-cmd="openInEditor">${ic("window")} Open in editor</button>
        <button data-cmd="exportSave">${ic("floppy")} Export save</button>
        <button data-cmd="importSave">${ic("folder")} Import save</button>
        <button data-cmd="walkthrough">${ic("book")} Guide</button>
        <button data-cmd="openSettings">${ic("gear")} Settings</button>
        <button data-cmd="newPet">${ic("egg")} Start over</button>
        <button data-cmd="resetAll" class="danger">${ic("x")} Erase all data</button>
      </div>`;
    $('tab-stats').querySelectorAll('.track i').forEach(el => { /** @type {HTMLElement} */ (el).style.height = /** @type {HTMLElement} */ (el).dataset.h + '%'; });
    $('tab-stats').querySelectorAll('.lang i').forEach(el => { /** @type {HTMLElement} */ (el).style.width = /** @type {HTMLElement} */ (el).dataset.w + '%'; });
  }

  /** A ranked list of languages; one hue, labelled directly, so it reads without a legend. */
  function langBlock(title, langs) {
    if (!langs || !langs.length) return '';
    return `<h3>${esc(title)}</h3><div class="langs">` + langs.map(l => `<div class="lang" title="${esc(l.id)}: ${fmtDur(l.ms)}"><span class="name">${esc(l.id)}</span><span class="lbar"><i data-w="${Math.max(2, Math.round(l.share * 100))}"></i></span><span class="pct">${Math.round(l.share * 100)}%</span></div>`).join('') + '</div>';
  }

  // =====================================================================
  // Team
  // =====================================================================
  function memberCanvas(m) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const th = m.pet.theme && catalog.THEMES && catalog.THEMES[m.pet.theme];
    const pal = th ? th.palette : catalog.SCREENS[m.pet.screen] || catalog.SCREENS.classic;
    x.fillStyle = pal.bg; x.fillRect(0, 0, 64, 64);
    if (th) { x.fillStyle = pal.star; for (const [sx, sy] of [[5, 7], [50, 4], [58, 30], [8, 52], [44, 56], [30, 3]]) x.fillRect(sx, sy, 2, 2); }
    x.fillStyle = m.pet.shiny ? (pal.shine || pal.ink) : pal.ink;
    const rows = S[m.pet.mood === 'dead' ? 'grave' : m.pet.species] || S.blip;
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
      if (ch === '.' || (m.pet.mood === 'asleep' && ch === 'E')) return;
      x.fillRect(xx * 4, yy * 4, 4, 4);
    }));
    return c;
  }

  function renderTeam() {
    const t = snap.view.team || { members: [], sharing: false, hasWorkspace: false, displayName: '' };
    const el = $('tab-team');
    const head = !t.hasWorkspace
      ? '<div class="banner"><p>Open a folder or repo to see your team\'s pets.</p></div>'
      : `<div class="team-share ${t.sharing ? 'on' : ''}"><span class="ico">${ic('team')}</span><div class="grow"><b>${t.sharing ? `Sharing as ${esc(t.displayName)}` : 'Share your pet with this repo'}</b>`
        + `<small>${t.sharing ? 'Your card is in .idlepal/. Commit it so teammates see it.' : 'Writes a small card (pet, mood, streak; never coding time) to .idlepal/. It travels with git: no server, no accounts.'}</small></div>`
        + `<button class="${t.sharing ? '' : 'primary'}" data-cmd="toggleTeamShare">${t.sharing ? 'Stop' : 'Share'}</button></div>`;
    const members = t.members.length
      ? '<div class="team-grid" id="team-grid"></div>'
      : t.hasWorkspace ? '<p class="hint">No teammates here yet. When others share, their pets appear here after a pull.</p>' : '';
    // Weekly Challenge leaderboard: your best plus every teammate whose card is from this week.
    const ch = snap.view.challenge;
    let board = '';
    if (ch && t.hasWorkspace) {
      const rows = t.members.filter(m => m.challenge && m.challenge.week === ch.week && m.challenge.game === ch.game)
        .map(m => ({ name: m.name, pet: m.pet.name, score: m.challenge.score, me: false }));
      if (ch.plays > 0) rows.push({ name: t.displayName || 'You', pet: snap.pet.name, score: ch.best, me: true });
      rows.sort((a, b) => b.score - a.score);
      board = `<h3>Weekly Challenge <span class="count">${esc(ch.name)} · ×${ch.multiplier} coins</span></h3>`
        + (rows.length
          ? `<div class="board">${rows.map((r, i) => `<div class="brow ${r.me ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="grow"><b>${esc(r.pet)}</b> <small>${esc(r.name)}</small></span><b class="score">${r.score}</b></div>`).join('')}</div>`
          : `<p class="hint">Nobody has posted a score this week. Play ${esc(ch.name)} and yours goes on your card.</p>`);
    }
    el.innerHTML = `<h3>Team habitat <span class="count">${t.members.length}</span></h3>${head}${board}${members}`;
    const grid = document.getElementById('team-grid');
    if (!grid) return;
    for (const m of t.members) {
      const card = document.createElement('div');
      card.className = 'dex-card member';
      card.title = `${m.pet.name} the ${m.pet.speciesName} is ${MOOD_WORD[m.pet.mood] || m.pet.mood}`;
      card.appendChild(memberCanvas(m));
      const label = document.createElement('div');
      const ago = m.updatedAt ? fmtDur(Math.max(0, Date.now() - m.updatedAt)) : '';
      label.innerHTML = `<b>${esc(m.pet.name)}${m.pet.shiny ? ` ${ic('sparkle', 'inline')}` : ''}</b><small>${esc(m.name)}</small>`
        + `<small>${ic('flame', 'inline')}${m.streak} · ${ic('trophy', 'inline')}${m.achievements}${m.pet.mood === 'away' ? ` · ${ic('map', 'inline')}` : ''}</small>${ago ? `<small class="ago">${ago} ago</small>` : ''}`;
      card.appendChild(label);
      grid.appendChild(card);
    }
  }

  // =====================================================================
  // Weekly recap
  // =====================================================================
  function showRecap() {
    if (!snap) return;
    const r = snap.view.recap;
    const el = $('recap');
    const fmtDay = k => new Date(k + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });
    const langs = r.topLanguages.map(l => `${esc(l.id)} ${Math.round(l.share * 100)}%`).join(' · ') || '-';
    el.innerHTML = `<div class="modal-card"><h2 id="recap-title">${ic('chart')} Your week with ${esc(r.pet.name)}</h2>
      <p class="hint">${esc(r.from)} to ${esc(r.to)}</p>
      <div class="tiles">
        <div class="tile"><b>${fmtDur(r.codingMs)}</b><small>coding</small></div>
        <div class="tile"><b>${r.activeDays}/7</b><small>active days</small></div>
        <div class="tile"><b>${n(r.commits)}</b><small>commits</small></div>
        <div class="tile"><b>${n(r.coins)}</b><small>coins earned</small></div>
      </div>
      <div class="kv">
        <span>Best day</span><b>${r.bestDay ? `${fmtDay(r.bestDay.day)} · ${fmtDur(r.bestDay.codingMs)}` : '-'}</b>
        <span>Top languages</span><b>${langs}</b>
        <span>Current streak</span><b>${r.streak} days</b>
      </div>
      <div class="modal-actions"><button class="primary" data-close>Nice!</button></div></div>`;
    el.hidden = false;
    const btn = /** @type {HTMLElement|null} */ (el.querySelector('[data-close]'));
    if (btn) btn.focus();
  }
  function hideRecap() { $('recap').hidden = true; }

  // Chart tooltip (hover and keyboard focus).
  function showTip(col) {
    const tip = document.getElementById('chart-tip');
    if (!tip || !col) return;
    tip.textContent = col.dataset.tip || '';
    tip.hidden = false;
    const chart = /** @type {HTMLElement} */ (tip.parentElement);
    const cr = chart.getBoundingClientRect(), r = col.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - cr.left + r.width / 2, 70), cr.width - 70);
    tip.style.left = x + 'px';
  }
  function hideTip() { const tip = document.getElementById('chart-tip'); if (tip) tip.hidden = true; }

  // =====================================================================
  // Mini-games
  // =====================================================================
  function startGame(kind) {
    ui.drawer = null;
    if (kind === 'leftright') {
      game = { kind, round: 1, wins: 0, phase: 'choose', dir: 0, guess: 0 };
      setGameBar(`Round 1/5: which way will ${snap.pet.name} look?`, [['◀ Left', 'guess:-1'], ['Right ▶', 'guess:1']]);
    } else if (ARCADE[kind]) {
      ARCADE[kind].start(Date.now());
      startLoop();
    } else {
      const now = Date.now();
      game = { kind: 'bugs', start: now, endsAt: now + 20000, bugs: [], nextSpawn: now + 500, score: 0, splats: [] };
      setGameBar('Click the bugs (or press 1–9). Squashed: 0', [['Quit', 'quit']]);
    }
    renderPet();
    sfx('blip');
  }

  /** Smooth animation while an arcade game runs (the idle LCD only needs ~10fps). */
  function startLoop() {
    if (typeof requestAnimationFrame !== 'function') return;
    const loop = () => { if (!game) return; render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  function setGameBar(text, buttons) {
    $('game-bar').hidden = false;
    document.body.classList.add('playing');
    const bar = $('game-bar');
    setTimeout(() => { if (bar.scrollIntoView) bar.scrollIntoView({ block: 'nearest' }); }, 0);
    $('game-prompt').textContent = text;
    $('game-controls').innerHTML = buttons.map(([label, id]) => `<button data-gamebtn="${id}">${label}</button>`).join('');
  }

  function endGame(score) {
    if (!game) return;
    const kind = game.kind;
    game = null;
    $('game-bar').hidden = true;
    document.body.classList.remove('playing');
    if (score !== null) send('playResult', { game: kind, score });
    renderPet();
  }

  function guess(dir) {
    if (!game || game.kind !== 'leftright' || game.phase !== 'choose') return;
    game.guess = dir;
    game.dir = Math.random() < 0.5 ? -1 : 1;
    game.phase = 'reveal';
    const hit = game.dir === dir;
    if (hit) game.wins++;
    sfx(hit ? 'coin' : 'nope');
    $('game-prompt').textContent = `${hit ? 'Got it!' : 'Nope!'} ${game.wins}/${game.round}`;
    setTimeout(() => {
      if (!game || game.kind !== 'leftright') return;
      if (game.round >= 5) return endGame(game.wins);
      game.round++;
      game.phase = 'choose';
      $('game-prompt').textContent = `Round ${game.round}/5: which way?`;
    }, 1000);
  }

  const SLOTS = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) SLOTS.push({ x: 6 + c * 12, y: 3 + r * 7 });

  function bugsScene(now) {
    const g = game;
    if (now >= g.endsAt) { const s = g.score; setTimeout(() => endGame(s), 0); game = { ...g, endsAt: Infinity, bugs: [] }; return; }
    const elapsed = (now - g.start) / 20000;
    g.bugs = g.bugs.filter(b => b.until > now);
    if (now >= g.nextSpawn && g.bugs.length < 3) {
      const free = SLOTS.map((_, i) => i).filter(i => !g.bugs.some(b => b.slot === i));
      const slot = free[Math.floor(Math.random() * free.length)];
      g.bugs.push({ slot, until: now + 1300 - elapsed * 550 });
      g.nextSpawn = now + 650 - elapsed * 300;
    }
    // Timer along the top row.
    const remaining = Math.max(0, (g.endsAt - now) / 20000);
    for (let x = 0; x < Math.round(W * remaining); x++) plot(x, 0);
    const wiggle = Math.floor(now / 200) % 2;
    for (const b of g.bugs) draw(S.bug, SLOTS[b.slot].x + wiggle, SLOTS[b.slot].y);
    g.splats = g.splats.filter(s => s.until > now);
    for (const s of g.splats) draw(S.splat, SLOTS[s.slot].x, SLOTS[s.slot].y);
  }

  function squash(slot) {
    if (!game || game.kind !== 'bugs') return;
    const i = game.bugs.findIndex(b => b.slot === slot);
    if (i < 0) { sfx('nope'); return; }
    game.bugs.splice(i, 1);
    game.score++;
    game.splats.push({ slot, until: Date.now() + 250 });
    $('game-prompt').textContent = `Click the bugs (or press 1–9). Squashed: ${game.score}`;
    sfx('coin');
  }

  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    if (game && ARCADE[game.kind]) { if (ARCADE[game.kind].tap) ARCADE[game.kind].tap(x, y); return; }
    if (!game || game.kind !== 'bugs') return;
    let best = -1, bestD = 36;
    SLOTS.forEach((s, i) => {
      const d = (x - (s.x + 2.5)) ** 2 + (y - (s.y + 2)) ** 2;
      if (d < bestD && game.bugs.some(b => b.slot === i)) { bestD = d; best = i; }
    });
    if (best >= 0) squash(best); else sfx('nope');
  });

  // ---------------------------------------------------------------------
  // Arcade: newer games plug in here. Each has start(now) and scene(now),
  // plus optional key(e), tap() and button(id) handlers.
  // ---------------------------------------------------------------------
  const GAME_MAX = { dash: 80, stack: 25, simon: 25, hotkeys: 60, merge: 5, snake: 60, pipeline: 50, breakout: 52, pong: 40, bisect: 5, regex: 8, bigo: 6 };

  /** Freeze the game, show the result for a moment, then report the score. */
  function finish(score, text) {
    if (!game || game.over) return;
    game.over = true;
    $('game-prompt').textContent = text;
    sfx(score ? 'fanfare' : 'sad');
    setTimeout(() => { if (game && game.over) endGame(Math.floor(score)); }, 1100);
  }
  const promptText = t => { $('game-prompt').textContent = t; };
  const rnd = n => Math.floor(Math.random() * n);

  // ----- Deploy Dash: endless runner -----
  const RUN_X = 5;
  const dash = {
    start(now) {
      game = { kind: 'dash', last: now, t: 0, y: 0, vy: 0, obstacles: [], next: 1.2, speed: 16, dist: 0, score: 0 };
      setGameBar('Space or tap to jump the bugs. Dodged: 0', [['Jump ⤒', 'jump'], ['Quit', 'quit']]);
    },
    jump() {
      const g = game;
      if (g.over || g.y > 0) return;
      g.vy = 36;
      sfx('blip');
    },
    key(e) { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (e.preventDefault) e.preventDefault(); dash.jump(); } },
    tap() { dash.jump(); },
    button(id) { if (id === 'jump') dash.jump(); },
    scene(now) {
      const g = game;
      const dt = Math.min(0.1, Math.max(0, (now - g.last) / 1000));
      g.last = now;
      if (!g.over) {
        g.t += dt;
        g.speed = Math.min(42, 16 + g.t * 0.9);
        g.dist += g.speed * dt;
        g.vy -= 70 * dt;
        g.y = Math.max(0, g.y + g.vy * dt);
        if (g.y === 0 && g.vy < 0) g.vy = 0;
        g.next -= dt;
        if (g.next <= 0) {
          g.obstacles.push({ x: W + 1, tall: g.t > 8 && Math.random() < 0.3, passed: false });
          // Always leave room to land and jump again: one full jump (2v/g ≈ 1.03s) plus a random margin.
          g.next = 1.05 + (6 + Math.random() * 18) / g.speed;
        }
        const py = Math.round(g.y);
        for (const o of g.obstacles) {
          o.x -= g.speed * dt;
          const ox = Math.round(o.x);
          const height = o.tall ? 6 : 4;
          if (ox + 1 < RUN_X + 5 && ox + 4 > RUN_X + 1 && py <= height - 1) { g.hit = true; finish(g.score, 'Crashed in production! Dodged ' + g.score + '.'); break; }
          if (!o.passed && o.x + 5 < RUN_X) { o.passed = true; g.score++; promptText('Space or tap to jump the bugs. Dodged: ' + g.score); }
        }
        g.obstacles = g.obstacles.filter(o => o.x > -8);
        if (g.score >= GAME_MAX.dash) finish(g.score, 'Deployed! Flawless run.');
      }
      for (let x = 0; x < W; x++) if ((x + Math.floor(g.dist)) % 4 !== 0) plot(x, 23);
      const py = Math.round(g.y);
      const sprite = g.hit ? S.runnerHit : py > 0 ? S.runnerJump : Math.floor(g.dist / 2) % 2 ? S.runner1 : S.runner2;
      draw(sprite, RUN_X, 17 - py);
      for (const o of g.obstacles) {
        const ox = Math.round(o.x);
        draw(S.bug, ox, 19);
        if (o.tall) draw(S.bug, ox, 17);
      }
    },
  };

  // ----- Stack Overflow: stacker -----
  const stack = {
    start(now) {
      game = { kind: 'stack', last: now, layers: [{ x: 14, w: 12 }], cur: { x: 0, w: 12, dir: 1 }, score: 0 };
      setGameBar('Space or tap to drop the layer. Stacked: 0', [['Drop ⤓', 'drop'], ['Quit', 'quit']]);
    },
    drop() {
      const g = game;
      if (g.over) return;
      const prev = g.layers[g.layers.length - 1];
      const x = Math.round(g.cur.x);
      const left = Math.max(x, prev.x);
      const right = Math.min(x + g.cur.w, prev.x + prev.w);
      const w = right - left;
      if (w <= 0) return finish(g.score, 'Stack overflow! ' + g.score + ' layers.');
      g.layers.push({ x: left, w });
      g.score++;
      sfx(x === prev.x ? 'coin' : 'blip');
      const dir = g.score % 2 ? -1 : 1;
      g.cur = { x: dir > 0 ? 0 : W - w, w, dir };
      promptText((x === prev.x ? 'Perfect! ' : '') + 'Stacked: ' + g.score);
      if (g.score >= GAME_MAX.stack) finish(g.score, 'Stacked to the ceiling!');
    },
    key(e) { if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); stack.drop(); } },
    tap() { stack.drop(); },
    button(id) { if (id === 'drop') stack.drop(); },
    scene(now) {
      const g = game;
      const dt = Math.min(0.1, Math.max(0, (now - g.last) / 1000));
      g.last = now;
      if (!g.over) {
        const speed = 10 + g.score * 1.3;
        g.cur.x += g.cur.dir * speed * dt;
        if (g.cur.x <= 0) { g.cur.x = 0; g.cur.dir = 1; }
        if (g.cur.x >= W - g.cur.w) { g.cur.x = W - g.cur.w; g.cur.dir = -1; }
      }
      const moving = g.layers.length;
      const offset = Math.max(0, 3 - (22 - 2 * moving));
      const fill = (x0, w, top) => { for (let y = top; y < top + 2; y++) for (let x = x0; x < x0 + w; x++) if ((x + y) % 5 || y === top + 1) plot(x, y); };
      g.layers.forEach((l, i) => fill(l.x, l.w, 22 - 2 * i + offset));
      if (!g.over) fill(Math.round(g.cur.x), g.cur.w, 22 - 2 * moving + offset);
    },
  };

  // ----- Rubber Duck Says: Simon -----
  const DIRS = ['up', 'right', 'down', 'left'];
  const ARROW = { up: ['arrowU', 17, 1], down: ['arrowD', 17, 18], left: ['arrowL', 8, 10], right: ['arrowR', 27, 10] };
  const simon = {
    start(now) {
      game = { kind: 'simon', seq: [DIRS[rnd(4)]], phase: 'show', t0: now + 700, input: 0, flash: null, score: 0 };
      setGameBar('Watch the duck…', [['↑', 'dir:up'], ['←', 'dir:left'], ['↓', 'dir:down'], ['→', 'dir:right'], ['Quit', 'quit']]);
    },
    step() { return Math.max(360, 720 - game.seq.length * 25); },
    press(dir) {
      const g = game;
      if (g.over || g.phase !== 'input') return;
      const now = Date.now();
      g.flash = { dir, until: now + 250 };
      if (dir !== g.seq[g.input]) return finish(g.score, 'Wrong way! The duck says ' + g.score + ' steps.');
      g.input++;
      sfx('blip');
      if (g.input === g.seq.length) {
        g.score = g.seq.length;
        if (g.score >= GAME_MAX.simon) return finish(g.score, 'The duck has nothing left to teach you.');
        g.seq.push(DIRS[rnd(4)]);
        g.phase = 'show';
        g.t0 = now + 800;
        g.input = 0;
        promptText('Nice! ' + g.score + ' steps. Watch again…');
      }
    },
    key(e) {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (map[e.key]) { if (e.preventDefault) e.preventDefault(); simon.press(map[e.key]); }
    },
    button(id) { if (id.startsWith('dir:')) simon.press(id.slice(4)); },
    scene(now) {
      const g = game;
      draw(S.duck, 15, 8);
      for (const d of DIRS) { const [, x, y] = ARROW[d]; plot(x + 2, y + 2); }
      let lit = null;
      if (g.phase === 'show' && !g.over) {
        const step = simon.step();
        const i = Math.floor((now - g.t0) / step);
        if (i >= g.seq.length) { g.phase = 'input'; promptText('Your turn: repeat ' + g.seq.length + ' step' + (g.seq.length > 1 ? 's' : '') + '.'); }
        else if (i >= 0 && (now - g.t0) % step < step * 0.7) lit = g.seq[i];
      }
      if (g.flash && g.flash.until > now) lit = g.flash.dir;
      if (lit) { const [spr, x, y] = ARROW[lit]; draw(S[spr], x, y); }
    },
  };

  // ----- Hot Keys: type racer -----
  const TOKENS = ['const', 'let', '=>', '!==', '===', 'await', 'async', 'return', 'null', 'undefined', 'git push', 'git commit',
    'npm i', 'import', 'export', 'try', 'catch', 'finally', '{}', '[]', '()', '&&', '||', '??', '...', '++', '?.', 'console.log',
    'useState', 'fn main()', 'def', 'self', 'lambda', 'SELECT *', 'WHERE', 'JOIN', 'sudo', 'ls -la', 'cd ..', 'grep', '0x1F',
    'true', 'false', 'typeof', 'interface', '<T>', '</div>', '#include', 'printf', 'fmt.Println', 'impl', 'match', 'yield',
    'struct', 'enum', 'pub fn', '.then()', '.map()', 'JSON.parse', 'git rebase', 'docker ps', 'kubectl', 'unwrap()', 'println!'];
  const hotkeys = {
    start(now) {
      game = { kind: 'hotkeys', start: now, endsAt: now + 30000, score: 0, token: TOKENS[rnd(TOKENS.length)], hitUntil: 0 };
      setGameBar('', []);
      $('game-controls').innerHTML = '<input id="hk-input" class="hk-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the token shown"><button data-gamebtn="quit">Quit</button>';
      hotkeys.show();
      const input = document.getElementById('hk-input');
      if (input && input.focus) input.focus();
    },
    show() {
      $('game-prompt').innerHTML = 'Type <code class="token">' + esc(game.token) + '</code> <span class="count">' + game.score + ' typed</span>';
    },
    typed(value) {
      const g = game;
      if (!g || g.kind !== 'hotkeys' || g.over) return false;
      if (value.trim() !== g.token) return false;
      g.score++;
      g.hitUntil = Date.now() + 300;
      let next = g.token;
      while (next === g.token) next = TOKENS[rnd(TOKENS.length)];
      g.token = next;
      sfx('coin');
      hotkeys.show();
      if (g.score >= GAME_MAX.hotkeys) finish(g.score, 'Keyboard on fire! 🔥');
      return true;
    },
    scene(now) {
      const g = game;
      if (!g.over && now >= g.endsAt) finish(g.score, 'Time! ' + g.score + ' tokens.');
      const remaining = Math.max(0, (g.endsAt - now) / 30000);
      for (let x = 0; x < Math.round(W * remaining); x++) plot(x, 0);
      const key = S[snap.pet.species] ? snap.pet.species : 'blip';
      const bounce = Math.floor(now / 150) % 2;
      drawPet(key, 12, 5 + bounce, { look: 0 });
      drawAccessories(key, 12, 5 + bounce, snap.equipped);
      if (g.hitUntil > now) { draw(S.sparkle, 3, 8); draw(S.sparkle, 32, 8); }
    },
  };

  // ----- Merge Conflict: spot the bug -----
  const CONFLICTS = [
    ['compare two values', 'if (a === b) {', 'if (a = b) {'],
    ['loop over every item', 'for (let i = 0; i < arr.length; i++)', 'for (let i = 0; i <= arr.length; i++)'],
    ['wait for the response', 'const res = await fetch(url);', 'const res = fetch(url);'],
    ['parse the payload', 'JSON.parse(text)', 'JSON.parse(text'],
    ['Python: define a function', 'def greet(name):', 'def greet(name)'],
    ['copy the array', 'const copy = [...list];', 'const copy = list;'],
    ['check for null', 'if (user != null)', 'if (user =! null)'],
    ['Python: compare strings', 'if name == "admin":', 'if name is "admin":'],
    ['remember an id', 'seen.add(id);', 'seen.push(id);  // seen is a Set'],
    ['SQL: delete one user', 'DELETE FROM users WHERE id = 42;', 'DELETE FROM users;'],
    ['git: undo the last commit, keep the changes', 'git reset --soft HEAD~1', 'git reset --hard HEAD~1'],
    ['declare an async function', 'async function load() {', 'function async load() {'],
    ['CSS: centre with flexbox', 'justify-content: center;', 'justify-content: middle;'],
    ['Python: read a file safely', 'with open(path) as f:', 'open(path) as f:'],
    ['default when missing (0 is valid)', 'const n = count ?? 10;', 'const n = count || 10;'],
    ['Go: handle the error', 'if err != nil { return err }', 'if err == nil { return err }'],
    ['Rust: borrow, don\'t move', 'print(&name);', 'print(name); print(name);'],
    ['bash: quote the path', 'rm -- "$file"', 'rm $file'],
  ];
  const merge = {
    start() {
      const pool = CONFLICTS.slice();
      const rounds = [];
      while (rounds.length < 5) {
        const [ctx, good, bad] = pool.splice(rnd(pool.length), 1)[0];
        const oursGood = Math.random() < 0.5;
        rounds.push({ ctx, ours: oursGood ? good : bad, theirs: oursGood ? bad : good, correct: oursGood ? 'ours' : 'theirs' });
      }
      game = { kind: 'merge', rounds, round: 0, score: 0, phase: 'choose', picked: null };
      setGameBar('', [['◀ Keep ours', 'pick:ours'], ['Keep theirs ▶', 'pick:theirs'], ['Quit', 'quit']]);
      merge.show();
    },
    show() {
      const g = game;
      const r = g.rounds[g.round];
      const mark = side => (g.phase === 'reveal' ? (side === r.correct ? ' good' : ' bad') : '');
      $('game-prompt').innerHTML = '<div class="merge"><div class="ctx">Conflict ' + (g.round + 1) + '/5 · goal: ' + esc(r.ctx) + '</div>'
        + '<div class="side' + mark('ours') + '"><span>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD (ours)</span><code>' + esc(r.ours) + '</code></div>'
        + '<div class="side' + mark('theirs') + '"><span>&gt;&gt;&gt;&gt;&gt;&gt;&gt; incoming (theirs)</span><code>' + esc(r.theirs) + '</code></div></div>';
    },
    pick(side) {
      const g = game;
      if (g.over || g.phase !== 'choose') return;
      const r = g.rounds[g.round];
      g.picked = side;
      g.phase = 'reveal';
      if (side === r.correct) { g.score++; sfx('coin'); } else sfx('nope');
      merge.show();
      setTimeout(() => {
        if (!game || game.kind !== 'merge' || game.over) return;
        if (game.round >= 4) return finish(game.score, game.score === 5 ? 'All conflicts resolved. Ship it!' : game.score + '/5 resolved.');
        game.round++;
        game.phase = 'choose';
        game.picked = null;
        merge.show();
      }, 1300);
    },
    key(e) {
      if (e.key === 'ArrowLeft') merge.pick('ours');
      if (e.key === 'ArrowRight') merge.pick('theirs');
    },
    button(id) { if (id.startsWith('pick:')) merge.pick(id.slice(5)); },
    scene(now) {
      const g = game;
      const key = S[snap.pet.species] ? snap.pet.species : 'blip';
      const lookDir = g.picked === 'ours' ? -1 : g.picked === 'theirs' ? 1 : 0;
      drawPet(key, 12, 6, { look: lookDir, blink: Math.floor(now / 450) % 9 === 0 });
      drawAccessories(key, 12, 6, snap.equipped);
      draw(S.arrowL, 3, 11);
      draw(S.arrowR, 32, 11);
      if (g.phase === 'reveal') {
        const r = g.rounds[g.round];
        draw(g.picked === r.correct ? S.heart : S.cross, g.picked === 'ours' ? 2 : 31, 2);
      }
    },
  };

  // Held-key movement: keydown repeats while a key is held, so each press buys a short burst of motion.
  const HOLD_MS = 160;
  const dtOf = (g, now) => { const dt = Math.min(0.1, Math.max(0, (now - g.last) / 1000)); g.last = now; return dt; };

  // ----- Linked List: snake -----
  const snake = {
    start(now) {
      game = { kind: 'snake', last: now, acc: 0, dir: [1, 0], nextDir: [1, 0], body: [[10, 12], [9, 12], [8, 12]], food: [20, 12], score: 0, step: 0.14 };
      snake.placeFood();
      setGameBar('Arrow keys or WASD to steer. Nodes: 0', [['↑', 'dir:up'], ['←', 'dir:left'], ['↓', 'dir:down'], ['→', 'dir:right'], ['Quit', 'quit']]);
    },
    placeFood() {
      const g = game;
      let p;
      do { p = [1 + rnd(W - 2), 2 + rnd(H - 3)]; } while (g.body.some(b => b[0] === p[0] && b[1] === p[1]));
      g.food = p;
    },
    turn(dx, dy) {
      const g = game;
      if (!g || g.over) return;
      if (dx === -g.dir[0] && dy === -g.dir[1]) return; // no 180s into yourself
      g.nextDir = [dx, dy];
    },
    key(e) {
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      if (map[e.key]) { if (e.preventDefault) e.preventDefault(); snake.turn(...map[e.key]); }
    },
    button(id) { const m = { 'dir:up': [0, -1], 'dir:down': [0, 1], 'dir:left': [-1, 0], 'dir:right': [1, 0] }; if (m[id]) snake.turn(...m[id]); },
    tap(x, y) {
      // Tap relative to the head: the larger axis wins.
      const [hx, hy] = game.body[0];
      if (Math.abs(x - hx) > Math.abs(y - hy)) snake.turn(Math.sign(x - hx) || 1, 0); else snake.turn(0, Math.sign(y - hy) || 1);
    },
    scene(now) {
      const g = game;
      const dt = dtOf(g, now);
      if (!g.over) {
        g.acc += dt;
        while (g.acc >= g.step && !g.over) {
          g.acc -= g.step;
          g.dir = g.nextDir;
          const h = [g.body[0][0] + g.dir[0], g.body[0][1] + g.dir[1]];
          if (h[0] < 0 || h[0] >= W || h[1] < 1 || h[1] >= H || g.body.some(b => b[0] === h[0] && b[1] === h[1])) { finish(g.score, 'Segfault! Dereferenced yourself at ' + g.score + ' nodes.'); break; }
          g.body.unshift(h);
          if (h[0] === g.food[0] && h[1] === g.food[1]) {
            g.score++;
            g.step = Math.max(0.07, 0.14 - g.score * 0.0012);
            sfx('coin');
            promptText('Arrow keys or WASD to steer. Nodes: ' + g.score);
            if (g.score >= GAME_MAX.snake) { finish(g.score, 'A perfectly linked list. No leaks.'); break; }
            snake.placeFood();
          } else g.body.pop();
        }
      }
      for (let x = 0; x < W; x++) plot(x, 0);
      g.body.forEach(([x, y], i) => { if (i === 0) { inkVal = 2; plot(x, y); inkVal = 1; } else plot(x, y); });
      if (Math.floor(now / 250) % 2 === 0 || g.over) { inkVal = 2; plot(g.food[0], g.food[1]); inkVal = 1; }
    },
  };

  // ----- Pipeline: flappy -----
  const BIRD_X = 6;
  const pipeline = {
    start(now) {
      game = { kind: 'pipeline', last: now, y: 10, vy: 0, gates: [], next: 0.4, speed: 14, score: 0, t: 0, started: false, lastGap: 8 };
      setGameBar('Space or tap to flap through the gates. Gates: 0', [['Flap ⤒', 'flap'], ['Quit', 'quit']]);
    },
    flap() { const g = game; if (!g || g.over) return; g.started = true; g.vy = -18; sfx('blip'); },
    key(e) { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (e.preventDefault) e.preventDefault(); pipeline.flap(); } },
    tap() { pipeline.flap(); },
    button(id) { if (id === 'flap') pipeline.flap(); },
    scene(now) {
      const g = game;
      const dt = dtOf(g, now);
      if (!g.over && g.started) {
        g.t += dt;
        g.speed = Math.min(22, 14 + g.t * 0.3);
        g.vy += 60 * dt;
        g.y += g.vy * dt;
        g.next -= dt;
        if (g.next <= 0) {
          // The next gap is never more than 6 rows from the last, so it's always reachable.
          const gapY = Math.max(2, Math.min(H - 11, g.lastGap + (rnd(13) - 6)));
          g.lastGap = gapY;
          g.gates.push({ x: W + 1, gapY, gapH: 9, passed: false });
          g.next = 1.5;
        }
        const by = Math.round(g.y);
        for (const gate of g.gates) {
          gate.x -= g.speed * dt;
          const gx = Math.round(gate.x);
          if (gx <= BIRD_X + 5 && gx + 2 >= BIRD_X && (by < gate.gapY || by + 4 > gate.gapY + gate.gapH - 1)) { finish(g.score, 'Build failed at gate ' + (g.score + 1) + '.'); break; }
          if (!gate.passed && gate.x + 3 < BIRD_X) { gate.passed = true; g.score++; promptText('Space or tap to flap through the gates. Gates: ' + g.score); if (g.score >= GAME_MAX.pipeline) { finish(g.score, 'All green. The pipeline salutes you.'); break; } }
        }
        if (!g.over && (g.y < 0 || g.y + 5 > H)) finish(g.score, g.y < 0 ? 'Flew out of the pipeline.' : 'Crashed into the ground.');
        g.gates = g.gates.filter(o => o.x > -4);
      } else if (!g.started) g.y = 10 + Math.round(Math.sin(now / 300));
      for (const gate of g.gates) {
        const gx = Math.round(gate.x);
        for (let y = 0; y < H; y++) if (y < gate.gapY || y >= gate.gapY + gate.gapH) for (let x = gx; x < gx + 3; x++) plot(x, y);
      }
      for (let x = 0; x < W; x++) if ((x + Math.floor(g.t * g.speed)) % 3 !== 0) plot(x, H - 1);
      draw(g.vy < 0 ? S.flapB : S.flapA, BIRD_X, Math.round(g.y));
    },
  };

  // ----- Tech Debt: breakout -----
  const BRICK_COLS = 13, BRICK_ROWS = 4, PADDLE_W = 7, PADDLE_Y = 22;
  const breakout = {
    start(now) {
      const bricks = new Set();
      for (let i = 0; i < BRICK_COLS * BRICK_ROWS; i++) bricks.add(i);
      game = { kind: 'breakout', last: now, px: (W - PADDLE_W) / 2, ball: null, bricks, score: 0, lives: 3, moveDir: 0, moveUntil: 0 };
      breakout.reset();
      setGameBar('◀ ▶ to move, space or tap to launch. Blocks: 0', [['◀', 'left'], ['Launch', 'launch'], ['▶', 'right'], ['Quit', 'quit']]);
    },
    reset() { const g = game; g.ball = { x: g.px + PADDLE_W / 2, y: PADDLE_Y - 1, vx: 0, vy: 0, live: false }; },
    launch() { const g = game; if (!g || g.over || g.ball.live) return; g.ball.live = true; g.ball.vx = Math.random() < 0.5 ? -9 : 9; g.ball.vy = -13; sfx('blip'); },
    move(dir, now) { const g = game; if (!g || g.over) return; g.moveDir = dir; g.moveUntil = now + HOLD_MS; },
    key(e) {
      const now = Date.now();
      if (e.key === 'ArrowLeft' || e.key === 'a') { if (e.preventDefault) e.preventDefault(); breakout.move(-1, now); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { if (e.preventDefault) e.preventDefault(); breakout.move(1, now); }
      else if (e.key === ' ' || e.key === 'ArrowUp') { if (e.preventDefault) e.preventDefault(); breakout.launch(); }
    },
    button(id) { if (id === 'left') breakout.move(-1, Date.now() + 100); else if (id === 'right') breakout.move(1, Date.now() + 100); else if (id === 'launch') breakout.launch(); },
    tap(x) { const g = game; if (!g.ball.live) breakout.launch(); breakout.move(x < g.px + PADDLE_W / 2 ? -1 : 1, Date.now() + 120); },
    scene(now) {
      const g = game;
      const dt = dtOf(g, now);
      if (!g.over) {
        if (now < g.moveUntil) g.px = Math.max(0, Math.min(W - PADDLE_W, g.px + g.moveDir * 32 * dt));
        const b = g.ball;
        if (!b.live) b.x = g.px + PADDLE_W / 2;
        else {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
          if (b.x >= W) { b.x = W - 0.01; b.vx = -Math.abs(b.vx); }
          if (b.y < 1) { b.y = 1; b.vy = Math.abs(b.vy); }
          // Paddle: angle depends on where it hits.
          if (b.vy > 0 && b.y >= PADDLE_Y - 0.5 && b.y < PADDLE_Y + 0.5 && b.x >= g.px - 0.5 && b.x <= g.px + PADDLE_W + 0.5) {
            b.vy = -Math.abs(b.vy);
            b.vx = Math.max(-16, Math.min(16, b.vx + (b.x - (g.px + PADDLE_W / 2)) * 3));
            sfx('blip');
          }
          // Bricks live in rows 2–5, three cells wide.
          const row = Math.floor(b.y) - 2;
          if (row >= 0 && row < BRICK_ROWS) {
            const idx = row * BRICK_COLS + Math.min(BRICK_COLS - 1, Math.floor(b.x / 3));
            if (g.bricks.has(idx)) {
              g.bricks.delete(idx); g.score++; b.vy = -b.vy; sfx('coin');
              promptText('◀ ▶ to move. Blocks: ' + g.score);
              if (g.score >= GAME_MAX.breakout) finish(g.score, 'Zero tech debt. Frame it.');
            }
          }
          if (b.y >= H) {
            g.lives--;
            if (g.lives <= 0) finish(g.score, 'Out of balls. Paid down ' + g.score + ' blocks.');
            else { breakout.reset(); sfx('nope'); promptText('Ball lost. ' + g.lives + ' left. Blocks: ' + g.score); }
          }
        }
      }
      for (let i = 0; i < g.lives; i++) plot(1 + i * 2, 0);
      for (const idx of g.bricks) {
        const r = Math.floor(idx / BRICK_COLS), c = idx % BRICK_COLS;
        for (let x = c * 3; x < c * 3 + 2 + (r % 2); x++) plot(x, 2 + r);
      }
      for (let x = Math.round(g.px); x < Math.round(g.px) + PADDLE_W; x++) plot(x, PADDLE_Y);
      inkVal = 2; plot(Math.floor(g.ball.x), Math.floor(g.ball.y)); inkVal = 1;
    },
  };

  // ----- Packet Pong: vs your pet -----
  const PAD_H = 5;
  const pong = {
    start(now) {
      game = { kind: 'pong', last: now, py: 9.5, ay: 9.5, ball: { x: W / 2, y: H / 2, vx: -12, vy: 5 }, score: 0, moveDir: 0, moveUntil: 0, serveAt: now + 600 };
      setGameBar('↑ ↓ to move, or tap the top or bottom half. Returns: 0', [['▲', 'up'], ['▼', 'down'], ['Quit', 'quit']]);
    },
    move(dir, now) { const g = game; if (!g || g.over) return; g.moveDir = dir; g.moveUntil = now + HOLD_MS; },
    key(e) {
      const now = Date.now();
      if (e.key === 'ArrowUp' || e.key === 'w') { if (e.preventDefault) e.preventDefault(); pong.move(-1, now); }
      else if (e.key === 'ArrowDown' || e.key === 's') { if (e.preventDefault) e.preventDefault(); pong.move(1, now); }
    },
    button(id) { if (id === 'up') pong.move(-1, Date.now() + 100); else if (id === 'down') pong.move(1, Date.now() + 100); },
    tap(x, y) { pong.move(y < H / 2 ? -1 : 1, Date.now() + 120); },
    serve(now, toward) { const g = game; g.ball = { x: W / 2, y: 2 + rnd(H - 4), vx: toward * 12, vy: (rnd(2) ? 1 : -1) * (4 + rnd(4)) }; g.serveAt = now + 500; },
    scene(now) {
      const g = game;
      const dt = dtOf(g, now);
      const b = g.ball;
      if (!g.over) {
        if (now < g.moveUntil) g.py = Math.max(1, Math.min(H - PAD_H, g.py + g.moveDir * 28 * dt));
        // The pet tracks the ball once it's coming its way, a touch slower as rallies get long.
        const want = b.y - PAD_H / 2 + 0.5;
        const aiSpeed = b.vx > 0 ? 14 + Math.min(16, g.score * 0.6) : 6;
        g.ay += Math.max(-aiSpeed * dt, Math.min(aiSpeed * dt, want - g.ay));
        g.ay = Math.max(1, Math.min(H - PAD_H, g.ay));
        if (now >= g.serveAt) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.y < 1) { b.y = 1; b.vy = Math.abs(b.vy); }
          if (b.y >= H - 1) { b.y = H - 1.01; b.vy = -Math.abs(b.vy); }
          if (b.vx < 0 && b.x <= 2 && b.x > 0.5 && b.y >= g.py - 0.5 && b.y < g.py + PAD_H + 0.5) {
            b.vx = Math.min(30, Math.abs(b.vx) * 1.05);
            b.vy = Math.max(-18, Math.min(18, b.vy + (b.y - (g.py + PAD_H / 2)) * 3));
            g.score++; sfx('coin');
            promptText('↑ ↓ to move. Returns: ' + g.score);
            if (g.score >= GAME_MAX.pong) finish(g.score, 'Rally of legends. ' + snap.pet.name + ' needs a lie down.');
          }
          if (b.vx > 0 && b.x >= W - 3 && b.x < W - 1.5 && b.y >= g.ay - 0.5 && b.y < g.ay + PAD_H + 0.5) {
            b.vx = -Math.abs(b.vx);
            b.vy = Math.max(-18, Math.min(18, b.vy + (b.y - (g.ay + PAD_H / 2)) * 2));
            sfx('blip');
          }
          if (b.x < 0) finish(g.score, 'Packet lost after ' + g.score + ' returns.');
          else if (b.x >= W) { g.score += 2; sfx('coin'); promptText('Ace! Returns: ' + g.score); pong.serve(now, -1); }
        }
      }
      for (let y = 1; y < H; y += 2) plotE(W / 2, y, 3);
      for (let y = 0; y < PAD_H; y++) { plot(1, Math.round(g.py) + y); plot(W - 2, Math.round(g.ay) + y); }
      inkVal = 2; plot(Math.floor(b.x), Math.floor(b.y)); inkVal = 1;
    },
  };

  // ----- Git Bisect: binary search -----
  const BISECT_SIZES = [16, 32, 64, 128, 256];
  const bisect = {
    start() {
      game = { kind: 'bisect', round: 0, rounds: BISECT_SIZES.map(n => ({ n, bad: 2 + rnd(n - 1), budget: Math.ceil(Math.log2(n)) + 1 })), lo: 1, hi: 16, tests: 0, score: 0, phase: 'pick', pick: 8, last: '' };
      setGameBar('', [['Quit', 'quit']]);
      bisect.begin();
    },
    begin() {
      const g = game, r = g.rounds[g.round];
      g.lo = 1; g.hi = r.n; g.tests = 0; g.phase = 'pick'; g.last = '';
      g.pick = Math.floor((g.lo + g.hi) / 2);
      bisect.show();
    },
    show() {
      const g = game, r = g.rounds[g.round];
      const left = r.budget - g.tests;
      $('game-prompt').innerHTML = '<div class="bisect"><div class="ctx">Round ' + (g.round + 1) + '/5 · commits 1–' + r.n + ' · <b>1</b> is good, <b>' + r.n + '</b> is bad · find the first bad one</div>'
        + '<div class="range">Known good: <b>' + g.lo + '</b> · known bad: <b>' + g.hi + '</b> · tests left in budget: <b class="' + (left <= 1 ? 'warn' : '') + '">' + Math.max(0, left) + '</b></div>'
        + (g.last ? '<div class="last">' + esc(g.last) + '</div>' : '') + '</div>';
      $('game-controls').innerHTML = '<label class="bisect-pick">Test commit <b id="bisect-val">' + g.pick + '</b></label>'
        + '<input type="range" id="bisect-range" min="' + (g.lo + 1) + '" max="' + (g.hi - 1) + '" value="' + g.pick + '" step="1" aria-label="Commit to test">'
        + '<button class="primary" data-gamebtn="test">git bisect run</button><button data-gamebtn="quit">Quit</button>';
    },
    setPick(v) { const g = game; if (!g || g.over) return; g.pick = Math.max(g.lo + 1, Math.min(g.hi - 1, Math.floor(Number(v) || g.pick))); const el = document.getElementById('bisect-val'); if (el) el.textContent = String(g.pick); },
    test() {
      const g = game;
      if (!g || g.over || g.phase !== 'pick') return;
      const r = g.rounds[g.round];
      const c = g.pick;
      if (c <= g.lo || c >= g.hi) return;
      g.tests++;
      if (c >= r.bad) { g.hi = c; g.last = 'Commit ' + c + ': BAD ✗'; sfx('nope'); } else { g.lo = c; g.last = 'Commit ' + c + ': good ✓'; sfx('blip'); }
      if (g.hi - g.lo === 1) {
        const within = g.tests <= r.budget;
        if (within) g.score++;
        g.phase = 'done';
        g.last = 'First bad commit: ' + g.hi + '. ' + g.tests + ' test' + (g.tests === 1 ? '' : 's') + (within ? ' - within budget!' : ' - over budget (' + r.budget + ').');
        bisect.show();
        sfx(within ? 'coin' : 'sad');
        setTimeout(() => {
          if (!game || game.kind !== 'bisect' || game.over) return;
          if (game.round >= 4) return finish(game.score, game.score === 5 ? 'Every bad commit found in budget. Textbook.' : game.score + '/5 found within budget.');
          game.round++;
          bisect.begin();
        }, 1400);
        return;
      }
      g.pick = Math.floor((g.lo + g.hi) / 2);
      bisect.show();
    },
    key(e) {
      if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); bisect.test(); }
      if (e.key === 'ArrowLeft') bisect.setPick(game.pick - 1);
      if (e.key === 'ArrowRight') bisect.setPick(game.pick + 1);
    },
    button(id) { if (id === 'test') bisect.test(); },
    scene(now) {
      const g = game, r = g.rounds[g.round];
      const key = S[snap.pet.species] ? snap.pet.species : 'blip';
      drawPet(key, 1, 6, { look: 1, blink: Math.floor(now / 450) % 9 === 0 });
      drawAccessories(key, 1, 6, snap.equipped);
      if (g.phase === 'pick' && Math.floor(now / 500) % 2) draw(S.question, 17, 2);
      // The commit range as a bar: dim where it's settled, bright where the bug still hides, a marker on your pick.
      const x0 = 19, x1 = W - 2;
      const xOf = c => x0 + Math.round(((c - 1) / (r.n - 1)) * (x1 - x0));
      for (let x = x0; x <= x1; x++) { const c = 1 + Math.round(((x - x0) / (x1 - x0)) * (r.n - 1)); if (c > g.lo && c < g.hi) plot(x, 12); else plotE(x, 12, 3); }
      plot(xOf(g.lo), 11); plot(xOf(g.lo), 13);
      inkVal = 2; plot(xOf(g.hi), 11); plot(xOf(g.hi), 12); plot(xOf(g.hi), 13); inkVal = 1;
      const px = xOf(g.pick);
      draw(S.arrowD, px - 2, 6);
      for (let i = 0; i < g.round + 1; i++) plot(x0 + i * 2, 20);
      for (let i = 0; i < g.score; i++) { inkVal = 2; plot(x0 + i * 2, 20); inkVal = 1; }
    },
  };

  // ----- Regex Racer -----
  // [pattern, flags, the one match, three non-matches]. A test checks each with the real RegExp engine.
  const REGEXES = [
    ['^\\d{3}-\\d{4}$', '', '555-0199', ['5550199', '55-01999', 'abc-defg']],
    ['colou?r', '', 'color', ['colr', 'coluor', 'collar']],
    ['^[A-Z][a-z]+$', '', 'Hello', ['hello', 'HELLO', 'Hello1']],
    ['\\bcat\\b', '', 'a cat sat', ['concatenate', 'cats', 'category']],
    ['^\\s*$', '', '   ', [' . ', '_', '0']],
    ['^(?:\\d{1,3}\\.){3}\\d{1,3}$', '', '192.168.0.1', ['192.168.1', '1.2.3.4.5', '192.168.0.x']],
    ['^#[0-9a-f]{6}$', 'i', '#FFaa00', ['#FFaa0', 'FFaa00', '#GGaa00']],
    ['^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', '', 'dev@example.com', ['dev@example', 'dev example.com', '@example.com']],
    ['^\\w+$', '', 'snake_case', ['kebab-case', 'has space', 'dots.too']],
    ['^(a|b)+$', '', 'abba', ['abc', 'cab', 'aba1']],
    ['^0x[0-9A-F]+$', '', '0x1F', ['0x1f', '1F', '0x']],
    ['^-?\\d+(\\.\\d+)?$', '', '-3.14', ['3.', '.5', '1,000']],
    ['^\\/[a-z]+\\/[a-z]+$', '', '/api/users', ['/api/users/', 'api/users', '/API/users']],
    ['TODO|FIXME', '', '// FIXME later', ['// todo later', '// fix me', '// done']],
    ['^.{8,}$', '', 'password1', ['pass123', 'short', '1234567']],
    ['\\d+px$', '', 'width: 12px', ['12 px', 'px12', '12em']],
    ['^v\\d+\\.\\d+\\.\\d+$', '', 'v1.2.3', ['1.2.3', 'v1.2', 'v1.2.3-beta']],
    ['^[a-z]+(-[a-z]+)*$', '', 'my-branch-name', ['my--branch', '-leading', 'Upper-case']],
    ['^(?!.*password).*$', 'i', 'secret token', ['my Password', 'password123', 'PASSWORD']],
    ['^\\[.*\\]$', '', '[1, 2, 3]', ['{1, 2}', '[1, 2', '(1, 2]']],
    ['^[01]+$', '', '101010', ['10 10', '102', '0b101']],
    ['^\\d{2}:\\d{2}$', '', '09:45', ['9:45', '09-45', '0945']],
    ['^(GET|POST) \\/\\S*$', '', 'GET /users', ['PUT /users', 'GET users', 'GET /users and more']],
    ['^main|master$', '', 'mainframe', ['MAIN', 'masters', 'dev']],
  ];
  const regex = {
    start(now) {
      const pool = REGEXES.slice();
      const rounds = [];
      while (rounds.length < 8) {
        const [pat, flags, match, nons] = pool.splice(rnd(pool.length), 1)[0];
        const options = [match, ...nons];
        for (let i = options.length - 1; i > 0; i--) { const j = rnd(i + 1); [options[i], options[j]] = [options[j], options[i]]; }
        rounds.push({ pat, flags, answer: options.indexOf(match), options });
      }
      game = { kind: 'regex', start: now, endsAt: now + 60000, rounds, round: 0, score: 0, phase: 'choose', picked: -1 };
      setGameBar('', []);
      regex.show();
    },
    show() {
      const g = game, r = g.rounds[g.round];
      const mark = i => (g.phase === 'reveal' ? (i === r.answer ? ' good' : i === g.picked ? ' bad' : '') : '');
      $('game-prompt').innerHTML = '<div class="quiz"><div class="ctx">Round ' + (g.round + 1) + '/8 · which string matches? · <span id="regex-left">' + Math.ceil((g.endsAt - Date.now()) / 1000) + 's</span></div>'
        + '<code class="token">/' + esc(r.pat) + '/' + esc(r.flags) + '</code></div>';
      $('game-controls').innerHTML = r.options.map((o, i) => '<button class="opt' + mark(i) + '" data-gamebtn="opt:' + i + '"><kbd>' + (i + 1) + '</kbd> <code>' + esc(o) + '</code></button>').join('') + '<button data-gamebtn="quit">Quit</button>';
    },
    pick(i) {
      const g = game;
      if (!g || g.over || g.phase !== 'choose') return;
      const r = g.rounds[g.round];
      if (!(i >= 0 && i < r.options.length)) return;
      g.picked = i; g.phase = 'reveal';
      if (i === r.answer) { g.score++; sfx('coin'); } else sfx('nope');
      regex.show();
      setTimeout(() => {
        if (!game || game.kind !== 'regex' || game.over) return;
        if (game.round >= 7) return finish(game.score, game.score === 8 ? 'Perfect match, every time.' : game.score + '/8 matched.');
        game.round++; game.phase = 'choose'; game.picked = -1;
        regex.show();
      }, 900);
    },
    key(e) { if (/^[1-4]$/.test(e.key)) regex.pick(Number(e.key) - 1); },
    button(id) { if (id.startsWith('opt:')) regex.pick(Number(id.slice(4))); },
    scene(now) {
      const g = game;
      if (!g.over && now >= g.endsAt) finish(g.score, 'Time! ' + g.score + '/8 matched.');
      const left = document.getElementById('regex-left');
      if (left) left.textContent = Math.max(0, Math.ceil((g.endsAt - now) / 1000)) + 's';
      for (let x = 0; x < Math.round(W * Math.max(0, (g.endsAt - now) / 60000)); x++) plot(x, 0);
      const key = S[snap.pet.species] ? snap.pet.species : 'blip';
      drawPet(key, 12, 6, { look: g.phase === 'reveal' ? 0 : (Math.floor(now / 600) % 2 ? 1 : -1), blink: Math.floor(now / 450) % 9 === 0 });
      drawAccessories(key, 12, 6, snap.equipped);
      if (g.phase === 'reveal') draw(g.picked === g.rounds[g.round].answer ? S.heart : S.cross, 31, 2);
      else if (Math.floor(now / 500) % 2) draw(S.question, 30, 3);
    },
  };

  // ----- Big-O -----
  const BIGO_OPTS = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2ⁿ)'];
  const SNIPPETS = [
    [['return arr[0];'], 'O(1)'],
    [['let sum = 0;', 'for (const x of arr) sum += x;'], 'O(n)'],
    [['for (const a of arr)', '  for (const b of arr)', '    if (a + b === k) hits++;'], 'O(n²)'],
    [['while (lo <= hi) {', '  mid = (lo + hi) >> 1;', '  if (arr[mid] < k) lo = mid + 1; else hi = mid - 1;', '}'], 'O(log n)'],
    [['arr.sort((a, b) => a - b);'], 'O(n log n)'],
    [['return map.get(key);'], 'O(1)'],
    [['for (const x of arr)', '  for (let j = 0; j < 10; j++) work(x, j);'], 'O(n)'],
    [['function fib(n) {', '  return n < 2 ? n : fib(n - 1) + fib(n - 2);', '}'], 'O(2ⁿ)'],
    [['for (let i = 1; i < n; i *= 2) step(i);'], 'O(log n)'],
    [['for (const x of arr)', '  if (arr.indexOf(x) !== arr.lastIndexOf(x)) dupes++;'], 'O(n²)'],
    [['mergeSort(arr);  // split, recurse, merge'], 'O(n log n)'],
    [['arr.push(x);'], 'O(1)'],
    [['for (const x of arr) binarySearch(sorted, x);'], 'O(n log n)'],
    [['const seen = new Set(arr);', 'for (const x of other) if (seen.has(x)) both++;'], 'O(n)'],
    [['for (let i = 0; i < n; i++)', '  for (let j = 0; j < i; j++) pairs++;'], 'O(n²)'],
    [['return Math.max(...arr);'], 'O(n)'],
    [['while (n > 1) n = Math.floor(n / 2);'], 'O(log n)'],
    [['for (a of arr) for (b of arr) for (c of arr)', '  if (a + b + c === 0) triples++;'], 'O(n³)'],
    [['const first = arr[0], last = arr[arr.length - 1];', 'return first === last;'], 'O(1)'],
    [['for (const row of grid)      // n rows', '  for (const cell of row)    // n cells', '    paint(cell);'], 'O(n²)'],
  ];
  const bigo = {
    start() {
      const pool = SNIPPETS.slice();
      const rounds = [];
      while (rounds.length < 6) {
        const [lines, answer] = pool.splice(rnd(pool.length), 1)[0];
        const others = BIGO_OPTS.filter(o => o !== answer);
        for (let i = others.length - 1; i > 0; i--) { const j = rnd(i + 1); [others[i], others[j]] = [others[j], others[i]]; }
        const options = [answer, ...others.slice(0, 3)].sort((a, b) => BIGO_OPTS.indexOf(a) - BIGO_OPTS.indexOf(b));
        rounds.push({ lines, answer: options.indexOf(answer), options });
      }
      game = { kind: 'bigo', rounds, round: 0, score: 0, phase: 'choose', picked: -1 };
      setGameBar('', []);
      bigo.show();
    },
    show() {
      const g = game, r = g.rounds[g.round];
      const mark = i => (g.phase === 'reveal' ? (i === r.answer ? ' good' : i === g.picked ? ' bad' : '') : '');
      $('game-prompt').innerHTML = '<div class="quiz"><div class="ctx">Round ' + (g.round + 1) + '/6 · time complexity in n?</div><pre class="snippet"><code>' + r.lines.map(esc).join('\n') + '</code></pre></div>';
      $('game-controls').innerHTML = r.options.map((o, i) => '<button class="opt' + mark(i) + '" data-gamebtn="opt:' + i + '"><kbd>' + (i + 1) + '</kbd> ' + esc(o) + '</button>').join('') + '<button data-gamebtn="quit">Quit</button>';
    },
    pick(i) {
      const g = game;
      if (!g || g.over || g.phase !== 'choose') return;
      const r = g.rounds[g.round];
      if (!(i >= 0 && i < r.options.length)) return;
      g.picked = i; g.phase = 'reveal';
      if (i === r.answer) { g.score++; sfx('coin'); } else sfx('nope');
      bigo.show();
      setTimeout(() => {
        if (!game || game.kind !== 'bigo' || game.over) return;
        if (game.round >= 5) return finish(game.score, game.score === 6 ? 'Asymptotically perfect.' : game.score + '/6 called correctly.');
        game.round++; game.phase = 'choose'; game.picked = -1;
        bigo.show();
      }, 1000);
    },
    key(e) { if (/^[1-4]$/.test(e.key)) bigo.pick(Number(e.key) - 1); },
    button(id) { if (id.startsWith('opt:')) bigo.pick(Number(id.slice(4))); },
    scene(now) {
      const g = game;
      const key = S[snap.pet.species] ? snap.pet.species : 'blip';
      drawPet(key, 3, 6, { look: 1, blink: Math.floor(now / 450) % 9 === 0 });
      drawAccessories(key, 3, 6, snap.equipped);
      // A little growth curve on the right that steepens with each round.
      const steep = 0.4 + g.round * 0.3;
      for (let x = 0; x < 17; x++) { const y = Math.round(21 - Math.pow(x / 16, 1 / steep) * 16); plot(21 + x, y); }
      plot(21, 21); for (let x = 21; x < 38; x++) plotE(x, 22, 3); for (let y = 5; y < 22; y++) plotE(21, y, 3);
      if (g.phase === 'reveal') draw(g.picked === g.rounds[g.round].answer ? S.heart : S.cross, 32, 1);
    },
  };

  const ARCADE = { dash, stack, simon, hotkeys, merge, snake, pipeline, breakout, pong, bisect, regex, bigo };
  // @ts-ignore  Test-only hook (the tests' sandbox defines it; VS Code never does).
  if (window.__idlepalTest) window.__idlepalTest.game = () => game;

  document.addEventListener('input', e => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t) return;
    if (t.id === 'haggle-range') { const v = document.getElementById('haggle-val'); if (v) v.textContent = t.value; return; }
    if (t.id === 'bisect-range') { if (game && game.kind === 'bisect') bisect.setPick(t.value); return; }
    if (t.id === 'duck-text') { duckTyped(t.value); return; }
    if (t.id === 'hk-input' && hotkeys.typed(t.value)) t.value = '';
  });

  // =====================================================================
  // Share card (1200x630, the standard social-preview size)
  // =====================================================================
  function shareCard() {
    if (!snap) return;
    const p = snap.pet, v = snap.view;
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const shell = getComputedStyle($('device'));
    const a = shell.getPropertyValue('--shell-a').trim() || '#f7a6c4';
    const b = shell.getPropertyValue('--shell-b').trim() || '#e0679a';
    const ink = shell.getPropertyValue('--shell-ink').trim() || '#7a1f47';
    const bg = x.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, a); bg.addColorStop(1, b);
    x.fillStyle = bg; x.fillRect(0, 0, 1200, 630);

    // Screen with the current scene.
    x.fillStyle = '#54525e';
    roundRect(x, 50, 107, 660, 416, 24); x.fill();
    const lcd = document.createElement('canvas');
    lcd.width = W * 16; lcd.height = H * 16;
    scene(Date.now());
    flush(/** @type {CanvasRenderingContext2D} */ (lcd.getContext('2d')), 16, screenPalette());
    x.drawImage(lcd, 60, 123);

    x.fillStyle = ink;
    x.font = 'bold 64px system-ui, sans-serif';
    x.fillText(p.name.slice(0, 14), 750, 190);
    x.font = '32px system-ui, sans-serif';
    /** @type {Array<[string|null, string]>} [icon, text] */
    const lines = p.dead
      ? [[null, `${v.speciesName} · gen ${p.generation}`], [null, `Lived ${v.ageText}`], ['grave', 'Forever in our hearts']]
      : [[null, `${v.speciesName} · ${v.stageLabel}`], [null, `Age ${v.ageText} · gen ${p.generation}`], ['flame', `${snap.streak.current}-day streak`],
        ['trophy', `${Object.keys(snap.achievements).length} achievements`], ['keyboard', `${v.codingTotal} coded together`]];
    lines.forEach(([icon, text], i) => {
      const y = 250 + i * 52;
      if (icon) { PX.drawPxIcon(x, icon, 750, y - 29, 4); x.fillText(text, 796, y); }
      else x.fillText(text, 750, y);
    });
    x.font = '24px system-ui, sans-serif';
    x.globalAlpha = 0.8;
    x.fillText('Raised in VS Code · IdlePal', 750, 560);
    x.globalAlpha = 1;

    const caption = p.dead
      ? `RIP ${p.name} the ${v.speciesName}, who lived ${v.ageText} in my VS Code. 🪦`
      : `Meet ${p.name}, my ${v.speciesName} (${v.stageLabel.toLowerCase()}, ${v.ageText} old), raised in VS Code with IdlePal. ${snap.streak.current}-day streak 🔥`;
    vscode.postMessage({ type: 'shareImage', dataUrl: c.toDataURL('image/png'), caption });
  }

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
  }

  // =====================================================================
  // Sound (off by default; idlepal.sound)
  // =====================================================================
  /** @type {AudioContext | null} */ let audio = null;
  const TUNES = {
    blip: [[880, 0.05]], happy: [[660, 0.07], [990, 0.09]], coin: [[988, 0.06], [1319, 0.12]],
    sad: [[440, 0.12], [330, 0.2]], alert: [[880, 0.08], [0, 0.05], [880, 0.08]], nope: [[220, 0.1]],
    fanfare: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]],
  };
  function sfx(name) {
    if (!settings.sound || !TUNES[name]) return;
    try {
      // @ts-ignore
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      let t = audio.currentTime;
      for (const [f, d] of TUNES[name]) {
        if (f) {
          const o = audio.createOscillator(), g = audio.createGain();
          o.type = 'square'; o.frequency.value = f;
          g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d);
        }
        t += d;
      }
    } catch { /* audio unavailable */ }
  }

  // =====================================================================
  // Speech bubble and idle chatter
  // =====================================================================
  let bubbleTimer = 0;
  function say(text) {
    const b = $('bubble');
    b.innerHTML = PX.richText(text);
    b.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove('show'), 4000);
  }

  const QUIPS = {
    any: ['Did you remember to commit?', 'Tabs or spaces? …Spaces.', 'I believe in you!', 'It works on my machine.', 'Hydrate!',
      'Have you tried turning it off and on again?', 'Ship small, ship often.', 'That variable name is… bold.', 'Rubber duck mode: explain it to me.',
      'Remember to stretch!', 'git blame says it was you. Probably.', 'One more test can\'t hurt.'],
    night: ['It\'s late… bedtime soon?', 'The bugs come out at night 🌙', 'Coffee? Or sleep? Sleep.'],
    worried: ['So many red squiggles…', 'We can fix these together!', 'Errors are just surprises.'],
    hungry: ['My tummy is rumbling…', 'Is it lunchtime? 🍙'],
  };
  setInterval(() => {
    if (!snap || document.hidden || game) return;
    const p = snap.pet, v = snap.view;
    if (p.dead || p.asleep || snap.paused || snap.expedition || v.stage === 'egg' || v.focus || ui.drawer === 'duck' || Math.random() > 0.3) return;
    const h = new Date().getHours();
    const pool = v.mood === 'worried' ? QUIPS.worried : v.alerts.includes('hungry') ? QUIPS.hungry : (h >= 23 || h < 5) && Math.random() < 0.5 ? QUIPS.night : QUIPS.any;
    say(pool[Math.floor(Math.random() * pool.length)]);
  }, 60000);

  // =====================================================================
  // Events
  // =====================================================================
  function setTab(tab, focus) {
    if (!TABS.includes(tab)) return;
    if (tab === 'shop' && ui.tab !== 'shop' && snap) keeperSay('welcome');
    ui.tab = tab;
    persist();
    renderAll();
    if (focus) $('tabbtn-' + tab).focus();
  }

  document.addEventListener('click', e => {
    const el = /** @type {HTMLElement} */ (e.target);
    // External links go through the host, which only opens URLs it knows by name.
    const link = /** @type {HTMLElement|null} */ (el.closest && el.closest('[data-link]'));
    if (link && link.dataset && link.dataset.link) { if (e.preventDefault) e.preventDefault(); vscode.postMessage({ type: 'openLink', id: link.dataset.link }); return; }
    const t = /** @type {HTMLElement|null} */ (el.closest('button, [data-tab]'));
    if (!t || /** @type {HTMLButtonElement} */ (t).disabled) return;
    if (audio && audio.state === 'suspended') audio.resume();
    const d = t.dataset;
    if (d.tab) return setTab(d.tab);
    if (d.goto) return setTab(d.goto);
    if (d.drawer) {
      ui.drawer = ui.drawer === d.drawer ? null : d.drawer;
      renderPet();
      const open = ui.drawer && document.getElementById('drawer-' + ui.drawer);
      if (open && open.scrollIntoView) open.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (d.action) return send(d.action);
    if (d.act) { if (d.act === 'sell') ui.confirmSell = null; return send(d.act, d.arg); }
    if (d.cmd) return command(d.cmd);
    if (d.game) return startGame(d.game);
    if (d.share !== undefined) return shareCard();
    if (d.close !== undefined) return hideRecap();
    if (d.foodcat) { ui.foodCat = d.foodcat; return renderFeedDrawer(); }
    if (d.shopcat) { ui.shopCat = d.shopcat; ui.haggle = null; ui.confirmSell = null; persist(); return renderShop(); }
    if (d.haggle) { ui.haggle = ui.haggle === d.haggle ? null : d.haggle; return renderShop(); }
    if (d.haggleCancel !== undefined) { ui.haggle = null; return renderShop(); }
    if (d.haggleOffer) {
      const r = /** @type {HTMLInputElement|null} */ (document.getElementById('haggle-range'));
      const offer = r ? Number(r.value) : 0;
      ui.haggle = null;
      return send('haggle', { id: d.haggleOffer, offer });
    }
    if (d.sell) { ui.confirmSell = d.sell; return renderShop(); }
    if (d.sellCancel !== undefined) { ui.confirmSell = null; return renderShop(); }
    if (d.revealClose !== undefined) { ui.reveal = null; return renderShop(); }
    if (d.redeem !== undefined) return submitPromo();
    if (d.reroll !== undefined) return send('useItem', { item: 'questReroll', index: Number(d.reroll) });
    if (d.use) return send('useItem', { item: d.use });
    if (d.duckDone !== undefined) return send('duck', { chars: duckText.length });
    if (d.duckClear !== undefined) { duckText = ''; return renderDuckDrawer(); }
    if (d.gamebtn) {
      if (d.gamebtn === 'quit') return endGame(null);
      if (game && ARCADE[game.kind] && ARCADE[game.kind].button) return ARCADE[game.kind].button(d.gamebtn);
      if (d.gamebtn.startsWith('guess:')) return guess(Number(d.gamebtn.slice(6)));
    }
  });

  $('hw-lights').addEventListener('click', () => send('lights'));
  $('hw-name').addEventListener('click', () => command('rename'));
  $('hw-shell').addEventListener('click', () => {
    ui.shell = SHELLS[(SHELLS.indexOf(ui.shell) + 1) % SHELLS.length];
    persist();
    $('device').dataset.shell = ui.shell;
  });
  $('btn-vacation').addEventListener('click', () => send('pause'));
  $('btn-settings').addEventListener('click', () => command('openSettings'));

  document.addEventListener('pointerover', e => { const col = /** @type {HTMLElement} */ (e.target).closest && /** @type {HTMLElement} */ (e.target).closest('.chart .col'); if (col) showTip(col); });
  document.addEventListener('pointerout', e => { if (/** @type {HTMLElement} */ (e.target).closest && /** @type {HTMLElement} */ (e.target).closest('.chart .col')) hideTip(); });
  document.addEventListener('focusin', e => { const col = /** @type {HTMLElement} */ (e.target).closest('.chart .col'); if (col) showTip(col); else hideTip(); });

  document.addEventListener('keydown', e => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target && target.getAttribute && target.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const i = TABS.indexOf(ui.tab);
      setTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && !$('recap').hidden) { hideRecap(); return; }
    if (e.key === 'Enter' && target && target.id === 'promo-input') { submitPromo(); return; }
    if (target && target.id === 'duck-text' && e.key !== 'Escape') return;
    if (!game) return;
    if (ARCADE[game.kind]) {
      if (e.key === 'Escape') return endGame(null);
      const impl = ARCADE[game.kind];
      // Sliders take arrow keys themselves; Enter still runs the bisect test.
      const onInput = target && target.tagName === 'INPUT';
      if (impl.key && (!onInput || (game.kind === 'bisect' && e.key === 'Enter'))) impl.key(e);
      return;
    }
    if (game.kind === 'leftright') {
      if (e.key === 'ArrowLeft') guess(-1);
      if (e.key === 'ArrowRight') guess(1);
    } else if (/^[1-9]$/.test(e.key)) {
      // Numpad layout: 7 8 9 on top.
      const k = Number(e.key);
      squash((2 - Math.floor((k - 1) / 3)) * 3 + ((k - 1) % 3));
    }
    if (e.key === 'Escape') endGame(null);
  });

  function submitPromo() {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('promo-input'));
    const code = input ? String(input.value || '').trim() : '';
    if (!code) return;
    vscode.postMessage({ type: 'redeem', code });
    if (input) input.value = '';
  }

  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'init':
        catalog = m.catalog;
        settings = { ...settings, ...(m.settings || {}) };
        renderAll();
        return;
      case 'state': {
        const prev = snap;
        snap = m.state;
        if (game && (snap.pet.dead || snap.pet.asleep || snap.paused || snap.expedition)) endGame(null);
        if (prev && prev.pet.id !== snap.pet.id) duckText = '';
        if (m.anim) {
          const [kind, sprite] = String(m.anim).split(':');
          const now = Date.now();
          anim = { kind, sprite, start: now, until: now + (kind === 'eat' ? 2500 : 2000) };
        }
        if (prev && prev.pet.id === snap.pet.id && prev.pet.species !== snap.pet.species) {
          const now = Date.now();
          anim = { kind: 'sparkle', start: now, until: now + 2500 };
        }
        if (m.reveal) { ui.reveal = m.reveal; ui.shopCat = 'featured'; }
        if (m.shopkeeper) keeperSay(m.shopkeeper);
        if (m.message) say(m.message);
        if (m.sound) sfx(m.sound);
        renderAll();
        return;
      }
      case 'say': say(m.text); return;
      case 'tab':
        setTab(m.tab);
        if (m.scrollTo) { const t = document.getElementById(m.scrollTo); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      case 'recap': showRecap(); return;
      case 'openGames': setTab('pet'); ui.drawer = 'games'; renderPet(); return;
      case 'openDuck': {
        setTab('pet'); ui.drawer = 'duck'; renderPet();
        const ta = document.getElementById('duck-text');
        if (ta && ta.focus) ta.focus();
        return;
      }
      case 'share': shareCard(); return;
    }
  });

  // Shadow under the sticky header once the pane has scrolled.
  const head = document.getElementById('sticky-head');
  const onScroll = () => { if (head) head.classList.toggle('scrolled', (window.scrollY || 0) > 2); };
  window.addEventListener('scroll', onScroll, { passive: true });

  setInterval(render, 100);
  setInterval(() => {
    const el = document.getElementById('focus-left');
    if (el && snap && snap.view.focus) el.textContent = focusLeft(snap.view.focus);
  }, 1000);
  render();
  vscode.postMessage({ type: 'ready' });
})();
