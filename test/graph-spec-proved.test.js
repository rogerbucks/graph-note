// Every graph-spec rule is checked in CI (spec §51, spec_rules_proved and spec_no_general_proof; GS1):
// - A rule counts as proved when a test in this repository cites its id, such as req:3.first-line.
// - A proof the spec only names, such as 'general' or a case in the owner's vault, does not count.
// - A rule also counts as proved when its proof names a test in a conformance case kept here (spec_conformance_in_repo).
//   The test must be in that case's data, and the proof must not be partial or 'general'.
// - quality/graph-spec-unproved.json lists the rules not yet proved. A new unproved rule fails the check. So does a
//   listed rule that a test now proves: take it off the list, so the list only shrinks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  specRules,
  citedIds,
  unproved,
  compareToList,
  suiteCases,
  suiteProved,
  provedIds,
  LIST,
} from '../scripts/graph-spec-proved.mjs';
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

describe('which rules a conformance case kept here proves', () => {
  const CASES = suiteCases([
    [
      'python/graph_spec/conformance/Standards/Change set test.md',
      '# Change sets\n\n```yaml\n# conformance case\ncase: change-sets\nrounds:\n  - expect: [{test: X5}, {test: X10}]\n```\n',
    ],
    ['python/graph_spec/conformance/Standards/Notes.md', '```yaml\nnot: a case, X7\n```\n'],
  ]);
  const PROOFS = `INSERT
(r1:Requirement {id: 'req:24.cs-adds', level: 'must'}),
(r2:Requirement {id: 'req:24.cs-applied', level: 'must'}),
(r3:Requirement {id: 'req:24.cs-other', level: 'must'}),
(r4:Requirement {id: 'req:24.cs-partial', level: 'must'}),
(r5:Requirement {id: 'req:24.cs-vault', level: 'must'}),
(cchange_sets:ConformanceCase {id: 'case:change-sets', title: 'Change sets'}),
(cvault:ConformanceCase {id: 'case:vault-only', title: 'Kept in the vault'}),
(r1)-[:PROVED_BY {test: 'X5'}]->(cchange_sets),
(r2)-[:PROVED_BY {test: 'X1'}]->(cchange_sets), (r2)-[:PROVED_BY {test: 'X10'}]->(cchange_sets),
(r3)-[:PROVED_BY {test: 'X7'}]->(cchange_sets),
(r4)-[:PROVED_BY {test: 'X5', partial: TRUE}]->(cchange_sets),
(r5)-[:PROVED_BY {test: 'X5'}]->(cvault)`;

  test('the cases are read from their data blocks, each by its name', () => {
    assert.deepEqual([...CASES.keys()], ['change-sets']);
  });

  test('a rule is proved when one full proof names a test in its case data here', () => {
    assert.deepEqual([...suiteProved(PROOFS, CASES)].sort(), ['req:24.cs-adds', 'req:24.cs-applied']);
  });

  test('a test the case data does not hold, a partial proof or a case kept elsewhere proves nothing', () => {
    const proved = suiteProved(PROOFS, CASES);
    for (const id of ['req:24.cs-other', 'req:24.cs-partial', 'req:24.cs-vault'])
      assert.equal(proved.has(id), false, id);
  });

  test('the repository proves a rule by its suite that no test cites by id', () => {
    assert.equal(provedIds().has('req:24.cs-adds'), true);
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
    const problems = compareToList(unproved(read('requirements/graph-spec.gql'), provedIds()), readJSON(LIST).unproved);
    assert.deepEqual(problems, []);
  });
});
