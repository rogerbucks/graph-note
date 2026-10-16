// Reviewing a proposal (editor spec §17): shown over the graph with nothing written (proposal_shown_not_applied) and run
// through the graph spec's own change-set check, whose answer is shown (proposals_checked); each change accepted or
// rejected on its own, in a group or all at once (proposal_one_by_one, big_proposal); an accepted change written as text
// through the pane's own edit session, so it is checked first and undone like any other edit (accepting_is_an_edit); a
// rejected one leaving the graph as it was; both kept as decisions in the note's judgement graph, by the name set in the
// settings (rejecting_recorded, decider_named); the proposer, the time and what it read shown, and a graph that has moved
// since said so before anything is accepted (proposal_provenance); and nothing decided but by a person who says who they
// are (person_decides). The review works on the note's text, which the host hands in and writes back when told it may:
// it never writes a note itself.
import { gqlSpans } from './blocks.ts';
import { readNote } from './drawing.ts';
import { PaneSession } from './pane.ts';
import { applyChange, namesOf, newProblems, notTaken } from './proposals-apply.ts';
import { basisOf, staleness } from './proposals-basis.ts';
import type { Stale } from './proposals-basis.ts';
import { checkProposal, checkRefusal, proposerKind } from './proposals-check.ts';
import { DECIDER_DEFAULT, decidedIn, inOrder } from './proposals-judgement.ts';
import type { Decision, ToRecord } from './proposals-judgement.ts';
import { exactOf, marksOf, markOf, saidOf } from './proposals-marks.ts';
import { lacking, leftNeeding, unmet } from './proposals-needs.ts';
import { recordInNote, takeBack, changeSetSpan } from './proposals-record.ts';
import type { Recorded } from './proposals-record.ts';
import { BIG_PROPOSAL, groupsOf, makeProposal, provenanceLines } from './proposals.ts';
import type { Proposal, ProposedChange } from './proposals.ts';
import type { ChangeRow, DecideOptions, Person, ProposalShown, Reviewed, Which } from './proposals-shown.ts';
import { changeSetText, readChangeSet } from './proposals-text.ts';
import { changeIdOf } from './proposals-statements.ts';
import type { NoteReading } from './note-reading.ts';

/** An accept or reject as it can be taken back: the sessions that wrote, what the note recorded, and how it stood. */
interface Step {
  sessions: PaneSession[];
  recorded: Recorded;
  proposal: Proposal;
  decided: Map<string, Decision>;
}

const refuse = (reason: string, stale?: Stale): Reviewed => ({ ok: false, reason, ...(stale ? { stale } : {}) });
const textsOf = (note: string) => gqlSpans(note).map((s) => s.text);

/** A proposal and what has been decided about it so far. */
export class ProposalReview {
  /** Every change of the proposal, decided ones included; its `against` is the state its waiting changes are held to. */
  proposal: Proposal;
  /** The vault's shared schemas (§5), for a graph that names one: the host loads them. */
  shared: string[] = [];
  private decided: Map<string, Decision>;
  private readonly steps: Step[] = [];

  constructor(proposal: Proposal, decisions: ReadonlyMap<string, Decision> = new Map()) {
    this.proposal = proposal;
    this.decided = new Map(decisions);
  }

  /**
   * A review of the proposal a change set block holds. Given the note, it also takes up what the note's judgement graph
   * says was decided of it, and what the note's graphs say the proposer is; or why the block cannot be read.
   */
  static fromChangeSet(block: string, note?: string): ProposalReview | { refused: string } {
    const r = readChangeSet(block);
    if ('refused' in r) return r;
    const done = note ? decidedIn(note, r.graph, r.id) : [];
    const { inputs, at } = inOrder(done, r.changes);
    if (!inputs.length) return { refused: 'this change set holds no change' };
    const proposal = makeProposal({
      id: r.id,
      graph: r.graph,
      by: { name: r.by, kind: note ? proposerKind(note, r.by) : 'unknown' },
      at: r.at,
      read: r.read,
      basis: r.basis,
      changes: inputs,
    });
    if ('refused' in proposal) return proposal;
    const decisions = new Map<string, Decision>();
    for (const [i, d] of at) {
      const c = proposal.changes[i];
      if (c) decisions.set(c.id, d);
    }
    return new ProposalReview(proposal, decisions);
  }

