// A proposal checked by the graph spec's own change-set check (editor spec §17, proposals_checked): the change set as the
// note holds it, run against the note's other graphs by `checkChangeset`, and every line of its answer kept to be shown.
// The same check names the proposer's kind: a Model or a Person in the note's graphs, which is all the graph says of it.
import gs from '@graph-note/graph-spec';
import { dataKind, gqlSpans } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { ProposerKind } from './proposals.ts';

/** What the check said of a proposal: each thing it checked, and whether the proposal passes every one. */
export interface ProposalCheck {
  passed: boolean;
  results: { label: string; ok: boolean }[];
}

/** The blocks a change set is checked against: the note's graphs and schemas (never a change set, a query or a style). */
const baseOf = (note: string, shared: readonly string[]): string[] => [
  ...shared,
  ...gqlSpans(note)
    .map((s) => s.text)
    .filter((t) => {
      const kind = dataKind(t);
      return kind === 'data' || kind === 'schema';
    }),
];

/**
 * The graph spec's check of a change set, as the note holds it now: against the note's other graphs, with `shared` the
 * vault's shared schemas. Its answer is kept whole; a note whose own graphs the check cannot load is one failed line.
 */
export function checkProposal(note: string, block: string, shared: readonly string[] = []): ProposalCheck {
  try {
    const { results } = gs.checkChangeset(baseOf(note, shared), block);
    return { passed: results.every(([, ok]) => ok), results: results.map(([label, ok]) => ({ label, ok })) };
  } catch (e) {
    if (!(e instanceof gs.ProfileError)) throw e;
    return {
      passed: false,
      results: [{ label: `the note’s graphs load for the check (line ${e.line}: ${e.msg})`, ok: false }],
    };
  }
}

/** What the note's graphs say a proposer is: a Model, a Person or a graph Step; otherwise nothing is said. */
export function proposerKind(note: string, name: string, shared: string[] = []): ProposerKind {
  const read = readNote(
    gqlSpans(note).map((s) => s.text),
    undefined,
    shared,
  );
  for (const g of Object.values(read.world)) {
    const labels = g.nodes instanceof Map ? g.nodes.get(name)?.[0] : undefined; // the world also lists what graphs name
    if (labels?.has('Model')) return 'model';
    if (labels?.has('Person')) return 'person';
    if (labels?.has('Step')) return 'step';
  }
  return 'unknown';
}
