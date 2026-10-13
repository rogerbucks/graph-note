// What the proposals tests share (editor spec §17): a small draft graph in a note, a proposal of every kind of change
// made against it, and the change set written into the note after it. Test support only — nothing here ships.
import { basisOf } from '../src/proposals-basis.ts';
import { makeProposal } from '../src/proposals.ts';
import { changeSetText, readChangeSet } from '../src/proposals-text.ts';

export const GRAPH = `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS]->(question)`;

/** A note holding `graph` as its one gql block. */
export const noteOf = (graph = GRAPH) => `# Reader\n\n\`\`\`gql\n${graph}\n\`\`\`\n\nAfter.\n`;
export const NOTE = noteOf();
export const BASIS = basisOf(NOTE, 'reader');

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

/** The note with the proposal's change set written as a gql block after the graph; the block as written is returned too. */
export function noteWithChangeSet(proposal = proposalOf(), note = NOTE) {
  const block = changeSetText(proposal, new Map(), null);
  return { note: `${note}\n\`\`\`gql\n${block}\n\`\`\`\n`, block };
}

/** The gql blocks of a note, as texts. */
export const blocksOf = (note) => [...note.matchAll(/```gql\n([\s\S]*?)\n```/g)].map((m) => m[1]);

/** The decisions a change set block records, by change id. */
export function decisionsIn(block) {
  const r = readChangeSet(block);
  if ('refused' in r) throw new Error(r.refused);
  return r.decisions;
}
