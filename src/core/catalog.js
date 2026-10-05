'use strict';
// Static game content. This is the single source of truth, and it's also sent to the webview.

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const STAGES = [
  { id: 'egg', label: 'Egg', until: 1 * MIN },
  { id: 'baby', label: 'Baby', until: 1 * HOUR },
  { id: 'child', label: 'Child', until: 6 * HOUR },
  { id: 'teen', label: 'Teen', until: 24 * HOUR },
  { id: 'adult', label: 'Adult', until: Infinity },
];

const SPECIES = {
  egg: { stage: 'egg', name: 'Egg', blurb: 'Something is wiggling inside.' },
  blip: { stage: 'baby', name: 'Blip', blurb: 'A tiny blob of pure potential.' },
  kitbit: { stage: 'child', name: 'Kitbit', blurb: 'Well cared for, curious and whiskered.' },
  spud: { stage: 'child', name: 'Spud', blurb: 'A little rough around the edges.' },
  sprocket: { stage: 'teen', name: 'Sprocket', blurb: 'Waves its arms at every green build.' },
  squib: { stage: 'teen', name: 'Squib', blurb: 'Moody, messy, misunderstood.' },
  phoenix: { stage: 'adult', name: 'Phoenix', blurb: 'Third generation or later, raised almost perfectly. Rises from every goodbye.' },
  starlet: { stage: 'adult', name: 'Starlet', blurb: 'Near-perfect care and a winning streak at games.' },
  octocoder: { stage: 'adult', name: 'Octocoder', blurb: 'Grew up watching you code. Eight arms, zero bugs.' },
  dataray: { stage: 'adult', name: 'Dataray', blurb: 'Raised on three or more languages. Glides between stacks.' },
  nocturne: { stage: 'adult', name: 'Nocturne', blurb: 'Raised after dark. Sees bugs others miss.' },
  mochimon: { stage: 'adult', name: 'Mochimon', blurb: 'Raised with love. Round, soft and content.' },
  blobbo: { stage: 'adult', name: 'Blobbo', blurb: 'An ordinary, deeply lovable blob.' },
  gremlin: { stage: 'adult', name: 'Gremlin', blurb: 'Neglect made it spiky. Still loves you. Probably.' },
};

const NAMES = ['Mochi', 'Pixel', 'Byte', 'Tofu', 'Nugget', 'Bean', 'Gizmo', 'Pocky', 'Dumpling', 'Kiwi', 'Sprout', 'Biscuit', 'Noodle', 'Bit', 'Pickle', 'Waffle', 'Boba', 'Linty'];

// Food. Rice balls and candy are free and unlimited, so a pet never has to go hungry; everything else
// is bought. cat groups food for the Balanced Diet bonus; caffeine (1 or 2) causes a crash later;
// cure is the chance of curing sickness. line is what your pet says when it eats it.
// rare foods can't be bought: they only come back from expeditions.
const FOODS = {
  meal: { name: 'Rice ball', cat: 'meals', price: 0, sprite: 'food', effects: { hunger: 30, weight: 1 }, desc: 'A filling meal. Always free.', line: 'Nom nom nom!' },
  snack: { name: 'Candy', cat: 'treats', price: 0, sprite: 'candy', effects: { happy: 12, hunger: 5, health: -2, weight: 2 }, desc: 'Sweet, but not healthy. Always free.', line: 'Yum, a sweet!' },
  ramen: { name: 'Ramen', cat: 'meals', price: 18, sprite: 'ramen', effects: { hunger: 45, energy: 10, happy: 5, weight: 2 }, desc: 'Late-night deploy fuel.', line: 'Slurrrp! 🍜' },
  pizza: { name: 'Pizza', cat: 'meals', price: 16, sprite: 'pizza', effects: { hunger: 40, happy: 10, weight: 3 }, desc: 'One slice. Okay, three.', line: 'Pizza party! 🍕' },
  sushi: { name: 'Sushi', cat: 'meals', price: 15, sprite: 'sushi', effects: { hunger: 50, health: 5, weight: 1 }, desc: 'A premium, healthy meal.', line: 'Fancy! 🍣' },
  salad: { name: 'Salad', cat: 'meals', price: 14, sprite: 'bowl', effects: { hunger: 25, health: 15, weight: -1 }, desc: 'Crunchy, green, righteous.', line: 'Crunch crunch. Feeling virtuous.' },
  soup: { name: 'Chicken Soup', cat: 'meals', price: 20, sprite: 'bowl', effects: { hunger: 30, health: 20 }, cure: 0.4, desc: 'Grandma\'s remedy. Sometimes cures a cold.', line: 'Warm and cosy. 🥣' },
  bento: { name: 'Bento Box', cat: 'meals', price: 30, sprite: 'bento', effects: { hunger: 55, health: 10, happy: 12, weight: 1 }, desc: 'A perfectly balanced commit.', line: 'A little bit of everything! 🍱' },
  burrito: { name: 'Burrito', cat: 'meals', price: 17, sprite: 'burrito', effects: { hunger: 48, happy: 6, weight: 3 }, desc: 'Wrapped tighter than a tarball.', line: 'Mmf. Mmmf! 🌯' },
  curry: { name: 'Curry', cat: 'meals', price: 22, sprite: 'bowl', effects: { hunger: 42, energy: 8, health: 6, weight: 2 }, desc: 'Spicy enough to wake a sleeping daemon.', line: 'Phew, spicy! 🍛' },
  apple: { name: 'Apple', cat: 'snacks', price: 10, sprite: 'apple', effects: { hunger: 15, health: 12 }, desc: 'Keeps the doctor away.', line: 'Crunchy and healthy!' },
  taco: { name: 'Taco', cat: 'snacks', price: 12, sprite: 'taco', effects: { hunger: 25, happy: 8, weight: 1 }, desc: 'Every day is Taco Tuesday.', line: 'Taco time! 🌮' },
  popcorn: { name: 'Popcorn', cat: 'snacks', price: 8, sprite: 'popcorn', effects: { hunger: 12, happy: 6 }, desc: 'For watching the CI pipeline.', line: 'Munch munch. Is it green yet?' },
  pancakes: { name: 'Pancakes', cat: 'snacks', price: 13, sprite: 'pancakes', effects: { hunger: 22, happy: 10, weight: 2 }, desc: 'A stack with no overflow.', line: 'Fluffy! 🥞' },
  coffee: { name: 'Coffee', cat: 'drinks', price: 12, sprite: 'cup', effects: { energy: 35, happy: 3, hunger: 2 }, caffeine: 1, desc: 'Fuel for late-night debugging. Crash later.', line: 'Caffeinated! ⚡' },
  tea: { name: 'Green Tea', cat: 'drinks', price: 9, sprite: 'cup', effects: { energy: 12, happy: 6, health: 4 }, desc: 'Calm focus. No crash.', line: 'Ahh. Zen mode. 🍵' },
  smoothie: { name: 'Smoothie', cat: 'drinks', price: 14, sprite: 'glass', effects: { energy: 15, health: 10, hunger: 10 }, desc: 'Blended with love and one sneaky spinach leaf.', line: 'Fruity! 🥤' },
  energyDrink: { name: 'Energy Drink', cat: 'drinks', price: 16, sprite: 'can', effects: { energy: 50, happy: 4, health: -6 }, caffeine: 2, desc: 'Wings not included. Crash included.', line: 'MAXIMUM POWER! ⚡⚡' },
  boba: { name: 'Boba Tea', cat: 'drinks', price: 15, sprite: 'glass', effects: { energy: 10, happy: 14, hunger: 8, weight: 1 }, desc: 'Chewy little pearls of joy.', line: 'Slurp… pop! 🧋' },
  cake: { name: 'Cake', cat: 'treats', price: 25, sprite: 'cake', effects: { happy: 30, hunger: 10, weight: 3 }, desc: 'For celebrating shipped features.', line: 'Cake! Best day ever! 🎂' },
  donut: { name: 'Donut', cat: 'treats', price: 10, sprite: 'donut', effects: { happy: 18, hunger: 8, health: -3, weight: 2 }, desc: 'A torus of joy.', line: 'Sprinkles! 🍩' },
  cookie: { name: 'Cookie', cat: 'treats', price: 6, sprite: 'cookie', effects: { happy: 10, hunger: 4, weight: 1 }, desc: 'Accept all cookies.', line: 'Cookies accepted. 🍪' },
  mochi: { name: 'Mochi', cat: 'treats', price: 12, sprite: 'mochi', effects: { happy: 16, hunger: 6, weight: 1 }, desc: 'Soft, squishy, suspiciously pet-shaped.', line: 'Squish! 🍡' },
  goldenRice: { name: 'Golden Rice Ball', cat: 'meals', price: 0, rare: true, sprite: 'food', effects: { hunger: 60, happy: 25, health: 20, energy: 20 }, desc: 'Found only on expeditions. Fixes everything.', line: '✨ It tastes like a clean build. ✨' },
};

