// Runs before the browser editor's page in the VS Code tab (spec §41, vscode_plugin). It is the desktop app's
// app-editor.ts for a webview:
// - the page's `/api/` calls are answered from the note's folder by the app's own `appFetch`. Its files are asked of the
//   extension by message, the app's folder commands by name (folder-calls.ts checks each one);
// - the page opens on the note, as from the editor server's link;
// - the page reads VS Code's display language as the browser's (language_follows_host);
// - a worker starts from a `blob:` that loads the extension's own worker file, as a webview's workers must. The blob
//   holds one line naming that file, never text the page made.
import { appFetch } from '../../app/src/app-api.ts';
import { tauriFiles, tauriSaveNew, type Invoke } from '../../app/src/tauri-files.ts';
import { workspaceStorage } from '../../core/src/workspace-storage.ts';
import type { FolderReply } from './folder-calls.ts';
import type { WebviewSettings } from './webview-html.ts';

/** The part of VS Code's webview API the page uses. */
interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

/** The page's settings, from the block the extension wrote (webview-html.ts). */
const settings = JSON.parse(document.getElementById('thoughtknot-vscode')?.textContent ?? '{}') as WebviewSettings;
const vscode = acquireVsCodeApi();

/** A call to the extension by message, answered by its number. */
const waiting = new Map<number, [(value: unknown) => void, (error: unknown) => void]>();
let last = 0;
const invoke: Invoke = (command, args) =>
  new Promise((done, fail) => {
    const id = ++last;
    waiting.set(id, [done, fail]);
    vscode.postMessage({ kind: 'call', id, call: command, args: args ?? {} });
  });
window.addEventListener('message', (e: MessageEvent<FolderReply>) => {
  const reply = e.data;
  if (reply?.kind !== 'reply') return;
  const answer = waiting.get(reply.id);
  if (!answer) return;
  waiting.delete(reply.id);
  if (reply.ok) answer[0](reply.value);
  else answer[1](reply.error);
});

window.fetch = appFetch(
  { storage: workspaceStorage(tauriFiles(invoke)), saveNew: tauriSaveNew(invoke) },
  window.fetch.bind(window),
);

// the page takes the note from the address, as the editor server's link gives it; the token is not checked here
window.history.replaceState(null, '', `#${new URLSearchParams({ token: 'vscode', note: settings.note }).toString()}`);

// VS Code's own language, which the page reads as the browser's
const language = settings.language || 'en-GB';
Object.defineProperty(window.navigator, 'language', { get: () => language, configurable: true });
Object.defineProperty(window.navigator, 'languages', { get: () => [language], configurable: true });

const pageWorker = window.Worker;
/** A worker from a path of the page's own, such as `/layout-worker.js`: the extension's file of that name. */
class WebviewWorker extends pageWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    const given = String(url);
    const file = given.startsWith('/') ? `${settings.base}${given}` : given;
    const start = new Blob([`importScripts(${JSON.stringify(file)});`], { type: 'text/javascript' });
    super(URL.createObjectURL(start), options);
  }
}
window.Worker = WebviewWorker;