  /** Whether an accept or a reject can be taken back. */
  canUndo(): boolean {
    return this.steps.length > 0;
  }

  /** Where a change stands. */
  state(id: string): 'pending' | 'accepted' | 'rejected' {
    return this.decided.get(id)?.state ?? 'pending';
  }

  /** The decision made about a change, if any. */
  decision(id: string): Decision | undefined {
    return this.decided.get(id);
  }

  /** Every decision made, by change id. */
  decisions(): [string, Decision][] {
    return [...this.decided];
  }

  /** The ids of the changes still waiting, in the order proposed. */
  pending(): string[] {
    return this.proposal.changes.filter((c) => this.state(c.id) === 'pending').map((c) => c.id);
  }

  /** The proposal as a change set: what still waits, against the state of the graph it is held to. */
  changeSetText(): string {
    return changeSetText({ ...this.proposal, changes: this.proposal.changes.filter((c) => !this.decided.has(c.id)) });
  }

  /** The state of the graph the proposal is held against: where it was made, or where the last accepted change left it. */
  expected(): string {
    return this.proposal.provenance.basis;
  }

  /** Whether the graph has moved since the proposal was made (or since the last change accepted from it); null if not. */
  staleness(note: string): Stale | null {
    return staleness(note, this.proposal.graph, this.expected(), this.shared);
  }

  /** Takes up the decisions the note's judgement graph records for this proposal, if the note holds its change set. */
  private sync(note: string): void {
    if (!changeSetSpan(note, this.proposal)) return;
    const found = new Map<string, Decision>();
    for (const d of decidedIn(note, this.proposal.graph, this.proposal.id)) {
      const id = changeIdOf(d.change);
      if (this.proposal.changes.some((c) => c.id === id)) found.set(id, d.decision);
    }
    this.decided = found;
  }

  /** The proposal's changes that these ids, or this choice, name — or why they cannot be decided. */
  private choose(which: Which): ProposedChange[] | string {
    const all = this.proposal.changes;
    if ('group' in which) {
      const group = all.filter((c) => c.group === which.group);
      return group.length ? group.filter((c) => this.state(c.id) === 'pending') : `no group called ${which.group}`;
    }
    if ('all' in which) return all.filter((c) => this.state(c.id) === 'pending');
    const chosen = new Set<string>();
    for (const id of which) {
      const d = this.decided.get(id);
      if (!all.some((c) => c.id === id)) return `no change ${id} in this proposal`;
      if (d) return `${id} was already ${d.state} by ${d.by}`;
      chosen.add(id);
    }
    return all.filter((c) => chosen.has(c.id));
  }

  /** Why this is not a person who decides, or null: a person gives a name, and what proposed a change cannot accept it. */
  private notAPerson(by: unknown): string | null {
    const name = typeof (by as Person | null)?.name === 'string' ? (by as Person).name.trim() : '';
    if (!name) return 'a person decides: say who is deciding';
    const { name: proposer, kind } = this.proposal.provenance.by;
    // the same name in any case is the same proposer, as written: a proposer's name is one word, so no label with a space
    // is taken for it, and one called the_reader is none for the label "the reader"
    // ("you" is what the person at the keyboard is called when the settings name nobody: it is never taken for a proposer)
    const same = name.toLowerCase() === proposer.toLowerCase() && name !== DECIDER_DEFAULT;
    return same && kind !== 'person' ? `${proposer} proposed this, and is not a person: a person decides` : null;
  }

  /** The changes not yet decided, in the order proposed. */
  private waiting(): ProposedChange[] {
    return this.proposal.changes.filter((c) => this.state(c.id) === 'pending');
  }

  /** The names the proposal's graph holds in a reading of the note. */
  private namesIn(reading: NoteReading): Set<string> {
    return new Set(reading.world[this.proposal.graph]?.nodes.keys());
  }

