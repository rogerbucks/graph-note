// How the 3D view is moved (editor spec §53, scale_space_controls): space-controls.ts. Each move has a key, and two
// fingers move and pinch. Moving across the floor keeps the camera's turn, tilt and distance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_STEP, ZOOM_STEP, keyMove, panBy, twoFingers } from '../src/space-controls.ts';
import { projectPoint, spaceMatrix } from '../src/space-view.ts';

const ORBIT = { target: [0, 0, 0], distance: 1000, turn: -Math.PI / 2, tilt: 0.9 };

test('a drag across moves the view over the floor, and what was under the pointer follows it', () => {
  const moved = panBy(ORBIT, 100, 0, 600);
  assert.equal(moved.distance, ORBIT.distance);
  assert.equal(moved.turn, ORBIT.turn);
  assert.equal(moved.tilt, ORBIT.tilt);
  assert.equal(moved.target[2], 0, 'it stays on the floor');
  // the point the camera looked at is now 100 pixels to the right of the middle, as the drag went
  const at = projectPoint(spaceMatrix(moved, 1, 2000), [0, 0, 0], 600, 600);
  assert.ok(Math.abs(at.x - 400) < 2, `x ${at.x}`);
  assert.ok(Math.abs(at.y - 300) < 2, `y ${at.y}`);
});

test('a drag down brings the drawing nearer: the old middle goes down the screen', () => {
  const moved = panBy(ORBIT, 0, 80, 600);
  const at = projectPoint(spaceMatrix(moved, 1, 2000), [0, 0, 0], 600, 600);
  assert.ok(at.y > 300 + 40, `y ${at.y}`);
  assert.ok(Math.abs(at.x - 300) < 2);
});

test('every move has a key: arrows turn, Shift and arrows move, + and - zoom, Home resets', () => {
  assert.deepEqual(keyMove('ArrowLeft', false), { turn: [-KEY_STEP, 0] });
  assert.deepEqual(keyMove('ArrowUp', false), { turn: [0, -KEY_STEP] });
  assert.deepEqual(keyMove('ArrowRight', true), { pan: [-KEY_STEP, 0] });
  assert.deepEqual(keyMove('+', false), { zoom: ZOOM_STEP });
  assert.deepEqual(keyMove('-', false), { zoom: 1 / ZOOM_STEP });
  assert.deepEqual(keyMove('Home', false), { reset: true });
  assert.deepEqual(keyMove('0', false), { reset: true });
  assert.deepEqual(keyMove('?', true), { help: true });
  assert.deepEqual(keyMove('Escape', false), { back: true });
  assert.equal(keyMove('a', false), null);
});

test('two fingers moving together move the view; spreading apart zooms in', () => {
  const was = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  assert.deepEqual(
    twoFingers(was, [
      { x: 110, y: 120 },
      { x: 210, y: 120 },
    ]),
    { dx: 10, dy: 20, zoom: 1 },
  );
  assert.equal(
    twoFingers(was, [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]).zoom,
    2,
  );
});
