// A proposal's proposer is read through WAS_ATTRIBUTED_TO (graph spec §23 rule 6). The old form, through
// ASSOCIATED_WITH on its activity, is accepted for one release with a warning naming the fix. The cases are
// proposer-cases.json, the table python/graph_spec/tests/test_proposers.py runs too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./proposer-cases.json', import.meta.url)), 'utf8'));

for (const c of table.cases) {
  test(c.name, () => {
    const world = C.worldFromStore(C.read([table.people.join('\n'), c.body.join('\n')]));
    const rule = C.check(world, c.graph, {}).find(([label]) => label === table.rule6);
    assert.equal(rule?.[1], c.holds);
    assert.deepEqual(C.proposerWarnings(world, c.graph), c.warnings);
  });
}
