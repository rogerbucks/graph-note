// The instruction-count benchmark of the refusals that keep the layout apart from the interface (spec §9,
// layout_contained): a 5 MB broken block refused before it is read; a word of 999,000 characters refused on the page's
// own thread before its drawing instructions are written; and a 600 kB note refused, as the plugin's card reads a note,
// for less than reading a tenth of it. The tests count what is never read or written (layout-limits.test.js); the cost of
// refusing is counted here. Run by scripts/instruction-counts.mjs.
import { gqlBlocks } from '../../packages/core/src/blocks.ts';
import { readNote } from '../../packages/core/src/drawing.ts';
import { PAGE_LIMITS, tooLarge } from '../../packages/core/src/layout-limits.ts';

/** `n` lines of things each missing its closing bracket: one pattern left open, as the tests write it. */
const open = (n) => Array.from({ length: n }, (_, i) => `(n${i}:Thing {name: 'Thing number ${i} of many'},`).join('\n');
/** A note holding one graph block, fenced as Obsidian keeps it. */
const note = (block) => `# A note\n\n\`\`\`gql\n${block}\n\`\`\`\n`;

/** The note's graph blocks read as the plugin's card reads them: found in the note, then read up to the first. */
function asCard(text) {
  const texts = gqlBlocks(text).map((b) => b.text);
  return readNote(texts, 0);
}

/** A refusal that did not happen, or a read that was refused, is a broken benchmark, never a count. */
function expect(refused, reading, what) {
  if (Boolean(reading?.tooLarge ?? reading?.reason) !== refused)
    throw new Error(`${what} was ${refused ? 'read' : 'refused'}`);
  return reading;
}

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'layout_refusals',
  spec: '§9, layout_contained',
  proves: 'a block, a word or a note over a limit is refused at once, for less than reading a tenth of the note',
  setup: () => ({
    block: `// graph: g\n${open(100_000)}`,
    word: {
      graph: 'g',
      boxes: [
        { key: 'n0', kind: 'Thing', text: 'x'.repeat(999_000) },
        { key: 'n1', kind: 'Thing', text: 'Thing 1' },
      ],
      links: [],
      estimates: [],
    },
    whole: note(`// graph: g\n${open(12_000)}`),
    tenth: note(`// graph: g\n${open(1_200)}`),
  }),
  cases: {
    'block-5mb': ({ block }) => expect(true, readNote([block]), 'the 5 MB block'),
    'word-999k': ({ word }) => expect(true, tooLarge(word, PAGE_LIMITS), 'the word of 999,000 characters'),
    'note-600k': ({ whole }) => expect(true, asCard(whole), 'the 600 kB note'),
    'note-tenth': ({ tenth }) => expect(false, asCard(tenth), 'a tenth of the note'),
  },
  counted: ['block-5mb', 'word-999k', 'note-600k'],
  claims: [
    { says: 'a 600 kB note refused for less than reading a tenth of it', of: (n) => [n['note-600k'], n['note-tenth']] },
  ],
};
