// TEST ONLY — never built, never shipped. C0's stand-in for the note store (spec §26), and the editor server's process
// run with it, so the threat tests have a running route to aim at. The real store is server/editor-store.ts (C1),
// tried on a real vault in editor-store.test.js: notes opened for
// the session by an id the server gave (cc_open_notes_only), real paths kept inside the vault (cc_no_escape), atomic
// writes (cc_atomic_write) and drafts kept on a conflict (cc_write_if_unchanged). Here, a few notes are held in memory,
// never a file, read and written by a plain name at /api/test-note/<name>, each write made only against the version it
// names (If-Match), so a stale write is refused here too.
//   node packages/claude-code/test/fixtures/editor-server-test.ts --serve   the server process, with these notes
// Without --serve it only exports, so a test run that loads every file in a test folder starts nothing.
import { createHash } from 'node:crypto';
import { runEditorProcess } from '../../server/editor-process.ts';
import type { ApiAnswer, ApiRequest } from '../../server/start-server.ts';

/** The one note the process serves, as `sample`. */
export const TEST_NOTE = 'A test note, held in memory.';

/** Where, under /api/, the test notes are served. */
const ROUTE = 'test-note/';

/** A test note's name: lower-case letters, digits and hyphens, so no name can be a path. */
const NAME = /^[a-z0-9-]{1,64}$/;

const versionOf = (text: string): string => `"${createHash('sha256').update(text, 'utf8').digest('hex')}"`;

/** TEST ONLY: notes held in memory by name; `api` is the handler a server is started with. */
export class TestNotes {
  private readonly notes: Map<string, string>;

  constructor(seed: Readonly<Record<string, string>>) {
    this.notes = new Map(Object.entries(seed));
  }

  /** The handler of every /api/ call that passed the server's checks. */
  api = (r: ApiRequest): ApiAnswer => {
    if (!r.path.startsWith(ROUTE)) return { status: 404, text: 'Not found.' };
    const ifMatch = r.headers['if-match'];
    return this.answer(r.method, r.path.slice(ROUTE.length), r.body, typeof ifMatch === 'string' ? ifMatch : undefined);
  };

  private answer(method: string, name: string, body: string, ifMatch: string | undefined): ApiAnswer {
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

if (process.argv[2] === '--serve')
  await runEditorProcess(process.argv.slice(3), { api: new TestNotes({ sample: TEST_NOTE }).api });
