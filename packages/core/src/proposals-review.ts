// Reviewing a proposal (editor spec §17): shown over the graph with nothing written (proposal_shown_not_applied); each
// change accepted or rejected on its own, in a group or all at once (proposal_one_by_one, big_proposal); an accepted
// change written as text through the pane's own edit session, so it is checked first and undone like any other edit
// (accepting_is_an_edit); a rejected one leaving the graph as it was and recorded in the change set (rejecting_recorded);
// the proposer, the time and what it read shown, and a graph that has moved since said so before anything is accepted
// (proposal_provenance); and nothing decided but by a person who says who they are (person_decides). The review works on
// the note's text, which the host hands in and writes back when told it may: it never writes a note itself.
import { gqlSpans } from './blocks.ts';
import { readNote } from './drawing.ts';
import { PaneSession } from './pane.ts';
import { applyChange, namesOf, newProblems, notTaken } from './proposals-apply.ts';
import { basisOf, staleness } from './proposals-basis.ts';
import type { Stale } from './proposals-basis.ts';
import { marksOf, markOf, saidOf } from './proposals-marks.ts';
import type { MarkKind, Marks } from './proposals-marks.ts';
import { BIG_PROPOSAL, groupsOf, provenanceLines } from './proposals.ts';
import type { ChangeGroup, Proposal, ProposedChange } from './proposals.ts';
import { changeSetId, changeSetText, oneWord, readChangeSet } from './proposals-text.ts';
import type { Decision } from './proposals-text.ts';
import type { NoteReading } from './note-reading.ts';
import { replaceBlock } from './store.ts';

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
}

/** An accept or reject as it can be taken back: the sessions that wrote, the change set as it was, and what was decided. */
interface Step {
  sessions: PaneSession[];
  home: { before: string } | null;
  decided: Map<string, Decision>;
  basisNow: string | null;
}

const refuse = (reason: string, stale?: Stale): Reviewed => ({ ok: false, reason, ...(stale ? { stale } : {}) });
const textsOf = (note: string) => gqlSpans(note).map((s) => s.text);

/** A proposal and what has been decided about it so far. */
export class ProposalReview {
  readonly proposal: Proposal;
  /** The vault's shared schemas (§5), for a graph that names one: the host loads them. */
  shared: string[] = [];
  private decided: Map<string, Decision>;
  private basisNow: string | null;
  private readonly steps: Step[] = [];

  constructor(
    proposal: Proposal,
    decisions: ReadonlyMap<string, Decision> = new Map(),
    basisNow: string | null = null,
  ) {
    this.proposal = proposal;
    this.decided = new Map(decisions);
    this.basisNow = basisNow;
  }

