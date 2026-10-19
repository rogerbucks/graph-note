// The plan stays true to the work (spec §41, waves_on_time). A wave left behind too long fails the build, unless
// requirements/waves.json says why. Pure: the real files are read, nothing is fetched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { overdueWaves } from '../scripts/waves-on-time.mjs';
import { waveStates } from '../scripts/wiki.mjs';
import { read } from './repository/repo.js';

const json = (rel) => JSON.parse(read(rel));
const today = new Date().toISOString().slice(0, 10);

describe('a wave behind its dates', () => {
  const workstreams = { A: { requirements: ['a'] } };
  const requirements = [{ id: 'a', status: 'open' }];
  const wave = (end, extra = {}) => ({ title: end, start: '2026-01-01', end, workstreams: ['A'], ...extra });
  const overdue = (waves, day) => overdueWaves(waveStates(waves, workstreams, requirements, day), day);

  test('is let be for one wave length after its end', () => {
    assert.deepEqual(overdue([wave('2026-01-10')], '2026-01-20'), []);
  });

  test('is named once it is behind for more than one wave length', () => {
    assert.deepEqual(
      overdue([wave('2026-01-10')], '2026-01-21').map((w) => w.title),
      ['2026-01-10'],
    );
  });

  test('is let be when waves.json gives its reason', () => {
    assert.deepEqual(overdue([wave('2026-01-10', { late_reason: 'Waiting for the store review.' })], '2026-03-01'), []);
  });

  test('is never named when all its work is proved', () => {
    const done = overdueWaves(
      waveStates([wave('2026-01-10')], workstreams, [{ id: 'a', status: 'proved' }], '2026-03-01'),
      '2026-03-01',
    );
    assert.deepEqual(done, []);
  });
});

describe('the real plan', () => {
  test('has no wave behind for more than one wave length without a reason', () => {
    const { requirements } = readBoard(read(REQUIREMENTS));
    const states = waveStates(
      json('requirements/waves.json').waves,
      json('requirements/workstreams.json'),
      requirements,
      today,
    );
    const late = overdueWaves(states, today).map((w) => `${w.title} (ended ${w.end})`);
    assert.deepEqual(late, [], 'move its work into a later wave and shift the dates, or give its late_reason');
  });
});
