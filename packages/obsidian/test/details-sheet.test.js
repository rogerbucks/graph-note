// The details sheet (editor spec §25, slice 3). In view mode a card's details open as a sheet over the card.
// - It is pinned to the foot of the visible screen. It stays while the note scrolls, until it is closed or the card
//   leaves the screen (sheet_pinned).
// - The drawing pans so the chosen thing stays visible above it when it opens or changes size (sheet_keeps_thing_clear).
// - A toggle in its header minimises it to a bar with the thing's name and kind, or restores the full details.
//   It scrolls within itself and never fills the screen (sheet_min_max).
// - It opens in the state last chosen for the session (sheet_state_remembered).
// - A close button, Escape or clearing the selection closes it (sheet_closed).
// - Its toggle and close button are named, work by keyboard and are 44 points on touch (sheet_reachable).
// Keys typed in the note are never taken. The built plugin, against the stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { rules, winner } from './host/cascade.js';
import { load, GRAPH, show, styles } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { groupsRead } from './host/details-read.js';

before(() => build());

const details = (el) => el.querySelector('.thoughtknot-details');
const body = (el) => details(el).querySelector('.thoughtknot-details-body');
const toggle = (el) => labelled(details(el), 'Minimise details') ?? labelled(details(el), 'Restore details');
const selected = (el) => el.querySelector('g.is-selected')?.getAttribute('data-key') ?? null;
const reduce = (env) => (env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: q.includes('reduce') }));
const all = rules(styles, 'styles.css');
/** What the stylesheet gives an element of the sheet, inside a card on the page. */
const css = (el, property) => {
  const card = { tag: 'div', classes: ['thoughtknot-view', 'is-note'] };
  return winner(
    all,
    { ...el, ancestors: [...(el.ancestors ?? []), card, { tag: 'div', classes: ['thoughtknot'] }] },
    property,
  )?.value;
};
const SHEET = { tag: 'div', classes: ['thoughtknot-details', 'thoughtknot-sheet'] };
/** A box on the screen, from its top to its foot, 700 wide unless said. */
const rect = (top, bottom, left = 0, width = 700) => ({
  top,
  bottom,
  left,
  right: left + width,
  width,
  height: bottom - top,
});
/**
 * The sheet laid out as a browser lays it out from what the plugin set: fixed, `height` tall, in an 800-pixel window.
 * Hidden or away with its card (display: none), it is a box of no size at all.
 */
const laidOut =
  (d, height = 100) =>
  () => {
    if (d.hidden || d.hasClass('is-away')) return rect(0, 0, 0, 0);
    const p = (k) => parseFloat(d.cssProps[`--thoughtknot-sheet-${k}`] ?? '0');
    return rect(800 - p('bottom') - height, 800 - p('bottom'), p('left'), p('width'));
  };
/** Draws the graph's block into `el` as Obsidian does, wherever `el` is. */
const drawInto = async (env, el) => {
  const { fakeContext } = await import('./host/fake-obsidian.js');
  const ctx = fakeContext(fence(GRAPH), 0);
  await env.state.processors.get('gql')(GRAPH, el, ctx);
  return ctx;
};

