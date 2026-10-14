// How an animated image starts and when it may play (editor spec §18, §11): within the stated limits of size and count
// it moves, unless the system asks for reduced motion, when it starts still until played (motion_reduced_respected);
// past a limit it is shown as its first frame, saying why, and playing it is refused with the same reason
// (animated_image_limited); and only so many move at once in one drawing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_LIMITS, LIMITS_SAID, playRefusal, startOf } from '../src/image-limits.ts';

const moving = (o = {}) => ({ format: 'gif', animated: true, frames: 12, width: 40, height: 30, ...o });
const MB = 1024 * 1024;

describe('the limits are stated', () => {
  // proves: animated_image_limited
  test('in one sentence: size on disk, size of a frame, frames, and how many move at once', () => {
    assert.deepEqual(IMAGE_LIMITS, { bytes: 5 * MB, pixels: 2_000_000, frames: 500, moving: 6 });
    assert.equal(
      LIMITS_SAID,
      'An animated image moves when it is at most 5 MB, at most 2,000,000 pixels a frame and at most 500 frames, and at most 6 move at once in one drawing.',
    );
  });
});

describe('an animated image within the limits', () => {
  // proves: animated_image_shown
  test('moves from the start', () => {
    assert.deepEqual(startOf({ facts: moving(), size: 2000, reduced: false, moving: 0 }), { moving: true });
  });

  // proves: motion_reduced_respected
  test('starts still under reduced motion, its first frame, and plays when the user presses Play', () => {
    const start = startOf({ facts: moving(), size: 2000, reduced: true, moving: 0 });
    assert.deepEqual(start, {
      moving: false,
      playable: true,
      why: 'Still, as the system asks for reduced motion. Press Play to move it.',
    });
    assert.equal(playRefusal(start, 0), null, 'the user may play it');
  });

  // proves: animated_image_limited
  test('past the count moving at once, starts still, and plays once another is paused', () => {
    const start = startOf({ facts: moving(), size: 2000, reduced: false, moving: 6 });
    assert.equal(start.moving, false);
    assert.equal(
      start.why,
      'Shown as its first frame: 6 animated images are already moving here. Pause one of them to play this one.',
    );
    assert.equal(playRefusal(start, 6), start.why);
    assert.equal(playRefusal(start, 5), null);
  });
});

describe('an animated image past a limit', () => {
  // proves: animated_image_limited
  test('larger on disk than the limit: its first frame, saying why, and Play refused', () => {
    const start = startOf({ facts: moving(), size: 12.4 * MB, reduced: false, moving: 0 });
    assert.deepEqual(start, {
      moving: false,
      playable: false,
      why: 'Shown as its first frame: it is 12.4 MB, over the 5 MB an animated image may be.',
    });
    assert.equal(playRefusal(start, 0), start.why);
  });

  // proves: animated_image_limited
  test('too large a frame, or too many frames: its first frame, saying which', () => {
    assert.equal(
      startOf({ facts: moving({ width: 2000, height: 1500 }), size: 1000, reduced: false, moving: 0 }).why,
      'Shown as its first frame: each frame is 2000 by 1500 pixels, over the 2,000,000 pixels a frame an animated image may have.',
    );
    assert.equal(
      startOf({ facts: moving({ frames: 900 }), size: 1000, reduced: false, moving: 0 }).why,
      'Shown as its first frame: it has 900 frames, over the 500 an animated image may have.',
    );
  });

  // proves: animated_image_limited
  test('one not read, as it is over the size limit, is still from the start whatever it is', () => {
    const start = startOf({ facts: null, size: 6 * MB, reduced: true, moving: 0 });
    assert.equal(start.moving, false);
    assert.equal(start.playable, false);
    assert.match(start.why, /it is 6 MB, over the 5 MB/);
  });
});

describe('an image that does not move', () => {
  // proves: animated_image_shown
  test('is shown as it is: neither moving nor held, with nothing to say', () => {
    assert.deepEqual(
      startOf({ facts: moving({ animated: false, frames: 1 }), size: 9 * MB, reduced: true, moving: 6 }),
      {
        moving: false,
        playable: false,
        why: '',
        plain: true,
      },
    );
  });
});
