// Readings guessed for a relationship type with none declared, from the type's own words (graph_rules.guess_readings).
'use strict';

// undeclared (a draft): the type's own words.
// ── Readings guessed for a type with none declared ──────────────────────────────────────────────────────────────
// Forward and reverse. They come from the type's own words, as the lock writes them for checking (vault task of 6 Oct
// 2026). The rules are those of graph_rules.guess_readings, held to one table: test/reading-cases.json.
const IRREGULAR = {
  chose: 'was chosen by',
  made: 'was made by',
  wrote: 'was written by',
  took: 'was taken by',
  gave: 'was given by',
  has: 'belongs to',
  had: 'belonged to',
  is: 'is',
  leads: 'is led by',
  holds: 'is held by',
  sent: 'was sent by',
  paid: 'was paid by',
  built: 'was built by',
  found: 'was found by',
  met: 'was met by',
  led: 'was led by',
};
// a passive reading that reverses to its active verb: only where the verb is known, so never a wrong guess
const ACTIVE = {
  proved: 'proves',
  cited: 'cites',
  decided: 'decides',
  owned: 'owns',
  caused: 'causes',
  supported: 'supports',
  written: 'writes',
  made: 'makes',
  chosen: 'chooses',
  approved: 'approves',
  funded: 'funds',
  used: 'uses',
  required: 'requires',
  replaced: 'replaces',
  blocked: 'blocks',
  led: 'leads',
  held: 'holds',
};
const NAMED = { 'part of': ['is part of', 'contains'], 'decided in': ['was decided in', 'decides'] };
const PREPOSITIONS = new Set([
  'by',
  'of',
  'in',
  'on',
  'to',
  'from',
  'with',
  'for',
  'at',
  'into',
  'about',
  'against',
  'under',
  'over',
]);
const participle = (w) => /(ed|en)$/.test(w) || w in ACTIVE;
/** The reverse of a forward reading: the active verb of a known passive, the passive of a verb, or a placeholder. */
function reverseReading(reading) {
  const named = Object.values(NAMED).find(([forward]) => forward === reading);
  if (named) return named[1];
  const words = reading.split(' ');
  const passive = /^(is|was) (\w+) (\w+)$/.exec(reading);
  if (passive && PREPOSITIONS.has(passive[3]))
    return passive[3] === 'by' && ACTIVE[passive[2]] ? ACTIVE[passive[2]] : `inverse of ${reading}`;
  const [first = '', ...rest] = words,
    tail = rest.length ? ' ' + rest.join(' ') : '';
  if (first in IRREGULAR && !(IRREGULAR[first].endsWith(' by') && rest[rest.length - 1] === 'by'))
    return IRREGULAR[first].endsWith(' by') ? IRREGULAR[first].replace(/ by$/, tail + ' by') : IRREGULAR[first] + tail;
  if (!first.endsWith('s') || first.endsWith('ss') || first.length < 3 || rest[rest.length - 1] === 'by')
    return `inverse of ${reading}`;
  const base = first.slice(0, -1),
    done = base.endsWith('e') ? base + 'd' : /[^aeiou]y$/.test(base) ? base.slice(0, -1) + 'ied' : base + 'ed';
  return `is ${done}${tail} by`;
}
/** The readings guessed for a relationship type with none declared: [forward, reverse]. */
function guessReadings(type) {
  const words = type.replace(/_/g, ' ').toLowerCase().trim().replace(/^is /, '');
  if (NAMED[words]) return [...NAMED[words]];
  const parts = words.split(' ');
  const forward =
    parts.length > 1 && participle(parts[0]) && PREPOSITIONS.has(parts[parts.length - 1])
      ? `is ${words}`
      : type.replace(/_/g, ' ').toLowerCase().trim();
  return [forward, reverseReading(forward)];
}

module.exports = { reverseReading, guessReadings };
