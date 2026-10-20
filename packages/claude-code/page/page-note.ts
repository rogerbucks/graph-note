// The note behind the block editor on the browser editor's page (spec §26; cc_editor_opens, cc_same_bytes). What
// Obsidian's `BlockNote` is to the vault, this is to the editor server's note store. The editor is the display layer's,
// the same one Obsidian runs.
// - The core's session (`EditorSession` over `PaneSession`) makes every write, from the note as the page last had it.
// - The write is sent whole, against that version.
// - So the server refuses one made over a change it has not seen (cc_write_if_unchanged).
// - The note written is byte for byte the one Obsidian would write for the same edit.
// A refused write keeps what was typed as the server's draft. The block is shown as the note now has it, as the pane's
// is.
import { declareDeferred, declareDeferredBlock, indentText, lockBlock } from '@thoughtknot/core';
import type { PaneSession, Settings } from '@thoughtknot/core';
import { NOTE_DELETED } from '@thoughtknot/core/display/editor/editor-note';
import type { EditorNote, KeptDraft, Refused, Reread } from '@thoughtknot/core/display/editor/editor-note';
import { lockFailed, lockedNote } from '@thoughtknot/core/display/editor/lock-text';
import type { DeclaredDeferred } from '@thoughtknot/core/display/graph-view/view-options';
import { notice } from '@thoughtknot/core/display/host';
import { EditorSession } from '../src/editor-session.ts';
import type { ToWrite } from '../src/editor-session.ts';
import type { FollowLine, Written } from './note-calls.ts';
import type { NoteReply } from './server-calls.ts';

/** What is said when the note is deleted while what was typed is not yet written. */
export const DELETED_ON_PAGE =
  'The note was deleted while you were typing. What you typed is kept as a draft by the editor, and is offered again if the note comes back.';

/** The page's calls on one note. */
export interface PageNoteCalls {
  read: (id: string) => Promise<NoteReply>;
  write: (id: string, text: string, version: string) => Promise<Written>;
  keepDraft: (id: string, text: string, version: string) => Promise<boolean>;
}

/** A note as the page last had it from the server. */
export interface Seen {
  text: string;
  version: string;
}

let drafts = 0;

/** The note the page edits, by the id the server gave: its block's session, its writes, its drafts. */
export class PageNote implements EditorNote {
  readonly deletedMessage = DELETED_ON_PAGE;
  path = '';
  session: PaneSession | null = null;
  private es: EditorSession | null = null;
  private seen: Seen;
  private gone = false;
  private stopSaid = false;
  private on: { changed: (outcome: Reread) => void; deleted: () => void } | null = null;
  private kept: KeptDraft | undefined;
  private own: KeptDraft | undefined;
  /** Told the note's text and version whenever the page has a new one, from the server or from its own write. */
  onSeen?: (seen: Seen) => void;

  private readonly id: string;
  private readonly calls: PageNoteCalls;
  private readonly settings: Settings;

  /** The note `id` as the server first gave it (`first`), with the settings the core reads it by. */
  constructor(id: string, calls: PageNoteCalls, settings: Settings, first: NoteReply) {
    this.id = id;
    this.calls = calls;
    this.settings = settings;
    this.seen = { text: first.text, version: first.version };
    this.kept = this.keptFrom(first.draft);
  }

  /** The note as the page last had it. */
  get text(): string {
    return this.seen.text;
  }

  /** The version of the note the page last had, which every write is made against. */
  get version(): string {
    return this.es?.version ?? this.seen.version;
  }

  exists(): boolean {
    return !this.gone;
  }

  async open(_path: string, line: number): Promise<boolean> {
    this.path = this.id;
    try {
      this.es = new EditorSession(this.seen.text, this.seen.version, line);
      this.session = this.es.session;
      // read by the strictness set on the settings page (spec §21), as Obsidian's pane reads it
      this.session.strictness = () => this.settings;
    } catch (e) {
      this.es = null;
      this.session = null;
      notice(String((e as Error).message));
    }
    return Promise.resolve(true);
  }

  /** The change stream's line: the note as it now is, or that it is gone. */
  feed(line: FollowLine): void {
    if ('gone' in line) {
      this.gone = true;
      if (this.session?.dirty) notice(this.deletedMessage);
      this.on?.deleted();
      return;
    }
    this.gone = false;
    if (line.version === this.version && line.text === this.seen.text) return;
    this.seen = { text: line.text, version: line.version };
    const outcome = this.es?.changed(line.text, line.version);
    this.onSeen?.(this.seen);
    if (outcome) this.on?.changed(outcome);
  }

  /** The page's own whole-note write, as a decision on a proposal is: against the version last had. */
  writeWhole(text: string): Promise<Written> {
    return this.queued(() => this.putWhole(text));
  }

