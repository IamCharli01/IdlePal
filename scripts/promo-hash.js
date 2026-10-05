// Prints the hash to paste into PROMOS in src/core/catalog.js for a new promo code.
// Usage: node scripts/promo-hash.js "MY-CODE"   (codes are case- and punctuation-insensitive)
'use strict';
const { hashCode, normalizeCode } = require('../src/core/promo');
const code = process.argv[2];
if (!code) { console.error('Usage: node scripts/promo-hash.js "MY-CODE"'); process.exit(1); }
console.log(`code:       ${normalizeCode(code)}`);
console.log(`hash:       ${hashCode(code)}`);
