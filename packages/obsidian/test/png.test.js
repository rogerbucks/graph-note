// A PNG of an exported SVG (spec §16, export_png_sharp, big_export). It is drawn on a canvas of the size the core gives.
// The canvas is let go as soon as its PNG is made. So drawing page after page of a large image never holds more than one
// canvas's memory. The canvas, the image and the blob are stand-ins: what is proved is what the plugin does with them.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';

before(() => build());

/** A stand-in canvas that draws nothing, makes a PNG of `blob` (null: none), and keeps the sizes it was given. */
function fakeCanvas(blob) {
  return {
    width: 0,
    height: 0,
    sizes: [],
    remove() {},
    getContext() {
      return { drawImage: () => this.sizes.push([this.width, this.height]) };
    },
    toBlob(done) {
      setTimeout(() => done(blob), 0);
    },
  };
}

/** Runs `fn` with the plugin loaded, its canvases made by `make`, and an Image that loads whatever it is given. */
async function withCanvas(make, fn) {
  const env = await load({ files: {} });
  const saved = globalThis.Image;
  globalThis.Image = class {
    set src(_url) {
      setTimeout(() => this.onload?.(), 0);
    }
  };
  const createEl = env.doc.body.createEl.bind(env.doc.body);
  env.doc.body.createEl = (tag, ...rest) => (tag === 'canvas' ? make() : createEl(tag, ...rest));
  try {
    await fn(env);
  } finally {
    globalThis.Image = saved;
    env.uninstall();
  }
}

describe('the canvas a PNG is drawn on', () => {
  test('is drawn at the size given, then let go: made nothing wide and nothing high once its PNG is made', async () => {
    const canvas = fakeCanvas(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    await withCanvas(
      () => canvas,
      async (env) => {
        const bytes = await env.plugin.rasterise('<svg width="10" height="5"></svg>', {
          scale: 2,
          width: 20,
          height: 10,
        });
        assert.deepEqual([...bytes], [137, 80, 78, 71]);
        assert.deepEqual(canvas.sizes, [[20, 10]]);
        assert.deepEqual([canvas.width, canvas.height], [0, 0]);
      },
    );
  });

  test('is let go too when no PNG could be made of it, and the export is told why', async () => {
    const canvas = fakeCanvas(null);
    await withCanvas(
      () => canvas,
      async (env) => {
        await assert.rejects(
          env.plugin.rasterise('<svg width="10" height="5"></svg>', { scale: 2, width: 20, height: 10 }),
          /too large/,
        );
        assert.deepEqual([canvas.width, canvas.height], [0, 0]);
      },
    );
  });
});
