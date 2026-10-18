// A missing comma between graph patterns (format spec §3, req:3.missing-comma; decided 7 Oct 2026). Take two complete
// patterns on separate lines with no comma between them, where a comma would make the block valid. Both readers read
// it as if the comma were there, and report where it is missing. Anything else is refused as before. Each block is
// read live by the JavaScript reader and by gql_profile.py. They must agree on the graph, the commas and the refusals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
const C = require('../src/graph-spec-check.js');

/** What the JavaScript reader makes of a block: the canonical graph and the lines where a comma was missing, or the refusal. */
function js(block) {
  try {
    const s = new C.Store();
    const g = s.apply(block);
    return {
      canon: C.canon(C.worldFromStore(s)[g] ?? new C.Graph(new Map(), [])).slice(0, 16),
      commas: s.commas.map((c) => c.line),
    };
  } catch (e) {
    if (e instanceof C.ProfileError) return { refused: e.line };
    throw e;
  }
}

function python(blocks) {
  const prog = `import json, sys
sys.path.insert(0, ${JSON.stringify(PY_SRC)})
import gql_profile as gp, graph_rules as gr
out = []
for b in json.load(sys.stdin):
    try:
        s = gp.Store(); g = s.apply(b); w = gr.World.from_store(s)
        out.append({'canon': gr.canon(w[g])[:16] if g in w.graphs else gr.canon(gr.Graph({}, []))[:16], 'commas': [c['line'] for c in s.commas]})
    except gp.ProfileError as e: out.append({'refused': e.line})
print(json.dumps(out))`;
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(blocks), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

/** The text each reader corrects a block to, the text an engine is given (req:3.engine-gets-commas), or null when the
 * block is refused. */
function jsCorrected(block) {
  try {
    const s = new C.Store();
    s.apply(block);
    return s.corrected(block);
  } catch (e) {
    if (e instanceof C.ProfileError) return null;
    throw e;
  }
}

function pythonCorrected(blocks) {
  const prog = `import json, sys
sys.path.insert(0, ${JSON.stringify(PY_SRC)})
import gql_profile as gp
out = []
for b in json.load(sys.stdin):
    try:
        s = gp.Store(); s.apply(b); out.append(s.corrected(b))
    except gp.ProfileError: out.append(None)
print(json.dumps(out))`;
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(blocks), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const WITH = "// graph: g\n(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(c:T {name: 'C'}),\n(a)-[:R]->(b)";

test('a block missing a comma between two complete patterns on separate lines reads as if the comma were there', () => {
  const without = WITH.replace("(b:T {name: 'B'}),", "(b:T {name: 'B'})");
  assert.deepEqual(
    js(without),
    { canon: js(WITH).canon, commas: [3] },
    'the same graph, and the line the comma is missing from',
  );
  assert.deepEqual(js(WITH).commas, [], 'a block with its commas reports none');
});

test('every missing comma is reported, a comment or blank lines between them notwithstanding', () => {
  const block = '// graph: g\n(a:T)\n\n// the second\n(b:T)\n// before the link\n(a)-[:R]->(b)';
  assert.deepEqual(js(block).commas, [2, 5]);
  assert.ok(
    'refused' in js('// graph: g\n(a:T)   // a comment after code\n(b:T)'),
    'a comment after code is outside the profile, as before',
  );
});

test('patterns on one line with no comma are still refused: only a line break stands for the comma', () => {
  assert.ok('refused' in js('// graph: g\n(a:T) (b:T)'));
});

test('a line that is not otherwise valid is refused as before', () => {
  assert.equal(js('// graph: g\n(a:T)\n(b:T {name: })').refused, 3);
  assert.equal(js('// graph: g\n(a:T)\n(b:T,').refused, 3);
});

test('a missing comma before SET, or after MATCH’s list, is not guessed at', () => {
  assert.ok('refused' in js('// graph: g\n(a:T)\nSET a.x = 1\n(b:T)'));
});

test('the Python reader agrees on every block: the graph, the commas, the refusals', () => {
  const blocks = [
    WITH,
    WITH.replace("(b:T {name: 'B'}),", "(b:T {name: 'B'})"),
    WITH.replace(/,\n/g, '\n'),
    '// graph: g\n(a:T)\n\n// the second\n(b:T)   // after b\n(a)-[:R]->(b)',
    '// graph: g\n(a:T) (b:T)',
    '// graph: g\n(a:T)\n(b:T {name: })',
    '// graph: g\n(a:T)\n(b:T,',
    '// graph: g\n(a:T)\nSET a.x = 1\n(b:T)',
    "// graph: g\n(a:T)-[:R]->(b:T)\n(c:T)-[:R]->(a)\nSET c.x = 'y'",
    "// graph: g\nMATCH (a:T {id: 'a'})\n(b:T)",
    '// graph: g\n(a:T)\n(a)',
  ];
  const py = python(blocks);
  blocks.forEach((b, i) => assert.deepEqual(js(b), py[i], JSON.stringify(b)));
});

test('random blocks: the two readers agree', () => {
  const parts = [
    '(a:T)',
    "(b:T {name: 'x'})",
    '(a)-[:R]->(b)',
    '(c:U)',
    ',',
    '\n',
    ' ',
    '\n\n',
    '// note\n',
    'SET a.x = 1',
    '(',
    ')',
    '{name: }',
  ];
  let s = 11;
  const blocks = Array.from({ length: 600 }, () => {
    let b = '// graph: g\n';
    for (let k = 0; k < 2 + ((s = (s * 1103515245 + 12345) >>> 0) % 8); k++)
      b += parts[(s = (s * 1103515245 + 12345) >>> 0) % parts.length];
    return b;
  });
  const py = python(blocks);
  blocks.forEach((b, i) => assert.deepEqual(js(b), py[i], JSON.stringify(b)));
});

test('the corrected text writes each missing comma at the end of the code on its line, as the Python reader does', () => {
  const blocks = [
    "// graph: g\n(a:T {id: 'a'})   \n(b:T {id: 'b',\n  n: 1})\t\n\n// the link, (a) to (b)\n(a)-[:R]->(b)",
    "// graph: g\n(a:T {id: 'a'}),\n(b:T {id: 'b'}),\n(a)-[:R]->(b)\n(c:T {id: 'c'}),\n(c)-[r]->(b)\n(d:T {id: 'd'})",
  ];
  const want = [
    "// graph: g\n(a:T {id: 'a'}),   \n(b:T {id: 'b',\n  n: 1}),\t\n\n// the link, (a) to (b)\n(a)-[:R]->(b)",
    "// graph: g\n(a:T {id: 'a'}),\n(b:T {id: 'b'}),\n(a)-[:R]->(b),\n(c:T {id: 'c'}),\n(c)-[:R]->(b),\n(d:T {id: 'd'})",
  ];
  const ours = blocks.map(jsCorrected);
  assert.deepEqual(ours, want, 'the comma after the last character of code on its line, and no line added');
  assert.deepEqual(pythonCorrected(blocks), ours, 'the Python reader corrects each block to the same text');
});

test('random blocks: the two readers correct each to the same text, with no line added', () => {
  let s = 7;
  // the high bits of each step: the low bits of this generator repeat every few steps
  const next = (n) => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) % n;
  const pick = (xs) => xs[next(xs.length)];
  // what stands between two patterns: a comma, or a line break with none (read in). On the way may be CRLF, NBSP,
  // U+3000, a blank line or a comment line. Rarely it is a space alone, which is refused
  const SEPARATORS = [',\n', ', ', ',\r\n', '\n', '\n', '\r\n', ' \n', '　\n', '\n\n', '\n// a note, (x)\n', ' '];
  const blocks = Array.from({ length: 400 }, () => {
    const written = [];
    let typed = false;
    const pattern = () => {
      if (written.length < 2 || next(5) < 2) {
        const v = `v${written.length}`;
        written.push(v);
        return next(4) ? `(${v}:T {id: '${v}'})` : `(${v}:T {id: '${v}',\n  s: 'a, b) // c'})`;
      }
      const [a, b] = [pick(written), pick(written)];
      // a type without its colon once R is written with one, and rarely before, which is refused
      const bare = (typed && next(2)) || !next(20);
      typed ||= !bare;
      return bare ? `(${a})${pick(['-', '- '])}[r]->(${b})` : `(${a})-[:R]->(${b})`;
    };
    let b = `// graph: g${pick(['\n', '\r\n'])}${pattern()}`;
    for (let k = 0, many = 2 + next(8); k < many; k++) b += pick(SEPARATORS) + pattern();
    return b;
  });
  const py = pythonCorrected(blocks);
  const ours = blocks.map(jsCorrected);
  blocks.forEach((b, i) => {
    assert.equal(ours[i], py[i], JSON.stringify(b));
    if (ours[i] !== null) assert.equal(ours[i].split('\n').length, b.split('\n').length, JSON.stringify(b));
  });
  const count = (t, c) => t.split(c).length - 1;
  const read = ours.filter((c) => c !== null).length;
  const both = blocks.filter(
    (b, i) => ours[i] && count(ours[i], ',') > count(b, ',') && count(ours[i], ':') > count(b, ':'),
  );
  assert.ok(read >= 200, `a good share of the blocks are read: ${read} of 400`);
  assert.ok(both.length >= 50, `some blocks have both a comma and a colon written in: ${both.length}`);
  assert.ok(
    both.some((b) => b.includes('- [r]')),
    'a type without its colon, after a dash and a space, is among them',
  );
});

test('a CRLF line: the comma goes before its \\r, as the Python reader writes it', () => {
  const blocks = [
    "// graph: g\r\n(a:T {id: 'a'})\r\n(b:T {id: 'b'})  \r\n(a)-[:R]->(b)\r\n(b)-[r]->(a)\r\n(c:T {id: 'c'})\r\n",
  ];
  const want = [
    "// graph: g\r\n(a:T {id: 'a'}),\r\n(b:T {id: 'b'}),  \r\n(a)-[:R]->(b),\r\n(b)-[:R]->(a),\r\n(c:T {id: 'c'})\r\n",
  ];
  const ours = blocks.map(jsCorrected);
  assert.deepEqual(ours, want);
  assert.deepEqual(pythonCorrected(blocks), ours);
});

test('whitespace from the reader’s set ends a line: the comma goes before it (NBSP, U+3000, U+2028)', () => {
  const blocks = ["// graph: g\n(a:T {id: 'a'}) \n(b:T {id: 'b'})　　\n(c:T {id: 'c'}) \n(a)-[:R]->(c)"];
  const want = ["// graph: g\n(a:T {id: 'a'}), \n(b:T {id: 'b'}),　　\n(c:T {id: 'c'}), \n(a)-[:R]->(c)"];
  const ours = blocks.map(jsCorrected);
  assert.deepEqual(ours, want);
  assert.deepEqual(pythonCorrected(blocks), ours);
});

test('a string holding a comma, a ) or // is never taken for the end of the code, nor is an emoji miscounted', () => {
  // an emoji is two UTF-16 units in JavaScript and one code point in Python: each reader counts its own way
  const blocks = [
    "// graph: g\n(a:T {id: 'a', s: 'x, y) // z'})\n(b:T {id: 'b', s: '😀,)'})\n(a)-[:R]->(b)\n(b)-[r]->(a)",
  ];
  const want = [
    "// graph: g\n(a:T {id: 'a', s: 'x, y) // z'}),\n(b:T {id: 'b', s: '😀,)'}),\n(a)-[:R]->(b),\n(b)-[:R]->(a)",
  ];
  const ours = blocks.map(jsCorrected);
  assert.deepEqual(ours, want);
  assert.deepEqual(pythonCorrected(blocks), ours);
});