const FOOD_CATS = { meals: 'Meals', snacks: 'Snacks', drinks: 'Drinks', treats: 'Treats' };
const FOOD_RULES = {
  caffeineCrashMs: 45 * 60 * 1000, crashPerLevel: 12, jitterAfter: 3,
  repeatWindow: 3, repeatOnce: 0.8, repeatTwice: 0.5,
  specialDiscount: 0.25, specialHappy: 5,
  favHappy: 10, dislikeHappy: -6, dislikeHunger: 0.7,
  balanced: { health: 15, happy: 10 },
};

// Accessory slots: hat (on the head), face (over the eyes), prop (held beside the pet), theme (Vault).
const ACCESSORIES = {
  partyhat: { name: 'Party Hat', icon: '🥳', slot: 'hat', price: 60, desc: 'Every deploy is a party.' },
  bow: { name: 'Bow', icon: '🎀', slot: 'hat', price: 60, desc: 'Adorable. Non-negotiable.' },
  cap: { name: 'Dev Cap', icon: '🧢', slot: 'hat', price: 90, desc: 'Worn backwards during hotfixes.' },
  beanie: { name: 'Beanie', icon: '🧶', slot: 'hat', price: 120, desc: 'Cosy for cold server rooms.' },
  crown: { name: 'Crown', icon: '👑', slot: 'hat', price: 400, desc: 'For the 10x pet.' },
  glasses: { name: 'Glasses', icon: '👓', slot: 'face', price: 80, desc: 'Senior-engineer energy.' },
  shades: { name: 'Shades', icon: '🕶️', slot: 'face', price: 150, desc: 'For deploying on Fridays.' },
  catEars: { name: 'Cat Ears', icon: '🐱', slot: 'hat', price: 100, desc: 'Purrs at green builds.' },
  chef: { name: 'Chef Hat', icon: '👨‍🍳', slot: 'hat', price: 140, desc: 'Cooks up spaghetti code, lovingly.' },
  wizard: { name: 'Wizard Hat', icon: '🧙', slot: 'hat', price: 250, desc: 'Any sufficiently advanced code is indistinguishable from magic.' },
  monocle: { name: 'Monocle', icon: '🧐', slot: 'face', price: 120, desc: 'For reviewing pull requests. Thoroughly.' },
  headphones: { name: 'Headphones', icon: '🎧', slot: 'hat', price: 110, desc: 'Lo-fi beats to debug to.' },
  propeller: { name: 'Propeller Cap', icon: '🧢', slot: 'hat', price: 130, desc: 'Spins faster when the build is green.' },
  pirate: { name: 'Pirate Hat', icon: '🏴‍☠️', slot: 'hat', price: 180, desc: 'Yarrr. Force-pushes to main.' },
  tophat: { name: 'Top Hat', icon: '🎩', slot: 'hat', price: 220, desc: 'For very distinguished code reviews.' },
  flowerCrown: { name: 'Flower Crown', icon: '🌼', slot: 'hat', price: 150, desc: 'Grown in the garden branch.' },
  viking: { name: 'Viking Helm', icon: '⛑️', slot: 'hat', price: 260, desc: 'Raids legacy codebases.' },
  antenna: { name: 'Antenna', icon: '📡', slot: 'hat', price: 170, desc: 'Picks up stray Wi-Fi and good ideas.' },
  eyepatch: { name: 'Eyepatch', icon: '🏴‍☠️', slot: 'face', price: 100, desc: 'Lost an eye to a regex.' },
  mustache: { name: 'Moustache', icon: '👨', slot: 'face', price: 90, desc: 'Distinguished. Possibly fake.' },
  heartGlasses: { name: 'Heart Glasses', icon: '😍', slot: 'face', price: 160, desc: 'Sees the best in every codebase.' },
  mug: { name: 'Mug', icon: '☕', slot: 'prop', price: 70, desc: 'A mug that says #1 DEBUGGER.' },
  laptop: { name: 'Tiny Laptop', icon: '💻', slot: 'prop', price: 200, desc: 'Pair programming, but smaller.' },
  balloon: { name: 'Balloon', icon: '🎈', slot: 'prop', price: 80, desc: 'Floats like a well-tested PR.' },
  book: { name: 'Book', icon: '📘', slot: 'prop', price: 120, desc: 'Reads the docs so you don\'t have to.' },
  flag: { name: 'Flag', icon: '🚩', slot: 'prop', price: 90, desc: 'Plants it on every shipped feature.' },
  // Box-only exclusives: can't be bought, only found in the Mystery Box.
  halo: { name: 'Halo', icon: '😇', slot: 'hat', price: 0, exclusive: true, desc: 'Has never pushed to main. Box exclusive.' },
  mask: { name: 'Bandit Mask', icon: '🥷', slot: 'face', price: 0, exclusive: true, desc: 'Steals focus. Box exclusive.' },
  duckProp: { name: 'Rubber Duck', icon: '🦆', slot: 'prop', price: 0, exclusive: true, desc: 'The original debugger. Box exclusive.' },
  // Vault items: full "theme" transformations, locked until a promo code unlocks them.
  // teaser/drop/rarity are shown while locked; the name and look stay hidden until then.
  galactic: { name: 'Galactic Knight', icon: '🌌', slot: 'theme', price: 0, vault: true, drop: 1, rarity: 'Legendary',
    teaser: 'Light years from your codebase, something hums.',
    desc: 'A space helmet, a humming laser sword and a living starfield.' },
  mainframe: { name: 'Mainframe', icon: '💾', slot: 'theme', price: 0, vault: true, drop: 2, rarity: 'Epic',
    teaser: 'It speaks only in green, and it never stops falling.',
    desc: 'A hacker hood, a visor and endless falling code.' },
  abyss: { name: 'Abyss', icon: '🌊', slot: 'theme', price: 0, vault: true, drop: 3, rarity: 'Epic',
    teaser: 'Twenty thousand lines under the sea.',
    desc: 'A brass diving helmet, rising bubbles and swaying kelp.' },
  manor: { name: 'Midnight Manor', icon: '🦇', slot: 'theme', price: 0, vault: true, drop: 4, rarity: 'Rare',
    teaser: 'Best unlocked after dark. Mind the wings.',
    desc: 'A witch hat, a full moon, bats and a glowing pumpkin.' },
  frostbyte: { name: 'Frostbyte', icon: '❄️', slot: 'theme', price: 0, vault: true, drop: 5, rarity: 'Rare',
    teaser: 'Cold boot required.',
    desc: 'A cosy beanie and snow that drifts down and piles up.' },
  sakura: { name: 'Sakura', icon: '🌸', slot: 'theme', price: 0, vault: true, drop: 6, rarity: 'Rare',
    teaser: 'Blooms once a year. Blink and it\'s gone.',
    desc: 'A headband and cherry-blossom petals on the breeze.' },
};

