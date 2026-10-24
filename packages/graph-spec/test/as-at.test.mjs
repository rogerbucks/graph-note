// A graph as at a date, on its two kinds of time (editor spec §29, two_kinds_of_time): as-at.js. Recorded time and
// real-world time are both kept, and a lens run as at a past date on either gives the answer true then. The cases are
// in two-times-cases.json, and python/graph_spec/tests/test_as_at.py holds the Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const T = JSON.parse(readFileSync(new URL('./two-times-cases.json', import.meta.url), 'utf8'));

const store = new C.Store();
store.apply(T.block.join('\n'));
const graph = C.worldFromStore(store).staff;

describe('two_kinds_of_time', () => {
  for (const c of T.cases)
    test(c.name, () => {
      assert.deepEqual(C.lensAsAt(graph, T.lens, c.axis, c.date), c.buckets);
    });

  test('a link holds only while both its ends do', () => {
    const before = C.asAt(graph, 'recorded', '2024-06-01');
    assert.deepEqual(before.out('ann2'), []);
    const after = C.asAt(graph, 'recorded', '2024-10-01');
    assert.equal(after.nodes.has('ann'), false);
  });

  test('an axis that is neither recorded nor real is refused', () => {
    assert.throws(() => C.asAt(graph, 'valid', '2024-01-01'), /recorded or real/);
  });
});
