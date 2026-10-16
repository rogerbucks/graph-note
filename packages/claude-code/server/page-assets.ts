// The files of the browser editor's page, as the server holds them (spec §26, cc_offline, cc_worker_same_origin): read once
// when the server starts from the folder the build made (`mod/page/`), kept in memory, and served by their exact paths
// from its own origin. No path from a request is ever joined to a folder, so none can reach a file that was not read here;
// a file of a kind the page does not use is not read at all. The page itself loads nothing from anywhere else.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CSP } from './request-guard.ts';

/** One file the page is made of. */
export interface PageFile {
  type: string;
  body: Buffer;
  /** The content security policy this file is served under, when it is not the server's own. */
  csp?: string;
}

/** The page's files by their path from the server's root, `/` being the page itself. */
export type PageAssets = ReadonlyMap<string, PageFile>;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** The worker's path, the one file served under a policy of its own. */
export const WORKER_FILE = '/layout-worker.js';

/**
 * The worker's policy: the server's own with one addition to `script-src`, `'wasm-unsafe-eval'`, which lets the worker
 * compile the Graphviz engine's WebAssembly and nothing else (no script from a string, no eval): a browser refuses to
 * compile WebAssembly under any policy that lacks it. The page's own policy is the server's, unchanged.
 */
export const WORKER_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'");

async function filesIn(folder: string, prefix: string, into: Map<string, PageFile>): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await filesIn(join(folder, entry.name), `${path}/`, into);
    const type = TYPES[entry.name.slice(entry.name.lastIndexOf('.'))];
    if (!entry.isFile() || !type) continue;
    const body = await readFile(join(folder, entry.name));
    into.set(path === '/index.html' ? '/' : path, { type, body, ...(path === WORKER_FILE ? { csp: WORKER_CSP } : {}) });
  }
}

/** The page's files read from `folder`; an empty map when the folder is not there, so the server says the page is missing. */
export async function loadPageAssets(folder: string): Promise<PageAssets> {
  const files = new Map<string, PageFile>();
  await filesIn(folder, '/', files).catch(() => files.clear());
  return files;
}
