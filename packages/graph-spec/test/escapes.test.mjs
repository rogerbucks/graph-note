// req:3.gql-escapes (graph spec §3, decided by Roger, 11 Oct 2026). A backslash in quoted text is read as ISO GQL
// reads it. An escape GQL does not name is refused, with the fix that doubles the backslash. The cases are one table,
// escape-cases.json, which the Python reader answers too: python/graph_spec/tests/test_escapes.py.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(new URL('./escape-cases.json', import.meta.url), 'utf8'));

const PREFIX = "(a:T {id: 'a', v: '";
const block = (written) => `// graph: g\n${PREFIX}${written}'})`;

/** The text read for v, or the refusal as [line, message, fix, at]. */
function read(written) {
  const store = new gs.Store();
  try {
    store.apply(block(written));
  } catch (e) {
    if (!(e instanceof gs.ProfileError)) throw e;
    return [e.line, e.msg, e.fix, e.at];
  }
  return [...store.graph('g').nodes.values()][0].props.v;
}

describe('req:3.gql-escapes: quoted text is read as GQL reads it', () => {
  test('req:3.gql-escapes: every escape GQL names is read as GQL reads it', () => {
    for (const [written, text] of table.read) assert.equal(read(written), text, written);
  });

  test('req:3.gql-escapes: an escape GQL does not name is refused, at its backslash, with the fix that doubles it', () => {
    for (const [written, at, shown] of table.refused)
      assert.deepEqual(
        read(written),
        [
          2,
          `'${shown}' is not an escape GQL names`,
          `double the backslash to write a backslash: \\${shown}`,
          PREFIX.length + at,
        ],
        written,
      );
  });

  test('req:3.gql-escapes: a writer quotes a text so that it reads back on one line, as itself', () => {
    for (const [text, quoted] of table.quoted) {
      assert.equal(gs.quote(text), quoted, text);
      assert.equal(read(quoted.slice(1, -1)), text, text);
    }
  });
});
