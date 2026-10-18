// Focus on the drawing (editor spec §25, slice 3):
// - Selecting a thing or a link keeps it and its neighbours at full strength and fades the rest.
//   It moves or hides nothing.
// - The faded stay readable, and focus is not shown by colour alone.
// - An empty tap or Escape clears the selection and the focus.
// - A setting chooses how far it reaches.
// The built plugin, loaded against the stand-ins for the page.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { rules, specificity, winner } from './host/cascade.js';
import { load, GRAPH, show, styles } from './host/view-notes.js';
import { FADE, KEPT } from '../../core/src/focus.ts';

before(() => build());

// the links, in order: 0 large→q, 1 tablet→q, 2 eyes→large, 3 eyes→tablet
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const link = (el, n) => el.querySelector(`g.edge[data-link="${n}"]`);
const keys = (el, cls) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.hasClass(cls))
    .map((g) => g.getAttribute('data-key'))
    .sort();
const links = (el, cls) =>
  el
    .querySelectorAll('g.edge')
    .filter((g) => g.hasClass(cls))
    .map((g) => g.getAttribute('data-link'));
const tap = (el, g, pointerId = 3) => {
  const vp = el.querySelector('.thoughtknot-viewport');
  vp.dispatch('pointerdown', { target: g, pointerId, pointerType: 'touch', clientX: 20, clientY: 20, button: 0 });
  vp.dispatch('pointerup', { target: g, pointerId, pointerType: 'touch', clientX: 21, clientY: 20, button: 0 });
};
const everything = (e) => [e, ...e.children.flatMap(everything)];
const geometry = (el) => {
  const svg = el.querySelector('svg.thoughtknot-svg');
  return JSON.stringify([
    everything(svg).map((e) => [
      e.localName,
      [...e.attributes].filter(([k]) => k !== 'class' && k !== 'aria-pressed').sort(),
    ]),
    el.querySelector('.thoughtknot-viewport').cssProps,
  ]);
};

describe('selecting a thing', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('with nothing selected, nothing is faded or kept', () => {
    assert.deepEqual(keys(el, 'thoughtknot-dim'), []);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), []);
  });

  test('keeps it, its links and the things at their other ends at full strength, and fades everything else', () => {
    tap(el, thing(el, 'large'));
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['eyes', 'large', 'q']);
    assert.deepEqual(links(el, 'thoughtknot-kept'), ['0', '2']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['tablet']);
    assert.deepEqual(links(el, 'thoughtknot-dim'), ['1', '3']);
  });

  test('without moving or hiding anything: every size and place is as it was, and nothing is hidden', () => {
    const was = geometry(el);
    tap(el, thing(el, 'tablet'), 4);
    assert.equal(geometry(el), was);
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), []);
    assert.equal(el.querySelectorAll('g.node').length, 4);
    assert.equal(el.querySelectorAll('g.edge').length, 4);
  });

  test('selecting another moves the focus to it', () => {
    tap(el, thing(el, 'q'), 5);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['large', 'q', 'tablet']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['eyes']);
  });

  test('from the keyboard it is the same: Enter on a thing focuses on it', () => {
    thing(el, 'eyes').dispatch('keydown', { key: 'Enter' });
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['eyes', 'large', 'tablet']);
  });

  test('the thing selected is also marked as selected, as before', () => {
    assert.ok(thing(el, 'eyes').hasClass('is-selected'));
    assert.equal(thing(el, 'eyes').getAttribute('aria-pressed'), 'true');
  });
});

describe('selecting a link', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  test('keeps it and the two things it joins at full strength, and fades everything else', () => {
    tap(el, link(el, 1));
    assert.deepEqual(links(el, 'thoughtknot-kept'), ['1']);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['q', 'tablet']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['eyes', 'large']);
    assert.deepEqual(links(el, 'thoughtknot-dim'), ['0', '2', '3']);
  });
});

