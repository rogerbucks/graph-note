// The state of a graph a proposal is made against (editor spec §17, proposal_provenance). It uses graph-spec's own name
// for it: the first sixteen digits of the graph's canonical hash. A change set's header holds it as `against`. So a
// proposal can say, before anything is accepted, that the graph has moved since it was made.
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';

/** What a graph with nothing in it hashes to here: the state of a graph the note does not hold. */
export const NO_BASIS = '0000000000000000';

/**
 * The state of `graph` as the note's blocks read it: the sixteen hexadecimal digits graph-spec gives a change set's
 * `against`. Read as the editor reads the note (what can be read, as far as it can); `shared` are the vault's shared
 * schemas. A graph the note does not hold has `NO_BASIS`.
 */
export function basisOf(note: string, graph: string, shared: string[] = []): string {
  const g = readNote(
    gqlBlocks(note).map((b) => b.text),
    undefined,
    shared,
  ).world[graph];
  return g ? gs.canon(g).slice(0, 16) : NO_BASIS;
}

/** A proposal's graph having moved since it was made: the state it was made against, the state now, and the sentence for it. */
export interface Stale {
  was: string;
  now: string;
  message: string;
}

/**
 * Whether the graph has moved from the state `expected`: null when it has not, else how, in words. A proposal is stale
 * when the graph is not as it was when the proposal was made, or as the last accepted change left it.
 */
export function staleness(note: string, graph: string, expected: string, shared: string[] = []): Stale | null {
  const now = basisOf(note, graph, shared);
  return now === expected
    ? null
    : {
        was: expected,
        now,
        message: `The graph has changed since this was proposed (it was made against state ${expected}, and the graph is now ${now}). Check each change against the graph as it is before accepting it.`,
      };
}
