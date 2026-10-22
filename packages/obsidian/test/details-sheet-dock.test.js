// Where the details sheet sits, and its size (editor spec §25, sheet_docked and sheet_resized).
// - A place button in the sheet's header chooses where it sits over the note's visible part. That is the bottom, the
//   default, the top, or the left or right side. Every sheet opened after opens there, for the rest of the session.
// - It keeps the size and place set, whatever its details hold: they scroll within it.
// - The edge facing the drawing is a resize bar, a named separator. It is dragged with a pointer or moved with the
//   arrow keys, Home and End taking it to its least and most. The size holds for the rest of the session too.
// - The place, size and state are kept in the plugin's data, so they hold across restarts (sheet_layout_kept).
// - Details that do not fit scroll within their space: the sheet wherever it sits, the card, or the side pane. The
//   header with its buttons is kept in sight (details_scroll).
// The built plugin, against the stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, load as loadPlugin } from './host/load-plugin.js';
import { PATH, NOTE, show as showNote } from './host/card-notes.js';
import { fence, labelled } from './host/notes.js';
import { rules, winner } from './host/cascade.js';
import { load, GRAPH, show, styles } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const details = (el) => el.querySelector('.thoughtknot-details');
const grip = (el) => details(el).querySelector('.thoughtknot-sheet-resizer');
const reduce = (env) => (env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: q.includes('reduce') }));
const all = rules(styles, 'styles.css');
/** What the stylesheet gives the sheet docked at `dock`, inside a card on the page. */
const css = (dock, property) =>
  winner(
    all,
    {
      tag: 'div',
      classes: ['thoughtknot-details', 'thoughtknot-sheet', `is-dock-${dock}`],
      ancestors: [
        { tag: 'div', classes: ['thoughtknot-view', 'is-note'] },
        { tag: 'div', classes: ['thoughtknot'] },
      ],
    },
    property,
  )?.value;
/** A box on the screen. */
const rect = (top, bottom, left = 0, width = 700) => ({
  top,
  bottom,
  left,
  right: left + width,
  width,
  height: bottom - top,
});
/**
 * The sheet laid out as a browser lays it out from what the plugin set, in an 800-pixel window. Its top and foot are
 * where they were put; with only one of them, it is as tall as it was sized, or 100 pixels.
 */
const laidOut = (d) => () => {
  if (d.hidden || d.hasClass('is-away')) return rect(0, 0, 0, 0);
  const p = (k) => {
    const v = d.cssProps[`--thoughtknot-sheet-${k}`];
    return v ? parseFloat(v) : null;
  };
  const h = p('height') ?? 100,
    top = p('top'),
    foot = p('bottom') === null ? null : 800 - p('bottom');
  const t = top ?? foot - h,
    b = foot ?? top + h;
  return rect(t, b, p('left') ?? 0, p('width') ?? 0);
};
/** The place button's menu, shown by pressing it: its rows by title. */
const placeMenu = (env, el) => {
  labelled(details(el), 'Move details').click();
  return env.state.menus.at(-1);
};
const choose = (env, el, title) => {
  const item = placeMenu(env, el).items.find((i) => i.title === title);
  assert.ok(item, `the menu offers ${title}`);
  item.click();
};

/** A card drawn on its own page, laid out over the whole 700 by 800 window, its sheet laid out as a browser would. */
async function card() {
  const env = await load();
  reduce(env);
  const el = (await show(env, fence(GRAPH))).el;
  el.querySelector('.thoughtknot-view').getBoundingClientRect = () => rect(0, 800);
  details(el).getBoundingClientRect = laidOut(details(el));
  return { env, el };
}

