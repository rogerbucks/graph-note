#!/usr/bin/env node
// Builds the home page's live demo (spec §41, site_demo): the project's own graph notes, drawn by the real plugin
// bundle in the visitor's browser. packages/obsidian/harness/demo.js runs the plugin on the browser harness's Obsidian
// stand-in. The note it draws is made here from GRAPHS, so the demo shows the graphs as main has them.
// scripts/site.mjs calls it, and puts its files beside the home page as demo/.
//
// Usage:
//   node scripts/site-demo.mjs --out DIR
//
// DIR gets demo.js and the plugin's styles.css. It also gets harness.css, the harness's Obsidian theme variables.
// Last come the browser editor's icons, with icons.css holding one rule for each.
import esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutWorker, pluginWorker } from '../packages/obsidian/esbuild.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = join(ROOT, 'packages/obsidian/harness');
const ICONS = join(ROOT, 'packages/claude-code/page/icons');

/** The graphs the demo draws, in order, each with a heading and a line saying what it is. The first opens to edit. */
export const GRAPHS = [
  {
    file: 'requirements/architecture.gql',
    heading: 'How ThoughtKnot is built',
    lede: 'Its layers, the parts in each and the interfaces between them. It opens in the pane beside, to edit.',
  },
  {
    file: 'requirements/ethos.gql',
    heading: 'What ThoughtKnot stands for',
    lede: 'Its principles, the rules that follow from them and what checks each rule.',
  },
  {
    file: 'scripts/graph-theory.gql',
    heading: 'Graph theory, as a graph',
    lede: 'Its people, ideas, theorems and algorithms, and the bridges of Königsberg: a larger graph to explore.',
  },
];

/** The demo's note: each graph's heading, its line and its text in a gql block, read from `read(file)`. */
export function demoNote(read, graphs = GRAPHS) {
  const parts = [];
  for (const g of graphs) {
    const text = read(g.file).replace(/\s+$/, '');
    if (!/^\/\/ graph: \w+/.test(text)) throw new Error(`${g.file} does not start with its graph's name`);
    if (/^```/m.test(text)) throw new Error(`${g.file} holds a fence, which would end its block early`);
    parts.push(`## ${g.heading}`, g.lede, '```gql', text, '```');
  }
  return `${parts.join('\n')}\n`;
}

/** The harness page's own style sheet: Obsidian's theme variables and the note and pane side by side. */
export function harnessCss(html) {
  const found = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (!found) throw new Error('the harness page has no style sheet');
  return `${found[1].replace(/^ {6}/gm, '').trim()}\n`;
}

/** The icons' style sheet: each icon file painted in the text's colour, by its name. */
export function iconsCss(names) {
  const base = [
    '.demo-icon {',
    '  display: inline-block;',
    '  inline-size: 1.1em;',
    '  block-size: 1.1em;',
    '  vertical-align: -0.2em;',
    '  background-color: currentColor;',
    "  mask: var(--demo-icon, url('icons/unknown.svg')) center / contain no-repeat;",
    '}',
  ];
  return [...base, ...names.map((n) => `.demo-icon-${n} { --demo-icon: url('icons/${n}.svg'); }`), ''].join('\n');
}

/** Builds the demo's files into `out`; returns the esbuild metafile, for what went into the bundle. */
export async function buildDemo(out) {
  mkdirSync(out, { recursive: true });
  const note = demoNote((file) => readFileSync(join(ROOT, file), 'utf8'));
  const built = await esbuild.build({
    entryPoints: [join(HARNESS, 'demo.js')],
    outfile: join(out, 'demo.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'eof',
    metafile: true,
    alias: { obsidian: join(HARNESS, 'demo-shim.js') },
    // the SQLite engine of Import is held inside the bundle, as the plugin's build holds it (spec §20)
    loader: { '.md': 'text', '.wasm': 'binary' },
    plugins: [
      layoutWorker,
      pluginWorker,
      {
        name: 'demo-note',
        setup(build) {
          build.onResolve({ filter: /^demo-note$/ }, () => ({ path: 'demo-note', namespace: 'demo-note' }));
          build.onLoad({ filter: /.*/, namespace: 'demo-note' }, () => ({ contents: note, loader: 'text' }));
        },
      },
    ],
    logLevel: 'warning',
  });
  copyFileSync(join(ROOT, 'styles.css'), join(out, 'styles.css'));
  cpSync(ICONS, join(out, 'icons'), { recursive: true });
  const icons = readdirSync(ICONS).filter((f) => f.endsWith('.svg'));
  writeFileSync(join(out, 'icons.css'), iconsCss(icons.map((f) => f.slice(0, -4))));
  writeFileSync(join(out, 'harness.css'), harnessCss(readFileSync(join(HARNESS, 'index.html'), 'utf8')));
  return built.metafile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  if (at === -1) throw new Error('give the folder for the demo: --out DIR');
  await buildDemo(args[at + 1]);
}
