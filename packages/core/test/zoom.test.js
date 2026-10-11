// Zoom, pan and full-screen (spec §3): Fit, zoom in and zoom out by button, gesture and key, within a quarter and four
// times natural size. The host passes plain events in; the zoom says whether it used each one, so the host stops the
// browser's own handling only then — and the note still scrolls when the drawing does not need the gesture.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Zoom, MIN_SCALE, MAX_SCALE } from '../src/zoom.ts';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≈ ${b}`);
/** A drawing 1000 × 500 at natural size, in a viewport 500 wide and 250 high — fitted at half size. */
const make = (mode = 'note', content = { width: 1000, height: 500 }, viewport = { width: 500, height: 250 }) =>
  new Zoom(content, viewport, mode);
/** Where a point of the drawing (in natural units) sits in the viewport. */
const at = (z, px, py) => {
  const t = z.view();
  return [t.x + px * t.scale, t.y + py * t.scale];
};

describe('fit', () => {
  test('a drawing starts fitted: whole, centred, never above natural size in a note', () => {
    const z = make();
    close(z.view().scale, 0.5);
    assert.deepEqual([z.view().x, z.view().y], [0, 0]);
    const small = make('note', { width: 200, height: 100 });
    close(small.view().scale, 1, 'a small drawing stays at natural size');
    assert.deepEqual([small.view().x, small.view().y], [150, 75], 'and sits in the middle');
  });

  test('full-screen fits the drawing to the screen, larger than natural size if it is small, up to the limit', () => {
    const z = make('full', { width: 200, height: 100 }, { width: 1000, height: 1000 });
    close(z.view().scale, 4, 'capped at four times');
    const w = make('full', { width: 400, height: 100 }, { width: 1000, height: 1000 });
    close(w.view().scale, 2.5);
  });

  test('Fit returns to the whole drawing after zooming and panning', () => {
    const z = make();
    z.zoomIn();
    z.zoomIn();
    z.panBy(-80, -40);
    z.fit();
    close(z.view().scale, 0.5);
    assert.deepEqual([z.view().x, z.view().y], [0, 0]);
    assert.ok(z.isFitted());
  });

  test('a fitted drawing stays fitted when its viewport changes size', () => {
    const z = make();
    z.resize({ width: 250, height: 125 });
    close(z.view().scale, 0.25);
    z.zoomIn();
    const before = z.view().scale;
    z.resize({ width: 400, height: 200 });
    close(z.view().scale, before, 'a zoomed drawing keeps its zoom');
  });
});

describe('limits', () => {
  test('zoom stays between a quarter and four times natural size', () => {
    assert.equal(MIN_SCALE, 0.25);
    assert.equal(MAX_SCALE, 4);
    const z = make();
    for (let i = 0; i < 40; i++) z.zoomIn();
    close(z.view().scale, 4);
    for (let i = 0; i < 80; i++) z.zoomOut();
    close(z.view().scale, 0.25);
    z.zoomAt(1e9, 10, 10);
    close(z.view().scale, 4);
    z.zoomAt(1e-9, 10, 10);
    close(z.view().scale, 0.25);
  });

  test('the drawing is resized, not stretched, so its text stays sharp at every level', () => {
    const z = make();
    z.zoomIn();
    const v = z.view();
    close(v.width, 1000 * v.scale);
    close(v.height, 500 * v.scale);
  });

  test('panning never takes the drawing out of view', () => {
    const z = make();
    z.zoomAt(2, 0, 0);
    z.panBy(-1e6, -1e6);
    const v = z.view();
    close(v.x + v.width, 500, 'its right edge stops at the viewport’s');
    close(v.y + v.height, 250);
    z.panBy(1e6, 1e6);
    assert.deepEqual([z.view().x, z.view().y], [0, 0]);
  });

  test('a drawing smaller than its viewport stays centred and cannot be dragged away', () => {
    const z = make('note', { width: 200, height: 100 });
    z.panBy(300, 300);
    assert.deepEqual([z.view().x, z.view().y], [150, 75]);
  });
});

