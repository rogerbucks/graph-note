// The instruction-count benchmark of the refusals that keep the layout apart from the interface (spec §9,
// layout_contained). It counts three refusals:
// - a 5 MB broken block, refused before it is read;
// - a word of 999,000 characters, refused on the page's own thread before its drawing instructions are written;
// - a 600 kB note, refused by the plugin card's own path to the refusal. It costs less than reading a tenth of it by
//   the same path. The tests count what is never read or written
// (layout-limits.test.js); the cost of refusing is counted here. Run by scripts/instruction-counts.mjs.
import { gqlBlocks, graphOfBlock, namesSharedSchema, styleOf } from '../../packages/core/src/blocks.ts';
import { readNote } from '../../packages/core/src/drawing.ts';
import { PAGE_LIMITS, tooLarge } from '../../packages/core/src/layout-limits.ts';
import { DEFAULT_SETTINGS } from '../../packages/core/src/settings.ts';
import { underStrictness } from '../../packages/core/src/strictness.ts';
import { viewsOf } from '../../packages/core/src/views.ts';

/** `n` lines of things each missing its closing bracket: one pattern left open, as the tests write it. */
const open = (n) => Array.from({ length: n }, (_, i) => `(n${i}:Thing {name: 'Thing number ${i} of many'},`).join('\n');
/** The line of the fence that opens the note's one block. */
const FENCE = 2;
/** A note holding one graph block, its fence on the note's third line, as Obsidian keeps it. */
const note = (block) => `# A note\n\n\`\`\`gql\n${block}\n\`\`\`\n`;

/**
 * A note's card, as the plugin's processor makes it up to the refusal (packages/obsidian/src/block.ts, renderBlock).
 * - The block is asked whether it is a view, a style block or a graph.
 * - The note's blocks are found, and this one among them, and whether any names a shared schema.
 * - The note is read up to this block, and its problems held to the strictness set.
 * What follows, the banner or the drawing, is the plugin's interface, not counted.
 */
function asCard(text) {
  const source = text.slice(text.indexOf('\n```gql\n') + 8, text.lastIndexOf('\n```'));
  if (viewsOf([source])[0] || styleOf(source) || !graphOfBlock(source)) throw new Error('the block is not a graph');
  const blocks = gqlBlocks(text);
  const index = blocks.findIndex((b) => b.line - 1 === FENCE);
  if (index < 0) throw new Error('the block was not found where the card is');
  const texts = blocks.map((b, i) => (i === index ? source : b.text));
  if (texts.some(namesSharedSchema)) throw new Error('the note names a shared schema, which this does not load');
  const read = readNote(texts, index, []);
  return { ...read, problems: underStrictness(read.problems, DEFAULT_SETTINGS) };
}

/** A refusal that did not happen, or a read that was refused, is a broken benchmark, never a count. */
function expect(refused, reading, what) {
  if (Boolean(reading?.tooLarge ?? reading?.reason) !== refused)
    throw new Error(`${what} was ${refused ? 'read' : 'refused'}`);
  return reading;
}

/** A drawing of two things, one of them a word of `n` characters. */
const worded = (n) => ({
  graph: 'g',
  boxes: [
    { key: 'n0', kind: 'Thing', text: 'x'.repeat(n) },
    { key: 'n1', kind: 'Thing', text: 'Thing 1' },
  ],
  links: [],
  estimates: [],
});

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'layout_refusals',
  spec: '§9, layout_contained',
  proves: 'a block, a word or a note over a limit is refused at once, for less than reading a tenth of the note',
  setup() {
    // warm: each case's code path once, as small as still takes that path. So the compiling a first refusal or a first
    // read does is in the setup, and never inside the claim. A refusal needs a text over the limit: 10,500 lines, about
    // 530 kB, is over the 512 kB the 5 MB block and the 600 kB note are refused by
    const over = `// graph: g\n${open(10_500)}`;
    expect(true, readNote([over]), 'the warming block');
    expect(true, tooLarge(worded(1_001), PAGE_LIMITS), 'the warming word');
    expect(true, asCard(note(over)), 'the warming note');
    expect(false, asCard(note(`// graph: g\n${open(100)}`)), 'the small warming note');
    return {
      block: `// graph: g\n${open(100_000)}`,
      word: worded(999_000),
      whole: note(`// graph: g\n${open(12_000)}`),
      tenth: note(`// graph: g\n${open(1_200)}`),
    };
  },
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
