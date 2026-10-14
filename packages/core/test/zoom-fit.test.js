// Zooming out stops at the fit (editor spec §25, zoom_out_to_fit, zoom_fit_recomputed): the furthest a drawing zooms out
// is where the whole of it fits its view, or natural size when it would fit larger, in place of §3's quarter; four times
// natural size stays the furthest in. The limit is worked out again whenever the view is resized, full screen is entered
// or left, or the drawing changes, so it is never one worked out for another size.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Zoom, MAX_SCALE } from '../src/zoom.ts';
import { AcrossZoom } from '../src/zoom-across.ts';
import * as fit from '../src/zoom-fit.ts';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≈ ${b}`);
const make = (mode, content, viewport) => new Zoom(content, viewport, mode);
/** Zooms out every way there is, far past any limit, and gives the scale it stopped at after each. */
const outEveryWay = (z) => {
  const stops = [];
  for (let i = 0; i < 60; i++) z.zoomOut();
  stops.push(z.view().scale);
  z.zoomAt(1e-9, 10, 10);
  stops.push(z.view().scale);
  z.handle({ kind: 'wheel', x: 10, y: 10, dy: 1e6, ctrl: true });
  stops.push(z.view().scale);
  z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 100, y: 100 });
  z.handle({ kind: 'down', id: 2, pointer: 'touch', x: 300, y: 100 });
  z.handle({ kind: 'move', id: 1, x: 199, y: 100 });
  z.handle({ kind: 'move', id: 2, x: 201, y: 100 });
  z.handle({ kind: 'up', id: 1, x: 199, y: 100, time: 0 });
  z.handle({ kind: 'up', id: 2, x: 201, y: 100, time: 0 });
  stops.push(z.view().scale);
  z.restore(1e-6, 0, 0);
  stops.push(z.view().scale);
  return stops;
};

describe('zooming out stops at the fit', () => {
  // proves: zoom_out_to_fit
  test('zooming out, by button, gesture, wheel, pinch or a saved view, stops where the whole drawing fits the view', () => {
    const z = make('note', { width: 1000, height: 500 }, { width: 500, height: 250 });
    for (let i = 0; i < 5; i++) z.zoomIn();
    for (const s of outEveryWay(z)) close(s, 0.5, 'the whole drawing in view, and no smaller');
    const v = z.view();
    assert.deepEqual([v.x, v.y, v.width, v.height], [0, 0, 500, 250], 'the whole drawing, edge to edge');
  });

  // proves: zoom_out_to_fit
  test('a drawing that fits only below a quarter of natural size zooms out to its fit: the quarter is no longer the limit', () => {
    const z = make('pane', { width: 8000, height: 4000 }, { width: 500, height: 250 });
    close(z.view().scale, 1 / 16, 'fitted whole when first shown');
    z.zoomIn();
    for (const s of outEveryWay(z)) close(s, 1 / 16);
    assert.equal(z.view().width, 500, 'the whole drawing in view');
  });

  // proves: zoom_out_to_fit
  test('a drawing that fits at more than natural size zooms out no further than natural size', () => {
    for (const mode of ['full', 'pane', 'note']) {
      const z = make(mode, { width: 200, height: 100 }, { width: 1000, height: 1000 });
      for (const s of outEveryWay(z)) close(s, 1, `${mode}: natural size`);
    }
    const full = make('full', { width: 200, height: 100 }, { width: 1000, height: 1000 });
    close(full.view().scale, 4, 'Fit still shows it as large as the limit allows');
  });

  // proves: zoom_out_to_fit
  test('four times natural size stays the furthest in', () => {
    assert.equal(MAX_SCALE, 4);
    const z = make('pane', { width: 1000, height: 500 }, { width: 500, height: 250 });
    for (let i = 0; i < 40; i++) z.zoomIn();
    close(z.view().scale, 4);
    z.zoomAt(1e9, 0, 0);
    close(z.view().scale, 4);
    z.restore(100, 0, 0);
    close(z.view().scale, 4);
  });

  // proves: zoom_out_to_fit
  test('the limit is the whole fit, or natural size when that is larger; a drawing or view with no size is drawn at natural size', () => {
    close(fit.wholeFit({ width: 1000, height: 500 }, { width: 500, height: 500 }), 0.5, 'the narrower way decides');
    close(fit.outLimit({ width: 1000, height: 500 }, { width: 500, height: 500 }), 0.5);
    close(fit.outLimit({ width: 100, height: 50 }, { width: 500, height: 500 }), 1);
    close(fit.outLimit({ width: 0, height: 50 }, { width: 500, height: 500 }), 1);
    close(fit.outLimit({ width: 100, height: 50 }, { width: 0, height: 0 }), 1);
    const z = make('pane', { width: 1000, height: 500 }, { width: 500, height: 250 });
    close(z.outLimit(), 0.5, 'the zoom says its limit, for a host to show zoom out can go no further');
  });

  // proves: zoom_out_to_fit
  test('a wide drawing scrolled across zooms out until the whole of it fits, past the fit to its height', () => {
    const z = new AcrossZoom({ width: 2000, height: 400 }, { width: 375, height: 400 }, 'note');
    close(z.view().scale, 1, 'fitted to its height');
    for (let i = 0; i < 60; i++) z.zoomOut();
    close(z.view().scale, 375 / 2000, 'the whole of it across');
    assert.equal(z.view().width, 375);
  });
});

describe('the fit is worked out again', () => {
  // proves: zoom_fit_recomputed
  test('when the view is resized: a larger view raises the limit, and a drawing shown below it is brought up to it', () => {
    const z = make('pane', { width: 1000, height: 500 }, { width: 500, height: 250 });
    z.zoomAt(1.2, 0, 0);
    close(z.view().scale, 0.6);
    z.resize({ width: 1500, height: 750 });
    close(z.view().scale, 1, 'below the new limit, so brought up to it');
    for (const s of outEveryWay(z)) close(s, 1);
  });

  // proves: zoom_fit_recomputed
  test('when the view is resized smaller, it zooms out further, to the new fit', () => {
    const z = make('pane', { width: 1000, height: 500 }, { width: 500, height: 250 });
    z.zoomIn();
    z.resize({ width: 200, height: 100 });
    for (const s of outEveryWay(z)) close(s, 0.2);
  });

  // proves: zoom_fit_recomputed
  test('when full screen is entered or left, with the view it has there', () => {
    const z = make('note', { width: 2000, height: 1000 }, { width: 500, height: 250 });
    close(z.outLimit(), 0.25);
    z.setMode('full');
    z.resize({ width: 1600, height: 1000 });
    close(z.outLimit(), 0.8, 'the screen’s fit');
    for (const s of outEveryWay(z)) close(s, 0.8);
    z.setMode('note');
    z.resize({ width: 400, height: 200 });
    for (const s of outEveryWay(z)) close(s, 0.2, 'the note’s fit again');
  });

  // proves: zoom_fit_recomputed
  test('when the graph changes: a drawing laid out again at a new size has the fit of its new size', () => {
    const z = make('pane', { width: 1000, height: 500 }, { width: 500, height: 250 });
    z.zoomIn();
    z.resize({ width: 500, height: 250 }, { width: 4000, height: 2000 });
    for (const s of outEveryWay(z)) close(s, 0.125, 'larger: further out');
    z.zoomIn();
    z.resize({ width: 500, height: 250 }, { width: 250, height: 125 });
    for (const s of outEveryWay(z)) close(s, 1, 'smaller than the view: natural size');
  });
});
