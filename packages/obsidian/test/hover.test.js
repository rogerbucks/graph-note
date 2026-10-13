// Hover and its stand-ins (editor spec §25, slice 3): pointing at a thing or a link highlights it, and for a link the two
// things it joins, on top of any focus, for as long as the pointer stays; the same highlight follows keyboard focus, and
// on touch the tap that selects gives it, so nothing depends on hover (§5); and it never moves, resizes or re-lays the
// drawing. The built plugin, loaded against the stand-ins for the page.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { rules } from './host/cascade.js';
import { load, GRAPH, show, styles } from './host/view-notes.js';

before(() => build());

// the links, in order: 0 large→q, 1 tablet→q, 2 eyes→large, 3 eyes→tablet
const HOT = 'graph-note-hot';
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const link = (el, n) => el.querySelector(`g.edge[data-link="${n}"]`);
const hot = (el) => [...el.querySelectorAll('g.node'), ...el.querySelectorAll('g.edge')].filter((g) => g.hasClass(HOT));
const hotThings = (el) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.hasClass(HOT))
    .map((g) => g.getAttribute('data-key'))
    .sort();
const hotLinks = (el) =>
  el
    .querySelectorAll('g.edge')
    .filter((g) => g.hasClass(HOT))
    .map((g) => g.getAttribute('data-link'));
const over = (g, pointerType = 'mouse') => g.dispatch('pointerover', { target: g.children[0] ?? g, pointerType });
const out = (g, pointerType = 'mouse') => g.dispatch('pointerout', { target: g.children[0] ?? g, pointerType });
const tap = (el, g, pointerId = 3) => {
  const vp = el.querySelector('.graph-note-viewport');
  vp.dispatch('pointerdown', { target: g, pointerId, pointerType: 'touch', clientX: 20, clientY: 20, button: 0 });
  vp.dispatch('pointerup', { target: g, pointerId, pointerType: 'touch', clientX: 21, clientY: 20, button: 0 });
};
/** Everything that places or sizes the drawing: each element's attributes bar its class and pressed state, and the viewport’s own. */
const everything = (e) => [e, ...e.children.flatMap(everything)];
const geometry = (el) => {
  const svg = el.querySelector('svg.graph-note-svg'),
    all = everything(svg);
  return JSON.stringify([
    all.map((e) => [e.localName, [...e.attributes].filter(([k]) => k !== 'class' && k !== 'aria-pressed').sort()]),
    el.querySelector('.graph-note-viewport').cssProps,
  ]);
};

describe('pointing at a thing or a link', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('pointing at a thing highlights it, and nothing else', () => {
    over(thing(el, 'large'));
    assert.deepEqual(hotThings(el), ['large']);
    assert.deepEqual(hotLinks(el), []);
  });

  test('for as long as the pointer stays: it goes when the pointer leaves', () => {
    out(thing(el, 'large'));
    assert.equal(hot(el).length, 0);
    over(thing(el, 'eyes'));
    assert.deepEqual(hotThings(el), ['eyes']);
    out(thing(el, 'eyes'));
    assert.equal(hot(el).length, 0);
  });

  test('moving from one thing to the next leaves only the next highlighted', () => {
    over(thing(el, 'q'));
    out(thing(el, 'q'));
    over(thing(el, 'tablet'));
    assert.deepEqual(hotThings(el), ['tablet']);
    out(thing(el, 'tablet'));
  });

  test('pointing at a link highlights it and the two things it joins', () => {
    over(link(el, 2));
    assert.deepEqual(hotLinks(el), ['2']);
    assert.deepEqual(hotThings(el), ['eyes', 'large']);
    out(link(el, 2));
    assert.equal(hot(el).length, 0);
  });

  test('moving about inside a thing, between its box and its words, does not drop the highlight', () => {
    const box = thing(el, 'large');
    over(box);
    box.dispatch('pointerout', { target: box.children[0], relatedTarget: box.children[1], pointerType: 'mouse' });
    assert.deepEqual(hotThings(el), ['large']);
    out(box);
  });

  test('pointing at empty space highlights nothing: moving on to it from a thing takes the highlight away', () => {
    const vp = el.querySelector('.graph-note-viewport');
    over(thing(el, 'q'));
    assert.deepEqual(hotThings(el), ['q'], 'highlighted under the pointer');
    vp.dispatch('pointerover', { target: vp, pointerType: 'mouse' });
    assert.equal(hot(el).length, 0);
  });
});

