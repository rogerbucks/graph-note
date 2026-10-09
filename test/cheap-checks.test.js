// Cheap for an AI to check (spec §13, test_cheap_checks): a quiet test run that says little when all is well and only
// what is needed when not, a way to run just the tests of what a change touches, a short guide for AI sessions, and
// generated or bulky files kept out of code searches. The reporter and the runner are tried on small fixtures made in
// a temporary folder, so the fixtures are never picked up by `npm test`.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, path, read, readJSON, walk } from './repository/repo.js';
import { testsForChanges } from '../scripts/changed-tests.mjs';

// a run inside another test run would report to it, not print its own report
const { NODE_TEST_CONTEXT: _context, ...CLEAN_ENV } = process.env;
const run = (command, args, cwd) => spawnSync(command, args, { cwd, env: CLEAN_ENV, encoding: 'utf8', timeout: 60000 });

const REPORTER = path('scripts/quiet-reporter.mjs');
const quietNode = (cwd, ...files) => run(process.execPath, ['--test', `--test-reporter=${REPORTER}`, ...files], cwd);

let dir;
const write = (file, text) => {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), text);
};

describe('a quiet test run', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'cheap-checks-'));
    write('node_modules/dep/package.json', '{"name":"dep","type":"module","exports":"./index.js"}');
    write('node_modules/dep/index.js', "export const explode = () => {\n  throw new Error('dependency broke');\n};\n");
    write(
      'pass.test.js',
      [
        "import { test } from 'node:test';",
        "test('one', () => { console.log('NOISE from a passing test'); });",
        "test('two', () => {});",
      ].join('\n'),
    );
    write(
      'fail.test.js',
      [
        "import { test, describe } from 'node:test';", // 1
        "import assert from 'node:assert/strict';", // 2
        "import { explode } from 'dep';", // 3
        "describe('sums', () => {", // 4
        "  test('adds two numbers', () => {", // 5
        "    console.log('NOISE from a failing test');", // 6
        '    assert.equal(1 + 1, 3);', // 7
        '  });', // 8
        "  test('keeps the sign', () => {", // 9
        '    assert.equal(1, 1);', // 10
        '  });', // 11
        '});', // 12
        "test('a long difference', () => {", // 13
        "  assert.equal('a'.repeat(1000), 'b'.repeat(1000));", // 14
        '});', // 15
        "test('a dependency throws', () => {", // 16
        '  explode();', // 17
        '});', // 18
      ].join('\n'),
    );
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('when every test passes it prints one line, and nothing the tests logged', () => {
    const r = quietNode(dir, 'pass.test.js');
    assert.equal(r.stdout, 'ok 2 tests\n');
    assert.equal(r.stderr, '');
    assert.equal(r.status, 0);
  });

  test('a failure is its file and line, its name, a short expected and actual, and the first stack frame in the code', () => {
    const r = quietNode(dir, 'fail.test.js');
    const lines = r.stdout.split('\n');
    assert.equal(r.status, 1);
    assert.equal(r.stderr, '');
    // the first failure, whole: a suite's name leads, the test's own line is given, and the stack frame is the test file's
    assert.deepEqual(lines.slice(0, 4), [
      'fail.test.js:5  sums > adds two numbers',
      '  expected: 3',
      '  actual:   2',
      '  at fail.test.js:7',
    ]);
    assert.equal(lines.at(-2), 'FAIL 3 of 4 tests');
    assert.equal(lines.at(-1), '');
  });

  test('the test that passed, the suite around the failure and the test logging are not mentioned', () => {
    const out = quietNode(dir, 'fail.test.js').stdout;
    assert.doesNotMatch(out, /NOISE/);
    assert.doesNotMatch(out, /keeps the sign/);
    assert.equal(
      out.match(/^fail\.test\.js:\d+ {2}/gm).length,
      3,
      'one entry for each failed test, none for the suite',
    );
  });

  test('a long difference is cut short at 200 characters, with an ellipsis', () => {
    const out = quietNode(dir, 'fail.test.js').stdout;
    assert.match(out, /^ {2}expected: 'b{199}…$/m);
    assert.match(out, /^ {2}actual: {3}'a{199}…$/m);
  });

  test('the stack frame is the first one in the repository’s own code, not in node_modules or in Node', () => {
    const out = quietNode(dir, 'fail.test.js').stdout;
    assert.match(
      out,
      /^fail\.test\.js:16 {2}a dependency throws\n {2}error: Error: dependency broke\n {2}at fail\.test\.js:17$/m,
    );
    assert.doesNotMatch(out, /node_modules|node:/);
  });

  test('on the repository’s own tests it prints one line when they pass', () => {
    const r = quietNode(path('.'), 'packages/core/test/zoom.test.js');
    assert.match(r.stdout, /^ok \d+ tests\n$/);
  });

  test('npm test stays the plain run that CI uses, and test:ai is the quiet one', () => {
    const scripts = readJSON('package.json').scripts;
    assert.equal(scripts.test, 'node --test');
    assert.equal(scripts['test:ai'], 'node --test --test-reporter=./scripts/quiet-reporter.mjs');
    assert.ok(read('.github/workflows/ci.yml').includes('run: npm test\n'));
  });
});

