// The one way notes are read and written (editor spec §41, storage_contract). A backend keeps the notes somewhere: an
// Obsidian vault, a plain folder, a VS Code workspace, or memory. Every backend passes the one contract suite
// (storage-contract.ts). Encryption, sync and history plug in as layers. A layer wraps a backend and is a backend
// itself, so the core never knows which are there.
import { sha256 } from './ai-digest.ts';

/** A note as read: its text, byte for byte, and the version a write checks it against. */
export interface StoredNote {
  text: string;
  /** Changes whenever the text does. Only its own backend reads it: it is never compared across backends. */
  version: string;
}

/** How a write or a removal checks what it replaces, and who made it. */
export interface WriteOptions {
  /**
   * The version the change was made against: the change is refused when the note is no longer at it. `null`: only
   * when no note is there yet. Not given: whatever is there.
   */
  expected?: string | null;
  /** Who made the change, for a history layer to keep (changes_logged_with_provenance). */
  author?: string;
}

/** A change made, with the version it left; or why it was refused, and the note as it now is. */
export type WriteOutcome =
  { ok: true; version: string | null } | { ok: false; reason: string; current: StoredNote | null };

/** Where notes are kept. Every path is relative and `/`-separated, and names a `.md` note. */
export interface NoteStorage {
  /** Every note's path, sorted. */
  list(): Promise<string[]>;
  /** The note at `path`, or null when there is none. */
  read(path: string): Promise<StoredNote | null>;
  /** Writes `text` to the note at `path`, making it and its folders when they are not there. */
  write(path: string, text: string, options?: WriteOptions): Promise<WriteOutcome>;
  /** Removes the note at `path`. On success the version is null. */
  remove(path: string, options?: WriteOptions): Promise<WriteOutcome>;
  /**
   * Changes the note at `path` by `edit` in one step, so nothing is written in between. Only a backend that can do so
   * has it, such as an Obsidian vault. `changeNote` uses it when it is there.
   */
  change?(path: string, edit: NoteEdit, options?: Pick<WriteOptions, 'author'>): Promise<ChangeOutcome>;
}

/** A change to a note's text: the text as it is now in, the text to write out. The same text out writes nothing. */
export type NoteEdit = (text: string) => string;

/** A note changed, with its text and version now; or why not, and the note as it now is. */
export type ChangeOutcome =
  { ok: true; text: string; version: string } | { ok: false; reason: string; current: StoredNote | null };

/** A layer, such as encryption, sync or history: a backend in, a backend out. */
export type StorageLayer = (inner: NoteStorage) => NoteStorage;

/** Why a change was refused. */
export const REFUSED = {
  changed: 'the note has changed since it was read',
  exists: 'a note is already at that path',
  missing: 'no note is at that path',
} as const;

/** The version a backend that keeps no version of its own gives a text: a named hash of it. */
export const noteVersion = (text: string): string => `sha-256-64:${sha256(text).slice(0, 16)}`;

/**
 * A note's path, checked: relative and `/`-separated, ending in `.md`. It never starts with `/` or `~`. No folder starts
 * with a dot, so `..`, `.obsidian` and `.git` are out. No part is empty. None holds a backslash, a colon or a control
 * character, so no Windows drive or second stream is named. Throws for any other.
 *
 * Any other character is kept, such as `?`, `*` or a name ending in dots. A note made on a Mac or by sync can have one,
 * and it reaches nothing outside the store. So reading it must work. (Export folders are stricter: see `vaultFolder`.)
 */
export function notePath(path: unknown): string {
  if (typeof path !== 'string' || !isNotePath(path))
    throw new Error(`not a note's path in the store: ${JSON.stringify(path)}`);
  return path;
}

/** Whether `path` is a note's path in the store, by the rules `notePath` gives. */
function isNotePath(path: string): boolean {
  if (path.length < 4 || !/\.md$/i.test(path) || path.startsWith('~')) return false;
  if ([...path].some((c) => c.charCodeAt(0) < 32 || c === '\\' || c === ':' || c === '\u007f')) return false;
  return path.split('/').every((part) => part !== '' && !part.startsWith('.'));
}

/**
 * Whether a change made against `options.expected` may replace `current`. Returns why not, or null when it may. So
 * every backend refuses in the same words.
 */
