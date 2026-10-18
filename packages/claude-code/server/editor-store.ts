// The editor's note store (spec §26, slice 4; workstream C1): the API the server hands every call that passed its
// checks. Notes are read and written only by an id the store gave when the note was opened for the session. A path
// never comes from the page (cc_open_notes_only). Each note's place is checked when it is opened and again before every
// read and write (cc_no_escape, note-place.ts). A write names the version it was made against. That is compared under a
// lock for the note. It goes by way of a temporary file renamed into place (cc_write_if_unchanged, cc_atomic_write).
// One refused keeps what was typed as a draft, outside the vault (cc_drafts_outside). A change on disk is streamed to
// the page (cc_redrawn_on_change). Once stopped it starts no write. Its stop waits for those under way, so the process
// never exits half way through one (C0 review).
//   GET notes/<id>          {text, version, draft}, the version also as the ETag.
//   PUT notes/<id>          the new text, If-Match its version: {version}. 409 {text, version, draft} when stale.
//   PUT notes/<id>/draft    what was typed, kept as the note's draft. An empty one clears it.
//   GET notes/<id>/events   a stream, a JSON object to a line: {version, text} now and on each change, or {gone}.
//   GET notes/<id>/versions, /at/<commit>, /reviews…  its earlier versions and its repository's changes (editor-changes.ts)
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import type { ApiAnswer, ApiRequest } from './start-server.ts';
import { DraftShelf } from './note-drafts.ts';
import { NODE_FILES, readNoteFile, writeAtomically, type NoteFiles, type NoteText } from './note-file.ts';
import { notePlace, type Vault } from './note-place.ts';
import { watchNote, type Watcher } from './note-watch.ts';
import { sha256 } from '@thoughtknot/core';

import type { NoteGate } from './editor-gate.ts';
import { proposalInto } from './editor-proposals.ts';
import { GIT_HISTORY, type NoteHistory } from './note-history.ts';
import { GH_READER, type GitHubReader } from './github-reader.ts';
import { changesAnswer, type ChangesAsked } from './editor-changes.ts';

/** How a store is made: the vault, the mod's data folder for drafts (outside the vault), and what it is handed. */
export interface NoteStoreOptions {
  vault: string;
  drafts: string;
  /** How an open note is watched for changes on disk; fs.watch, debounced, unless a test hands in its own. */
  watch?: Watcher;
  /** The file operations a note's write is made of; Node's own unless a test hands in its own. */
  files?: NoteFiles;
  /**
   * What is asked before any text of a note is sent (cc_classified_asks, cc_credential_never). It is asked on each
   * read, and on the change stream's first line and each change. Also in the answer to a stale write, and for a draft.
   * The shipped server always hands one in. A store made without one sends everything, which only the store's own tests
   * do.
   */
  gate?: NoteGate;
  /** The name Claude's proposals are made by, the model named Claude in the settings; `Claude` when none is given. */
  proposer?: string;
  /** Where a note's earlier versions are read from: its git repository, unless a test hands in its own. */
  history?: NoteHistory;
  /** How the note's repository is read from GitHub for a review: by the user's gh, unless a test hands in its own. */
  github?: GitHubReader;
}

/** The note opened, by the id the store gave it; or why it may not be. */
export type Opened = { ok: true; id: string } | { ok: false; why: string };

/** A note opened this session. */
interface OpenNote {
  /** Its path inside the vault, real, every link followed when it was opened. */
  inVault: string;
  /** The version last read, written or sent to the page; null once it is gone. */
  version: string | null;
  feeds: Set<(text: string) => void>;
  unwatch: () => void;
  /** The digest of the text this editor last wrote: typed by the user, so not asked about again. */
  vouched: string | null;
  /** The commits last listed as its earlier versions, and the items last listed for review: the only ones read. */
  listed: ChangesAsked['listed'];
}

/** One route of the API: a note's id, and what of it is asked for. */
const ROUTE =
  /^notes\/([0-9a-f]{32})(\/events|\/draft|\/proposal|\/versions|\/at\/[0-9a-f]{40}|\/reviews(?:\/[a-z]+\/[0-9a-f]+)?)?$/;

const NOT_YOURS: ApiAnswer = { status: 403, text: 'This key proposes changes and does nothing else.' };

