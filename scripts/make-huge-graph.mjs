#!/usr/bin/env node
// Makes the huge graph of device check V-10 (spec §9, layout_contained). It is a real graph past the drawing limit on
// things, not a list of numbered fillers. It has two halves, joined where they meet:
// - graph theory: its people, ideas, theorems, algorithms, problems and the bridges of Königsberg. They are written by
//   hand in scripts/graph-theory.gql. Some of its famous graphs are made here vertex by vertex (the Petersen graph, a
//   hypercube). Names, dates and statements are common mathematical knowledge, in our own words. Nothing is copied from
//   any source, so nothing needs a licence.
// - this project: the sections, requirements, tests and questions of requirements/editor-requirements.gql. Also the
//   waves and workstreams of requirements/waves.json and workstreams.json, and every tracked source file with what it
//   imports.
//
// The project half is read from the repository as it is when this runs, so the graph is a snapshot. Run it again to
// bring it up to date. test/device-check-quotes.test.js holds the note's graph over the limit on things and under the
// read limits.
//
// Usage:
//   node scripts/make-huge-graph.mjs            print the graph block (one thing or link to a line) on stdout.
//   node scripts/make-huge-graph.mjs --write    put it in the V-10 note, in place of the block that starts
//                                               `// graph: huge`.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NOTE = 'test-vault/Device checks/01 Viewing/V-10 Huge graph shows text.md';

const THEORY = 'scripts/graph-theory.gql';

/** Famous graphs, drawn vertex by vertex: id, name, the idea it shows, and its edges as pairs of vertex numbers. */
function famous() {
  const range = (n) => [...Array(n).keys()];
  const complete = (n) =>
    range(n).flatMap((i) =>
      range(n)
        .filter((j) => j > i)
        .map((j) => [i, j]),
    );
  const cycle = (n) => range(n).map((i) => [i, (i + 1) % n]);
  /** The generalised Petersen graph GP(n, k): an outer n-cycle, spokes, and an inner star stepping by k. */
  const gp = (n, k) => [
    ...cycle(n),
    ...range(n).map((i) => [i, n + i]),
    ...range(n).map((i) => [n + i, n + ((i + k) % n)]),
  ];
  const hypercube = (d) =>
    range(2 ** d).flatMap((v) =>
      range(d)
        .map((b) => v ^ (1 << b))
        .filter((w) => w > v)
        .map((w) => [v, w]),
    );
  const grid = (w, h) =>
    range(w * h).flatMap((v) => [...(v % w < w - 1 ? [[v, v + 1]] : []), ...(v + w < w * h ? [[v, v + w]] : [])]);
  const binaryTree = (depth) =>
    range(2 ** depth - 1)
      .slice(1)
      .map((v) => [Math.floor((v - 1) / 2), v]);
  return [
    ['k5', 'Complete graph K5', 'complete_graph', 5, complete(5)],
    ['k33', 'Utility graph K3,3', 'complete_bipartite', 6, range(3).flatMap((i) => [3, 4, 5].map((j) => [i, j]))],
    ['petersen_graph', 'Petersen graph', 'cubic_graph', 10, gp(5, 2)],
    ['dodecahedron', 'Dodecahedral graph', 'hamiltonian_cycle', 20, gp(10, 2)],
    [
      'heawood_graph',
      'Heawood graph',
      'cubic_graph',
      14,
      [...cycle(14), ...range(7).map((i) => [2 * i, (2 * i + 5) % 14])],
    ],
    ['cube_q3', 'Cube graph Q3', 'hypercube_graph', 8, hypercube(3)],
    ['hypercube_q6', 'Hypercube graph Q6', 'hypercube_graph', 64, hypercube(6)],
    ['grid_12', 'Grid graph 12 × 12', 'planar_graph', 144, grid(12, 12)],
    ['binary_tree_7', 'Complete binary tree of depth 7', 'binary_tree', 127, binaryTree(7)],
    ['cycle_c30', 'Cycle graph C30', 'cycle', 30, cycle(30)],
  ];
}

// ── Writing it out ────────────────────────────────────────────────────────────────────────────────────────────────────

