// Test support for the browser page's cases (editor-page.test.js, workstream C5). It holds:
// - the page, built once into a folder of its own and served by the real server from that folder;
// - the layout worker's file, run as a worker thread.
// Test code only: what a case starts is put away by `cleanUp`, which the file runs once, after its last case.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { buildPage } from '../esbuild.page.mjs';

export const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

let building;
const folders = [];
const started = [];

/** Stops every server and worker the cases started, and removes the built page. */
export async function cleanUp() {
  await Promise.all(started.splice(0).map((stop) => stop()));
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
  building = undefined; // the next describe that needs the page builds it again
}

/** The page built into a temporary folder, once: where it is, and what went into the page and the worker bundles. */
export function built() {
  building ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-built-page-'));
    folders.push(dir);
    return { dir, ...(await buildPage(dir)) };
  })();
  return building;
}

/** A server started as the shipped process starts it, with the built page's files and the settings the mod hands it. */
export async function servePage(settingsJson) {
  const { startEditorServer } = await import('../server/start-server.ts');
  const { loadPageAssets } = await import('../server/page-assets.ts');
  const { withSettings } = await import('../server/page-settings.ts');
  const { dir } = await built();
  const server = await startEditorServer({
    page: await loadPageAssets(dir),
    api: withSettings(settingsJson, undefined),
  });
  started.push(() => server.stop());
  return server;
}

/** The text of every file of the page's own source folder (TypeScript, CSS and HTML), by name. */
export function pageSources() {
  const folder = `${PACKAGE}page`;
  return Object.fromEntries(
    readdirSync(folder)
      .filter((n) => /\.(ts|css|html)$/.test(n) && statSync(join(folder, n)).isFile())
      .map((n) => [n, readFileSync(join(folder, n), 'utf8')]),
  );
}

/** The built layout worker run in a thread, as a browser runs it: `self` is its scope. Gives `ready` and `ask`. */
export function runWorker(file) {
  const prelude =
    "const { parentPort } = require('node:worker_threads');" +
    'globalThis.self = { postMessage: (m) => parentPort.postMessage(m), set onmessage(f) { parentPort.on("message", (d) => f({ data: d })); } };';
  const worker = new Worker(prelude + readFileSync(file, 'utf8'), { eval: true });
  const replies = [];
  const waiting = [];
  worker.on('message', (m) => (waiting.shift() ?? ((x) => replies.push(x)))(m));
  const next = () => new Promise((resolve) => (replies.length ? resolve(replies.shift()) : waiting.push(resolve)));
  started.push(async () => void (await worker.terminate()));
  return { ready: next, ask: (request) => (worker.postMessage(request), next()) };
}