describe('an estimated link', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(`${GRAPH},\n(eyes)-[:FAVOURS]->(larg)`))).el;
  });
  after(() => env.uninstall());

  test('is one of the links of the thing at its ends: selecting the thing keeps it', () => {
    tap(el, thing(el, 'eyes'));
    const estimated = el.querySelectorAll('g.edge[data-estimate]')[0];
    assert.ok(estimated, 'a guess is drawn');
    assert.ok(estimated.hasClass('thoughtknot-kept'));
    assert.ok(thing(el, 'large').hasClass('thoughtknot-kept'));
  });

  test('selecting it keeps it and the two things it joins', () => {
    const estimated = el.querySelectorAll('g.edge[data-estimate]')[0];
    tap(el, estimated, 4);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['eyes', 'large']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['q', 'tablet']);
  });
});

describe('clearing the selection and the focus', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  const cleared = () => {
    assert.deepEqual(keys(el, 'thoughtknot-dim'), []);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), []);
    assert.deepEqual(links(el, 'thoughtknot-dim'), []);
    assert.deepEqual(keys(el, 'is-selected'), []);
    assert.ok(el.querySelector('.thoughtknot-details').hidden, 'the details are closed too');
  };

  test('pressing Escape clears both', () => {
    tap(el, thing(el, 'large'));
    assert.ok(keys(el, 'thoughtknot-dim').length);
    const e = el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'Escape' });
    cleared();
    assert.ok(e.defaultPrevented, 'the key was used');
  });

  test('tapping empty space clears both', () => {
    tap(el, thing(el, 'tablet'), 4);
    assert.ok(keys(el, 'thoughtknot-dim').length);
    const vp = el.querySelector('.thoughtknot-viewport');
    // the corner of the viewport, far from every thing and link
    vp.dispatch('pointerdown', {
      target: vp,
      pointerId: 9,
      pointerType: 'touch',
      clientX: 698,
      clientY: 398,
      button: 0,
    });
    vp.dispatch('pointerup', { target: vp, pointerId: 9, pointerType: 'touch', clientX: 698, clientY: 398, button: 0 });
    cleared();
  });

  test('a drag across empty space pans and does not clear it', () => {
    tap(el, thing(el, 'tablet'), 4);
    const vp = el.querySelector('.thoughtknot-viewport');
    vp.dispatch('pointerdown', {
      target: vp,
      pointerId: 9,
      pointerType: 'mouse',
      clientX: 698,
      clientY: 398,
      button: 0,
    });
    vp.dispatch('pointermove', {
      target: vp,
      pointerId: 9,
      pointerType: 'mouse',
      clientX: 660,
      clientY: 380,
      button: 0,
    });
    vp.dispatch('pointerup', { target: vp, pointerId: 9, pointerType: 'mouse', clientX: 660, clientY: 380, button: 0 });
    assert.ok(keys(el, 'thoughtknot-dim').length, 'still in focus');
  });

  test('closing the details clears the focus too', () => {
    labelled(el, 'Close details').click();
    cleared();
  });

  test('Escape with nothing selected is left to the drawing, as before', () => {
    const e = el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'Escape' });
    assert.ok(!e.defaultPrevented, 'nothing used it');
  });

  test('in full screen, Escape clears the focus first and a second Escape leaves', async () => {
    labelled(el, 'Full screen').click();
    const full = env.doc.body.querySelector('.thoughtknot-fullscreen');
    assert.ok(full);
    const vp = full.querySelector('.thoughtknot-viewport');
    tap(full, thing(full, 'large'), 6);
    assert.ok(keys(full, 'thoughtknot-dim').length);
    vp.dispatch('keydown', { key: 'Escape' });
    assert.deepEqual(keys(full, 'thoughtknot-dim'), []);
    assert.ok(env.doc.body.querySelector('.thoughtknot-fullscreen'), 'still full screen');
    vp.dispatch('keydown', { key: 'Escape' });
    assert.equal(env.doc.body.querySelector('.thoughtknot-fullscreen'), null, 'now left');
  });
});

