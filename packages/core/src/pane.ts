// The edit pane's session (spec §4, §9). It holds the block being edited and what has been typed into it; writes what is
// typed back into the note; refuses a write when the block changed meanwhile, keeping what was typed as a draft and
// reloading the block as it now is; reloads a clean pane when the note changes under it; and undoes and redoes writes.
// Host-free: the host reads and writes the note, and passes its text in.
import { gqlSpans, graphOfBlock, readNote } from './drawing.ts';
import type { NoteReading } from './drawing.ts';
import { History, replaceBlock } from './store.ts';
import type { BlockRef } from './store.ts';

/** One of a note's graph blocks, as the pane's picker offers it. */
export interface Choice {
  /** The 0-based line of the block's opening fence. */
  line: number;
  graph: string;
  label: string;
}

/** What writing the pane's text into the note did: the new note, or why not and the draft kept. */
export type PaneWrite = { ok: true; note: string; unchanged?: true } | { ok: false; reason: string; draft: string };

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
  private lastNote = '';

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

  /** The note as it would read with what is typed — for the pane's own drawing, problems and suggestions. */
  reading(note: string): NoteReading {
    const spans = gqlSpans(note);
    const at = spans.findIndex((s) => s.open === this.ref.line && s.text === this.ref.text);
    const index = at >= 0 ? at : spans.findIndex((s) => s.text === this.ref.text);
    const texts = spans.map((s, i) => (i === index ? this.text : s.text));
    return index >= 0 ? readNote(texts, index, this.shared) : readNote([this.text], 0, this.shared);
  }

  /** Writes what is typed into the note, or refuses — keeping it as a draft and reloading the block as it now is. */
  write(note: string, record = true): PaneWrite {
    this.lastNote = note;
    if (!this.dirty) return { ok: true, note, unchanged: true };
    const r = replaceBlock(note, this.ref, this.text);
    if (r.ok) {
      if (record) this.history.record(this.ref.text, this.text);
      this.ref = r.ref;
      this.dirty = false;
      this.lastNote = r.note;
      return { ok: true, note: r.note };
    }
    const draft = this.text;
    if (r.current) {
      this.ref = { line: r.current.line - 1, text: r.current.text };
      this.text = r.current.text;
    }
    this.dirty = false;
    return { ok: false, reason: r.reason, draft };
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
    if (this.dirty) return 'conflict';
    const here = spans.find((s) => s.open === this.ref.line && graphOfBlock(s.text) === this.graph);
    if (!here) return 'conflict';
    this.ref = { line: here.open, text: here.text };
    this.text = here.text;
    return 'reloaded';
  }

  canUndo(): boolean {
    return this.dirty || this.history.canUndo();
  }
  canRedo(): boolean {
    return this.history.canRedo();
  }

  private step(note: string, text: string | null): PaneWrite {
    if (text === null) return { ok: true, note, unchanged: true };
    this.text = text;
    this.dirty = text !== this.ref.text;
    return this.write(note, false);
  }

  /** Undoes the last write; typing not yet written is written first, so it can be redone. */
  undo(note: string): PaneWrite {
    if (this.dirty) {
      const w = this.write(note);
      if (!w.ok) return w;
      note = w.note;
    }
    return this.step(note, this.history.undo());
  }

  redo(note: string): PaneWrite {
    return this.step(note, this.history.redo());
  }
}
