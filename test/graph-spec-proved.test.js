// Every graph-spec rule is checked in CI (spec §51, spec_rules_proved and spec_no_general_proof; GS1):
// - A rule counts as proved when a test in this repository cites its id, such as req:3.first-line.
// - A proof the spec only names, such as 'general' or a case in the owner's vault, does not count.
// - quality/graph-spec-unproved.json lists the rules not yet proved. A new unproved rule fails the check. So does a
//   listed rule that a test now proves: take it off the list, so the list only shrinks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { specRules, citedIds, unproved, compareToList, LIST } from '../scripts/graph-spec-proved.mjs';
import { read, readJSON } from './repository/repo.js';

const SPEC = `INSERT
(r1:Requirement {id: 'req:1.one', level: 'must', statement: 'One'}),
(r2:Requirement {id: 'req:1.two', level: 'must', statement: 'Two'}),
(r3:Requirement {id: 'req:2.three', level: 'must', statement: 'Three'}),
(cevery:ConformanceCase {id: 'case:every-case', title: 'General'}),
(r1)-[:PROVED_BY {test: 'general'}]->(cevery),
(r3)-[:PROVED_BY {test: 'D1'}]->(cevery)`;

describe('which rules a test in the repository proves', () => {
  test('the rules are read from the spec, each by its id', () => {
    assert.deepEqual(specRules(SPEC), ['req:1.one', 'req:1.two', 'req:2.three']);
  });

  test('a rule is proved when a test cites its id as a whole word', () => {
    const cited = citedIds([
      ['test/a.test.js', "test('reads it (req:1.two)', () => {});"],
      ['python/graph_spec/tests/test_b.py', '# req:2.threefold, another rule'],
    ]);
    assert.deepEqual([...cited].sort(), ['req:1.two', 'req:2.threefold']);
    assert.deepEqual(unproved(SPEC, cited), ['req:1.one', 'req:2.three']);
  });

  test("a proof by 'general' or by a case the repository does not hold counts for nothing", () => {
    assert.deepEqual(unproved(SPEC, new Set()), ['req:1.one', 'req:1.two', 'req:2.three']);
  });
});

describe('the list of unproved rules only shrinks', () => {
  test('a new unproved rule is named', () => {
    assert.deepEqual(compareToList(['req:1.one', 'req:2.three'], ['req:1.one']), [
      'req:2.three is not proved by any test in the repository: cite its id in a test that fails when the rule is broken',
    ]);
  });

  test('a listed rule a test now proves is named, so it comes off the list', () => {
    assert.deepEqual(compareToList(['req:1.one'], ['req:1.one', 'req:1.two']), [
      'req:1.two is proved now: run node scripts/graph-spec-proved.mjs --update to take it off the list',
    ]);
  });

  test('the list matches the repository as it is', () => {
    const problems = compareToList(unproved(read('requirements/graph-spec.gql'), citedIds()), readJSON(LIST).unproved);
    assert.deepEqual(problems, []);
  });
});
