// The edit pane's session (spec §4, §9). It holds the block being edited and what has been typed into it. It writes
// what is typed back into the note. It refuses a write when the block changed meanwhile, keeping what was typed as a
// draft and reloading the block as it now is. It reloads a clean pane when the note changes under it. It undoes and
// redoes writes. The block is followed through each change by the lines around it (block-follow.ts), never to a copy of
// it. Host-free: the host reads and writes the note, and passes its text in.
import { followBlock } from './block-follow.ts';
import type { Followed } from './block-follow.ts';
import { gqlSpans, graphOfBlock } from './blocks.ts';
import type { Span } from './blocks.ts';
import { readNote } from './drawing.ts';
import { editRefusal, newNames } from './edit-check.ts';
import type { NoteReading } from './note-reading.ts';
import { writesPassword } from './secrets.ts';
import { History, replaceSpan } from './store.ts';
import type { BlockRef } from './store.ts';
import { underStrictness } from './strictness.ts';
import type { StrictnessSettings } from './strictness.ts';
import { word } from './words.ts';

/** One of a note's graph blocks, as the pane's picker offers it. */
export interface Choice {
  /** The 0-based line of the block's opening fence. */
  line: number;
  graph: string;
  label: string;
}

/**
 * What writing the pane's text into the note did: the new note, or why not and the draft kept.
 * - `edit`: an edit made for the person that the note written into refused (§4), rather than a block changed meanwhile.
 * - `history`: an Undo or Redo with nothing to take back, since the block changed outside the pane (§9). Nothing typed
 *   needs keeping.
 * - `stopped`: a refusal as the session cannot tell its block from a copy, nothing reloaded
 *   (block_followed_not_its_copy).
 */
export type PaneWrite =
  | { ok: true; note: string; unchanged?: true }
  | { ok: false; reason: string; draft: string; edit?: true; history?: true; stopped?: true };

/** Why Undo and Redo have nothing to take back once the block changed outside the pane (§9, undo_never_over_theirs). */
const nothingToStep = (step: 'undo' | 'redo') =>
  word(step === 'undo' ? 'editing.undo-elsewhere' : 'editing.redo-elsewhere');

