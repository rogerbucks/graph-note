// A missing comma between graph patterns (format spec §3, req:3.missing-comma; decided 7 Oct 2026). When two complete
// patterns sit on separate lines with no comma between them, and a comma there would make the block valid, both readers
// read it as if the comma were there and report where it is missing; anything else is refused as before. Each block is
// read by the JavaScript reader and by gql_profile.py, live, and they must agree on the graph, the commas and the refusals.
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
    const s = new C.Store(); const g = s.apply(block);
    return { canon: C.canon(C.worldFromStore(s)[g] ?? new C.Graph(new Map(), [])).slice(0, 16), commas: s.commas.map((c) => c.line) };
  } catch (e) { if (e instanceof C.ProfileError) return { refused: e.line }; throw e; }
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

const WITH = "// graph: g\n(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(c:T {name: 'C'}),\n(a)-[:R]->(b)";

test('a block missing a comma between two complete patterns on separate lines reads as if the comma were there', () => {
  const without = WITH.replace("(b:T {name: 'B'}),", "(b:T {name: 'B'})");
  assert.deepEqual(js(without), { canon: js(WITH).canon, commas: [3] }, 'the same graph, and the line the comma is missing from');
  assert.deepEqual(js(WITH).commas, [], 'a block with its commas reports none');
});

test('every missing comma is reported, a comment or blank lines between them notwithstanding', () => {
  const block = "// graph: g\n(a:T)\n\n// the second\n(b:T)\n// before the link\n(a)-[:R]->(b)";
  assert.deepEqual(js(block).commas, [2, 5]);
  assert.ok('refused' in js("// graph: g\n(a:T)   // a comment after code\n(b:T)"), 'a comment after code is outside the profile, as before');
});

test('patterns on one line with no comma are still refused: only a line break stands for the comma', () => {
  assert.ok('refused' in js("// graph: g\n(a:T) (b:T)"));
});

test('a line that is not otherwise valid is refused as before', () => {
  assert.equal(js("// graph: g\n(a:T)\n(b:T {name: })").refused, 3);
  assert.equal(js("// graph: g\n(a:T)\n(b:T,").refused, 3);
});

test('a missing comma before SET, or after MATCH’s list, is not guessed at', () => {
  assert.ok('refused' in js("// graph: g\n(a:T)\nSET a.x = 1\n(b:T)"));
});

test('the Python reader agrees on every block: the graph, the commas, the refusals', () => {
  const blocks = [
    WITH, WITH.replace("(b:T {name: 'B'}),", "(b:T {name: 'B'})"), WITH.replace(/,\n/g, '\n'),
    "// graph: g\n(a:T)\n\n// the second\n(b:T)   // after b\n(a)-[:R]->(b)", "// graph: g\n(a:T) (b:T)",
    "// graph: g\n(a:T)\n(b:T {name: })", "// graph: g\n(a:T)\n(b:T,", "// graph: g\n(a:T)\nSET a.x = 1\n(b:T)",
    "// graph: g\n(a:T)-[:R]->(b:T)\n(c:T)-[:R]->(a)\nSET c.x = 'y'",
    "// graph: g\nMATCH (a:T {id: 'a'})\n(b:T)", "// graph: g\n(a:T)\n(a)",
  ];
  const py = python(blocks);
  blocks.forEach((b, i) => assert.deepEqual(js(b), py[i], JSON.stringify(b)));
});

test('random blocks: the two readers agree', () => {
  const parts = ["(a:T)", "(b:T {name: 'x'})", "(a)-[:R]->(b)", "(c:U)", ",", "\n", " ", "\n\n", "// note\n", "SET a.x = 1", "(", ")", "{name: }"];
  let s = 11;
  const blocks = Array.from({ length: 600 }, () => {
    let b = '// graph: g\n';
    for (let k = 0; k < 2 + ((s = (s * 1103515245 + 12345) >>> 0) % 8); k++) b += parts[(s = (s * 1103515245 + 12345) >>> 0) % parts.length];
    return b;
  });
  const py = python(blocks);
  blocks.forEach((b, i) => assert.deepEqual(js(b), py[i], JSON.stringify(b)));
});
