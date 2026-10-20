// A first graph from an example (editor spec §44, first_run_help). A graph with nothing in it yet offers an example to
// start from. It is a small team and its plan: boxes of three kinds, and links between them. The example is written in
// the note, so it is the same in every language (§42, locale_never_changes_bytes). The short tour that follows is said
// in the reader's own words.

/** The example's lines, written after the block's own. */
const EXAMPLE = [
  "(ana:Person {name: 'Ana'}),",
  "(ben:Person {name: 'Ben'}),",
  "(plan:Project {name: 'The plan'}),",
  "(launch:Goal {name: 'Launch in May'}),",
  '(ana)-[:LEADS]->(plan),',
  '(ben)-[:WORKS_ON]->(plan),',
  '(plan)-[:AIMS_AT]->(launch)',
];

/** The block `source`, which has nothing in it yet, with the example after its own lines (its graph line, say). */
export const withExample = (source: string): string => [source.trimEnd(), ...EXAMPLE].join('\n');

/** The steps of the tour, in order. Each step's words are `tour.<step>`. */
export const TOUR_STEPS = ['boxes', 'zoom', 'edit', 'again'] as const;

/** One step of the tour. */
export type TourStep = (typeof TOUR_STEPS)[number];
