// The drawing's tests (spec §3): the built plugin loaded against fresh stand-ins, as each drawing test has always loaded
// it, the graph they draw, and its block drawn as Obsidian draws it.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fakeDocument, installGlobals } from './fake-dom.js';
import { fakeObsidian, fakeContext, fakeCodeMirror } from './fake-obsidian.js';
import { root } from './load-plugin.js';

const require = createRequire(import.meta.url);
/** The plugin's styles. */
export const styles = readFileSync(`${root}styles.css`, 'utf8');

/** Loads the built plugin against fresh fakes; returns the plugin, the fakes' record, and the document. */
export async function load(options = {}) {
  const doc = fakeDocument(options.width ?? 700),
    uninstall = installGlobals(doc),
    state = { taken: options.taken, mobile: options.mobile };
  const obsidian = fakeObsidian(state);
  // main.js is CommonJS, as Obsidian loads it; the repository's own package type would make Node read it as a module
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
  const plugin = new Plugin();
  if (options.engine) plugin.loadEngine = options.engine;
  // loaded as Obsidian loads it (load-plugin.js): marked loaded before its onload runs, so its children load with it
  plugin._loaded = true;
  await plugin.onload();
  return { plugin, state, doc, uninstall };
}

/** The graph the drawing's tests draw. */
export const GRAPH = `// graph: reader · SOURCE
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(tablet:Option {name: 'Tablet'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(q), (tablet)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(large), (eyes)-[:COUNTS_AGAINST]->(tablet)`;

/** Runs the gql processor on block `n` of a note, as Obsidian would; resolves when it has drawn. */
export async function show(env, note, n = 0) {
  const lines = note.split('\n'),
    fences = lines.flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
  const fenceLine = fences[n];
  let end = fenceLine + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const source = lines.slice(fenceLine + 1, end).join('\n');
  const el = env.doc.body.createDiv({ cls: 'block-language-gql' });
  const ctx = fakeContext(note, fenceLine);
  await env.state.processors.get('gql')(source, el, ctx);
  return { el, ctx };
}

/** The drawing's SVG inside `el`. */
export const svgOf = (el) => el.querySelector('svg');