// Full transformations for "theme" items: the look (hat/face), the screen palette, the living
// background ("ambient") and an optional held prop. ink/shine draw the pet; star/glow draw the ambience.
const THEMES = {
  galactic: {
    look: { hat: 'spaceHelmet', face: 'shades' }, ambient: 'stars', prop: 'saber',
    palette: { bg: '#060816', ghost: '#0c1026', ink: '#e9e7ff', shine: '#ffd84d', star: '#8fa3ff', glow: '#5ff3ff' },
  },
  mainframe: {
    look: { hat: 'hood', face: 'shades' }, ambient: 'rain', prop: null,
    palette: { bg: '#020a03', ghost: '#061307', ink: '#c8ffc8', shine: '#ffffff', star: '#1c7a33', glow: '#39ff6a' },
  },
  abyss: {
    look: { hat: 'diveHelmet', face: 'glasses' }, ambient: 'bubbles', prop: null,
    palette: { bg: '#031428', ghost: '#07203a', ink: '#d4ecff', shine: '#ffd84d', star: '#7fd0ff', glow: '#2fbf71' },
  },
  manor: {
    look: { hat: 'witchHat', face: null }, ambient: 'bats', prop: null,
    palette: { bg: '#150a24', ghost: '#1e1131', ink: '#eadfff', shine: '#ffe27a', star: '#9a6ce0', glow: '#ff8c1a' },
  },
  frostbyte: {
    look: { hat: 'beanie', face: null }, ambient: 'snow', prop: null,
    palette: { bg: '#8fb9de', ghost: '#84aed4', ink: '#0f2540', shine: '#b3342b', star: '#ffffff', glow: '#eaf6ff' },
  },
  sakura: {
    look: { hat: 'headband', face: null }, ambient: 'petals', prop: null,
    palette: { bg: '#fdeef3', ghost: '#f4dde6', ink: '#4a2238', shine: '#c9971c', star: '#ffb3cf', glow: '#ff6fa5' },
  },
};

// Promo codes. Only salted hashes ship: generate one per code with scripts/promo-hash.js and add
// { hash, unlock: '<vault item id>', expires?: <epoch ms> } under an id that doesn't reveal the code.
// Empty until drops are announced, so the Vault stays locked.
const PROMOS = {
};

