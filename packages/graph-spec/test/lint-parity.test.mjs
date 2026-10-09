// The JavaScript dialect linter finds the same traps on the same lines as graph_spec.lint in Python. Two of its patterns
// were rewritten without a regex lookbehind, which iOS before 16.4 cannot run; this proves the rewrite changed nothing.
// Each text is linted by both, live, and the answers must match: hand-picked edges first, then random texts built from
// the characters those patterns turn on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
const { lint } = require('../src/graph-spec-check.js');

function pythonLint(texts) {
  const prog =
    `import json, sys\nsys.path.insert(0, ${JSON.stringify(PY_SRC)})\nimport graph_spec\n` +
    'print(json.dumps([[[f["trap"], f["line"]] for f in graph_spec.lint(t)] for t in json.load(sys.stdin)]))';
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(texts), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const sorted = (fs) =>
  fs.map((f) => [f.trap, f.line]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const pySorted = (fs) => fs.slice().sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const EDGES = [
  'MATCH (a:Thing {id: 1}) RETURN a.for',
  '(n:for)',
  '(n: \n group)',
  'x.group BY y',
  'RETURN [a.name, b.size]',
  'RETURN [[a.x]]',
  'WITH x [a.b]',
  'RETURN a [b.c]',
  'RETURN -[a.b]',
  "RETURN '' [a.b]",
  'RETURN ] [a.b]',
  'RETURN > [a.b]',
  'RETURN ) [a.b]',
  'RETURN \n\n  [a.b]',
  'RETURN ( \n [a.b]',
  '[a.b]',
  '  [a.b]',
  'RETURN [:R]',
  'RETURN [a.id]',
  'RETURN [x.y] [p.q]',
  'a.b.c.for',
];

function randomTexts(n, seed) {
  const parts = [
    '[',
    ']',
    '(',
    ')',
    ':',
    '.',
    ',',
    '{',
    '}',
    '-',
    '>',
    "'",
    ' ',
    ' ',
    '\n',
    '\t',
    'a',
    'b',
    'x.y',
    'for',
    'group',
    'groups',
    'BY',
    'on',
    'id',
    'p.id',
    '_v',
    '1',
    "X'",
    "x'",
  ];
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s;
  };
  return Array.from({ length: n }, () =>
    Array.from({ length: 4 + (next() % 24) }, () => parts[next() % parts.length]).join(''),
  );
}

test('the linter finds the same traps on the same lines as Python, on hand-picked edges', () => {
  const py = pythonLint(EDGES);
  EDGES.forEach((t, i) => assert.deepEqual(sorted(lint(t)), pySorted(py[i]), JSON.stringify(t)));
});

test('the linter finds the same traps on the same lines as Python, on 4000 random texts', () => {
  const texts = randomTexts(4000, 20261007);
  const py = pythonLint(texts);
  texts.forEach((t, i) => assert.deepEqual(sorted(lint(t)), pySorted(py[i]), JSON.stringify(t)));
});

test('the libraries use no regex lookbehind, which iOS before 16.4 cannot run', () => {
  // every file of the library's source, its feature modules among them
  const src = fileURLToPath(new URL('../src', import.meta.url));
  for (const f of readdirSync(src, { recursive: true }).filter((x) => x.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8'), /\(\?<[=!]/, f);
  }
});
