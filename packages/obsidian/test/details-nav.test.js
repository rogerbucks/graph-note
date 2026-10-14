// Finding your way from the details (editor spec §25, slice 3): a thing's links listed by relationship type and
// direction, in words with a count (details_links_listed); choosing one selects it, shows its details and brings it into
// view, keeping the zoom unless the thing would be too small to read (details_choose_moves), briefly animated, and at once
// when the system asks for reduced motion (details_move_motion); a trail of the things chosen, with back and forward
// (details_trail); an arrow at the edge pointing to a selection out of view (selection_pointer); and, in view mode, the
// details on screen without covering the thing chosen (details_on_screen). The built plugin, against the stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, load as loadCard, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { editing, tapKey } from './host/inspector-steps.js';
import { PATH, NOTE } from './host/card-notes.js';

before(() => build());

const { readNote } = await import('../../core/src/drawing.ts');
const [{ loadEngine }, { draw }, { hitAreas, boundsOf }, { MOVE_MS, READABLE_SCALE }] = await Promise.all([
  import('../../core/src/engine.ts'),
  import('../../core/src/render.ts'),
  import('../../core/src/hits.ts'),
  import('../../core/src/details-nav.ts'),
]);
const drawn = draw(readNote([GRAPH]).graphs.get('reader'), await loadEngine());
const areas = hitAreas(drawn.svg);
const NAMES = { q: 'Which device?', large: 'Large reader', tablet: 'Tablet', eyes: 'Easy on the eyes' };

const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const details = (el) => el.querySelector('.graph-note-details');
const groups = (el) => details(el).querySelectorAll('.graph-note-link-group');
const choice = (el, name) =>
  groups(el)
    .flatMap((g) => g.querySelectorAll('button'))
    .find((b) => b.textContent === name);
/** The drawing as it is shown now: its place, its size and the viewport's height. */
const shown = (el) => {
  const vp = el.querySelector('.graph-note-viewport'),
    svg = el.querySelector('svg.graph-note-svg');
  return {
    x: parseFloat(vp.cssProps['--graph-note-x']),
    y: parseFloat(vp.cssProps['--graph-note-y']),
    width: Number(svg.getAttribute('width')),
    height: Number(svg.getAttribute('height')),
    high: parseFloat(vp.cssProps['--graph-note-height']),
  };
};
const scale = (el) => shown(el).width / drawn.width;
/** Where a thing is in the viewport, as shown now. */
const placed = (el, key) => {
  const v = shown(el),
    b = boundsOf(areas, thing(el, key).getAttribute('id'));
  return {
    left: v.x + b.x * v.width,
    top: v.y + b.y * v.height,
    right: v.x + (b.x + b.width) * v.width,
    bottom: v.y + (b.y + b.height) * v.height,
  };
};
const inView = (el, key) => {
  const p = placed(el, key);
  return p.left >= -1e-6 && p.top >= -1e-6 && p.right <= 700 + 1e-6 && p.bottom <= shown(el).high + 1e-6;
};
/** The system asks for reduced motion, or not. */
const motion = (env, reduce) =>
  (env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: reduce && q === '(prefers-reduced-motion: reduce)' }));
/** Animation frames held for the test to run, each at a time it chooses. */
const frames = (env) => {
  const held = [];
  env.doc.defaultView.requestAnimationFrame = (f) => held.push(f);
  return held;
};
const zoomIn = (el, n) => {
  for (let i = 0; i < n; i++) labelled(el, 'Zoom in').click();
};
/** Opens the details of each thing in turn until one lists a linked thing out of view: that thing and its button. */
const outOfView = (el) => {
  for (const from of Object.keys(NAMES)) {
    tapKey(el, from);
    for (const key of Object.keys(NAMES)) {
      const b = choice(el, NAMES[key]);
      if (b && !inView(el, key)) return { from, key, b };
    }
  }
  return null;
};

