// Recording a decision in the note and taking it back (editor spec §17, rejecting_recorded, decider_named; the graph
// spec's cs-rejected-out). A decision does two things to the note, nothing else and only here:
// - the changes decided leave the change set. It is written again with only what still waits. After an accept, its
//   `against` is the state of the graph the accepts left it in.
// - each change decided is kept as a Decision in the judgement graph.
// Both are writes to the note's own blocks, returned as the note's new text for the host to write as it writes any
// edit.
import { gqlSpans } from './blocks.ts';
import type { Span } from './blocks.ts';
import { changeSetId, changeSetText } from './proposals-text.ts';
import { withDecisions, withoutDecisions } from './proposals-judgement.ts';
import type { Decision, ToRecord, Written } from './proposals-judgement.ts';
import type { Proposal } from './proposals.ts';
import { replaceBlock } from './store.ts';
import { word } from './words.ts';

/**
 * What a decision wrote: the change set as it was and became, and the judgement block's write. Both are null for a
 * proposal whose change set the note does not hold. It is decided in memory only, and nothing of it is written.
 */
export interface Recorded {
  note: string;
  home: { before: string; after: string } | null;
  judgement: Written | null;
}

/** The change set block of a proposal in a note, if the note holds it. */
export const changeSetSpan = (note: string, proposal: Proposal): Span | undefined =>
  gqlSpans(note).find((s) => {
    const h = changeSetId(s.text);
    return h?.id === proposal.id && h.graph === proposal.graph;
  });

/**
 * The note with a decision recorded. `proposal` is the proposal as it now stands (its `against` the state the graph is
 * in). `decided` is everything decided of it, and `now` the changes this decision is about. The change set, if the note
 * holds it, is written again with the changes still waiting. The Decisions go in the judgement block. Null when the
 * note has nowhere to write a judgement block.
 */
export function recordInNote(
  note: string,
  proposal: Proposal,
  decided: ReadonlyMap<string, Decision>,
  now: readonly ToRecord[],
): Recorded | null {
  const home = changeSetSpan(note, proposal);
  if (!home) return { note, home: null, judgement: null };
  const waiting = { ...proposal, changes: proposal.changes.filter((c) => !decided.has(c.id)) };
  const text = changeSetText(waiting);
  const w = replaceBlock(note, { line: home.open, text: home.text }, text);
  if (!w.ok) return null;
  const anchor = gqlSpans(w.note).find((s) => s.text === text);
  const judgement = withDecisions(w.note, proposal.graph, proposal.id, proposal.provenance.by, now, anchor);
  return judgement ? { note: judgement.note, home: { before: home.text, after: text }, judgement } : null;
}

/** The note with a recorded decision taken back: the Decisions out, the change set as it was. Refused when either changed since. */
export function takeBack(note: string, rec: Recorded): { ok: true; note: string } | { ok: false; reason: string } {
  const j = rec.judgement ? withoutDecisions(note, rec.judgement) : { ok: true as const, note };
  if (!j.ok) return j;
  if (!rec.home) return j;
  const home = gqlSpans(j.note).find((s) => s.text === rec.home?.after);
  if (!home) return { ok: false, reason: word('proposing.undo.change-set-changed') };
  const r = replaceBlock(j.note, { line: home.open, text: home.text }, rec.home.before);
  return r.ok ? { ok: true, note: r.note } : { ok: false, reason: r.reason };
}