describe('buttons and keys', () => {
  test('zoom in and zoom out step about the middle of the view', () => {
    const z = make();
    const mid = () => [(250 - z.view().x) / z.view().scale, (125 - z.view().y) / z.view().scale];
    const before = mid();
    z.zoomIn();
    assert.ok(z.view().scale > 0.5);
    mid().forEach((v, i) => close(v, before[i], 'the middle stays in the middle'));
    z.zoomOut();
    close(z.view().scale, 0.5);
  });

  test('plus, minus and zero zoom in, zoom out and fit when the drawing has focus', () => {
    const z = make();
    assert.equal(z.handle({ kind: 'key', key: '+' }), true);
    assert.ok(z.view().scale > 0.5);
    assert.equal(z.handle({ kind: 'key', key: '=' }), true, 'the plus key unshifted');
    const s = z.view().scale;
    assert.equal(z.handle({ kind: 'key', key: '-' }), true);
    assert.ok(z.view().scale < s);
    assert.equal(z.handle({ kind: 'key', key: '0' }), true);
    assert.ok(z.isFitted());
    assert.equal(z.handle({ kind: 'key', key: 'a' }), false, 'other keys are left to the host');
  });

  test('Escape leaves full-screen, and is left alone in a note', () => {
    const exits = [];
    const full = make('full');
    full.onExit = () => exits.push('exit');
    assert.equal(full.handle({ kind: 'key', key: 'Escape' }), true);
    assert.deepEqual(exits, ['exit']);
    const note = make('note');
    note.onExit = () => exits.push('wrong');
    assert.equal(note.handle({ kind: 'key', key: 'Escape' }), false);
    assert.deepEqual(exits, ['exit']);
  });

  test('a key with Ctrl, Command or Alt held is left to the host', () => {
    const z = make();
    for (const mod of ['ctrl', 'meta', 'alt'])
      assert.equal(z.handle({ kind: 'key', key: '+', [mod]: true }), false, mod);
    close(z.view().scale, 0.5);
  });
});

describe('the mouse wheel and the trackpad', () => {
  test('in a note, the wheel alone scrolls the note and never zooms the drawing', () => {
    const z = make();
    assert.equal(z.handle({ kind: 'wheel', x: 100, y: 100, dy: -100 }), false);
    close(z.view().scale, 0.5);
  });

  test('with Ctrl or Command held — and a trackpad pinch, which arrives as Ctrl and the wheel — it zooms about the pointer', () => {
    for (const mod of ['ctrl', 'meta']) {
      const z = make();
      const [px, py] = [120, 60],
        before = [(px - z.view().x) / z.view().scale, (py - z.view().y) / z.view().scale];
      assert.equal(z.handle({ kind: 'wheel', x: px, y: py, dy: -100, [mod]: true }), true, mod);
      assert.ok(z.view().scale > 0.5, 'wheel up zooms in');
      const [ax, ay] = at(z, ...before);
      close(ax, px, 'the point under the pointer stays under it');
      close(ay, py);
      z.handle({ kind: 'wheel', x: px, y: py, dy: 300, [mod]: true });
      assert.ok(z.view().scale < 0.6, 'wheel down zooms out');
    }
  });

  // device check V-08 (Roger, 11 Oct 2026): a trackpad pinch on a Mac arrives as the wheel with Ctrl, so it is quicker too
  test('a trackpad pinch, or the wheel with Ctrl, zooms 1.4 times as fast: a notch of 100 is a factor of e ** 0.28', () => {
    const z = make();
    z.handle({ kind: 'wheel', x: 100, y: 100, dy: -100, ctrl: true });
    close(z.view().scale, 0.5 * Math.exp(0.28), 'in');
    z.handle({ kind: 'wheel', x: 100, y: 100, dy: 100, ctrl: true });
    close(z.view().scale, 0.5, 'and out again');
  });

  test('in full-screen and in the edit pane the wheel alone zooms', () => {
    for (const mode of ['full', 'pane']) {
      const z = make(mode);
      const s = z.view().scale;
      assert.equal(z.handle({ kind: 'wheel', x: 100, y: 100, dy: -100 }), true, mode);
      assert.ok(z.view().scale > s, mode);
    }
  });
});

