// The altitude and topic index (editor spec §32, altitude_topic_index). A search finds a tag exactly or by likeness,
// ranks by the derived certainty sort key and marks contested things. The index is derived, so a rebuilt one is the
// same. The cases are in altitude-index-cases.json, and python/graph_spec/tests/test_altitude_index.py holds the Python
// library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./altitude-index-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (s) =>
  new C.Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b, p]) => [a, t, b, p || {}]),
  );

describe('altitude_topic_index', () => {
  for (const c of cases)
    test(c.name, () => {
      const index = C.altitudeIndex(graphOf(c.graph));
      const out = c.query === null ? index : C.searchIndex(index, c.query);
      assert.deepEqual(JSON.parse(JSON.stringify(out)), c.expected);
    });

  test('a search ranks by the certainty sort key, not by how alike, and marks contested things', () => {
    const c = cases.find((x) => x.query && x.query.like);
    const found = C.searchIndex(C.altitudeIndex(graphOf(c.graph)), c.query);
    assert.equal(found[0].id, 'inflation');
    assert.ok(found[0].score < found[1].score);
    assert.equal(found[0].contested, true);
  });

  test('an index built again from the same graph is the same, its hash included', () => {
    const c = cases[0];
    assert.deepEqual(C.altitudeIndex(graphOf(c.graph)), C.altitudeIndex(graphOf(c.graph)));
    assert.match(C.altitudeIndex(graphOf(c.graph)).hash, /^sha-256:[0-9a-f]{64}$/);
  });
});
