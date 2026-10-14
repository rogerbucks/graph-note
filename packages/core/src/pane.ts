// The edit pane's session (spec §4, §9). It holds the block being edited and what has been typed into it; writes what is
// typed back into the note; refuses a write when the block changed meanwhile, keeping what was typed as a draft and
// reloading the block as it now is; reloads a clean pane when the note changes under it; and undoes and redoes writes.
// Host-free: the host reads and writes the note, and passes its text in.
import { gqlSpans, graphOfBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { editRefusal, newNames } from './edit-check.ts';
import type { NoteReading } from './note-reading.ts';
import { History, replaceBlock } from './store.ts';
import type { BlockRef } from './store.ts';
import { underStrictness } from './strictness.ts';
import type { StrictnessSettings } from './strictness.ts';

/** One of a note's graph blocks, as the pane's picker offers it. */
export interface Choice {
  /** The 0-based line of the block's opening fence. */
  line: number;
  graph: string;
  label: string;
}

/**
 * What writing the pane's text into the note did: the new note, or why not and the draft kept. `edit` marks an edit made
 * for the person that the note written into refused (§4), rather than a block changed meanwhile; `history` an Undo or
 * Redo with nothing to take back since the block changed outside the pane (§9), where nothing typed needs keeping.
 */
export type PaneWrite =
  | { ok: true; note: string; unchanged?: true }
  | { ok: false; reason: string; draft: string; edit?: true; history?: true };

/** Why Undo and Redo have nothing to take back once the block changed outside the pane (§9, undo_never_over_theirs). */
const CHANGED_ELSEWHERE = {
  undo: 'Nothing to undo: another program, a sync or another pane changed this block since, and undoing would overwrite that change.',
  redo: 'Nothing to redo: another program, a sync or another pane changed this block since, and redoing would overwrite that change.',
};

/** The note's graph blocks, each with its fence line and its graph. */
function graphBlocks(note: string) {
  return gqlSpans(note).flatMap((s) => {
    const graph = graphOfBlock(s.text);
    return graph ? [{ ...s, graph }] : [];
  });
}

/** The edit pane's state for one block of one note (spec §4): its text, history, reading and writing back. */
export class PaneSession {
  graph: string;
  /** What the pane shows: the block as typed. */
  text: string;
  /** The block as the pane last read or wrote it. */
  ref: BlockRef;
  dirty = false;
  /** The vault's shared schemas (§5), for a graph that names one: the host loads them. */
  shared: string[] = [];
  private readonly history = new History();
  /** Whether undo or redo steps were dropped because the block changed outside the pane since they were written. */
  private readonly dropped = { undo: false, redo: false };
  private lastNote = '';
  /** The names edits made for the person newly wrote, owed the check made as they are written. */
  private readonly owed = new Set<string>();

  constructor(note: string, line: number) {
    const blocks = graphBlocks(note);
    const b = blocks.find((x) => x.open === line) ?? blocks[0];
    if (!b) throw new Error('this note has no graph block to edit');
    this.graph = b.graph;
    this.text = b.text;
    this.ref = { line: b.open, text: b.text };
    this.lastNote = note;
  }

  /** The graph blocks the picker offers, in the note last seen. */
  choices(): Choice[] {
    return graphBlocks(this.lastNote).map((b) => ({
      line: b.open,
      graph: b.graph,
      label: `${b.graph} · line ${b.open + 1}`,
    }));
  }

  /** Switches to another block of the note. Write what was typed first. */
  select(line: number): void {
    const b = graphBlocks(this.lastNote).find((x) => x.open === line);
    if (!b) return;
    this.graph = b.graph;
    this.text = b.text;
    this.ref = { line: b.open, text: b.text };
    this.dirty = false;
  }

  type(text: string): void {
    this.text = text;
    this.dirty = text !== this.ref.text;
  }

  /**
   * The texts of the note's gql blocks with what is typed in the edited block's place, and that block's index among them;
   * -1, with the texts as they are, when the note no longer holds the block.
   */
  texts(note: string): { texts: string[]; index: number } {
    const spans = gqlSpans(note);
    const at = spans.findIndex((s) => s.open === this.ref.line && s.text === this.ref.text);
    const index = at >= 0 ? at : spans.findIndex((s) => s.text === this.ref.text);
    return { texts: spans.map((s, i) => (i === index ? this.text : s.text)), index };
  }

  /** The note as it would read with what is typed — for the pane's own drawing, problems and suggestions. */
  reading(note: string): NoteReading {
    const { texts, index } = this.texts(note);
    const r = index >= 0 ? readNote(texts, index, this.shared) : readNote([this.text], 0, this.shared);
    return { ...r, problems: underStrictness(r.problems, this.strictness()) };
  }

  /**
   * The note as last seen — opened, written or changed under the pane — read with what is typed in the block's place:
   * what an edit written into the block is checked against (§4), never a drawing made before the note last changed.
   */
  current(): NoteReading {
    return this.reading(this.lastNote);
  }

  /** The strictness the note is read by (spec §21): the host's setting, asked each time; Forgiving unless set. */
  strictness: () => StrictnessSettings = () => ({ strictness: 'forgiving', allowed: [] });

  /**
   * An edit made for the person, as from the drawing, never typed: the text, with the names it newly writes owed the
   * check made as it is written (`write`), against the note written into (§4).
   */
  edit(text: string): void {
    for (const n of newNames(this.text, text)) this.owed.add(n);
    this.type(text);
  }

  /**
   * Writes what is typed into the note, or refuses — keeping it as a draft and reloading the block as it now is: when the
   * block changed meanwhile, and when an edit made for the person names a thing the note draws only under a suggested
   * name, or gives a name another thing has (`editRefusal`), checked here against this note, whatever was checked before.
   */
  write(note: string, record = true): PaneWrite {
    this.lastNote = note;
    const owed = [...this.owed];
    this.owed.clear();
    if (!this.dirty) return { ok: true, note, unchanged: true };
    const refused = this.refusedEdit(note, owed);
    if (refused) return refused;
    const r = replaceBlock(note, this.ref, this.text);
    if (r.ok) {
      if (record) {
        this.history.record(this.ref.text, this.text);
        this.dropped.redo = false; // a new write ends any redo, dropped or not
      }
      this.ref = r.ref;
      this.dirty = false;
      this.lastNote = r.note;
      return { ok: true, note: r.note };
    }
    const draft = this.text;
    this.changedElsewhere();
    if (r.current) {
      this.ref = { line: r.current.line - 1, text: r.current.text };
      this.text = r.current.text;
    }
    this.dirty = false;
    return { ok: false, reason: r.reason, draft };
  }

  /** The refusal of an edit's owed names by the note written into, with the block reloaded as it is there; or null. */
  private refusedEdit(note: string, owed: string[]): PaneWrite | null {
    if (!owed.length) return null;
    const { texts, index } = this.texts(note);
    const block = gqlSpans(note)[index];
    const reason = block ? editRefusal(texts, index, this.graph, owed) : null;
    if (!block || !reason) return null;
    const draft = this.text;
    this.ref = { line: block.open, text: block.text };
    this.text = block.text;
    this.dirty = false;
    return { ok: false, reason, draft, edit: true };
  }

  /** The note changed outside the pane: nothing to do, the block reloaded into a clean pane, or a conflict with what is typed. */
  noteChanged(note: string): 'unchanged' | 'reloaded' | 'conflict' {
    this.lastNote = note;
    const spans = gqlSpans(note);
    const same = spans.filter((s) => s.text === this.ref.text);
    const found =
      spans.find((s) => s.open === this.ref.line && s.text === this.ref.text) ??
      (same.length === 1 ? same[0] : undefined);
    if (found) {
      this.ref = { line: found.open, text: found.text };
      return 'unchanged';
    }
    this.changedElsewhere();
    if (this.dirty) return 'conflict';
    const here = spans.find((s) => s.open === this.ref.line && graphOfBlock(s.text) === this.graph);
    if (!here) return 'conflict';
    this.ref = { line: here.open, text: here.text };
    this.text = here.text;
    return 'reloaded';
  }

  /**
   * The block changed outside the pane — another program, a sync or another pane: the history starts again from the
   * note as it now is, as no step written before can be taken back or put back without overwriting that change (§9,
   * undo_never_over_theirs; §26, cc_undo_safe). Undo and Redo then say why there is nothing to take back.
   */
  private changedElsewhere(): void {
    const had = this.history.canUndo() || this.history.canRedo();
    this.dropped.undo ||= had;
    this.dropped.redo ||= had;
    this.history.clear();
  }

  canUndo(): boolean {
    return this.dirty || this.history.canUndo();
  }
  canRedo(): boolean {
    return this.history.canRedo();
  }

  /** Why Undo or Redo has nothing to take back, its steps dropped as the block changed outside the pane; else null. */
  stepRefusal(which: 'undo' | 'redo'): string | null {
    const can = which === 'undo' ? this.canUndo() : this.canRedo();
    return !can && this.dropped[which] ? CHANGED_ELSEWHERE[which] : null;
  }

  /** An Undo or Redo refused for the history: why, with the block as it is, as nothing typed needs keeping. */
  private refusedStep(note: string, which: 'undo' | 'redo'): PaneWrite | null {
    const reason = this.stepRefusal(which);
    if (!reason) return null;
    this.lastNote = note;
    return { ok: false, reason, draft: this.text, history: true };
  }

  private step(note: string, text: string | null): PaneWrite {
    if (text === null) return { ok: true, note, unchanged: true };
    this.text = text;
    this.dirty = text !== this.ref.text;
    return this.write(note, false);
  }

  /**
   * Undoes the last write; typing not yet written is written first, so it can be redone. Never a write made before the
   * block changed outside the pane: refused then, saying why (`history`).
   */
  undo(note: string): PaneWrite {
    if (this.dirty) {
      const w = this.write(note);
      if (!w.ok) return w;
      note = w.note;
    }
    return this.refusedStep(note, 'undo') ?? this.step(note, this.history.undo());
  }

  /** Redoes the last undo; never one made before the block changed outside the pane: refused then, saying why. */
  redo(note: string): PaneWrite {
    return this.refusedStep(note, 'redo') ?? this.step(note, this.history.redo());
  }
}