describe('a thing’s links are listed by relationship type and direction, in words, with a count', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('two links of one type coming in are one group: its reading back, the things, and how many', () => {
    tapKey(el, 'q');
    assert.deepEqual(
      groups(el).map((g) => g.textContent),
      ['is answered by Large reader and Tablet (2)'],
    );
  });

  test('links out of different types are a group each, read forward, with no count for one', () => {
    tapKey(el, 'eyes');
    assert.deepEqual(
      groups(el).map((g) => g.textContent),
      ['favours Large reader', 'counts against Tablet'],
    );
  });

  test('links out come before links in, each under its heading', () => {
    tapKey(el, 'large');
    const text = details(el).textContent;
    assert.deepEqual(
      groups(el).map((g) => g.textContent),
      ['answers Which device?', 'is favoured by Easy on the eyes'],
    );
    assert.ok(text.indexOf('Links out') < text.indexOf('answers Which device?'));
    assert.ok(text.indexOf('Links in') < text.indexOf('is favoured by'));
  });

  test('each linked thing and each link in a group is a button, named, that the keyboard reaches', () => {
    tapKey(el, 'q');
    const [group] = groups(el);
    const buttons = group.querySelectorAll('button');
    assert.deepEqual(
      buttons.map((b) => b.textContent || b.getAttribute('aria-label')),
      ['Large reader', 'Link: Large reader answers Which device?', 'Tablet', 'Link: Tablet answers Which device?'],
    );
    for (const b of buttons) {
      assert.equal(b.getAttribute('type'), 'button');
      assert.notEqual(b.getAttribute('tabindex'), '-1');
    }
  });

  test('two links of one type to the same thing name it once, with a button for each link', async () => {
    const twice = `// graph: team · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(bob)-[:REPORTS_TO]->(ann),
(bob)-[:REPORTS_TO {since: 2025}]->(ann)`;
    const c = (await show(env, fence(twice))).el;
    tapKey(c, 'ann');
    assert.deepEqual(
      groups(c).map((g) => g.textContent),
      ['is reported to by Bob (2)'],
    );
    assert.deepEqual(
      groups(c)[0]
        .querySelectorAll('button')
        .map((b) => b.textContent || b.getAttribute('aria-label')),
      ['Bob', 'Link: Bob reports to Ann', 'Link: Bob reports to Ann'],
    );
  });

  test('the inspector lists them the same way while the block is edited', async () => {
    const card = await loadCard({ files: { [PATH]: NOTE } });
    try {
      const c = await editing(card);
      tapKey(c, 'q');
      assert.ok(c.querySelector('.graph-note-inspector, .metadata-container'), 'the inspector is open');
      assert.deepEqual(
        groups(c).map((g) => g.textContent),
        ['is answered by Large reader'],
      );
    } finally {
      card.uninstall();
    }
  });
});

