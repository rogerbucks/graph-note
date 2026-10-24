// A lens as graph data (editor spec §33, lens_is_saved_query). A lens is a named, saved query with an optional
// default altitude. It answers fresh after an edit, and joins and can be contested like any claim. It holds no data of
// its own, and is flagged when a schema it uses changes. The cases are in saved-lens-cases.json, and
// python/graph_spec/tests/test_saved_lenses.py holds the Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./saved-lens-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (s) =>
  new C.Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b, p]) => [a, t, b, p || {}]),
  );
const named = (name) => cases.find((c) => c.name === name);
const run = (c) => C[c.call](graphOf(c.graph), ...c.args);

describe('lens_is_saved_query', () => {
  for (const c of cases)
    test(c.name, () => {
      assert.deepEqual(JSON.parse(JSON.stringify(run(c))), c.expected);
    });

  test('a lens reopened after an edit answers fresh, and holds no data of its own', () => {
    const before = run(named('a lens finds what its query asks for, with its default altitude'));
    const after = run(named('a lens opened after an edit answers fresh'));
    assert.deepEqual(before.things, ['d1']);
    assert.deepEqual(after.things, ['d1', 'd2']);
    assert.deepEqual(after.flags, []);
    const holding = run(named('a lens holding data is flagged'));
    assert.ok(holding[0].flags.every(([code]) => code === 'lens-holds-data'));
  });

  test('a lens joins and can be contested like any claim', () => {
    const block = (doc, query) =>
      `// graph: work · document ${doc} · schema s1 · as of 2026-10-01\n(open_decisions:Lens {name: 'Open decisions', query: '${query}'})`;
    const out = C.meshJoin({
      docs: [block('doc:a', 'Decision WHERE votes > 2'), block('doc:b', 'Decision WHERE votes > 3')],
      config: {},
      findings: [],
    });
    assert.equal(out.standing.open_decisions, 'contested');
    assert.ok(out.conflicts.some((x) => x.subject === 'open_decisions' && x.about === 'query'));
  });

  test('a lens is flagged when a schema it uses changes, and its answer stays the same', () => {
    const c = named('a lens is flagged when a schema it uses changes');
    const flagged = run(c);
    assert.deepEqual(flagged.flags, [['schema-changed', 'decision@1 -> decision@2']]);
    assert.deepEqual(flagged.things, ['d1']);
    assert.throws(() => C.runLens(graphOf(c.graph), 'd1'), /not a lens/);
  });
});
