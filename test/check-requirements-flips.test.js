// A change to the generated requirements copy by hand is refused, except one shape: tests flipped from planned to
// written, with a flipped test's file path corrected. The vault pulls those flips back into its source later, so the
// check accepts exactly that and refuses everything else, naming each difference. Each case is a small edit of the
// real copy, compared with the real copy as the base.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { refusedChanges } from '../scripts/check-requirements-flips.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { path, read } from './repository/repo.js';

const replaced = (text, from, to) => {
  assert.ok(text.includes(from), `the copy holds ${from}`);
  return text.replace(from, to);
};
// two planned tests of our own, added to the real copy, so these cases hold whatever the real copy says is planned
const FIXTURES = [
  "(test_fixture_a:Test {proves: 'the first fixture holds', file: 'packages/obsidian/test/fixture-a.test.js', where: 'repo', status: 'planned'}),",
  "(test_fixture_b:Test {proves: 'the second fixture holds', file: 'packages/core/test/fixture-b.test.js', where: 'repo', status: 'planned'}),",
].join('\n');
const base = () => replaced(read(REQUIREMENTS), '// ── Links ──\n', `${FIXTURES}\n// ── Links ──\n`);
const there = () => true;
const refused = (head, exists = there) => refusedChanges(base(), head, { exists });
const kinds = (problems) => problems.map((p) => p.kind);

