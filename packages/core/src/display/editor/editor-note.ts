// What the block editor asks of the note it edits (spec §4, §9; editor spec §26, cc_core_only). The editor is the
// display layer's, and the same in the Obsidian pane and on the browser editor's page. Where the note lives, and how it
// is written safely, are each host's. Obsidian's note is the vault (block-note.ts) and the page's is the editor
// server's store (page/page-note.ts). Both write through the core's `PaneSession`, which never overwrites a block
// changed meanwhile. So the same edit writes the same bytes in either (cc_same_bytes).
import type { PaneSession } from '@thoughtknot/core';
import type { DeclaredDeferred } from '../graph-view/view-options';

/**
 * A write the note refused, because its block changed meanwhile. Or (`edit`) the note refused an edit made from the
 * drawing (§4). It gives why, and what was typed, to keep as a draft. `history` marks an Undo or Redo with nothing to
 * take back since the block changed outside the editor (§9). It gives only why, as nothing typed needs keeping.
 * `stopped` marks the session stopped by a copy of its block it cannot tell from it. Nothing is reloaded
 * (block_followed_not_its_copy).
 */
export interface Refused {
  reason: string;
  draft: string;
  edit?: true;
  history?: true;
  stopped?: true;
}

/** Why a write found no note to write into: it was deleted while its block was edited (spec §9). */
export const NOTE_DELETED = 'the note was deleted';

/** What the session made of the note's new text: nothing to do, its block reloaded, or a conflict with what is typed. */
export type Reread = 'unchanged' | 'reloaded' | 'conflict';

/** A draft kept for a block: the text, when it was kept, and its id, given once when it is first kept and never again. */
export interface KeptDraft {
  text: string;
  kept: string;
  id: string;
}

/** The note a block editor edits, and its session on one block of it. */
export interface EditorNote {
  /** The note's path, or the id it is known by; empty until a note is opened. */
  readonly path: string;
  /** The note's text, as last read or written. */
  readonly text: string;
  /** The session on the block being edited, or null when the note has no graph block to edit. */
  readonly session: PaneSession | null;
  /** What is said when the note is deleted while what was typed is not yet written; it names how to recover the draft. */
  readonly deletedMessage: string;
  /** Whether the note is still there to write into. */
  exists(): boolean;
  /** Reads the note and opens its block whose fence is on `line` (0-based), or its first graph block; false when there is no such note. */
  open(path: string, line: number): Promise<boolean>;
  /** Writes what is typed, when it changed; returns a refusal. With `hold`, as typing rests, a stopped session writes nothing again. */
  write(hold?: boolean): Promise<Refused | null>;
  /** Undo or Redo of the session's own changes to the note; returns a refusal. */
  step(which: 'undo' | 'redo'): Promise<Refused | null>;
  /** Lock the graph: writes its schema as a new block after the graph's last block in the note (spec §8). */
  lock(): Promise<void>;
  /** Park for later's fix (spec §5): Deferred and DEFERS declared in the schema of the graph being edited. Rejects with why not. */
  declareDeferred(indent: string): Promise<DeclaredDeferred>;
  /**
   * Watches the note for changing under the editor: changed, `on.changed` is told what the session made of it; deleted,
   * `on.deleted` is told. Returns how to stop.
   */
  watch(on: { changed: (outcome: Reread) => void; deleted: () => void }): () => void;
  /** The draft to offer: this editor's own, once it has kept one; else the first kept for its block. */
  draft(): KeptDraft | undefined;
  /** The draft kept with `id`, if it is still kept. */
  draftById(id: string): KeptDraft | undefined;
  /** Keeps what was typed as this editor's own draft of its block. */
  keepDraft(text: string): Promise<void>;
  /** Forgets the draft kept with `id`. */
  forget(id: string): Promise<void>;
}
