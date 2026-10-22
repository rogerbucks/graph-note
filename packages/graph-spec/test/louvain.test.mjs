// The Louvain method in the graph spec library (wiki/Clusters-design.md, step 2). Two features use this one method:
// clusters found by links (editor spec §31) and big-graph groups (editor spec §53). Python's twin must give the same
// groups on the same cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { louvain } = require('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./louvain-cases.json', import.meta.url), 'utf8'));

/** The links a case with a seed makes: a tree of random parents, and 30% more links across it. */
function generated(n, seed) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const links = [];
  for (let i = 1; i < n; i++) links.push([Math.floor(next() * i), i]);
  for (let k = 0; k < Math.round(n * 0.3); k++) links.push([Math.floor(next() * n), Math.floor(next() * n)]);
  return links;
}

for (const c of cases)
  test(`the shared case "${c.name}" gives its recorded groups`, () => {
    assert.deepEqual(louvain(c.n, c.links ?? generated(c.n, c.seed)), c.groups);
  });

test('the core finds big-graph groups with this same method', async () => {
  const core = await import('../../core/src/louvain.ts');
  assert.equal(core.louvain, louvain);
});
