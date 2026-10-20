// Every reader, check and join stops at a stated limit, with a clear refusal (editor spec §51, spec_read_limits; GS4).
// The limits are size, nesting and join size. limit-cases.json gives each limit and its problem code. The Python
// library is held to the same table by python/graph_spec/tests/test_limits.py. Each refusal comes before the work it
// would take, so a graph far past a limit never runs the reader out of memory or stack.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./limit-cases.json', import.meta.url)), 'utf8'));
const { limits, codes } = table;

/** The ProfileError a call throws, or a failure when it throws none or another. */
const refusal = (call) => {
  try {
    call();
  } catch (e) {
    assert.ok(e instanceof C.ProfileError, `a ProfileError, not ${e}`);
    return e;
  }
  assert.fail('it was not refused');
};
const things = (n, from = 0) => Array.from({ length: n }, (_, i) => `(n${from + i}:Note)`).join(',\n');
/** A path graph whose paths open one into the next, `depth` deep. */
const nested = (depth) => {
  const lines = ['// graph: deep', 'INSERT'];
  for (let i = 0; i <= depth; i++) lines.push(`(p${i}:Path {altitude: ${depth - i + 1}}),`);
  for (let i = 0; i < depth; i++) lines.push(`(p${i})-[:STEP {seq: 1}]->(p${i + 1}),`);
  lines.push(`(leaf:Note)`, `,(p${depth})-[:STEP {seq: 1}]->(leaf)`);
  return lines.join('\n');
};
const doc = (name, body) => `// graph: ${name} · document ${name} · schema s@1 · as of 2026-10-20\nINSERT\n${body}`;

describe('the reader, the check and a join stop at stated limits', () => {
  test('the library states the limits the table gives', () => {
    assert.deepEqual(C.LIMITS, limits);
  });

  test('a block longer than the limit is refused with its reason, before it is read', () => {
    const block = `// graph: big\nINSERT\n(a:Note {text: '${'x'.repeat(limits.block_chars)}'})`;
    const e = refusal(() => C.read([block]));
    assert.equal(e.code, codes.block_chars);
    assert.match(e.message, new RegExp(String(limits.block_chars)));
    // ten times the limit is refused as fast: it is measured, never tokenised
    const started = Date.now();
    refusal(() => C.read([block.repeat(10)]));
    assert.ok(Date.now() - started < 1000, 'refused before it is read');
  });

  test('a graph holding more things and links than the limit is refused with its reason', () => {
    const at = `// graph: many\nINSERT\n${things(limits.items)}`;
    assert.equal(C.read([at]).graph('many').nodes.size, limits.items);
    const e = refusal(() => C.read([at, `// graph: many\nINSERT\n${things(1, limits.items)}`]));
    assert.equal(e.code, codes.items);
    assert.match(e.message, /many/);
  });

  test('paths that open into paths deeper than the limit are refused, never run out of stack', () => {
    const at = C.worldFromStore(C.read([nested(limits.nesting)])).deep;
    assert.equal(C.viewAt(at, 'p0', 0).length, 1);
    for (const depth of [limits.nesting + 1, 20000]) {
      const g = C.worldFromStore(C.read([nested(depth)])).deep;
      assert.equal(refusal(() => C.viewAt(g, 'p0', 0)).code, codes.nesting);
    }
  });

  test('a join of more documents than the limit is refused with its reason', () => {
    const docs = Array.from({ length: limits.join_documents + 1 }, (_, i) => doc(`d${i}`, "(a:Note {id: 'a'})"));
    const e = refusal(() => C.joinDocs({ docs }));
    assert.equal(e.code, codes.join_documents);
    assert.match(e.message, new RegExp(String(limits.join_documents)));
  });

  test('a join holding more things and links in all than the limit is refused with its reason', () => {
    // three documents, each inside the limit for one graph, and over the join's limit together
    const per = Math.floor(limits.join_items / 3) + 1;
    const e = refusal(() => C.joinDocs({ docs: [0, 1, 2].map((i) => doc(`d${i}`, things(per))) }));
    assert.equal(e.code, codes.join_items);
  });
});
