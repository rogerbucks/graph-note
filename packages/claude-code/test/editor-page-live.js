// The browser editor's page run live (editor spec §26; cc_editor_opens, cc_same_bytes): the page as built, its own script run
// in a DOM (jsdom), talking to the real editor server over HTTP, which keeps a real vault in a temporary folder and writes
// it as the shipped server does. What a case types into the page's field is what the page sends the server, and what it
// reads back is the file the server wrote. The layout worker runs as a thread. Test code only: `stop` puts everything away.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWindow } from '../../../test/repository/wcag.js';
import { workerFor } from '../../../test/repository/wcag-page.js';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { NoteStore } from '../server/editor-store.ts';
import { loadPageAssets } from '../server/page-assets.ts';
import { withSettings } from '../server/page-settings.ts';
import { startEditorServer } from '../server/start-server.ts';
import { built } from './editor-page-support.js';
import { handWatch } from './editor-store-support.js';

/** The note's path in the temporary vault. */
export const NOTE_PATH = 'Reader.md';

/**
 * The page opened on `note` (written to a vault of its own, with `files` beside it): `{ window, doc, file, read, write,
 * type, field, ... }`. `file()` is the note's text on disk now; `write(text)` is another program changing it, told to the
 * page as the watcher would tell it; `type(text)` is the person typing `text` into the field, as the page hears it.
 */
export async function livePage(note, { files = {}, settings = '{}', fire = true, before, gate, github } = {}) {
  const top = mkdtempSync(join(tmpdir(), 'editor-page-live-'));
  const vault = join(top, 'vault');
  mkdirSync(vault);
  writeFileSync(join(vault, NOTE_PATH), note);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(vault, name), text);
  const watcher = handWatch();
  const store = await NoteStore.create({
    vault,
    drafts: join(top, 'data'),
    watch: watcher.watch,
    ...(gate ? { gate } : {}),
    ...(github ? { github } : {}),
  });
  const opened = await store.open(NOTE_PATH);
  if (!opened.ok) throw new Error(opened.why);
  const { dir } = await built();
  const server = await startEditorServer({ page: await loadPageAssets(dir), api: withSettings(settings, store.api) });

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const script = readFileSync(join(dir, 'page.js'), 'utf8').replace(/\nexport \{[^}]*\};?\s*$/, '\n');
  const hash = `#token=${server.token}&note=${encodeURIComponent(opened.id)}`;
  const dom = openWindow(html, { url: `${server.origin}/${hash}` });
  const { window } = dom;
  window.document.querySelectorAll('script, link[rel="stylesheet"]').forEach((e) => e.remove());
  window.matchMedia = (media) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  window.URL.createObjectURL = () => 'blob:drawing';
  window.URL.revokeObjectURL = () => {};
  window.TextDecoder = TextDecoder;
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.requestAnimationFrame = (f) => window.setTimeout(f, 0);
  const aborts = [];
  // the server's own HTTP, as the page's `fetch` makes it: from its own origin, as a page the server served would
  window.fetch = (url, init = {}) => {
    const stop = new AbortController();
    aborts.push(stop);
    return fetch(`${server.origin}${url}`, {
      ...init,
      signal: stop.signal,
      headers: { ...init.headers, origin: server.origin, 'sec-fetch-site': 'same-origin' },
    });
  };
  const stopWorkers = workerFor(window, join(dir, 'layout-worker.js'));
  before?.(window);
  window.eval(script);

  const doc = window.document;
  const page = {
    window,
    doc,
    top,
    vault,
    store,
    server,
    id: opened.id,
    /** The note's text on disk now. */
    file: () => readFileSync(join(vault, NOTE_PATH), 'utf8'),
    /** Another program changes the note on disk: told to the page, as the watcher tells it. */
    write(text, { tell = true } = {}) {
      writeFileSync(join(vault, NOTE_PATH), text);
      if (fire && tell) watcher.fire(NOTE_PATH);
    },
    /** Tells the page the note changed on disk, as the watcher does. */
    fireChange: () => watcher.fire(NOTE_PATH),
    /** The page's text field, once the editor has built it. */
    field: () => doc.querySelector('textarea.thoughtknot-text'),
    /** A button of the page named `label`, as a screen reader finds it. */
    button: (label) => Array.from(doc.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label),
    /** Types `text` into the field as a person does: its value changes and the page hears an input. */
    type(text, caret = text.length) {
      const t = page.field();
      t.value = text;
      t.setSelectionRange(caret, caret);
      t.dispatchEvent(new window.Event('input', { bubbles: true }));
    },
    /**
     * Does `act` and waits for the editor to finish what it began: it draws its tools again once a write, an undo or a
     * redo has been answered by the server and taken, so the next press is made on the note as the page now has it.
     */
    async done(act) {
      const before = page.button('Undo');
      act();
      await until(() => page.button('Undo') !== before, 8000);
    },
    /** Types `text` and waits until the editor has written it. */
    typed: (text, caret) => page.done(() => page.type(text, caret)),
    /** Presses the tool named `label` and waits until the editor has done it. */
    press: (label) => page.done(() => page.button(label).click()),
    /** Waits for the editor and the drawing to be there. */
    ready: async () => {
      await until(() => !!page.field() && !!doc.querySelector('.thoughtknot-svg'), 8000);
      return page;
    },
    stop: async () => {
      for (const a of aborts) a.abort();
      window.close();
      await stopWorkers();
      await server.stop();
      await store.stop();
      rmSync(top, { recursive: true, force: true });
    },
  };
  return page;
}
