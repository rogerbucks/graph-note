// What the proposals tests share (editor spec §17). It holds a small draft graph in a note, and a proposal of every
// kind of change made against it. It also holds the change set written into the note after it. Test support only —
// nothing here ships.
import { readNote } from '../src/drawing.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { makeProposal } from '../src/proposals.ts';
import { changeSetText } from '../src/proposals-text.ts';
import { pieces } from './text-find.js';

export const GRAPH = `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS]->(question)`;

/** A graph that says who the proposer is: the graph spec's check wants its author to be a known person or model. */
export const PEOPLE = `// graph: people
(ada:Model {name: 'Ada'})`;

/** A note holding `graph` as its one gql block. */
export const noteOf = (graph = GRAPH) => `# Reader\n\n\`\`\`gql\n${graph}\n\`\`\`\n\nAfter.\n`;
export const NOTE = noteOf();
export const BASIS = basisOf(NOTE, 'reader');

/** The same note with the graph that names its proposer after the graph. */
export const NOTE_WITH_ADA = `${NOTE}\n\`\`\`gql\n${PEOPLE}\n\`\`\`\n`;

export const ADA = { name: 'ada', kind: 'model' };
export const ROGER = { name: 'roger' };
export const AT = '2026-10-13T09:00:00Z';
export const NOW = '2026-10-13T10:30:00Z';

/** The changes of every kind, in the order they are proposed. */
export const CHANGES = [
  { op: 'add', gql: "(small_reader:Option {name: 'Small reader'})" },
  { op: 'add', gql: '(small_reader)-[:ANSWERS]->(question)' },
  { op: 'set', thing: 'large_reader', key: 'price', value: '4' },
  { op: 'remove-link', from: 'large_reader', type: 'ANSWERS', to: 'question' },
  { op: 'remove-thing', thing: 'alice' },
];

/** A proposal against the note's graph; `over` replaces any of what it is made from. */
export function proposalOf(over = {}) {
  const made = makeProposal({
    id: 'cs1',
    graph: 'reader',
    by: ADA,
    at: AT,
    read: ['reader'],
    basis: BASIS,
    changes: CHANGES,
    ...over,
  });
  if ('refused' in made) throw new Error(made.refused);
  return made;
}

/** The ids of the five changes of `CHANGES`: derived from each statement, so never written in a test. */
export const [C1, C2, C3, C4, C5] = proposalOf().changes.map((c) => c.id);

/** The note with the proposal's change set written as a gql block after the graph; the block as written is returned too. */
export function noteWithChangeSet(proposal = proposalOf(), note = NOTE) {
  const block = changeSetText(proposal);
  return { note: `${note}\n\`\`\`gql\n${block}\n\`\`\`\n`, block };
}

/** The gql blocks of a note, as texts. */
export const blocksOf = (note) => pieces(note, '```gql\n', '\n```').map((b) => b.slice(7, -4));

/** The decisions a note's judgement graph records, by change id: read from the note's own text, as any tool reads it. */
export function decisionsIn(note) {
  const block = blocksOf(note).find((b) => /^\/\/ graph: (?:\w+_)?judgements\b/.test(b));
  const out = new Map();
  if (!block) return out;
  const g = readNote([block]).world[/^\/\/ graph: (\S+)/.exec(block)[1]];
  for (const d of g.labelled('Decision')) {
    const p = g.p(d);
    out.set(p.change, { state: p.state, by: p.decided_by, at: p.at });
  }
  return out;
}