/** Why the session stopped: a copy of its block it cannot tell from the block (§9, block_followed_not_its_copy). */
const twinSaid = () => word('editing.twin');

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
  /** The block: the line its fence opens on in the note last seen, and its text as the pane last read or wrote it. */
  ref: BlockRef;
  dirty = false;
  /** The vault's shared schemas (§5), for a graph that names one: the host loads them. */
  shared: string[] = [];
  private readonly history = new History();
  /** Whether undo or redo steps were dropped because the block changed outside the pane since they were written. */
  private readonly dropped = { undo: false, redo: false };
  /** Whether the session stopped, as it cannot tell its block from a copy (§9): until a block is chosen again. */
  private twin = false;
  /** Whether the last note taken as seen had a new block of its graph beside the block, followed warily (§9). */
  private wary = false;
  private lastNote = '';
  /** The names edits made for the person newly wrote, owed the check made as they are written. */
  private readonly owed = new Set<string>();

  constructor(note: string, line: number) {
    const blocks = graphBlocks(note);
    const b = blocks.find((x) => x.open === line) ?? blocks[0];
    if (!b) throw new Error(word('editing.no-block'));
    this.graph = b.graph;
    this.text = b.text;
    this.ref = { line: b.open, text: b.text };
    this.lastNote = note;
  }

  /** Whether the session has stopped, as it cannot tell its block from a copy (§9), until a block is chosen again. */
  get stopped(): boolean {
    return this.twin;
  }

  /** The graph blocks the picker offers, in the note last seen. */
  choices(): Choice[] {
    return graphBlocks(this.lastNote).map((b) => ({
      line: b.open,
      graph: b.graph,
      label: `${b.graph} · line ${b.open + 1}`,
    }));
  }

  /** The text of the graph block whose fence opens on `line` in the note last seen; undefined when none does. */
  blockText(line: number): string | undefined {
    return graphBlocks(this.lastNote).find((b) => b.open === line)?.text;
  }

  /**
   * Switches to another block of the note: the one whose fence opens on `line` in the note last seen. It starts its own
   * history, so Undo never writes one block's text into another (§9, undo_stays_in_its_block). A session stopped by a
   * copy goes on there. Write what was typed first. False, nothing changed, when no graph block opens on that line.
   */
  select(line: number): boolean {
    const b = graphBlocks(this.lastNote).find((x) => x.open === line);
    if (!b) return false;
    this.graph = b.graph;
    this.text = b.text;
    this.ref = { line: b.open, text: b.text };
    this.dirty = false;
    this.history.clear();
    this.dropped.undo = this.dropped.redo = false;
    this.twin = false;
    return true;
  }

  type(text: string): void {
    this.text = text;
    this.dirty = text !== this.ref.text;
  }

  /**
   * The texts of the note's gql blocks with what is typed in the edited block's place, and that block's index among them;
   * -1, with the texts as they are, when the note no longer holds the block or the session cannot tell it from a copy.
   */
  texts(note: string): { texts: string[]; index: number } {
    const spans = gqlSpans(note);
    const f = this.locate(note, spans);
    const index = 'at' in f ? f.at : -1;
    return { texts: spans.map((s, i) => (i === index ? this.text : s.text)), index };
  }

  /** Where the block is among `spans`, the note's gql blocks, followed from the note last seen (block-follow.ts). */
  private locate(note: string, spans: Span[]): Followed {
    if (this.twin) return { twin: true };
    if (note !== this.lastNote) return followBlock(this.lastNote, note, this.ref.line);
    const at = spans.findIndex((s) => s.open === this.ref.line);
    return at >= 0 ? { at } : { gone: true };
  }

  /**
   * Takes `note` as seen, the block followed into it (§9): its span there, its line kept in `ref`. Null when it is
   * gone, or when a copy of it cannot be told from it. That stops the session and drops its history until a block is
   * chosen again (block_followed_not_its_copy).
   */
  private follow(note: string): Span | null {
    const spans = gqlSpans(note);
    const f = this.locate(note, spans);
    this.lastNote = note;
    if ('twin' in f && !this.twin) {
      this.twin = true;
      this.changedElsewhere();
    }
    // followed warily: a new block of its graph beside it may be the original rewritten beside a copy. Its history
    // starts again, as after a change made outside, so Undo never reverts what may be the copy
    this.wary = 'wary' in f;
    if (this.wary) this.changedElsewhere();
    const span = 'at' in f ? spans[f.at] : undefined;
    if (span) this.ref = { line: span.open, text: this.ref.text };
    return span ?? null;
  }

  /** The note as it would read with what is typed — for the pane's own drawing, problems and suggestions. */
  reading(note: string): NoteReading {
    const { texts, index } = this.texts(note);
    const r = index >= 0 ? readNote(texts, index, this.shared) : readNote([this.text], 0, this.shared);
    return { ...r, problems: underStrictness(r.problems, this.strictness()) };
  }

  /**
   * The note as last seen, read with what is typed in the block's place. Last seen means opened, written or changed
   * under the pane. It is what an edit written into the block is checked against (§4). It is never a drawing made
   * before the note last changed.
   */
  current(): NoteReading {
    return this.reading(this.lastNote);
  }

  /** The strictness the note is read by (spec §21): the host's setting, asked each time; Forgiving unless set. */
  strictness: () => StrictnessSettings = () => ({ strictness: 'forgiving', allowed: [] });

  /**
   * An edit made for the person, as from the drawing, never typed. It is the text, with the names it newly writes owed
   * the check made as it is written (`write`), against the note written into (§4).
   */
  edit(text: string): void {
    for (const n of newNames(this.text, text)) this.owed.add(n);
    this.type(text);
  }

  /**
   * Writes what is typed into the note, or refuses, keeping it as a draft and reloading the block as it now is. It
   * refuses when the block changed meanwhile. It also refuses when an edit made for the person names a thing the note
   * draws only under a suggested name. So too when the edit gives a name another thing has (`editRefusal`). That is
   * checked here against this note, whatever was checked before.
   */
  write(note: string, step?: 'undo' | 'redo'): PaneWrite {
    const span = this.follow(note);
    const owed = [...this.owed];
    this.owed.clear();
    if (!this.dirty) return { ok: true, note, unchanged: true };
    if (!span || span.text !== this.ref.text) return this.refusedWrite(span);
    // an Undo or Redo is never written into a block followed warily, which may be a copy (the third review of #465)
    if (step && this.wary) return this.refusedWary(step);
    const refused = this.refusedEdit(note, owed) ?? this.refusedSecretWrite(span);
    if (refused) return refused;
    const r = replaceSpan(note, span, this.text);
    if (!step) {
      this.history.record(this.ref.text, this.text);
      this.dropped.redo = false; // a new write ends any redo, dropped or not
    }
    this.ref = r.ref;
    this.dirty = false;
    this.lastNote = r.note;
    return { ok: true, note: r.note };
  }

  /** An Undo or Redo refused as the block was just followed warily: the block as it is, its history dropped, saying so. */
  private refusedWary(step: 'undo' | 'redo'): PaneWrite {
    this.text = this.ref.text;
    this.dirty = false;
    this.dropped[step] = true;
    return { ok: false, reason: nothingToStep(step), draft: this.text, history: true };
  }

  /**
   * A write refused as the block changed, went or cannot be told from a copy. What was typed is kept as a draft. The
   * block is reloaded as it now is where there is one.
   */
  private refusedWrite(span: Span | null): PaneWrite {
    const draft = this.text;
    this.changedElsewhere();
    this.dirty = false;
    if (this.twin) return { ok: false, reason: twinSaid(), draft, stopped: true };
    if (!span) return { ok: false, reason: word('editing.block-gone'), draft };
    this.ref = { line: span.open, text: span.text };
    this.text = span.text;
    return { ok: false, reason: word('editing.block-changed'), draft };
  }

  /** A write refused as it puts a password into the block, which a graph never holds (secrets_named_only). */
  private refusedSecretWrite(span: Span): PaneWrite | null {
    if (!writesPassword(span.text, this.text)) return null;
    const draft = this.text;
    this.ref = { line: span.open, text: span.text };
    this.text = span.text;
    this.dirty = false;
    return { ok: false, reason: word('editing.password-refused'), draft, edit: true };
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

  /**
   * The note changed outside the pane. The result is nothing to do, the block reloaded into a clean pane, or a
   * conflict. A conflict comes with what is typed, or with a session stopped as it cannot tell its block from a copy
   * (§9). Its next write and Undo say so.
   */
  noteChanged(note: string): 'unchanged' | 'reloaded' | 'conflict' {
    const span = this.follow(note);
    if (this.twin) return 'conflict';
    if (span?.text === this.ref.text) return 'unchanged';
    this.changedElsewhere();
    if (this.dirty || !span || graphOfBlock(span.text) !== this.graph) return 'conflict';
    this.ref = { line: span.open, text: span.text };
    this.text = span.text;
    return 'reloaded';
  }

  /**
   * The block changed outside the pane: another program, a sync or another pane. The history starts again from the note
   * as it now is. No step written before can be taken back or put back without overwriting that change (§9,
   * undo_never_over_theirs; §26, cc_undo_safe). Undo and Redo then say why there is nothing to take back.
   */
  private changedElsewhere(): void {
    const had = this.history.canUndo() || this.history.canRedo();
    this.dropped.undo ||= had;
    this.dropped.redo ||= had;
    this.history.clear();
  }

  canUndo(): boolean {
    return !this.twin && (this.dirty || this.history.canUndo());
  }
  canRedo(): boolean {
    return !this.twin && this.history.canRedo();
  }

  /**
   * Why Undo or Redo has nothing to take back, or else null. Either the session stopped by a copy of its block it
   * cannot tell from it. Or its steps were dropped as the block changed outside the pane.
   */
  stepRefusal(which: 'undo' | 'redo'): string | null {
    if (this.twin) return twinSaid();
    const can = which === 'undo' ? this.canUndo() : this.canRedo();
    return !can && this.dropped[which] ? nothingToStep(which) : null;
  }

  /** An Undo or Redo refused for the history: why, with the block as it is, as nothing typed needs keeping. */
  private refusedStep(which: 'undo' | 'redo'): PaneWrite | null {
    const reason = this.stepRefusal(which);
    return reason ? { ok: false, reason, draft: this.text, history: true } : null;
  }

  private step(note: string, text: string | null, which: 'undo' | 'redo'): PaneWrite {
    if (text === null) return { ok: true, note, unchanged: true };
    this.text = text;
    this.dirty = text !== this.ref.text;
    return this.write(note, which);
  }

  /**
   * Undoes the last write; typing not yet written is written first, so it can be redone. The note it is pressed on is
   * followed first, as `noteChanged` would. So a stop or a block followed warily refuses it before it is checked, heard
   * or not (the third review of #465). Never a write made before the block changed outside the pane: refused then,
   * saying why (`history`).
   */
  undo(note: string): PaneWrite {
    this.follow(note);
    if (this.dirty) {
      const w = this.write(note);
      if (!w.ok) return w;
      note = w.note;
    }
    return this.refusedStep('undo') ?? this.step(note, this.history.undo(), 'undo');
  }

  /**
   * Redoes the last undo, the note followed first as for Undo. Never one made before the block changed outside the
   * pane, or into a block followed warily: refused then, saying why.
   */
  redo(note: string): PaneWrite {
    this.follow(note);
    return this.refusedStep('redo') ?? this.step(note, this.history.redo(), 'redo');
  }
}