const quoted = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const props = (o) =>
  `{${Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : quoted(v)}`)
    .join(', ')}}`;
/** A safe id from any text: lower case, letters, digits and underscores. */
const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

class Graph {
  things = [];
  links = [];
  ids = new Set();
  thing(id, label, fields) {
    if (this.ids.has(id)) throw new Error(`two things are ${id}`);
    this.ids.add(id);
    this.things.push(`(${id}:${label} ${props(fields)}),`);
    return id;
  }
  link(from, type, to) {
    if (!this.ids.has(from) || !this.ids.has(to)) throw new Error(`${from} -${type}-> ${to}: an end is missing`);
    this.links.push(`(${from})-[:${type}]->(${to})`);
  }
}

/**
 * Graph theory, from scripts/graph-theory.gql, written by hand. Then its famous graphs, vertex by vertex, each linked
 * to the idea it shows and to who described it.
 */
function graphTheory(g) {
  const p = (id) => `gt_${id}`;
  const text = readFileSync(join(ROOT, THEORY), 'utf8');
  for (const line of text.split('\n').slice(1)) {
    const thing = /^\((\w+):\w+ \{/.exec(line);
    const link = /^\((\w+)\)-\[:\w+\]->\((\w+)\)/.exec(line);
    if (thing) {
      if (g.ids.has(thing[1])) throw new Error(`two things are ${thing[1]}`);
      g.ids.add(thing[1]);
      g.things.push(line.replace(/,?$/, ','));
    } else if (link) g.links.push(line.replace(/,$/, ''));
    else if (line.startsWith('// ──')) g.things.push(line);
  }
  g.things.push('// ── Graph theory: famous graphs, vertex by vertex ──');
  for (const [id, name, shows, n, edges] of famous()) {
    const v = (i) => `${id}_${i}`;
    g.thing(p(id), 'FamousGraph', { name, vertices: n, edges: edges.length });
    g.link(p(id), 'SHOWS', p(shows));
    for (let i = 0; i < n; i++) g.thing(v(i), 'Vertex', { name: `${id} ${i}` });
    g.link(v(0), 'VERTEX_OF', p(id));
    for (const [a, b] of edges) g.link(v(a), 'ADJACENT', v(b));
  }
  g.link(p('petersen'), 'DESCRIBED', p('petersen_graph'));
  g.link(p('heawood'), 'DESCRIBED', p('heawood_graph'));
  g.link(p('icosian_game'), 'PLAYED_ON', p('dodecahedron'));
  g.link(p('kuratowski_theorem'), 'NAMES', p('k5'));
  g.link(p('kuratowski_theorem'), 'NAMES', p('k33'));
}

/** The things and links of requirements/editor-requirements.gql, each thing with its id as its name. */
function requirements(g) {
  g.things.push('// ── This project: its requirements, tests and questions ──');
  const text = readFileSync(join(ROOT, 'requirements/editor-requirements.gql'), 'utf8');
  const ids = new Map();
  for (const m of text.matchAll(/^\((\w+):(\w+) \{(.*)\}\),?$/gm)) {
    const [, id, label, body] = m;
    const field = (k) => new RegExp(`\\b${k}: (?:'((?:[^'\\\\]|\\\\.)*)'|(\\d+))`).exec(body);
    const value = (k) => {
      const f = field(k);
      return f ? (f[2] !== undefined ? Number(f[2]) : f[1].replace(/\\(.)/g, '$1')) : undefined;
    };
    const fields =
      label === 'Section'
        ? { name: `§${value('num')} ${value('title')}` }
        : label === 'Question'
          ? { name: `${value('num')} ${id.replace(/^q_\d+_/, '').replace(/_/g, ' ')}`, slice: value('slice') }
          : { name: id.replace(/_/g, ' '), level: value('level'), slice: value('slice'), status: value('status') };
    ids.set(id, g.thing(`rq_${id}`, label, fields));
  }
  for (const m of text.matchAll(/^\((\w+)\)-\[:(\w+)\]->\((\w+)\),?$/gm)) {
    const [, from, type, to] = m;
    if (ids.has(from) && ids.has(to)) g.link(ids.get(from), type, ids.get(to));
  }
  return ids;
}

/** The waves and their workstreams, each workstream linked to the requirements it delivers. */
function waves(g, reqs) {
  g.things.push('// ── This project: its waves and workstreams ──');
  const { waves: list } = JSON.parse(readFileSync(join(ROOT, 'requirements/waves.json'), 'utf8'));
  const streams = JSON.parse(readFileSync(join(ROOT, 'requirements/workstreams.json'), 'utf8'));
  const stream = (key) => `ws_${slug(key)}`;
  for (const [key, { title }] of Object.entries(streams))
    g.thing(stream(key), 'Workstream', { name: `${key} ${title}` });
  let before = null;
  list.forEach((w, i) => {
    const id = g.thing(`wave_${i + 1}`, 'Wave', { name: w.title, start: w.start, end: w.end });
    if (before) g.link(before, 'THEN', id);
    before = id;
    for (const key of w.workstreams ?? []) if (streams[key]) g.link(stream(key), 'IN_WAVE', id);
  });
  for (const [key, { requirements: rs = [] }] of Object.entries(streams))
    for (const r of rs) if (reqs.has(r)) g.link(stream(key), 'DELIVERS', reqs.get(r));
}

/** Files the guide says never to read, and the vault: none of them is code a person writes. */
const BUILT =
  /^(main\.js|dist\/|packages\/graph-spec\/dist\/|packages\/claude-code\/mod\/hooks\/graph\.js|packages\/claude-code\/mod\/bin\/|test\/tests-first\/|test-vault\/|licences\/)/;

