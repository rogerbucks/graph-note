// The requirements check: CI reads the repository's generated copy of the editor's requirements with the repo's own
// graph-spec reader, and fails when a requirement of a started slice is proved by no test, a test the repo holds is
// missing, a test claims no requirement, a test's status is wrong, or the copy's banner has been edited. Spec §12,
// requirements_checked_in_ci.
//
// Each case is seen on a tampered copy of the real file, so the check is proved against the file it guards.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { auditRequirements, BANNER, CURRENT_SLICE, REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { exists, read, path } from './repository/repo.js';

const real = () => read(REQUIREMENTS);
const kinds = (problems, kind) => problems.filter((p) => p.kind === kind).map((p) => p.id);
const replaced = (text, from, to) => {
  assert.ok(text.includes(from), `the copy holds ${from}`);
  return text.replace(from, to);
};
const without = (text, line) => replaced(text, `${line}\n`, '');

describe('the requirements copy', () => {
  test('is the generated copy, at requirements/editor-requirements.gql, opening on its do-not-hand-edit banner', () => {
    assert.equal(REQUIREMENTS, 'requirements/editor-requirements.gql');
    assert.ok(exists(REQUIREMENTS));
    assert.deepEqual(real().split('\n').slice(0, 2), BANNER);
    assert.match(BANNER[1], /do not hand-edit; regenerate/);
  });

  test('the slice under way is set in one place, and is slice 3', () => {
    assert.equal(CURRENT_SLICE, 3);
  });

  test('as committed, has nothing to report: every started requirement proved, every test where it says, and claimed', () => {
    const problems = auditRequirements(real(), { exists });
    assert.deepEqual(
      problems.map((p) => p.message),
      [],
      'report status mismatches to the vault session, which regenerates the copy',
    );
  });
});