describe('how far focus reaches', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('one step by default', async () => {
    const { el } = await show(env, fence(GRAPH));
    tap(el, thing(el, 'q'));
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['large', 'q', 'tablet']);
  });

  test('two steps when the setting says so', async () => {
    await env.plugin.saveSettings({ ...env.plugin.settings, focusDepth: 'two' });
    const { el } = await show(env, fence(GRAPH));
    tap(el, thing(el, 'q'));
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['eyes', 'large', 'q', 'tablet']);
    assert.deepEqual(links(el, 'thoughtknot-kept'), ['0', '1', '2', '3']);
  });

  test('a link is not changed by it', async () => {
    const { el } = await show(env, fence(GRAPH));
    tap(el, link(el, 1));
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['q', 'tablet']);
  });
});

describe('what is faded stays readable, and focus is shown by more than colour', () => {
  const all = rules(styles, 'styles.css');
  // an element and its ancestors, nearest first: inside a group of these classes, inside the drawing
  const under = (tag, group) => ({
    tag,
    classes: [],
    ancestors: [
      { tag: 'g', classes: group },
      { tag: 'svg', classes: ['thoughtknot-svg'] },
    ],
  });
  const shape = (group) => under('path', group);
  const words = (group) => under('text', group);
  const value = (el, property) => winner(all, el, property)?.value;

  test('a faded box has a lighter outline and no fill; its words and lines keep their colour, at the strength the core sets', () => {
    assert.equal(value(shape(['node', 'thoughtknot-dim']), 'stroke-width'), String(FADE.width));
    assert.equal(value(shape(['node', 'thoughtknot-dim']), 'fill-opacity'), String(FADE.fill));
    assert.equal(value(words(['node', 'thoughtknot-dim']), 'fill-opacity'), String(FADE.text));
    assert.equal(value(words(['edge', 'thoughtknot-dim']), 'fill-opacity'), String(FADE.text), 'a link’s label');
    assert.equal(value(shape(['edge', 'thoughtknot-dim']), 'stroke-width'), String(FADE.width));
  });

  test('a kept box has the heavier outline, and the one selected the heaviest', () => {
    assert.equal(value(shape(['node', 'thoughtknot-kept']), 'stroke-width'), String(KEPT.width));
    assert.equal(value(shape(['edge', 'thoughtknot-kept']), 'stroke-width'), String(KEPT.width));
    // the cascade reads :is() as a browser ranks it, so what wins here wins on the page
    for (const kind of ['node', 'edge'])
      assert.equal(
        value(shape([kind, 'thoughtknot-kept', 'is-selected']), 'stroke-width'),
        '3',
        `a selected ${kind} is heavier than one only kept`,
      );
  });

  test('a view’s look keeps its line, whether the thing is kept or faded: the focus never outranks it', () => {
    for (const focus of ['thoughtknot-kept', 'thoughtknot-dim'])
      assert.equal(
        value(shape(['node', focus, 'thoughtknot-look', 'thoughtknot-line-bold']), 'stroke-width'),
        '3',
        focus,
      );
  });

  test('the focus rules are no more specific than the rules they must give way to', () => {
    const specific = (re) =>
      all
        .filter((r) => r.selectors.some((s) => re.test(s)) && r.declarations.some((d) => d.property === 'stroke-width'))
        .flatMap((r) => r.selectors.filter((s) => re.test(s)).map((s) => specificity(s).join('.')));
    const selected = specific(/is-selected/),
      focus = specific(/thoughtknot-(kept|dim)\b/);
    assert.ok(selected.length && focus.length);
    for (const s of focus) assert.ok(selected.includes(s), `${s} against the selected rule’s ${selected}`);
  });

  test('fading is never done by colour, by hiding or by moving: only the outline, the fill and the words’ strength', () => {
    const mine = all.filter((r) => r.selectors.some((s) => /thoughtknot-(dim|kept)\b/.test(s)));
    assert.ok(mine.length >= 4);
    const allowed = ['stroke-width', 'fill-opacity', 'stroke-opacity'];
    for (const r of mine)
      for (const d of r.declarations) assert.ok(allowed.includes(d.property), `${r.selectors[0]}: ${d.property}`);
  });
});