  /** A review of the proposal a change set block holds, with the decisions recorded in it; or why it cannot be read. */
  static fromChangeSet(block: string): ProposalReview | { refused: string } {
    const r = readChangeSet(block);
    return 'refused' in r ? r : new ProposalReview(r.proposal, r.decisions, r.basisNow);
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

  /** The proposal as a change set, with what has been decided: what is written into the note to record it. */
  changeSetText(): string {
    return changeSetText(this.proposal, this.decided, this.basisNow);
  }

  /** The state of the graph the proposal is held against: where it was made, or where the last accepted change left it. */
  expected(): string {
    return this.basisNow ?? this.proposal.provenance.basis;
  }

  /** Whether the graph has moved since the proposal was made (or since the last change accepted from it); null if not. */
  staleness(note: string): Stale | null {
    return staleness(note, this.proposal.graph, this.expected(), this.shared);
  }

  /** The change set block of this proposal in the note, if the note holds it. */
  private home(note: string) {
    return gqlSpans(note).find((s) => {
      const h = changeSetId(s.text);
      return h?.id === this.proposal.id && h.graph === this.proposal.graph;
    });
  }

  /** Takes up the decisions the note's own change set records, if it holds this proposal's: the note is the record. */
  private sync(note: string): void {
    const home = this.home(note);
    const r = home && readChangeSet(home.text);
    if (r && !('refused' in r)) {
      this.decided = new Map(r.decisions);
      this.basisNow = r.basisNow;
    }
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
    return name === proposer && kind !== 'person'
      ? `${name} proposed this, and is not a person: a person decides`
      : null;
  }

  /**
   * Why a change cannot be accepted until another is: it needs a thing that one adds, or one that is not there at all;
   * null when what it needs is in `have`, the names the graph holds.
   */
  private lacking(c: ProposedChange, have: ReadonlySet<string>): string | null {
    for (const n of namesOf(c).needs) {
      if (have.has(n)) continue;
      const adds = this.proposal.changes.find(
        (o) => o !== c && this.state(o.id) === 'pending' && namesOf(o).writes.includes(n),
      );
      return adds
        ? `${c.id} needs ${adds.id}, which adds ${n}: accept ${adds.id} first`
        : `${c.id} needs ${n}, which is not in the graph`;
    }
    return null;
  }

  /** The first reason, if any, one of these changes cannot be accepted for what it needs, taken in order. */
  private unmet(chosen: readonly ProposedChange[], reading: NoteReading): string | null {
    const have = new Set(reading.world[this.proposal.graph]?.nodes.keys());
    for (const c of chosen) {
      const lack = this.lacking(c, have);
      if (lack) return lack;
      for (const n of namesOf(c).writes) have.add(n);
    }
    return null;
  }

  /**
   * The proposal over the note, and nothing written: each change marked, listed and read back, the changes waiting laid
   * over the graph for the host to draw, and whether the graph has moved since it was proposed.
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
      const lack = state === 'pending' ? this.lacking(c, have) : null;
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
        blocked: blocked.get(c.id) ?? null,
        ...(d ? { decision: d } : {}),
        ...(c.reason ? { reason: c.reason } : {}),
      };
    });
    return {
      reading,
      rows,
      groups: groupsOf(this.proposal, (id) => this.state(id)),
      marks: marksOf(reading, graph, waiting),
      provenance: provenanceLines(this.proposal),
      stale: this.staleness(note),
      grouped: this.proposal.changes.length > BIG_PROPOSAL,
    };
  }

  /** The note with this proposal's change set rewritten to record the decisions, and the change set as it was; null if the note holds none. */
  private record(
    note: string,
    decided: Map<string, Decision>,
    basisNow: string | null,
  ): { note: string; before: string } | null {
    const home = this.home(note);
    if (!home) return null;
    const text = changeSetText(this.proposal, decided, basisNow);
    const r = replaceBlock(note, { line: home.open, text: home.text }, text);
    return r.ok ? { note: r.note, before: home.text } : null;
  }

  /**
   * A person accepts changes: each is written as text through the pane's own edit session, in the order proposed,
   * checked there first, then read back to see it took effect, and the whole refused (nothing written) if any is not
   * allowed or leaves the graph with a problem it did not have. A proposal whose graph has moved is refused until the
   * person has seen that (`staleSeen`). The decision is recorded in the note's change set when the note holds it.
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
    const { graph } = this.proposal;
    const before = textsOf(note);
    const beforeReading = readNote(before, undefined, this.shared);
    const unmet = this.unmet(chosen, beforeReading);
    if (unmet) return refuse(unmet);
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
    for (const c of chosen) decided.set(c.id, { state: 'accepted', by: oneWord(by.name), at });
    const basisNow = basisOf(out, graph, this.shared);
    const recorded = this.record(out, decided, basisNow);
    this.steps.push({
      sessions,
      home: recorded ? { before: recorded.before } : null,
      decided: this.decided,
      basisNow: this.basisNow,
    });
    this.decided = decided;
    this.basisNow = basisNow;
    return { ok: true, note: recorded?.note ?? out, ids: chosen.map((c) => c.id) };
  }

  /**
   * A person rejects changes: the graph is left exactly as it was, and the rejection — who, and when — is recorded in the
   * note's change set when the note holds it, and in `changeSetText()` always.
   */
  reject(note: string, which: Which, by: Person, options: DecideOptions = {}): Reviewed {
    const nobody = this.notAPerson(by);
    if (nobody) return refuse(nobody);
    this.sync(note);
    const chosen = this.choose(which);
    if (typeof chosen === 'string') return refuse(chosen);
    if (!chosen.length) return { ok: true, note, ids: [] };
    const at = options.at ?? new Date().toISOString();
    const decided = new Map(this.decided);
    for (const c of chosen) decided.set(c.id, { state: 'rejected', by: oneWord(by.name), at });
    const recorded = this.record(note, decided, this.basisNow);
    this.steps.push({
      sessions: [],
      home: recorded ? { before: recorded.before } : null,
      decided: this.decided,
      basisNow: this.basisNow,
    });
    this.decided = decided;
    return { ok: true, note: recorded?.note ?? note, ids: chosen.map((c) => c.id) };
  }

  /** Takes back the last accept or reject: the text written is undone by the sessions that wrote it, and the change set is as it was. */
  undo(note: string): Reviewed {
    const step = this.steps.pop();
    if (!step) return refuse('nothing to undo');
    let out = note;
    const home = this.home(out);
    if (step.home && home) {
      const r = replaceBlock(out, { line: home.open, text: home.text }, step.home.before);
      if (!r.ok) return refuse(r.reason);
      out = r.note;
    }
    for (const session of [...step.sessions].reverse()) {
      const w = session.undo(out);
      if (!w.ok) return refuse(w.reason);
      out = w.note;
    }
    const ids = [...this.decided.keys()].filter((id) => step.decided.get(id) === undefined);
    this.decided = step.decided;
    this.basisNow = step.basisNow;
    return { ok: true, note: out, ids };
  }
}