const SCREENS = {
  classic: { name: 'Classic LCD', price: 0, bg: '#c3cc9f', ghost: '#b5bf90', ink: '#2c3222', shine: '#7a4a12' },
  mint: { name: 'Mint', price: 50, bg: '#b8e0c8', ghost: '#a8d2b9', ink: '#123d2a', shine: '#7a2d5e' },
  ice: { name: 'Ice', price: 80, bg: '#cfe6f5', ghost: '#bed8ea', ink: '#16324a', shine: '#8a3b7a' },
  amber: { name: 'Amber', price: 80, bg: '#f2c46b', ghost: '#e5b55a', ink: '#4a2a05', shine: '#8b1e3f' },
  gameboy: { name: 'Handheld', price: 120, bg: '#9bbc0f', ghost: '#8cad0f', ink: '#0f380f', shine: '#306230' },
  synthwave: { name: 'Synthwave', price: 200, bg: '#2b1840', ghost: '#34204c', ink: '#ff5fd2', shine: '#5ff7ff' },
  paper: { name: 'Paper', price: 100, bg: '#f4f1ea', ghost: '#e8e3d8', ink: '#2b2b2b', shine: '#b0413e' },
  sunset: { name: 'Sunset', price: 150, bg: '#ffcf9f', ghost: '#f5c08e', ink: '#5a1e3c', shine: '#1e3a5a' },
  matrix: { name: 'Matrix', price: 180, bg: '#07140a', ghost: '#0c1f10', ink: '#39ff6a', shine: '#d4ff5c' },
  ocean: { name: 'Ocean', price: 130, bg: '#9fd3e8', ghost: '#8fc6dd', ink: '#0d2f4a', shine: '#ff7a59' },
  lava: { name: 'Lava', price: 170, bg: '#2a0f0f', ghost: '#361414', ink: '#ff7b39', shine: '#ffd166' },
  mono: { name: 'Mono', price: 90, bg: '#e8e8e8', ghost: '#dcdcdc', ink: '#111111', shine: '#777777' },
  cherry: { name: 'Cherry', price: 140, bg: '#ffd6e0', ghost: '#f6c8d4', ink: '#5c1a2e', shine: '#2a6f4e' },
  cyber: { name: 'Cyberdeck', price: 220, bg: '#0b1026', ghost: '#121a3a', ink: '#f8e71c', shine: '#ff2e88' },
  aurora: { name: 'Aurora', price: 0, exclusive: true, bg: '#0e1e33', ghost: '#142842', ink: '#7fffd4', shine: '#ff9ff3' },
};

// Room decorations drawn on the LCD behind your pet. One per zone; the pet wanders over and uses
// floor items (fx is the little effect it shows when it does).
const DECOR = {
  plant: { name: 'Monstera', zone: 'floorL', price: 70, fx: 'sparkle', desc: 'Thrives on indirect light and merged PRs.' },
  cactus: { name: 'Cactus', zone: 'floorL', price: 50, fx: null, desc: 'Needs watering once per major version.' },
  beanbag: { name: 'Beanbag', zone: 'floorL', price: 120, fx: 'z', desc: 'Where the best thinking happens.' },
  catTree: { name: 'Cat Tree', zone: 'floorL', price: 160, fx: 'heart', desc: 'Climbed during long compiles.' },
  arcade: { name: 'Arcade Cabinet', zone: 'floorL', price: 260, fx: 'sparkle', desc: 'High score: your pet, always.' },
  lamp: { name: 'Desk Lamp', zone: 'floorR', price: 60, fx: null, desc: 'For reading stack traces by.' },
  server: { name: 'Server Rack', zone: 'floorR', price: 200, fx: 'sweat', desc: 'Blinks reassuringly. Mostly.' },
  coffeeMachine: { name: 'Coffee Machine', zone: 'floorR', price: 150, fx: 'cup', desc: 'The real build server.' },
  aquarium: { name: 'Aquarium', zone: 'floorR', price: 180, fx: 'heart', desc: 'Two fish, named Foo and Bar.' },
  monitor: { name: 'Monitor', zone: 'floorR', price: 140, fx: 'sparkle', desc: 'Your pet watches your code on it.' },
  poster: { name: 'Poster', zone: 'wallL', price: 40, fx: null, desc: '"Ship it." (framed)' },
  windowDecor: { name: 'Window', zone: 'wallL', price: 90, fx: null, desc: 'A view of the outside, allegedly.' },
  shelf: { name: 'Bookshelf', zone: 'wallR', price: 80, fx: null, desc: 'Mostly O\'Reilly animals.' },
  clock: { name: 'Wall Clock', zone: 'wallR', price: 60, fx: null, desc: 'Always says "five more minutes".' },
  rug: { name: 'Rug', zone: 'floor', price: 50, fx: null, desc: 'Ties the room together.' },
};
const DECOR_ZONES = ['wallL', 'wallR', 'floorL', 'floorR', 'floor'];

