// Aiming the view at a thing (editor spec §25). It says where the view goes to bring a chosen thing into sight. It
// keeps the zoom unless the thing would be too small to read (details_choose_moves). It also gives the strip at the
// bottom of the viewport that a sheet covers. The drawing may pan up into it, so the chosen thing stays visible above
// it (sheet_keeps_thing_clear).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Zoom } from '../src/zoom.ts';

/** A drawing 1000 × 500 at natural size, in a note 500 wide: fitted at half size, the viewport 250 high. */
const make = () => new Zoom({ width: 1000, height: 500 }, { width: 500, height: 250 }, 'note');
/** A box low in the drawing: from 80% to 90% of its height, in the middle across. */
const LOW = { x: 0.45, y: 0.8, width: 0.1, height: 0.1 };
/** Where a box is in the viewport, as the view stands. */
const placed = (z, b) => {
  const v = z.view();
  return { top: v.y + b.y * v.height, bottom: v.y + (b.y + b.height) * v.height };
};

describe('the strip a sheet covers', () => {
  test('with nothing covered, the drawing in a note cannot pan: it fills its viewport', () => {
    const z = make();
    z.panBy(0, -80);
    assert.equal(z.view().y, 0);
  });

  test('with the bottom 100 pixels covered, it may pan up by as much, and no further', () => {
    const z = make();
    z.keepClear(100);
    assert.equal(z.view().y, 0, 'keeping clear moves nothing by itself');
    z.panBy(0, -80);
    assert.equal(z.view().y, -80);
    z.panBy(0, -80);
    assert.equal(z.view().y, -100);
  });

  test('uncovered again, the drawing goes back within its edges', () => {
    const z = make();
    z.keepClear(100);
    z.panBy(0, -100);
    z.keepClear(0);
    assert.equal(z.view().y, 0);
  });

  test('a cover larger than the viewport is taken as the whole of it', () => {
    const z = make();
    z.keepClear(1000);
    z.panBy(0, -1000);
    assert.equal(z.view().y, -250);
  });
});

describe('aiming at a box', () => {
  test('a box in view and readable needs no move', () => {
    assert.equal(make().aim(LOW), null);
  });

  test('a box under the covered strip is moved up above it, as far as the cover allows', () => {
    const z = make();
    z.keepClear(100);
    const to = z.aim(LOW);
    assert.ok(to, 'a move');
    assert.equal(to.scale, 0.5, 'the zoom kept');
    z.restore(to.scale, to.x, to.y);
    assert.ok(placed(z, LOW).bottom <= 150, `above the sheet: ${placed(z, LOW).bottom}`);
    assert.ok(placed(z, LOW).top >= 0, 'and still in the viewport');
  });

  test('aiming moves nothing by itself', () => {
    const z = make();
    z.keepClear(100);
    const was = z.view();
    z.aim(LOW);
    assert.deepEqual(z.view(), was);
  });

  test('a box too small to read is brought up to the scale given, centred', () => {
    const z = make();
    const to = z.aim(LOW, 0.8);
    assert.equal(to.scale, 0.8);
    z.restore(to.scale, to.x, to.y);
    const p = placed(z, LOW);
    assert.ok(p.top >= 0 && p.bottom <= 250, 'in view');
  });

  test('a box already larger than the readable scale keeps the zoom', () => {
    const z = make();
    z.zoomAt(4, 0, 0);
    const scale = z.view().scale;
    const to = z.aim(LOW, 0.8);
    assert.equal(to.scale, scale);
  });

  test('reveal is aim and go, as before', () => {
    const a = make(),
      b = make();
    for (const z of [a, b]) z.zoomAt(4, 0, 0);
    a.reveal(LOW);
    const to = b.aim(LOW);
    b.restore(to.scale, to.x, to.y);
    assert.deepEqual(a.view(), b.view());
  });
});
