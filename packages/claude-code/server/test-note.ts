// TEST ONLY — C0's stand-in for the note store (spec §26). The real store is workstream C1: notes opened for the
// session by an id the server gave (cc_open_notes_only), real paths kept inside the vault (cc_no_escape), atomic writes
// (cc_atomic_write) and drafts kept on a conflict (cc_write_if_unchanged). Until then, this gives the server's threat
// tests a running route to aim at: a few notes held in memory, never a file, read and written by a plain name, each
// write made only against the version it names (If-Match), so a stale write is refused here too. It is served only
// when the server is started with notes for it (`--test-note`).
import { createHash } from 'node:crypto';

/** Where the test-only notes are served: `/api/test-note/<name>`. */
export const TEST_NOTE_ROUTE = '/api/test-note/';

/** A test note's name: lower-case letters, digits and hyphens, so no name can be a path. */
const NAME = /^[a-z0-9-]{1,64}$/;

/** An answer from the test notes: its status, its text and any headers of its own. */
export interface NoteAnswer {
  status: number;
  text: string;
  headers?: Record<string, string>;
}

const versionOf = (text: string): string => `"${createHash('sha256').update(text, 'utf8').digest('hex')}"`;

/** TEST ONLY: notes held in memory by name, for the threat tests; C1 replaces it. */
export class TestNotes {
  private readonly notes: Map<string, string>;

  constructor(seed: Readonly<Record<string, string>>) {
    this.notes = new Map(Object.entries(seed));
  }

  /** The answer to a GET or PUT of `name` (what follows the route, as sent); `body` is a PUT's text. */
  answer(method: string, name: string, body: string, ifMatch: string | undefined): NoteAnswer {
    if (!NAME.test(name)) return { status: 400, text: 'Not the name of a note.' };
    const text = this.notes.get(name);
    if (text === undefined) return { status: 404, text: 'No such note.' };
    const version = versionOf(text);
    if (method === 'GET') return { status: 200, text, headers: { etag: version } };
    if (ifMatch === undefined)
      return { status: 428, text: 'A change must name the version of the note it was made against.' };
    if (ifMatch !== version)
      return { status: 412, text: 'The note has changed since; nothing was written.', headers: { etag: version } };
    this.notes.set(name, body);
    return { status: 204, text: '', headers: { etag: versionOf(body) } };
  }
}
