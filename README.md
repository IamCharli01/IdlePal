# IdlePal: Virtual Pet for Coders

A pixel-art virtual pet that lives in VS Code and **grows with your coding**. Feed it, play with it, send it on expeditions, decorate its room, and explain your bugs to it. Commits, green builds and daily streaks earn coins. How well you care for it, and how you code, decides what it evolves into.

## Why you'll love it

- 🥚 **Raise a pet.** Egg → baby → child → teen → adult. It only ages while VS Code is open.
- 🧬 **Branching evolution.** 13 species. Great care gives a Starlet or a Mochimon; code a lot and you get an Octocoder; code in three languages and you get a Dataray; code at night, a Nocturne; raise a third generation near-perfectly, a Phoenix. Neglect it and… Gremlin.
- 🎮 **14 mini-games.** Arcade: *Bug Squash*, *Deploy Dash*, *Stack Overflow*, *Linked List* (snake), *Pipeline* (flappy CI), *Tech Debt* (breakout), *Packet Pong* (vs your pet). Brain: *Left or Right*, *Rubber Duck Says*, *Hot Keys*, *Merge Conflict*, *Git Bisect*, *Regex Racer*, *Big-O*. Personal bests for each, and every one is proven winnable by an autopilot in CI.
- 🏆 **Weekly Challenge.** One game a week pays double; your best goes on your team card and the Team tab becomes a leaderboard.
- 🧭 **Expeditions.** Send your pet to the Legacy Monolith, the Cloud or the Kernel for 30 min to 2 h. Needs freeze while it's away. It comes back with coins, food and sometimes one of **12 artefacts**.
- 🪴 **The Room.** 15 decorations drawn on the LCD behind your pet, from a blinking server rack to a beanbag it actually naps on.
- 🦆 **Rubber Duck mode.** Stuck? Explain the bug to your pet in writing. It nudges you with the questions a good pair would ask, and pays you when you say it helped. Nothing leaves the panel.
- 📖 **The Diary.** Your pet writes about hatching, firsts, personal bests and adventures, and adds a line each morning about yesterday's coding.
- 🪙 **Coins for real work.** Typing, saving, **git commits**, **clearing all errors**, **passing tasks**, **saving test files** and **daily check-ins**.
- 🍜 **24 foods with real depth.** Discover your pet's secret favourite (and the food it hates), keep a balanced diet, and watch out for the caffeine crash. One food only exists on expeditions.
- 🛍️ **A shop with a shopkeeper.** Haggle with Mx. Stash, grab the daily deals, get up to 20% off for today's commits, open Mystery Boxes for box-only exclusives, preview every hat, prop, screen and decoration on your own pet, and sell back what you don't want.
- 🎩 **A wardrobe.** 18 hats, 6 face items, 6 held props (the balloon floats), 15 screen palettes.
- 🏅 **55 tiered achievement tracks (184 tiers)**. Every unlock reveals a harder goal. Plus a species collection, artefacts, streaks, and a memorial for pets who've passed on.
- 📊 **Stats.** Coding time today, a 7-day chart, per-language time and lifetime totals.
- 🧘 **Wellbeing.** Break reminders after long sessions, and vacation mode to freeze time.
- 📸 **Share cards.** Export a PNG of your pet to show off.
- 📜 **Daily quests.** Three new goals every day, with a bonus for clearing all three.
- 🍅 **Focus sessions.** A Pomodoro timer your pet does with you. Notifications go quiet and you get paid when you finish.
- 🧬 **Traits and shinies.** Every pet has one of 9 personalities, and 1 in 16 hatch shiny (a Lucky Charm makes it 1 in 4).
- 🛡️ **Streak Shield.** Miss a day without losing your streak.
- 🤝 **Team habitat.** Share your pet with the repo and see your teammates' pets. It travels with git: no server, no accounts, and never your coding time.
- 🌙 **A real sky.** The moon comes out on the LCD after 21:00.
- ⌨️ **`Ctrl+Alt+T`** opens a quick menu for everything.
- 🔒 **The Vault.** Six secret transformations (Galactic Knight, Mainframe, Abyss, Midnight Manor, Frostbyte, Sakura), each with its own animated world. They unlock only with promo codes released as drops.
- 🎨 **All custom art.** The pets, decorations, 127 UI icons and the share card are original pixel art, with no emoji fonts or third-party assets.

## Getting started

1. Open the **Explorer**. Your pet is in the **IdlePal** section under your files. (Prefer its own tab? Set `idlepal.location` to `activityBar`.)
2. Wait about a minute for the egg to hatch.
3. Keep an eye on the status bar. Hover for stats and one-click actions.

Run **IdlePal: Getting Started** from the Command Palette for a guided tour.

## Fair by design

