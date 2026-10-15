// No new fixed sleep in the tests (spec §12, quality_ratchet: flaky tests, 15 Oct 2026): a test waits for the state it
// asserts, never a number of milliseconds. Those already there are held, file by file, to an allowance that only goes
// down. Proved on the repository's own tests, and on sleeps planted for the purpose; and what is allowed is shown
// allowed: a poll in a loop, a sleep written in a string, a wait for a number handed in.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ALLOWANCE, compareAllowance, findFixedSleeps, tightened } from '../scripts/fixed-sleeps.mjs';
import { testFiles } from '../scripts/timed-assertions.mjs';
import { read, readJSON, ROOT } from './repository/repo.js';

/** The lines at which fixed sleeps are found in one planted test file. */
const linesIn = (body) => findFixedSleeps({ 'pkg/test/planted.test.js': body }).map((f) => f.line);

describe('the repository', () => {
  test('has no fixed sleep beyond its allowance, and the allowance is as low as the tests now need', () => {
    const files = testFiles();
    assert.ok(files.includes('packages/obsidian/test/block-editor-undo.test.js'), 'the control: the tests are read');
    const found = findFixedSleeps(Object.fromEntries(files.map((f) => [f, read(f)])));
    const differ = compareAllowance(found, readJSON(ALLOWANCE));
    assert.deepEqual(
      differ,
      [],
      differ.map((d) => `${d.file}: ${d.has}, allowed ${d.allowed}`).join('\n') +
        '\nwait with until() on the state asserted; a sleep taken out: node scripts/fixed-sleeps.mjs --tighten',
    );
  });

  test('the block editor’s Undo tests, which failed once under load, have no fixed sleep', () => {
    assert.equal(readJSON(ALLOWANCE)['packages/obsidian/test/block-editor-undo.test.js'], undefined);
  });

  test('the command passes on the repository as committed, and says how many it read', () => {
    const r = spawnSync(process.execPath, ['scripts/fixed-sleeps.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^fixed sleeps: \d+ in \d+ test files, as allowed$/m);
  });
});

describe('it catches', () => {
  test('a sleep by any of the usual names, or a promise resolved by a timer, of a fixed number of milliseconds', () => {
    const body = `test('t', async () => {
  click();
  await wait(20);
  await sleep(5);
  await delay(1_000);
  await setTimeout(50);
  await new Promise((r) => setTimeout(r, 10));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  const v = (await wait(20), state());
});`;
    assert.deepEqual(linesIn(body), [3, 4, 5, 6, 7, 8, 9]);
  });

  test('a sleep of a constant or arithmetic, among others awaited, or resolved from a callback of the timer', () => {
    const body = `const MS = 20, TWICE = MS * 2;
test('t', async () => {
  await wait(MS);
  await wait(TWICE);
  await wait(20 * 2);
  await Promise.all([work(), wait(20)]);
  await new Promise((r) => setTimeout(() => r(), 50));
  await new Promise((r) => { setTimeout(() => { r(); }, 50); });
});`;
    assert.deepEqual(linesIn(body), [3, 4, 5, 6, 7, 8]);
  });

  test('a sleep in a loop over cases, or in one that only counts: neither is a poll', () => {
    const body = `test('t', async () => {
  for (const note of [a, b]) {
    click(note);
    await wait(20);
  }
  for (let press = 0; press < 2; press++) {
    await wait(20);
  }
  for (const k in cases) await wait(5);
  let n = 0;
  while (n < 3) { n++; await wait(10); }
});`;
    assert.deepEqual(linesIn(body), [4, 7, 9, 11]);
  });

  test('a sleep in a helper the test calls, and in a callback', () => {
    const body = `async function drawn(el) {
  await draw(el);
  await wait(20);
}
test('t', async () => {
  vault.process = async (f, fn) => (await wait(40), process(f, fn));
});`;
    assert.deepEqual(linesIn(body), [3, 6]);
  });
});

describe('it allows', () => {
  test('a poll: a sleep inside a loop whose condition reads state, which gives up on waiting rather than standing for the work', () => {
    const body = `export async function until(ready, ms = 3000) {
  while (!ready()) await wait(10);
  for (let i = 0; i < 100 && !done(); i++) await sleep(100);
  do { await wait(5); } while (!ready());
  for (let waited = 0; waited < 3000 && alive(pid); waited += 50) await wait(50);
  while (pending) await wait(10);
}`;
    assert.deepEqual(linesIn(body), []);
  });

  test('a sleep written in a string, a wait for a number handed in, and a timer not awaited', () => {
    const body = `const planted = \`await wait(20);\`;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
test('t', async () => {
  await wait(ms);
  await new Promise((r) => setTimeout(r, later));
  setTimeout(go, 20);
  await until(() => done());
  await Promise.all([work(), go(() => wait(20))]);
});`;
    assert.deepEqual(linesIn(body), []);
  });
});

describe('the allowance', () => {
  const found = (file, n) => Array.from({ length: n }, (_, i) => ({ file, line: i + 1, text: 'await wait(20)' }));

  test('a file over its allowance, or with none, is named with each sleep', () => {
    const differ = compareAllowance([...found('a.test.js', 3), ...found('b.test.js', 1)], { 'a.test.js': 2 });
    assert.deepEqual(
      differ.map((d) => [d.file, d.has, d.allowed, d.over, d.sleeps.length]),
      [
        ['a.test.js', 3, 2, true, 3],
        ['b.test.js', 1, 0, true, 1],
      ],
    );
  });

  test('a file under its allowance is named too, so a sleep taken out stays out', () => {
    const differ = compareAllowance(found('a.test.js', 1), { 'a.test.js': 2, 'gone.test.js': 1 });
    assert.deepEqual(
      differ.map((d) => [d.file, d.has, d.allowed, d.over]),
      [
        ['a.test.js', 1, 2, false],
        ['gone.test.js', 0, 1, false],
      ],
    );
  });

  test('tightening lowers each allowance to what the file has, drops a file with none, and never raises one', () => {
    const now = [...found('a.test.js', 1), ...found('b.test.js', 5)];
    assert.deepEqual(tightened(now, { 'a.test.js': 2, 'b.test.js': 3, 'gone.test.js': 1 }), {
      'a.test.js': 1,
      'b.test.js': 3,
    });
  });
});
