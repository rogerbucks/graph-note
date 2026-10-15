// The note behind a block editor (spec §4, §9): its text as last read or written, the session on the block being edited,
// and every change made to it — what is typed, Undo and Redo, Lock the graph — made safely (note-writing.ts), with what a
// refused write held kept as a draft in the plugin's data, never lost. The note is watched while it is edited: changed,
// it is read again; renamed or moved, it is followed; deleted, what is typed is kept as a draft. Each editor keeps its own
// draft, known by its id, so the pane and the card typed in at once never overwrite or forget each other's.
import { Notice, TFile } from 'obsidian';
import type { Component } from 'obsidian';
import {
  PaneSession,
  declareDeferred,
  declareDeferredBlock,
  gqlSpans,
  indentText,
  lockBlock,
  namesSharedSchema,
} from '@graph-note/core';
import type GraphNotePlugin from '../main';
import type { DeclaredDeferred } from '../graph-view/view-options';
import { keyBeside, keyOf, newDraftId } from '../drafts';
import { DELETED_MESSAGE } from './kept-draft';
import type { KeptDraft } from './kept-draft';
import { NOTE_DELETED, lockInNote, stepNote, writeThroughEditor, writeThroughVault } from './note-writing';
import type { Refused } from './note-writing';

/** What the session made of the note's new text: nothing to do, its block reloaded, or a conflict with what is typed. */
export type Reread = 'unchanged' | 'reloaded' | 'conflict';

/** The note a block editor edits, and its session on one block of it. */
export class BlockNote {
  /** The note's path. */
  path = '';
  /** The note's text, as last read or written. */
  text = '';
  /** The session on the block being edited, or null when the note has no graph block to edit. */
  session: PaneSession | null = null;
  private readonly plugin: GraphNotePlugin;

  constructor(plugin: GraphNotePlugin) {
    this.plugin = plugin;
  }

  /** The note's file, or the file at another path. */
  file(path = this.path): TFile | null {
    return this.plugin.app.vault.getFileByPath(path);
  }

  /** What the drafts of this note's graph are kept under. */
  private key(): string {
    return `${this.path}#${this.session?.graph ?? ''}`;
  }

  /** Reads the note at `path` and opens its block whose fence is on `line` (0-based), or its first graph block; false when there is no such note. */
  async open(path: string, line: number): Promise<boolean> {
    const file = this.file(path);
    if (!file) return false;
    this.path = path;
    this.text = await this.plugin.app.vault.read(file);
    try {
      this.session = new PaneSession(this.text, line);
      // read by the strictness set on the settings page (spec §21), as it is when each reading is made
      this.session.strictness = () => this.plugin.settings;
    } catch (e) {
      this.session = null;
      new Notice(String((e as Error).message));
    }
    if (this.session && gqlSpans(this.text).some((x) => namesSharedSchema(x.text)))
      this.session.shared = await this.plugin.sharedSchemas();
    return true;
  }

  /** Whether the session's stop by a copy of its block (§9) has been said, by a refused write kept as a draft. */
  private stopSaid = false;

  /**
   * Writes what is typed, when it changed, through the note's editor when it is open, else the vault; returns a refusal.
   * A note deleted meanwhile is refused too, so what is typed is kept as a draft, never dropped (nothing_typed_lost).
   * With `hold`, as typing rests, a session stopped by a copy whose stop was said already writes nothing to the note and
   * says nothing again: what is typed is saved quietly as this editor's own draft, so it is never held in memory alone
   * and nothing is lost if Obsidian closes or crashes (the review of #465).
   */
  async write(hold = false): Promise<Refused | null> {
    const s = this.session,
      file = this.file();
    if (!s || !s.dirty) return null;
    if (!file) return { reason: NOTE_DELETED, draft: s.text };
    if (!s.stopped) this.stopSaid = false;
    else if (hold && this.stopSaid) {
      await this.keepDraft(s.text);
      return null;
    }
    const keep = (note: string) => (this.text = note);
    const cm = this.plugin.editorFor(this.path);
    const r = cm ? writeThroughEditor(cm, s, keep) : await writeThroughVault(this.plugin.app.vault, file, s, keep);
    if (r?.stopped) this.stopSaid = true;
    return r;
  }

  /** Undo or Redo of the session's own changes to the note; returns a refusal. */
  async step(which: 'undo' | 'redo'): Promise<Refused | null> {
    const s = this.session,
      file = this.file();
    if (!s || !file) return null;
    return await stepNote(this.plugin.app.vault, file, s, which, (note) => (this.text = note));
  }

  /** Lock the graph: writes its schema as a new block after the graph's last block in the note (spec §8). */
  async lock(): Promise<void> {
    const s = this.session,
      file = this.file();
    if (!s || !file) return;
    const today = new Date().toISOString().slice(0, 10);
    const block = lockBlock(s.reading(this.text), s.graph, today, indentText(this.plugin.settings.indent));
    await lockInNote(this.plugin.app.vault, file, s.graph, block, (note) => (this.text = note));
    s.noteChanged(this.text);
  }

