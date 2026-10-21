// The editor server's API, answered inside the app's own window (spec §41, standalone_app). The browser editor's page
// asks `/api/...` of the server that served it. In the app there is no server. This file answers the same calls from
// the notes of the folder the person picked, through the core's storage (storage_contract). So the page runs unchanged.
// - The page's token and the note's id come in the address, as from the server. The id is the note's path.
// - A write names the version it was typed against, and is refused (409) when the note changed, with the note as it
//   now is. What was sent is kept as the note's draft, as the server keeps it.
// - The change stream sends the note now, then each change another program makes, read again every few seconds.
// - An export's files are written as new files beside the note, never over a file (`saveNew`, place.rs).
// - Earlier versions and GitHub reviews are not in the app yet: each is refused in words.
import type { NoteStorage } from '../../core/src/note-storage.ts';
import { REFUSED } from '../../core/src/note-storage.ts';
import { word } from '../../core/src/words.ts';

/** How often the change stream reads the note again, in milliseconds. */
export const FOLLOW_EVERY_MS = 2000;

/** One file of an export: its name alone and its bytes. */
export interface NewFile {
  name: string;
  bytes: Uint8Array;
}

/** What the app hands in: the folder's notes, where an export is written, and the clock the change stream waits on. */
export interface AppApiOptions {
  storage: NoteStorage;
  /** Writes an export's files as new files in a folder; gives the names written. None: exports are refused. */
  saveNew?: (folder: string, files: NewFile[]) => Promise<string[]>;
  setTimeout?: (run: () => void, ms: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
}

const json = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const plain = (status: number, text: string): Response => new Response(text, { status });

/** The files of an export as the page sends them, `{files: [{name, text} | {name, base64}]}`, or why not. */
function filesOf(body: string): NewFile[] | string {
  let given: unknown;
  try {
    given = JSON.parse(body);
  } catch {
    return word('server.export.not-json');
  }
  const list = given && typeof given === 'object' ? (given as { files?: unknown }).files : undefined;
  if (!Array.isArray(list) || list.length === 0) return word('server.export.no-files');
  const files: NewFile[] = [];
  for (const item of list as { name?: unknown; text?: unknown; base64?: unknown }[]) {
    const name = typeof item?.name === 'string' ? item.name : '';
    if (!name) return word('server.export.no-name');
    if (typeof item.text === 'string') files.push({ name, bytes: new TextEncoder().encode(item.text) });
    else if (typeof item.base64 === 'string')
      files.push({ name, bytes: Uint8Array.from(atob(item.base64), (c) => c.charCodeAt(0)) });
    else return word('server.export.text-or-bytes', { name });
  }
  return files;
}

/** A `fetch` that answers the editor's `/api/` calls from `storage`, and hands every other call to `inner`. */
export function appFetch(options: AppApiOptions, inner?: typeof fetch): typeof fetch {
  const { storage } = options;
  const wait = options.setTimeout ?? ((run, ms) => globalThis.setTimeout(run, ms));
  const stopWaiting = options.clearTimeout ?? ((t) => globalThis.clearTimeout(t as ReturnType<typeof setTimeout>));
  const drafts = new Map<string, { text: string; against: string | null }>();

  const read = async (path: string): Promise<Response> => {
    const note = await storage.read(path);
    if (!note) return json(410, { why: word('server.note-gone') });
    const draft = drafts.get(path) ?? null;
    drafts.delete(path);
    return json(200, { text: note.text, version: note.version, draft });
  };

  const write = async (path: string, text: string, against: string | null): Promise<Response> => {
    if (against === null) return plain(428, word('server.change-needs-version'));
    const done = await storage.write(path, text, { expected: against });
    if (done.ok) {
      drafts.delete(path);
      return json(200, { version: done.version });
    }
    drafts.set(path, { text, against });
    if (done.reason === REFUSED.changed && done.current)
      return json(409, { text: done.current.text, version: done.current.version, draft: true });
    return json(410, { why: word('server.note-gone'), draft: true });
  };

  /** GET: where an export of the note goes, its own folder. PUT: the files, written as new ones there. */
  const exportOf = async (method: string, path: string, body: string): Promise<Response> => {
    const { saveNew } = options;
    if (!saveNew || !(await storage.read(path))) return plain(404, word('server.note-not-open'));
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (method === 'GET') return json(200, { note: path, folder });
    if (method !== 'PUT') return plain(405, word('server.not-this-method'));
    const files = filesOf(body);
    if (typeof files === 'string') return plain(400, files);
    return json(200, { written: await saveNew(folder, files) });
  };

  const follow = (path: string): Response => {
    let timer: unknown = null;
    let sent: string | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (line: object) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(line)}\n`));
        const look = async () => {
          const note = await storage.read(path).catch(() => null);
          if (!note) return send({ gone: word('server.note-gone') });
          if (note.version !== sent) send({ version: note.version, text: note.text });
          sent = note.version;
          timer = wait(() => void look(), FOLLOW_EVERY_MS);
        };
        void look();
      },
      cancel() {
        if (timer !== null) stopWaiting(timer);
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
  };

  const answer = async (method: string, route: string, headers: Headers, body: string): Promise<Response> => {
    if (route === 'settings') return method === 'GET' ? json(200, {}) : plain(405, word('server.not-this-method'));
    const exported = /^export\/([^/]+)$/.exec(route)?.[1];
    if (exported) return exportOf(method, decodeURIComponent(exported), body);
    const m = /^notes\/([^/]+)(\/events|\/draft|\/versions|\/at\/.+|\/reviews(?:\/.*)?)?$/.exec(route);
    if (!m?.[1]) return plain(404, word('server.note-not-open'));
    const path = decodeURIComponent(m[1]);
    const what = `${method} ${m[2] ?? ''}`;
    if (what === 'GET ') return read(path);
    if (what === 'PUT ') return write(path, body, headers.get('if-match'));
    if (what === 'PUT /draft') {
      if (body) drafts.set(path, { text: body, against: headers.get('if-match') });
      else drafts.delete(path);
      return new Response(null, { status: 204 });
    }
    if (what === 'GET /events') return follow(path);
    if (method === 'GET') return json(404, { why: word('app.not-yet') });
    return plain(405, word('server.not-this-method'));
  };

  return async (input, init) => {
    const request = new Request(
      new URL(String(input instanceof Request ? input.url : input), 'http://app.invalid'),
      init,
    );
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) {
      if (!inner) return plain(404, word('server.note-not-open'));
      return inner(input, init);
    }
    try {
      return await answer(request.method, pathname.slice('/api/'.length), request.headers, await request.text());
    } catch (e) {
      return json(500, { why: e instanceof Error ? e.message : String(e) });
    }
  };
}