export function refusal(current: StoredNote | null, options: WriteOptions = {}): string | null {
  const { expected } = options;
  if (expected === undefined) return null;
  if (expected === null) return current ? REFUSED.exists : null;
  if (!current) return REFUSED.missing;
  return current.version === expected ? null : REFUSED.changed;
}

/** How many times `changeNote` writes against a note another change keeps getting to first, before it gives up. */
const CHANGE_TRIES = 5;

/**
 * Changes the note at `path` by `edit`, against the note as it is when written: never over a change made meanwhile. A
 * backend that changes a note in one step does it (`change`). Any other is read, then written against the version
 * read. When the note changed in between, `edit` runs again on the note as it now is. So `edit` must work from the text
 * it is given alone. A note not there is refused, as is one that keeps changing.
 */
export async function changeNote(
  storage: NoteStorage,
  path: string,
  edit: NoteEdit,
  options: Pick<WriteOptions, 'author'> = {},
): Promise<ChangeOutcome> {
  if (storage.change) return storage.change(path, edit, options);
  let current = await storage.read(path);
  for (let tries = 0; current; tries++) {
    const text = edit(current.text);
    if (text === current.text) return { ok: true, text, version: current.version };
    const done = await storage.write(path, text, { ...options, expected: current.version });
    if (done.ok) return { ok: true, text, version: done.version ?? noteVersion(text) };
    if (done.reason !== REFUSED.changed || tries + 1 >= CHANGE_TRIES) return done;
    current = done.current;
  }
  return { ok: false, reason: REFUSED.missing, current: null };
}

/** A backend with its layers on: the first layer wraps the backend, and each after wraps the one before. */
export const layered = (base: NoteStorage, ...layers: StorageLayer[]): NoteStorage =>
  layers.reduce((storage, layer) => layer(storage), base);

/** Notes kept in memory: for tests, and for a host that has nowhere else to keep them. */
export function memoryStorage(seed: Record<string, string> = {}): NoteStorage {
  const notes = new Map<string, string>();
  for (const [path, text] of Object.entries(seed)) notes.set(notePath(path), text);
  const at = (path: string): StoredNote | null => {
    const text = notes.get(path);
    return text === undefined ? null : { text, version: noteVersion(text) };
  };
  return {
    list: async () => [...notes.keys()].sort(),
    read: async (path) => at(notePath(path)),
    write: async (path, text, options) => {
      const current = at(notePath(path));
      const reason = refusal(current, options);
      if (reason) return { ok: false, reason, current };
      notes.set(path, text);
      return { ok: true, version: noteVersion(text) };
    },
    remove: async (path, options) => {
      const current = at(notePath(path));
      const reason = current ? refusal(current, options) : REFUSED.missing;
      if (reason) return { ok: false, reason, current };
      notes.delete(path);
      return { ok: true, version: null };
    },
  };
}

/** One change a history layer keeps: the note before and after (null: not there), who made it, and when. */
export interface StoredChange {
  path: string;
  before: string | null;
  after: string | null;
  author?: string;
  at: string;
}

/** Where a history layer keeps its changes: a Git repository, a folder or a database, chosen apart from the notes. */
export interface ChangeLog {
  record(change: StoredChange): void | Promise<void>;
}

/**
 * The history layer (storage_history_layer): each change that is made is kept in `log`, with who made it. A refused
 * change is not kept. `now` gives the time, as an ISO 8601 text.
 */
export const historyLayer =
  (log: ChangeLog, now: () => string = () => new Date().toISOString()): StorageLayer =>
  (inner) => ({
    list: () => inner.list(),
    read: (path) => inner.read(path),
    write: async (path, text, options = {}) => {
      const before = await inner.read(path);
      const done = await inner.write(path, text, options);
      if (done.ok) await log.record({ path, before: before?.text ?? null, after: text, at: now(), ...author(options) });
      return done;
    },
    remove: async (path, options = {}) => {
      const before = await inner.read(path);
      const done = await inner.remove(path, options);
      if (done.ok) await log.record({ path, before: before?.text ?? null, after: null, at: now(), ...author(options) });
      return done;
    },
  });

const author = (options: WriteOptions) => (options.author === undefined ? {} : { author: options.author });
