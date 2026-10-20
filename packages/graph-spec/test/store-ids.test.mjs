// A node's id in the reader (graph spec §3, decided with Roger, 10 Oct 2026): SET never changes a node's id
// (req:3.set-keeps-id), and a node's id is always text (req:3.id-is-text). The Python reader answers the same:
// python/graph_spec/tests/test_store_ids.py. python/graph_spec/tests/test_parity.py holds the two together live.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');

const TWO = "// graph: g\n(a:T {id: 'a'}),\n(b:T {id: 'b'})";

/** The refusal a store gives the blocks, applied in order, as [line, message, fix]; null when all are read. */
function refusal(...blocks) {
  const store = new gs.Store();
  try {
    blocks.forEach((b) => store.apply(b));
  } catch (e) {
    if (!(e instanceof gs.ProfileError)) throw e;
    return [e.line, e.msg, e.fix];
  }
  return null;
}

/** Each node's properties in graph g, in the order written. */
const props = (store) => [...store.graph('g').nodes.values()].map((n) => n.props);

describe('req:3.set-keeps-id: SET never changes a node’s id', () => {
  const SETS = {
    'to an id another node has': "SET b.id = 'a'",
    'to a fresh id': "SET b.id = 'c'",
    'to the node’s own id': "SET b.id = 'b'",
    'to a number': 'SET b.id = 1',
  };

  test('req:3.set-keeps-id: a SET of id in the same block is refused, whatever the value, with the fix', () => {
    for (const [name, set] of Object.entries(SETS)) {
      const r = refusal(`${TWO}\n${set}`);
      assert.ok(r, name);
      assert.equal(r[0], 4, name);
      assert.equal(r[1], "SET would change b's id, and a thing's id never changes", name);
      assert.equal(r[2], 'write the right thing, then link b to it or supersede it', name);
    }
  });

  test('req:3.set-keeps-id: a SET of id in a later block is refused, whatever the value, with the fix', () => {
    for (const [name, set] of Object.entries(SETS)) {
      const r = refusal(TWO, `// graph: g\n${set}`);
      assert.ok(r, name);
      assert.equal(r[0], 2, name);
      assert.equal(r[1], "SET would change b's id, and a thing's id never changes", name);
    }
  });

  test('req:3.set-keeps-id: a SET of id on a node found by MATCH, or after another SET, is refused at its line', () => {
    assert.equal(refusal(TWO, "// graph: g\nMATCH (x:T {id: 'b'})\nSET x.id = 'c'")[0], 3);
    assert.deepEqual(refusal(TWO, "// graph: g\nSET a.name = 'A',\n  b.id = 'c'").slice(0, 2), [
      3,
      "SET would change b's id, and a thing's id never changes",
    ]);
  });

  test('req:3.set-keeps-id: a refused SET of id leaves the store as it was', () => {
    const store = new gs.Store();
    store.apply(TWO);
    assert.throws(() => store.apply("// graph: g\nSET a.name = 'A', b.id = 'a'"), gs.ProfileError);
    assert.deepEqual(props(store), [{ id: 'a' }, { id: 'b' }]);
  });

  test('req:3.set-keeps-id: the syntax check refuses a SET of id as the store does', () => {
    const e = gs.checkSyntax("// graph: g\nSET b.id = 'c'");
    assert.ok(e instanceof gs.ProfileError);
    assert.deepEqual([e.line, e.msg], [2, "SET would change b's id, and a thing's id never changes"]);
  });

  test('req:3.set-keeps-id: a SET of any other key is still read, in the same block and in a later one', () => {
    const store = new gs.Store();
    store.apply(`${TWO}\nSET b.name = 'Bee'`);
    store.apply("// graph: g\nSET a.name = 'Ay', b.size = 2");
    assert.deepEqual(props(store), [
      { id: 'a', name: 'Ay' },
      { id: 'b', name: 'Bee', size: 2 },
    ]);
  });
});

describe('req:3.id-is-text: a node’s id is always text', () => {
  // as written, and the quoted id the fix gives
  const FORMS = [
    ['1', "'1'"],
    ['1.0', "'1.0'"],
    ['-2', "'-2'"],
    ['1e3', "'1e3'"],
    ['TRUE', "'TRUE'"],
    ['false', "'false'"],
    ["DATE '2026-10-01'", "'2026-10-01'"],
    ["DATETIME '2026-10-01T09:00:00+01:00'", "'2026-10-01T09:00:00+01:00'"],
  ];

  test('req:3.id-is-text: each non-text id written in INSERT is refused, with the fix that quotes it', () => {
    for (const [written, quoted] of FORMS) {
      const r = refusal(`// graph: g\nINSERT (a:T {name: 'A'}),\n(b:T {id: ${written}})`);
      assert.deepEqual(r, [3, `id ${written} is not text`, `write id: ${quoted} — a thing's id is always text`]);
    }
  });

  test('req:3.id-is-text: each non-text id written in the data shortcut or in MATCH is refused at its line', () => {
    for (const [written, quoted] of FORMS) {
      assert.deepEqual(refusal(`// graph: g\n(b:T {id: ${written}})`).slice(0, 2), [2, `id ${written} is not text`]);
      const r = refusal(TWO, `// graph: g\nMATCH (x:T {id: ${written}})\nINSERT (c:T)`);
      assert.deepEqual(r, [2, `id ${written} is not text`, `write id: ${quoted} — a thing's id is always text`]);
    }
  });

  test('req:3.id-is-text: the refusal names the line the id is written on, in a map over several lines', () => {
    assert.equal(refusal("// graph: g\n(b:T {name: 'B',\n  size: 2,\n  id: 7})")[0], 4);
  });

  test('req:3.id-is-text: the syntax check refuses a non-text id as the store does', () => {
    const e = gs.checkSyntax('// graph: g\n(b:T {id: 1})');
    assert.ok(e instanceof gs.ProfileError);
    assert.deepEqual([e.line, e.msg], [2, 'id 1 is not text']);
  });

  test('req:3.id-is-text and req:3.set-keeps-id: a missing comma hides neither id refusal', () => {
    // the missing comma's retry keeps the refusal it meets, so neither is given as "unexpected '('" (review of #49)
    const fix = "write id: '1' — a thing's id is always text";
    assert.deepEqual(refusal("// graph: g\n(a:T {id: 'a'})\n(b:T {id: 1})"), [3, 'id 1 is not text', fix]);
    assert.deepEqual(refusal("// graph: g\n(a:T {id: 'a'})\n(b:T {name: 'B'})-[:R]->(c:T {id: TRUE})").slice(0, 2), [
      3,
      'id TRUE is not text',
    ]);
    const e = gs.checkSyntax("// graph: g\n(a:T {id: 'a'})\n(b:T {id: 1})");
    assert.deepEqual([e.line, e.msg, e.fix], [3, 'id 1 is not text', fix]);
    assert.deepEqual(refusal("// graph: g\n(a:T {id: 'a'})\n(b:T {id: 'b'})\nSET b.id = 'c'").slice(0, 2), [
      4,
      "SET would change b's id, and a thing's id never changes",
    ]);
  });

  test('req:3.id-is-text: a text id is read, a number among the other properties too', () => {
    const store = new gs.Store();
    store.apply("// graph: g\n(b:T {id: '1', size: 1, done: TRUE})");
    store.apply("// graph: g\nMATCH (x:T {id: '1'})\nINSERT (c:T {id: '2'})");
    assert.deepEqual(props(store), [{ id: '1', size: 1, done: true }, { id: '2' }]);
  });
});
