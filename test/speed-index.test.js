// How fast the machine is, the one measure the quality metrics and the speed tests scale by (spec §12, quality_ratchet):
// one fixed piece of plain work, the least of seven runs; a budget the spec states for a desktop held on another machine
// to that budget times how much slower the work runs there; and, for the tests, timed by processor time, which a wait
// does not add to.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_SPEED_INDEX,
  onThisMachine,
  plainWork,
  processorSpeedIndex,
  processorTime,
  speedIndex,
} from '../scripts/speed-index.mjs';
import { read, readJSON } from './repository/repo.js';

describe('the speed index', () => {
  test('is one fixed piece of plain work, the one the quality metrics measure, so it compares across machines and days', () => {
    assert.equal(plainWork(), 743237952);
    const metrics = read('scripts/quality-metrics.mjs');
    assert.match(metrics, /import \{ speedIndex \} from '\.\/speed-index\.mjs';/);
    assert.match(metrics, /speed_index: speedIndex\(\)/);
    assert.doesNotMatch(metrics, /Math\.imul/, 'no second copy of the work');
  });

  test('is the least of seven runs, by the clock it is given, to a hundredth of a millisecond', () => {
    const runs = [5.123, 4.004, 6, 4.5, 7, 4.0012, 9];
    const ticks = runs.flatMap((ms, k) => [100 * k, 100 * k + ms]);
    let calls = 0;
    assert.equal(
      speedIndex(() => ticks[calls++]),
      4,
    );
    assert.equal(calls, 14, 'each run timed from its start to its end');
  });

  test('of the desktop is the one the quality baseline measured on it, while the baseline is the desktop’s', () => {
    const baseline = readJSON('quality/baseline.json');
    if (baseline.machine.os === 'darwin') assert.equal(DESKTOP_SPEED_INDEX, baseline.metrics.speed_index);
    assert.ok(DESKTOP_SPEED_INDEX > 0);
  });
});

describe('a budget the spec states for a desktop', () => {
  test('is scaled by this machine’s speed index against the desktop’s: twice as slow, twice the budget', () => {
    assert.equal(onThisMachine(500, DESKTOP_SPEED_INDEX), 500);
    assert.equal(onThisMachine(500, DESKTOP_SPEED_INDEX * 2), 1000);
    assert.equal(onThisMachine(500, DESKTOP_SPEED_INDEX / 2), 250);
  });

  test('by default by this process’s own index in processor time, measured once and kept', () => {
    const index = processorSpeedIndex();
    assert.ok(index > 0);
    assert.equal(processorSpeedIndex(), index);
    assert.equal(onThisMachine(1000), onThisMachine(1000, index));
  });

  test('processor time does not count a wait, so a machine busy with something else does not slow the index', () => {
    const before = processorTime();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    assert.ok(processorTime() - before < 150, `${(processorTime() - before).toFixed(0)} ms over a 300 ms wait`);
    const t = processorTime();
    plainWork();
    assert.ok(processorTime() > t, 'the work itself is counted');
  });
});
