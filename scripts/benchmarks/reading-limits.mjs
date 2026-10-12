// The instruction-count benchmark of the worst cases read at the size limits (spec §9, reading_contained): three broken
// blocks, each read within the one budget of reading again, against the same block mended. A broken read costs under
// twice the budget's worth of whole reads of the mended block: as many reads as the budget and two of the block's length
// allow. This is the ratio partial-read.test.js held in processor time; its work count (what the reader is handed) stays
// there. Run by scripts/instruction-counts.mjs.
import { readNote } from '../../packages/core/src/drawing.ts';
import { REREAD_BUDGET } from '../../packages/core/src/partial-read.ts';

/** A block of `n` things on their own lines, `broken` saying which are written with their colon missing. */
const block = (n, broken, text = (i) => `Thing number ${i}`) =>
  `// graph: g\n(ok:Thing {name: 'Readable'}),\n${Array.from({ length: n }, (_, i) => `(n${i}:Thing {name${broken(i) ? '' : ':'} '${text(i)}'}),`).join('\n')}`;

/** The worst cases, each with its mended block: as partial-read.test.js reads them. */
function texts() {
  const line = Array.from({ length: 6000 }, (_, i) => `(n${i}:T {name${i === 5999 ? '' : ':'} 'x'})`).join(', ');
  const oneLine = `// graph: g\n${line}`;
  const long = (i) => `Thing number ${i} of many`;
  return {
    'broken-2000': block(2000, (i) => i % 40 === 39),
    'mended-2000': block(2000, () => false),
    'one-line-broken': oneLine,
    'one-line-mended': oneLine.replace("{name '", "{name: '"),
    'every-line-broken': block(9800, () => true, long),
    'every-line-mended': block(9800, () => false, long),
  };
}

/** Reads a block; one refused as too large to read is a broken benchmark, never a count. */
function read(text) {
  const r = readNote([text]);
  if (r.tooLarge) throw new Error('the block was refused unread');
  return r;
}

/**
 * Under twice as many whole reads of the mended block as the budget and two of the broken block's length allow; the
 * length is worked out where the claim is checked, from the same texts.
 */
const inBudget = (brokenCase, mendedCase) => (n) => [
  n[brokenCase],
  2 * (REREAD_BUDGET / texts()[brokenCase].length + 2) * n[mendedCase],
];

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'reading_limits',
  spec: '§9, reading_contained',
  proves: 'the worst broken blocks under the size limits are read within the one budget of reading again',
  setup: () => texts(),
  cases: Object.fromEntries(Object.keys(texts()).map((name) => [name, (inputs) => read(inputs[name])])),
  counted: ['broken-2000', 'one-line-broken', 'every-line-broken'],
  claims: [
    { says: '2,000 things, 1 in 40 broken, read within the budget', of: inBudget('broken-2000', 'mended-2000') },
    {
      says: '6,000 things on one line, the last broken, read within the budget',
      of: inBudget('one-line-broken', 'one-line-mended'),
    },
    {
      says: 'nearly 512 kB, every line broken, read within the budget',
      of: inBudget('every-line-broken', 'every-line-mended'),
    },
  ],
};
