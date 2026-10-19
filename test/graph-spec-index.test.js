// The graph spec file tells the truth about itself (spec §51, spec_index_true; GS1):
// - Its first line counts its requirements and wordings, and the counts match what it holds.
// - Every file path it names is in the repository.
// - A rule a test in the repository proves is not marked pending.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { indexProblems, citedIds } from '../scripts/graph-spec-proved.mjs';
import { read, exists } from './repository/repo.js';

const head = (r, w) =>
  `// graph: requirements · SOURCE · schema spec-requirements@1 · ${r} requirements, ${w} wordings`;
const rule = (id, more = '') => `(r_${id.replace(/\W/g, '_')}:Requirement {id: '${id}', level: 'must'${more}}),`;
const wording = "(w1:Wording {id: 'w:1', text: 'One'}),";

describe('the spec file, checked against itself', () => {
  test('the first line counts what the file holds', () => {
    const ok = [head(2, 1), 'INSERT', rule('req:1.a'), rule('req:1.b'), wording].join('\n');
    assert.deepEqual(indexProblems(ok, { cited: new Set(), exists: () => true }), []);
    const wrong = [head(167, 1), 'INSERT', rule('req:1.a'), rule('req:1.b'), wording].join('\n');
    assert.deepEqual(indexProblems(wrong, { cited: new Set(), exists: () => true }), [
      'the first line counts 167 requirements, but the file holds 2',
    ]);
  });

  test('a path it names that is not in the repository is named', () => {
    const text = [
      head(1, 0),
      'INSERT',
      rule('req:3.reader', ", statement: 'Read by zzSupport/_scripts/gql_profile.py'"),
    ].join('\n');
    assert.deepEqual(indexProblems(text, { cited: new Set(), exists: () => false }), [
      'it names zzSupport/_scripts/gql_profile.py, which is not in the repository',
    ]);
  });

  test('a pending rule that a test proves is named', () => {
    const text = [head(1, 0), 'INSERT', rule('req:9.not-a-rule', ', pending: TRUE')].join('\n');
    assert.deepEqual(indexProblems(text, { cited: new Set(['req:9.not-a-rule']), exists: () => true }), [
      'req:9.not-a-rule is marked pending, but a test proves it: take pending off',
    ]);
  });

  test('the spec file in the repository is true to itself', () => {
    assert.deepEqual(indexProblems(read('requirements/graph-spec.gql'), { cited: citedIds(), exists }), []);
  });
});
