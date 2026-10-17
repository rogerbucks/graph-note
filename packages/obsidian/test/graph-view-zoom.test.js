// Zooming a drawing (spec §3): fitted to the note to start with, zoomed by button, key and Ctrl or Command with the wheel,
// one finger left to scroll the note; and full screen, where the wheel alone zooms, which keeps the keyboard in it and
// gives it back on leaving.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show, svgOf } from './host/view-notes.js';

before(() => build());

describe('zoom in the note', () => {
  let env;
  before(async () => {
    env = await load({ width: 300 });
  });
  after(() => env.uninstall());
  const widthOf = (el) => Number(svgOf(el).getAttribute('width'));

  test('the drawing starts fitted to the note, no wider than it', async () => {
    const { el } = await show(env, fence(GRAPH));
    assert.ok(widthOf(el) <= 300 + 1e-6, `${widthOf(el)} fits 300`);
  });

  test('Zoom in, Zoom out and Fit change the drawing’s size, not its sharpness', async () => {
    const { el } = await show(env, fence(GRAPH));
    const fitted = widthOf(el);
    labelled(el, 'Zoom in').click();
    assert.ok(widthOf(el) > fitted);
    labelled(el, 'Zoom out').click();
    labelled(el, 'Zoom out').click();
    // zooming out stops where the whole drawing fits (editor spec §25, zoom_out_to_fit): never smaller than fitted
    assert.equal(widthOf(el), fitted);
    labelled(el, 'Zoom in').click();
    labelled(el, 'Fit').click();
    assert.equal(widthOf(el), fitted);
    assert.ok(!svgOf(el).getAttribute('style')?.includes('scale'), 'resized, not scaled');
  });

  test('plus, minus and zero work when the drawing has focus', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport'),
      fitted = widthOf(el);
    assert.equal(vp.getAttribute('tabindex'), '0', 'the drawing can take focus');
    assert.ok(vp.dispatch('keydown', { key: '+' }).defaultPrevented);
    assert.ok(widthOf(el) > fitted);
    vp.dispatch('keydown', { key: '0' });
    assert.equal(widthOf(el), fitted);
  });

  test('the wheel alone scrolls the note; with Ctrl or Command it zooms the drawing', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport'),
      fitted = widthOf(el);
    assert.equal(vp.dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10 }).defaultPrevented, false);
    assert.equal(widthOf(el), fitted);
    assert.ok(vp.dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10, ctrlKey: true }).defaultPrevented);
    assert.ok(widthOf(el) > fitted);
  });

  test('one finger on a fitted drawing is left to scroll the note', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport');
    assert.equal(vp.cssProps['--graph-note-touch'], 'pan-x pan-y');
    assert.equal(
      vp.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50, button: 0 })
        .defaultPrevented,
      false,
    );
    labelled(el, 'Zoom in').click();
    assert.equal(vp.cssProps['--graph-note-touch'], 'none', 'once zoomed in, one finger pans');
  });
});

describe('a card hidden and shown again', () => {
  const widthOf = (el) => Number(svgOf(el).getAttribute('width'));
  /** The drawing's natural width: its width in a note wide enough to draw it at natural size. */
  const natural = async () => {
    const env = await load({ width: 1e6 });
    try {
      return widthOf((await show(env, fence(GRAPH))).el);
    } finally {
      env.uninstall();
    }
  };
  /** Tells every card its viewport changed size, as the browser's ResizeObserver does. */
  const resized = (env) => env.doc.observers.forEach((o) => o.cb([]));
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≈ ${b}`);

  // proves: zoom_fit_recomputed
  test('keeps its zoom: hidden, its viewport has no size, which is no resize; 0.48 with a fit of 0.3 comes back at 0.48', async () => {
    const d = await natural();
    const env = await load({ width: 0.3 * d });
    try {
      const { el } = await show(env, fence(GRAPH));
      near(widthOf(el), 0.3 * d, 'fitted at 0.3');
      const vp = el.querySelector('.graph-note-viewport');
      vp.dispatch('wheel', { deltaY: -Math.log(1.6) / 0.0028, clientX: 0, clientY: 0, ctrlKey: true });
      near(widthOf(el), 0.48 * d, 'zoomed to 0.48');
      env.doc.width = 0; // display: none, or another tab in front: clientWidth is 0
      resized(env);
      near(widthOf(el), 0.48 * d, 'hidden: its zoom kept');
      env.doc.width = 0.3 * d;
      resized(env);
      near(widthOf(el), 0.48 * d, 'shown again at 0.48');
    } finally {
      env.uninstall();
    }
  });
});

describe('full screen', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('Full screen shows the drawing over the whole window, and Escape leaves it', async () => {
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Full screen').click();
    const overlay = env.doc.body.querySelector('.graph-note-fullscreen');
    assert.ok(overlay);
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.equal(overlay.querySelectorAll('g.node').length, 4);
    assert.ok(labelled(overlay, 'Close full screen'));
    overlay.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
    assert.equal(env.doc.body.querySelector('.graph-note-fullscreen'), null);
  });

  test('full screen takes the focus and keeps Tab in it; Escape from any control leaves, back to Full screen', async () => {
    const { el } = await show(env, fence(GRAPH));
    const opener = labelled(el, 'Full screen');
    opener.focus();
    opener.click();
    try {
      const overlay = env.doc.body.querySelector('.graph-note-fullscreen');
      assert.ok(overlay.contains(env.doc.activeElement), 'the focus is in full screen');
      const stops = overlay
        .querySelectorAll('button, [tabindex]')
        .filter((e) => !e.closest('[hidden]') && e.getAttribute('tabindex') !== '-1');
      const [first, last] = [stops[0], stops.at(-1)];
      last.focus();
      assert.ok(last.dispatch('keydown', { key: 'Tab' }).defaultPrevented);
      assert.ok(env.doc.activeElement === first, 'Tab from the last goes round to the first');
      assert.ok(first.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented);
      assert.ok(env.doc.activeElement === last, 'Shift+Tab from the first goes round to the last');
      const fit = labelled(overlay, 'Fit');
      fit.focus();
      fit.dispatch('keydown', { key: 'Escape' });
      assert.ok(!env.doc.body.querySelector('.graph-note-fullscreen'), 'Escape on the bar leaves too');
      assert.ok(env.doc.activeElement === labelled(el, 'Full screen'), 'the focus is back where it was');
    } finally {
      // left open by a failure, full screen would stand in the way of the next test
      const open = env.doc.body.querySelector('.graph-note-fullscreen');
      if (open) labelled(open, 'Close full screen').click();
    }
  });

  test('in full screen the wheel alone zooms', async () => {
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Full screen').click();
    const overlay = env.doc.body.querySelector('.graph-note-fullscreen');
    assert.ok(
      overlay.querySelector('.graph-note-viewport').dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10 })
        .defaultPrevented,
    );
    labelled(overlay, 'Close full screen').click();
    assert.equal(env.doc.body.querySelector('.graph-note-fullscreen'), null);
  });
});
