// The text a thing is shown by in a drawing, chosen by one ranked rule (editor spec §3, shown_text_ranked). The cases
// are shown-text-cases.json, the table python/graph_spec/tests/test_shown_text.py runs too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./shown-text-cases.json', import.meta.url)), 'utf8'));

for (const c of table.cases) {
  test(c.name, () => {
    const g = C.worldFromStore(C.read([c.body.join('\n')]))[c.graph];
    for (const [id, shown] of Object.entries(c.shown)) assert.deepEqual(C.shownText(g, id), shown, id);
  });
}

test('the shared schema a graph names gives shown_by when the graph has no schema of its own', () => {
  const world = C.worldFromStore(
    C.read([
      "// graph: shared\n(t:Meta:ElementType {name: 'Requirement', kind: 'node', origin: 'source', shown_by: 'statement'})",
      "// graph: spec\n(r:Requirement {id: 'req:1', name: 'One', statement: 'The first rule'})",
    ]),
  );
  assert.deepEqual(C.shownText(world.spec, 'req:1', world.shared), ['The first rule', 'statement']);
});

test('the texts of a whole graph, its schema read once, are the ones shownText gives each thing', () => {
  for (const c of table.cases) {
    const g = C.worldFromStore(C.read([c.body.join('\n')]))[c.graph];
    const shownOf = C.shownTexts(g);
    for (const [id, shown] of Object.entries(c.shown)) assert.deepEqual(shownOf(id), shown, `${c.name}: ${id}`);
  }
});

test('the texts of a whole graph take shown_by from the shared schema it names', () => {
  const world = C.worldFromStore(
    C.read([
      "// graph: shared\n(t:Meta:ElementType {name: 'Requirement', kind: 'node', origin: 'source', shown_by: 'statement'})",
      "// graph: spec\n(r:Requirement {id: 'req:1', name: 'One', statement: 'The first rule'})",
    ]),
  );
  assert.deepEqual(C.shownTexts(world.spec, world.shared)('req:1'), ['The first rule', 'statement']);
});
