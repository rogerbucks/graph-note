// A change set may DELETE and SET, each statement naming one target (graph spec §24, 16 Oct 2026). The cases are
// change-cases.json, the table python/graph_spec/tests/test_changes.py runs too, so both readers read the same
// removals and changes from the same change set (req:24.cs-two-readers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./change-cases.json', import.meta.url)), 'utf8'));

const base = [[...table.head, ...table.base_rest].join('\n')];
const stateOf = (blocks) => C.canon(C.worldFromStore(C.read(blocks)).library).slice(0, 16);
const now = stateOf(base);
const ids = new Map();

for (const c of table.cases) {
  test(c.name, () => {
    const header = `// graph: library · CHANGE SET cs · against ${c.against ?? now} · by ${c.by ?? 'ada'}`;
    const r = C.checkChangeset(base, [header, ...c.body].join(c.crlf ? '\r\n' : '\n'), {});
    assert.deepEqual(
      r.results
        .filter((x) => !x[1])
        .map((x) => x[0])
        .sort(),
      c.failed.map((k) => table.labels[k]).sort(),
    );
    const changes = r.header.changes;
    assert.deepEqual(
      changes.map((x) => [x.op, x.reason]),
      c.changes.map((x) => x.slice(0, 2)),
    );
    // the links a DETACH DELETE removes are listed by the dry run, for those cases that name them
    c.changes.forEach((x, i) => x[2] && assert.deepEqual(changes[i].links, x[2]));
    for (const x of changes) assert.match(x.id, /^[0-9a-f]{16}$/);
    assert.equal(new Set(changes.map((x) => x.id)).size, changes.length);
    const head = table.head.map((line) => (c.head_changed ?? []).find(([old]) => old === line)?.[1] ?? line);
    assert.equal(r.after, c.after === null ? null : stateOf([[...head, ...c.after].join('\n')]));
    if (changes.length === 1) ids.set(c.name, changes[0].id);
    if (c.same_id_as) assert.equal(changes[0].id, ids.get(c.same_id_as));
  });
}

test('a change set with no DELETE or SET reads no changes', () => {
  const header = `// graph: library · CHANGE SET cs · against ${now} · by ada`;
  const r = C.checkChangeset(base, [header, "(late:Book {title: 'A late book'})"].join('\n'), {});
  assert.deepEqual(r.header.changes, []);
  assert.deepEqual(
    r.results.filter((x) => !x[1]),
    [],
  );
});
