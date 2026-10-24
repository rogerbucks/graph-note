// A process transition that changes how deep the view goes (editor spec §32, phase_shifts_altitude). Walking a
// transition with an altitude mapping changes the view's depth, and removing the part leaves transitions working.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { transitionAltitude, walkTransition } from '../src/phase-altitude.ts';

const toReview = { from: 'draft', to: 'review', props: { event: 'submit', altitude: 3 } };
const toDone = { from: 'review', to: 'done', props: { event: 'approve' } };

describe('phase_shifts_altitude', () => {
  test("walking a transition with an altitude mapping changes the view's depth", () => {
    const view = walkTransition({ state: 'draft', level: 0 }, toReview);
    assert.deepEqual(view, { state: 'review', level: 3 });
    assert.deepEqual(walkTransition(view, toDone), { state: 'done', level: 3 });
  });

  test('removing the part leaves transitions working, at the same depth', () => {
    assert.deepEqual(walkTransition({ state: 'draft', level: 0 }, toReview, null), { state: 'review', level: 0 });
    const halve = { levelFor: (_t, level) => Math.floor(level / 2) };
    assert.deepEqual(walkTransition({ state: 'draft', level: 4 }, toReview, halve), { state: 'review', level: 2 });
    assert.equal(transitionAltitude.levelFor(toDone, 1), null);
    assert.throws(() => walkTransition({ state: 'done', level: 0 }, toReview), /starts at draft/);
  });
});
