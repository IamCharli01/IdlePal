'use strict';
// Promo codes unlock Vault items. Only a salted SHA-256 of each code ships in the extension,
// so codes can't be read out of the source. (It runs on the user's machine, so this protects
// the code from casual discovery, not from someone patching their own install: fine for cosmetics.)
const crypto = require('crypto');
const { PROMOS, ACCESSORIES } = require('./catalog');

const SALT = 'idlepal:promo:v1:';

/** "abcd-12 34 " -> "ABCD1234" */
function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(SALT + normalizeCode(code)).digest('hex');
}

/**
 * Try to redeem a code. Never reveals whether a code "almost" matched.
 * @returns {{ok: boolean, message: string, promo?: string, unlock?: string, anim?: string}}
 */
function redeem(save, code, now) {
  const n = normalizeCode(code);
  if (n.length < 4) return { ok: false, message: 'That code is too short.' };
  const h = hashCode(n);
  const entry = Object.entries(PROMOS).find(([, p]) => p.hash === h);
  if (!entry) return { ok: false, message: 'That code isn\'t valid. Check the spelling, or it may have expired.' };
  const [id, p] = entry;
  if (p.expires && now > p.expires) return { ok: false, message: 'That code has expired.' };
  if (save.promos[id]) return { ok: false, message: 'You\'ve already redeemed that code.' };
  save.promos[id] = now;
  const item = ACCESSORIES[p.unlock];
  save.owned[p.unlock] = true;
  return { ok: true, promo: id, unlock: p.unlock, message: `🔓 Code accepted! ${item.name} is out of the Vault and yours to equip.`, anim: 'sparkle' };
}

module.exports = { normalizeCode, hashCode, redeem, SALT };
