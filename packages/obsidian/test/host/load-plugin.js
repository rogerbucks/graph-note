// Loads the built plugin (main.js) in Node against fresh stand-ins for Obsidian and the DOM, as its tests need it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fakeDocument, installGlobals } from './fake-dom.js';
import { fakeObsidian, fakeCodeMirror } from './fake-obsidian.js';

const require = createRequire(import.meta.url);
export const root = fileURLToPath(new URL('../../../../', import.meta.url));

export function build() {
  const r = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: `${root}packages/obsidian`, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

let speaking;
/** Sets the language Obsidian says it is in for every load after (the test languages' check); undefined puts it back. */
export const speakIn = (tag) => {
  speaking = tag;
};

/** Loads main.js — CommonJS, as Obsidian loads it — with the stand-ins; returns the plugin, the stand-ins' record, the document and the app. */
export async function load(options = {}) {
  const doc = fakeDocument(options.width ?? 700),
    uninstall = installGlobals(doc);
  const state = {
    taken: options.taken,
    mobile: options.mobile,
    files: new Map(Object.entries(options.files ?? {})),
    data: options.data ?? null,
    language: options.language ?? speaking,
  };
  const obsidian = fakeObsidian(state);
  const Module = require('node:module'),
    real = Module._load,
    file = `${root}main.js`;
  const cm = fakeCodeMirror(state);
  Module._load = (req, ...rest) => (req === 'obsidian' ? obsidian : (cm[req] ?? real(req, ...rest)));
  let Plugin;
  try {
    const m = new Module(file);
    m.filename = file;
    m.paths = Module._nodeModulePaths(root);
    m._compile(readFileSync(file, 'utf8'), file);
    Plugin = m.exports.default;
  } finally {
    Module._load = real;
  }
  const plugin = new Plugin(obsidian.app, { id: 'graph-note' });
  if (options.engine) plugin.loadEngine = options.engine;
  // loaded as Obsidian loads it, marked loaded before its onload runs and left so: what it adds, in onload or after, such
  // as an editor in place that listens for the note changing, is loaded with it
  plugin._loaded = true;
  await plugin.onload();
  return { plugin, state, doc, app: obsidian.app, obsidian, uninstall };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves once every promise already under way has run on, where none waits on a timer, a frame or a worker: an order,
 * not a sleep, so the same under any load. For a change that should do nothing visible, where there is no state to wait for.
 */
export const settled = () => new Promise((r) => setImmediate(r));

/** Waits until `ready()` is true, or fails after `ms`: for what the engine draws, which takes as long as it takes to start. */
export async function until(ready, ms = 3000) {
  const t0 = Date.now();
  while (!ready()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await wait(10);
  }
}
