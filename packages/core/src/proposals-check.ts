// A proposal checked by the graph spec's own change-set check (editor spec §17, proposals_checked). The change set, as
// the note holds it, is run against the note's other graphs by `checkChangeset`. Every line of its answer is kept to be
// shown. The same check names the proposer's kind: a Model or a Person in the note's graphs, which is all the graph
// says of it.
import gs from '@thoughtknot/graph-spec';
import { items } from './block-items.ts';
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
  // a set with every change decided holds nothing to apply, so nothing to check. Its proposer's declaration went with
  // the last change rejected, and leaves it with no known author to ask for
  const parts = gs.splitChangeset(block);
  if (!parts.changes.length && !items(parts.additions).length)
    return { passed: true, results: [{ label: 'nothing waits in it, so there is nothing to check', ok: true }] };
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

const MOVED = /^it was made against the graph as it stands/;

/**
 * Why a proposal must not be accepted or written, or null: the check failed, saying which lines. `moved: 'seen'` leaves out
 * the line that says the graph has moved since, which the stale notice has already said and the person has read.
 */
export function checkRefusal(check: ProposalCheck, moved: 'seen' | 'counts'): string | null {
  const failed = check.results.filter((r) => !r.ok && !(moved === 'seen' && MOVED.test(r.label)));
  return failed.length
    ? `the graph spec’s check of this change set fails: ${failed.map((r) => r.label).join('; ')}`
    : null;
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
    if (labels?.has('Step')) return 'step'; // a Step is a Person that is a Step: the more particular is said
    if (labels?.has('Model')) return 'model';
    if (labels?.has('Person')) return 'person';
  }
  return 'unknown';
}
