// The replay of a commit (tests-first.test.js) when something at the commit's own code cannot be trusted: a commit that
// cannot be replayed at all, and a record updated over what it holds (a new test failing at its own commit is
// tests-first-failing.test.js). Split from tests-first.test.js on 11 Oct 2026, so the suite runs it beside the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { record, update } from '../scripts/tests-first.mjs';
import { RECORDS, readRecords } from '../scripts/tests-first-records.mjs';
import { repository } from './repository/scratch-repository.js';

const JS_TEST = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

describe('a run at the commit’s own code that cannot be trusted fails the record', () => {
  // review of #44: a commit whose replay threw was logged in one line among hundreds, and the record written without it
  test('a commit that cannot be replayed at all fails the record, naming the commit', () => {
    const r = repository([
      { 'README.md': 'x\n' },
      {
        'packages/p/package.json': 'not JSON\n',
        'test/one.test.js': "import { test } from 'node:test';\ntest('one', () => {});\n",
      },
    ]);
    try {
      // installed packages make the checkout read each package's manifest, and this one cannot be read
      mkdirSync(join(r.dir, 'node_modules', 'installed'), { recursive: true });
      assert.throws(
        () => record(r.dir),
        (e) => {
          assert.match(e.message, new RegExp(`${r.ids[1].slice(0, 7)}: could not be replayed`));
          return true;
        },
      );
    } finally {
      // the checkout that failed half-way is left behind; take it away with the repository
      const left = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: r.dir, encoding: 'utf8' })
        .split('\n')
        .filter((l) => l.startsWith('worktree ') && l.includes('tests-first-wt-'))
        .map((l) => l.slice('worktree '.length));
      for (const dir of left) rmSync(dir, { recursive: true, force: true });
      r.done();
    }
  });
});

describe('keeping the record', () => {
  test('updating the record replays only the commits it does not hold, and gives what recording them all would', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': JS_TEST("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      const whole = record(r.dir);
      execFileSync('git', ['reset', '-q', '--hard', r.ids[1]], { cwd: r.dir });
      record(r.dir);
      assert.deepEqual([...readRecords(r.dir).commits.keys()], [r.ids[1]]);
      const held = join(r.dir, RECORDS, `${r.ids[1]}.json`);
      // a record that says what no replay would: kept as it is, as the commit it records is not replayed again
      writeFileSync(held, readFileSync(held, 'utf8').replace('"files"', '"untouched": true,\n  "files"'));
      execFileSync('git', ['reset', '-q', '--hard', r.ids[2]], { cwd: r.dir });
      assert.deepEqual(update(r.dir), whole);
      assert.match(readFileSync(held, 'utf8'), /"untouched": true/, 'the commit held already is not replayed');
    } finally {
      r.done();
    }
  });
});