const NOT_OPEN: ApiAnswer = { status: 404, text: 'No such note is open.' };
const STOPPED: ApiAnswer = { status: 503, text: 'The editor has stopped; nothing was written.' };

/** An answer in JSON. */
function answer(status: number, body: object, headers: Record<string, string> = {}): ApiAnswer {
  return {
    status,
    text: JSON.stringify(body),
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  };
}

/** The notes opened for one session of the editor, in one vault. */
export class NoteStore {
  private readonly notes = new Map<string, OpenNote>();
  private readonly ids = new Map<string, string>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly underway = new Set<Promise<unknown>>();
  private stopped = false;
  private readonly where: Vault;
  private readonly drafts: DraftShelf;
  private readonly watch: Watcher;
  private readonly files: NoteFiles;
  private readonly gate: NoteGate | undefined;
  private proposer = 'Claude';
  private history: NoteHistory = GIT_HISTORY;
  private github: GitHubReader = GH_READER;

  private constructor(where: Vault, drafts: DraftShelf, watch: Watcher, files: NoteFiles, gate?: NoteGate) {
    this.where = where;
    this.drafts = drafts;
    this.watch = watch;
    this.files = files;
    this.gate = gate;
  }

  /** Why the text of a note may not be sent, or null: the gate's word, asked each time and never remembered. */
  private refusal(note: OpenNote, text: string): string | null {
    return this.gate ? this.gate.note(text, note.vouched) : null;
  }

  /** A store over the vault; refused when the vault is no folder, or the drafts folder is inside it. */
  static async create(options: NoteStoreOptions): Promise<NoteStore> {
    const named = resolve(options.vault);
    const real = await fs.realpath(named);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('The vault must be a folder.');
    const where = { real, named };
    const drafts = await DraftShelf.open(options.drafts, where);
    const store = new NoteStore(where, drafts, options.watch ?? watchNote, options.files ?? NODE_FILES, options.gate);
    if (options.proposer) store.proposer = options.proposer;
    if (options.history) store.history = options.history;
    if (options.github) store.github = options.github;
    return store;
  }

  /** The vault's real path. */
  get vault(): string {
    return this.where.real;
  }

  /** An open note's path in the vault, written with `/`, by its id; null for an id never given. */
  pathOf(id: string): string | null {
    return this.notes.get(id)?.inVault.split(sep).join('/') ?? null;
  }

  /** How many writes are under way: a stop waits for each. */
  get writing(): number {
    return this.underway.size;
  }

  /**
   * Opens a note for the session, by its path inside the vault or a full one, as the mod names it (never the page). It
   * gives the id the page will use. That is the same for a note already open, however it was reached. Or it gives why
   * it may not be opened.
   */
  async open(given: string): Promise<Opened> {
    if (this.stopped) return { ok: false, why: 'The editor has stopped.' };
    const place = await notePlace(this.where, given);
    if (!place.ok) return place;
    const known = this.ids.get(place.inVault);
    if (known) return { ok: true, id: known };
    const id = randomBytes(16).toString('hex');
    const note: OpenNote = {
      inVault: place.inVault,
      version: null,
      feeds: new Set(),
      unwatch: () => {},
      vouched: null,
      listed: { versions: new Set(), items: new Map() },
    };
    this.notes.set(id, note);
    this.ids.set(place.inVault, id);
    note.unwatch = this.watch(dirname(place.real), basename(place.real), () => void this.changed(id));
    return { ok: true, id };
  }

  /** Answers an API call that passed the server's checks. */
  readonly api = async (r: ApiRequest): Promise<ApiAnswer> => {
    const m = ROUTE.exec(r.path);
    const id = m?.[1];
    if (!m || !id || !this.notes.has(id)) return NOT_OPEN;
    if (this.stopped) return STOPPED;
    const ifMatch = typeof r.headers['if-match'] === 'string' ? r.headers['if-match'] : null;
    const what = `${r.method} ${m[2] ?? ''}`;
    // Claude's key proposes and does nothing else; the page's token never does (cc_claude_proposes)
    if ((r.as === 'proposer') !== (what === 'PUT /proposal')) return NOT_YOURS;
    if (what === 'PUT /proposal') return this.propose(id, r.body);
    if (what === 'GET ') return this.read(id);
    if (what === 'PUT ') return this.write(id, r.body, ifMatch);
    if (what === 'PUT /draft') return this.keepDraft(id, r.body, ifMatch);
    if (what === 'GET /events') return this.follow(id);
    if (/^GET \/(versions|at|reviews)/.test(what)) return this.changes(id, what.slice('GET '.length));
    return { status: 405, text: 'Not this method.' };
  };

