// What a change of a proposal needs of the others (editor spec §17, proposal_one_by_one). A link needs the things it
// joins, which the graph has or another change adds. A change cannot be accepted until what it needs is there. A change
// that adds what another still needs cannot be rejected alone, or the change set left would not load. `have` is the
// names the graph holds and `waiting` the changes not yet decided.
import { namesOf } from './proposals-apply.ts';
import type { ProposedChange } from './proposals.ts';
import { word } from './words.ts';

/**
 * Why a change cannot be accepted until another is: it needs a thing that one adds, or one that is not there at all.
 * Null when what it needs is in `have`.
 */
export function lacking(
  c: ProposedChange,
  have: ReadonlySet<string>,
  waiting: readonly ProposedChange[],
): string | null {
  for (const n of namesOf(c).needs) {
    if (have.has(n)) continue;
    const adds = waiting.find((o) => o !== c && namesOf(o).writes.includes(n));
    return adds
      ? word('proposing.needs.accept-first', { id: c.id, other: adds.id, name: n })
      : word('proposing.needs.missing', { id: c.id, name: n });
  }
  return null;
}

/** The first reason, if any, one of these changes cannot be accepted for what it needs, taken in order. */
export function unmet(
  chosen: readonly ProposedChange[],
  have: ReadonlySet<string>,
  waiting: readonly ProposedChange[],
): string | null {
  const names = new Set(have);
  for (const c of chosen) {
    const lack = lacking(c, names, waiting);
    if (lack) return lack;
    for (const n of namesOf(c).writes) names.add(n);
  }
  return null;
}

/**
 * Why these changes cannot be rejected yet, or null. A change that waits needs a thing one of them adds, which the
 * graph does not have. So the change set left would not load. It says which to reject too.
 */
export function leftNeeding(
  rejecting: readonly ProposedChange[],
  have: ReadonlySet<string>,
  waiting: readonly ProposedChange[],
): string | null {
  for (const c of waiting) {
    if (rejecting.includes(c)) continue;
    for (const n of namesOf(c).needs) {
      const gone = have.has(n) ? undefined : rejecting.find((r) => namesOf(r).writes.includes(n));
      if (gone) return word('proposing.needs.reject-too', { id: c.id, name: n, other: gone.id });
    }
  }
  return null;
}
