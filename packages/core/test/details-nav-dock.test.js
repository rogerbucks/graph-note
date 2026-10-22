// Where the details sheet sits and how big it is (editor spec §25, sheet_docked and sheet_resized), in the core.
// - The sheet sits at the bottom, the top or a side. Its size is a share of the visible screen, chosen with its resize
//   bar. It is never smaller than its bar and never so big that the chosen thing cannot be seen beside it.
// - What it covers is kept clear at any edge of the drawing's viewport, not only the foot. So the drawing pans into it
//   and the arrow to a selection out of sight points from the part left uncovered.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABOVE_SHEET,
  BESIDE_SHEET,
  SIDE_SHARE,
  pointerTo,
  sheetBounds,
  sheetLimit,
  sheetSpan,
  sideways,
} from '../src/details-nav.ts';
import { SHEET_DOCKS } from '@thoughtknot/core';
import { clampPan } from '../src/zoom-fit.ts';
import { Zoom } from '../src/zoom.ts';

describe('the sheet sits at the bottom, the top or either side', () => {
  test('it offers the four places, the bottom first, as the default', () => {
    assert.deepEqual([...SHEET_DOCKS], ['bottom', 'top', 'start', 'end']);
  });

  test('at a side it is sized across the width, at the top or bottom across the height', () => {
    assert.equal(sideways('start'), true);
    assert.equal(sideways('end'), true);
    assert.equal(sideways('bottom'), false);
    assert.equal(sideways('top'), false);
  });
});

describe('its size stays within bounds', () => {
  test('at the top or bottom it is never smaller than its bar, and leaves room above it for the chosen thing', () => {
    const { least, most } = sheetBounds('bottom', 800);
    assert.equal(least, 52);
    assert.equal(most, 800 - ABOVE_SHEET);
    assert.equal(sheetSpan('top', 0.01, 800), 52);
    assert.equal(sheetSpan('bottom', 0.99, 800), 800 - ABOVE_SHEET);
  });

  test('at a side it leaves a strip of the drawing beside it, and is never narrower than its header', () => {
    const { least, most } = sheetBounds('end', 1200);
    assert.equal(least, 240);
    assert.equal(most, 1200 - BESIDE_SHEET);
    assert.equal(sheetSpan('start', 0.05, 1200), 240);
    assert.equal(sheetSpan('end', 0.95, 1200), 1200 - BESIDE_SHEET);
  });

  test('never resized, it takes its own share: as before at the bottom or top, and part of the width at a side', () => {
    assert.equal(sheetSpan('bottom', null, 800), sheetLimit(800));
    assert.equal(sheetSpan('top', null, 800), sheetLimit(800));
    assert.equal(sheetSpan('start', null, 1000), 1000 * SIDE_SHARE);
  });

  test('a chosen share is kept as it is when it is within bounds', () => {
    assert.equal(sheetSpan('bottom', 0.3, 1000), 300);
    assert.equal(sheetSpan('end', 0.5, 1000), 500);
  });

  test('on a screen too narrow for its least, it still leaves the strip beside it', () => {
    const { least, most } = sheetBounds('start', 300);
    assert.equal(least, 100);
    assert.equal(most, 100);
  });
});

describe('what a sheet covers is kept clear at any edge', () => {
  const room = (clear) => ({ content: { width: 1000, height: 1000 }, viewport: { width: 400, height: 400 }, clear });

  test('a number is still the strip at the foot, as before', () => {
    const [, y] = clampPan(room(100), 1, 0, -10000);
    assert.equal(y, 400 - 100 - 1000);
  });

  test('a sheet at a side lets the drawing pan into the part it covers, by as much and no further', () => {
    const c = { top: 0, right: 150, bottom: 0, left: 0 };
    assert.equal(clampPan(room(c), 1, -10000, 0)[0], 400 - 150 - 1000);
    const l = { top: 0, right: 0, bottom: 0, left: 150 };
    assert.equal(clampPan(room(l), 1, 10000, 0)[0], 150);
  });

  test('a sheet at the top lets the drawing pan down into it', () => {
    const c = { top: 120, right: 0, bottom: 0, left: 0 };
    assert.equal(clampPan(room(c), 1, 0, 10000)[1], 120);
  });

  test('the zoom aims a thing into the part a sheet at the side leaves', () => {
    const z = new Zoom({ width: 1000, height: 400 }, { width: 400, height: 400 }, 'full');
    z.restore(1, 0, 0);
    z.keepClear({ top: 0, right: 200, bottom: 0, left: 0 });
    // a thing at the drawing's left edge, under nothing: no move
    assert.equal(z.aim({ x: 0.01, y: 0.4, width: 0.05, height: 0.1 }), null);
    // a thing at x 250 to 300 is under the sheet: it is brought to the middle of the 200 pixels left
    const to = z.aim({ x: 0.25, y: 0.4, width: 0.05, height: 0.1 });
    assert.ok(to);
    const left = to.x + 0.25 * 1000 * to.scale,
      right = left + 0.05 * 1000 * to.scale;
    assert.ok(right <= 200, `right edge ${right} within the uncovered part`);
  });

  test('the arrow to a selection under a side sheet points from the part left uncovered', () => {
    const view = { scale: 1, x: 0, y: 0, width: 400, height: 400 };
    const box = { x: 0.8, y: 0.45, width: 0.1, height: 0.1 }; // at 320 to 360 across: under a sheet 200 wide
    assert.equal(pointerTo(box, view, { width: 400, height: 400 }), null, 'in sight with nothing covering it');
    const at = pointerTo(box, view, { width: 400, height: 400 }, { top: 0, right: 200, bottom: 0, left: 0 });
    assert.ok(at);
    assert.ok(at.x <= 200, 'the arrow sits in the uncovered part');
    assert.ok(Math.abs(at.angle) < 1, 'pointing right, towards the selection');
  });
});