  /** Stops: no write starts after this, and it resolves once every write under way is finished. */
  async stop(): Promise<void> {
    if (!this.stopped) {
      this.stopped = true;
      for (const note of this.notes.values()) note.unwatch();
    }
    await Promise.allSettled([...this.underway]);
  }

  /** The note read from disk where it was opened, its place checked again first. */
  private async load(note: OpenNote): Promise<NoteText & { real?: string }> {
    const place = await notePlace(this.where, note.inVault);
    if (!place.ok || place.inVault !== note.inVault)
      return { ok: false, why: 'The note is no longer where it was opened, or now leads outside the vault.' };
    const r = await readNoteFile(place.real);
    return r.ok ? { ...r, real: place.real } : r;
  }

  private async read(id: string): Promise<ApiAnswer> {
    const note = this.notes.get(id) as OpenNote;
    const r = await this.load(note);
    if (!r.ok) return answer(410, { why: r.why });
    const refused = this.refusal(note, r.text);
    if (refused !== null) {
      note.version = null;
      return answer(410, { why: refused });
    }
    note.version = r.version;
    const taken = await this.drafts.take(note.inVault);
    // a draft is typed text too: one the gate refuses (a credential, say) is withheld, and stays on the shelf unsent
    const draft = taken && this.gate?.draft(taken.text) ? null : taken;
    return answer(200, { text: r.text, version: r.version, draft }, { etag: r.version });
  }

  /** The note's earlier versions and its repository's changes, each read only when asked and held to the gate. */
  private changes(id: string, tail: string): Promise<ApiAnswer> {
    const note = this.notes.get(id) as OpenNote;
    const gate = this.gate;
    return changesAnswer(tail, {
      sendable: async () => {
        const r = await this.load(note);
        if (!r.ok || !r.real) return answer(410, { why: r.ok ? 'The note is gone.' : r.why });
        const held = this.refusal(note, r.text);
        return held === null ? r.real : answer(403, { why: held });
      },
      refusal: (text) => this.refusal(note, text),
      held: (text) => (!gate ? null : gate.file ? gate.file(text) : 'The gate has no word on files.'),
      history: this.history,
      github: this.github,
      listed: note.listed,
    });
  }

  /** Runs `work` once every earlier call for the same note is done: a write is compared and made under this lock. */
  private locked<T>(id: string, work: () => Promise<T>): Promise<T> {
    const turn = (this.locks.get(id) ?? Promise.resolve()).then(work, work);
    this.locks.set(
      id,
      turn.catch(() => {}),
    );
    return turn;
  }

  /** Counts `work` as under way until it settles, so a stop waits for it. */
  private counted<T>(work: Promise<T>): Promise<T> {
    this.underway.add(work);
    void work.finally(() => this.underway.delete(work)).catch(() => {});
    return work;
  }

  private write(id: string, text: string, ifMatch: string | null): Promise<ApiAnswer> {
    if (ifMatch === null)
      return Promise.resolve({ status: 428, text: 'A change must name the version of the note it was made against.' });
    return this.counted(
      this.locked(id, async () => {
        // checked again once its turn comes: a write waiting behind another when the stop came is never made
        if (this.stopped) return STOPPED;
        const note = this.notes.get(id) as OpenNote;
        const keep = () => this.drafts.keep(note.inVault, { text, against: ifMatch });
        const now = await this.load(note);
        if (!now.ok || !now.real) {
          const kept = await keep();
          return answer(410, { why: now.ok ? 'The note is gone.' : now.why, draft: kept.ok });
        }
        const refused = this.refusal(note, now.text);
        if (refused !== null) return answer(410, { why: refused, draft: false });
        if (now.version !== ifMatch) {
          const kept = await keep();
          return answer(409, { text: now.text, version: now.version, draft: kept.ok }, { etag: now.version });
        }
        if (this.stopped) return STOPPED;
        const w = text === now.text ? { ok: true as const, version: now.version } : await this.writeNote(now, text);
        if (!w.ok) {
          const kept = await keep();
          return answer(500, { why: w.why, draft: kept.ok });
        }
        note.version = w.version;
        note.vouched = sha256(text);
        // the draft this write makes good is cleared; one typed on top of what was just written is newer, and kept
        const draft = await this.drafts.take(note.inVault);
        if (draft && (draft.text === text || draft.against !== w.version)) await this.drafts.clear(note.inVault);
        return answer(200, { version: w.version }, { etag: w.version });
      }),
    );
  }