// reward: coins = floor(score / coinDiv); happy = min(happyMax, happyBase + happyPer * score); wins += floor(score / winDiv).
// maxScore caps what the webview can claim.
const GAMES = {
  leftright: { name: 'Left or Right', icon: '↔️', desc: 'Guess which way your pet will look. 5 rounds.', maxScore: 5, unit: 'right',
    reward: { coinDiv: 1, happyBase: 3, happyPer: 6, happyMax: 40, winDiv: 1 } },
  bugs: { name: 'Bug Squash', icon: '🐛', desc: 'Squash as many bugs as you can in 20 seconds.', maxScore: 40, unit: 'bugs',
    reward: { coinDiv: 4, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 8 } },
  dash: { name: 'Deploy Dash', icon: '🚀', desc: 'Sprint to production and jump the bugs. Space or tap to jump.', maxScore: 80, unit: 'bugs dodged',
    reward: { coinDiv: 3, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 5 } },
  stack: { name: 'Stack Overflow', icon: '🧱', desc: 'Drop each sliding layer onto the stack. Overhang gets sliced off.', maxScore: 25, unit: 'layers',
    reward: { coinDiv: 2, happyBase: 3, happyPer: 2, happyMax: 25, winDiv: 4 } },
  simon: { name: 'Rubber Duck Says', icon: '🦆', desc: 'Watch the duck, then repeat the arrow sequence. It grows each round.', maxScore: 25, unit: 'steps',
    reward: { coinDiv: 1, happyBase: 3, happyPer: 3, happyMax: 30, winDiv: 3 } },
  hotkeys: { name: 'Hot Keys', icon: '⌨️', desc: 'Type the code tokens as fast as you can. 30 seconds.', maxScore: 60, unit: 'tokens',
    reward: { coinDiv: 2, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 5 } },
  merge: { name: 'Merge Conflict', icon: '🔀', desc: 'Two versions of a line: keep the one without the bug. 5 rounds.', maxScore: 5, unit: 'resolved',
    reward: { coinDiv: 1, happyBase: 3, happyPer: 6, happyMax: 40, winDiv: 1 } },
  snake: { name: 'Linked List', icon: '🐍', desc: 'Append nodes to the list without dereferencing yourself. Arrow keys.', maxScore: 60, unit: 'nodes',
    reward: { coinDiv: 3, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 6 } },
  pipeline: { name: 'Pipeline', icon: '🐦', desc: 'Flap through the CI gates. Space or tap to flap.', maxScore: 50, unit: 'gates',
    reward: { coinDiv: 2, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 4 } },
  breakout: { name: 'Tech Debt', icon: '🧹', desc: 'Pay down the wall of debt. Arrow keys move the paddle; 3 balls.', maxScore: 52, unit: 'blocks',
    reward: { coinDiv: 3, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 6 } },
  pong: { name: 'Packet Pong', icon: '🏓', desc: 'Rally against your pet. Up and down keys, or tap top and bottom.', maxScore: 40, unit: 'returns',
    reward: { coinDiv: 2, happyBase: 3, happyPer: 1, happyMax: 25, winDiv: 4 } },
  bisect: { name: 'Git Bisect', icon: '🔍', desc: 'Find the first bad commit in as few tests as a binary search. 5 rounds.', maxScore: 5, unit: 'found',
    reward: { coinDiv: 1, happyBase: 3, happyPer: 6, happyMax: 40, winDiv: 1 } },
  regex: { name: 'Regex Racer', icon: '🔤', desc: 'Pick the one string the pattern matches. 8 rounds, 60 seconds.', maxScore: 8, unit: 'matched',
    reward: { coinDiv: 1, happyBase: 3, happyPer: 4, happyMax: 35, winDiv: 2 } },
  bigo: { name: 'Big-O', icon: '📈', desc: 'Read the snippet, call its complexity. 6 rounds.', maxScore: 6, unit: 'called',
    reward: { coinDiv: 1, happyBase: 3, happyPer: 5, happyMax: 35, winDiv: 1 } },
};

// One game a week pays double. Seeded by the ISO week, so every window and every teammate agrees.
const CHALLENGE = { multiplier: 2 };

// Expeditions: send your pet away for a while; it comes back with loot. Needs freeze while it's gone.
// loot: coin range, foods it might bring, and the chance of an artefact (from `artefacts`).
const EXPEDITIONS = {
  monolith: { name: 'The Legacy Monolith', minutes: 30, energy: 15, icon: 'map',
    desc: 'A sprawling codebase nobody dares to touch. Treasures in the comments.',
    loot: { coins: [8, 20], foods: ['cookie', 'ramen', 'coffee'], artefactChance: 0.18, artefacts: ['floppyOfLegend', 'semicolon', 'commentTome', 'gotoStatement'] } },
  cloud: { name: 'The Cloud', minutes: 60, energy: 25, icon: 'cloud',
    desc: 'Somebody else\'s computer, very far up. Mind the billing.',
    loot: { coins: [18, 40], foods: ['sushi', 'boba', 'bento'], artefactChance: 0.22, artefacts: ['nullPointer', 'lostPacket', 'yamlScroll', 'duckOfTruth'] } },
  kernel: { name: 'The Kernel', minutes: 120, energy: 40, icon: 'chip',
    desc: 'Ring zero. Everything is a file, and some of them bite.',
    loot: { coins: [40, 80], foods: ['goldenRice', 'curry', 'cake'], artefactChance: 0.3, artefacts: ['segfaultShard', 'rootKey', 'bitFlip', 'infiniteLoop'] } },
};

// Artefacts: collectibles brought back from expeditions. No gameplay effect, pure bragging rights.
const ARTEFACTS = {
  floppyOfLegend: { name: 'Floppy of Legend', rarity: 'Common', icon: 'floppy', desc: '1.44 MB. Still has the only copy.' },
  semicolon: { name: 'The Lost Semicolon', rarity: 'Common', icon: 'semicolon', desc: 'The one that broke production in 2009.' },
  commentTome: { name: 'Tome of TODOs', rarity: 'Common', icon: 'book', desc: 'Every "// fix later" ever written.' },
  gotoStatement: { name: 'GOTO Statement', rarity: 'Rare', icon: 'arrows', desc: 'Considered harmful. Considered handsome.' },
  nullPointer: { name: 'Null Pointer', rarity: 'Common', icon: 'orb', desc: 'Points at nothing. Means everything.' },
  lostPacket: { name: 'Lost Packet', rarity: 'Rare', icon: 'packet', desc: 'Took the scenic route around the world.' },
  yamlScroll: { name: 'YAML Scroll', rarity: 'Common', icon: 'scroll', desc: 'Indented with love and four spaces.' },
  duckOfTruth: { name: 'Rubber Duck of Truth', rarity: 'Epic', icon: 'duck', desc: 'Explain anything to it and the answer appears.' },
  segfaultShard: { name: 'Segfault Shard', rarity: 'Rare', icon: 'shard', desc: 'Core dumped. Core retrieved.' },
  rootKey: { name: 'Root Key', rarity: 'Epic', icon: 'key', desc: 'sudo make me a sandwich.' },
  bitFlip: { name: 'Cosmic Bit Flip', rarity: 'Epic', icon: 'bolt', desc: 'A single ray from a distant star. It was a 1. Now it\'s a 0.' },
  infiniteLoop: { name: 'Infinite Loop', rarity: 'Legendary', icon: 'loop', desc: 'while (true) { admire(); }' },
};

