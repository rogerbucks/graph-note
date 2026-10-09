// The readings guessed for a relationship type that has none declared (vault task "Fix the lock guessing reverse
// readings for types ending in a preposition", found 6 Oct 2026; one guess in the libraries, as decided 7 Oct): forward
// and reverse, from the type's own words. The cases are reading-cases.json, which the Python library answers the same:
// python/graph_spec/tests/test_graph_rules_readings.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./reading-cases.json', import.meta.url), 'utf8'));

test('every type in the shared table reads as the table says, forward and reverse', () => {
  for (const [type, reading, reverse] of cases) assert.deepEqual(gs.guessReadings(type), [reading, reverse], type);
});

// the cases found on 6 Oct 2026: the vault's lock wrote "is proved by by", "is part of by" and "is decided in by"; the
// plugin's wrote "inverse of …" for all three
test('PROVED_BY reads "is proved by" and back "proves": never "is proved by by", nor a placeholder', () => {
  assert.deepEqual(gs.guessReadings('PROVED_BY'), ['is proved by', 'proves']);
});

test('PART_OF reads "is part of" and back "contains": never "is part of by", nor a placeholder', () => {
  assert.deepEqual(gs.guessReadings('PART_OF'), ['is part of', 'contains']);
});

test('DECIDED_IN reads "was decided in" and back "decides": never "is decided in by", nor a placeholder', () => {
  assert.deepEqual(gs.guessReadings('DECIDED_IN'), ['was decided in', 'decides']);
});

test('no guessed reverse ever ends in a doubled preposition', () => {
  for (const [type] of cases) assert.doesNotMatch(gs.guessReadings(type)[1], /\b(\w+) \1$/, type);
});
