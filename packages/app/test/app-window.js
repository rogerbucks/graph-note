// The desktop app's window run in a DOM (jsdom), for the journey and the WCAG check (spec §41, standalone_app). The
// window's files are built as the app is built (esbuild.config.mjs). Tauri's `invoke` is a stand-in that answers the
// app's seven commands over a real folder, as the Rust does (src-tauri/src/place.rs). So what runs is the app's own
// script and the browser editor's page, unchanged. Test code only: `cleanUpApp` puts away what was built and opened.
import { promises as fs, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWindow } from '../../../test/repository/wcag.js';
import { workerFor } from '../../../test/repository/wcag-page.js';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { buildApp } from '../esbuild.config.mjs';

const folders = [];
let building;

/** A new empty folder, real path, put away by `cleanUpApp`. */
export function emptyFolder() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'thoughtknot-app-')));
  folders.push(dir);
  return dir;
}

/** Puts away the built window and every folder made. */
export function cleanUpApp() {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
  building = undefined;
}

/** The window's files, built once into a folder of their own. */
export function builtApp() {
  building ??= (async () => {
    const dir = emptyFolder();
    await buildApp(dir);
    return dir;
  })();
  return building;
}

/** `name` with `n` before its ending, as the Rust numbers a name taken. */
const numbered = (name, n) => (n === 1 ? name : name.replace(/(\.[^.]+)$/, `-${n}$1`));

/** Tauri's invoke, answered as the app's commands answer, over `root`: `picked` is what the folder dialog gives. */
export function fakeInvoke(root, picked = null) {
  const at = (path) => join(root, ...path.split('/').filter(Boolean));
  const said = (e) => Promise.reject(e?.code === 'ENOENT' ? 'ENOENT' : String(e?.message ?? e));
  const commands = {
    pick_folder: async () => picked,
    read_dir: async ({ path }) =>
      (await fs.readdir(at(path), { withFileTypes: true })).map((d) => [d.name, d.isDirectory()]),
    read_text: async ({ path }) => fs.readFile(at(path), 'utf8'),
    write_text: async ({ path, text }) => fs.writeFile(at(path), text),
    remove_file: async ({ path }) => fs.rm(at(path)),
    make_dir: async ({ path }) => void (await fs.mkdir(at(path), { recursive: true })),
    write_new: async ({ into, files }) => {
      await fs.mkdir(at(into), { recursive: true });
      for (let n = 1; ; n++) {
        const names = files.map(([name]) => numbered(name, n));
        const taken = await Promise.all(
          names.map((name) =>
            fs.lstat(join(at(into), name)).then(
              () => true,
              () => false,
            ),
          ),
        );
        if (taken.includes(true)) continue;
        for (const [i, [, bytes]] of files.entries())
          await fs.writeFile(join(at(into), names[i]), Uint8Array.from(bytes), { flag: 'wx' });
        return names;
      }
    },
  };
  return (command, args) => commands[command](args).catch(said);
}

/** What the window has that jsdom lacks: the web's fetch types, a clock for frames, and the tools the page asks for. */
function furnish(window) {
  Object.assign(window, { Response, Request, Headers, ReadableStream, TextEncoder, TextDecoder });
  if (!window.crypto?.subtle) Object.defineProperty(window, 'crypto', { value: globalThis.crypto });
  window.matchMedia = (media) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  window.URL.createObjectURL = () => 'blob:drawing';
  window.URL.revokeObjectURL = () => {};
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.requestAnimationFrame = (f) => window.setTimeout(f, 0);
  // only the app's own calls are answered; the window fetches nothing else
  window.fetch = async () => new Response('', { status: 404 });
}

/** A built script run in `window` as a plain script: its own scope, its exports dropped. */
const run = (window, file) =>
  window.eval(`(() => {\n${readFileSync(file, 'utf8').replace(/\nexport \{[^}]*\};?\s*$/, '\n')}\n})();`);

/**
 * The window opened on `page` of the built app at `hash`, with `invoke` as Tauri's: `{ dom, window, doc, stop }`. The
 * system's language is `language`, as the window says it.
 */
async function open(page, hash, invoke, scripts, language = 'en-GB') {
  const dir = await builtApp();
  const dom = openWindow(readFileSync(join(dir, page), 'utf8'), { url: `http://tauri.localhost/${page}${hash}` });
  const { window } = dom;
  window.document.querySelectorAll('script, link[rel="stylesheet"]').forEach((e) => e.remove());
  furnish(window);
  Object.defineProperty(window.navigator, 'language', { value: language });
  window.__TAURI__ = { core: { invoke } };
  const stopWorkers = workerFor(window, join(dir, 'layout-worker.js'));
  for (const script of scripts) run(window, join(dir, script));
  return {
    dom,
    window,
    doc: window.document,
    stop: async () => {
      window.close();
      await stopWorkers();
    },
  };
}

/**
 * The app's first page on `folder`, as when the app is started with the folder named; none: no folder picked yet. The
 * system speaks `language`.
 */
export const openAppStart = (folder, language) =>
  open(
    'index.html',
    '',
    folder ? fakeInvoke(folder) : async () => Promise.reject('no folder is open'),
    ['app.js'],
    language,
  );

/**
 * The editor in the app, on the note at `path` in `folder`. It gives `{ window, doc, field, typed, file, ready, stop }`,
 * as the browser page's live cases do (packages/claude-code/test/editor-page-live.js).
 */
export async function openAppEditor(folder, path) {
  const hash = `#token=app&note=${encodeURIComponent(path)}`;
  const opened = await open('editor.html', hash, fakeInvoke(folder), ['app-editor.js', 'page.js']);
  const { window, doc } = opened;
  const button = (label) => [...doc.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);
  const page = {
    ...opened,
    folder,
    /** The note's text on disk now. */
    file: () => readFileSync(join(folder, path), 'utf8'),
    /** Another program changes the note on disk. */
    write: (text) => writeFileSync(join(folder, path), text),
    field: () => doc.querySelector('textarea.thoughtknot-text'),
    /** Types `text` into the field and waits until the editor has written it. */
    async typed(text) {
      const before = button('Undo');
      const t = page.field();
      t.value = text;
      t.setSelectionRange(text.length, text.length);
      t.dispatchEvent(new window.Event('input', { bubbles: true }));
      await until(() => button('Undo') !== before, 8000);
    },
    ready: async () => {
      await until(() => !!page.field() && !!doc.querySelector('.thoughtknot-svg'), 8000);
      return page;
    },
  };
  return page;
}
