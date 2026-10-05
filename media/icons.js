// IdlePal's own pixel icon set: 9x9, drawn to match the LCD pet.
// '#' outline · 'o' main colour (a) · 'y' second colour (b) · 'w' highlight · '.' empty.
// Rendered as crisp inline SVG (see pxIcon), so it looks the same on every OS and theme.
(function () {
  'use strict';
  const I = {
    coin: { a: '#f5c542', px: ['..#####..', '.#ooooo#.', '#oo###oo#', '#o#woo#o#', '#o#ooo#o#', '#o#ooo#o#', '#oo###oo#', '.#ooooo#.', '..#####..'] },
    coins: { a: '#f5c542', px: ['.........', '..#####..', '.#owooo#.', '.#######.', '.#ooooo#.', '.#######.', '.#ooooo#.', '.#######.', '.........'] },
    flame: { a: '#ff6a1a', b: '#ffd23f', px: ['....#....', '...#o#...', '...#oo#..', '..#ooo#..', '.#oooyo#.', '.#ooyyo#.', '#ooyyyoo#', '#ooyyyoo#', '.#######.'] },
    heart: { a: '#ff4d6d', px: ['.##...##.', '#oo#.#oo#', '#woooooo#', '#ooooooo#', '.#ooooo#.', '..#ooo#..', '...#o#...', '....#....', '.........'] },
    bolt: { a: '#ffd23f', px: ['....###..', '...#oo#..', '..#oo#...', '.#ooo###.', '.####oo#.', '...#oo#..', '..#oo#...', '..#o#....', '..##.....'] },
    health: { a: '#ff4d6d', px: ['...###...', '...#o#...', '...#o#...', '####o####', '#ooooooo#', '####o####', '...#o#...', '...#o#...', '...###...'] },
    rice: { a: '#f4f4f4', b: '#2f5d3a', px: ['....#....', '...#o#...', '..#ooo#..', '..#ooo#..', '.#ooooo#.', '.#oyyyo#.', '#ooyyyoo#', '#ooyyyoo#', '.#######.'] },
    candy: { a: '#ff7ac6', b: '#ffffff', px: ['..#####..', '.#ooyoo#.', '#ooyoyoo#', '#oyooyoo#', '#ooyyooo#', '.#ooooo#.', '..#####..', '....#....', '....#....'] },
    apple: { a: '#e5383b', b: '#4caf50', px: ['....#yy..', '....#y...', '.###.###.', '#owooooo#', '#woooooo#', '#ooooooo#', '#ooooooo#', '.#oo#oo#.', '..##.##..'] },
    coffee: { a: '#8b5a2b', b: '#f4f4f4', px: ['...#.#...', '..#.#....', '.........', '#######..', '#ooooo###', '#yyyyy#.#', '#yyyyy###', '.#yyy#...', '..###....'] },
    sushi: { a: '#ff8a5b', b: '#f4f4f4', px: ['.........', '.........', '.#######.', '#ooowooo#', '#ooooooo#', '#########', '#yyyyyyy#', '.#######.', '.........'] },
    cake: { a: '#f7c59f', b: '#ff7ac6', px: ['....w....', '....#....', '.#######.', '#yyyyyyy#', '#y#y#y#y#', '#ooooooo#', '#ooooooo#', '#########', '.........'] },
    partyhat: { a: '#7c4dff', b: '#ffd23f', px: ['...yyy...', '....#....', '...#o#...', '...#y#...', '..#ooo#..', '..#yyy#..', '.#ooooo#.', '.#yyyyy#.', '#########'] },
    bow: { a: '#ff4d8d', px: ['.........', '##.....##', '#o#...#o#', '#oo#.#oo#', '#ooo#ooo#', '#oo#.#oo#', '#o#...#o#', '##.....##', '.........'] },
    cap: { a: '#3d7eff', px: ['.........', '.........', '..#####..', '.#owooo#.', '#oowoooo#', '#ooooooo#', '#########', '....#ooo#', '.....####'] },
    beanie: { a: '#26a69a', b: '#f4f4f4', px: ['....#....', '...#y#...', '..#####..', '.#ooooo#.', '#ooooooo#', '#ooooooo#', '#########', '#y#y#y#y#', '#########'] },
    crown: { a: '#ffc93c', b: '#e5383b', px: ['.........', '.........', '#...#...#', '##.###.##', '#o#oyo#o#', '#ooooooo#', '#oyoooyo#', '#########', '.........'] },
    glasses: { a: '#6ecbff', px: ['.........', '.........', '.........', '####.####', '#oo###oo#', '#woo#woo#', '.###.###.', '.........', '.........'] },
    shades: { a: '#3a3f4b', px: ['.........', '.........', '.........', '####.####', '#oo###oo#', '#woo#woo#', '.###.###.', '.........', '.........'] },
    arrows: { a: '#3ddc97', px: ['.........', '..#...#..', '.##...##.', '#o#####o#', '#ooooooo#', '#o#####o#', '.##...##.', '..#...#..', '.........'] },
    bug: { a: '#7cc242', b: '#2f5d3a', px: ['.#.....#.', '..#...#..', '..#####..', '#.#ooo#.#', '.#ooyoo#.', '#.#oyo#.#', '.#ooooo#.', '#.#ooo#.#', '...###...'] },
    umbrella: { a: '#ff7a1a', b: '#ffd23f', px: ['...###...', '.##oyo##.', '#ooyyyoo#', '#########', '....#....', '....#....', '....#....', '..#.#....', '...#.....'] },
    gear: { a: '#9aa4b2', px: ['...#.#...', '.#######.', '.#ooooo#.', '##oo#oo##', '.#o#.#o#.', '##oo#oo##', '.#ooooo#.', '.#######.', '...#.#...'] },
    ball: { a: '#c6e03a', b: '#ffffff', px: ['..#####..', '.#oooyo#.', '#oooyooo#', '#ooyoooo#', '#ooyoooo#', '#oooyooo#', '#ooooyoo#', '.#oooyo#.', '..#####..'] },
    sponge: { a: '#ffd23f', b: '#c9a227', px: ['......w..', '.....w.w.', '.#######.', '#ooyoooo#', '#oooooyo#', '#oyooooo#', '#ooooyoo#', '#########', '.........'] },
    pill: { a: '#ff4d6d', b: '#f4f4f4', px: ['.........', '.........', '.#######.', '#wyyy#oo#', '#yyyy#oo#', '.#######.', '.........', '.........', '.........'] },
    bulb: { a: '#ffd23f', b: '#9aa4b2', px: ['..#####..', '.#ooooo#.', '#oowoooo#', '#ooooooo#', '.#ooooo#.', '..#ooo#..', '..#yyy#..', '..#yyy#..', '...###...'] },
    bag: { a: '#ff7ac6', px: ['...###...', '..#...#..', '.#######.', '.#ooooo#.', '.#ooooo#.', '#ooowooo#', '#ooooooo#', '#ooooooo#', '#########'] },
    camera: { a: '#9aa4b2', b: '#3d7eff', px: ['.........', '..###....', '.#######.', '#oo###oo#', '#o#yyy#o#', '#o#ywy#o#', '#o#yyy#o#', '#oo###oo#', '.#######.'] },
    floppy: { a: '#3d7eff', b: '#f4f4f4', px: ['#######..', '#oyyy#o#.', '#oyyy#oo#', '#ooooooo#', '#ooooooo#', '#o#####o#', '#o#yyy#o#', '#o#yyy#o#', '#########'] },
    folder: { a: '#ffc93c', px: ['.........', '####.....', '#ooo####.', '#########', '#ooooooo#', '#owooooo#', '#ooooooo#', '#########', '.........'] },
    window: { a: '#3d7eff', px: ['#########', '#ooooooo#', '#########', '#wwwwwww#', '#wwwwwww#', '#wwwwwww#', '#wwwwwww#', '#########', '.........'] },
    book: { a: '#7c4dff', b: '#f4f4f4', px: ['.#######.', '#ooooooo#', '#oyyyyoo#', '#ooooooo#', '#oyyyooo#', '#ooooooo#', '#ooooooo#', '#wwwwwww#', '.#######.'] },
    egg: { a: '#fff5e0', b: '#ff9f1c', px: ['...###...', '..#ooo#..', '.#oooyo#.', '.#ooooo#.', '#oyoooyo#', '#ooooooo#', '#oooyooo#', '.#ooooo#.', '..#####..'] },
    chick: { a: '#ffd23f', b: '#ff9f1c', px: ['...###...', '..#ooo#..', '.#o#o#o#.', '.#ooyoo#.', '#ooooooo#', '#w#w#w#w#', '#wwwwwww#', '.#wwwww#.', '..#####..'] },
    x: { a: '#ff4d6d', px: ['##.....##', '#o#...#o#', '.#o#.#o#.', '..#o#o#..', '...#o#...', '..#o#o#..', '.#o#.#o#.', '#o#...#o#', '##.....##'] },
    star: { a: '#ffd23f', px: ['....#....', '...#o#...', '...#o#...', '####o####', '#oooooow#', '.#ooooo#.', '..#ooo#..', '.#oo#oo#.', '.##...##.'] },
    trophy: { a: '#ffc93c', px: ['#########', '#owooooo#', '##ooooo##', '.#ooooo#.', '..#ooo#..', '...#o#...', '...#o#...', '..#####..', '.#######.'] },
    keyboard: { a: '#c8cdd6', px: ['.........', '.........', '#########', '#o#o#o#o#', '#########', '#o#ooo#o#', '#########', '.........', '.........'] },
    ship: { a: '#e5383b', b: '#f4f4f4', px: ['....#....', '....#y...', '....#yy..', '....#yyy.', '....#....', '#########', '.#ooooo#.', '..#####..', '.........'] },
    box: { a: '#c68642', px: ['.........', '.#######.', '#ooo#ooo#', '#########', '#ooo#ooo#', '#owo#ooo#', '#ooo#ooo#', '#########', '.........'] },
    check: { a: '#3ddc97', px: ['.........', '.......#.', '......#o#', '.#...#o#.', '#o#.#o#..', '.#o#o#...', '..#o#....', '...#.....', '.........'] },
    light: { a: '#3ddc97', px: ['..#####..', '.#ooooo#.', '#oowoooo#', '#ooooooo#', '#ooooooo#', '#ooooooo#', '.#ooooo#.', '..#####..', '.........'] },
    tophat: { a: '#3a3f4b', b: '#e5383b', px: ['.........', '..#####..', '..#owo#..', '..#ooo#..', '..#ooo#..', '..#yyy#..', '#########', '.........', '.........'] },
    moon: { a: '#ffe08a', px: ['..####...', '.#oo#....', '#oo#.....', '#oo#.....', '#oo#.....', '#ooo#....', '.#ooo####', '..######.', '.........'] },
    sun: { a: '#ffd23f', px: ['....#....', '.#.....#.', '...###...', '..#ooo#..', '#.#owo#.#', '..#ooo#..', '...###...', '.#.....#.', '....#....'] },
    shield: { a: '#3d7eff', b: '#f4f4f4', px: ['#########', '#oooyooo#', '#oooyooo#', '#yyyyyyy#', '#oooyooo#', '.#ooyoo#.', '..#oyo#..', '...#y#...', '....#....'] },
    tree: { a: '#3ddc97', b: '#c68642', px: ['...###...', '..#ooo#..', '.#oowoo#.', '#ooooooo#', '#ooooooo#', '.###y###.', '...#y#...', '...#y#...', '..#####..'] },
    orb: { a: '#b388ff', b: '#c68642', px: ['..#####..', '.#owooo#.', '#oowoooo#', '#ooooooo#', '#ooooooo#', '.#ooooo#.', '..#####..', '.#yyyyy#.', '#########'] },
    grave: { a: '#9aa4b2', b: '#3ddc97', px: ['..#####..', '.#ooooo#.', '#ooo#ooo#', '#oo###oo#', '#ooo#ooo#', '#ooo#ooo#', '#ooooooo#', '#########', '#yyyyyyy#'] },
    home: { a: '#ff8a5b', b: '#8b5a2b', px: ['....#....', '...#o#...', '..#ooo#..', '.#ooooo#.', '#########', '.#wwyww#.', '.#wwyww#.', '.#wwyww#.', '.#######.'] },
    sparkle: { a: '#ffd23f', px: ['....#....', '...#o#...', '...#o#...', '.##ooo##.', '#oooowoo#', '.##ooo##.', '...#o#...', '...#o#...', '....#....'] },
    catEars: { a: '#ff9f1c', b: '#ff7ac6', px: ['.........', '#.......#', '##.....##', '#y#...#y#', '#yy###yy#', '#ooooooo#', '#########', '.........', '.........'] },
    chef: { a: '#f4f4f4', px: ['..#.#.#..', '.#o#o#o#.', '#ooooooo#', '#owooooo#', '.#ooooo#.', '.#ooooo#.', '.#######.', '.........', '.........'] },
    wizard: { a: '#7c4dff', b: '#ffd23f', px: ['....#....', '...#o#...', '...#oy#..', '..#ooo#..', '..#oyo#..', '.#ooooo#.', '.#oooyo#.', '#########', '.........'] },
    halo: { a: '#ffd23f', px: ['.........', '.........', '.#######.', '#ooooooo#', '#o.....o#', '#ooooooo#', '.#######.', '.........', '.........'] },
    monocle: { a: '#6ecbff', b: '#ffd23f', px: ['.........', '...###...', '..#ooo#..', '..#owo#..', '..#ooo#..', '...###...', '.....y...', '......y..', '.......y.'] },
    mask: { a: '#3a3f4b', px: ['.........', '.........', '#########', '#o..o..o#', '#ooooooo#', '#########', '.........', '.........', '.........'] },
    keeper: { a: '#c68642', b: '#ffd23f', px: ['..#####..', '#########', '.#.....#.', '.#.#.#.#.', '.#.###.#.', '..#.y.#..', '#########', '#y.....y#', '#########'] },
    galactic: { a: '#5ff3ff', b: '#e9e7ff', px: ['..#####..', '.#yyyyy#.', '#yy###yy#', '#y#ooo#y#', '#y#ooo#y#', '#yy###yy#', '.#yyyyy#.', '..#####..', '.........'] },
    mainframe: { a: '#39ff6a', b: '#0c3d18', px: ['#########', '#yyyyyyy#', '#yoyyyyy#', '#yyoyyyy#', '#yoyyooy#', '#yyyyyyy#', '#########', '...###...', '.#######.'] },
    abyss: { a: '#c68642', b: '#7fd0ff', px: ['..#####..', '.#ooooo#.', '#oo###oo#', '#o#yyy#o#', '#o#ywy#o#', '#o#yyy#o#', '#oo###oo#', '.#ooooo#.', '#########'] },
    manor: { a: '#ff8c1a', b: '#2f5d3a', px: ['....y....', '...yy....', '.##ooo##.', '#o#ooo#o#', '#ooooooo#', '#oo###oo#', '#ooooooo#', '.#######.', '.........'] },
    frostbyte: { a: '#7fd0ff', px: ['....o....', '.o..o..o.', '..o.o.o..', '...ooo...', 'ooooooooo', '...ooo...', '..o.o.o..', '.o..o..o.', '....o....'] },
    sakura: { a: '#ff9fc2', b: '#c9971c', px: ['...###...', '..#ooo#..', '.##ooo##.', '#oo#y#oo#', '#ooyyyoo#', '#oo#y#oo#', '.##ooo##.', '..#ooo#..', '...###...'] },
    ramen: { a: '#f4e2b8', b: '#e5383b', px: ['......##.', '....##...', '#########', '#ooooooo#', '#owowowo#', '#########', '.#yyyyy#.', '..#yyy#..', '...###...'] },
    pizza: { a: '#ffd23f', b: '#e5383b', px: ['#########', '#oyoooyo#', '.#ooyoo#.', '.#ooooo#.', '..#oyo#..', '..#ooo#..', '...#o#...', '....#....', '.........'] },
    salad: { a: '#4caf50', b: '#e5383b', px: ['.........', '.#o#o#y#.', '#oyoooyo#', '#########', '#wwwwwww#', '.#wwwww#.', '..#####..', '.........', '.........'] },
    soup: { a: '#ffd23f', b: '#c68642', px: ['...#.#...', '..#.#....', '#########', '#ooooooo#', '#yyyyyyy#', '.#yyyyy#.', '..#####..', '.........', '.........'] },
    bento: { a: '#e5383b', b: '#f4f4f4', px: ['#########', '#ooooooo#', '#########', '#yyy#oyo#', '#yyy#yoy#', '#########', '#oyo#yyy#', '#yoy#yyy#', '#########'] },
    taco: { a: '#ffc93c', b: '#4caf50', px: ['.........', '...###...', '.##yyy##.', '#yyyyyyy#', '#ooooooo#', '#ooooooo#', '.#######.', '.........', '.........'] },
    popcorn: { a: '#fff5e0', b: '#e5383b', px: ['..##.##..', '.#oo#oo#.', '#ooooooo#', '#########', '#ywywywy#', '#ywywywy#', '.#ywywy#.', '.#######.', '.........'] },
    tea: { a: '#7cc242', b: '#f4f4f4', px: ['...#.#...', '..#.#....', '#######..', '#ooooo###', '#yyyyy#.#', '#yyyyy###', '.#yyy#...', '..###....', '.........'] },
    smoothie: { a: '#ff7ac6', px: ['......#..', '.....#...', '.#######.', '.#ooooo#.', '.#owooo#.', '..#ooo#..', '..#ooo#..', '..#####..', '.........'] },
    energyDrink: { a: '#3d7eff', b: '#ffd23f', px: ['..#####..', '.#ooooo#.', '.#ooyoo#.', '.#oyyoo#.', '.#ooyyo#.', '.#oooyo#.', '.#ooooo#.', '..#####..', '.........'] },
    donut: { a: '#ff7ac6', b: '#c68642', px: ['..#####..', '.#ooooo#.', '#oow#ooo#', '#oo#.#oo#', '#oo#.#oo#', '#yyy#yyy#', '.#yyyyy#.', '..#####..', '.........'] },
    cookie: { a: '#d9a066', b: '#5a3a1e', px: ['..#####..', '.#ooooo#.', '#oyooyoo#', '#ooooooo#', '#ooyoooy#', '#oooyooo#', '.#ooooo#.', '..#####..', '.........'] },
    lock: { a: '#ffd23f', px: ['..#####..', '.#.....#.', '.#.....#.', '#########', '#ooooooo#', '#ooo#ooo#', '#oo###oo#', '#ooooooo#', '#########'] },
    rocket: { a: '#ff6a1a', b: '#e8e8ee', px: ['....#....', '...#y#...', '..#yyy#..', '..#yoy#..', '..#yyy#..', '.##yyy##.', '#o#yyy#o#', '##.###.##', '...#o#...'] },
    layers: { a: '#3d7eff', b: '#3ddc97', px: ['.........', '...###...', '..#ooo#..', '..#####..', '.#yyyyy#.', '.#######.', '#ooooooo#', '#########', '.........'] },
    duck: { a: '#ffd23f', b: '#ff9f1c', px: ['...###...', '..#ooo#..', '..#o#oyy.', '..#ooo#..', '.##ooo##.', '#ooooooo#', '#owooooo#', '.#ooooo#.', '..#####..'] },
    tomato: { a: '#e5383b', b: '#4caf50', px: ['...#y#...', '..#yyy#..', '.#######.', '#ooowooo#', '#owoooooo', '#ooooooo#', '#ooooooo#', '.#ooooo#.', '..#####..'] },
    scroll: { a: '#f4e2b8', b: '#c68642', px: ['.#######.', '#yoooooy#', '#o#####o#', '#ooooooo#', '#o###o#o#', '#ooooooo#', '#o####oo#', '#yoooooy#', '.#######.'] },
    team: { a: '#3ddc97', b: '#6ecbff', px: ['.........', '.###.....', '#ooo#.###', '#o#o#yyy#', '#ooo#y#y#', '.###.yyy#', '#ooooyyy#', '#ooo#yyy#', '#####.###'] },
    code: { a: '#6ecbff', px: ['.........', '..#...#..', '.#o#.#o#.', '#o#...#o#', '.#o#.#o#.', '..#...#..', '.........', '.........', '.........'] },
    gift: { a: '#ff4d8d', b: '#ffd23f', px: ['.##...##.', '#oo#.#oo#', '#########', '#yyyyyyy#', '#########', '#ooo#ooo#', '#ooo#ooo#', '#ooo#ooo#', '#########'] },
    chart: { a: '#3d7eff', b: '#3ddc97', px: ['#........', '#....###.', '#....#y#.', '#.##.#y#.', '#.#o.#y#.', '#.#o.#y#.', '#.#o.#y#.', '#.#o.#y#.', '#########'] },
    // ---- wardrobe ----
    headphones: { a: '#3a3f4b', b: '#ff4d6d', px: ['..#####..', '.#.....#.', '#.......#', '#.......#', '##.....##', '#o#...#o#', '#o#...#o#', '#y#...#y#', '.#.....#.'] },
    propeller: { a: '#e5383b', b: '#ffd23f', px: ['#yy.#.yy#', '.###o###.', '....#....', '..#####..', '.#ooooo#.', '#ooyoyoo#', '#ooooooo#', '#########', '.........'] },
    pirate: { a: '#3a3f4b', b: '#f4f4f4', px: ['....#....', '...#o#...', '..#ooo#..', '.#ooyoo#.', '#oooyooo#', '#oyyyyyo#', '#ooooooo#', '.#######.', '.........'] },
    flowerCrown: { a: '#ff9fc2', b: '#4caf50', px: ['.........', '.#.....#.', '#o#.#.#o#', '#oo#o#oo#', '.#yyyyy#.', '..#y#y#..', '...###...', '.........', '.........'] },
    viking: { a: '#9aa4b2', b: '#f4f4f4', px: ['#.......#', '#y.....y#', '#y#...#y#', '.##ooo##.', '.#ooooo#.', '#ooowooo#', '#ooooooo#', '#########', '.........'] },
    antenna: { a: '#9aa4b2', b: '#ff4d6d', px: ['...#y#...', '..#yyy#..', '...#y#...', '....#....', '....#....', '...#o#...', '.#######.', '#ooooooo#', '.#######.'] },
    eyepatch: { a: '#3a3f4b', px: ['.........', '#.......#', '.##...##.', '...###...', '..#ooo#..', '..#ooo#..', '..#ooo#..', '...###...', '.........'] },
    mustache: { a: '#5a3a1e', px: ['.........', '.........', '.........', '.##...##.', '#oo#.#oo#', '#ooo#ooo#', '.#ooooo#.', '..##.##..', '.........'] },
    heartGlasses: { a: '#ff4d6d', b: '#ffffff', px: ['.........', '.##...##.', '#oo#.#oo#', '#ooo#ooo#', '#wo#.#wo#', '.#o#.#o#.', '..#...#..', '.........', '.........'] },
    mug: { a: '#f4f4f4', b: '#8b5a2b', px: ['.........', '.........', '######...', '#yyyy##..', '#yyyy#o#.', '#yyyy#o#.', '#yyyy##..', '#oooo#...', '######...'] },
    laptop: { a: '#9aa4b2', b: '#3d7eff', px: ['.........', '.#######.', '.#yyyyy#.', '.#yyyyy#.', '.#ywyyy#.', '.#######.', '#ooooooo#', '#########', '.........'] },
    balloon: { a: '#e5383b', b: '#f4f4f4', px: ['..#####..', '.#ooooo#.', '#oowoooo#', '#ooooooo#', '.#ooooo#.', '..#ooo#..', '...###...', '....#....', '...#.....'] },
    flag: { a: '#e5383b', b: '#f4f4f4', px: ['#######..', '#oooooo#.', '#oyyooo#.', '#oooooo#.', '#######..', '#........', '#........', '#........', '#........'] },
    duckProp: { a: '#ffd23f', b: '#ff9f1c', px: ['...###...', '..#ooo#..', '..#o#oyy.', '..#ooo#..', '.##ooo##.', '#ooooooo#', '#owooooo#', '.#ooooo#.', '..#####..'] },
    // ---- food and items ----
    burrito: { a: '#f4e2b8', b: '#4caf50', px: ['.........', '....###..', '...#ooo#.', '..#oyyo#.', '.#oyooo#.', '#oooyo#..', '#oooo#...', '.####....', '.........'] },
    curry: { a: '#ff9f1c', b: '#f4f4f4', px: ['....#.#..', '...#.#...', '.#######.', '#ooyyooo#', '#oyyyyoo#', '#ooyyooo#', '.#######.', '..#####..', '.........'] },
    pancakes: { a: '#d9a066', b: '#ffd23f', px: ['.........', '....y....', '...yyy...', '.#######.', '#ooooooo#', '.#######.', '#ooooooo#', '.#######.', '#########'] },
    boba: { a: '#d9a066', b: '#3a3f4b', px: ['.....#...', '....#....', '#########', '#ooooooo#', '#ooooooo#', '.#oyoyo#.', '.#yoyoy#.', '..#yyy#..', '...###...'] },
    mochi: { a: '#ff9fc2', b: '#f4f4f4', px: ['.........', '...###...', '..#ooo#..', '.#ooyoo#.', '#ooyyyoo#', '#oooyooo#', '.#ooooo#.', '..#####..', '.........'] },
    goldenRice: { a: '#ffd23f', b: '#f4f4f4', px: ['....w....', '...#o#...', '..#ooo#..', '.#ooooo#.', '.#owooo#.', '#oooyyoo#', '#ooyyyyo#', '#ooyyyyo#', '.#######.'] },
    clover: { a: '#4caf50', b: '#2f5d3a', px: ['.##...##.', '#oo#.#oo#', '#ooo#ooo#', '.#ooooo#.', '#ooo#ooo#', '#oo#y#oo#', '.##.y.##.', '....y....', '...y.....'] },
    // ---- games ----
    snake: { a: '#4caf50', b: '#ff4d6d', px: ['.........', '#######..', '#ooooo#..', '#####o#..', '....#o#..', '.####o#..', '.#ooo##..', '.#####.y.', '.........'] },
    pipe: { a: '#4caf50', b: '#ffd23f', px: ['###...###', '#o#...#o#', '#o#.y.#o#', '###.yy###', '....yyy..', '###.yy###', '#o#.y.#o#', '#o#...#o#', '###...###'] },
    bricks: { a: '#e5383b', b: '#ffd23f', px: ['#########', '#ooo#ooo#', '#########', '##ooo#oo#', '#########', '#ooo#ooo#', '#########', '....y....', '..#####..'] },
    paddle: { a: '#3d7eff', b: '#ffd23f', px: ['#.......#', '#o......#', '#o..y...#', '#o.....o#', '#o.....o#', '#......o#', '#......o#', '#.......#', '.........'] },
    bisect: { a: '#ff6a1a', b: '#4caf50', px: ['....#....', '...#y#...', '....#....', '....#....', '..#####..', '.#.....#.', '#y#...#o#', '.#.....#.', '.........'] },
    regex: { a: '#b388ff', b: '#ffffff', px: ['.........', '.#.....#.', '#o#...#o#', '#o#.#.#o#', '#o#.o.#o#', '#o#.#.#o#', '#o#...#o#', '.#.....#.', '.........'] },
    bigo: { a: '#3ddc97', b: '#ffffff', px: ['#........', '#.......o', '#......o.', '#.....o..', '#....o...', '#...o....', '#.oo.....', '#o.......', '#########'] },
    // ---- expeditions, artefacts, misc ----
    map: { a: '#f4e2b8', b: '#e5383b', px: ['#########', '#ooo#ooo#', '#oo#oooo#', '#oo#ooyo#', '#ooo#oyo#', '#oooo#oo#', '#ooooo#o#', '#ooo#ooo#', '#########'] },
    cloud: { a: '#f4f4f4', b: '#6ecbff', px: ['.........', '...###...', '..#ooo#..', '.#ooooo##', '#ooowooo#', '#ooooooo#', '#ooooooo#', '.#######.', '.........'] },
    chip: { a: '#3a3f4b', b: '#ffd23f', px: ['.#.#.#.#.', '#########', '#ooooooo#', '#oyyyyyo#', '#oyy#yyo#', '#oyyyyyo#', '#ooooooo#', '#########', '.#.#.#.#.'] },
    semicolon: { a: '#ffd23f', px: ['.........', '...###...', '...#o#...', '...###...', '.........', '...###...', '...#o#...', '..##o#...', '..#.#....'] },
    packet: { a: '#6ecbff', b: '#ffd23f', px: ['.........', '.#######.', '#ooooooo#', '#o#####o#', '#o#yyy#o#', '#o#yyy#o#', '#o#####o#', '#ooooooo#', '.#######.'] },
    shard: { a: '#b388ff', b: '#ffffff', px: ['....#....', '...#o#...', '..#woo#..', '..#ooo#..', '..#ooo#..', '.#ooooo#.', '.#ooooo#.', '..#ooo#..', '...###...'] },
    key: { a: '#ffd23f', px: ['.........', '..###....', '.#ooo#...', '.#o#o#...', '.#ooo#...', '..#o#....', '...#o#...', '....#o##.', '.....###.'] },
    loop: { a: '#ff6a1a', b: '#ffd23f', px: ['..#####..', '.#ooooo#.', '#o#...#o#', '#o#...##.', '#o#..#o##', '#o#.#ooo#', '.#..#####', '.........', '.........'] },
    compass: { a: '#f4f4f4', b: '#e5383b', px: ['..#####..', '.#ooooo#.', '#ooo#ooo#', '#oo#y#oo#', '#o#yyy#o#', '#oo#y#oo#', '#ooo#ooo#', '.#ooooo#.', '..#####..'] },
    flask: { a: '#3ddc97', b: '#f4f4f4', px: ['...###...', '...#y#...', '...#y#...', '..#yyy#..', '..#yyy#..', '.#yoooy#.', '#ooooooo#', '#ooooooo#', '.#######.'] },
    plant: { a: '#4caf50', b: '#c68642', px: ['..#...#..', '.#o#.#o#.', '.#oo#oo#.', '..#ooo#..', '...#o#...', '..#####..', '..#yyy#..', '..#yyy#..', '...###...'] },
  };

  const OUTLINE = '#1b1b24';
  const W_COLOR = '#ffffff';

  /** Build one SVG path per colour: each pixel becomes a 1x1 square. */
  function paths(name) {
    const icon = I[name];
    if (!icon) return null;
    if (icon.cache) return icon.cache;
    const by = { '#': '', o: '', y: '', w: '', halo: '' };
    const solid = (x, y) => y >= 0 && y < 9 && x >= 0 && x < 9 && icon.px[y][x] !== '.';
    icon.px.forEach((row, y) => [...row].forEach((c, x) => { if (by[c] !== undefined) by[c] += `M${x} ${y}h1v1h-1z`; }));
    // Sticker halo: every empty pixel (including a 1px margin) that touches the silhouette.
    for (let y = -1; y <= 9; y++) {
      for (let x = -1; x <= 9; x++) {
        if (solid(x, y)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (solid(x + dx, y + dy)) { near = true; break; }
        if (near) by.halo += `M${x} ${y}h1v1h-1z`;
      }
    }
    return (icon.cache = by);
  }

  /** Inline SVG markup for an icon (safe: names come from this file, never from user input). */
  function pxIcon(name, cls = '') {
    const p = paths(name);
    if (!p) return '';
    const icon = I[name];
    const fill = [['o', icon.a], ['y', icon.b || W_COLOR], ['w', W_COLOR], ['#', OUTLINE]]
      .filter(([k]) => p[k]).map(([k, c]) => `<path fill="${c}" d="${p[k]}"/>`).join('');
    // The halo is coloured by CSS (.px-halo) so it only shows on dark and high-contrast themes.
    return `<svg class="px ${cls}" viewBox="-1 -1 11 11" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path class="px-halo" d="${p.halo}"/>${fill}</svg>`;
  }

  /** Draw an icon onto a 2D canvas. */
  function drawPxIcon(ctx, name, x, y, scale) {
    const icon = I[name];
    if (!icon) return;
    const colors = { '#': OUTLINE, o: icon.a, y: icon.b || W_COLOR, w: W_COLOR };
    icon.px.forEach((row, yy) => [...row].forEach((c, xx) => {
      if (!colors[c]) return;
      ctx.fillStyle = colors[c];
      ctx.fillRect(x + xx * scale, y + yy * scale, scale, scale);
    }));
  }

  // Emoji in host-sent messages → our icons, so speech bubbles match the rest of the UI.
  const EMOJI = {
    '🪙': 'coin', '🔥': 'flame', '🚢': 'ship', '🐣': 'chick', '✨': 'sparkle', '🤒': 'health', '🪦': 'grave', '✅': 'check',
    '🎉': 'star', '🏖️': 'umbrella', '🏖': 'umbrella', '🥚': 'egg', '⚡': 'bolt', '🌙': 'moon', '☀️': 'sun', '☀': 'sun', '🍣': 'sushi',
    '🎂': 'cake', '🍙': 'rice', '🐛': 'bug', '💊': 'pill', '🏆': 'trophy', '💖': 'heart', '🎾': 'ball', '🧽': 'sponge',
    '🍬': 'candy', '🍎': 'apple', '☕': 'coffee', '🍰': 'cake', '👑': 'crown', '🎀': 'bow', '🧢': 'cap', '🥳': 'partyhat',
    '🧶': 'beanie', '👓': 'glasses', '🕶️': 'shades', '🕶': 'shades', '💡': 'bulb', '🌿': 'tree', '🏡': 'home',
    '🧭': 'compass', '🧋': 'boba', '🌯': 'burrito', '🍛': 'curry', '🥞': 'pancakes', '🍡': 'mochi', '🦆': 'duck', '🧪': 'flask',
    '🪴': 'plant', '🐍': 'snake', '🏓': 'paddle', '🍜': 'ramen', '🍕': 'pizza', '🌮': 'taco', '🍩': 'donut', '🍪': 'cookie', '🍵': 'tea', '🥤': 'smoothie',
  };
  const keys = Object.keys(EMOJI).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const EMOJI_RE = new RegExp(keys.join('|'), 'g');

  /** Escape text, then swap known emoji for pixel icons. */
  function richText(text) {
    const esc = String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    return esc.replace(EMOJI_RE, m => pxIcon(EMOJI[m], 'inline'));
  }

  // @ts-ignore
  window.PX = { icons: I, pxIcon, drawPxIcon, richText, EMOJI };
})();
