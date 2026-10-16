// The browser editor's page, run for the WCAG check (editor spec §11, §26; test/wcag.test.js): the page as built (the files
// the server holds), its own script run in a DOM (jsdom) with the calls it makes answered as the server answers them and its
// layout worker run as a thread, so what is checked is what the page makes, not a copy of it. Test code only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { audit, openWindow, pageStyleFor } from './wcag.js';

/** The note the page is opened on: words, a code block and a link, and one graph. */
export const PAGE_NOTE = [
  '# Reader',
  '',
  'Some words, `code`, and a [link](https://example.com).',
  '',
  '```gql',
  '// graph: reader',
  "(q:Question {title: 'Which device?'}),",
  "(large:Option {name: 'Large reader'}),",
  '(large)-[:ANSWERS]->(q)',
  '```',
  '',
].join('\n');

/** The server's answers to the page's calls. */
function answer(url, note) {
  if (url.startsWith('/api/settings')) return {};
  if (url.startsWith('/api/notes/')) return { text: note, version: '1', draft: null };
  return { note: 'Reader.md', folder: 'Exports' };
}

/** A `Worker` for the window that runs the built layout worker's file in a thread, as a browser runs it from the server. */
function workerFor(window, file) {
  const prelude =
    "const { parentPort } = require('node:worker_threads');" +
    'globalThis.self = { postMessage: (m) => parentPort.postMessage(m), set onmessage(f) { parentPort.on("message", (d) => f({ data: d })); } };';
  const code = prelude + readFileSync(file, 'utf8');
  const threads = [];
  window.Worker = class {
    constructor() {
      this.thread = new Worker(code, { eval: true });
      threads.push(this.thread);
      this.thread.on('message', (data) => this.onmessage?.({ data }));
      this.thread.on('error', (e) => this.onerror?.({ message: e.message }));
    }
    postMessage(message) {
      this.thread.postMessage(message);
    }
    terminate() {
      void this.thread.terminate();
    }
  };
  return () => Promise.all(threads.map((t) => t.terminate()));
}

/**
 * The page as built in `dir`, opened at `hash` (the address's fragment, which carries the token and the note), with the
 * script run. Returns {dom, window, stop}: `stop` puts away the worker threads; the caller closes the DOM (audit does).
 */
export function openEditorPage(dir, hash, note = PAGE_NOTE) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8').replace(/<link[^>]*>|<script[^>]*><\/script>/g, '');
  // the built page is one module whose last line exports the starter; run as a plain script, it starts itself
  const script = readFileSync(join(dir, 'page.js'), 'utf8').replace(/\nexport \{[^}]*\};?\s*$/, '\n');
  const dom = openWindow(html, { url: `http://127.0.0.1:1/${hash}` });
  const { window } = dom;
  window.matchMedia = (media) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  window.URL.createObjectURL = () => 'blob:drawing';
  window.URL.revokeObjectURL = () => {};
  window.fetch = async (url) => {
    const body = answer(String(url), note);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const stop = workerFor(window, join(dir, 'layout-worker.js'));
  window.eval(script);
  return { dom, window, stop };
}

/** Puts the page's style sheet into the open page, for `theme`; returns the colour behind the page. */
export function styleFor(dir, window, theme) {
  const { style, variables } = pageStyleFor(readFileSync(join(dir, 'page.css'), 'utf8'), theme);
  const sheet = window.document.createElement('style');
  sheet.textContent = style;
  window.document.head.append(sheet);
  return variables['--background-primary'];
}

/** The page open in `theme`, in the state it has reached, checked. */
export async function auditPage(dir, opened, theme) {
  const background = styleFor(dir, opened.window, theme);
  return audit(opened.dom, theme, background);
}
