// An image's first frame drawn on a canvas (editor spec §18, §11). Never for an image whose frame is over 50 million
// pixels: that would hold the page and the device's memory (review of #443). Null, never a rejection, wherever it
// cannot be drawn. The browser's Image is stood in for: it says its size as a decoded image would, and records whether a
// canvas was asked for.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { STILL_PIXELS, stillFrame } from '../../core/src/display/images/still-frame.ts';

/** Stands in the page's Image and document for one call: an image of `width` by `height`, and the canvases asked for. */
async function framed(width, height) {
  const canvases = [];
  const saved = { Image: globalThis.Image, activeDocument: globalThis.activeDocument };
  globalThis.Image = class {
    set src(_url) {
      this.naturalWidth = width;
      this.naturalHeight = height;
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.activeDocument = {
    body: {
      createEl: () => {
        const c = { remove() {}, getContext: () => null };
        canvases.push(c);
        return c;
      },
    },
  };
  try {
    return { png: await stillFrame(new Uint8Array([1, 2, 3]), 'image/gif'), canvases };
  } finally {
    Object.assign(globalThis, saved);
  }
}

describe("an image's first frame", () => {
  // proves: animated_image_limited
  test('is never drawn for a frame over 50 million pixels: no canvas is made', async () => {
    assert.equal(STILL_PIXELS, 50_000_000);
    const { png, canvases } = await framed(10_000, 5_001);
    assert.equal(png, null);
    assert.equal(canvases.length, 0);
  });

  // proves: animated_image_limited
  test('one within it is put on a canvas; where the canvas cannot draw, it is null, never a rejection', async () => {
    const { png, canvases } = await framed(100, 80);
    assert.equal(canvases.length, 1);
    assert.equal(png, null);
  });
});
