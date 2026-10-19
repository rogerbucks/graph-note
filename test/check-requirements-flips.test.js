// The requirements graph is the one source of the requirements, edited here in pull requests (Roger, 16 Oct 2026: no
// vault holds them any more). A pull request may add, change and remove records, links and comments. It may never move
// a test back, flip one forward without its file, or remove one that is partial or written. Each case is a small edit
// of the real graph, compared with the real graph as the base.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { refusedChanges } from '../scripts/check-requirements-flips.mjs';
import { FORMER_REQUIREMENTS, REQUIREMENTS, requirementsGraph } from '../scripts/check-requirements.mjs';
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

  test('a path corrected on a test that is not flipped is accepted', () => {
    const problems = refused(
      replaced(
        base(),
        "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
        "file: 'packages/core/test/abuse2.test.js', where: 'repo', status: 'written'",
      ),
    );
    assert.deepEqual(problems, []);
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

  test('any other field changed is accepted: a test moved to another place, or what it proves reworded', () => {
    assert.deepEqual(refused(replaced(base(), PLANNED, `${WRITTEN.replace("'repo'", "'both'")}`)), []);
    const head = replaced(
      base(),
      "(test_fixture_a:Test {proves: 'the first fixture holds",
      "(test_fixture_a:Test {proves: 'a first fixture holds",
    );
    assert.deepEqual(refused(replaced(head, PLANNED, WRITTEN)), []);
  });

  test('a written test removed is refused, naming it', () => {
    // the record goes with its links, so the graph still reads
    const head = base()
      .split('\n')
      .filter((l) => !l.startsWith('(test_abuse:Test {') && !l.endsWith('->(test_abuse),'))
      .join('\n');
    const problems = refused(head);
    assert.deepEqual(kinds(problems), ['removed']);
    assert.match(problems[0].message, /test_abuse.*written/);
  });

  test('a planned test or a question removed is accepted', () => {
    const head = base()
      .split('\n')
      .filter((l) => !l.startsWith('(test_fixture_b:Test {'))
      .join('\n');
    assert.deepEqual(refused(head), []);
    const noQuestion = base()
      .split('\n')
      .filter((l) => !l.startsWith('(q_14_roles_auto_apply'))
      .join('\n');
    assert.deepEqual(refused(noQuestion), []);
  });

  test('a record added is accepted', () => {
    const orphan = "(test_new:Test {proves: 'new', file: 'test/x.test.js', where: 'repo', status: 'planned'}),\n";
    assert.deepEqual(refused(replaced(base(), '// ── Tests ──\n', `// ── Tests ──\n${orphan}`)), []);
  });

  test('a link added, removed, repeated or given a property is accepted', () => {
    const link = '(autocomplete)-[:PROVED_BY]->(test_autocomplete),';
    assert.deepEqual(refused(replaced(base(), `${link}\n`, '')), []);
    const extra = replaced(base(), '// ── Links ──\n', `// ── Links ──\n(autocomplete)-[:PROVED_BY]->(test_abuse),\n`);
    assert.deepEqual(refused(extra), []);
    assert.deepEqual(
      refused(replaced(base(), link, "(autocomplete)-[:PROVED_BY {note: 'x'}]->(test_autocomplete),")),
      [],
    );
    assert.deepEqual(refused(replaced(base(), `${link}\n`, `${link}\n${link}\n`)), []);
  });

  test('a comment line or heading added or edited is accepted: the banner is the audit’s to check', () => {
    assert.deepEqual(refused(replaced(base(), '// ── Tests ──\n', '// ── Tests ──\n   // slipped in\n')), []);
    assert.deepEqual(refused(replaced(base(), '// ── Tests ──', '// ── Tests, edited ──')), []);
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
    // The empty tree holds no copy. Only then is there nothing to compare. (Writing it makes sure the repository holds
    // that object. It is the same object every time.)
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
      // a partial test whose file the repository holds, so main can flip it forward
      const PARTIAL = "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'partial'";
      const start = replaced(base(), PLANNED, PARTIAL);
      commit(start, 'start');
      git('checkout', '-q', '-b', 'branch');
      git('checkout', '-q', 'main');
      // main flips the test forward, which the branch has not merged
      commit(replaced(start, PARTIAL, PARTIAL.replace("'partial'", "'written'")), 'main moves on');
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

      // a flip back on the branch is still refused
      commit(
        replaced(
          start,
          "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'written'",
          "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'planned'",
        ),
        'flip back',
      );
      const edited = run('--merge-base-of', mainTip);
      assert.equal(edited.status, 1, edited.stdout + edited.stderr);
      assert.match(edited.stdout, /test_abuse/);

      // the option needs a ref that resolves
      const bad = run('--merge-base-of', 'no-such-ref-for-flips');
      assert.equal(bad.status, 2, bad.stdout + bad.stderr);
      const none = run('--merge-base-of');
      assert.equal(none.status, 2, none.stdout + none.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

describe('across the move from the graph file to the note', () => {
  test('a base from before the move is read from the former graph file, so a flip back is still refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flips-moved-'));
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
      const write = (rel, text) => {
        mkdirSync(join(dir, 'requirements'), { recursive: true });
        writeFileSync(join(dir, rel), text);
      };
      const commit = (message) => {
        git('add', '-A');
        git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message);
      };
      const graph = requirementsGraph(base());
      const PARTIAL = "file: 'packages/core/test/abuse.test.js', where: 'repo', status: 'partial'";
      const start = replaced(graph, PLANNED, PARTIAL);
      git('init', '-q', '-b', 'main');
      write(FORMER_REQUIREMENTS, start);
      commit('the graph file');
      const before = git('rev-parse', 'HEAD');
      rmSync(join(dir, FORMER_REQUIREMENTS));
      const note = (text) =>
        `# Editor requirements\n\nThe one source.\n\n\`\`\`gql\n${text.replace(/\n$/, '')}\n\`\`\`\n`;
      write(REQUIREMENTS, note(start));
      commit('the note');
      const same = run('--base-ref', before);
      assert.equal(same.status, 0, same.stdout + same.stderr);
      write(REQUIREMENTS, note(replaced(start, PARTIAL, PARTIAL.replace("'partial'", "'planned'"))));
      commit('flip back');
      const back = run('--base-ref', before);
      assert.equal(back.status, 1, back.stdout + back.stderr);
      assert.match(back.stdout, /test_abuse/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