// Achievements are tracks of tiers: unlocking a tier reveals the next, harder goal.
// desc uses {n} for the goal, {s}/{es} for plurals. Each tier pays its own reward.
const ACHIEVEMENTS = {
  hatch: { name: 'Hatchery', icon: '🐣', desc: 'Hatch {n} egg{s}', goals: [1, 3, 10, 25], rewards: [10, 20, 50, 100] },
  meals: { name: 'Room Service', icon: '🍙', desc: 'Feed your pet {n} time{s}', goals: [1, 25, 100, 500], rewards: [5, 15, 30, 80] },
  adults: { name: 'All Grown Up', icon: '🎓', desc: 'Raise {n} pet{s} to adulthood', goals: [1, 3, 10], rewards: [50, 100, 250] },
  mindReader: { name: 'Mind Reader', icon: '🔮', desc: 'Win 5/5 in Left or Right {n} time{s}', goals: [1, 5, 20], rewards: [20, 40, 100] },
  bugBlitz: { name: 'Bug Blitz', icon: '🐛', desc: 'Squash {n} bugs in one 20-second round', goals: [10, 20, 30], rewards: [10, 25, 60] },
  exterminator: { name: 'Exterminator', icon: '🪲', desc: 'Squash {n} bugs in total', goals: [30, 60, 100, 250, 1000], rewards: [10, 20, 40, 80, 200] },
  cleans: { name: 'Clean Freak', icon: '🧽', desc: 'Clean up {n} time{s}', goals: [10, 50, 200], rewards: [10, 30, 80] },
  cures: { name: 'Dr. Byte', icon: '🩺', desc: 'Cure {n} illness{es}', goals: [1, 10, 50], rewards: [10, 30, 80] },
  streak: { name: 'On a Roll', icon: '🔥', desc: 'Keep a {n}-day streak', goals: [3, 7, 14, 30, 100, 365], rewards: [15, 50, 80, 250, 600, 2000] },
  deepWork: { name: 'Deep Work', icon: '🧠', desc: 'Code for {n} hour{s} in one day', goals: [1, 2, 4, 6], rewards: [10, 25, 50, 100] },
  chars: { name: 'Keyboard Warrior', icon: '⌨️', desc: 'Type {n} characters', goals: [10000, 50000, 250000, 1000000], rewards: [15, 40, 100, 300] },
  commits: { name: 'Ship It', icon: '🚢', desc: 'Make {n} commit{s}', goals: [1, 50, 250, 1000], rewards: [10, 60, 150, 400] },
  errors: { name: 'Bug-Free', icon: '✅', desc: 'Clear every error in your workspace {n} time{s}', goals: [1, 10, 50], rewards: [15, 40, 100] },
  tasks: { name: 'Green Build', icon: '🟢', desc: 'Pass {n} task{s}', goals: [1, 25, 100], rewards: [10, 40, 100] },
  collector: { name: 'Collector', icon: '📖', desc: 'Discover {n} species', goals: [3, 5, 8, 10, 13], rewards: [20, 40, 80, 150, 300] },
  pokedex: { name: 'Gotta Raise \'Em All', icon: '🌟', desc: 'Discover every adult species', goals: [1], rewards: [400], flag: true },
  shiny: { name: 'Shiny Hunter', icon: '✦', desc: 'Hatch {n} shiny pet{s}', goals: [1, 3, 10], rewards: [50, 120, 400] },
  fashion: { name: 'Fashionista', icon: '🎩', desc: 'Collect {n} accessories', goals: [1, 3, 7, 13, 20], rewards: [10, 40, 120, 300, 500] },
  haggler: { name: 'Haggler', icon: '🤝', desc: 'Win {n} haggle{s} with Mx. Stash', goals: [1, 5, 25], rewards: [15, 40, 120] },
  lucky: { name: 'Lucky Dip', icon: '🎁', desc: 'Open {n} Mystery Box{es}', goals: [1, 10, 25], rewards: [10, 60, 150] },
  vaultHunter: { name: 'Vault Hunter', icon: '🔓', desc: 'Unlock {n} Vault item{s}', goals: [1, 3, 6], rewards: [50, 150, 500] },
  gourmet: { name: 'Gourmet', icon: '🍱', desc: 'Taste {n} different foods', goals: [5, 10, 18, 24], rewards: [15, 40, 120, 250] },
  balanced: { name: 'Balanced Diet', icon: '🥗', desc: 'Eat from all four food groups on {n} day{s}', goals: [1, 7, 30], rewards: [20, 60, 200] },
  moneybags: { name: 'Moneybags', icon: '💰', desc: 'Hold {n} coins at once', goals: [500, 1000, 2500], rewards: [25, 50, 150] },
  nightOwl: { name: 'Night Owl', icon: '🦉', desc: 'Code between midnight and 4am', goals: [1], rewards: [15], flag: true },
  earlyBird: { name: 'Early Bird', icon: '🐦', desc: 'Code between 5am and 7am', goals: [1], rewards: [15], flag: true },
  survivor: { name: 'Survivor', icon: '🛡️', desc: 'Keep a pet alive for {n} hours of coding time', goals: [24, 72, 168], rewards: [40, 100, 250] },
  dynasty: { name: 'Dynasty', icon: '🌳', desc: 'Reach generation {n}', goals: [3, 5, 10], rewards: [50, 100, 250] },
  quests: { name: 'Side Quester', icon: '📜', desc: 'Complete {n} daily quest{s}', goals: [1, 50, 250], rewards: [10, 100, 300] },
  questMaster: { name: 'Quest Master', icon: '🗺️', desc: 'Clear all daily quests on {n} day{s}', goals: [1, 10, 50], rewards: [30, 100, 300] },
  focus: { name: 'Flow State', icon: '🍅', desc: 'Finish {n} focus session{s}', goals: [1, 25, 100, 500], rewards: [10, 80, 200, 600] },
  polyglot: { name: 'Polyglot', icon: '🗣️', desc: 'Code in {n} languages in one day', goals: [3, 5, 8], rewards: [15, 30, 80] },
  milestones: { name: 'Long-Time Friend', icon: '🎂', desc: 'Keep a pet for {n} days', goals: [7, 30, 100, 365], rewards: [20, 50, 150, 500] },
  shielded: { name: 'Saved by the Shield', icon: '🛡️', desc: 'Let a Streak Shield save your streak {n} time{s}', goals: [1, 5], rewards: [10, 40] },
  team: { name: 'Team Player', icon: '🤝', desc: 'Share your pet with a repo', goals: [1], rewards: [20], flag: true },
  dash: { name: 'Speedrunner', icon: '🚀', desc: 'Dodge {n} bugs in one Deploy Dash', goals: [10, 25, 50, 80], rewards: [10, 25, 60, 150] },
  stack: { name: 'Stack Overflow', icon: '🧱', desc: 'Stack {n} layers in one game', goals: [5, 10, 15, 25], rewards: [10, 25, 60, 150] },
  simon: { name: 'Rubber Duck Debugger', icon: '🦆', desc: 'Repeat a {n}-step sequence in Rubber Duck Says', goals: [4, 8, 12, 20], rewards: [10, 25, 60, 150] },
  hotkeys: { name: '10x Typist', icon: '⌨️', desc: 'Type {n} tokens in one round of Hot Keys', goals: [10, 20, 30, 45], rewards: [10, 25, 60, 150] },
  merge: { name: 'Conflict Resolver', icon: '🔀', desc: 'Resolve all 5 merge conflicts perfectly {n} time{s}', goals: [1, 5, 20], rewards: [25, 60, 150] },
  snake: { name: 'Pointer Wrangler', icon: '🐍', desc: 'Grow a Linked List to {n} nodes', goals: [10, 20, 35, 60], rewards: [10, 25, 60, 150] },
  pipeline: { name: 'Green Pipeline', icon: '🐦', desc: 'Fly through {n} CI gates in one Pipeline run', goals: [5, 12, 25, 50], rewards: [10, 25, 60, 150] },
  breakout: { name: 'Debt Free', icon: '🧹', desc: 'Clear {n} blocks in one game of Tech Debt', goals: [10, 25, 40, 52], rewards: [10, 25, 60, 150] },
  pong: { name: 'Rally Driver', icon: '🏓', desc: 'Return {n} packets in one rally', goals: [5, 12, 25, 40], rewards: [10, 25, 60, 150] },
  bisect: { name: 'Bisector', icon: '🔍', desc: 'Find all 5 bad commits within budget {n} time{s}', goals: [1, 5, 20], rewards: [25, 60, 150] },
  regex: { name: 'Pattern Matcher', icon: '🔤', desc: 'Score 8/8 in Regex Racer {n} time{s}', goals: [1, 5, 20], rewards: [25, 60, 150] },
  bigo: { name: 'Asymptotic', icon: '📈', desc: 'Score 6/6 in Big-O {n} time{s}', goals: [1, 5, 20], rewards: [25, 60, 150] },
  arcade: { name: 'Arcade Rat', icon: '🕹️', desc: 'Play every mini-game at least once', goals: [1], rewards: [60], flag: true },
  gamesPlayed: { name: 'High Score Hero', icon: '🎮', desc: 'Play {n} mini-games', goals: [10, 50, 250, 1000], rewards: [10, 40, 120, 400] },
  challenger: { name: 'Challenger', icon: '🏆', desc: 'Play the Weekly Challenge in {n} different week{s}', goals: [1, 4, 12, 52], rewards: [15, 60, 200, 800] },
  explorer: { name: 'Explorer', icon: '🧭', desc: 'Complete {n} expedition{s}', goals: [1, 10, 50, 200], rewards: [15, 60, 200, 600] },
  archaeologist: { name: 'Archaeologist', icon: '🏺', desc: 'Collect {n} artefact{s}', goals: [1, 4, 8, 12], rewards: [25, 80, 200, 600] },
  decorator: { name: 'Interior Designer', icon: '🪴', desc: 'Own {n} room decoration{s}', goals: [1, 5, 10, 15], rewards: [10, 40, 120, 300] },
  rubberDuck: { name: 'Talk It Out', icon: '🦆', desc: 'Finish {n} rubber-duck session{s}', goals: [1, 10, 50], rewards: [10, 60, 200] },
  tester: { name: 'Test Pilot', icon: '🧪', desc: 'Save a test file {n} time{s}', goals: [10, 100, 500], rewards: [15, 60, 200] },
};