  /**
   * The proposal over the note, and nothing written: each change marked, listed and read back, the changes waiting laid
   * over the graph for the host to draw, whether the graph has moved since it was proposed, and the graph spec's check of
   * the change set as the note holds it.
   */
  show(note: string): ProposalShown {
    this.sync(note);
    const { graph } = this.proposal;
    const base = textsOf(note);
    const baseReading = readNote(base, undefined, this.shared);
    const have = new Set(baseReading.world[graph]?.nodes.keys());
    let laid = base,
      saying = base;
    const blocked = new Map<string, string>();
    for (const c of this.proposal.changes) {
      const state = this.state(c.id);
      if (state === 'accepted') continue;
      const into = applyChange(laid, graph, c);
      const dupe = namesOf(c).writes.find((n) => have.has(n));
      const lack = state === 'pending' ? lacking(c, have, this.waiting()) : null;
      const reason = !into.ok
        ? into.reason
        : dupe
          ? `${dupe} is already a name in graph ${graph}: choose another`
          : lack;
      if (state === 'pending' && reason) blocked.set(c.id, reason);
      if ((c.op === 'add' || c.op === 'set') && !reason) {
        if (state === 'pending' && into.ok) laid = into.texts;
        const also = applyChange(saying, graph, c);
        if (also.ok) saying = also.texts;
      }
      if (state === 'pending' && !reason) for (const n of namesOf(c).writes) have.add(n);
    }
    const reading = laid === base ? baseReading : readNote(laid, undefined, this.shared);
    const said = saying === laid ? reading : readNote(saying, undefined, this.shared);
    const waiting = this.proposal.changes.filter((c) => this.state(c.id) === 'pending' && !blocked.has(c.id));
    const rows = this.proposal.changes.map((c): ChangeRow => {
      const d = this.decided.get(c.id);
      return {
        id: c.id,
        group: c.group,
        mark: markOf(c),
        state: this.state(c.id),
        said: saidOf(c.op === 'remove-link' || c.op === 'remove-thing' ? baseReading : said, graph, c),
        text: exactOf(c),
        blocked: blocked.get(c.id) ?? null,
        ...(d ? { decision: d } : {}),
        ...(c.reason ? { reason: c.reason } : {}),
      };
    });
    const home = changeSetSpan(note, this.proposal);
    return {
      reading,
      rows,
      groups: groupsOf(this.proposal, (id) => this.state(id)),
      marks: marksOf(reading, graph, waiting),
      provenance: provenanceLines(this.proposal),
      stale: this.staleness(note),
      grouped: this.proposal.changes.length > BIG_PROPOSAL,
      checked: checkProposal(note, home?.text ?? this.changeSetText(), this.shared),
    };
  }

  /**
   * Records these changes as decided in the note: the change set written again with what still waits, and a Decision for
   * each in the judgement graph. `proposal` is the proposal as it will stand.
   */
  private record(
    note: string,
    proposal: Proposal,
    decided: Map<string, Decision>,
    chosen: readonly ProposedChange[],
  ): Recorded | null {
    const now = chosen.flatMap((change): ToRecord[] => {
      const decision = decided.get(change.id);
      return decision ? [{ change, decision, order: proposal.changes.findIndex((c) => c.id === change.id) }] : [];
    });
    return recordInNote(note, proposal, decided, now);
  }

