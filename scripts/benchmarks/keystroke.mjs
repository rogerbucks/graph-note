// The instruction-count benchmark of a keystroke reaching the note (spec §5, quick_to_note): the core's share of what the
// edit pane does for one key, in its order (packages/obsidian/src/block-editor): the block as typed read in its note, its
// problems, the read-back of each line and the colouring, then the write into the note. And the read-back, which runs on
// every key, against reading the note, which runs on every key already: on a large valid block it costs less, the ratio
// partial-read.test.js held in processor time. The pane's own wait before writing stays on the test's mock clock
// (pane-writing.test.js). Run by scripts/instruction-counts.mjs.
import { gqlSpans } from '../../packages/core/src/blocks.ts';
import { readNote } from '../../packages/core/src/drawing.ts';
import { diagnostics, readBack } from '../../packages/core/src/help.ts';
import { PaneSession } from '../../packages/core/src/pane.ts';
import { tokenize } from '../../packages/core/src/tokens.ts';
import { fiftyThings } from './draw-fifty.mjs';

/** A note holding one graph block, its fence on the note's third line (line 2, from 0). */
const note = (block) => `# A note\n\n\`\`\`gql\n${block}\n\`\`\`\n`;

/** The block with one more letter typed at the end of its last thing's name. */
function typedOnce(block) {
  const at = block.lastIndexOf("long'");
  return `${block.slice(0, at + 4)}s${block.slice(at + 4)}`;
}

/** One keystroke, as the pane handles it: typed, read, its problems found, read back, coloured, and written. */
function keystroke(text, typed) {
  const s = new PaneSession(text, 2);
  s.type(typed);
  const reading = s.reading(text);
  const block = gqlSpans(text).findIndex((x) => x.open === s.ref.line);
  diagnostics(reading, s.graph, Math.max(0, block), s.text, 'app://A note.md');
  readBack(reading, s.graph, s.text);
  tokenize(s.text);
  const written = s.write(text);
  if (!written.ok || !written.note.includes("words longs'")) throw new Error('the keystroke did not reach the note');
}

/** A large valid block: 5,000 things and 2,000 links, as the read-back test reads it. */
const large = () =>
  `// graph: g\n${[
    ...Array.from({ length: 5000 }, (_, i) => `(n${i}:Thing {name: 'Thing number ${i} of many'}),`),
    ...Array.from({ length: 2000 }, (_, i) => `(n${i})-[:LINKS]->(n${(i * 7 + 1) % 5000}),`),
  ]
    .join('\n')
    .replace(/,$/, '')}`;

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'keystroke',
  spec: '§5, quick_to_note',
  proves: 'a keystroke reaches the note with the core work of one read; reading back costs less than reading',
  setup() {
    const block = fiftyThings();
    const text = note(block),
      typed = typedOnce(block);
    keystroke(text, typed); // warm: a person typing has typed before
    const big = large();
    return { text, typed, big, reading: readNote([big]) };
  },
  cases: {
    keystroke: ({ text, typed }) => keystroke(text, typed),
    read: ({ big }) => readNote([big]),
    'read-back': ({ big, reading }) => readBack(reading, 'g', big),
  },
  counted: ['keystroke', 'read-back'],
  claims: [
    { says: 'what is read back as each key is typed costs less than reading', of: (n) => [n['read-back'], n.read] },
  ],
};
