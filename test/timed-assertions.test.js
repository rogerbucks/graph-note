// A test asserts the work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026): no JavaScript test, nor
// its test support, asserts a span of elapsed time, read from performance.now(), Date.now(), process.hrtime(),
// process.cpuUsage() or process.resourceUsage(). Proved on the repository's own tests, on the speed tests as they stood
// before the benchmarks took their claims, and on examples planted for the purpose; and what is allowed is shown
// allowed: a polling deadline, mock timers, a time compared with a file's, a clock handed to the code tested.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { findTimedAssertions, testFiles } from '../scripts/timed-assertions.mjs';
import { read, ROOT } from './repository/repo.js';

const IMPORTS = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n";
/** The lines at which assertions on elapsed time are found in one planted test file. */
const linesIn = (body, others = {}) =>
  findTimedAssertions({ 'pkg/test/planted.test.js': IMPORTS + body, ...others }).map((f) => f.line - 2);

describe('the repository', () => {
  test('no test asserts elapsed time', () => {
    const files = testFiles();
    assert.ok(files.length > 100, `the control: ${files.length} test files read`);
    assert.ok(files.includes('packages/obsidian/test/host/load-plugin.js'), 'test support is read too');
    const found = findTimedAssertions(Object.fromEntries(files.map((f) => [f, read(f)])));
    assert.deepEqual(found, [], found.map((f) => `${f.file}:${f.line} ${f.text}`).join('\n'));
  });

  test('the command passes on the repository as committed, and says how many files it read', () => {
    const r = spawnSync(process.execPath, ['scripts/timed-assertions.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^timed assertions: none in \d+ test files$/m);
  });
});

describe('it catches', () => {
  test('the speed tests as they stood before the benchmarks: a helper of processor time imported from test support', () => {
    const helper = `export function used() {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}
export function timed(step) {
  const t = used();
  const out = step();
  return { ms: used() - t, out };
}`;
    const render = `import { used } from './processor-time.js';
test('a graph of 50 things is read and drawn in under half a second', () => {
  let ms = Infinity;
  for (let k = 0; k < 3; k++) {
    const t = used();
    draw();
    ms = Math.min(ms, used() - t);
  }
  assert.ok(ms < 500, \`\${ms.toFixed(0)} ms\`);
});
import { timed } from './processor-time.js';
test('naming is linear', () => {
  let whole = Infinity;
  whole = Math.min(whole, timed(() => naming(5000)).ms);
  assert.ok(whole < 3 * quarters);
});`;
    assert.deepEqual(linesIn(render, { 'pkg/test/processor-time.js': helper }), [9, 15]);
  });

  test('a span read directly, kept in a variable, carried by an object, from hrtime handed a reading, or as a bigint', () => {
    const body = `test('t', () => {
  const t = performance.now();
  work();
  assert.ok(performance.now() - t < 500);
  const took = Date.now() - t;
  assert.equal(took > 10, false);
  const run = { ms: took };
  assert.ok(run.ms < 9);
  const start = process.hrtime();
  assert.ok(process.hrtime(start)[0] < 1);
  const b = process.hrtime.bigint();
  expect(process.hrtime.bigint() - b).toBeLessThan(5n);
});`;
    assert.deepEqual(linesIn(body), [4, 6, 8, 10, 12]);
  });

  test('a helper of the test’s own, and a throw or an assertion only under a condition on a span', () => {
    const body = `const clock = () => process.cpuUsage().user;
function elapsed(since) { return clock() - since; }
test('t', () => {
  const since = clock();
  if (elapsed(since) > 500) throw new Error('too slow');
  if (elapsed(since) > 500) assert.fail('too slow');
  assert.ok(elapsed(since) < 500);
});`;
    assert.deepEqual(linesIn(body), [5, 6, 7]);
  });
});

describe('it allows', () => {
  test('a deadline for polling: a condition on a span in a loop that awaits, giving up on waiting', () => {
    const body = `export async function until(ready, ms = 3000) {
  const t0 = Date.now();
  while (!ready()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await wait(10);
  }
}`;
    assert.deepEqual(linesIn(body), []);
  });

  test('a clock reading compared with a file’s time, which is not a span', () => {
    const body = `test('t', async () => {
  const started = Date.now();
  build();
  assert.ok(statSync(main).mtimeMs >= started - 1000, 'main.js was written');
});`;
    assert.deepEqual(linesIn(body), []);
  });

  test('Date.now() under mock timers with Date mocked, which take no real time; performance.now() is not mocked', () => {
    const mocked = `test('t', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const a = Date.now();
  t.mock.timers.tick(100);
  assert.equal(Date.now() - a, 100);
});`;
    assert.deepEqual(linesIn(mocked), []);
    assert.deepEqual(linesIn(mocked.replace(/Date\.now\(\)/g, 'performance.now()')), [5]);
  });

  test('a clock handed to the code tested, and a helper of the subject’s, which is never taken for the test’s', () => {
    const body = `import { speedIndex } from '../src/speed.js';
test('t', () => {
  let calls = 0;
  assert.equal(speedIndex(() => [0, 4][calls++]), 4);
  setTimeout(() => {}, 10);
});`;
    const subject =
      'export const speedIndex = (clock = () => performance.now()) => { const t = clock(); return clock() - t; };';
    assert.deepEqual(linesIn(body, { 'pkg/src/speed.js': subject }), []);
    // a helper that gives a span: not followed into the subject, followed into test support
    const span = `import { elapsedSince } from '../src/elapsed.js';
test('t', () => {
  const t0 = performance.now();
  assert.ok(elapsedSince(t0) < 5);
});`;
    const helper = 'export const elapsedSince = (t) => performance.now() - t;';
    assert.deepEqual(linesIn(span, { 'pkg/src/elapsed.js': helper }), []);
    assert.deepEqual(linesIn(span.replace('../src/', './'), { 'pkg/test/elapsed.js': helper }), [4]);
  });

  test('names alike in different scopes are told apart', () => {
    const body = `test('a', () => {
  const clock = performance.now();
  const ms = performance.now() - clock;
  void ms;
});
test('b', () => {
  const clock = { setTimeout };
  const ms = 3;
  assert.equal(ms, 3);
  assert.ok(clock);
});`;
    assert.deepEqual(linesIn(body), []);
  });
});
