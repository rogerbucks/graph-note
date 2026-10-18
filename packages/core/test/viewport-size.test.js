// How tall a drawing's viewport is in a note (spec §3, note_height_capped; §24, drawing_height_setting): as tall as the
// drawing fitted to its width, but never taller than the share of the window the settings allow, so what follows the
// drawing in the note, its details among it, stays in reach. Full screen and the pane are as tall as they are given.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { viewportSize } from '../src/display/graph-view/viewport-size.ts';
import { tallestOf } from '../src/settings-aids.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';

/** A viewport the page has laid out `width` wide and `height` high. */
const viewport = (width, height = 0) => ({ clientWidth: width, clientHeight: height });

beforeEach(() => {
  globalThis.activeWindow = { innerHeight: 1000, innerWidth: 1200 };
});

describe('a drawing in a note', () => {
  test('a short drawing is as tall as it is fitted to its width', () => {
    assert.deepEqual(viewportSize(viewport(500), { width: 1000, height: 400 }, 'note', false, 0.75), {
      width: 500,
      height: 200,
    });
  });

  test('a tall drawing is never taller than its share of the window, so the details below it stay in sight', () => {
    const size = viewportSize(viewport(500), { width: 400, height: 3000 }, 'note', false, 0.75);
    assert.equal(size.height, 750);
  });

  test('with no limit, it is as tall as the drawing fitted, as before', () => {
    const size = viewportSize(viewport(500), { width: 400, height: 3000 }, 'note', false, null);
    assert.equal(size.height, 3000);
  });

  test('a limit is three quarters of the window when the card is given none', () => {
    const size = viewportSize(viewport(500), { width: 400, height: 3000 }, 'note', false);
    assert.equal(size.height, 750);
  });

  test('a drawing scrolled across keeps its own lower limit, and a lower setting lowers it', () => {
    assert.equal(viewportSize(viewport(375), { width: 2000, height: 900 }, 'note', true, 0.75).height, 600);
    assert.equal(viewportSize(viewport(375), { width: 2000, height: 900 }, 'note', true, 0.5).height, 500);
  });

  test('full screen and the pane are as tall as the page makes them, whatever the setting', () => {
    assert.equal(viewportSize(viewport(800, 900), { width: 400, height: 3000 }, 'full', false, 0.5).height, 900);
  });
});

describe('the setting', () => {
  test('is offered under Drawing, three quarters of the window by default, with half and no limit', () => {
    const o = OPTIONS.find((x) => x.key === 'drawingHeight');
    assert.equal(o.section, 'Drawing');
    assert.deepEqual(
      o.choices.map((c) => c.value),
      ['half', 'most', 'none'],
    );
    assert.equal(DEFAULT_SETTINGS.drawingHeight, 'most');
    assert.equal(settingsFrom({ drawingHeight: 'tall' }).drawingHeight, 'most', 'an unknown one is the default');
  });

  test('each choice is the share of the window a drawing may take', () => {
    assert.equal(tallestOf('half'), 0.5);
    assert.equal(tallestOf('most'), 0.75);
    assert.equal(tallestOf('none'), null);
  });
});
