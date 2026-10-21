// Named hashes (editor spec §51, spec_hashes_named; requirements/hashes.md). A hash is written with its algorithm's
// name, from the IANA registry RFC 6920 uses. That is `sha-256-64:` then 16 hex digits, or `sha-256:` then 64. An
// `ni:` id names its algorithm already. A bare string of digits does not say how it was made, so it is refused.
'use strict';

// each name the check knows, and how many hex digits it has
const ALGORITHMS = { 'sha-256-64': 16, 'sha-256': 64 };
const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/;
// the rule's label in a check's results
const NAMED_RULE = 'every hash names its algorithm: sha-256-64: or sha-256: before its digits (editor spec §51)';

// a hash written with its algorithm's name: sha-256-64 for 16 digits, sha-256 for 64
const named = (digits) => (digits.length === 64 ? 'sha-256:' : 'sha-256-64:') + digits;
// whether v is a hash that names an algorithm the check knows, with the right number of digits for it
function isNamed(v) {
  if (typeof v !== 'string') return false;
  if (NI.test(v)) return true;
  const at = v.indexOf(':'),
    want = ALGORITHMS[v.slice(0, at)];
  return at > 0 && want !== undefined && new RegExp(`^[0-9a-f]{${want}}$`).test(v.slice(at + 1));
}
// the digits of a hash, its algorithm's name taken off; a bare hash is its own digits, so it still compares
const digitsOf = (v) => (typeof v === 'string' && /^sha-256(-64)?:/.test(v) ? v.slice(v.indexOf(':') + 1) : v);
// The hashes the graph spec writes that graph g holds and that name no algorithm, as [where, value] pairs. They are
// content_hash on a node and hash on a link.
function unnamedHashes(g) {
  const bad = [];
  for (const [id, [, p]] of g.nodes)
    if (p.content_hash !== undefined && !isNamed(p.content_hash)) bad.push([id, p.content_hash]);
  for (const [s, t, d, p] of g.edges)
    if (p.hash !== undefined && !isNamed(p.hash)) bad.push([`${s} ${t} ${d}`, p.hash]);
  return bad;
}

module.exports = { ALGORITHMS, NAMED_RULE, named, isNamed, digitsOf, unnamedHashes };
