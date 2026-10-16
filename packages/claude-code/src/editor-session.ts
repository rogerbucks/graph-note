// The page's side of a note open in the browser editor (spec §26, cc_redrawn_on_change, cc_undo_safe), on the core's
// PaneSession and TextHistory: what is typed into a block, the note and the version the page last had from the
// server, and what to write, always against that version, so the server refuses a write made over a change it has not
// seen. A change on disk is drawn again or said to be a conflict, keeping what is typed (`changed`). Undo never undoes
// over another program's change: once one has changed the block, the writes made before it are no longer undone, and
// undo says so instead; the typing history starts again from the block as reloaded, so it cannot bring theirs back.
// Host-free: the page sends what `write` and `undo` give, and passes back what the server answers.
import { PaneSession, TextHistory, type Change, type TextState } from '@graph-note/core';

/** What a change on disk did to the page: nothing to its block, the block drawn again, or a conflict with what is typed. */
export type Redraw = 'unchanged' | 'reloaded' | 'conflict';

/**
 * What to send: the whole note, against the version the page had (the server's If-Match); `unchanged` when there is
 * nothing to send. Or why not, with what was typed kept as a draft when there is one.
 */
export type ToWrite =
  | { ok: true; note: string; against: string; unchanged?: true }
  | { ok: false; reason: string; draft?: string; edit?: true; history?: true; stopped?: true };

/** Undo's refusal once another program has changed the block. */
export const UNDO_OVER_THEIRS =
  'Another program changed this graph block since your last change here, so undoing now would undo its change too. ' +
  'Nothing was undone.';

const caretAtEnd = (text: string): TextState => ({ text, start: text.length, end: text.length });

/** One block of one note, as the page edits it. */
export class EditorSession {
  private readonly pane: PaneSession;
  private readonly typing: TextHistory;
  private note: string;
  /** The version of the note the page last had: what every write is made against. */
  version: string;
  /** The page's own writes, and undos, since another program last changed the block: all that may be undone, redone. */
  private undoable = 0;
  private redoable = 0;

  /** The note as the server gave it, its version, and the fence line of the block to edit (the first by default). */
  constructor(note: string, version: string, line = -1) {
    this.pane = new PaneSession(note, line);
    this.note = note;
    this.version = version;
    this.typing = new TextHistory(caretAtEnd(this.pane.text));
  }

  /** The block as the page shows it. */
  get text(): string {
    return this.pane.text;
  }

  /** The core's session on the block, which the shared block editor types into and reads. */
  get session(): PaneSession {
    return this.pane;
  }

  /** The note as the page last had it or wrote it. */
  get current(): string {
    return this.note;
  }

  /** What is typed, with its selection. */
  type(state: TextState, change: Change = 'typing'): void {
    this.typing.record(state, change);
    this.pane.type(state.text);
  }

  /** The typing before the last step, to show; null when there is none. */
  undoTyping(): TextState | null {
    const state = this.typing.undo();
    if (state) this.pane.type(state.text);
    return state;
  }

  /** The note as the server now has it, from the change stream or a refused write. */
  changed(note: string, version: string): Redraw {
    if (version === this.version) return 'unchanged';
    this.note = note;
    this.version = version;
    const redraw = this.pane.noteChanged(note);
    if (redraw === 'unchanged') return redraw;
    this.undoable = 0;
    this.redoable = 0;
    if (redraw === 'reloaded') this.typing.reset(caretAtEnd(this.pane.text));
    return redraw;
  }

  /** The note with what is typed written in, to send against `version`. */
  write(): ToWrite {
    const against = this.version;
    const w = this.pane.write(this.note);
    if (!w.ok) return w;
    if (w.unchanged) return { ok: true, note: w.note, against, unchanged: true };
    this.note = w.note;
    this.undoable++;
    this.redoable = 0;
    return { ok: true, note: w.note, against };
  }

  /** The server took what was sent: its new version. */
  written(version: string): void {
    this.version = version;
  }

  /**
   * The page wrote `note` whole itself, as Lock the graph or declaring Deferred does, and the server took it as `version`:
   * the note now, its block followed as it is in it. Not a change by another program, so no history is dropped.
   */
  wrote(note: string, version: string): Redraw {
    this.note = note;
    this.version = version;
    return this.pane.noteChanged(note);
  }

  /** The note with the last write undone (what is typed written first), or why not: never over another's change. */
  undo(): ToWrite {
    const against = this.version;
    if (this.pane.dirty) {
      const w = this.write();
      if (!w.ok) return w;
    }
    return this.step(against, 'undo');
  }

  /** The note with the last undo redone, or why not: never over another's change. */
  redo(): ToWrite {
    return this.step(this.version, 'redo');
  }

  private step(against: string, way: 'undo' | 'redo'): ToWrite {
    // the core drops the steps written before another program changed the block (undo_never_over_theirs), and says so;
    // stopped by a copy of the block it cannot tell from it, it says that in its own words (block_followed_not_its_copy)
    const why = this.pane.stepRefusal(way);
    // a refusal for the history needs no draft: nothing typed is lost (`history`, as the pane's own are marked)
    if (why) return { ok: false, reason: this.pane.stopped ? why : UNDO_OVER_THEIRS, history: true };
    const can = way === 'undo' ? this.pane.canUndo() : this.pane.canRedo();
    if (!can) return { ok: true, note: this.note, against, unchanged: true };
    if ((way === 'undo' ? this.undoable : this.redoable) === 0)
      return { ok: false, reason: UNDO_OVER_THEIRS, history: true };
    const w = way === 'undo' ? this.pane.undo(this.note) : this.pane.redo(this.note);
    if (!w.ok) return w;
    this.note = w.note;
    this.undoable += way === 'undo' ? -1 : 1;
    this.redoable += way === 'undo' ? 1 : -1;
    return { ok: true, note: w.note, against };
  }
}