  /**
   * A person accepts changes: each is written as text through the pane's own edit session, in the order proposed,
   * checked there first, then read back to see it took effect, and the whole refused (nothing written) if any is not
   * allowed or leaves the graph with a problem it did not have. A proposal whose graph has moved is refused until the
   * person has seen that (`staleSeen`). The decision is kept in the note's judgement graph, and the change set is written
   * again with what still waits, held to the graph as the accepts left it.
   */
  accept(note: string, which: Which, by: Person, options: DecideOptions = {}): Reviewed {
    const nobody = this.notAPerson(by);
    if (nobody) return refuse(nobody);
    this.sync(note);
    const chosen = this.choose(which);
    if (typeof chosen === 'string') return refuse(chosen);
    if (!chosen.length) return { ok: true, note, ids: [] };
    const stale = this.staleness(note);
    if (stale && !options.staleSeen) return refuse(stale.message, stale);
    // the change set as the note holds it must pass the graph spec's own check: nothing is written on one that fails
    const held = changeSetSpan(note, this.proposal);
    const unchecked = held && checkRefusal(checkProposal(note, held.text, this.shared), 'seen');
    if (unchecked) return refuse(unchecked);
    const { graph } = this.proposal;
    const before = textsOf(note);
    const beforeReading = readNote(before, undefined, this.shared);
    const lack = unmet(chosen, this.namesIn(beforeReading), this.waiting());
    if (lack) return refuse(lack);
    let texts = before;
    for (const c of chosen) {
      const r = applyChange(texts, graph, c);
      if (!r.ok) return refuse(`${c.id} cannot be written: ${r.reason}`);
      texts = r.texts;
    }
    let out = note;
    const sessions: PaneSession[] = [];
    for (const [i, text] of texts.entries()) {
      if (text === before[i]) continue;
      const open = gqlSpans(out)[i]?.open ?? 0;
      const session = new PaneSession(out, open);
      session.shared = this.shared;
      session.edit(text);
      const w = session.write(out);
      if (!w.ok) return refuse(w.reason);
      out = w.note;
      sessions.push(session);
    }
    const after = readNote(textsOf(out), undefined, this.shared);
    for (const c of chosen) {
      const missed = notTaken(after, graph, c);
      if (missed) return refuse(`${c.id} did not take effect: ${missed}`);
    }
    const fresh = newProblems(beforeReading, after, graph)[0];
    if (fresh) return refuse(`it would leave the graph with a problem: ${fresh.message}`);
    const at = options.at ?? new Date().toISOString();
    const decided = new Map(this.decided);
    for (const c of chosen) decided.set(c.id, { state: 'accepted', by: by.name, at });
    const next = {
      ...this.proposal,
      provenance: { ...this.proposal.provenance, basis: basisOf(out, graph, this.shared) },
    };
    return this.finish(out, next, decided, chosen, sessions);
  }

  /**
   * A person rejects changes: the graph is left exactly as it was, the changes leave the change set so no tool that
   * applies it applies them, and the rejection — who, and when — is kept as a Decision in the judgement graph.
   */
  reject(note: string, which: Which, by: Person, options: DecideOptions = {}): Reviewed {
    const nobody = this.notAPerson(by);
    if (nobody) return refuse(nobody);
    this.sync(note);
    const chosen = this.choose(which);
    if (typeof chosen === 'string') return refuse(chosen);
    if (!chosen.length) return { ok: true, note, ids: [] };
    const left = leftNeeding(chosen, this.namesIn(readNote(textsOf(note), undefined, this.shared)), this.waiting());
    if (left) return refuse(left);
    const at = options.at ?? new Date().toISOString();
    const decided = new Map(this.decided);
    for (const c of chosen) decided.set(c.id, { state: 'rejected', by: by.name, at });
    return this.finish(note, this.proposal, decided, chosen, []);
  }

  /** Writes the record of a decision into the note and takes the decision up, to be taken back by `undo`. */
  private finish(
    note: string,
    next: Proposal,
    decided: Map<string, Decision>,
    chosen: readonly ProposedChange[],
    sessions: PaneSession[],
  ): Reviewed {
    const recorded = this.record(note, next, decided, chosen);
    if (!recorded) return refuse('the decision could not be recorded: the note has nowhere to write it');
    this.steps.push({ sessions, recorded, proposal: this.proposal, decided: this.decided });
    this.proposal = next;
    this.decided = decided;
    return { ok: true, note: recorded.note, ids: chosen.map((c) => c.id) };
  }

  /** Takes back the last accept or reject: the text written is undone by the sessions that wrote it, and the note's records are as they were. */
  undo(note: string): Reviewed {
    // the step stays until it has been taken back: an undo that cannot be made leaves it there to be made again
    const step = this.steps.at(-1);
    if (!step) return refuse('nothing to undo');
    const back = takeBack(note, step.recorded);
    if (!back.ok) return refuse(back.reason);
    let out = back.note;
    // every block written is asked first: one changed since is refused before any session is undone, so the step stays whole
    const now = textsOf(out);
    if (step.sessions.some((s) => !now.includes(s.ref.text)))
      return refuse('the block has changed since the decision was made, so it cannot be undone');
    for (const session of [...step.sessions].reverse()) {
      const w = session.undo(out);
      if (!w.ok) return refuse(w.reason);
      out = w.note;
    }
    this.steps.pop();
    const ids = [...this.decided.keys()].filter((id) => step.decided.get(id) === undefined);
    this.proposal = step.proposal;
    this.decided = step.decided;
    return { ok: true, note: out, ids };
  }
}
