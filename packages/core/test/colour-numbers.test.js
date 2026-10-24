// A colour as numbers, for a painter on the graphics chip (editor spec §53, scale_gpu_painters): colour-numbers.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FADED, rgbaOf, seeThrough } from '../src/colour-numbers.ts';

test('a colour in hex digits is four numbers from 0 to 1, opaque when it says nothing of how opaque', () => {
  assert.deepEqual(rgbaOf('#ff8000'), [1, 128 / 255, 0, 1]);
  assert.deepEqual(rgbaOf('#FF800080'), [1, 128 / 255, 0, 128 / 255]);
});

test('a colour as red, green and blue numbers is four numbers, with how opaque when given', () => {
  assert.deepEqual(rgbaOf('rgb(255, 0, 51)'), [1, 0, 0.2, 1]);
  assert.deepEqual(rgbaOf('rgba(0, 255, 0, 0.5)'), [0, 1, 0, 0.5]);
  assert.deepEqual(rgbaOf('rgb(0 0 255 / 0.25)'), [0, 0, 1, 0.25]);
});

test('anything else is clear, so a colour the canvas could not read is not painted', () => {
  for (const css of ['', 'red', 'var(--gn-text)', '#12345', 'rgb(1, 2)'])
    assert.deepEqual(rgbaOf(css), [0, 0, 0, 0], css);
});

test('a colour a theme mixes is read too: a canvas writes it back as color(srgb …)', () => {
  assert.deepEqual(rgbaOf('color(srgb 1 0.5 0)'), [1, 0.5, 0, 1]);
  assert.deepEqual(rgbaOf('color(srgb 0.2 0.4 0.6 / 0.5)'), [0.2, 0.4, 0.6, 0.5]);
});

// proves: focus_space
test('a colour faded for the 3D view keeps its red, green and blue, and is a part as opaque as it was', () => {
  assert.equal(seeThrough('rgb(255, 0, 51)', FADED), 'rgb(255 0 51 / 0.3)');
  assert.equal(seeThrough('rgba(0, 255, 0, 0.5)', 0.5), 'rgb(0 255 0 / 0.25)');
  assert.equal(seeThrough('color(srgb 1 0.5 0)', 1), 'rgb(255 128 0 / 1)');
  assert.deepEqual(
    rgbaOf(seeThrough('rgb(10, 20, 30)', FADED)),
    [10 / 255, 20 / 255, 30 / 255, 0.3],
    'read back as it is',
  );
});