// Economy tuning.
const ECONOMY = {
  charsPerCoin: 400,
  saveCoin: 1,
  saveThrottleMs: 30 * SEC,
  commitCoins: 10,
  maxCommitCoinsPerDay: 60,
  maxActivityCoinsPerDay: 80, // coins from typing and saving
  checkInBase: 5,
  checkInPerStreakDay: 1,
  checkInMaxBonus: 15,
  bugFreeCoins: 5,
  taskSuccessCoins: 2,
  maxGameCoinsPerDay: 60,
  duckCoins: 6,               // a finished rubber-duck session
  duckCooldownMs: 30 * MIN,
  duckMinChars: 150,
};

// Simulation tuning. All rates are per minute of simulated time.
const TUNING = {
  offlineGap: 2 * MIN,
  offlineRate: 0.25,
  offlineCap: 48 * HOUR,
  offlineHealthFloor: 25,
  awake: { hunger: 0.55, happy: 0.4, energy: 0.35 },
  asleep: { hunger: 0.25, happy: 0.1, energy: -2.5 },
  poopChance: 1 / 45,
  maxPoops: 4,
  damage: { starving: 1.0, miserable: 0.4, perPoop: 0.2, sick: 0.4 },
  regen: 0.3,
  sickRisk: { messy: 0.02, weak: 0.02, starving: 0.02, overweight: 0.01 },
  overweight: 40,
  sickMistakeAfter: 30 * MIN,
  // Adult evolution thresholds for the new branches.
  polyglotLangs: 3, polyglotMsPerLang: 30 * MIN, nocturneNightMs: 2 * HOUR,
};

// Personality, rolled once at hatch. Multipliers apply to the per-minute decay rates.
const TRAITS = {
  foodie: { name: 'Foodie', desc: 'Gets hungry faster, but meals make it extra happy.', mods: { hunger: 1.25, mealHappy: 8 } },
  zen: { name: 'Zen', desc: 'Rarely bored. Hard to ruffle.', mods: { happy: 0.7 } },
  gamer: { name: 'Gamer', desc: 'Loves mini-games: double the joy from playing.', mods: { gameHappy: 2 } },
  neat: { name: 'Neat', desc: 'Makes half as much mess.', mods: { poop: 0.5 } },
  sleepy: { name: 'Sleepy', desc: 'Tires quickly, but naps recharge fast.', mods: { energy: 1.3, sleepRecover: 1.5 } },
  nightOwl: { name: 'Night Owl', desc: 'Barely tires after dark.', mods: { energyNight: 0.4 } },
  hardy: { name: 'Hardy', desc: 'Half as likely to get sick.', mods: { sick: 0.5 } },
  sprinter: { name: 'Sprinter', desc: 'Grows up 20% faster.', mods: { age: 1.2 } },
  explorer: { name: 'Explorer', desc: 'Expeditions take 20% less time and find more.', mods: { expedition: 0.8, loot: 1.3 } },
};
const SHINY_CHANCE = 1 / 16;