  /**
   * Park for later's fix (spec §5): Deferred and DEFERS declared in the schema of the graph being edited. When the schema
   * is written in the block being edited, the text to park into holds the declarations; when it is in another block, they
   * are written into the note through the vault, atomically against the note as it is now. Rejects with why it cannot.
   */
  async declareDeferred(indent: string): Promise<DeclaredDeferred> {
    const s = this.session,
      file = this.file();
    if (!s || !file) throw new Error('the note is not open');
    const { texts, index } = s.texts(this.text);
    const here = declareDeferredBlock(texts, s.graph, indent);
    if (here.block === index) return { text: here.text, whole: s.reading(this.text).whole[s.graph] };
    await this.plugin.app.vault.process(file, (data) => (this.text = declareDeferred(data, s.graph, indent)));
    s.noteChanged(this.text);
    return { text: s.text, whole: s.reading(this.text).whole[s.graph] };
  }

  /** The note's new text after `f` changed: what the session made of it, or null when `f` is another note or its text is the same. */
  async reread(f: TFile): Promise<Reread | null> {
    if (f.path !== this.path || !this.session) return null;
    const text = await this.plugin.app.vault.read(f);
    if (text === this.text) return null;
    this.text = text;
    return this.session.noteChanged(text);
  }

  /**
   * Watches the vault for the note changing under the editor, for as long as `owner` is loaded: changed, `on.changed` is
   * told what the session made of it; renamed or moved, alone or with its folder, the note is followed to its new path,
   * so what is typed keeps reaching it; deleted, `on.deleted` is told, with a notice when typing is not yet written.
   */
  watch(owner: Component, on: { changed: (outcome: Reread) => void; deleted: () => void }): void {
    const vault = this.plugin.app.vault;
    owner.registerEvent(
      vault.on('modify', (f) => {
        if (f instanceof TFile) void this.reread(f).then((outcome) => outcome && on.changed(outcome));
      }),
    );
    owner.registerEvent(vault.on('rename', (f, old) => this.renamed(f.path, old)));
    owner.registerEvent(
      vault.on('delete', (f) => {
        if (!this.isOrHolds(f.path)) return;
        if (this.session?.dirty) new Notice(DELETED_MESSAGE);
        on.deleted();
      }),
    );
  }

  /** Whether `path` is this note's, or a folder's it is in. */
  private isOrHolds(path: string): boolean {
    return !!this.path && (this.path === path || this.path.startsWith(`${path}/`));
  }

  /**
   * The note, or its folder, renamed or moved from `old` to `now`: followed there. Its drafts are moved by the plugin
   * itself, whether or not the note is being edited, their ids unchanged (drafts.ts), so this editor's own is still its.
   */
  private renamed(now: string, old: string): void {
    if (!this.isOrHolds(old)) return;
    this.path = now + this.path.slice(old.length);
  }

  /**
   * The id of this editor's own draft, once it has kept one: never another editor's, even one with the same text, and
   * the same under whatever key a rename moves it to.
   */
  private own: string | null = null;

  /** The draft to offer: this editor's own, once it has kept one; else the first kept for its block, to show only. */
  draft(): KeptDraft | undefined {
    const data = this.plugin.drafts(),
      key = this.key(),
      mine = this.own === null ? undefined : keyOf(data, this.own),
      first = Object.keys(data).find((k) => k === key || k.startsWith(`${key} (`));
    return data[mine ?? first ?? key];
  }

  /** The draft kept with `id`, if it is still kept. */
  draftById(id: string): KeptDraft | undefined {
    const data = this.plugin.drafts(),
      key = keyOf(data, id);
    return key === undefined ? undefined : data[key];
  }

  /**
   * Keeps what was typed as this editor's own draft of its block: its own draft changed in place, so no stale copy is
   * left beside it; else a new draft, with a new id, beside, never over, any other kept for the block.
   */
  async keepDraft(text: string): Promise<void> {
    const data = this.plugin.drafts(),
      mine = this.own === null ? undefined : keyOf(data, this.own),
      id = mine !== undefined && this.own !== null ? this.own : newDraftId();
    data[mine ?? keyBeside(data, this.key())] = { text, kept: new Date().toISOString(), id };
    this.own = id;
    await this.plugin.saveDrafts(data);
  }

  /** Forgets the draft kept with `id`, the one a banner showed; nothing at all when it is no longer kept. */
  async forget(id: string): Promise<void> {
    if (this.own === id) this.own = null;
    const data = this.plugin.drafts(),
      key = keyOf(data, id);
    if (key === undefined) return;
    delete data[key];
    await this.plugin.saveDrafts(data);
  }
}
