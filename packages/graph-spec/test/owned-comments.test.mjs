// The comments an element owns (graph spec §26 notes, §27 tagged comments): /// note lines and //@ key: value lines,
// owned by the element on the line directly below them. The cases are owned-comment-cases.json, which the Python
// library answers the same (python/graph_spec/tests/test_owned_comments.py). So both readers read the same //@ lines
// and notes from the same text (§26 and §27, "Two readers, one answer").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./owned-comment-cases.json', import.meta.url), 'utf8'));

for (const c of cases)
  test(`owned comments: ${c.name}`, () => {
    if ('refused' in c)
      assert.throws(
        () => C.ownedComments(c.block),
        (e) => e instanceof C.ProfileError && e.line === c.refused,
      );
    else assert.deepEqual(C.ownedComments(c.block), { owned: c.owned, unowned: c.unowned, malformed: c.malformed });
  });

test('owned comments: a query block or an excerpt owns nothing, and is not refused', () => {
  const none = { owned: [], unowned: [], malformed: [] };
  assert.deepEqual(C.ownedComments('// graph: g · QUERY\n//@ colour: orange\nMATCH (a) RETURN a'), none);
  assert.deepEqual(C.ownedComments('// excerpt\n//@ colour: orange\n(a:T)'), none);
});