// Consumable items (not food).
const ITEMS = {
  streakShield: { name: 'Streak Shield', icon: 'shield', price: 80, max: 3, desc: 'Saves your streak if you miss a day. Used automatically.' },
  questReroll: { name: 'Quest Reroll', icon: 'scroll', price: 40, max: 3, desc: 'Swap one of today\'s quests for a different one.' },
  focusBoost: { name: 'Focus Booster', icon: 'tomato', price: 30, max: 3, desc: 'Your next finished focus session pays double.' },
  vitamins: { name: 'Vitamins', icon: 'pill', price: 45, max: 3, desc: 'Your pet can\'t get sick for the next 24 hours.' },
  luckyCharm: { name: 'Lucky Charm', icon: 'clover', price: 120, max: 1, desc: 'Your next egg is 4× as likely to hatch shiny. Used at hatch.' },
  trailMix: { name: 'Trail Mix', icon: 'bag', price: 35, max: 3, desc: 'Your next expedition finishes 25% sooner.' },
};

// Food bundles: a discount for buying in bulk.
const BUNDLES = {
  snackPack: { name: 'Snack Pack', desc: 'Fuel for a long day.', contents: { coffee: 2, apple: 2, cake: 1 }, price: 55 },
  feast: { name: 'Friday Feast', desc: 'Celebrate the release.', contents: { sushi: 3, cake: 2 }, price: 80 },
  healthy: { name: 'Healthy Habits', desc: 'An apple a day…', contents: { apple: 5 }, price: 40 },
  brunch: { name: 'Sunday Brunch', desc: 'Slow morning, fast Wi-Fi.', contents: { pancakes: 2, boba: 2, mochi: 1 }, price: 60 },
};

// Shop economics.
const SHOP = {
  dealCount: 3,
  dealDiscount: 0.3,
  commitDiscountPer: 0.02,   // 2% off per commit today…
  commitDiscountMax: 0.2,    // …up to 20%
  sellBack: 0.4,             // pawn cosmetics for 40% of their price
  exclusiveSellPrice: 60,
  mysteryPrice: 90,
  mysteryWeights: { normal: 2, exclusive: 1 },
  haggle: { minOffer: 0.5, floorMin: 0.65, floorMax: 0.9 },
};

// Daily quests. Three are drawn each day; `targets` is chosen by the day's seed.
const QUESTS = {
  chars: { name: 'Warm fingers', desc: 'Type {n} characters', targets: [1500, 3000], reward: 10, counter: 'chars' },
  saves: { name: 'Save early, save often', desc: 'Save {n} files', targets: [10, 20], reward: 8, counter: 'saves' },
  commits: { name: 'Ship it', desc: 'Make {n} commit{s}', targets: [1, 3], reward: 15, counter: 'commits' },
  minutes: { name: 'Deep work', desc: 'Code for {n} minutes', targets: [30, 60, 90], reward: 15, counter: 'minutes' },
  games: { name: 'Playtime', desc: 'Play {n} mini-game{s}', targets: [1, 2], reward: 10, counter: 'games' },
  feeds: { name: 'Room service', desc: 'Feed your pet {n} time{s}', targets: [1, 2], reward: 5, counter: 'feeds' },
  cleans: { name: 'Spring clean', desc: 'Clean up {n} mess{es}', targets: [1], reward: 5, counter: 'cleans' },
  bugFree: { name: 'Squeaky clean build', desc: 'Clear all errors {n} time{s}', targets: [1], reward: 10, counter: 'bugFree' },
  tasks: { name: 'Green light', desc: 'Get {n} passing task{s}', targets: [1], reward: 10, counter: 'tasks' },
  focus: { name: 'In the zone', desc: 'Finish {n} focus session{s}', targets: [1, 2], reward: 15, counter: 'focus' },
  languages: { name: 'Polyglot', desc: 'Code in {n} languages', targets: [2, 3], reward: 10, counter: 'languages' },
  tests: { name: 'Test pilot', desc: 'Save a test file {n} time{s}', targets: [3, 6], reward: 10, counter: 'tests' },
  duck: { name: 'Talk it out', desc: 'Finish {n} rubber-duck session{s}', targets: [1], reward: 8, counter: 'duck' },
  expedition: { name: 'Field trip', desc: 'Complete {n} expedition{s}', targets: [1], reward: 12, counter: 'expedition' },
  challenge: { name: 'Weekly challenger', desc: 'Play the Weekly Challenge {n} time{s}', targets: [1, 2], reward: 10, counter: 'challenge' },
};
const QUESTS_PER_DAY = 3;
const QUEST_BONUS = 20;

const FOCUS = { workMinutes: 25, breakMinutes: 5, coinsPerFiveMinutes: 1, happy: 15 };

// Real-time age milestones (days since hatch): a party, a free cake and some coins.
const MILESTONES = { 7: 20, 30: 50, 100: 150, 365: 500 };

// Lookup tables have no prototype, so ids like "constructor" or "__proto__" (from a webview message
// or a hand-edited save) are simply unknown instead of resolving to Object.prototype members.
for (const table of [SPECIES, FOODS, ACCESSORIES, SCREENS, GAMES, ACHIEVEMENTS, TRAITS, ITEMS, QUESTS, MILESTONES, BUNDLES, THEMES, PROMOS, DECOR, EXPEDITIONS, ARTEFACTS]) Object.setPrototypeOf(table, null);

module.exports = {
  SEC, MIN, HOUR, DAY,
  STAGES, SPECIES, NAMES, FOODS, ACCESSORIES, SCREENS, GAMES, ACHIEVEMENTS, ECONOMY, TUNING,
  TRAITS, SHINY_CHANCE, ITEMS, QUESTS, QUESTS_PER_DAY, QUEST_BONUS, FOCUS, MILESTONES, BUNDLES, SHOP, THEMES, PROMOS, FOOD_CATS, FOOD_RULES,
  DECOR, DECOR_ZONES, CHALLENGE, EXPEDITIONS, ARTEFACTS,
};
