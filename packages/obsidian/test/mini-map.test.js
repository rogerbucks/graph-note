// The mini-map (editor spec §24, mini_map, mini_map_setting): when a drawing is bigger than its view, a small copy of the
// whole drawing with the visible part outlined, which moves the view when tapped or dragged, in a card and in the pane
// alike; and whether it shows is a setting: Off, When the drawing does not fit (the default), or Always.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until, root } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { open as openPane } from './host/pane-notes.js';
import { GRAPH, show } from './host/view-notes.js';

before(() => build());

const WIDTH = 300;
const mapOf = (el) => el.querySelector('.graph-note-mini-map');
const shown = (el) => !!mapOf(el) && !mapOf(el).hidden;
const frameOf = (el) => mapOf(el).querySelector('rect.graph-note-mini-frame');
/** The outlined part, as fractions of the whole copy, across and down. */
function framed(el) {
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(frameOf(el).getAttribute(a)));
  const [vx, vy, vw, vh] = mapOf(el).querySelector('svg').getAttribute('viewBox').split(/[ ,]+/).map(Number);
  return { left: (x - vx) / vw, right: (x + w - vx) / vw, top: (y - vy) / vh, bottom: (y + h - vy) / vh };
}
/** Presses, drags or lifts a pointer on the mini-map, at fractions across and down it. */
function at(el, type, fx, fy, id = 5) {
  const rect = mapOf(el).querySelector('svg').getBoundingClientRect();
  return mapOf(el).dispatch(type, {
    pointerId: id,
    pointerType: 'mouse',
    button: 0,
    clientX: rect.left + fx * rect.width,
    clientY: rect.top + fy * rect.height,
  });
}
const zoomIn = (el, times) => {
  for (let i = 0; i < times; i++) labelled(el, 'Zoom in').click();
};
/** The card drawn at the note's width, with the saved settings given. */
async function card(miniMap) {
  const env = await load({ width: WIDTH, ...(miniMap ? { data: { settings: { miniMap } } } : {}) });
  const { el } = await show(env, fence(GRAPH));
  return { env, el };
}