describe('dragging', () => {
  test('dragging empty space with the mouse pans', () => {
    const z = make();
    z.zoomAt(2, 0, 0);
    const x0 = z.view().x;
    assert.equal(z.handle({ kind: 'down', id: 1, pointer: 'mouse', x: 200, y: 100 }), true);
    z.handle({ kind: 'move', id: 1, x: 150, y: 90 });
    z.handle({ kind: 'up', id: 1, x: 150, y: 90, time: 0 });
    close(z.view().x, x0 - 50);
  });

  test('dragging from a box does not pan: the box is left to the host', () => {
    const z = make();
    z.zoomAt(2, 0, 0);
    const before = z.view();
    assert.equal(z.handle({ kind: 'down', id: 1, pointer: 'mouse', x: 200, y: 100, onBox: true }), false);
    z.handle({ kind: 'move', id: 1, x: 100, y: 50 });
    assert.deepEqual(z.view(), before);
  });

  test('on touch, a fitted drawing leaves one finger to scroll the note', () => {
    const z = make();
    assert.equal(z.touchAction(), 'pan-x pan-y');
    assert.equal(z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 200, y: 100 }), false);
    z.handle({ kind: 'move', id: 1, x: 200, y: 20 });
    assert.ok(z.isFitted());
  });

  test('on touch, once zoomed in, one finger pans the drawing', () => {
    const z = make();
    z.zoomAt(2, 0, 0);
    assert.equal(z.touchAction(), 'none');
    const y0 = z.view().y;
    assert.equal(z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 200, y: 100 }), true);
    z.handle({ kind: 'move', id: 1, x: 200, y: 60 });
    close(z.view().y, y0 - 40);
  });

  test('a pointer that is cancelled stops the drag', () => {
    const z = make();
    z.zoomAt(2, 0, 0);
    z.handle({ kind: 'down', id: 1, pointer: 'mouse', x: 200, y: 100 });
    z.handle({ kind: 'cancel', id: 1 });
    const before = z.view();
    z.handle({ kind: 'move', id: 1, x: 0, y: 0 });
    assert.deepEqual(z.view(), before);
  });
});

describe('pinching', () => {
  test('pinching zooms about the point between the fingers', () => {
    const z = make();
    const mid = [150, 100],
      before = [(mid[0] - z.view().x) / z.view().scale, (mid[1] - z.view().y) / z.view().scale];
    z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 100, y: 100 });
    assert.equal(z.handle({ kind: 'down', id: 2, pointer: 'touch', x: 200, y: 100 }), true);
    z.handle({ kind: 'move', id: 1, x: 50, y: 100 });
    z.handle({ kind: 'move', id: 2, x: 250, y: 100 });
    close(z.view().scale, 0.5 * 2 ** 1.4, 'twice the distance, a little more than twice the size');
    const [ax, ay] = at(z, ...before);
    close(ax, mid[0]);
    close(ay, mid[1]);
  });

  // device check V-08 (Roger, 11 Oct 2026): "pinch zoom in and out should be a little quicker" — 1.4 times the rate it
  // was, which followed the fingers exactly: as a factor, each spread is raised to the power 1.4
  test('a pinch zooms 1.4 times as fast as the fingers move: twice apart is 2 ** 1.4 times the size, half as far 2 ** -1.4', () => {
    const z = make('pane', { width: 100, height: 100 }, { width: 400, height: 400 });
    close(z.view().scale, 4, 'fitted to the pane, at the upper limit');
    z.zoomAt(1 / 4, 200, 200);
    close(z.view().scale, 1);
    z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 150, y: 200 });
    z.handle({ kind: 'down', id: 2, pointer: 'touch', x: 250, y: 200 });
    z.handle({ kind: 'move', id: 1, x: 175, y: 200 });
    z.handle({ kind: 'move', id: 2, x: 225, y: 200 });
    close(z.view().scale, 2 ** -1.4, 'pinched in to half the distance');
    z.handle({ kind: 'move', id: 1, x: 100, y: 200 });
    z.handle({ kind: 'move', id: 2, x: 300, y: 200 });
    close(z.view().scale, 2 ** 1.4, 'spread to twice the distance');
  });

  test('moving both fingers together pans as it pinches', () => {
    const z = make();
    z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 100, y: 100 });
    z.handle({ kind: 'down', id: 2, pointer: 'touch', x: 200, y: 100 });
    z.handle({ kind: 'move', id: 1, x: 50, y: 100 });
    z.handle({ kind: 'move', id: 2, x: 250, y: 100 });
    const before = z.view();
    z.handle({ kind: 'move', id: 1, x: 40, y: 90 });
    z.handle({ kind: 'move', id: 2, x: 240, y: 90 });
    close(z.view().scale, before.scale);
    close(z.view().x, before.x - 10);
    close(z.view().y, before.y - 10);
  });

  test('a pinch stays within the limits', () => {
    const z = make();
    z.handle({ kind: 'down', id: 1, pointer: 'touch', x: 249, y: 100 });
    z.handle({ kind: 'down', id: 2, pointer: 'touch', x: 251, y: 100 });
    z.handle({ kind: 'move', id: 1, x: -5000, y: 100 });
    z.handle({ kind: 'move', id: 2, x: 5000, y: 100 });
    close(z.view().scale, 4);
  });
});

