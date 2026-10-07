// The drawing's colours and size, as graph_svg.py writes them (spec §3, "one style"; §11, "contrast"): the placeholder
// colours Graphviz is given become Obsidian theme colours, blended for contrast, and the drawing fits the note. Each case
// is laid out once by the Graphviz engine the plugin ships, then themed by the core and by graph_svg._themed, live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { instance } from '@viz-js/viz';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';
import { themed, choose, fixed } from '../src/theme.ts';

const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
function python(code, input) {
  const prog = `import json, sys\nsys.path.insert(0, ${JSON.stringify(PY_SRC)})\nimport graph_svg\ncases = json.load(sys.stdin)\n${code}`;
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const GRAPHS = [
  `// graph: g
(q:Question {title: 'Which device?'}), (o1:Option {name: 'A tablet'}), (o2:Option {name: 'A reader'}),
(r:Reason {title: 'It costs nothing extra'}), (s:Source {title: 'Trial notes'}),
(o1)-[:ANSWERS]->(q), (o2)-[:ANSWERS]->(q), (r)-[:FAVOURS]->(o1), (r)-[:COUNTS_AGAINST]->(o2), (r)-[:CITES]->(s)`,
  `// graph: g
(a:Person:Author {name: 'Ada & "Bob"'}), (b:Book {title: 'Notes <on> things, déjà vu'}), (c:Ünïcödé {name: 'x'}),
(a)-[:WROTE]->(b), (b)-[:SUPPORTS]->(c), (c)-[:REFUTES]->(a), (a)-[:KNOWS]->(c)`,
  `// graph: g
(lonely:Thing {name: 'One thing alone, with a long name that wraps onto lines'})`,
];

test('the core themes a drawing exactly as graph_svg._themed does', async () => {
  const viz = await instance();
  const cases = [];
  for (const g of GRAPHS) {
    const drawing = readNote([g]).graphs.get('g');
    for (const rd of ['LR', 'TB']) {
      const { source, kinds, readings } = layoutSource(drawing, rd);
      cases.push({ svg: viz.renderString(source, { format: 'svg' }), kinds, readings });
    }
  }
  const py = python(
    'print(json.dumps([graph_svg._themed(c["svg"], c["kinds"], c["readings"]) for c in cases]))',
    cases,
  );
  cases.forEach((c, i) => assert.equal(themed(c.svg, c.kinds, c.readings), py[i], `case ${i}`));
});

test('the themed drawing names theme colours, never the placeholders Graphviz was given', async () => {
  const viz = await instance();
  const { source, kinds, readings } = layoutSource(readNote([GRAPHS[0]]).graphs.get('g'), 'LR');
  const svg = themed(viz.renderString(source, { format: 'svg' }), kinds, readings);
  assert.doesNotMatch(svg, /#000[0-4][0-9a-f]{2}"/);
  assert.match(svg, /var\(--text-normal\)/);
  assert.match(svg, /color-mix\(in srgb, var\(--color-green\) 75%, var\(--text-normal\)\)/, 'favours is drawn green');
  assert.match(
    svg,
    /color-mix\(in srgb, var\(--color-red\) 50%, var\(--text-normal\)\)/,
    'counts against is labelled red',
  );
});

test('numbers are written as Python writes them, ties to even', () => {
  const xs = [
    0.125, 0.375, 2.675, 1.005, -0.125, 12.345, 99.995, 0.5, 1.5, 2.5, 3.14159, 1e-9, 1234.5678, -0.001, -0.5, 0.005,
    0.015,
  ];
  for (let i = 0; i < 300; i++) xs.push(Math.round(Math.random() * 1e6) / 1000 - 500, Math.random() * 2000 - 1000);
  const py = python('print(json.dumps([[f"{x:.2f}", f"{x:.0f}"] for x in cases]))', xs);
  xs.forEach((x, i) => assert.deepEqual([fixed(x, 2), fixed(x, 0)], py[i], String(x)));
});

test('of the two directions, the one that shrinks least to fit the page wins, as graph_svg.render chooses', () => {
  const sizes = [
    [
      [600, 300],
      [400, 700],
    ],
    [
      [900, 200],
      [500, 500],
    ],
    [
      [1400, 300],
      [600, 1200],
    ],
    [
      [700, 700],
      [690, 700],
    ],
    [
      [300, 2000],
      [2000, 300],
    ],
    [
      [701, 100],
      [700, 100],
    ],
    [
      [1000, 100],
      [1000, 1700],
    ],
    [
      [100, 100],
      [100, 100],
    ],
  ];
  const py = python(
    `S = graph_svg.STYLE
out = []
for c in cases:
    best = None
    for rd, (w, h) in zip(S['directions'], c):
        fit = min(1.0, S['page_width'] / w) - (0.25 if h > S['max_height_ratio'] * max(w, S['page_width']) else 0)
        if best is None or fit > best[0] + 0.02: best = (fit, rd)
    out.append(best[1])
print(json.dumps(out))`,
    sizes,
  );
  sizes.forEach((s, i) =>
    assert.equal(
      choose(s.map(([w, h], k) => ({ rankdir: ['LR', 'TB'][k], width: w, height: h }))).rankdir,
      py[i],
      JSON.stringify(s),
    ),
  );
});

test('where color-mix is not supported (iOS before 16.2; Obsidian runs on iOS 15), each blend falls back to its theme hue', async () => {
  const { withoutColorMix } = await import('../src/theme.ts');
  const viz = await instance();
  const { source, kinds, readings } = layoutSource(readNote([GRAPHS[0]]).graphs.get('g'), 'LR');
  const svg = themed(viz.renderString(source, { format: 'svg' }), kinds, readings);
  const plain = withoutColorMix(svg);
  assert.doesNotMatch(plain, /color-mix/);
  assert.match(plain, /stroke:var\(--color-green\)/, 'favours is still green');
  assert.equal(
    plain.replace(/var\(--color-\w+\)/g, 'X'),
    svg.replace(/color-mix\(in srgb, var\(--color-\w+\) \d+%, var\(--text-normal\)\)/g, 'X'),
    'nothing else changes',
  );
});