describe('a quiet Python run', () => {
  const python = run('python3', ['--version']).status === 0;
  const RUNNER = path('scripts/quiet_unittest.py');
  const quietPy = (cwd, ...args) => run('python3', [RUNNER, ...args], cwd);

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'cheap-checks-py-'));
    write(
      'tests/test_good.py',
      [
        'import unittest',
        '',
        '',
        'class Good(unittest.TestCase):',
        '    def test_quiet(self):',
        "        print('NOISE from a passing test')",
        '        self.assertEqual(1, 1)',
        '',
        '    def test_also(self):',
        '        self.assertTrue(True)',
      ].join('\n'),
    );
    write(
      'tests/test_bad.py',
      [
        'import unittest', // 1
        '', // 2
        '', // 3
        'class Bad(unittest.TestCase):', // 4
        '    def test_adds(self):', // 5
        "        print('NOISE from a failing test')", // 6
        '        self.assertEqual(3, 4)', // 7
        '', // 8
        '    def test_long(self):', // 9
        "        raise ValueError('x' * 1000)", // 10
      ].join('\n'),
    );
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('when every test passes it prints one line, and nothing the tests printed', { skip: !python }, () => {
    const r = quietPy(dir, 'test_good.py');
    assert.equal(r.stdout, 'ok 2 tests\n');
    assert.equal(r.status, 0);
  });

  test(
    'a failure is its file and line, its name, what failed and the first frame in the code',
    { skip: !python },
    () => {
      const r = quietPy(dir);
      const lines = r.stdout.split('\n');
      assert.equal(r.status, 1);
      assert.deepEqual(lines.slice(0, 3), [
        'tests/test_bad.py:5  Bad.test_adds',
        '  error: AssertionError: 3 != 4',
        '  at tests/test_bad.py:7',
      ]);
      assert.match(lines[3], /^tests\/test_bad\.py:9 {2}Bad\.test_long$/);
      assert.match(lines[4], /^ {2}error: ValueError: x{150,}…$/);
      assert.ok(lines[4].length <= 2 + 'error: '.length + 200 + 1 + 20, 'a long difference is cut short');
      assert.equal(lines.at(-2), 'FAIL 2 of 4 tests');
      assert.doesNotMatch(r.stdout, /NOISE/);
    },
  );

  test('npm run test:ai:py runs it inside the Python library’s environment', () => {
    const script = readJSON('package.json').scripts['test:ai:py'];
    assert.match(script, /^uv run .*--directory python\/graph_spec .*scripts\/quiet_unittest\.py$/);
    assert.ok(exists('scripts/quiet_unittest.py'));
  });
});

