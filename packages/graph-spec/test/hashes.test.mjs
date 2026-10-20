// Every hash names its algorithm, and a record sealed by its hash cannot change unseen (editor spec §51,
// spec_hashes_named; requirements/hashes.md). A hash is written `sha-256-64:` or `sha-256:`, then its digits. A bare
// one is refused, and so is a change set made against a bare state. A judgement or a serving edited after its content
// hash was made is reported. The cases are hash-cases.json, which python/graph_spec/tests/test_hashes_named.py runs too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./hash-cases.json', import.meta.url)), 'utf8'));
const changes = JSON.parse(readFileSync(fileURLToPath(new URL('./change-cases.json', import.meta.url)), 'utf8'));

describe('the hashes a judgement graph holds', () => {
  for (const c of table.cases)
    test(c.name, () => {
      const results = C.check(C.worldFromStore(C.read([table.data.join('\n'), c.body.join('\n')])), 'jud', {});
      for (const [rule, holds] of Object.entries(c.holds))
        assert.deepEqual(
          results.filter(([label]) => label === table.rules[rule]).map(([, ok]) => ok),
          [holds],
          rule,
        );
    });
});

describe('the state a change set was made against', () => {
  const base = [[...changes.head, ...changes.base_rest].join('\n')];
  const now = C.canon(C.worldFromStore(C.read(base)).library).slice(0, 16);
  const NAMED = 'the state it was made against names its algorithm: against sha-256-64:<digits> (editor spec §51)';
  const setAgainst = (state) =>
    [`// graph: library · CHANGE SET cs · against ${state} · by ada`, "(late:Book {title: 'A late book'})"].join('\n');
  const verdict = (state) =>
    C.checkChangeset(base, setAgainst(state), {})
      .results.filter(([label]) => label === NAMED)
      .map(([, ok]) => ok);

  test('a state that names sha-256-64 holds, and is the graph as it stands', () => {
    assert.deepEqual(verdict(`sha-256-64:${now}`), [true]);
    assert.equal(C.changesetHeader(setAgainst(`sha-256-64:${now}`)).against, now);
  });

  test('a state that names no algorithm is refused', () => {
    assert.deepEqual(verdict(now), [false]);
  });
});