describe('mini_map: shown when the drawing is bigger than its view', () => {
  test('a drawing that fits its view has no mini-map; zoomed in past the fit it has one, and Fit takes it away', async () => {
    const { env, el } = await card();
    try {
      assert.equal(shown(el), false, 'fitted: the whole drawing is in view');
      zoomIn(el, 1);
      assert.equal(shown(el), true, 'bigger than its view');
      labelled(el, 'Fit').click();
      assert.equal(shown(el), false);
    } finally {
      env.uninstall();
    }
  });

  test('it is a small copy of the whole drawing: a box for each thing, a line for each link', async () => {
    const { env, el } = await card();
    try {
      zoomIn(el, 1);
      const map = mapOf(el);
      assert.equal(map.querySelectorAll('.graph-note-mini-box').length, el.querySelectorAll('g.node').length);
      assert.equal(map.querySelectorAll('.graph-note-mini-line').length, el.querySelectorAll('g.edge').length);
      assert.ok(Number(map.querySelector('svg').getAttribute('width')) < WIDTH, 'small');
    } finally {
      env.uninstall();
    }
  });

  test('the visible part is outlined: the whole of it when fitted, a smaller part once zoomed in, and it follows the view', async () => {
    const { env, el } = await card('always');
    try {
      const whole = framed(el);
      assert.ok(whole.left < 0.001 && whole.top < 0.001 && whole.right > 0.999 && whole.bottom > 0.999, 'fitted: all');
      zoomIn(el, 2);
      const part = framed(el);
      const drawing = Number(el.querySelector('svg.graph-note-svg').getAttribute('width'));
      assert.ok(Math.abs(part.right - part.left - WIDTH / drawing) < 0.01, 'as much of the width as the view holds');
      assert.ok(part.right - part.left < 0.9);
      // the view changed by the bar moves the outline with it
      labelled(el, 'Fit').click();
      assert.ok(framed(el).right > 0.999, 'and back to the whole');
    } finally {
      env.uninstall();
    }
  });

  test('the copy and the outline are drawn, never written as HTML', () => {
    const src = readFileSync(`${root}packages/obsidian/src/graph-view/mini-map.ts`, 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
  });

  test('its look is the theme’s, in the style sheet', () => {
    const css = readFileSync(`${root}styles.css`, 'utf8');
    const rule = (name) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    for (const name of ['graph-note-mini-map', 'graph-note-mini-frame', 'graph-note-mini-box'])
      assert.match(rule(name), /var\(--/, name);
    assert.ok(
      !/#[0-9a-f]{3,8}\b/i.test(rule('graph-note-mini-map') + rule('graph-note-mini-frame')),
      'no fixed colour',
    );
  });
});

describe('mini_map: tapped or dragged, it moves the view', () => {
  test('a tap puts the middle of the view where it was tapped, as far as the drawing’s edges allow', async () => {
    const { env, el } = await card();
    try {
      zoomIn(el, 3);
      at(el, 'pointerdown', 0.97, 0.5);
      at(el, 'pointerup', 0.97, 0.5);
      assert.ok(framed(el).right > 0.999, 'the right edge, which stops the view');
      at(el, 'pointerdown', 0.5, 0.5);
      at(el, 'pointerup', 0.5, 0.5);
      const mid = framed(el);
      assert.ok(Math.abs((mid.left + mid.right) / 2 - 0.5) < 0.02, 'the middle');
      at(el, 'pointerdown', 0.03, 0.5);
      at(el, 'pointerup', 0.03, 0.5);
      assert.ok(framed(el).left < 0.001, 'the left edge');
    } finally {
      env.uninstall();
    }
  });

  test('the drawing itself is moved to match: its place changes as the outline does', async () => {
    const { env, el } = await card();
    try {
      zoomIn(el, 3);
      const vp = el.querySelector('.graph-note-viewport');
      at(el, 'pointerdown', 0.03, 0.5);
      at(el, 'pointerup', 0.03, 0.5);
      const left = parseFloat(vp.cssProps['--graph-note-x']);
      at(el, 'pointerdown', 0.97, 0.5);
      at(el, 'pointerup', 0.97, 0.5);
      assert.ok(parseFloat(vp.cssProps['--graph-note-x']) < left, 'the drawing moved left to show its right side');
    } finally {
      env.uninstall();
    }
  });

  test('dragged, it keeps moving the view with the pointer until the pointer lifts', async () => {
    const { env, el } = await card();
    try {
      zoomIn(el, 3);
      at(el, 'pointerdown', 0.03, 0.5);
      assert.ok(mapOf(el).hasPointerCapture(5), 'the pointer is held while it drags');
      at(el, 'pointermove', 0.5, 0.5);
      const mid = framed(el);
      assert.ok(Math.abs((mid.left + mid.right) / 2 - 0.5) < 0.02);
      at(el, 'pointermove', 0.97, 0.5);
      assert.ok(framed(el).right > 0.999);
      at(el, 'pointerup', 0.97, 0.5);
      assert.equal(mapOf(el).hasPointerCapture(5), false);
      at(el, 'pointermove', 0.03, 0.5);
      assert.ok(framed(el).right > 0.999, 'a move after the lift moves nothing');
    } finally {
      env.uninstall();
    }
  });

  test('a tap on it is not a tap on the drawing: no details open, nothing is selected, and the drawing is not zoomed', async () => {
    const { env, el } = await card();
    try {
      zoomIn(el, 2);
      const before = el.querySelector('svg.graph-note-svg').getAttribute('width');
      at(el, 'pointerdown', 0.5, 0.5);
      at(el, 'pointerup', 0.5, 0.5);
      mapOf(el).dispatch('dblclick', { clientX: 10, clientY: 10 });
      assert.equal(el.querySelector('.graph-note-details').hidden, true);
      assert.equal(el.querySelectorAll('g.is-selected').length, 0);
      assert.equal(el.querySelector('svg.graph-note-svg').getAttribute('width'), before);
    } finally {
      env.uninstall();
    }
  });

  test('it is for the pointer; the drawing is still moved by the keyboard, and its words say how the mini-map is used', async () => {
    const { env, el } = await card('always');
    try {
      const label = mapOf(el).getAttribute('aria-label') ?? '';
      assert.match(label, /mini-map/i);
      assert.match(label, /tap or drag/i);
    } finally {
      env.uninstall();
    }
  });
});

describe('mini_map_setting: Off, When the drawing does not fit, or Always', () => {
  test('the setting is on the page, in the Drawing section, with its three choices and the second as the default', async () => {
    const env = await load();
    try {
      const tab = env.state.settingTabs[0];
      tab.display();
      const row = tab.containerEl
        .querySelectorAll('.setting-item')
        .find((r) => r.querySelector('.setting-item-name')?.textContent === 'Mini-map');
      assert.ok(row, 'the setting is on the page');
      assert.equal(row.querySelector('select').value, 'auto');
      assert.deepEqual(
        row.querySelectorAll('option').map((o) => o.getAttribute('value')),
        ['off', 'auto', 'always'],
      );
      assert.deepEqual(
        row.querySelectorAll('option').map((o) => o.textContent),
        ['Off', 'When the drawing does not fit', 'Always'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('Off: never shown, however far the drawing is zoomed in', async () => {
    const { env, el } = await card('off');
    try {
      zoomIn(el, 4);
      assert.equal(shown(el), false);
    } finally {
      env.uninstall();
    }
  });

  test('Always: shown even when the whole drawing fits', async () => {
    const { env, el } = await card('always');
    try {
      assert.equal(shown(el), true);
      zoomIn(el, 2);
      assert.equal(shown(el), true);
    } finally {
      env.uninstall();
    }
  });

  test('a saved value that is none of the three is read as the default', async () => {
    const { env, el } = await card('sometimes');
    try {
      assert.equal(shown(el), false);
      zoomIn(el, 1);
      assert.equal(shown(el), true);
    } finally {
      env.uninstall();
    }
  });
});

describe('mini_map: in the pane as in a card', () => {
  test('the pane’s drawing has it, follows its setting, and a tap on it moves the pane’s view', async () => {
    const env = await openPane({ data: { settings: { miniMap: 'always' } } });
    try {
      await until(() => !!mapOf(env.el));
      assert.equal(shown(env.el), true);
      assert.equal(mapOf(env.el).querySelectorAll('.graph-note-mini-box').length, 4);
      zoomIn(env.el, 3);
      at(env.el, 'pointerdown', 0.97, 0.5);
      at(env.el, 'pointerup', 0.97, 0.5);
      assert.ok(framed(env.el).right > 0.999);
    } finally {
      env.uninstall();
    }
  });

  test('and in the pane, “when the drawing does not fit” follows the zoom', async () => {
    const env = await openPane();
    try {
      await until(() => !!env.el.querySelector('g.node'));
      assert.equal(shown(env.el), false);
      zoomIn(env.el, 8);
      assert.equal(shown(env.el), true);
    } finally {
      env.uninstall();
    }
  });
});
