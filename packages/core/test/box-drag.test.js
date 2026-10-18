// Moving a box by dragging it (editor spec §6, nudge_preview, drag_moves_box): where a box let go would land, read from
// the boxes as drawn, and the nudge that place writes — beside the box it is dropped by, across the drawing's ranks, or
// before or after it, along them — said in words before it is let go. Away from every box, or where the same nudge is
// already written, it lands nowhere and writes nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { landingFor, landingSaid } from '../src/box-drag.ts';

// three boxes laid out left to right (LR): ann, then bob, with cy below bob
const BOXES = [
  { key: 'ann', left: 0, top: 0, right: 60, bottom: 30 },
  { key: 'bob', left: 120, top: 0, right: 180, bottom: 30 },
  { key: 'cy', left: 120, top: 80, right: 180, bottom: 110 },
];
const text = (k) => ({ ann: 'Ann', bob: 'Bob', cy: 'Cy' })[k];

describe('where a dragged box lands', () => {
  // proves: nudge_preview, drag_moves_box
  test('dropped above or below a box, across the ranks, it goes beside it', () => {
    const l = landingFor('ann', { x: 150, y: 50 }, BOXES, 'LR');
    assert.deepEqual(l, { side: 'beside', other: 'bob', nudge: { word: 'beside', thing: 'ann', other: 'bob' } });
    assert.equal(landingSaid(l, 'ann', text), 'Put Ann beside Bob');
  });

  // proves: nudge_preview, drag_moves_box
  test('dropped to one side of a box, along the ranks, it goes before or after it', () => {
    const before = landingFor('cy', { x: 5, y: 15 }, BOXES, 'LR');
    assert.deepEqual(before, { side: 'before', other: 'ann', nudge: { word: 'before', thing: 'cy', other: 'ann' } });
    assert.equal(landingSaid(before, 'cy', text), 'Put Cy before Ann');
    const after = landingFor('ann', { x: 200, y: 95 }, BOXES, 'LR');
    assert.deepEqual(after, { side: 'after', other: 'cy', nudge: { word: 'before', thing: 'cy', other: 'ann' } });
    assert.equal(landingSaid(after, 'ann', text), 'Put Ann after Cy');
  });

  // proves: drag_moves_box
  test('in a drawing laid out downwards (TB), the ranks run down, so beside is to the side', () => {
    const down = [
      { key: 'ann', left: 0, top: 0, right: 60, bottom: 30 },
      { key: 'bob', left: 0, top: 100, right: 60, bottom: 130 },
    ];
    assert.equal(landingFor('ann', { x: 80, y: 115 }, down, 'TB').side, 'beside');
    assert.equal(landingFor('ann', { x: 30, y: 140 }, down, 'TB').side, 'after');
    assert.equal(landingFor('bob', { x: 30, y: -5 }, down, 'TB').side, 'before');
  });

  // proves: drag_moves_box
  test('away from every other box, it lands nowhere', () => {
    assert.equal(landingFor('ann', { x: 400, y: 400 }, BOXES, 'LR'), null);
    assert.equal(landingFor('ann', { x: 30, y: 15 }, [BOXES[0]], 'LR'), null, 'its own box is not a place');
  });

  // proves: drag_moves_box
  test('where the same nudge is already written, it lands nowhere, so nothing is written twice', () => {
    const written = [{ word: 'beside', thing: 'bob', other: 'ann' }];
    assert.equal(landingFor('ann', { x: 150, y: 50 }, BOXES, 'LR', written), null, 'beside either way round');
    const before = [{ word: 'before', thing: 'cy', other: 'ann' }];
    assert.equal(landingFor('cy', { x: 5, y: 15 }, BOXES, 'LR', before), null);
    assert.ok(landingFor('ann', { x: 200, y: 15 }, BOXES, 'LR', before), 'another place still lands');
  });
});