  /**
   * One write, undo, redo or lock at a time. Each is made from the note as the one before it left it. It is made
   * against the version the server gave for that. So a write begun while another is on its way is never made over it.
   * The vault's own `process` does this for Obsidian's pane.
   */
  private tail: Promise<unknown> = Promise.resolve();
  private queued<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async putWhole(text: string): Promise<Written> {
    const w = await this.calls.write(this.id, text, this.version);
    if (w.ok) {
      this.seen = { text, version: w.version };
      const outcome = this.es?.wrote(text, w.version);
      this.onSeen?.(this.seen);
      if (outcome) this.on?.changed(outcome);
    } else if (w.theirs) this.feed(w.theirs);
    return w;
  }

  write(hold = false): Promise<Refused | null> {
    return this.queued(async () => {
      const s = this.session,
        es = this.es;
      if (!s || !es || !s.dirty) return null;
      if (this.gone) return { reason: NOTE_DELETED, draft: s.text };
      if (!s.stopped) this.stopSaid = false;
      else if (hold && this.stopSaid) {
        await this.keepDraft(s.text);
        return null;
      }
      const r = await this.send(es.write(), s);
      if (r?.stopped) this.stopSaid = true;
      return r;
    });
  }

  step(which: 'undo' | 'redo'): Promise<Refused | null> {
    return this.queued(() => {
      const s = this.session,
        es = this.es;
      if (!s || !es) return Promise.resolve(null);
      return this.send(which === 'undo' ? es.undo() : es.redo(), s);
    });
  }

  lock(): Promise<void> {
    return this.queued(async () => {
      const s = this.session;
      if (!s) return;
      const today = new Date().toISOString().slice(0, 10);
      const block = lockBlock(s.reading(this.seen.text), s.graph, today, indentText(this.settings.indent));
      const locked = lockedNote(this.seen.text, s.graph, block);
      if (locked === null) return notice(lockFailed());
      const w = await this.putWhole(locked);
      if (!w.ok) notice(w.why);
    });
  }

  declareDeferred(indent: string): Promise<DeclaredDeferred> {
    return this.queued(async () => {
      const s = this.session;
      if (!s) throw new Error('the note is not open');
      const { texts, index } = s.texts(this.seen.text);
      const here = declareDeferredBlock(texts, s.graph, indent);
      if (here.block === index) return { text: here.text, whole: s.reading(this.seen.text).whole[s.graph] };
      const w = await this.putWhole(declareDeferred(this.seen.text, s.graph, indent));
      if (!w.ok) throw new Error(w.why);
      return { text: s.text, whole: s.reading(this.seen.text).whole[s.graph] };
    });
  }

  watch(on: { changed: (outcome: Reread) => void; deleted: () => void }): () => void {
    this.on = on;
    return () => {
      if (this.on === on) this.on = null;
    };
  }

  draft(): KeptDraft | undefined {
    return this.own ?? this.kept;
  }

  draftById(id: string): KeptDraft | undefined {
    return [this.own, this.kept].find((d) => d?.id === id);
  }

  async keepDraft(text: string): Promise<void> {
    this.own = { text, kept: new Date().toISOString(), id: this.own?.id ?? `page-draft-${++drafts}` };
    await this.calls.keepDraft(this.id, text, this.version);
  }

  async forget(id: string): Promise<void> {
    if (this.draftById(id) === undefined) return;
    this.own = this.kept = undefined;
    await this.calls.keepDraft(this.id, '', this.version);
  }

  private keptFrom(draft: NoteReply['draft']): KeptDraft | undefined {
    const text = typeof draft === 'string' ? draft : draft?.text;
    return text ? { text, kept: new Date().toISOString(), id: 'server-draft' } : undefined;
  }

  /**
   * Sends what the session made of a write, undo or redo: the note whole, against the version it was made on. A refusal
   * by the session is the pane's own. A stale write (409) takes the note as it now is, and the block is reloaded. What
   * was typed is kept as a draft. A deleted note or any other failure keeps it too. Nothing is ever applied over a
   * change unseen.
   */
  private async send(w: ToWrite, s: PaneSession): Promise<Refused | null> {
    const typed = s.text;
    if (!w.ok) {
      const { reason, draft, edit, history, stopped } = w;
      return {
        reason,
        draft: draft ?? typed,
        ...(edit ? { edit } : {}),
        ...(history ? { history } : {}),
        ...(stopped ? { stopped } : {}),
      };
    }
    if (w.unchanged) return null;
    const sent = await this.calls.write(this.id, w.note, w.against);
    if (sent.ok) {
      this.es?.written(sent.version);
      this.seen = { text: w.note, version: sent.version };
      this.onSeen?.(this.seen);
      return null;
    }
    if (sent.theirs) {
      this.feed(sent.theirs);
      return { reason: 'the block has changed since the pane read it', draft: typed };
    }
    if (sent.status === 410) this.gone = true;
    return { reason: sent.status === 410 ? NOTE_DELETED : sent.why, draft: typed };
  }
}
