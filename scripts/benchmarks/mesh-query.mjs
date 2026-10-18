// The instruction-count benchmark of a query over a 10 000-thing mesh (editor spec §41, speed_budgets). It is a search,
// as the details panel's find runs it (untangle.ts, untangle_find), over every graph of the mesh. It searches by a
// thing's name and by a property's value. The mesh itself is slice 6. Until it is built, 100 notes of 100 things each
// stand in. Each note is read on its own as a host reads it, under the per-note reading limit. One 10 000-thing note
// would be over that limit. The
// notes are read in the setup, counted alone and taken off, so the count is the query's. Run by
// scripts/instruction-counts.mjs.
import { readNote } from '../../packages/core/src/drawing.ts';
import { find } from '../../packages/core/src/untangle.ts';
import { withinBudget } from './budgets.mjs';

/** How many notes the stand-in mesh has, and how many things each holds. */
export const MESH = { notes: 100, things: 100, links: 150 };

/** One note of the stand-in mesh: its things numbered on from the notes before it, each with a tag shared across notes. */
function meshNote(k) {
  const kinds = ['Person', 'Place', 'Idea', 'Source', 'Event'];
  const nodes = Array.from({ length: MESH.things }, (_, i) => {
    const n = k * MESH.things + i;
    return `(n${i}:${kinds[i % 5]} {name: 'Thing ${n}', tag: 't${n % 97}'})`;
  });
  const links = Array.from(
    { length: MESH.links },
    (_, i) => `(n${i % MESH.things})-[:LINKS]->(n${(i * 37 + 13) % MESH.things})`,
  );
  return `// graph: note${k}\n${[...nodes, ...links].join(',\n')}`;
}

/** The query over every note of the mesh, its finds in the notes' order; a query that finds nothing is no count. */
function query(notes, text) {
  const found = notes.flatMap((r, k) => find(r, `note${k}`, text));
  if (!found.length) throw new Error(`the query for ${text} found nothing in the mesh`);
  return found;
}

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'mesh_query',
  spec: '§41, speed_budgets',
  proves: 'a query over a 10 000-thing mesh, by name and by a property’s value, stays within its budget',
  setup() {
    const notes = Array.from({ length: MESH.notes }, (_, k) => readNote([meshNote(k)]));
    if (notes.some((r) => r.tooLarge)) throw new Error('a note of the mesh is over the reading limit');
    query(notes, 'thing 1'); // warm: a person has searched before
    return { notes };
  },
  cases: {
    'by-name': ({ notes }) => query(notes, 'thing 9999'),
    'by-property': ({ notes }) => query(notes, 't96'),
  },
  counted: ['by-name', 'by-property'],
  claims: [
    withinBudget('mesh_query', 'by-name', 'a thing found by its name among 10 000 within its budget of instructions'),
    withinBudget(
      'mesh_query',
      'by-property',
      'things found by a property’s value among 10 000 within its budget of instructions',
    ),
  ],
};
