// The details sheet (editor spec §25, slice 3): in view mode a card's details open as a sheet pinned to the foot of the
// visible screen, over the card, staying while the note scrolls until it is closed or the card leaves the screen
// (sheet_pinned); the drawing pans so the chosen thing stays visible above it when it opens or changes size
// (sheet_keeps_thing_clear); a toggle in its header minimises it to a bar with the thing's name and kind, or restores the
// full details, scrolling within itself and never filling the screen (sheet_min_max); it opens in the state last chosen
// for the session (sheet_state_remembered); a close button, Escape or clearing the selection closes it (sheet_closed);
// and its toggle and close button are named, work by keyboard and are 44 points on touch (sheet_reachable). Keys typed in
// the note are never taken. The built plugin, against the stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { rules, winner } from './host/cascade.js';
import { load, GRAPH, show, styles } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const details = (el) => el.querySelector('.graph-note-details');
const body = (el) => details(el).querySelector('.graph-note-details-body');
const toggle = (el) => labelled(details(el), 'Minimise details') ?? labelled(details(el), 'Restore details');
const selected = (el) => el.querySelector('g.is-selected')?.getAttribute('data-key') ?? null;
const reduce = (env) => (env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: q.includes('reduce') }));
const all = rules(styles, 'styles.css');
/** What the stylesheet gives an element of the sheet, inside a card on the page. */
const css = (el, property) => {
  const card = { tag: 'div', classes: ['graph-note-view', 'is-note'] };
  return winner(
    all,
    { ...el, ancestors: [...(el.ancestors ?? []), card, { tag: 'div', classes: ['graph-note'] }] },
    property,
  )?.value;
};
const SHEET = { tag: 'div', classes: ['graph-note-details', 'graph-note-sheet'] };

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
    assert.ok(details(el).hasClass('graph-note-sheet'));
    assert.match(details(el).textContent, /Large reader/);
  });

  test('it is fixed to the screen, so it stays in place while the note scrolls, over the card and at its width', () => {
    assert.equal(css(SHEET, 'position'), 'fixed');
    assert.match(css(SHEET, 'bottom'), /var\(--graph-note-sheet-bottom/);
    assert.match(css(SHEET, 'left'), /var\(--graph-note-sheet-left/);
    assert.match(css(SHEET, 'width'), /var\(--graph-note-sheet-width/);
    assert.ok(css(SHEET, 'z-index'), 'over the note');
    assert.match(css(SHEET, 'background'), /var\(--background-primary\)/, 'the note does not show through');
    assert.equal(details(el).cssProps['--graph-note-sheet-left'], '0px');
    assert.equal(details(el).cssProps['--graph-note-sheet-width'], '700px');
  });

  test('its foot is the foot of the note’s visible part, not of the window', async () => {
    const holder = env.doc.body.createDiv({ cls: 'markdown-preview-view' });
    holder.getBoundingClientRect = () => ({ top: 40, bottom: 700, left: 0, right: 700, width: 700, height: 660 });
    const shownEl = env.doc.createElement('div');
    holder.appendChild(shownEl);
    const { fakeContext } = await import('./host/fake-obsidian.js');
    const note = fence(GRAPH);
    await env.state.processors.get('gql')(GRAPH, shownEl, fakeContext(note, 0));
    tapKey(shownEl, 'q');
    assert.equal(details(shownEl).cssProps['--graph-note-sheet-bottom'], '100px', 'the window is 800 high');
  });

  test('when the card leaves the screen the sheet goes, and comes back with it', () => {
    tapKey(el, 'large');
    const card = el.querySelector('.graph-note-view');
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
});

describe('the drawing pans so the chosen thing stays visible above the sheet', () => {
  let env, el, high;
  const BAR = 50;
  before(async () => {
    env = await load();
    reduce(env);
    el = (await show(env, fence(GRAPH))).el;
    high = parseFloat(el.querySelector('.graph-note-viewport').cssProps['--graph-note-height']);
    // the drawing fills the foot of an 800-pixel screen; the sheet, restored, covers its lower 60%, minimised a bar
    el.querySelector('.graph-note-viewport').getBoundingClientRect = () => ({
      top: 800 - high,
      bottom: 800,
      left: 0,
      right: 700,
      width: 700,
      height: high,
    });
    const d = details(el);
    d.getBoundingClientRect = () => {
      const h = d.hasClass('is-minimised') ? BAR : high * 0.6;
      return { top: 800 - h, bottom: 800, left: 0, right: 700, width: 700, height: h };
    };
  });
  after(() => env.uninstall());
  const y = () => parseFloat(el.querySelector('.graph-note-viewport').cssProps['--graph-note-y']);
  /** The foot of a thing on the screen, as the drawing is shown now. */
  const foot = async (key) => {
    const { hitAreas, boundsOf } = await import('../../core/src/hits.ts');
    const svg = el.querySelector('svg.graph-note-svg');
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
    assert.ok(details(el).querySelector('.graph-note-details-head').contains(t));
    assert.equal(t.getAttribute('aria-expanded'), 'true');
    assert.ok(!body(el).hidden);
    assert.match(body(el).textContent, /answers Which device\?/);
  });

  test('minimised, it is a single bar with the thing’s name and kind, and its toggle says it will restore', () => {
    labelled(details(el), 'Minimise details').click();
    const t = labelled(details(el), 'Restore details');
    assert.ok(t);
    assert.equal(t.getAttribute('aria-expanded'), 'false');
    assert.ok(body(el).hidden, 'the details below the bar are hidden');
    const head = details(el).querySelector('.graph-note-details-head');
    assert.match(head.textContent, /Large reader/);
    assert.match(head.textContent, /Option/);
    t.click();
    assert.ok(!body(el).hidden);
  });

  test('restored, it scrolls within itself, and is never taller than its share of the screen', () => {
    const BODY = { tag: 'div', classes: ['graph-note-details-body'], ancestors: [SHEET] };
    assert.equal(css(BODY, 'overflow-y'), 'auto');
    const max = css(SHEET, 'max-height');
    assert.match(max, /^min\(45vh, var\(--graph-note-sheet-max/, max);
    const limit = parseFloat(details(el).cssProps['--graph-note-sheet-max']);
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
      assert.ok(details(c).hasClass('graph-note-sheet') && !details(c).hasClass('is-minimised'));
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
    assert.ok(details(el).hasClass('graph-note-sheet'), 'the sheet');
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
    assert.ok(details(el).hasClass('graph-note-sheet'), 'the sheet');
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
    assert.ok(details(el).hidden);
    tapKey(el, 'large');
    const vp = el.querySelector('.graph-note-viewport');
    const at = { target: vp, pointerId: 4, pointerType: 'touch', clientX: 5000, clientY: 5000, button: 0 };
    vp.dispatch('pointerdown', at);
    vp.dispatch('pointerup', at);
    assert.ok(details(el).hidden);
    assert.ok(!details(el).hasClass('graph-note-sheet'), 'no longer the sheet');
  });

  test('keys typed in the note are never taken: Escape there leaves the sheet open and the key to the editor', () => {
    tapKey(el, 'large');
    assert.ok(details(el).hasClass('graph-note-sheet'), 'the sheet is open');
    const editor = env.doc.body.createDiv({ cls: 'cm-content', attr: { contenteditable: 'true' } });
    for (const key of ['Escape', 'ArrowDown', 'Enter', 'a']) {
      const e = editor.dispatch('keydown', { key });
      assert.equal(e.defaultPrevented, false, key);
    }
    assert.ok(!details(el).hidden, 'still open');
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
    const HEAD = { tag: 'div', classes: ['graph-note-details-head'], ancestors: [SHEET] };
    for (const cls of [[], ['graph-note-sheet-toggle']]) {
      const b = { tag: 'button', classes: ['clickable-icon', ...cls], ancestors: [HEAD, SHEET] };
      assert.equal(css(b, 'min-width'), '44px');
      assert.equal(css(b, 'min-height'), '44px');
    }
    assert.ok(toggle(el).hasClass('graph-note-sheet-toggle'), 'the toggle is drawn as such');
  });
});