  private writeNote(now: { real?: string; mode: number }, text: string) {
    return writeAtomically(now.real as string, text, now.mode, this.files);
  }

  /**
   * Claude's proposal, written beside the graph as a change set and never applied (cc_claude_proposes). It is made
   * under the note's lock, from the note as it is on disk now. It passes the same gate as any send, and again on the
   * text it would write. It is written whole by the same temporary file and rename as any write. So a failure leaves
   * the note as it was. The page is sent the note as it now is. Only the page's own write applies a change.
   */
  private propose(id: string, body: string): Promise<ApiAnswer> {
    return this.counted(
      this.locked(id, async () => {
        if (this.stopped) return STOPPED;
        const note = this.notes.get(id) as OpenNote;
        const now = await this.load(note);
        if (!now.ok || !now.real) return answer(410, { why: now.ok ? 'The note is gone.' : now.why });
        const refused = this.refusal(note, now.text);
        if (refused !== null) return answer(403, { why: refused });
        const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const made = proposalInto(now.text, body, this.proposer, at);
        if (!made.ok) return answer(made.status, { why: made.why });
        // the text to be written is held to the same refusals: a credential in a change never reaches the note
        const next = this.gate?.note(made.text, sha256(made.text)) ?? null;
        if (next !== null) return answer(403, { why: next });
        if (this.stopped) return STOPPED;
        const w = await this.writeNote(now, made.text);
        if (!w.ok) return answer(500, { why: w.why });
        // Claude's own text never carries the user's yes: a note that needed one asks again about this text
        const later = this.refusal(note, made.text);
        note.version = later === null ? w.version : null;
        const line = `${JSON.stringify(later === null ? { version: w.version, text: made.text } : { gone: later })}\n`;
        for (const send of note.feeds) send(line);
        return answer(200, { id: made.id, count: made.count });
      }),
    );
  }

  /** Keeps what was typed as the note's draft, under the note's lock, so no write under way can clear it after. */
  private keepDraft(id: string, text: string, ifMatch: string | null): Promise<ApiAnswer> {
    const note = this.notes.get(id) as OpenNote;
    return this.counted(
      this.locked(id, async () => {
        if (this.stopped) return STOPPED;
        const against = ifMatch ?? (await this.load(note).then((r) => (r.ok ? r.version : null)));
        if (this.stopped) return STOPPED;
        const kept = await this.drafts.keep(note.inVault, { text, against });
        return kept.ok ? { status: 204, text: '' } : answer(500, { why: kept.why });
      }),
    );
  }

  /** The change stream: the note as it is now, then each change another program makes, or that it is gone. */
  private follow(id: string): ApiAnswer {
    const note = this.notes.get(id) as OpenNote;
    const feed = (send: (text: string) => void) => {
      note.feeds.add(send);
      void this.load(note).then((r) => {
        const refused = r.ok ? this.refusal(note, r.text) : null;
        note.version = r.ok && refused === null ? r.version : null;
        const line = r.ok
          ? refused === null
            ? { version: r.version, text: r.text }
            : { gone: refused }
          : { gone: r.why };
        send(`${JSON.stringify(line)}\n`);
      });
      return () => note.feeds.delete(send);
    };
    return { status: 200, text: '', headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }, feed };
  }

  /** The watcher says the note changed: read it, and send it to the page when it differs from what the page has. */
  private changed(id: string): Promise<void> {
    return this.locked(id, async () => {
      const note = this.notes.get(id);
      if (this.stopped || !note) return;
      const r = await this.load(note);
      const refused = r.ok ? this.refusal(note, r.text) : null;
      const sendable = r.ok && refused === null;
      if (sendable && r.version === note.version) return;
      if (!sendable && note.version === null) return;
      note.version = sendable ? r.version : null;
      const said = sendable ? { version: r.version, text: r.text } : { gone: refused ?? (r.ok ? '' : r.why) };
      const line = `${JSON.stringify(said)}\n`;
      for (const send of note.feeds) send(line);
    });
  }
}
