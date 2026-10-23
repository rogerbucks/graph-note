// The trail of a massive graph's exploring (editor spec §53, scale_explore_trail): explore-trail.ts.
// - Each search, expand and filter adds a step.
// - Back and forward give back the exact earlier picture.
// - A new step after going back drops the steps ahead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIL_MOST, Trail } from '../src/explore-trail.ts';

/** A trail of the overview, a search flown to, a thing grown and a filter: each a picture, kept as it was. */
function explored() {
  const trail = new Trail();
  const pictures = [
    { what: 'overview', camera: { x: 0, y: 0, scale: 1 } },
    { what: 'flew to the needle', camera: { x: 40, y: 80, scale: 6 } },
    { what: 'grew the needle', camera: { x: 30, y: 70, scale: 4 } },
    { what: 'kept the done things', camera: { x: 0, y: 0, scale: 1.7 } },
  ];
  for (const p of pictures) trail.push(p);
  return { trail, pictures };
}

test('each step is added, and the trail is at the newest', () => {
  const { trail, pictures } = explored();
  assert.equal(trail.length, 4);
  assert.strictEqual(trail.now, pictures[3]);
  assert.equal(trail.canBack, true);
  assert.equal(trail.canForward, false);
  assert.equal(new Trail().now, undefined, 'an empty trail is at no step');
});

test('back and forward give back the exact earlier pictures, and stop at each end', () => {
  const { trail, pictures } = explored();
  assert.strictEqual(trail.back(), pictures[2]);
  assert.strictEqual(trail.back(), pictures[1]);
  assert.strictEqual(trail.back(), pictures[0]);
  assert.equal(trail.back(), undefined, 'nothing before the first');
  assert.strictEqual(trail.now, pictures[0]);
  assert.strictEqual(trail.forward(), pictures[1]);
  assert.strictEqual(trail.forward(), pictures[2]);
  assert.strictEqual(trail.forward(), pictures[3]);
  assert.equal(trail.forward(), undefined, 'nothing after the last');
});

test('a new step after going back drops the steps ahead', () => {
  const { trail, pictures } = explored();
  trail.back();
  trail.back();
  const other = { what: 'flew to another thing', camera: { x: 9, y: 9, scale: 5 } };
  trail.push(other);
  assert.equal(trail.length, 3);
  assert.strictEqual(trail.now, other);
  assert.equal(trail.canForward, false, 'the grown and filtered pictures are gone');
  assert.strictEqual(trail.back(), pictures[1]);
});

test('a full trail lets its oldest steps go', () => {
  const trail = new Trail(3);
  for (const n of [1, 2, 3, 4, 5]) trail.push(n);
  assert.equal(trail.length, 3);
  assert.equal(trail.back(), 4);
  assert.equal(trail.back(), 3);
  assert.equal(trail.back(), undefined, '1 and 2 went first');
  assert.ok(TRAIL_MOST >= 20, 'the usual trail keeps a good many steps');
});
