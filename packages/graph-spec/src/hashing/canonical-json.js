// RFC 8785 canonical JSON, and the short hashes made from it (rule:basis-hash@1).
'use strict';

const { isTime, norm } = require('../values/times.js');
const { sha256hex } = require('./sha256.js');

// A value as RFC 8785 canonical JSON, the same text in every language: keys sorted, a date or instant as its text,
// undefined as null. Throws for NaN and infinity, which RFC 8785 has no way to write.
function jcs(v) {
  if (v === null || v === undefined) return 'null';
  if (isTime(v)) return JSON.stringify(v.s);
  if (typeof v === 'boolean' || typeof v === 'number') {
    if (typeof v === 'number' && !isFinite(v)) throw new Error('RFC 8785 has no NaN or infinity');
    return JSON.stringify(v);
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + jcs(v[k]))
      .join(',') +
    '}'
  );
}
// The first 16 hex digits of the SHA-256 of a value's canonical JSON.
const hash16 = (o) => sha256hex(jcs(o)).slice(0, 16);
// rule:basis-hash@1: hash16 of only the properties a judgement read, named in reads, comma-separated. One it
// lacks counts as null, and a date or instant as its text.
const basisHash = (props, reads) => {
  const o = {};
  reads
    .split(',')
    .map((x) => x.trim())
    .forEach((k) => {
      o[k] = norm(props[k] === undefined ? null : props[k]);
    });
  return hash16(o);
};

module.exports = { jcs, hash16, basisHash };
