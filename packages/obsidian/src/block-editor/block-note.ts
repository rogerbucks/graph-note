// The note behind a block editor (spec §4, §9): its text as last read or written, the session on the block being edited,
// and every change made to it — what is typed, Undo and Redo, Lock the graph — made safely (note-writing.ts), with what a
// refused write held kept as a draft in the plugin's data, never lost.
import { Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import { PaneSession, gqlSpans, indentText, lockBlock, namesSharedSchema } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import type { KeptDraft } from './kept-draft';
import { lockInNote, stepNote, writeThroughEditor, writeThroughVault } from './note-writing';
import type { Refused } from './note-writing';

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

  /** Writes what is typed, when it changed, through the note's editor when it is open, else the vault; returns a refusal. */
  async write(): Promise<Refused | null> {
    const s = this.session,
      file = this.file();
    if (!s || !file || !s.dirty) return null;
    const keep = (note: string) => (this.text = note);
    const cm = this.plugin.editorFor(this.path);
    return cm ? writeThroughEditor(cm, s, keep) : await writeThroughVault(this.plugin.app.vault, file, s, keep);
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

  /** The note's new text after `f` changed: what the session made of it, or null when `f` is another note or its text is the same. */
  async reread(f: TFile): Promise<'unchanged' | 'reloaded' | 'conflict' | null> {
    if (f.path !== this.path || !this.session) return null;
    const text = await this.plugin.app.vault.read(f);
    if (text === this.text) return null;
    this.text = text;
    return this.session.noteChanged(text);
  }

  /** The draft kept for this block, if there is one. */
  draft(): KeptDraft | undefined {
    return this.plugin.drafts()[this.key()];
  }

  /** Keeps what was typed as this block's draft. */
  async keepDraft(text: string): Promise<void> {
    const data = this.plugin.drafts();
    data[this.key()] = { text, kept: new Date().toISOString() };
    await this.plugin.saveDrafts(data);
  }

  /** Forgets this block's draft. */
  async forget(): Promise<void> {
    const data = this.plugin.drafts();
    delete data[this.key()];
    await this.plugin.saveDrafts(data);
  }
}
