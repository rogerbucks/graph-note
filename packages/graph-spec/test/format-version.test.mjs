// The format a block is written in (graph spec §3; editor spec §27, format_version_named; risk ARCH-4). A block may name
// its format on its graph line. The reader reads its own major format, an older one, or none named. It refuses a newer
// major plainly, with GN106, so an older app never takes a newer block for a broken one. The cases are shared with the
// Python reader (python/graph_spec/tests/test_format_version.py).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const CASES = JSON.parse(readFileSync(new URL('./format-version-cases.json', import.meta.url), 'utf8'));

describe('format_version_named', () => {
  for (const c of CASES.cases)
    test(c.name, () => {
      const store = new gs.Store();
      if (c.code) {
        assert.throws(
          () => store.apply(c.block),
          (e) => e.code === c.code && /newer than this reader/.test(e.message),
        );
        return;
      }
      store.apply(c.block);
      assert.equal(store.graph('g').nodes.size, c.things);
    });

  test('the refusal says which format the block is in and which this reader reads', () => {
    assert.throws(
      () => new gs.Store().apply('// graph: g · format 2.5\n(a:T)'),
      (e) => e.message.includes('format 2.5') && e.message.includes(`format ${CASES.reads}`),
    );
  });
});
