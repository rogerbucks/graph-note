// The names of a graph kept up to date as names are added (editor spec §4; spec §9, layout_contained: never freeze): the
// style and the names a NameBook gives are those the old nameStyleOf and nameFromText gave from all the names at once —
// proved against them, kept here as the oracle, on random graphs of names and kinds.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NameBook } from '../src/name-book.ts';
import { nameFromText, nameStyleOf, nameWords } from '../src/name-suggestions.ts';

// ── the oracle: nameStyleOf and nameFromText as they were before (10 Oct 2026), every name counted for each ──
const CASINGS = [
  ['snake', /^[a-z0-9]+(_[a-z0-9]+)+$/],
  ['camel', /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/],
  ['pascal', /^([A-Z][a-z0-9]+){2,}$/],
];
const RESERVED = new Set(
  'insert match set date datetime true false null where return graph id create delete detach merge remove optional as from order by limit offset skip filter let for yield call select and or not xor in is exists node edge union case when then else end use asc desc distinct group having unknown'.split(
    ' ',
  ),
);
const SMALL = new Set(['a', 'an', 'the', 'of', 'to', 'be', 'or', 'and', 'for', 'in', 'on', 'at', 'by', 'with', 'is']);
const wordsOfName = (name) =>
  name
    .replace(/_\d+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
function startsWithKind(name, kind) {
  const k = kind.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!k) return null;
  const boundary = (at) => name[at] === '_' || /[A-Z]/.test(name[at] ?? '');
  if (name.length > k.length && name.slice(0, k.length).toLowerCase() === k && boundary(k.length)) return 'kind';
  if (name.length > 1 && name[0]?.toLowerCase() === k[0] && boundary(1)) return 'initial';
  return null;
}
function oldStyleOf(names) {
  const entries = [...names];
  const votes = new Map();
  for (const [name] of entries) {
    const casing = CASINGS.find(([, re]) => re.test(name.replace(/_?\d+$/, '')))?.[0];
    if (casing) votes.set(casing, (votes.get(casing) ?? 0) + 1);
  }
  const casing = CASINGS.map(([c]) => c).reduce((best, c) => ((votes.get(c) ?? 0) > (votes.get(best) ?? 0) ? c : best));
  const kinded = entries.filter(([, kind]) => kind);
  const found = kinded.map(([name, kind]) => startsWithKind(name, kind ?? ''));
  const count = (p) => found.filter((f) => f === p).length;
  const prefix =
    kinded.length >= 2 && count('kind') >= 2 && count('kind') >= kinded.length * 0.6
      ? 'kind'
      : kinded.length >= 2 && count('initial') >= 2 && count('initial') >= kinded.length * 0.6
        ? 'initial'
        : 'none';
  const counts = entries.flatMap(([name], i) => {
    if (!CASINGS.find(([c, re]) => c === casing && re.test(name.replace(/_?\d+$/, '')))) return [];
    const own = prefix !== 'none' && found[kinded.indexOf(entries[i])] === prefix ? 1 : 0;
    return [wordsOfName(name).length - own];
  });
  const words = counts.length
    ? Math.min(4, Math.max(1, Math.ceil(counts.reduce((a, b) => a + b, 0) / counts.length - 0.5)))
    : 3;
  return { casing, words, prefix };
}
function oldNameFromText(text, names, kind) {
  const style = oldStyleOf(names),
    taken = new Set([...names].map(([n]) => n.toLowerCase()));
  let words = nameWords(text);
  const significant = words.filter((w) => !SMALL.has(w));
  if (significant.length) words = significant;
  const k = (kind ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!words.length) words = [k || 'thing'];
  const lead = style.prefix === 'kind' && k ? k : style.prefix === 'initial' && k ? k.charAt(0) : '';
  if (!lead && /^\d/.test(words[0] ?? '')) words = ['item', ...words];
  words = words.slice(0, style.words);
  const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const joined = (ws) =>
    style.casing === 'snake'
      ? ws.join('_')
      : ws.map((w, i) => (i === 0 && style.casing === 'camel' ? w : capital(w))).join('');
  const compose = (ws) => joined(lead ? [lead, ...ws] : ws);
  while (words.length > 1 && compose(words).length > 32) words.pop();
  const base = compose(words).slice(0, 32);
  const numbered = (n) => (style.casing === 'snake' ? `${base}_${n}` : `${base}${n}`);
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()) || RESERVED.has(name.toLowerCase()); n++) name = numbered(n);
  return name;
}

let seed = 20261010;
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return seed % n;
};
const pick = (xs) => xs[rand(xs.length)];
const KINDS = ['', '', 'Option', 'Reason', 'Thing', 'Q'];
const NAMES = 'option_large o_small reasonPrice ReasonCost thing q_1 large_reader_2 x Set id'.split(' ');
const TEXTS = ['Large reader', 'Costs much less', 'The size of the screen', '42 things', 'Ünïcode words', '', 'set'];

describe('a book of names gives what the old reading of every name gave', () => {
  test('on 300 random graphs, as names are added and suggested one by one: the same style, the same names', () => {
    for (let g = 0; g < 300; g++) {
      const book = new NameBook(),
        all = new Map();
      for (let step = 0, steps = 1 + rand(40); step < steps; step++) {
        if (rand(3)) {
          const name = rand(2) ? pick(NAMES) : `${pick(NAMES)}${rand(5)}`,
            kind = pick(KINDS);
          book.set(name, kind);
          all.set(name, kind);
        } else {
          const text = pick(TEXTS),
            kind = pick(KINDS) || undefined;
          const name = book.name(text, kind);
          assert.equal(name, oldNameFromText(text, all, kind), `${text} after ${JSON.stringify([...all])}`);
          assert.equal(nameFromText(text, all, kind), name);
          book.set(name, kind ?? '');
          all.set(name, kind ?? '');
        }
        assert.deepEqual(book.style(), oldStyleOf(all));
        assert.deepEqual(nameStyleOf(all), oldStyleOf(all));
      }
    }
  });

  // that naming 5,000 things of the same text takes work linear in them, never in their square, is counted in
  // instructions by the naming benchmark (scripts/benchmarks/naming.mjs), on every release: a test asserts the work
  // done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026)
});