describe('a tampered copy fails the check', () => {
  test('an edited banner line', () => {
    const text = replaced(real(), 'do not hand-edit; regenerate.', 'edited by hand.');
    assert.deepEqual(kinds(auditRequirements(text, { exists }), 'banner'), ['line 2']);
    const first = replaced(real(), '// graph: editor_requirements · SOURCE', '// graph: editor_requirements');
    assert.deepEqual(kinds(auditRequirements(first, { exists }), 'banner'), ['line 1']);
  });

  test('a requirement of a started slice proved by no test', () => {
    const text = without(real(), '(autocomplete)-[:PROVED_BY]->(test_autocomplete),');
    const problems = auditRequirements(text, { exists });
    assert.deepEqual(kinds(problems, 'unproved'), ['autocomplete']);
    assert.match(problems.find((p) => p.kind === 'unproved').message, /autocomplete.*slice 2.*no test/);
  });

  test('a requirement of a slice not yet started may wait for its test, until its slice starts', () => {
    // A made-up requirement one slice ahead of the current one, so the case holds at every later flip.
    const next = CURRENT_SLICE + 1;
    const waiting = `(not_yet_started:Requirement {section: '1', slice: ${next}, level: 'must', rule: 'A requirement of a later slice.'}),\n`;
    const text = replaced(real(), '// ── Tests ──\n', `${waiting}// ── Tests ──\n`);
    assert.deepEqual(kinds(auditRequirements(text, { exists }), 'unproved'), []);
    assert.deepEqual(kinds(auditRequirements(text, { exists, slice: next }), 'unproved'), ['not_yet_started']);
  });

  test('a written test whose file the repository does not hold', () => {
    const text = replaced(
      real(),
      "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
      "file: 'packages/core/test/no-such.test.js', where: 'repo', status: 'written'",
    );
    const problems = auditRequirements(text, { exists });
    assert.deepEqual(kinds(problems, 'missing-file'), ['test_abuse']);
    assert.match(problems.find((p) => p.kind === 'missing-file').message, /packages\/core\/test\/no-such\.test\.js/);
  });

  test('every file a test names is checked: lists, notes in brackets, and a path after a repository name', () => {
    const missing = new Set([
      'packages/obsidian/test/pane-help.test.js',
      '.github/workflows/ci.yml',
      'packages/core/test/layout-bin.test.js',
    ]);
    const problems = auditRequirements(real(), { exists: (rel) => !missing.has(rel) && exists(rel) });
    assert.deepEqual(kinds(problems, 'missing-file').sort(), [
      'test_accessibility',
      'test_layout_bin',
      'test_pane',
      'test_problems',
      'test_store_lint',
    ]);
  });

  test('a test may name a folder, ending in a slash, as the benchmarks are; it must be there too', () => {
    assert.ok(real().includes("file: 'scripts/benchmarks/'"), 'the copy names a folder');
    const gone = auditRequirements(real(), { exists: (rel) => rel !== 'scripts/benchmarks/' && exists(rel) });
    assert.deepEqual(kinds(gone, 'missing-file'), ['test_benchmarks']);
    assert.match(gone.find((p) => p.kind === 'missing-file').message, /scripts\/benchmarks\//);
  });

  test('a test kept outside the repository names no file here, and is not looked for', () => {
    const problems = auditRequirements(real(), { exists: (rel) => exists(rel) });
    assert.deepEqual(kinds(problems, 'missing-file'), []);
    assert.ok(real().includes("(test_trace:Test {proves: '"), 'the copy holds a test outside the repository');
  });

  test('an open question lacking its number, slice or text, or blocking what is not a requirement; a whole one is fine', () => {
    const asked = [
      "(q_fine:Question {num: 'Q-01', slice: 1, text: 'Which interface do external AI tools use?'}),",
      '(q_fine)-[:BLOCKS]->(autocomplete),',
      "(q_no_num:Question {slice: 3, text: 'No number.'}),",
      "(q_no_slice:Question {num: 'Q-02', text: 'No slice.'}),",
      "(q_no_text:Question {num: 'Q-03', slice: 3}),",
      "(q_blocks_test:Question {num: 'Q-04', slice: 3, text: 'Blocks a test.'}),",
      '(q_blocks_test)-[:BLOCKS]->(test_abuse),',
      '',
    ].join('\n');
    const problems = auditRequirements(replaced(real(), '// ── Links ──\n', `// ── Links ──\n${asked}`), { exists });
    assert.deepEqual(kinds(problems, 'question').sort(), ['q_blocks_test', 'q_no_num', 'q_no_slice', 'q_no_text']);
    const message = (id) => problems.find((p) => p.kind === 'question' && p.id === id).message;
    assert.match(message('q_no_num'), /q_no_num.*num/);
    assert.match(message('q_no_slice'), /q_no_slice.*slice/);
    assert.match(message('q_no_text'), /q_no_text.*text/);
    assert.match(message('q_blocks_test'), /q_blocks_test.*test_abuse.*not a requirement/);
    assert.deepEqual(kinds(problems, 'unproved'), [], 'a question never needs a test');
    assert.deepEqual(
      problems.filter((p) => p.kind !== 'question').map((p) => p.message),
      [],
      'a whole question blocking a requirement is fine',
    );
  });

  test('a test that claims no requirement', () => {
    const orphan =
      "(test_orphan:Test {proves: 'nothing', file: 'test/requirements.test.js', where: 'repo', status: 'written'}),\n";
    const text = replaced(real(), '// ── Tests ──\n', `// ── Tests ──\n${orphan}`);
    assert.deepEqual(kinds(auditRequirements(text, { exists }), 'unclaimed'), ['test_orphan']);
  });

  test('a test marked planned while its file is written', () => {
    const text = replaced(
      real(),
      "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
      "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'planned'",
    );
    const problems = auditRequirements(text, { exists });
    assert.deepEqual(kinds(problems, 'status'), ['test_abuse']);
    assert.match(problems.find((p) => p.kind === 'status').message, /planned.*written/);
  });

  test('a test marked written while its file is not yet there is a missing file, said once', () => {
    const problems = auditRequirements(real(), {
      exists: (rel) => rel !== 'packages/core/test/abuse.test.js' && exists(rel),
    });
    assert.deepEqual(
      problems.map((p) => [p.kind, p.id]),
      [['missing-file', 'test_abuse']],
    );
  });

  test('a copy the reader cannot read', () => {
    const text = replaced(real(), '(test_abuse:Test {proves:', '(test_abuse:Test {proves');
    const line =
      real()
        .split('\n')
        .findIndex((l) => l.startsWith('(test_abuse:Test {proves:')) + 1;
    assert.deepEqual(kinds(auditRequirements(text, { exists }), 'unreadable'), [`line ${line}`]);
  });
});

describe('run on its own', () => {
  test('passes the committed copy, and lists each problem of a broken one with a non-zero exit', () => {
    const run = (input) =>
      spawnSync(process.execPath, [path('scripts/check-requirements.mjs'), '--stdin'], { input, encoding: 'utf8' });
    const ok = run(real());
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    const bad = run(without(real(), '(autocomplete)-[:PROVED_BY]->(test_autocomplete),'));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /autocomplete/);
  });
});
