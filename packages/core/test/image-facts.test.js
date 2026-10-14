// What an image's own bytes say of it (editor spec §18, animated_image_shown, animated_image_limited): its format, whether
// it moves, how many frames it has and its size, read from the header and chunks each format writes, never by decoding
// it and never by its name; and an image that cannot be read said to be none of them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { imageFacts } from '../src/image-facts.ts';
import { gif, jpeg, png, svg, webp } from './image-bytes.js';

describe('an animated image is known by its bytes', () => {
  // proves: animated_image_shown
  test('a GIF of several frames moves; one of a single frame is still', () => {
    assert.deepEqual(imageFacts(gif({ width: 30, height: 20, frames: 12 })), {
      format: 'gif',
      animated: true,
      frames: 12,
      width: 30,
      height: 20,
    });
    assert.deepEqual(imageFacts(gif({ frames: 1 })), {
      format: 'gif',
      animated: false,
      frames: 1,
      width: 2,
      height: 2,
    });
  });

  // proves: animated_image_shown
  test('a PNG with an animation control chunk is an APNG of that many frames; a plain PNG is still', () => {
    assert.deepEqual(imageFacts(png({ width: 64, height: 48, frames: 8 })), {
      format: 'png',
      animated: true,
      frames: 8,
      width: 64,
      height: 48,
    });
    assert.deepEqual(imageFacts(png({ width: 5, height: 7 })), {
      format: 'png',
      animated: false,
      frames: 1,
      width: 5,
      height: 7,
    });
  });

  // proves: animated_image_shown
  test('a WebP flagged as animated counts its frames; a lossless one is still', () => {
    assert.deepEqual(imageFacts(webp({ width: 100, height: 80, frames: 3 })), {
      format: 'webp',
      animated: true,
      frames: 3,
      width: 100,
      height: 80,
    });
    assert.deepEqual(imageFacts(webp({ width: 9, height: 4 })), {
      format: 'webp',
      animated: false,
      frames: 1,
      width: 9,
      height: 4,
    });
  });

  // proves: animated_image_shown
  test('an SVG that animates moves, with no frames to count; one with no animation is still', () => {
    assert.deepEqual(imageFacts(svg({ moves: true })), {
      format: 'svg',
      animated: true,
      frames: 0,
      width: 40,
      height: 30,
    });
    assert.deepEqual(imageFacts(svg()), { format: 'svg', animated: false, frames: 1, width: 40, height: 30 });
    const css = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@keyframes spin {}</style></svg>',
    );
    assert.equal(imageFacts(css).animated, true, 'a CSS animation moves it too');
  });

  // proves: animated_image_shown
  test('a JPEG never moves, and bytes no format writes are no image at all', () => {
    assert.equal(imageFacts(jpeg()).animated, false);
    assert.equal(imageFacts(jpeg()).format, 'jpeg');
    assert.deepEqual(imageFacts(new TextEncoder().encode('just some text')), {
      format: null,
      animated: false,
      frames: 0,
      width: 0,
      height: 0,
    });
    assert.equal(imageFacts(new Uint8Array(0)).format, null);
  });

  // proves: animated_image_limited
  test('a GIF cut short is read as far as it goes, never past its end', () => {
    const whole = gif({ frames: 5 });
    const cut = whole.slice(0, whole.length - 30);
    const facts = imageFacts(cut);
    assert.equal(facts.format, 'gif');
    assert.ok(facts.frames < 5, `${facts.frames} frames read of what is there`);
  });
});
