// The instruction-count benchmark of naming many things (spec §9): 5,000 things of the same text named by a name book,
// and 9,000 things written without a name read and each given its suggested name, each in work linear in their number,
// never in its square. Held as a ratio between two sizes of the same work: the whole costs under three times a quarter
// done four times over, where linear is 1 and square 4. These are the ratios name-book.test.js and partial-read.test.js
// held in processor time. Run by scripts/instruction-counts.mjs.
import { readNote } from '../../packages/core/src/drawing.ts';
import { NameBook } from '../../packages/core/src/name-book.ts';

/** Names `n` things of the same text, one after another, as a pane adding them does. */
function naming(n) {
  const book = new NameBook();
  for (let i = 0; i < n; i++) book.set(book.name('Same text', 'Thing'), 'Thing');
  if (book.name('Same text', 'Thing') !== `same_text_${n + 1}`) throw new Error('the name book named them wrongly');
  return book;
}

/** A block of `n` things written without a name. */
const unnamed = (n) =>
  `// graph: g\n${Array.from({ length: n }, (_, i) => `(:Thing {name: 'Thing number ${i}'}),`).join('\n')}`;

/** Reads a block of unnamed things; one that drew fewer than it holds is a broken benchmark, never a count. */
function read(text, n) {
  if (readNote([text]).graphs.get('g')?.boxes.length !== n)
    throw new Error(`the ${n} unnamed things were not all drawn`);
}

/** Under three times what a quarter of the work costs done four times over. */
const linear = (whole, quarters) => (n) => [n[whole], 3 * n[quarters]];

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'naming',
  spec: '§9, naming thousands of things never freezes the page',
  proves: 'naming thousands of things, by the name book or as suggested names, takes work linear in their number',
  setup() {
    // warm: each case's code path once, small, so the compiling the first naming does is in the setup, taken off both
    // sizes alike, and never inside the ratio, where it would hide a square
    naming(200);
    read(unnamed(200), 200);
    return { whole: unnamed(9000), quarter: unnamed(2250) };
  },
  cases: {
    'book-5000': () => naming(5000),
    'book-quarters': () => [0, 1, 2, 3].forEach(() => naming(1250)),
    'unnamed-9000': ({ whole }) => read(whole, 9000),
    'unnamed-quarters': ({ quarter }) => [0, 1, 2, 3].forEach(() => read(quarter, 2250)),
  },
  counted: ['book-5000', 'unnamed-9000'],
  claims: [
    { says: 'naming 5,000 things of the same text is linear in them', of: linear('book-5000', 'book-quarters') },
    { says: '9,000 things written without a name are named linearly', of: linear('unnamed-9000', 'unnamed-quarters') },
  ],
};