const PLANNED = "file: 'packages/obsidian/test/fixture-a.test.js', where: 'repo', status: 'planned'";
const WRITTEN = "file: 'packages/obsidian/test/fixture-a.test.js', where: 'repo', status: 'written'";
const MOVED = "file: 'packages/obsidian/test/fixture-a2.test.js', where: 'repo', status: 'written'";

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
      "file: 'packages/core/test/fixture-b.test.js', where: 'repo', status: 'planned'",
      "file: 'packages/core/test/fixture-b.test.js', where: 'repo', status: 'written'",
    );
    assert.deepEqual(refused(two), []);
  });

  test('a flip with the file path of the same test corrected is accepted', () => {
    assert.deepEqual(refused(replaced(base(), PLANNED, MOVED)), []);
  });

  test('a flip to written is refused when the file it names is not there', () => {
    const problems = refused(
      replaced(base(), PLANNED, MOVED),
      (rel) => rel !== 'packages/obsidian/test/fixture-a2.test.js',
    );
    assert.deepEqual(kinds(problems), ['missing-file']);
    assert.match(problems[0].message, /test_fixture_a.*packages\/obsidian\/test\/fixture-a2\.test\.js/);
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
    assert.match(problems[0].message, /test_fixture_a.*where/);
  });

  test('the proves text of a flipped test changed is refused', () => {
    const head = replaced(
      base(),
      "(test_fixture_a:Test {proves: 'the first fixture holds",
      "(test_fixture_a:Test {proves: 'a first fixture holds",
    );
    assert.deepEqual(kinds(refused(replaced(head, PLANNED, WRITTEN))), ['field']);
  });

  test('a record removed is refused, naming it', () => {
    // the record goes with its links, so the copy still reads
    const head = base()
      .split('\n')
      .filter((l) => !l.startsWith('(test_abuse:Test {') && !l.endsWith('->(test_abuse),'))
      .join('\n');
    const problems = refused(head);
    assert.ok(kinds(problems).includes('removed'));
    assert.ok(kinds(problems).includes('link-removed'));
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

  test('a property added to a link is refused, and so is a link repeated', () => {
    const link = '(autocomplete)-[:PROVED_BY]->(test_autocomplete),';
    const withProp = refused(replaced(base(), link, "(autocomplete)-[:PROVED_BY {note: 'x'}]->(test_autocomplete),"));
    assert.deepEqual(kinds(withProp).sort(), ['link-added', 'link-removed']);
    const twice = refused(replaced(base(), `${link}\n`, `${link}\n${link}\n`));
    assert.deepEqual(kinds(twice), ['link-added']);
  });

  test('an indented comment line is a comment, so adding or editing one is refused', () => {
    const added = refused(replaced(base(), '// ── Tests ──\n', '// ── Tests ──\n   // slipped in\n'));
    assert.deepEqual(kinds(added), ['comment']);
  });

  test('run on its own with --base-ref: the committed copy against HEAD passes; a bad ref, no value or no repo is exit 2', () => {
    const run = (...args) =>
      spawnSync(process.execPath, [path('scripts/check-requirements-flips.mjs'), ...args], {
        encoding: 'utf8',
        timeout: 30_000,
      });
    const same = run('--base-ref', 'HEAD');
    assert.equal(same.status, 0, same.stdout + same.stderr);
    const bad = run('--base-ref', 'no-such-ref-for-flips');
    assert.equal(bad.status, 2, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /cannot read/);
    const none = run('--base-ref');
    assert.equal(none.status, 2, none.stdout + none.stderr);
    const flag = run('--base-ref', '--base');
    assert.equal(flag.status, 2, flag.stdout + flag.stderr);
    // the empty tree holds no copy: only then is there nothing to compare
    // (writing it makes sure the repository holds that object; it is the same object every time)
    const tree = spawnSync('git', ['hash-object', '-w', '-t', 'tree', '--stdin'], {
      cwd: path('.'),
      input: '',
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(tree.status, 0, tree.stderr);
    const empty = run('--base-ref', tree.stdout.trim());
    assert.equal(empty.status, 0, empty.stdout + empty.stderr);
    assert.match(empty.stdout, /nothing to compare/);
  });

  test('--merge-base-of judges only the branch: a change main gained after the branch point is not a revert; a real hand edit still fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flips-merge-base-'));
    try {
      const git = (...args) => {
        const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000 });
        assert.equal(r.status, 0, r.stderr);
        return r.stdout.trim();
      };
      const run = (...args) =>
        spawnSync(process.execPath, [path('scripts/check-requirements-flips.mjs'), '--repo', dir, ...args], {
          encoding: 'utf8',
          timeout: 30_000,
        });
      const file = join(dir, REQUIREMENTS);
      const commit = (text, message) => {
        mkdirSync(join(dir, 'requirements'), { recursive: true });
        writeFileSync(file, text);
        git('add', '-A');
        git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message);
      };
      git('init', '-q', '-b', 'main');
      const start = base();
      commit(start, 'start');
      git('checkout', '-q', '-b', 'branch');
      git('checkout', '-q', 'main');
      // main gains a change by hand-looking edit (a new proves text), which the branch has not merged
      commit(replaced(start, 'the first fixture holds', 'the first fixture holds, said differently'), 'main moves on');
      const mainTip = git('rev-parse', 'main');
      git('checkout', '-q', 'branch');
      // the branch changes nothing in the copy, so give it a commit about something else
      writeFileSync(join(dir, 'other.txt'), 'x');
      git('add', '-A');
      git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'unrelated');

      // against the tip of main the branch looks like a revert of main's change
      const tip = run('--base-ref', mainTip);
      assert.equal(tip.status, 1, tip.stdout + tip.stderr);
      // against the merge base only the branch's own changes are judged: none
      const fine = run('--merge-base-of', mainTip);
      assert.equal(fine.status, 0, fine.stdout + fine.stderr);

      // a real hand edit on the branch is still refused
      commit(replaced(start, 'the second fixture holds', 'the second fixture holds, edited by hand'), 'hand edit');
      const edited = run('--merge-base-of', mainTip);
      assert.equal(edited.status, 1, edited.stdout + edited.stderr);
      assert.match(edited.stdout, /test_fixture_b/);

      // the option needs a ref that resolves
      const bad = run('--merge-base-of', 'no-such-ref-for-flips');
      assert.equal(bad.status, 2, bad.stdout + bad.stderr);
      const none = run('--merge-base-of');
      assert.equal(none.status, 2, none.stdout + none.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  test('run on its own against a base file: exit 0 for a flip, 1 and each difference named for another change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-requirements-flips-'));
    try {
      const file = join(dir, 'base.gql');
      const extra = "(test_extra:Test {proves: 'extra', file: 'test/x.test.js', where: 'repo', status: 'written'}),\n";
      // the real copy is the head the script reads, so the base is the real copy, never the one with the fixtures
      writeFileSync(file, replaced(read(REQUIREMENTS), '// ── Tests ──\n', `// ── Tests ──\n${extra}`));
      const run = () =>
        spawnSync(process.execPath, [path('scripts/check-requirements-flips.mjs'), '--base', file], {
          encoding: 'utf8',
          timeout: 30_000,
        });
      // the committed copy is the head, so against this base a record has gone
      const bad = run();
      assert.ok(!bad.error, String(bad.error));
      assert.equal(bad.status, 1);
      assert.match(bad.stdout, /^removed: test_extra/m);
      writeFileSync(file, read(REQUIREMENTS));
      const ok = run();
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
