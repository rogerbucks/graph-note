// The records of the tests-first replay (spec §12, tests_first), kept so that two branches never conflict in them: one
// file for each replayed commit in test/tests-first/, over the frozen baseline.json, and one file for each reason a
// test passed before its code in test/seen-failing/. Proved here on small repositories made for the purpose, merged by
// git's own merge with no merge driver, as GitHub merges; then on this repository's records, moved over from the two
// single files they were kept in until 11 Oct 2026.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BASELINE,
  EXCUSALS,
  RECORDS,
  exceptionsIn,
  excusalName,
  excuse,
  migrate,
  readRecords,
  summary,
} from '../scripts/tests-first-records.mjs';
import { record, replay, unexplained, update } from '../scripts/tests-first.mjs';
import { testsForChanges } from '../scripts/changed-tests.mjs';
import { repository } from './repository/scratch-repository.js';
import { path, exists, walk } from './repository/repo.js';

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;
const HALF = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { half } from '../src/half.js';\n${body}\n`;

/** The reasons kept, as plain objects: they are read into objects with no prototype, so no key reaches another. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The files in a repository's folder of records, sorted. */
const recordFiles = (dir) => (existsSync(join(dir, RECORDS)) ? readdirSync(join(dir, RECORDS)).sort() : []);

describe('a record for each replayed commit', () => {
  test('each replayed commit that changed a test is kept in a file of its own, named after it; one that changed none has none', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      { 'README.md': 'no test here\n' },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': TWICE("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      record(r.dir);
      assert.deepEqual(recordFiles(r.dir), [`${r.ids[1]}.json`, `${r.ids[3]}.json`].sort());
      const kept = JSON.parse(readFileSync(join(r.dir, RECORDS, `${r.ids[3]}.json`), 'utf8'));
      assert.equal(kept.commit, r.ids[3]);
      assert.deepEqual(kept.files[0].failedFirst, ['doubles']);
      assert.equal(kept.head, undefined, 'no field that every update rewrites');
      // 'one', whose code did not exist before it, and 'doubles'
      assert.equal(summary(r.dir).files['test/twice.test.js'].seenFailing, 2);
    } finally {
      r.done();
    }
  });

  test('the record of a commit no longer in the history is removed at the next update, and the new commit’s added', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': TWICE("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      record(r.dir);
      assert.ok(readRecords(r.dir).commits.has(r.ids[2]));
      // the branch is rewritten: its last commit is made again, differently
      r.git('reset', '-q', '--hard', r.ids[1]);
      const again = r.commit(
        {
          'src/twice.js': 'export const twice = (x) => x + x;\n',
          'test/twice.test.js': TWICE("test('one', () => {});\ntest('adds', () => assert.equal(twice(3), 6));"),
        },
        'made again',
      );
      update(r.dir);
      assert.deepEqual([...readRecords(r.dir).commits.keys()].sort(), [r.ids[1], again].sort());
      const e = summary(r.dir).files['test/twice.test.js'];
      assert.deepEqual([e.replayed, e.seenFailing], [2, 2], "'one', then 'adds', never 'doubles'");
    } finally {
      r.done();
    }
  });

  test('a file in the records folder that is not the record of the commit it is named after fails loudly, naming it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, RECORDS), { recursive: true });
      writeFileSync(join(dir, RECORDS, 'notes.json'), '{}\n');
      assert.throws(() => readRecords(dir), /notes\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a reason for each test that passed before its code', () => {
  test('a reason is kept in a file of its own, named after its test file and its test, and excuses that test alone', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x * 2;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      { 'test/twice.test.js': TWICE("test('one', () => {});\ntest('already true', () => assert.equal(twice(1), 2));") },
    ]);
    try {
      const replays = [replay(r.dir, r.ids[1])];
      assert.equal(unexplained(replays, exceptionsIn(r.dir)).length, 1);
      // the same name in another test file excuses nothing here
      excuse(r.dir, 'test/other.test.js', 'already true', 'a reason for another file’s test');
      assert.equal(unexplained(replays, exceptionsIn(r.dir)).length, 1);
      const kept = excuse(r.dir, 'test/twice.test.js', 'already true', 'pins behaviour that already existed');
      assert.equal(kept, `${EXCUSALS}/${excusalName('test/twice.test.js', 'already true')}`);
      assert.match(kept, /\/twice-[0-9a-f]{12}\.json$/);
      assert.deepEqual(unexplained(replays, exceptionsIn(r.dir)), []);
      assert.deepEqual(plain(exceptionsIn(r.dir)['test/twice.test.js']), {
        'already true': { seen_failing_first: false, evidence: 'pins behaviour that already existed' },
      });
      assert.notEqual(excusalName('test/twice.test.js', 'one'), excusalName('test/twice.test.js', 'already true'));
    } finally {
      r.done();
    }
  });

  test('a reason in a file not named for its test fails loudly, naming the file and the name it should have', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, EXCUSALS), { recursive: true });
      const reason = { file: 'test/x.test.js', test: 'a', seen_failing_first: false, evidence: 'a control case here' };
      writeFileSync(join(dir, EXCUSALS, 'mine.json'), JSON.stringify(reason));
      assert.throws(
        () => exceptionsIn(dir),
        (e) => e.message.includes('mine.json') && e.message.includes(excusalName('test/x.test.js', 'a')),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // review of #69: a reason naming __proto__ passed the name check, reached every object through Object.prototype, and
  // excused a test that main would flag
  test('a reason that names __proto__ is refused, naming its file, and reaches no other object: it excuses nothing', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'test/new.test.js': "import { test } from 'node:test';\ntest('already passes', () => {});\n" },
    ]);
    const key = 'test/new.test.js';
    const slipped = { seen_failing_first: false, evidence: 'slipped in through the prototype' };
    try {
      const name = '__proto__-37357c2c1b86.json';
      assert.equal(excusalName('__proto__', key), name, 'the name check alone lets it through');
      mkdirSync(join(r.dir, EXCUSALS), { recursive: true });
      writeFileSync(
        join(r.dir, EXCUSALS, name),
        JSON.stringify({ file: '__proto__', test: key, 'already passes': slipped }),
      );
      assert.throws(
        () => exceptionsIn(r.dir),
        (e) => e.message.includes(name),
      );
      assert.equal(Object.hasOwn(Object.prototype, key), false, 'Object.prototype is untouched');
      // and a reason only inherited, never a test file's or a test's own, excuses nothing
      const inherited = Object.create({ [key]: { 'already passes': slipped } });
      assert.deepEqual(
        unexplained([replay(r.dir, r.ids[1])], inherited).map((u) => u.name),
        ['already passes'],
      );
    } finally {
      delete Object.prototype[key];
      r.done();
    }
  });

  test('a reason naming constructor or prototype, or holding more than its four fields, is refused, naming its file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    const reason = { seen_failing_first: false, evidence: 'a control case here' };
    const cases = [
      { file: 'test/x.test.js', test: 'constructor', ...reason },
      { file: 'prototype', test: 'a', ...reason },
      { file: 'test/x.test.js', test: 'a', ...reason, note: 'one field too many' },
    ];
    try {
      mkdirSync(join(dir, EXCUSALS), { recursive: true });
      for (const kept of cases) {
        const name = excusalName(kept.file, kept.test);
        writeFileSync(join(dir, EXCUSALS, name), JSON.stringify(kept));
        assert.throws(
          () => exceptionsIn(dir),
          (e) => e.message.includes(name),
          JSON.stringify(kept),
        );
        rmSync(join(dir, EXCUSALS, name));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('only .json files are read as reasons, and one that is not JSON fails, naming it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, EXCUSALS), { recursive: true });
      writeFileSync(join(dir, EXCUSALS, '.DS_Store'), 'not a reason');
      excuse(dir, 'test/x.test.js', 'a', 'a control case here');
      assert.deepEqual(Object.keys(exceptionsIn(dir)), ['test/x.test.js']);
      writeFileSync(join(dir, EXCUSALS, 'broken.json'), '{ not JSON');
      assert.throws(() => exceptionsIn(dir), /broken\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a reason already kept is never overwritten, unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      excuse(dir, 'test/x.test.js', 'a', 'the first reason given');
      assert.throws(() => excuse(dir, 'test/x.test.js', 'a', 'a second reason'), /--force/);
      assert.equal(exceptionsIn(dir)['test/x.test.js'].a.evidence, 'the first reason given');
      excuse(dir, 'test/x.test.js', 'a', 'a second reason', true);
      assert.equal(exceptionsIn(dir)['test/x.test.js'].a.evidence, 'a second reason');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a change to a record or a reason runs the tests of the tests-first replay', () => {
    const tracked = ['test/tests-first.test.js', 'test/tests-first-records.test.js', 'test/tests-first-run.test.js'];
    for (const changed of [`${RECORDS}/${'0'.repeat(40)}.json`, `${RECORDS}/${BASELINE}`, `${EXCUSALS}/x-0123.json`])
      assert.deepEqual(testsForChanges([changed], tracked), {
        all: false,
        files: ['test/tests-first-records.test.js', 'test/tests-first.test.js'],
      });
  });
});

describe('two branches merged', () => {
  // GitHub merges on its server with git's own merge, reading no merge driver: a design that needs one does not hold there
  test('branches that record different commits and excuse different tests merge with nothing to resolve, and need no new record', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
    ]);
    try {
      record(r.dir);
      r.commit({}, 'record main');
      const branch = (name, files, file, excused) => {
        r.git('checkout', '-q', '-b', name, 'main');
        r.commit(files, `${name}: a test and its code`);
        excuse(r.dir, file, excused, `a reason kept on branch ${name}`);
        update(r.dir);
        r.commit({}, `${name}: record it`);
      };
      branch(
        'a',
        {
          'src/twice.js': 'export const twice = (x) => x * 2;\n',
          'test/twice.test.js': TWICE("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
        },
        'test/twice.test.js',
        'one',
      );
      branch(
        'b',
        {
          'src/half.js': 'export const half = (x) => x / 2;\n',
          'test/half.test.js': HALF("test('halves', () => assert.equal(half(4), 2));"),
        },
        'test/half.test.js',
        'halves',
      );
      const merged = spawnSync('git', ['merge-tree', '--write-tree', 'a', 'b'], { cwd: r.dir, encoding: 'utf8' });
      assert.equal(merged.status, 0, merged.stdout);
      // merged, the records hold both branches' commits: nothing is left to replay or write
      r.git('checkout', '-q', 'a');
      r.git('merge', '-q', '--no-edit', 'b');
      update(r.dir);
      assert.equal(r.git('status', '--porcelain'), '');
      const files = summary(r.dir).files;
      assert.equal(files['test/twice.test.js'].seenFailing, 2, "main's 'one' and branch a's 'doubles'");
      assert.equal(files['test/half.test.js'].seenFailing, 1, "branch b's 'halves'");
    } finally {
      r.done();
    }
  });
});

describe('moving the old single files over', () => {
  const OLD_RECORD = {
    note: 'the old record',
    head: 'a'.repeat(40),
    files: {
      'test/twice.test.js': {
        replayed: 2,
        notReplayed: 1,
        seenFailing: 3,
        excused: 1,
        passedFirst: [{ commit: 'b'.repeat(40), name: 'already true' }],
        notReplayedCommits: [{ commit: 'c'.repeat(40), reason: 'the first commit has no parent' }],
      },
    },
  };
  const OLD_REASONS = {
    'test/twice.test.js': { 'already true': { seen_failing_first: false, evidence: 'pins behaviour already there' } },
    'py/tests/test_half.py': {
      'Half.test_one': { seen_failing_first: false, evidence: 'a control case, by design' },
      'Half.test_two': { seen_failing_first: false, evidence: 'another control case, by design' },
    },
  };
  /** A folder holding the two old files, and a baseline already there when `baseline` is given. */
  const old = (baseline) => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    mkdirSync(join(dir, 'test'), { recursive: true });
    writeFileSync(join(dir, 'test', 'tests-first.json'), JSON.stringify(OLD_RECORD));
    writeFileSync(join(dir, 'test', 'seen-failing.json'), JSON.stringify(OLD_REASONS));
    if (baseline) {
      mkdirSync(join(dir, RECORDS), { recursive: true });
      writeFileSync(join(dir, RECORDS, BASELINE), JSON.stringify(baseline));
    }
    return dir;
  };

  test('every entry of the old record goes whole into the baseline, every reason into its own file, and the old files go', () => {
    const dir = old();
    try {
      migrate(dir);
      assert.ok(!existsSync(join(dir, 'test', 'tests-first.json')));
      assert.ok(!existsSync(join(dir, 'test', 'seen-failing.json')));
      assert.deepEqual(readRecords(dir).baseline, { head: OLD_RECORD.head, files: OLD_RECORD.files });
      assert.deepEqual(plain(exceptionsIn(dir)), OLD_REASONS);
      assert.equal(readdirSync(join(dir, EXCUSALS)).length, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a branch’s own old record never overwrites a baseline already there: it is dropped, for --update to replay', () => {
    const baseline = { note: 'main’s', head: 'd'.repeat(40), files: {} };
    const dir = old(baseline);
    try {
      const said = migrate(dir).join('\n');
      assert.ok(!existsSync(join(dir, 'test', 'tests-first.json')));
      assert.deepEqual(readRecords(dir).baseline, { head: baseline.head, files: {} });
      assert.match(said, /--update/);
      assert.deepEqual(plain(exceptionsIn(dir)), OLD_REASONS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // review of #69: a branch's copy of a reason, made before main changed it, silently put main's older words back
  test('a reason main already keeps differently is never overwritten by the branch’s copy: it is skipped and named', () => {
    const dir = old();
    try {
      const newer = excuse(dir, 'test/twice.test.js', 'already true', 'main’s newer evidence, written since');
      // a copy the same as main's is simply there already, and needs no choice
      const same = OLD_REASONS['py/tests/test_half.py']['Half.test_one'];
      excuse(dir, 'py/tests/test_half.py', 'Half.test_one', same.evidence);
      const said = migrate(dir).join('\n');
      const kept = exceptionsIn(dir);
      assert.equal(kept['test/twice.test.js']['already true'].evidence, 'main’s newer evidence, written since');
      assert.ok(said.includes(newer), said);
      // the branch's own words are said too, so a person can choose between the two and nothing is lost
      assert.ok(said.includes(OLD_REASONS['test/twice.test.js']['already true'].evidence), said);
      assert.ok(!said.includes(excusalName('py/tests/test_half.py', 'Half.test_one')), said);
      // a reason main does not keep yet is moved as before
      assert.equal(kept['py/tests/test_half.py']['Half.test_two'].evidence, 'another control case, by design');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a migration that would refuse any reason writes none, and leaves the old files where they are', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    const reason = { seen_failing_first: false, evidence: 'a control case, by design' };
    try {
      mkdirSync(join(dir, 'test'), { recursive: true });
      const reasons = { 'test/a.test.js': { 'a fine test': reason, constructor: reason } };
      writeFileSync(join(dir, 'test', 'seen-failing.json'), JSON.stringify(reasons));
      writeFileSync(join(dir, 'test', 'tests-first.json'), JSON.stringify(OLD_RECORD));
      assert.throws(() => migrate(dir), /constructor/);
      assert.ok(!existsSync(join(dir, EXCUSALS)), 'no reason was written');
      assert.ok(!existsSync(join(dir, RECORDS)), 'nor the baseline');
      assert.ok(existsSync(join(dir, 'test', 'seen-failing.json')));
      assert.ok(existsSync(join(dir, 'test', 'tests-first.json')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('this repository’s records', () => {
  // main as it stood just before the records were split, holding the two single files (11 Oct 2026)
  const BEFORE_SPLIT = '391645a59e85b93a398961fef4965df72cbb5e7d';
  const before = (file) =>
    JSON.parse(execFileSync('git', ['show', `${BEFORE_SPLIT}:${file}`], { cwd: path('.'), encoding: 'utf8' }));

  test('the migrated records hold every entry the old files held', () => {
    const was = before('test/tests-first.json');
    assert.deepEqual(readRecords(path('.')).baseline, { head: was.head, files: was.files });
    const reasons = exceptionsIn(path('.'));
    let held = 0;
    // a reason for a test file since removed goes with it, as the record's own test asks
    for (const [file, names] of Object.entries(before('test/seen-failing.json')).filter(([f]) => exists(f)))
      for (const [name, reason] of Object.entries(names)) {
        assert.deepEqual(reasons[file]?.[name], reason, `${file} :: ${name}`);
        held++;
      }
    assert.ok(held > 100, `${held} reasons held`);
  });

  test('every record is named after a commit in the history since the baseline, and every reason after its test', () => {
    const { baseline, commits } = readRecords(path('.'));
    const isAncestor = (a, b) =>
      spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: path('.') }).status === 0;
    for (const commit of commits.keys()) {
      // review of #69: a squash or a rebase merge makes new commits, and leaves the records of the old ones behind
      assert.ok(
        isAncestor(commit, 'HEAD'),
        `${RECORDS}/${commit}.json records a commit not in the history: most likely its branch was merged by squash or ` +
          'rebase, which makes new commits; merge pull requests with a merge commit only, then run ' +
          'node scripts/tests-first.mjs --update to record the commits that are there',
      );
      assert.ok(!isAncestor(commit, baseline.head), `${commit} is not already in the baseline`);
    }
    assert.doesNotThrow(() => exceptionsIn(path('.')));
  });

  // moved here from tests-first.test.js with summary(), which they read, on 11 Oct 2026
  const proved = summary(path('.')),
    exceptions = exceptionsIn(path('.'));

  test('every test file in the repository has its entry, with what was proved, excused and not replayed kept apart', () => {
    const files = [
      ...walk('.').filter((f) => /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$|(^|\/)tests\/test_\w+\.py$/.test(f)),
    ].filter((f) => !f.startsWith('spikes/'));
    // a file added since the baseline has its entry once a commit that changed it is replayed: CI replays it as it comes
    const known = (f) =>
      spawnSync('git', ['cat-file', '-e', `${proved.baseline}:${f}`], { cwd: path('.') }).status === 0;
    for (const f of files.filter(known)) {
      const e = proved.files[f];
      assert.ok(e, `${f} has an entry`);
      for (const key of ['replayed', 'notReplayed', 'seenFailing', 'excused'])
        assert.equal(typeof e[key], 'number', `${f}: ${key}`);
    }
  });

  test('every test that passed against its parent has its reason, and every reason names such a test', () => {
    const passed = Object.entries(proved.files).flatMap(([file, e]) =>
      e.passedFirst.map((p) => `${file} :: ${p.name}`),
    );
    // a reason with `fault` excuses a test recorded as failing at its own commit, which a reason for passing first does not
    const faults = [...readRecords(path('.')).commits.values()].flatMap((r) =>
      r.files.flatMap((f) => (f.faults ?? []).map((x) => `${f.file} :: ${x.test}`)),
    );
    const named = (wanted) =>
      Object.entries(exceptions).flatMap(([file, names]) =>
        Object.entries(names)
          .filter(([, reason]) => Boolean(reason.fault) === wanted)
          .map(([n]) => `${file} :: ${n}`),
      );
    const excused = named(false);
    assert.deepEqual(
      named(true).filter((x) => !faults.includes(x)),
      [],
      'a fault reason for no recorded fault',
    );
    // a test new in a commit whose run against the code before it did not finish was neither seen failing nor passing:
    // a reason may be kept for it
    const unproved = Object.entries(proved.files).flatMap(([file, e]) =>
      (e.notReplayedCommits ?? []).flatMap((c) => (c.tests ?? []).map((n) => `${file} :: ${n}`)),
    );
    assert.deepEqual(
      passed.filter((p) => !excused.includes(p)),
      [],
      'unexplained',
    );
    assert.deepEqual(
      excused.filter((x) => !passed.includes(x) && !unproved.includes(x)),
      [],
      'a reason for no such test',
    );
    for (const names of Object.values(exceptions))
      for (const reason of Object.values(names)) {
        assert.equal(reason.seen_failing_first, false);
        assert.ok(typeof reason.evidence === 'string' && reason.evidence.length > 10);
      }
  });
});
