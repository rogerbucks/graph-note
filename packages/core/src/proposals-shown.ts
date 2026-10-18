// What a proposal review hands a host (editor spec §17). It hands the proposal as shown: rows, groups, marks,
// provenance and whether the graph has moved. It hands the shapes of a decision too: who decides, which changes, and
// what came of it. Types only.
import type { NoteReading } from './note-reading.ts';
import type { Stale } from './proposals-basis.ts';
import type { MarkKind, Marks } from './proposals-marks.ts';
import type { ChangeGroup } from './proposals.ts';
import type { ProposalCheck } from './proposals-check.ts';
import type { Decision } from './proposals-judgement.ts';

/** Who decides: a person, by name. */
export interface Person {
  name: string;
}

/** Which changes a decision is about: these ids, every one still waiting, or every one still waiting in a group. */
export type Which = readonly string[] | { all: true } | { group: string };

/** What a decision may be told: when it was made (the current time by default) and that a stale proposal has been seen. */
export interface DecideOptions {
  at?: string;
  /** The person has been shown that the graph has moved since this was proposed, and accepts anyway. */
  staleSeen?: boolean;
}

/** A decision made, with the note as it now is; or why nothing was decided. */
export type Reviewed = { ok: true; note: string; ids: string[] } | { ok: false; reason: string; stale?: Stale };

/** One change as listed: what it does, in words, where it stands and, if it cannot be accepted, why. */
export interface ChangeRow {
  id: string;
  group: string;
  mark: MarkKind;
  state: 'pending' | 'accepted' | 'rejected';
  /** The change read back in plain English, as the text pane reads a line. */
  said: string;
  /** The change exactly as it would be written: its GQL, its SET line or its removal; what the sentence may say less of. */
  text: string;
  /** Why accepting it would be refused now, or null. */
  blocked: string | null;
  decision?: Decision;
  reason?: string;
}

/** A proposal as shown: nothing in it is written. */
export interface ProposalShown {
  /** The note with every change still waiting laid over it — what would be drawn if all were accepted. */
  reading: NoteReading;
  rows: ChangeRow[];
  groups: ChangeGroup[];
  /** The boxes and links the waiting changes add, change or remove. */
  marks: Marks;
  provenance: string[];
  /** Set when the graph has moved since the proposal was made: said before anything is accepted. */
  stale: Stale | null;
  /** Many changes: reviewed in groups. */
  grouped: boolean;
  /** The graph spec's own check of the change set as the note holds it, every line of its answer (proposals_checked). */
  checked: ProposalCheck;
}