describe('running only the tests a change touches', () => {
  const tracked = [
    'package.json',
    'packages/core/src/index.ts',
    'packages/core/src/zoom.ts',
    'packages/core/src/types.ts',
    'packages/core/test/index.test.js',
    'packages/core/test/pane.test.js',
    'packages/core/test/zoom.test.js',
    'packages/core/test/zoom-limits.test.js',
    'packages/obsidian/src/graph-view.ts',
    'packages/obsidian/test/graph-view.test.js',
    'packages/obsidian/test/graph-view-bar.test.js',
    'packages/obsidian/test/host/fake-dom.js',
    'python/graph_spec/src/graph_svg.py',
    'python/graph_spec/tests/test_graph_svg_entry_point.py',
    'test/conventions.test.js',
    'test/repository/repo.js',
    'CONTRIBUTING.md',
  ];
  const plan = (...changed) => testsForChanges(changed, tracked);

  test('a changed module runs the tests named after it, with and without an aspect after a hyphen', () => {
    assert.deepEqual(plan('packages/core/src/zoom.ts'), {
      all: false,
      files: ['packages/core/test/zoom-limits.test.js', 'packages/core/test/zoom.test.js'],
    });
  });

  test('a changed test file runs itself', () => {
    assert.deepEqual(plan('packages/core/test/pane.test.js'), {
      all: false,
      files: ['packages/core/test/pane.test.js'],
    });
  });

  test('a changed module of the plugin runs the plugin’s tests named after it', () => {
    assert.deepEqual(plan('packages/obsidian/src/graph-view.ts'), {
      all: false,
      files: ['packages/obsidian/test/graph-view-bar.test.js', 'packages/obsidian/test/graph-view.test.js'],
    });
  });

  test('a changed Python module runs the Python tests named after it', () => {
    assert.deepEqual(plan('python/graph_spec/src/graph_svg.py'), {
      all: false,
      files: ['python/graph_spec/tests/test_graph_svg_entry_point.py'],
    });
  });

  test('changes to several modules run each module’s tests once', () => {
    const { files } = plan('packages/core/src/zoom.ts', 'packages/core/test/zoom.test.js', 'test/conventions.test.js');
    assert.deepEqual(files, [
      'packages/core/test/zoom-limits.test.js',
      'packages/core/test/zoom.test.js',
      'test/conventions.test.js',
    ]);
  });

  test('a document runs the test that checks the documents', () => {
    assert.deepEqual(plan('CONTRIBUTING.md'), { all: false, files: ['test/conventions.test.js'] });
  });

  test('nothing changed runs nothing', () => {
    assert.deepEqual(plan(), { all: false, files: [] });
  });

  test('a deleted test file is left out, as it cannot run, and a deleted module still runs its tests', () => {
    assert.deepEqual(plan('packages/core/test/gone.test.js', 'packages/core/test/pane.test.js'), {
      all: false,
      files: ['packages/core/test/pane.test.js'],
    });
    assert.deepEqual(plan('packages/core/src/zoom-gone.ts').all, true, 'a deleted module with no tests named after it');
    const withoutModule = tracked.filter((f) => f !== 'packages/core/src/zoom.ts');
    assert.deepEqual(testsForChanges(['packages/core/src/zoom.ts'], withoutModule).files, [
      'packages/core/test/zoom-limits.test.js',
      'packages/core/test/zoom.test.js',
    ]);
  });

  for (const [what, changed] of [
    ['a package’s entry, index.ts', 'packages/core/src/index.ts'],
    ['a module with no test named after it', 'packages/core/src/types.ts'],
    ['package.json', 'package.json'],
    ['the lock file', 'package-lock.json'],
    ['test support, such as the repository helpers', 'test/repository/repo.js'],
    ['test support, such as the fake DOM', 'packages/obsidian/test/host/fake-dom.js'],
    ['a workflow', '.github/workflows/ci.yml'],
  ])
    test(`${what} is shared, so the whole suite runs, and one line says why`, () => {
      const r = plan(changed);
      assert.equal(r.all, true);
      assert.match(r.reason, new RegExp(changed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(r.reason, /\n/);
    });

  test('one shared file among the others runs the whole suite', () => {
    assert.equal(plan('packages/core/src/zoom.ts', 'package.json').all, true);
  });

  test('the command lists the plan for paths it is given, and says when it runs the whole suite', () => {
    const list = run(
      process.execPath,
      ['scripts/changed-tests.mjs', '--list', 'packages/obsidian/src/pane.ts'],
      path('.'),
    );
    assert.equal(list.status, 0);
    assert.equal(
      list.stdout,
      ['pane-added-for-you.test.js', 'pane-help.test.js', 'pane-writing.test.js', 'pane.test.js']
        .map((f) => `packages/obsidian/test/${f}\n`)
        .join(''),
    );
    const all = run(process.execPath, ['scripts/changed-tests.mjs', '--list', 'package.json'], path('.'));
    assert.match(all.stdout, /^whole suite: package\.json is shared\n$/);
    assert.equal(readJSON('package.json').scripts['test:changed'], 'node scripts/changed-tests.mjs');
  });
});

describe('a short guide for AI sessions', () => {
  const guide = () => read('AGENTS.md');

  test('AGENTS.md is short and gives the cheap commands and the full ones', () => {
    assert.ok(guide().split('\n').length <= 60, 'under about 60 lines');
    for (const cmd of [
      'npm run test:ai',
      'npm run test:changed',
      'npm run test:ai:py',
      'npm test',
      'npm run typecheck',
    ])
      assert.ok(guide().includes(cmd), cmd);
  });

  test('it says to read only the failed job’s log on a CI failure', () => {
    assert.ok(guide().includes('gh run view <id> --log-failed'));
  });

  test('it links CONTRIBUTING.md and the guide of every package', () => {
    assert.ok(guide().includes('(CONTRIBUTING.md)'));
    const guides = walk('packages')
      .concat(walk('python'))
      .filter((f) => /^(packages|python)\/[^/]+\/GUIDE\.md$/.test(f));
    assert.ok(guides.length >= 4);
    for (const g of guides) assert.ok(guide().includes(`(${g})`), g);
  });

  test('it says which files never to read, and names each file the search ignores', () => {
    assert.match(guide(), /never to read/i);
    for (const entry of ignored()) assert.ok(guide().includes(`\`${entry}\``), entry);
  });

  test('CONTRIBUTING.md lists this test and mentions the cheap commands', () => {
    const c = read('CONTRIBUTING.md');
    assert.match(c, /^- `test\/cheap-checks\.test\.js` — /m);
    for (const cmd of ['test:ai', 'test:changed', 'AGENTS.md']) assert.ok(c.includes(cmd), cmd);
  });
});

/** The paths .ignore lists, comments and blank lines left out. */
function ignored() {
  return read('.ignore')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

describe('generated and bulky files kept out of code searches', () => {
  test('.ignore holds the built checker, the lock files, the build output and the generated records', () => {
    const entries = ignored();
    for (const e of [
      'packages/graph-spec/dist/',
      'package-lock.json',
      'python/graph_spec/uv.lock',
      'dist/',
      'main.js',
      'test/tests-first.json',
      'THIRD_PARTY_NOTICES.md',
      'licences/texts/',
      'test-vault/.obsidian/',
    ])
      assert.ok(entries.includes(e), e);
  });

  test('every entry that is a file in the repository exists, so none is a typing slip', () => {
    for (const e of ignored().filter((x) => !x.endsWith('/') && x !== 'main.js')) assert.ok(exists(e), e);
  });

  test('a code search no longer lists the lock file or the record, and still lists the code', () => {
    const r = run('rg', ['--files'], path('.'));
    if (r.error) return; // ripgrep is not installed here; the entries above are still checked
    const files = r.stdout.split('\n');
    for (const f of ['package-lock.json', 'python/graph_spec/uv.lock', 'test/tests-first.json'])
      assert.ok(!files.includes(f), f);
    assert.ok(files.includes('package.json'));
    assert.ok(files.includes('packages/core/src/index.ts'));
  });
});
