// The words a view may not use as a name (editor spec §7: view_profile, views_agree_with_grafeo; engines_get_standard):
// GQL's reserved and pre-reserved words, the words it reads as values, and the further words Grafeo 0.5.43 refuses as a
// name. Python's tests/test_view_parity.py holds the Grafeo list to Grafeo itself.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GQL_NON_RESERVED,
  GQL_PRE_RESERVED,
  GQL_RESERVED,
  GQL_VALUES,
  GRAFEO_REFUSED,
  isReservedName,
} from '../src/reserved-words.ts';

const LISTS = { GQL_RESERVED, GQL_PRE_RESERVED, GQL_VALUES, GQL_NON_RESERVED, GRAFEO_REFUSED };

describe('the reserved words', () => {
  // proves: view_profile
  test('hold GQL’s reserved words, its pre-reserved words and the words it reads as values, as the standard lists them', () => {
    assert.equal(GQL_RESERVED.length, 218);
    assert.equal(GQL_PRE_RESERVED.length, 39);
    assert.deepEqual(GQL_VALUES, ['FALSE', 'TRUE', 'UNKNOWN']);
    for (const w of ['MATCH', 'RETURN', 'WHERE', 'PATH', 'IS', 'IN', 'NULL', 'SKIP', 'LOG', 'ZONED_TIME'])
      assert.ok(GQL_RESERVED.includes(w), w);
    for (const w of ['ON', 'QUERY', 'INFINITY', 'VALUES']) assert.ok(GQL_PRE_RESERVED.includes(w), w);
    assert.equal(GQL_NON_RESERVED.length, 47);
    assert.ok(GQL_NON_RESERVED.includes('WALK') && GQL_NON_RESERVED.includes('NODE'));
  });

  // proves: views_agree_with_grafeo
  test('hold the words Grafeo 0.5.43 refuses as a name that GQL leaves free', () => {
    assert.deepEqual(GRAFEO_REFUSED, [
      'ACYCLIC',
      'CONTAINS',
      'DIFFERENT',
      'ENDS',
      'GROUPS',
      'MERGE',
      'ORDINALITY',
      'REPEATABLE',
      'SHORTEST',
      'SIMPLE',
      'STARTS',
      'TRAIL',
      'TYPE',
      'UNWIND',
      'WALK',
    ]);
    const kept = new Set([...GQL_RESERVED, ...GQL_PRE_RESERVED, ...GQL_VALUES]);
    assert.deepEqual(
      GRAFEO_REFUSED.filter((w) => kept.has(w)),
      [],
      'a word GQL keeps already is not listed again',
    );
  });

  // proves: view_profile
  test('each list is in order, one word GQL could write each, never a word twice', () => {
    for (const [name, words] of Object.entries(LISTS)) {
      assert.deepEqual(words, [...new Set(words)], `${name} has a word twice`);
      for (const w of words) assert.match(w, /^[A-Z][A-Z0-9_]*$/, name);
    }
    assert.deepEqual(GRAFEO_REFUSED, [...GRAFEO_REFUSED].sort());
  });

  // proves: view_profile
  test('a name is reserved whatever its case, as GQL’s keywords are, and only as a whole word', () => {
    for (const w of ['walk', 'WALK', 'Walk', 'match', 'Return', 'on', 'true', 'unwind', 'Type', 'is'])
      assert.equal(isReservedName(w), true, w);
    for (const w of ['n', 'm', 'p', 'walker', 'walk_1', 'matches', 'node', 'graph', 'step', 'id', 'trip', 'stop'])
      assert.equal(isReservedName(w), false, w);
  });
});