describe('in view mode the details open as a sheet pinned to the foot of the visible screen, over the card', () => {
  let env, el, watched;
  before(async () => {
    env = await load();
    reduce(env);
    // the card leaving the screen and coming back, as the browser tells it
    watched = [];
    globalThis.IntersectionObserver = class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(target) {
        watched.push({ target, by: this, tell: (seen) => this.cb([{ target, isIntersecting: seen }], this) });
      }
      disconnect() {
        watched = watched.filter((w) => w.by !== this);
      }
      unobserve() {}
    };
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => {
    delete globalThis.IntersectionObserver;
    env.uninstall();
  });

  test('tapping a thing opens its details as the sheet', () => {
    tapKey(el, 'large');
    assert.ok(!details(el).hidden);
    assert.ok(details(el).hasClass('thoughtknot-sheet'));
    assert.match(details(el).textContent, /Large reader/);
  });

  test('it is fixed to the screen, so it stays in place while the note scrolls, over the card and at its width', () => {
    assert.equal(css(SHEET, 'position'), 'fixed');
    assert.match(css(SHEET, 'bottom'), /var\(--thoughtknot-sheet-bottom/);
    assert.match(css(SHEET, 'left'), /var\(--thoughtknot-sheet-left/);
    assert.match(css(SHEET, 'width'), /var\(--thoughtknot-sheet-width/);
    assert.ok(css(SHEET, 'z-index'), 'over the note');
    assert.match(css(SHEET, 'background'), /var\(--gn-bg\)/, 'the note does not show through');
    assert.equal(details(el).cssProps['--thoughtknot-sheet-left'], '0px');
    assert.equal(details(el).cssProps['--thoughtknot-sheet-width'], '700px');
  });

  test('its width counts its border and padding, so it is laid out exactly as wide as the card it was given', () => {
    assert.equal(css(SHEET, 'box-sizing'), 'border-box');
  });

  test('its foot is the foot of the note’s visible part, not of the window', async () => {
    const holder = env.doc.body.createDiv({ cls: 'markdown-preview-view' });
    holder.getBoundingClientRect = () => rect(40, 700);
    const shownEl = env.doc.createElement('div');
    holder.appendChild(shownEl);
    await drawInto(env, shownEl);
    // the card runs on below the note's visible part
    shownEl.querySelector('.thoughtknot-view').getBoundingClientRect = () => rect(300, 760);
    details(shownEl).getBoundingClientRect = laidOut(details(shownEl));
    tapKey(shownEl, 'q');
    assert.equal(details(shownEl).cssProps['--thoughtknot-sheet-bottom'], '100px', 'the window is 800 high');
    assert.ok(details(shownEl).hasClass('thoughtknot-sheet'));
  });

  test('when the card leaves the screen the sheet goes, and comes back with it', () => {
    tapKey(el, 'large');
    const card = el.querySelector('.thoughtknot-view');
    const w = watched.find((x) => x.target === card);
    assert.ok(w, 'the card is watched while the sheet is open');
    w.tell(false);
    assert.ok(details(el).hasClass('is-away'));
    assert.equal(css({ ...SHEET, classes: [...SHEET.classes, 'is-away'] }, 'display'), 'none');
    assert.equal(selected(el), 'large', 'the selection is kept meanwhile');
    w.tell(true);
    assert.ok(!details(el).hasClass('is-away'));
    labelled(details(el), 'Close details').click();
    assert.ok(!watched.some((x) => x.target === card), 'and no longer watched once closed');
  });

  test('scrolled while its card is away, the sheet is still the sheet when the card comes back, placed again', () => {
    const d = details(el),
      card = el.querySelector('.thoughtknot-view');
    d.getBoundingClientRect = laidOut(d);
    tapKey(el, 'large');
    const w = watched.find((x) => x.target === card);
    w.tell(false);
    for (const fn of env.doc.listeners.get('scroll') ?? []) fn({ type: 'scroll', target: env.doc.body });
    card.getBoundingClientRect = () => rect(100, 500);
    w.tell(true);
    assert.ok(d.hasClass('thoughtknot-sheet'), 'still the sheet');
    assert.ok(toggle(el), 'with its toggle');
    assert.equal(d.cssProps['--thoughtknot-sheet-bottom'], '300px', 'placed again over the card where it is now');
    labelled(d, 'Close details').click();
    card.getBoundingClientRect = () => rect(0, 400);
  });

  test('a card unloaded with its sheet open is no longer watched', async () => {
    const holder = env.doc.body.createDiv();
    const ctx = await drawInto(env, holder);
    tapKey(holder, 'large');
    const card = holder.querySelector('.thoughtknot-view');
    assert.ok(
      watched.some((x) => x.target === card),
      'watched while open',
    );
    for (const child of ctx.children) child.unload();
    assert.ok(!watched.some((x) => x.target === card), 'not once the card is gone');
  });
});

describe('where the sheet covers the whole drawing, the note scrolls the chosen thing up above it', () => {
  test('the note scrolls by as much as the thing’s foot is below the sheet’s top, and a little more', async () => {
    const env = await load();
    try {
      reduce(env);
      const holder = env.doc.body.createDiv({ cls: 'markdown-preview-view' });
      holder.getBoundingClientRect = () => rect(0, 800);
      holder.scrollTop = 0;
      const el = holder.createDiv();
      await drawInto(env, el);
      const vp = el.querySelector('.thoughtknot-viewport'),
        svg = el.querySelector('svg.thoughtknot-svg'),
        high = parseFloat(vp.cssProps['--thoughtknot-height']);
      // the drawing begins 100 pixels above the foot of the screen, and the sheet's top is above the drawing's
      vp.getBoundingClientRect = () => rect(700, 700 + high);
      el.querySelector('.thoughtknot-view').getBoundingClientRect = () => rect(660, 720 + high);
      const d = details(el);
      d.getBoundingClientRect = laidOut(d, 150);
      tapKey(el, 'q');
      assert.ok(d.hasClass('thoughtknot-sheet'));
      const { readNote } = await import('../../core/src/drawing.ts');
      const [{ loadEngine }, { draw }, { hitAreas, boundsOf }] = await Promise.all([
        import('../../core/src/engine.ts'),
        import('../../core/src/render.ts'),
        import('../../core/src/hits.ts'),
      ]);
      const areas = hitAreas(draw(readNote([GRAPH]).graphs.get('reader'), await loadEngine()).svg);
      const b = boundsOf(areas, el.querySelector('g.node[data-key="q"]').getAttribute('id'));
      const y = parseFloat(vp.cssProps['--thoughtknot-y']);
      assert.equal(y, 0, 'the drawing itself does not move');
      const foot = 700 + y + (b.y + b.height) * Number(svg.getAttribute('height'));
      assert.ok(Math.abs(holder.scrollTop - (foot - 650 + 8)) < 1e-6, `${holder.scrollTop} for a foot at ${foot}`);
    } finally {
      env.uninstall();
    }
  });
});

describe('the sheet follows its card and the window', () => {
  let env, el, d, card;
  before(async () => {
    env = await load();
    reduce(env);
    el = env.doc.body.createDiv();
    await drawInto(env, el);
    card = el.querySelector('.thoughtknot-view');
    d = details(el);
    d.getBoundingClientRect = laidOut(d);
  });
  after(() => env.uninstall());
  const prop = (k) => d.cssProps[`--thoughtknot-sheet-${k}`];

  test('over a card that ends above the foot of the screen, the sheet sits at the card’s foot, not below it', () => {
    card.getBoundingClientRect = () => rect(100, 500);
    tapKey(el, 'large');
    assert.ok(d.hasClass('thoughtknot-sheet'));
    assert.equal(prop('bottom'), '300px', 'the note below the card, and its caret, are not covered');
  });

  test('when the note scrolls, the sheet is placed again over its card', () => {
    card.getBoundingClientRect = () => rect(300, 700);
    for (const fn of env.doc.listeners.get('scroll') ?? []) fn({ type: 'scroll', target: env.doc.body });
    assert.equal(prop('bottom'), '100px');
    card.getBoundingClientRect = () => rect(300, 900);
    for (const fn of env.doc.listeners.get('scroll') ?? []) fn({ type: 'scroll', target: env.doc.body });
    assert.equal(prop('bottom'), '0px', 'at the foot of the screen once the card runs past it');
  });

  test('when the window changes size, the sheet is placed again at the card’s new place and width', () => {
    card.getBoundingClientRect = () => rect(300, 900, 40, 500);
    env.doc.defaultView.tell('resize');
    assert.equal(prop('left'), '40px');
    assert.equal(prop('width'), '500px');
  });

  test('when the card changes size, as its own resize watcher says, the sheet is placed again', () => {
    labelled(d, 'Close details').click();
    const was = env.doc.observers?.length ?? 0;
    tapKey(el, 'large');
    const mine = (env.doc.observers ?? []).slice(was);
    assert.ok(mine.length > 0, 'the card is watched for its size while the sheet is open');
    card.getBoundingClientRect = () => rect(300, 900, 10, 600);
    for (const o of mine) o.cb([]);
    assert.equal(prop('left'), '10px');
    assert.equal(prop('width'), '600px');
  });

  test('and the drawing pans again so the chosen thing stays clear: the sheet grown over it moves it up', () => {
    const vp = el.querySelector('.thoughtknot-viewport'),
      high = parseFloat(vp.cssProps['--thoughtknot-height']);
    vp.getBoundingClientRect = () => rect(800 - high, 800);
    card.getBoundingClientRect = () => rect(760 - high, 800);
    labelled(d, 'Close details').click();
    const y = () => parseFloat(vp.cssProps['--thoughtknot-y']);
    // A sheet with no height at first, covering nothing. Then it is taller, over the lower 90% of the drawing, where the
    // question is. (The graph runs down the page, the question at its foot.)
    d.getBoundingClientRect = laidOut(d, 0);
    tapKey(el, 'q');
    assert.equal(y(), 0, 'nothing covered, nothing moved');
    d.getBoundingClientRect = laidOut(d, high * 0.9);
    env.doc.defaultView.tell('resize');
    assert.ok(y() < 0, `moved up: ${y()}`);
  });
});

describe('where the sheet cannot be pinned, the details stay in the card', () => {
  let env;
  before(async () => {
    env = await load();
    reduce(env);
  });
  after(() => env.uninstall());

  test('in a container that moves fixed things, as a transform does, the sheet is not where it was put: the card keeps the details', async () => {
    const el = env.doc.body.createDiv();
    await drawInto(env, el);
    const d = details(el);
    // the browser lays it out 40 pixels off where it was put, as inside a transformed element
    d.getBoundingClientRect = () => {
      const r = laidOut(d)();
      return rect(r.top, r.bottom, r.left + 40, r.width);
    };
    tapKey(el, 'large');
    assert.ok(!d.hidden, 'the details are shown');
    assert.ok(!d.hasClass('thoughtknot-sheet'), 'in the card, not as the sheet');
    assert.ok(!labelled(d, 'Minimise details') && labelled(d, 'Close details'));
  });

  test('a sheet put where it was meant to be stays the sheet', async () => {
    const el = env.doc.body.createDiv();
    await drawInto(env, el);
    details(el).getBoundingClientRect = laidOut(details(el));
    tapKey(el, 'large');
    assert.ok(details(el).hasClass('thoughtknot-sheet'));
  });

  for (const where of ['canvas-node', 'hover-popover'])
    test(`in a ${where === 'canvas-node' ? 'canvas card' : 'hover preview'}, the details stay in the card`, async () => {
      const el = env.doc.body.createDiv({ cls: where }).createDiv();
      await drawInto(env, el);
      details(el).getBoundingClientRect = laidOut(details(el));
      tapKey(el, 'large');
      assert.ok(!details(el).hidden);
      assert.ok(!details(el).hasClass('thoughtknot-sheet'));
    });
});

describe('the sheet in Live Preview, inside the editor', () => {
  let env, content, el;
  before(async () => {
    env = await load();
    reduce(env);
    // as CodeMirror draws a block widget: inside its editable content, the widget itself not editable
    content = env.doc.body.createDiv({ cls: 'cm-content', attr: { contenteditable: 'true' } });
    el = content.createDiv({ cls: 'cm-embed-block', attr: { contenteditable: 'false' } }).createDiv();
    await drawInto(env, el);
    details(el).getBoundingClientRect = laidOut(details(el));
  });
  after(() => env.uninstall());

  test('Escape on the sheet’s toggle closes it: the widget is not the note being typed in', () => {
    tapKey(el, 'large');
    assert.ok(details(el).hasClass('thoughtknot-sheet'));
    const e = toggle(el).dispatch('keydown', { key: 'Escape' });
    assert.ok(details(el).hidden, 'closed');
    assert.ok(e.defaultPrevented);
  });

  test('a key typed in the note’s text, around the card, is never taken, and nothing listens for keys outside the card', () => {
    tapKey(el, 'large');
    assert.ok(details(el).hasClass('thoughtknot-sheet'), 'the sheet is open');
    const text = content.createDiv({ cls: 'cm-line' });
    for (const target of [content, text])
      for (const key of ['Escape', 'ArrowDown', 'Enter', 'a']) {
        const e = target.dispatch('keydown', { key });
        assert.equal(e.defaultPrevented, false, key);
      }
    assert.ok(!details(el).hidden, 'still open');
    assert.deepEqual(env.doc.listeners.get('keydown') ?? [], [], 'no key listener on the document');
    assert.deepEqual(env.doc.defaultView.listeners.get('keydown') ?? [], [], 'nor on the window');
  });
});

describe('the drawing pans so the chosen thing stays visible above the sheet', () => {
  let env, el, high;
  const BAR = 50;
  before(async () => {
    env = await load();
    reduce(env);
    el = (await show(env, fence(GRAPH))).el;
    high = parseFloat(el.querySelector('.thoughtknot-viewport').cssProps['--thoughtknot-height']);
    // the drawing fills the foot of an 800-pixel screen; the sheet, restored, covers its lower 60%, minimised a bar
    el.querySelector('.thoughtknot-viewport').getBoundingClientRect = () => ({
      top: 800 - high,
      bottom: 800,
      left: 0,
      right: 700,
      width: 700,
      height: high,
    });
    el.querySelector('.thoughtknot-view').getBoundingClientRect = () => rect(760 - high, 800);
    const d = details(el);
    d.getBoundingClientRect = () => {
      const h = d.hasClass('is-minimised') ? BAR : high * 0.6;
      return { top: 800 - h, bottom: 800, left: 0, right: 700, width: 700, height: h };
    };
  });
  after(() => env.uninstall());
  const y = () => parseFloat(el.querySelector('.thoughtknot-viewport').cssProps['--thoughtknot-y']);
  /** The foot of a thing on the screen, as the drawing is shown now. */
  const foot = async (key) => {
    const { hitAreas, boundsOf } = await import('../../core/src/hits.ts');
    const svg = el.querySelector('svg.thoughtknot-svg');
    const g = el.querySelector(`g.node[data-key="${key}"]`);
    const b = boundsOf(hitAreas(env.drawnSvg), g.getAttribute('id'));
    return 800 - high + y() + (b.y + b.height) * Number(svg.getAttribute('height'));
  };

  test('when it opens over the thing, the drawing moves up so the thing is above it, by no more than it covers', async () => {
    const { readNote } = await import('../../core/src/drawing.ts');
    const [{ loadEngine }, { draw }] = await Promise.all([
      import('../../core/src/engine.ts'),
      import('../../core/src/render.ts'),
    ]);
    env.drawnSvg = draw(readNote([GRAPH]).graphs.get('reader'), await loadEngine()).svg;
    let moved = false;
    for (const key of ['q', 'large', 'tablet', 'eyes']) {
      labelled(el, 'Fit').click();
      const under = (await foot(key)) > 800 - high * 0.6;
      tapKey(el, key);
      assert.ok((await foot(key)) <= 800 - high * 0.6 + 1e-6, `${key} is above the sheet`);
      assert.ok(y() <= 0 && y() >= -high * 0.6 - 1e-6, `${y()}`);
      moved ||= under;
    }
    assert.ok(moved, 'at least one thing was under the sheet when it opened');
  });

  test('when it changes size, the drawing moves again: minimised, it needs less room', async () => {
    labelled(el, 'Fit').click();
    const feet = [];
    for (const key of ['q', 'large', 'tablet', 'eyes']) feet.push([await foot(key), key]);
    tapKey(el, feet.sort((a, b) => b[0] - a[0])[0][1]);
    const restored = y();
    assert.ok(restored < 0, 'moved up for the restored sheet');
    toggle(el).click();
    assert.ok(details(el).hasClass('is-minimised'));
    assert.ok(y() > restored, 'less room taken');
    assert.ok(y() >= -BAR, `by no more than the bar: ${y()}`);
    toggle(el).click();
    assert.equal(y(), restored, 'restored, as before');
  });
});

describe('minimised to a bar, or restored to a panel that never fills the screen', () => {
  let env, el;
  before(async () => {
    env = await load();
    reduce(env);
    el = (await show(env, fence(GRAPH))).el;
    tapKey(el, 'large');
  });
  after(() => env.uninstall());

  test('restored, it shows the full details, and its toggle says it will minimise', () => {
    const t = labelled(details(el), 'Minimise details');
    assert.ok(t, 'the toggle in the header');
    assert.ok(details(el).querySelector('.thoughtknot-details-head').contains(t));
    assert.equal(t.getAttribute('aria-expanded'), 'true');
    assert.ok(!body(el).hidden);
    assert.ok(groupsRead(body(el)).includes('answers Which device?'));
  });

  test('minimised, it is a single bar with the thing’s name and kind, and its toggle says it will restore', () => {
    labelled(details(el), 'Minimise details').click();
    const t = labelled(details(el), 'Restore details');
    assert.ok(t);
    assert.equal(t.getAttribute('aria-expanded'), 'false');
    assert.ok(body(el).hidden, 'the details below the bar are hidden');
    const head = details(el).querySelector('.thoughtknot-details-head');
    assert.match(head.textContent, /Large reader/);
    assert.match(head.textContent, /Option/);
    t.click();
    assert.ok(!body(el).hidden);
  });

  test('restored, it scrolls within itself, and is never taller than its share of the screen', () => {
    const BODY = { tag: 'div', classes: ['thoughtknot-details-body'], ancestors: [SHEET] };
    assert.equal(css(BODY, 'overflow-y'), 'auto');
    const max = css(SHEET, 'max-height');
    assert.match(max, /^var\(--thoughtknot-sheet-max, 45vh\)/, max);
    const limit = parseFloat(details(el).cssProps['--thoughtknot-sheet-max']);
    assert.ok(limit > 0 && limit <= 800 * 0.45, `${limit}`);
  });
});

describe('it opens in the state last chosen, for the rest of the session', () => {
  let env;
  before(async () => {
    env = await load();
    reduce(env);
  });
  after(() => env.uninstall());

  test('minimised, closed and opened again, on another thing or in another card, it is still minimised', async () => {
    const a = (await show(env, fence(GRAPH))).el;
    tapKey(a, 'large');
    assert.ok(labelled(details(a), 'Minimise details'), 'restored at first');
    labelled(details(a), 'Minimise details').click();
    labelled(details(a), 'Close details').click();
    tapKey(a, 'q');
    assert.ok(details(a).hasClass('is-minimised'));
    const b = (await show(env, fence(GRAPH))).el;
    tapKey(b, 'eyes');
    assert.ok(details(b).hasClass('is-minimised'), 'in another card too');
    labelled(details(b), 'Restore details').click();
    tapKey(a, 'tablet');
    assert.ok(!details(a).hasClass('is-minimised'), 'restored is remembered too');
  });

  test('a new session opens it restored', async () => {
    const fresh = await load();
    try {
      const c = (await show(fresh, fence(GRAPH))).el;
      tapKey(c, 'large');
      assert.ok(details(c).hasClass('thoughtknot-sheet') && !details(c).hasClass('is-minimised'));
      assert.ok(labelled(details(c), 'Minimise details'));
    } finally {
      fresh.uninstall();
    }
  });
});

describe('a close button, Escape or clearing the selection closes it', () => {
  let env, el;
  before(async () => {
    env = await load();
    reduce(env);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('the close button closes it and clears the selection', () => {
    tapKey(el, 'large');
    assert.ok(details(el).hasClass('thoughtknot-sheet'), 'the sheet');
    labelled(details(el), 'Close details').click();
    assert.ok(details(el).hidden);
    assert.equal(selected(el), null);
  });

  test('Escape in the sheet closes it', () => {
    tapKey(el, 'large');
    const e = toggle(el).dispatch('keydown', { key: 'Escape' });
    assert.ok(details(el).hidden);
    assert.ok(e.defaultPrevented);
    assert.equal(selected(el), null);
  });

  test('Escape in the drawing, or a tap on empty space, clears the selection and closes it', () => {
    tapKey(el, 'large');
    assert.ok(details(el).hasClass('thoughtknot-sheet'), 'the sheet');
    el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'Escape' });
    assert.ok(details(el).hidden);
    tapKey(el, 'large');
    const vp = el.querySelector('.thoughtknot-viewport');
    const at = { target: vp, pointerId: 4, pointerType: 'touch', clientX: 5000, clientY: 5000, button: 0 };
    vp.dispatch('pointerdown', at);
    vp.dispatch('pointerup', at);
    assert.ok(details(el).hidden);
    assert.ok(!details(el).hasClass('thoughtknot-sheet'), 'no longer the sheet');
  });
});

describe('its toggle and close button are named, work by keyboard, and are 44 points on touch', () => {
  let env, el;
  before(async () => {
    env = await load();
    reduce(env);
    el = (await show(env, fence(GRAPH))).el;
    tapKey(el, 'large');
  });
  after(() => env.uninstall());

  test('each is a button of its own, named for screen readers, in the keyboard’s order', () => {
    for (const b of [toggle(el), labelled(details(el), 'Close details')]) {
      assert.equal(b.localName, 'button');
      assert.equal(b.getAttribute('type'), 'button');
      assert.ok(b.getAttribute('aria-label'));
      assert.notEqual(b.getAttribute('tabindex'), '-1');
    }
  });

  test('pressed from the keyboard — Enter or Space on a button is its click — each does its work', () => {
    toggle(el).click();
    assert.ok(details(el).hasClass('is-minimised'));
    toggle(el).click();
    labelled(details(el), 'Close details').click();
    assert.ok(details(el).hidden);
  });

  test('each is at least 44 points square', () => {
    const HEAD = { tag: 'div', classes: ['thoughtknot-details-head'], ancestors: [SHEET] };
    for (const cls of [[], ['thoughtknot-sheet-toggle']]) {
      const b = { tag: 'button', classes: ['clickable-icon', ...cls], ancestors: [HEAD, SHEET] };
      assert.equal(css(b, 'min-width'), '44px');
      assert.equal(css(b, 'min-height'), '44px');
    }
    assert.ok(toggle(el).hasClass('thoughtknot-sheet-toggle'), 'the toggle is drawn as such');
  });
});