describe('the place button chooses where the sheet sits', () => {
  let env, el;
  const prop = (k) => details(el).cssProps[`--thoughtknot-sheet-${k}`];
  before(async () => ({ env, el } = await card()));
  after(() => env.uninstall());

  test('the sheet’s header has a named place button that opens a menu of places, the bottom ticked at first', () => {
    tapKey(el, 'large');
    const b = labelled(details(el), 'Move details');
    assert.ok(b, 'a place button');
    assert.equal(b.getAttribute('type'), 'button');
    assert.equal(b.getAttribute('aria-haspopup'), 'menu');
    const m = placeMenu(env, el);
    assert.deepEqual(
      m.items.map((i) => i.title),
      ['Dock at the bottom', 'Dock at the top', 'Dock on the left', 'Dock on the right', 'Open in the side pane'],
    );
    assert.deepEqual(
      m.items.filter((i) => i.checked).map((i) => i.title),
      ['Dock at the bottom'],
    );
    assert.ok(details(el).hasClass('is-dock-bottom'));
  });

  test('docked at the top, it sits at the top of the visible part, as wide as the card', () => {
    choose(env, el, 'Dock at the top');
    assert.ok(details(el).hasClass('thoughtknot-sheet'));
    assert.ok(details(el).hasClass('is-dock-top'));
    assert.equal(prop('top'), '0px');
    assert.equal(prop('bottom'), '', 'no longer held to the foot');
    assert.equal(prop('width'), '700px');
    assert.match(css('top', 'top'), /var\(--thoughtknot-sheet-top/);
    assert.equal(css('top', 'bottom'), 'auto');
  });

  test('docked on the left, it runs down the card’s left edge, from the top of the visible part to its foot', () => {
    choose(env, el, 'Dock on the left');
    assert.ok(details(el).hasClass('is-dock-left'));
    assert.equal(prop('left'), '0px');
    assert.equal(prop('width'), `${700 * 0.4}px`, 'two fifths of the card, until resized');
    assert.equal(prop('top'), '0px');
    assert.equal(prop('bottom'), '0px');
    assert.match(css('left', 'top'), /var\(--thoughtknot-sheet-top/);
    assert.match(css('left', 'bottom'), /var\(--thoughtknot-sheet-bottom/);
    assert.equal(css('left', 'max-height'), 'none');
  });

  test('docked on the right, it runs down the card’s right edge', () => {
    choose(env, el, 'Dock on the right');
    assert.ok(details(el).hasClass('is-dock-right'));
    assert.equal(prop('left'), `${700 - 280}px`);
    assert.equal(prop('width'), '280px');
  });

  test('the place chosen is ticked, and the next details open there', () => {
    assert.deepEqual(
      placeMenu(env, el)
        .items.filter((i) => i.checked)
        .map((i) => i.title),
      ['Dock on the right'],
    );
    labelled(details(el), 'Close details').click();
    tapKey(el, 'tablet');
    assert.ok(details(el).hasClass('is-dock-right'), 'opened where it was last put');
    choose(env, el, 'Dock at the bottom');
    assert.ok(details(el).hasClass('is-dock-bottom'));
    assert.equal(prop('top'), '');
    assert.equal(prop('bottom'), '0px');
  });
});

describe('the edge facing the drawing is a resize bar', () => {
  let env, el;
  const prop = (k) => details(el).cssProps[`--thoughtknot-sheet-${k}`];
  const key = (k) => grip(el).dispatch('keydown', { key: k });
  before(async () => {
    ({ env, el } = await card());
    tapKey(el, 'large');
  });
  after(() => env.uninstall());

  test('it is a named separator that takes the keyboard, saying how big the sheet is', () => {
    const g = grip(el);
    assert.ok(g, 'a resize bar');
    assert.equal(g.getAttribute('role'), 'separator');
    assert.equal(g.getAttribute('aria-label'), 'Resize details');
    assert.equal(g.getAttribute('tabindex'), '0');
    assert.equal(g.getAttribute('aria-orientation'), 'horizontal');
    assert.equal(g.getAttribute('aria-valuemin'), String(Math.round((52 / 800) * 100)));
    assert.equal(g.getAttribute('aria-valuemax'), String(Math.round(((800 - 160) / 800) * 100)));
    assert.equal(g.getAttribute('aria-valuenow'), '45');
  });

  test('before it is resized, it is its own share of the screen, whatever its details hold', () => {
    assert.equal(prop('height'), `${800 * 0.45}px`);
    tapKey(el, 'q');
    assert.equal(prop('height'), `${800 * 0.45}px`, 'other details, the same size: it never grows or shrinks to fit');
    tapKey(el, 'large');
  });

  test('at the bottom, Up makes the sheet taller by a step and Down shorter', () => {
    key('ArrowUp');
    assert.equal(prop('height'), `${800 * 0.5}px`);
    assert.equal(prop('max'), `${800 * 0.5}px`);
    assert.equal(grip(el).getAttribute('aria-valuenow'), '50');
    key('ArrowDown');
    key('ArrowDown');
    assert.equal(prop('height'), `${800 * 0.4}px`);
  });

  test('Home takes it to its bar, End to the most that leaves the chosen thing in sight above it', () => {
    key('End');
    assert.equal(prop('height'), `${800 - 160}px`);
    key('ArrowUp');
    assert.equal(prop('height'), `${800 - 160}px`, 'never more');
    key('Home');
    assert.equal(prop('height'), '52px');
  });

  test('dragged with a pointer, the sheet follows it, and stops when it lets go', () => {
    key('Home');
    const g = grip(el);
    g.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 300, clientY: 748 });
    g.dispatch('pointermove', { pointerId: 1, clientX: 300, clientY: 548 });
    assert.equal(prop('height'), `${52 + 200}px`, 'dragged up by 200, taller by 200');
    g.dispatch('pointerup', { pointerId: 1, clientX: 300, clientY: 548 });
    g.dispatch('pointermove', { pointerId: 1, clientX: 300, clientY: 300 });
    assert.equal(prop('height'), '252px', 'let go, it moves no more');
  });

  test('the size chosen holds for the next details', () => {
    labelled(details(el), 'Close details').click();
    tapKey(el, 'tablet');
    assert.equal(prop('height'), '252px');
  });

  test('at a side it lies along the card, and the arrow keys across it change the width', () => {
    choose(env, el, 'Dock on the left');
    assert.equal(grip(el).getAttribute('aria-orientation'), 'vertical');
    key('ArrowRight');
    assert.equal(prop('width'), `${700 * 0.45}px`, 'on the left, Right widens it');
    choose(env, el, 'Dock on the right');
    key('ArrowLeft');
    assert.equal(prop('width'), `${700 * 0.5}px`, 'on the right, Left widens it');
    key('End');
    assert.equal(prop('width'), `${700 - 200}px`, 'never so wide the drawing cannot be seen beside it');
  });

  test('minimised, the bar is hidden with the details', () => {
    labelled(details(el), 'Minimise details').click();
    assert.ok(grip(el).hidden);
    labelled(details(el), 'Restore details').click();
    assert.ok(!grip(el).hidden);
  });

  test('it is drawn on the sheet’s inner edge, as a bar to drag', () => {
    const at = (dock, property) =>
      winner(
        all,
        {
          tag: 'div',
          classes: ['thoughtknot-sheet-resizer'],
          ancestors: [{ tag: 'div', classes: ['thoughtknot-details', 'thoughtknot-sheet', `is-dock-${dock}`] }],
        },
        property,
      )?.value;
    assert.equal(at('bottom', 'top'), '0');
    assert.equal(at('top', 'bottom'), '0');
    assert.equal(at('left', 'right'), '0');
    assert.equal(at('right', 'left'), '0');
    assert.equal(at('bottom', 'cursor'), 'row-resize');
    assert.equal(at('left', 'cursor'), 'col-resize');
  });
});

describe('details that do not fit scroll within their space, the header kept in sight', () => {
  const at = (classes, ancestors, property) => winner(all, { tag: 'div', classes, ancestors }, property)?.value;
  const VIEW = { tag: 'div', classes: ['thoughtknot-view', 'is-note'] };
  const sheet = (dock) => ({ tag: 'div', classes: ['thoughtknot-details', 'thoughtknot-sheet', `is-dock-${dock}`] });

  test('as the sheet, at any place, its body scrolls and its header does not', () => {
    for (const dock of ['bottom', 'top', 'left', 'right']) {
      const s = sheet(dock);
      assert.equal(at(s.classes, [VIEW], 'overflow'), 'hidden', dock);
      assert.equal(at(s.classes, [VIEW], 'flex-direction'), 'column', dock);
      assert.equal(at(['thoughtknot-details-body'], [s, VIEW], 'overflow-y'), 'auto', dock);
      assert.equal(at(['thoughtknot-details-body'], [s, VIEW], 'min-height'), '0', dock);
      assert.equal(at(['thoughtknot-details-head'], [s, VIEW], 'flex'), 'none', dock);
    }
  });

  test('in the card, below the drawing, they are never longer than most of the screen and scroll within themselves', () => {
    assert.equal(at(['thoughtknot-details'], [VIEW], 'max-height'), '70vh');
    assert.equal(at(['thoughtknot-details'], [VIEW], 'overflow-y'), 'auto');
    const head = at(['thoughtknot-details-head'], [{ tag: 'div', classes: ['thoughtknot-details'] }, VIEW], 'position');
    assert.equal(head, 'sticky');
  });

  test('in the side pane, they scroll within it, the header held at its top', () => {
    const PANE = { tag: 'div', classes: ['thoughtknot', 'thoughtknot-details-pane'] };
    assert.equal(at(['thoughtknot', 'thoughtknot-details-pane'], [], 'overflow-y'), 'auto');
    const head = ['thoughtknot-details-head'],
      inside = [{ tag: 'div', classes: ['thoughtknot-details'] }, PANE];
    assert.equal(at(head, inside, 'position'), 'sticky');
    assert.equal(at(head, inside, 'top'), '0');
  });
});

describe('the place, size and state are kept in the plugin’s data, across restarts', () => {
  /** The plugin loaded with `data` as its saved data, and its card drawn, with a thing’s details open. */
  async function opened(data) {
    const env = await loadPlugin({ files: { [PATH]: NOTE }, data });
    const el = await showNote(env);
    tapKey(el, 'large');
    return { env, el, prop: (k) => details(el).cssProps[`--thoughtknot-sheet-${k}`] };
  }

  test('a place chosen and a size set are saved with the plugin’s data', async () => {
    const { env, el } = await opened(null);
    try {
      choose(env, el, 'Dock at the top');
      grip(el).dispatch('keydown', { key: 'ArrowDown' });
      const kept = env.state.data.detailsLayout;
      assert.equal(kept.place, 'top');
      assert.equal(kept.state, 'restored');
      assert.ok(Math.abs(kept.up - 0.5) < 1e-9, `the share set: ${kept.up}`);
    } finally {
      env.uninstall();
    }
  });

  test('after a restart, the details open where they were left, as big and as minimised', async () => {
    const { env, el, prop } = await opened({ detailsLayout: { place: 'top', state: 'minimised', up: 0.3 } });
    try {
      assert.ok(details(el).hasClass('is-dock-top'));
      assert.ok(details(el).hasClass('is-minimised'));
      labelled(details(el), 'Restore details').click();
      assert.equal(prop('height'), `${800 * 0.3}px`);
    } finally {
      env.uninstall();
    }
  });

  test('anything kept that is not a place, a state or a share is left out, and the defaults used', async () => {
    const { env, el, prop } = await opened({ detailsLayout: { place: 'middle', state: 'huge', up: 5, across: -1 } });
    try {
      assert.ok(details(el).hasClass('is-dock-bottom'));
      assert.ok(!details(el).hasClass('is-minimised'));
      assert.equal(prop('height'), `${800 * 0.45}px`);
    } finally {
      env.uninstall();
    }
  });

  test('the rest of the plugin’s data is kept as it was', async () => {
    const { env, el } = await opened({ settings: { focusDepth: 2 } });
    try {
      choose(env, el, 'Dock on the right');
      assert.deepEqual(env.state.data.settings, { focusDepth: 2 });
      assert.equal(env.state.data.detailsLayout.place, 'end');
    } finally {
      env.uninstall();
    }
  });
});