describe('on top of any focus', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
    tap(el, thing(el, 'large'));
  });
  after(() => env.uninstall());

  test('a faded thing pointed at comes forward while the pointer stays, and fades again when it goes', () => {
    const tablet = thing(el, 'tablet');
    assert.ok(tablet.hasClass('graph-note-dim'), 'faded by the focus on Large reader');
    over(tablet);
    assert.ok(tablet.hasClass(HOT));
    assert.ok(!tablet.hasClass('graph-note-dim'), 'at full strength under the pointer');
    out(tablet);
    assert.ok(!tablet.hasClass(HOT));
    assert.ok(tablet.hasClass('graph-note-dim'), 'the focus is as it was');
  });

  test('the focus itself is not moved by it: the same things stay kept', () => {
    const keptNow = () =>
      el
        .querySelectorAll('g.node')
        .filter((g) => g.hasClass('graph-note-kept'))
        .map((g) => g.getAttribute('data-key'))
        .sort();
    const before = keptNow();
    assert.deepEqual(before, ['eyes', 'large', 'q']);
    over(thing(el, 'tablet'));
    assert.deepEqual(keptNow(), before);
    out(thing(el, 'tablet'));
  });

  test('a link pointed at in a faded part comes forward with the two things it joins', () => {
    const l = link(el, 3);
    assert.ok(l.hasClass('graph-note-dim'));
    over(l);
    assert.ok(!l.hasClass('graph-note-dim') && l.hasClass(HOT));
    assert.ok(!thing(el, 'tablet').hasClass('graph-note-dim') && thing(el, 'tablet').hasClass(HOT));
    out(l);
  });
});

describe('nothing depends on hover', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('keyboard focus on a thing gives the same highlight, and leaving it takes it away', () => {
    thing(el, 'eyes').focus();
    assert.deepEqual(hotThings(el), ['eyes']);
    thing(el, 'eyes').blur();
    assert.equal(hot(el).length, 0);
  });

  test('keyboard focus on a link highlights it and the two things it joins', () => {
    link(el, 0).focus();
    assert.deepEqual(hotLinks(el), ['0']);
    assert.deepEqual(hotThings(el), ['large', 'q']);
    link(el, 0).blur();
    assert.equal(hot(el).length, 0);
  });

  test('moving the keyboard focus from one to the next moves the highlight with it', () => {
    thing(el, 'q').focus();
    thing(el, 'tablet').focus();
    assert.deepEqual(hotThings(el), ['tablet']);
    thing(el, 'tablet').blur();
  });

  test('on touch, the tap that selects gives it, and it stays until something else is chosen', () => {
    // a touch brings pointer events before the tap: those are not a hover
    over(thing(el, 'q'), 'touch');
    assert.equal(hot(el).length, 0, 'a finger is not hovering');
    tap(el, thing(el, 'tablet'));
    assert.deepEqual(hotThings(el), ['tablet']);
    out(thing(el, 'tablet'), 'touch');
    assert.deepEqual(hotThings(el), ['tablet'], 'the finger lifting does not take it away');
    tap(el, link(el, 3), 4);
    assert.deepEqual(hotLinks(el), ['3']);
    assert.deepEqual(hotThings(el), ['eyes', 'tablet']);
  });

  test('on touch, emptying the selection takes the highlight with it', () => {
    tap(el, thing(el, 'eyes'), 5);
    assert.ok(hot(el).length > 0, 'the tap gave the highlight');
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
    assert.equal(hot(el).length, 0);
  });

  test('a click’s focus is not the keyboard’s, but tabbing away and back is: the highlight is there again', () => {
    const vp = el.querySelector('.graph-note-viewport'),
      g = thing(el, 'q');
    // a click: the pointer goes down on the thing, which takes the focus, and it is selected
    vp.dispatch('pointerdown', { target: g, pointerId: 6, pointerType: 'mouse', clientX: 20, clientY: 20, button: 0 });
    g.focus();
    vp.dispatch('pointerup', { target: g, pointerId: 6, pointerType: 'mouse', clientX: 20, clientY: 20, button: 0 });
    assert.equal(hot(el).length, 0, 'nothing is pointed at, and a click’s focus is not a keyboard’s');
    // Tab to something outside the drawing, and back to the thing
    const outside = el.querySelectorAll('button')[0];
    outside.focus();
    g.focus();
    assert.deepEqual(hotThings(el), ['q'], 'keyboard focus on it, highlighted');
    g.blur();
  });

  test('a thing can be selected from the keyboard alone and it is highlighted as a hover would', () => {
    const g = thing(el, 'large');
    g.dispatch('keydown', { key: 'Tab' }); // the keyboard takes over from the touch before it
    g.focus();
    g.dispatch('keydown', { key: 'Enter' });
    assert.ok(g.hasClass('is-selected') && g.hasClass(HOT));
  });

  test('everything that can be pointed at can be reached from the keyboard', () => {
    for (const g of [...el.querySelectorAll('g.node'), ...el.querySelectorAll('g.edge[data-link]')])
      assert.equal(g.getAttribute('tabindex'), '0', g.getAttribute('aria-label'));
  });
});

