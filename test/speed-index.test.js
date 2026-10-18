// How fast the machine is: the one measure the quality metrics scale their timings by (spec §12, quality_ratchet). It
// is one fixed piece of plain work, the least of seven runs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plainWork, speedIndex } from '../scripts/speed-index.mjs';
import { read } from './repository/repo.js';

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
});
