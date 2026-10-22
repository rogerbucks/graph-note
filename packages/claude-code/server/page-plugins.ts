// The plug-ins from outside on the browser page (spec §54, plugin_outside_page; API-10). The page turns none on. It runs
// the ones the person turned on in Obsidian, and only while each file is the one they turned on:
// - the server reads which are on from the Obsidian plugin's data.json, in Obsidian's folder in the vault. That is each
//   file's name and the SHA-256 it had when it was turned on. It reads nothing else from that file;
// - each file is read from the vault folder `ThoughtKnot plug-ins` and checked as Obsidian checks it. A file that
//   changed since, or that the core refuses, is left out, and the page says why;
// - each is served at `/plugins/<its SHA-256>.js`: the start that seals the worker, then the file. The page starts a
//   worker from it. Its policy allows no connection and no other script, so the browser holds it off the network too.
// All of it is read once, as the server starts, and kept in memory, as the page's own files are.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { outsideBody, outsideProblem, word } from '@thoughtknot/core';
import type { ApiHandler } from './start-server.ts';
import type { PageFile } from './page-assets.ts';

/** The vault folder plug-in files are kept in, as the Obsidian host names it. */
export const OUTSIDE_FOLDER = 'ThoughtKnot plug-ins';

/** Where the Obsidian plugin keeps its settings, from Obsidian's configuration folder in the vault. */
export const PLUGIN_DATA = join('plugins', 'thoughtknot', 'data.json');

/** A plug-in worker's policy: its own script and nothing else. No connection, no image, no other script. */
export const PLUGIN_CSP = "default-src 'none'; script-src 'self'";

/** A plug-in the page runs: its file's name and its SHA-256, which is its path. Or one left out, and why. */
export type PagePlugin = { name: string; sha: string } | { name: string; why: string };

/** What the server serves of the plug-ins: the list the page is told, and the files by their paths. */
export interface PagePlugins {
  list: PagePlugin[];
  files: Map<string, PageFile>;
}

/** The path a plug-in is served at. */
export const pluginPath = (sha: string): string => `/plugins/${sha}.js`;

/**
 * The Obsidian plugin's settings in `vault`, or null. Obsidian's configuration folder is a hidden folder at the vault's
 * top, and a person may rename it. So the first hidden folder, by name, that holds the plugin's settings is taken.
 */
async function savedSettings(vault: string): Promise<unknown> {
  const hidden = await readdir(vault, { withFileTypes: true }).catch(() => []);
  for (const folder of hidden
    .filter((e) => e.isDirectory() && e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()) {
    const text = await readFile(join(vault, folder, PLUGIN_DATA), 'utf8').catch(() => null);
    if (text === null) continue;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

/** The files turned on in Obsidian, each with its SHA-256 then; none when there is no data.json, or no list in it. */
async function turnedOn(vault: string): Promise<[string, string][]> {
  const saved = await savedSettings(vault);
  const outside = (saved as { outside?: unknown } | null)?.outside;
  if (!outside || typeof outside !== 'object') return [];
  return Object.entries(outside as Record<string, unknown>).flatMap(([name, on]) => {
    const sha = (on as { sha?: unknown } | null)?.sha;
    return typeof sha === 'string' ? [[name, sha] as [string, string]] : [];
  });
}

/**
 * The plug-ins turned on in the vault at `vault`, each served after `start`, the sealing start the build made. With no
 * start, none is served. A name that is not a plain file name in the folder is never read.
 */
export async function pagePlugins(vault: string, start: string | null): Promise<PagePlugins> {
  const list: PagePlugin[] = [];
  const files = new Map<string, PageFile>();
  for (const [name, sha] of await turnedOn(vault)) {
    if (!/^[\w][\w.-]*\.js$/.test(name)) {
      list.push({ name, why: word('server.plugin-name') });
      continue;
    }
    const code = await readFile(join(vault, OUTSIDE_FOLDER, name), 'utf8').catch(() => null);
    const problem = code === null ? word('server.plugin-gone') : outsideProblem(code);
    if (problem || code === null) {
      list.push({ name, why: problem ?? '' });
      continue;
    }
    if (createHash('sha256').update(code).digest('hex') !== sha) {
      list.push({ name, why: word('server.plugin-changed') });
      continue;
    }
    if (start === null) {
      list.push({ name, why: word('server.plugin-no-start') });
      continue;
    }
    list.push({ name, sha });
    const body = Buffer.from(`const thoughtknotServe = (${start})(self);\n${outsideBody(code)}`);
    files.set(pluginPath(sha), { type: 'text/javascript; charset=utf-8', body, csp: PLUGIN_CSP });
  }
  return { list, files };
}

/** `inner`, with `plugins` answered here, read only: the plug-ins the page runs, and those left out. */
export function withPlugins(list: readonly PagePlugin[], inner: ApiHandler): ApiHandler {
  return (request) => {
    if (request.path !== 'plugins') return inner(request);
    if (request.method !== 'GET') return { status: 405, text: word('server.plugins-read-only') };
    return {
      status: 200,
      text: JSON.stringify({ plugins: list }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    };
  };
}