- **Gentle when you're away.** While VS Code is closed, time runs at ¼ speed (capped at 48h). Your pet can't get sick or die while closed, and its health won't drop below 25.
- **One pet, many windows.** Only one window runs the simulation, so you never get double notifications.
- **Daily coin caps.** Grinding doesn't break the economy.
- **Private.** No telemetry, no accounts, no network. Team sharing is opt-in and only writes a small card into your own repo. Your save lives in VS Code's storage, and in your Settings Sync if you turn on sync.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `idlepal.location` | `explorer` | `explorer` (under your files) or `activityBar` (its own tab) |
| `idlepal.speed` | `1` | How quickly needs decay. Try `0.5` on busy days |
| `idlepal.notifications` | `all` | `all`, `important` or `off` |
| `idlepal.statusBar` | `full` | `full`, `compact` or `hidden` |
| `idlepal.focus.workMinutes` | `25` | Length of a focus session |
| `idlepal.focus.breakMinutes` | `5` | Break after a focus session |
| `idlepal.breakReminderMinutes` | `90` | `0` to disable |
| `idlepal.team.share` | `false` | Share your pet card to `.idlepal/` in the workspace |
| `idlepal.team.displayName` | OS user name | Your name on team cards |
| `idlepal.weeklyRecap` | `true` | Offer last week's recap on your first session each week |
| `idlepal.codingRewards` | `true` | Typing and saving earn happiness and coins |
| `idlepal.integrations.git` | `true` | Celebrate commits |
| `idlepal.integrations.diagnostics` | `true` | React to errors in your workspace |
| `idlepal.integrations.tasks` | `true` | React to task results |
| `idlepal.sound` | `false` | Retro beeps |
| `idlepal.syncAcrossMachines` | `true` | Sync via Settings Sync |
| `idlepal.promoCode` | | Enter a promo code to unlock a Vault item (clears itself) |

## Commands

All start with **IdlePal:**. Menu (`Ctrl+Alt+T`), Start/Stop Focus Session, Show Daily Quests, Show Weekly Recap, Open Journal, Send on an Expedition, Rubber Duck a Bug, Share My Pet with This Repo, Export Coding Stats (CSV), Show Pet, Open in Editor Tab, Feed a Meal, Give a Snack, Play a Game, Clean Up, Give Medicine, Toggle Lights, Toggle Vacation Mode, Open Shop, Save a Share Card, Rename Pet, Start Over with a New Egg, Export Save, Import Save, Erase All Data, Getting Started, Settings, Show Log, Redeem Promo Code.

## Development

No dependencies and no build step: plain CommonJS.

```
src/core/     Pure game engine (no vscode imports): catalog, save/migrations, simulation, actions, rewards,
              expeditions, weekly challenge, journal, shop, food, achievements, view model
src/host/     VS Code integration: store + leader election, controller, status bar, webview host, git/diagnostics/tasks, team, files
media/        Webview (index.html, view.js, sprites.js, view.css) and icons
test/         Unit tests (node:test), including an autopilot for every mini-game
scripts/      test.ps1, build.ps1 (packages a .vsix without Node), make-icon.ps1
```

```powershell
./scripts/test.ps1      # runs tests with Node, or VS Code's bundled runtime if Node isn't installed
./scripts/build.ps1     # writes idlepal-<version>.vsix
code --install-extension ./idlepal-1.0.0.vsix --force
```

With Node 20+: `npm test` (or `node --test test/`) and `npx @vscode/vsce package --no-dependencies`.

### Adding content

Everything is data in `src/core/catalog.js`, and the tests check it stays consistent:

- **A food, hat, prop, screen, item or decoration:** add a catalog entry, a 9×9 icon in `media/icons.js` (same id) and, for anything drawn on the LCD, a sprite in `media/sprites.js`.
- **A mini-game:** add a `GAMES` entry, an achievement track with the same id, an implementation object in `media/view.js` (`start`, `scene`, plus `key`/`button`/`tap` as needed) registered in `ARCADE`, and an autopilot in `test/webview.test.js` so CI proves it's winnable.
- **An expedition or artefact:** `EXPEDITIONS` / `ARTEFACTS`; the tests check every artefact is reachable from some destination.

## Promo codes (for maintainers)

The Vault ships **sealed**: `PROMOS` in `src/core/catalog.js` is empty, so nothing can unlock it. To release a drop:

1. Pick a code and keep it private until the post goes live.
2. Get its fingerprint: `node scripts/promo-hash.js "YOUR-CODE"`.
3. Add it to `PROMOS` under an id that doesn't reveal the code:

   ```js
   const PROMOS = {
     drop01: { hash: '<paste hash>', unlock: 'galactic', expires: Date.UTC(2026, 6, 31) }, // expires is optional
   };
   ```

   Vault item ids: `galactic`, `mainframe`, `abyss`, `manor`, `frostbyte`, `sakura`.
4. Run `./scripts/test.ps1` and `./scripts/build.ps1`, then publish the new version *before* the post goes out.

**Retire a code by setting `expires`, never by deleting its entry.** A Vault item stays unlocked only while the promo that unlocked it is still in `PROMOS`. Deleting an entry relocks that item for everyone who redeemed it.

Only the salted SHA-256 fingerprint ships, never the code. Tests check that every `PROMOS` entry is a bare hash pointing at a real Vault item. Expect a determined user to be able to unlock items by patching their own install. That's acceptable for cosmetics, but don't gate anything valuable this way.
