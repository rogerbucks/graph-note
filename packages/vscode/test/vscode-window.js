// The VS Code tab run in a DOM (jsdom), for the journey and the WCAG check (spec §41, vscode_plugin). The extension is
// built as it ships, and loaded against the stand-in for VS Code (fake-vscode.js) over a real folder. Open in
// ThoughtKnot makes the tab's page. The page then runs in a DOM, with VS Code's messages carried both ways. So what
// runs is the extension, its script in the tab and the browser editor's page, unchanged. Test code only:
// `cleanUpVscode` puts away what was built and opened.
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWindow } from '../../../test/repository/wcag.js';
import { workerFor } from '../../../test/repository/wcag-page.js';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { furnish, runScript } from '../../app/test/app-window.js';
import { buildExtension } from '../esbuild.config.mjs';
import { fakeVscode, loadExtension, Uri } from './fake-vscode.js';

const folders = [];
let building;

/** A new empty folder, real path, put away by `cleanUpVscode`. */
export function emptyFolder() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'thoughtknot-vscode-')));
  folders.push(dir);
  return dir;
}

/** Puts away the built extension and every folder made. */
export function cleanUpVscode() {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
  building = undefined;
}

/** The extension, built once into a folder of its own: the folder VS Code would install it in. */
export function builtExtension() {
  building ??= (async () => {
    const dir = emptyFolder();
    await buildExtension(join(dir, 'dist'));
    return dir;
  })();
  return building;
}

/**
 * A stand-in VS Code with the extension activated, over the workspace folder `folder`. The note at `path` is in the
 * active editor. `open()` chooses Open in ThoughtKnot, `ask()` Ask AI about this note. `settings` and `models` are VS
 * Code's (fake-vscode.js); `context` is what the extension was given, its kept values in `globalState`.
 */
export async function vscodeOn(folder, path, { language = 'en', origin, served, settings, models } = {}) {
  const extension = await builtExtension();
  const fake = fakeVscode({ language, folders: [folder], origin, served: served ?? extension, settings, models });
  const kept = new Map();
  const globalState = { get: (key) => kept.get(key), update: async (key, value) => void kept.set(key, value) };
  const context = { subscriptions: [], extensionUri: Uri.file(extension), globalState };
  const loaded = loadExtension(join(extension, 'dist/extension.cjs'), fake.vscode);
  loaded.activate(context);
  fake.vscode.window.activeTextEditor = { document: { uri: Uri.file(join(folder, path)) } };
  return {
    ...fake,
    extension,
    loaded,
    context,
    open: (...args) => fake.commands.get('thoughtknot.openGraph')(...args),
    ask: (...args) => fake.commands.get('thoughtknot.askAi')(...args),
  };
}

/** The tab's page in a DOM, for the tab `tab` made from the extension at `extension`. */
function openTab(tab, extension) {
  const page = join(extension, 'dist/webview');
  const dom = openWindow(tab.webview.html, { url: 'https://webview.invalid/index.html' });
  const { window } = dom;
  window.document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach((e) => e.remove());
  furnish(window);
  window.acquireVsCodeApi = () => ({ postMessage: (message) => void tab.fromPage(message) });
  tab.toPage = (message) => window.dispatchEvent(new window.MessageEvent('message', { data: message }));
  const stopWorkers = workerFor(window, join(page, 'layout-worker.js'));
  for (const script of ['vscode-editor.js', 'page.js']) runScript(window, join(page, script));
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
 * The note at `path` in `folder`, opened in its VS Code tab. It gives `{ window, doc, field, typed, file, ready, stop }`,
 * as the browser page's live cases do (packages/claude-code/test/editor-page-live.js), and `vs`, the stand-in VS Code.
 */
export async function openVscodeTab(folder, path, options) {
  const vs = await vscodeOn(folder, path, options);
  await vs.open();
  const opened = openTab(vs.tabs[0], vs.extension);
  const { window, doc } = opened;
  const button = (label) => [...doc.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);
  const page = {
    ...opened,
    vs,
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
