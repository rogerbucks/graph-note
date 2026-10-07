// The layout source from the core is byte-identical to the one graph_svg.py writes (spec §12,
// "same layout as Python"). Each case is laid out by both, live: the Python library is run with
// the cases, and the JavaScript must give exactly its text.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const PY_SRC = here('../../../python/graph_spec/src');
const style = JSON.parse(readFileSync(`${PY_SRC}/graph_svg.style.json`, 'utf8'));
const layout = require('../src/graph-layout.js');

/** Runs a snippet of Python with the library on its path; `cases` arrives as JSON on stdin, the answer leaves as JSON. */
function python(code, cases) {
  const prog = `import json, sys\nsys.path.insert(0, ${JSON.stringify(PY_SRC)})\ncases = json.load(sys.stdin)\n${code}`;
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const recorded = JSON.parse(readFileSync(here('../../../python/graph_spec/tests/layout_cases.json'), 'utf8'));
const kinds = ['Question', 'Option', 'Reason', 'Claim', 'Source', 'Evidence', 'Person', 'Decision'];
const cases = {
  ...Object.fromEntries(
    Object.entries(recorded).map(([k, c]) => [k, { nodes: c.nodes, edges: c.edges, rankdir: c.rankdir }]),
  ),
  'more kinds than hues, and the readings that carry meaning': {
    nodes: kinds.map((k, i) => [`k${i}`, k, `${k} number ${i}`]),
    edges: [
      ['k0', 'favours', 'k1'],
      ['k2', 'counts against', 'k1'],
      ['k3', 'supports', 'k4'],
      ['k5', 'refutes', 'k3'],
      ['k6', 'decides', 'k7'],
      ['k7', 'rests on', 'k5'],
      ['k1', 'answers', 'k0'],
    ],
    rankdir: 'TB',
  },
  'quotes, ampersands, accents and a word longer than a line': {
    nodes: [
      ['a', 'Note', 'It\'s "quoted" & <marked> — déjà vu'],
      ['b', 'Note', 'Supercalifragilisticexpialidocious-and-more'],
      ['c', 'Ünïcödé', 'Grüße aus Köln, straße'],
    ],
    edges: [
      ['a', 'links "to"', 'b'],
      ['b', 'links "to"', 'c'],
    ],
    rankdir: 'LR',
  },
  'a kind that only receives links, beside the main destination': {
    nodes: [
      ['q', 'Question', 'Which?'],
      ['o1', 'Option', 'One'],
      ['o2', 'Option', 'Two'],
      ['s', 'Source', 'A report'],
      ['r', 'Reason', 'Cheaper'],
    ],
    edges: [
      ['o1', 'answers', 'q'],
      ['o2', 'answers', 'q'],
      ['r', 'favours', 'o1'],
      ['r', 'from', 's'],
    ],
    rankdir: 'LR',
  },
  'one thing, no links': { nodes: [['x', 'Thing', '']], edges: [], rankdir: 'LR' },
};

describe('the layout source', () => {
  const py = python(
    "import graph_svg\nout = {}\nfor name, c in cases.items():\n    src, kinds, readings = graph_svg.dot_source([tuple(n) for n in c['nodes']], [tuple(e) for e in c['edges']], c['rankdir'])\n    out[name] = [src, kinds, readings]\nprint(json.dumps(out))",
    cases,
  );
  for (const [name, c] of Object.entries(cases)) {
    test(`is byte-identical to Python's: ${name}`, () => {
      assert.deepEqual(layout.dotSource(c.nodes, c.edges, c.rankdir, style), py[name]);
    });
  }

  test('the recorded cases still give their recorded source', () => {
    for (const [name, c] of Object.entries(recorded)) {
      assert.deepEqual(layout.dotSource(c.nodes, c.edges, c.rankdir, style), [c.source, c.kinds, c.readings], name);
    }
  });

  test('with no direction, and none in the style, it refuses as Python does', () => {
    assert.throws(() => layout.dotSource([['a', 'A', 'a']], [], null, style), /rankdir/);
  });
});

describe('the parts it is built from', () => {
  const texts = [
    '',
    '   ',
    'Which device?',
    'It costs nothing extra',
    'exactly twenty-two ch.',
    'Rain is likely tomorrow, says the forecast for the weekend',
    'Supercalifragilisticexpialidocious-and-more words',
    'tabs\tand\nnew lines  and   runs of spaces',
    'a b c d e f g h i j k l m n o p q r s t u v w x y z',
    'déjà vu, naïve café — Grüße',
    'end with a space ',
    ' start with one',
    'twentytwocharacterword then more',
    'twentythreecharacterwor then more',
    'Mathematical 𝔊𝔯𝔞𝔭𝔥𝔰 and 𝔫𝔬𝔱𝔢𝔰 wrap by character here',
  ];
  const py = python(
    "import textwrap, zlib, html\nprint(json.dumps({'wrap': [textwrap.wrap(t, 22, break_on_hyphens=False) for t in cases['texts']], 'crc': [zlib.crc32(n.encode()) for n in cases['names']], 'escape': [html.escape(t) for t in cases['texts']], 'round': [round(x) for x in cases['halves']]}))",
    {
      texts,
      names: [...kinds, 'favours', 'counts against', 'déjà', ''],
      halves: [0.5, 1.5, 2.5, 3.125, 3.5, 4.5, -0.5, 2.675],
    },
  );

  test("text wraps as Python's textwrap does", () => {
    assert.deepEqual(
      texts.map((t) => layout.wrap(t, 22)),
      py.wrap,
    );
  });

  test("names hash as zlib's CRC-32 does", () => {
    assert.deepEqual([...kinds, 'favours', 'counts against', 'déjà', ''].map(layout.crc32), py.crc);
  });

  test("text escapes as Python's html.escape does", () => {
    assert.deepEqual(texts.map(layout.escape), py.escape);
  });

  test("halves round to even, as Python's round does", () => {
    assert.deepEqual([0.5, 1.5, 2.5, 3.125, 3.5, 4.5, -0.5, 2.675].map(layout.roundHalfEven), py.round);
  });
});