/** Every tracked source file, in its folder and package, with the files it imports and the module each test tests. */
function code(g, reqs) {
  g.things.push('// ── This project: its code, file by file ──');
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|js|mjs)$/.test(f) && !BUILT.test(f));
  // short ids, as there are many: f1, f2 … in the order git lists the files, and d1, d2 … for their folders
  const fileNumber = new Map(files.map((f, i) => [f, i + 1]));
  const fileId = (f) => `f${fileNumber.get(f)}`;
  const folders = new Set(files.map((f) => dirname(f)));
  const folderNumber = new Map([...folders].sort().map((d, i) => [d, i + 1]));
  const folderId = (d) => `d${folderNumber.get(d)}`;
  for (const d of [...folders].sort()) {
    g.thing(folderId(d), 'Folder', { name: d === '.' ? 'thoughtknot' : `${d}/` });
  }
  for (const d of [...folders].sort())
    if (d !== '.' && folders.has(dirname(d))) g.link(folderId(d), 'IN', folderId(dirname(d)));
  const known = new Set(files);
  for (const f of files) {
    g.thing(fileId(f), /(^|\/)test\//.test(f) ? 'TestFile' : 'SourceFile', { name: f });
    g.link(fileId(f), 'IN', folderId(dirname(f)));
  }
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const targets = new Set();
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = normalize(join(dirname(f), m[1]));
      if (known.has(target) && target !== f) targets.add(target);
    }
    // a test links only to the module it is named after (src/zoom.ts is tested in test/zoom.test.js)
    const test = /(^|\/)test\//.test(f) && f.replace(/^.*\/|\.test\.\w+$/g, '');
    for (const t of targets)
      if (!test) g.link(fileId(f), 'IMPORTS', fileId(t));
      else if (t.replace(/^.*\/|\.\w+$/g, '') === test) g.link(fileId(f), 'TESTS', fileId(t));
  }
  // a requirement's test that names a file is proved in that file
  const text = readFileSync(join(ROOT, 'requirements/editor-requirements.gql'), 'utf8');
  for (const m of text.matchAll(/^\((test_\w+):Test \{.*?\bfile: '([^']+)'/gm))
    if (reqs.has(m[1]) && known.has(m[2])) g.link(reqs.get(m[1]), 'WRITTEN_IN', fileId(m[2]));
  return fileId;
}

/** Where the project uses the theory. */
function joins(g, fileId) {
  g.things.push('// ── Where the two meet ──');
  const at = (f, type, idea) => {
    if (g.ids.has(fileId(f))) g.link(fileId(f), type, `gt_${idea}`);
  };
  at('packages/core/src/layout.ts', 'DRAWS_WITH', 'graphviz');
  at('packages/core/src/layout-worker.ts', 'DRAWS_WITH', 'graphviz');
  at('packages/core/src/layout-limits.ts', 'LIMITS', 'graph_drawing');
  at('packages/core/src/paths.ts', 'FINDS', 'path');
  at('packages/core/src/focus.ts', 'SHOWS', 'distance');
  at('packages/core/src/untangle.ts', 'REDUCES', 'crossing_number');
  at('packages/core/src/untangle-fold.ts', 'FOLDS', 'subgraph');
  at('packages/core/src/zoom.ts', 'NAVIGATES', 'graph_drawing');
  at('packages/core/src/strictness.ts', 'CHECKS', 'gql_standard');
  at('packages/core/src/blocks.ts', 'READS', 'property_graph');
  at('packages/core/src/store.ts', 'STORES', 'property_graph');
  at('packages/core/src/export-data-graphml.ts', 'WRITES', 'property_graph');
  for (const r of ['layout_contained', 'layered_layout', 'standard_gql'])
    if (g.ids.has(`rq_${r}`)) g.link(`rq_${r}`, 'ABOUT', r === 'standard_gql' ? 'gt_gql_standard' : 'gt_graph_drawing');
}

/** The graph block: a header, then one thing or link to a line, every line but the last ending in a comma. */
export function hugeGraph() {
  const g = new Graph();
  graphTheory(g);
  const reqs = requirements(g);
  waves(g, reqs);
  joins(g, code(g, reqs));
  const lines = [...g.things, ...g.links.map((l) => `${l},`)];
  const last = lines.findLastIndex((l) => !l.startsWith('//'));
  lines[last] = lines[last].replace(/,$/, '');
  const count = { things: g.ids.size, links: g.links.length };
  return {
    ...count,
    text: [
      '// graph: huge · SOURCE',
      `// ${count.things} things and ${count.links} links: graph theory, and this project. Made by scripts/make-huge-graph.mjs.`,
      ...lines,
    ].join('\n'),
  };
}

const BLOCK = /```gql\n\/\/ graph: huge · SOURCE\n[\s\S]*?\n```/;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { text, things, links } = hugeGraph();
  if (process.argv.includes('--write')) {
    const path = join(ROOT, NOTE);
    const note = readFileSync(path, 'utf8');
    if (!BLOCK.test(note)) throw new Error(`${NOTE} has no block that starts // graph: huge`);
    writeFileSync(
      path,
      note.replace(BLOCK, () => `\`\`\`gql\n${text}\n\`\`\``),
    );
    console.error(`${NOTE}: ${things} things, ${links} links, ${Buffer.byteLength(text)} bytes`);
  } else console.log(text);
}
