// Test support for the editor's note store (editor-store.test.js): a real vault on disk in a temporary folder, with the
// escapes a page might try laid out in it, the store served by a running server, the change stream read as the page
// reads it, a watcher the test fires by hand, and file operations a test can hold at one step. Test code only.
import { after } from 'node:test';
import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NoteStore } from '../server/editor-store.ts';
import { NODE_FILES } from '../server/note-file.ts';
import { startEditorServer } from '../server/start-server.ts';

/** The note the tests edit: one graph block between prose. */
export const PLAN =
  '# Plan\nWhat comes first.\n```gql\n// graph: plan\n' +
  "(start:Step {name: 'Start'}),\n(finish:Step {name: 'Finish'}),\n(start)-[:THEN]->(finish)\n```\nThe end.\n";

/** The same note with its block changed by another program. */
export const PLAN_THEIRS = PLAN.replace("'Finish'", "'Done'");

/** What lies outside the vault, which no request may ever read or change. */
export const SECRET = 'Outside the vault.\n';

/**
 * A vault in a temporary folder (on macOS, under a symlinked /var, so the store must take its real path), with a data
 * folder and a folder outside it beside it. Inside: the note, a second note, hidden folders, a text file, and symlinks
 * out of the vault, into a hidden folder, onto a text file and, the one allowed, onto the note itself.
 */
export function tempVault() {
  const top = mkdtempSync(join(tmpdir(), 'editor-store-'));
  after(() => rmSync(top, { recursive: true, force: true }));
  const vault = join(top, 'vault'),
    data = join(top, 'data'),
    outside = join(top, 'outside');
  for (const d of ['Notes', '.obsidian', '.git', '.trash']) mkdirSync(join(vault, d), { recursive: true });
  mkdirSync(outside);
  const files = {
    'Notes/plan.md': PLAN,
    'Notes/other.md': 'Another note.\n',
    'Notes/.hidden.md': 'A hidden note.\n',
    '.obsidian/workspace.md': 'Obsidian’s own.\n',
    '.git/notes.md': 'Git’s own.\n',
    '.trash/old.md': 'Thrown away.\n',
    'readme.txt': 'Not a note.\n',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(vault, name), text);
  writeFileSync(join(outside, 'secret.md'), SECRET);
  symlinkSync(join(outside, 'secret.md'), join(vault, 'link-out.md'));
  symlinkSync(outside, join(vault, 'Linked'));
  symlinkSync(join(vault, '.obsidian/workspace.md'), join(vault, 'to-hidden.md'));
  symlinkSync(join(vault, 'readme.txt'), join(vault, 'text-link.md'));
  symlinkSync(join(vault, 'Notes/plan.md'), join(vault, 'inside-link.md'));
  return { top, vault, data, outside, plan: join(vault, 'Notes/plan.md') };
}

/** A watcher the test fires by hand: what the store watches, and how many it has stopped watching. */
export function handWatch() {
  const w = { watched: [], closed: 0 };
  w.watch = (folder, file, changed) => {
    w.watched.push({ folder, file, changed });
    return () => w.closed++;
  };
  /** Says that `file` changed, as fs.watch would after its debounce. */
  w.fire = (file) => {
    for (const e of w.watched) if (e.file === file) e.changed();
  };
  return w;
}

/** The node file operations with one step held the first time it is reached: `at` gives its arguments, `release` lets it go. */
export function holding(step) {
  let release = () => {},
    reached = () => {},
    held = false;
  const gate = new Promise((r) => (release = r));
  const at = new Promise((r) => (reached = r));
  const files = {
    ...NODE_FILES,
    async [step](...args) {
      if (!held) {
        held = true;
        reached(args);
        await gate;
      }
      return NODE_FILES[step](...args);
    },
  };
  return { files, at, release: () => release() };
}

/** A store over the vault, served by a running server as the mod will run it; both stopped when the file's tests end. */
export async function served(v, options = {}) {
  const store = await NoteStore.create({ vault: v.vault, drafts: v.data, watch: handWatch().watch, ...options });
  const server = await startEditorServer({ api: store.api, drain: () => store.stop() });
  after(() => server.stop());
  return { store, server };
}

export const bearer = (s) => ({ authorization: `Bearer ${s.token}` });
export const writing = (s, version) => ({
  ...bearer(s),
  origin: s.origin,
  'sec-fetch-site': 'same-origin',
  ...(version === undefined ? {} : { 'if-match': version }),
});

/**
 * The change stream of a note, read as the page reads it with fetch: one JSON object to a line. `next` gives the next,
 * or null once the stream has ended; `status` the answer's status; `close` ends it from the page's side.
 */
export function follow(s, id, headers = bearer(s)) {
  const queue = [],
    waiting = [];
  const push = (item) => (waiting.length ? waiting.shift()(item) : queue.push(item));
  let buffer = '';
  let answer = () => {};
  const status = new Promise((r) => (answer = r));
  const req = http.request(
    { host: '127.0.0.1', port: s.port, path: `/api/notes/${id}/events`, headers, agent: false },
    (res) => {
      answer(res.statusCode);
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buffer += d;
        for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          push(res.statusCode === 200 ? JSON.parse(line) : line);
        }
      });
      res.on('close', () => push(null));
    },
  );
  req.on('error', () => push(null));
  req.end();
  after(() => req.destroy());
  return {
    status,
    next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiting.push(r))),
    close: () => req.destroy(),
  };
}

/** Lets every callback already queued run: for a test that checks something has not happened yet. */
export async function settle(turns = 20) {
  for (let i = 0; i < turns; i++) await new Promise((r) => setImmediate(r));
}
