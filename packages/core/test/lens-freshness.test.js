// How often and how lately each lens is run (editor spec §33, lens_freshness). A lens unopened for months shows
// dormant with its certainty unchanged, and the recent view lists the five most used, worked out when asked.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { DORMANT_DAYS, findLenses, lensFreshness, recentLenses } from '../src/lens-freshness.ts';
import { lensLibrary } from '../src/lens-library.ts';

const NOW = '2026-10-24';
const runs = [
  { lens: 'a', at: '2026-10-20' },
  { lens: 'a', at: '2026-10-21' },
  { lens: 'a', at: '2026-10-22' },
  { lens: 'b', at: '2026-10-23' },
  { lens: 'b', at: '2026-10-22' },
  { lens: 'c', at: '2026-10-01' },
  { lens: 'd', at: '2026-09-30' },
  { lens: 'e', at: '2026-09-29' },
  { lens: 'f', at: '2026-09-28' },
  { lens: 'old', at: '2026-05-01' },
];

describe('lens_freshness', () => {
  test('a lens unopened for months shows dormant, with its certainty unchanged', () => {
    const graph = new gs.Graph(
      new Map([['old', [new Set(['Lens']), { id: 'old', name: 'Old', query: 'Task', likelihood: 'likely' }]]]),
      [],
    );
    const lens = lensLibrary(graph).find((l) => l.id === 'old');
    const fresh = lensFreshness('old', runs, NOW);
    assert.equal(fresh.dormant, true);
    assert.equal(fresh.last, '2026-05-01');
    assert.equal(lens?.likelihood, 'likely');
    assert.ok(!('likelihood' in fresh));
    assert.equal(lensFreshness('a', runs, NOW).dormant, false);
    assert.equal(lensFreshness('never', runs, NOW).dormant, true);
    assert.equal(DORMANT_DAYS, 90);
  });

  test('the recent view lists the five most used, worked out when asked', () => {
    assert.deepEqual(
      recentLenses(runs, NOW).map((r) => r.lens),
      ['a', 'b', 'c', 'd', 'e'],
    );
    const more = [
      ...runs,
      { lens: 'f', at: '2026-10-24' },
      { lens: 'f', at: '2026-10-24' },
      { lens: 'f', at: '2026-10-24' },
    ];
    assert.deepEqual(
      recentLenses(more, NOW).map((r) => r.lens),
      ['f', 'a', 'b', 'c', 'd'],
    );
  });

  test('lenses are found by topic, and by how often or how recently they ran', () => {
    const library = lensLibrary(null);
    const decisions = findLenses(library, [], NOW, { topic: 'Decision' });
    assert.deepEqual(
      decisions.map((x) => x.lens.id),
      ['ready_decisions'],
    );
    const used = [
      { lens: 'ready_risks', at: '2026-10-01' },
      { lens: 'ready_risks', at: '2026-10-02' },
      { lens: 'ready_decisions', at: '2026-10-23' },
    ];
    assert.equal(findLenses(library, used, NOW, { by: 'often' })[0].lens.id, 'ready_risks');
    assert.equal(findLenses(library, used, NOW, { by: 'recent' })[0].lens.id, 'ready_decisions');
  });
});