describe('double tap', () => {
  test('double-clicking empty space zooms in there', () => {
    const z = make();
    const before = [(100 - z.view().x) / z.view().scale, (50 - z.view().y) / z.view().scale];
    assert.equal(z.handle({ kind: 'dblclick', x: 100, y: 50 }), true);
    close(z.view().scale, 1);
    const [ax, ay] = at(z, ...before);
    close(ax, 100);
    close(ay, 50);
  });

  test('double-clicking a box is left to the host', () => {
    const z = make();
    assert.equal(z.handle({ kind: 'dblclick', x: 100, y: 50, onBox: true }), false);
    close(z.view().scale, 0.5);
  });

  // device check V-08 (Roger, 11 Oct 2026): "selecting by double-click also zooms" — a click near a box or a link chooses
  // it (tap_cycles_near), so a double click there only chooses, as a double tap there does
  test('double-clicking near a box or link, not on it, is left to the host: it selects, and never zooms', () => {
    const z = make();
    assert.equal(z.handle({ kind: 'dblclick', x: 100, y: 50, near: true }), false);
    close(z.view().scale, 0.5);
  });

  test('two quick taps in the same place zoom in there; slow or distant taps do not', () => {
    const tap = (z, x, y, time, id) => {
      z.handle({ kind: 'down', id, pointer: 'touch', x, y });
      z.handle({ kind: 'up', id, x, y, time });
    };
    const z = make();
    tap(z, 100, 50, 1000, 1);
    tap(z, 104, 52, 1200, 2);
    close(z.view().scale, 1);
    const slow = make();
    tap(slow, 100, 50, 1000, 1);
    tap(slow, 100, 50, 1500, 2);
    close(slow.view().scale, 0.5);
    const far = make();
    tap(far, 100, 50, 1000, 1);
    tap(far, 200, 50, 1100, 2);
    close(far.view().scale, 0.5);
  });

  test('two quick taps near a box or link are left to the host, to choose between what is near; a drag from there still pans', () => {
    const z = make();
    for (const [id, t] of [
      [1, 1000],
      [2, 1200],
    ]) {
      z.handle({ kind: 'down', id, pointer: 'touch', x: 100, y: 50, near: true });
      assert.equal(z.handle({ kind: 'up', id, x: 100, y: 50, time: t }), false);
    }
    close(z.view().scale, 0.5);
    const m = make();
    m.zoomAt(2, 0, 0);
    const x0 = m.view().x;
    assert.equal(m.handle({ kind: 'down', id: 1, pointer: 'mouse', x: 200, y: 100, near: true }), true);
    m.handle({ kind: 'move', id: 1, x: 150, y: 100 });
    close(m.view().x, x0 - 50);
  });

  test('a drag is not a tap', () => {
    const z = make();
    z.zoomAt(2, 0, 0);
    const s = z.view().scale;
    for (const [id, t] of [
      [1, 1000],
      [2, 1100],
    ]) {
      z.handle({ kind: 'down', id, pointer: 'touch', x: 100, y: 50 });
      z.handle({ kind: 'move', id, x: 160, y: 50 });
      z.handle({ kind: 'up', id, x: 160, y: 50, time: t });
    }
    close(z.view().scale, s);
  });
});

describe('telling the host', () => {
  test('every change is reported, so the host redraws only when the view moved', () => {
    const z = make();
    const seen = [];
    z.onChange = (v) => seen.push(v.scale);
    z.zoomIn();
    z.fit();
    z.handle({ kind: 'wheel', x: 1, y: 1, dy: -10 });
    assert.equal(seen.length, 2);
  });
});
