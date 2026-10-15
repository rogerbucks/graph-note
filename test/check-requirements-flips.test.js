// A change to the generated requirements copy by hand is refused, except one shape: tests flipped from planned to
// written, with a flipped test's file path corrected. The vault pulls those flips back into its source later, so the
// check accepts exactly that and refuses everything else, naming each difference. Each case is a small edit of the
// real copy, compared with the real copy as the base.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { refusedChanges } from '../scripts/check-requirements-flips.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { read } from './repository/repo.js';

const base = () => read(REQUIREMENTS);
const replaced = (text, from, to) => {
  assert.ok(text.includes(from), `the copy holds ${from}`);
  return text.replace(from, to);
};
const there = () => true;
const refused = (head, exists = there) => refusedChanges(base(), head, { exists });
const kinds = (problems) => problems.map((p) => p.kind);

const PLANNED = "file: 'packages/obsidian/test/mini-map.test.js', where: 'repo', status: 'planned'";
const WRITTEN = "file: 'packages/obsidian/test/mini-map.test.js', where: 'repo', status: 'written'";
const MOVED = "file: 'packages/obsidian/test/minimap.test.js', where: 'repo', status: 'written'";

describe('a hand change to the requirements copy', () => {
  test('the same copy has nothing refused', () => {
    assert.deepEqual(refused(base()), []);
  });

  test('a single test flipped from planned to written is accepted', () => {
    assert.deepEqual(refused(replaced(base(), PLANNED, WRITTEN)), []);
  });

  test('several tests flipped at once are accepted', () => {
    const two = replaced(
      replaced(base(), PLANNED, WRITTEN),
      "file: 'packages/obsidian/test/details-open.test.js', where: 'repo', status: 'planned'",
      "file: 'packages/obsidian/test/details-open.test.js', where: 'repo', status: 'written'",
    );
    assert.deepEqual(refused(two), []);
  });

  test('a flip with the file path of the same test corrected is accepted', () => {
    assert.deepEqual(refused(replaced(base(), PLANNED, MOVED)), []);
  });

  test('a flip to written is refused when the file it names is not there', () => {
    const problems = refused(
      replaced(base(), PLANNED, MOVED),
      (rel) => rel !== 'packages/obsidian/test/minimap.test.js',
    );
    assert.deepEqual(kinds(problems), ['missing-file']);
    assert.match(problems[0].message, /test_mini_map.*packages\/obsidian\/test\/minimap\.test\.js/);
  });

  test('a path corrected on a test that is not flipped is refused', () => {
    const problems = refused(
      replaced(
        base(),
        "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
        "file: 'packages/core/test/abuse2.test.js', where: 'repo', status: 'written'",
      ),
    );
    assert.deepEqual(kinds(problems), ['field']);
    assert.match(problems[0].message, /test_abuse.*file/);
  });

  test('a flip back from written to planned is refused', () => {
    const problems = refused(
      replaced(
        base(),
        "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
        "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'planned'",
      ),
    );
    assert.deepEqual(kinds(problems), ['flip-back']);
    assert.match(problems[0].message, /test_abuse.*written.*planned/);
  });

  test('a status flip on a record that is not a test is refused', () => {
    const asked = (status) =>
      replaced(
        base(),
        '// ── Links ──\n',
        `// ── Links ──\n(q_flip:Question {num: 'Q-09', slice: 1, text: 'Asked.', status: '${status}'}),\n`,
      );
    const problems = refusedChanges(asked('planned'), asked('written'), { exists: there });
    assert.deepEqual(kinds(problems), ['not-a-test']);
    assert.match(problems[0].message, /q_flip/);
  });

  test('a field changed other than the status and path of a flipped test is refused', () => {
    const problems = refused(replaced(base(), PLANNED, `${WRITTEN.replace("'repo'", "'both'")}`));
    assert.deepEqual(kinds(problems), ['field']);
    assert.match(problems[0].message, /test_mini_map.*where/);
  });

  test('the proves text of a flipped test changed is refused', () => {
    const head = replaced(
      base(),
      "(test_mini_map:Test {proves: 'the mini-map appears",
      "(test_mini_map:Test {proves: 'a mini-map appears",
    );
    assert.deepEqual(kinds(refused(replaced(head, PLANNED, WRITTEN))), ['field']);
  });

  test('a record removed is refused, naming it', () => {
    const line = base()
      .split('\n')
      .find((l) => l.startsWith('(test_abuse:Test {'));
    const problems = refused(replaced(base(), `${line}\n`, ''));
    assert.ok(kinds(problems).includes('removed'));
    assert.match(problems.find((p) => p.kind === 'removed').message, /test_abuse/);
  });

  test('a record added is refused, naming it', () => {
    const orphan = "(test_new:Test {proves: 'new', file: 'test/x.test.js', where: 'repo', status: 'written'}),\n";
    const problems = refused(replaced(base(), '// ── Tests ──\n', `// ── Tests ──\n${orphan}`));
    assert.deepEqual(kinds(problems), ['added']);
    assert.match(problems[0].message, /test_new/);
  });

  test('a link added or removed is refused', () => {
    const link = '(autocomplete)-[:PROVED_BY]->(test_autocomplete),';
    const gone = refused(replaced(base(), `${link}\n`, ''));
    assert.deepEqual(kinds(gone), ['link-removed']);
    const extra = refused(
      replaced(base(), '// ── Links ──\n', `// ── Links ──\n(autocomplete)-[:PROVED_BY]->(test_abuse),\n`),
    );
    assert.deepEqual(kinds(extra), ['link-added']);
  });

  test('an edited banner line is refused, even with a good flip beside it', () => {
    const edited = replaced(base(), 'do not hand-edit; regenerate.', 'edited by hand.');
    assert.deepEqual(kinds(refused(edited)), ['banner']);
    assert.deepEqual(kinds(refused(replaced(edited, PLANNED, WRITTEN))), ['banner']);
  });

  test('an edited comment line or section heading in the body is refused', () => {
    const problems = refused(replaced(base(), '// ── Tests ──', '// ── Tests, edited ──'));
    assert.deepEqual(kinds(problems), ['comment']);
  });

  test('a copy the reader cannot read is refused as unreadable', () => {
    const head = replaced(base(), '(test_abuse:Test {proves:', '(test_abuse:Test {proves');
    assert.deepEqual(kinds(refused(head)), ['unreadable']);
  });

  test('each difference is named: a flip with a second, bad change lists the bad one only', () => {
    const head = replaced(
      replaced(base(), PLANNED, WRITTEN),
      "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
      "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'planned'",
    );
    const problems = refused(head);
    assert.deepEqual(
      problems.map((p) => [p.kind, p.id]),
      [['flip-back', 'test_abuse']],
    );
  });
});