describe('choosing a linked thing or a link in the list', () => {
  let env, el;
  before(async () => {
    env = await load();
    motion(env, true);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('a linked thing out of view becomes the selection, its details open and it comes into view, at the same zoom', () => {
    zoomIn(el, 8);
    const found = outOfView(el);
    assert.ok(found, 'zoomed in far enough that a linked thing is out of view');
    const zoom = scale(el);
    found.b.click();
    assert.ok(thing(el, found.key).hasClass('is-selected'), 'the selection');
    assert.equal(details(el).getAttribute('aria-label'), `Details of ${NAMES[found.key]}`);
    assert.ok(inView(el, found.key), 'in view');
    assert.ok(Math.abs(scale(el) - zoom) < 1e-9, 'the zoom kept');
  });

  test('a link chosen is the selection, and its details show its two ends', () => {
    tapKey(el, 'q');
    labelled(details(el), 'Link: Tablet answers Which device?').click();
    assert.ok(el.querySelector('g.edge[data-link="1"]').hasClass('is-selected'));
    assert.match(details(el).textContent, /From: Tablet/);
    // and an end of the link is a choice too
    choice(el, 'Tablet').click();
    assert.ok(thing(el, 'tablet').hasClass('is-selected'));
  });

  test('a link chosen while the legend hides its type shows the whole graph first, so it is chosen in sight', () => {
    labelled(el, 'Fit').click();
    labelled(el, 'Filter by kind or link').click();
    const entry = (label) =>
      el.querySelectorAll('.graph-note-filter button').find((b) => b.textContent.startsWith(label));
    entry('favours').click();
    entry('favours').click();
    const link = el.querySelector('g.edge[data-link="2"]');
    assert.ok(link.hasClass('graph-note-hidden'), 'hidden by the legend');
    tapKey(el, 'eyes');
    labelled(details(el), 'Link: Easy on the eyes favours Large reader').click();
    assert.ok(!link.hasClass('graph-note-hidden'), 'shown again');
    assert.ok(link.hasClass('is-selected'), 'and selected');
  });
});

// zooming out stops at the fit (zoom_out_to_fit), so only a drawing that fits its card below a readable scale is ever
// shown too small to read: a narrow card's
describe('choosing a linked thing in a narrow card', () => {
  let env, el;
  before(async () => {
    env = await load({ width: 200 });
    motion(env, true);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('a thing too small to read is brought up to a scale where it can be read', () => {
    for (let i = 0; i < 20; i++) labelled(el, 'Zoom out').click();
    assert.ok(scale(el) < READABLE_SCALE, 'too small to read');
    tapKey(el, 'q');
    choice(el, 'Tablet').click();
    assert.ok(Math.abs(scale(el) - READABLE_SCALE) < 1e-9, `${scale(el)}`);
    assert.ok(inView(el, 'tablet'));
  });
});

describe('the move to a chosen thing', () => {
  let env, el, found;
  before(async () => {
    env = await load();
    motion(env, true);
    el = (await show(env, fence(GRAPH))).el;
    zoomIn(el, 8);
  });
  after(() => env.uninstall());

  test('is briefly animated: frame by frame from where the view was to the thing, then it stops', () => {
    found = outOfView(el);
    assert.ok(found);
    motion(env, false);
    const held = frames(env);
    const was = shown(el);
    found.b.click();
    assert.deepEqual(shown(el), was, 'not there at once');
    assert.equal(held.length, 1, 'a frame asked for');
    held.shift()(1000);
    held.shift()(1000 + MOVE_MS / 2);
    const half = shown(el);
    assert.ok(half.x !== was.x || half.y !== was.y, 'on its way');
    assert.ok(!inView(el, found.key) || half.x !== was.x, 'between');
    held.shift()(1000 + MOVE_MS);
    assert.ok(inView(el, found.key), 'there at the end');
    assert.equal(held.length, 0, 'and no more frames');
  });

  test('motion is never the only cue: the thing is selected and its details named before the view moves', () => {
    zoomIn(el, 8);
    motion(env, true);
    found = outOfView(el);
    motion(env, false);
    const held = frames(env);
    found.b.click();
    assert.ok(thing(el, found.key).hasClass('is-selected'));
    assert.equal(thing(el, found.key).getAttribute('aria-pressed'), 'true');
    assert.equal(details(el).getAttribute('aria-label'), `Details of ${NAMES[found.key]}`);
    assert.equal(details(el).getAttribute('aria-live'), 'polite', 'and said to screen readers');
    for (let t = 5000; held.length; t += MOVE_MS) held.shift()(t);
  });

  test('a wheel or a zoom key while it moves takes over: the move stops where the zoom left the view', () => {
    const vp = el.querySelector('.graph-note-viewport');
    for (const how of ['wheel', 'key']) {
      zoomIn(el, 8);
      motion(env, true);
      found = outOfView(el);
      assert.ok(found, how);
      motion(env, false);
      const held = frames(env);
      found.b.click();
      held.shift()(1000);
      held.shift()(1000 + MOVE_MS / 4);
      if (how === 'wheel') vp.dispatch('wheel', { target: vp, deltaY: -100, ctrlKey: true, clientX: 10, clientY: 10 });
      else vp.dispatch('keydown', { target: vp, key: '-' });
      const left = shown(el);
      for (let t = 1000 + MOVE_MS / 2; held.length; t += MOVE_MS / 4) held.shift()(t);
      assert.deepEqual(shown(el), left, `${how}: the move did not carry on against it`);
    }
  });

  test('is instant when the system asks for reduced motion: there at once, and no frame asked for', () => {
    zoomIn(el, 8);
    motion(env, true);
    found = outOfView(el);
    const held = frames(env);
    found.b.click();
    assert.ok(inView(el, found.key));
    assert.equal(held.length, 0);
  });
});

describe('the trail of things chosen', () => {
  let env, el;
  before(async () => {
    env = await load();
    motion(env, true);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());
  const selected = () => el.querySelector('g.is-selected')?.getAttribute('data-key');

  test('back and forward retrace a walk through the graph', () => {
    tapKey(el, 'q');
    assert.equal(labelled(details(el), 'Back to Which device?'), undefined, 'nothing to go back to yet');
    choice(el, 'Tablet').click();
    choice(el, 'Easy on the eyes').click();
    labelled(details(el), 'Back to Tablet').click();
    assert.equal(selected(), 'tablet');
    labelled(details(el), 'Back to Which device?').click();
    assert.equal(selected(), 'q');
    labelled(details(el), 'Forward to Tablet').click();
    assert.equal(selected(), 'tablet');
    labelled(details(el), 'Forward to Easy on the eyes').click();
    assert.equal(selected(), 'eyes');
  });

  test('a link chosen is a step too, named as its link', () => {
    tapKey(el, 'q');
    labelled(details(el), 'Link: Large reader answers Which device?').click();
    choice(el, 'Large reader').click();
    assert.ok(labelled(details(el), 'Back to the link Large reader answers Which device?'));
  });

  test('a thing tapped in the drawing starts a new trail; closing the details forgets it', () => {
    tapKey(el, 'q');
    choice(el, 'Tablet').click();
    tapKey(el, 'large');
    assert.equal(details(el).querySelector('.graph-note-trail'), null, 'no steps to retrace');
    choice(el, 'Which device?').click();
    labelled(details(el), 'Close details').click();
    tapKey(el, 'q');
    assert.equal(details(el).querySelector('.graph-note-trail'), null);
  });
});

describe('an arrow to a selection out of view', () => {
  let env, el;
  before(async () => {
    env = await load();
    motion(env, true);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());
  const arrow = () => el.querySelector('.graph-note-pointer');

  test('none while the selection is in view', () => {
    tapKey(el, 'q');
    assert.ok(!arrow() || arrow().hidden);
  });

  test('when the selection is out of view, an arrow at the edge points to it, named for it; tapped, it brings it into view', () => {
    let key = null;
    for (const k of Object.keys(NAMES)) {
      labelled(el, 'Fit').click();
      tapKey(el, k);
      zoomIn(el, 8);
      if (!inView(el, k)) {
        key = k;
        break;
      }
    }
    assert.ok(key, 'a selection zoomed out of view');
    const a = arrow();
    assert.ok(a && !a.hidden, 'the arrow shows');
    assert.equal(a.getAttribute('aria-label'), `Bring ${NAMES[key]} into view`);
    assert.ok(a.cssProps['--graph-note-pointer-angle'].endsWith('deg'));
    const x = parseFloat(a.cssProps['--graph-note-pointer-x']),
      y = parseFloat(a.cssProps['--graph-note-pointer-y']);
    assert.ok(x >= 0 && x <= 700 && y >= 0 && y <= shown(el).high, 'inside the view, at its edge');
    // a tap on the arrow is not a tap on empty space: the selection stays
    const vp = el.querySelector('.graph-note-viewport');
    const at = { target: a, pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, button: 0 };
    vp.dispatch('pointerdown', at);
    vp.dispatch('pointerup', at);
    a.click();
    assert.ok(thing(el, key).hasClass('is-selected'), 'still selected');
    assert.ok(inView(el, key), 'brought into view');
    assert.ok(a.hidden, 'and the arrow goes');
  });

  test('clearing the selection takes the arrow away', () => {
    for (const k of Object.keys(NAMES)) {
      labelled(el, 'Fit').click();
      tapKey(el, k);
      zoomIn(el, 8);
      if (!inView(el, k)) break;
    }
    assert.ok(arrow() && !arrow().hidden, 'the arrow shows');
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
    assert.ok(arrow().hidden);
  });
});

describe('in view mode, details in a tall card show on screen without covering the thing chosen', () => {
  let env, el;
  before(async () => {
    env = await load();
    motion(env, true);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('the details open on screen, and the drawing pans so the thing chosen is above them', () => {
    const vp = el.querySelector('.graph-note-viewport'),
      high = shown(el).high;
    // the card runs off the foot of an 800-pixel screen: its drawing is in the screen's last `high` pixels, and the
    // details, pinned to the foot of the screen, are half as tall as the drawing
    const sheet = high / 2;
    vp.getBoundingClientRect = () => ({ top: 800 - high, bottom: 800, left: 0, right: 700, width: 700, height: high });
    el.querySelector('.graph-note-view').getBoundingClientRect = () => ({
      top: 760 - high,
      bottom: 900,
      left: 0,
      right: 700,
      width: 700,
      height: 140 + high,
    });
    details(el).getBoundingClientRect = () => ({
      top: 800 - sheet,
      bottom: 800,
      left: 0,
      right: 700,
      width: 700,
      height: sheet,
    });
    const lowest = Object.keys(NAMES).sort((a, b) => placed(el, b).bottom - placed(el, a).bottom)[0];
    assert.ok(800 - high + placed(el, lowest).bottom > 800 - sheet, 'the lowest thing is where the details will be');
    tapKey(el, lowest);
    assert.ok(details(el).hasClass('graph-note-sheet'), 'the details are the sheet, on screen');
    assert.ok(!details(el).hidden);
    const p = placed(el, lowest);
    assert.ok(800 - high + p.bottom <= 800 - sheet + 1e-6, `above the details: ${p.bottom} of ${high}`);
    assert.ok(p.top >= -1e-6, 'and still in its drawing');
  });

  test('a thing already above the details stays where it is', () => {
    const highest = Object.keys(NAMES).sort((a, b) => placed(el, a).top - placed(el, b).top)[0];
    labelled(details(el), 'Close details').click();
    const was = shown(el);
    tapKey(el, highest);
    assert.ok(details(el).hasClass('graph-note-sheet'), 'the sheet is open');
    assert.deepEqual(shown(el), was);
  });

  test('while the block is edited the details are the inspector, in the card, not the sheet', async () => {
    const card = await loadCard({ files: { [PATH]: NOTE } });
    try {
      const c = await editing(card);
      tapKey(c, 'q');
      await until(() => !details(c).hidden);
      assert.ok(!details(c).hasClass('graph-note-sheet'));
    } finally {
      card.uninstall();
    }
  });
});