describe('a highlight never moves, resizes or re-lays the drawing', () => {
  let env, el, laid;
  before(async () => {
    env = await load();
    laid = 0;
    const layout = env.plugin.layout.bind(env.plugin);
    env.plugin.layout = (...args) => (laid++, layout(...args));
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('pointing, leaving, keyboard focus and a tap leave every size and place as they were, and ask for no new layout', () => {
    const was = geometry(el),
      drawn = laid;
    assert.ok(drawn > 0, 'the layout is counted');
    for (const g of [thing(el, 'q'), link(el, 1), thing(el, 'eyes'), link(el, 3)]) {
      over(g);
      assert.ok(hot(el).length >= 1);
      assert.equal(geometry(el), was, 'while pointed at');
      out(g);
      g.focus();
      assert.equal(geometry(el), was, 'while focused');
      g.blur();
    }
    tap(el, thing(el, 'large'));
    assert.equal(geometry(el), was, 'while selected');
    assert.equal(laid, drawn, 'no layout was asked for');
  });

  test('what the style does to a highlighted thing is paint, never a size or a place', () => {
    // an allow-list, so a property nobody thought of is refused until someone says it is paint
    const paint = ['filter', 'text-decoration', 'opacity', 'fill-opacity', 'stroke-opacity'];
    const mine = rules(styles, 'styles.css').filter((r) => r.selectors.some((s) => s.includes(HOT)));
    assert.ok(mine.length > 0, 'the highlight is styled');
    for (const r of mine)
      for (const d of r.declarations) assert.ok(paint.includes(d.property), `${r.selectors[0]}: ${d.property}`);
  });

  test('only the things whose highlight changes are touched: a hover writes the classes of one thing, not of every thing', async () => {
    const { FakeElement } = await import('./host/fake-dom.js');
    const written = new Set();
    const was = FakeElement.prototype.setClassSet;
    FakeElement.prototype.setClassSet = function (s) {
      written.add(this);
      return was.call(this, s);
    };
    try {
      // a focus, from the keyboard so that no touch holds a highlight, so every thing has a mark to keep
      el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
      thing(el, 'large').dispatch('keydown', { key: 'Enter' });
      assert.ok(thing(el, 'tablet').hasClass('graph-note-dim'));
      written.clear();
      over(thing(el, 'tablet'));
      out(thing(el, 'tablet'));
      assert.deepEqual(
        [...written].map((g) => g.getAttribute('data-key')),
        ['tablet'],
      );
      written.clear();
      over(link(el, 3));
      out(link(el, 3));
      assert.ok(written.size <= 3, `the link and its two ends, not all ${el.querySelectorAll('g.node').length + 4}`);
      assert.ok(written.has(link(el, 3)));
    } finally {
      FakeElement.prototype.setClassSet = was;
    }
  });

  test('it is shown by more than colour: an outline glow and an underline on the words', () => {
    const declared = rules(styles, 'styles.css')
      .filter((r) => r.selectors.some((s) => s.includes(HOT)))
      .flatMap((r) => r.declarations.map((d) => `${d.property}:${d.value}`));
    assert.ok(
      declared.some((d) => d.startsWith('filter:') && d.includes('drop-shadow')),
      'a glow round the outline',
    );
    assert.ok(
      declared.some((d) => d === 'text-decoration:underline'),
      'the words underlined',
    );
  });
});
