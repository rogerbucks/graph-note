// Untangling a drawing (editor spec §25, slice 3): a thing and its neighbours alone, behind a banner with a step back; the
// legend bringing a kind or a relationship type forward, then hiding it; the shortest path between two things, or that
// there is none; finding a thing and bringing it into view; walking the links by arrow key — all of it changing the
// drawing and never the note. The built plugin, loaded against the stand-ins for the page.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, load as loadWith, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { NOTE, PATH, showIn } from './host/card-notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { hitAreas, boundsOf } from '../../core/src/hits.ts';
import { readNote } from '../../core/src/drawing.ts';
import { draw } from '../../core/src/render.ts';
import { loadEngine } from '../../core/src/engine.ts';

before(() => build());

// the links, in order: 0 large→q, 1 tablet→q, 2 eyes→large, 3 eyes→tablet
const ISLAND = `${GRAPH},\n(island:Reason {title: 'Left on its own'})`;
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
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
const tap = (el, g, pointerId = 3, extra = {}) => {
  const vp = el.querySelector('.graph-note-viewport');
  const init = { target: g, pointerId, pointerType: 'touch', clientX: 20, clientY: 20, button: 0, ...extra };
  vp.dispatch('pointerdown', init);
  vp.dispatch('pointerup', { ...init, clientX: 21 });
};
const banner = (el) => el.querySelector('.graph-note-untangle');
const said = (el) => banner(el)?.textContent ?? '';
const withText = (el, tag, text) => el.querySelectorAll(tag).find((b) => b.textContent.includes(text));

describe('show only a thing and its neighbours', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(ISLAND))).el;
    tap(el, thing(el, 'large'));
  });
  after(() => env.uninstall());

  test('the details of a thing offer it', () => {
    const offer = withText(el.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours');
    assert.ok(offer);
  });

  test('it filters the drawing to the thing and what is within a step, hiding the rest and their links', () => {
    withText(el.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours').click();
    assert.deepEqual(keys(el, 'graph-note-hidden'), ['island', 'tablet']);
    assert.deepEqual(links(el, 'graph-note-hidden'), ['1', '3']);
  });

  test('a banner names the filter and offers a step back to the whole graph', () => {
    assert.match(said(el), /Showing only Large reader and the things within 1 step of it\./);
    assert.ok(banner(el).getAttribute('role') === 'status', 'announced');
    assert.ok(withText(banner(el), 'button', 'Show the whole graph'));
  });

  test('the step back shows everything again', () => {
    withText(banner(el), 'button', 'Show the whole graph').click();
    assert.deepEqual(keys(el, 'graph-note-hidden'), []);
    assert.deepEqual(links(el, 'graph-note-hidden'), []);
    assert.doesNotMatch(said(el), /Showing only/);
  });

  test('two steps reach further, chosen from the banner', () => {
    withText(el.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours').click();
    withText(banner(el), 'button', 'Widen to two steps').click();
    assert.match(said(el), /within 2 steps of it/);
    assert.deepEqual(keys(el, 'graph-note-hidden'), ['island']);
    withText(banner(el), 'button', 'Narrow to one step').click();
    assert.deepEqual(keys(el, 'graph-note-hidden'), ['island', 'tablet']);
    withText(banner(el), 'button', 'Show the whole graph').click();
  });

  test('the setting for how far focus reaches starts it at two steps', async () => {
    await env.plugin.saveSettings({ ...env.plugin.settings, focusDepth: 'two' });
    const two = (await show(env, fence(ISLAND))).el;
    tap(two, thing(two, 'large'));
    withText(two.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours').click();
    assert.match(said(two), /within 2 steps of it/);
  });
});

describe('the legend', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  const entry = (label) =>
    el.querySelectorAll('.graph-note-filter button').find((b) => b.textContent.startsWith(label));

  test('a button in the bar opens it, listing each kind and each relationship type with how many', () => {
    const panel = el.querySelector('.graph-note-filter');
    assert.ok(panel.hidden);
    labelled(el, 'Filter by kind or link').click();
    assert.ok(!panel.hidden);
    assert.deepEqual(
      panel.querySelectorAll('button').map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      ['Option · 2', 'Question · 1', 'Reason · 1', 'answers · 2', 'counts against · 1', 'favours · 1'],
    );
  });

  test('choosing a kind brings it forward and fades the rest', () => {
    entry('Option').click();
    assert.deepEqual(keys(el, 'graph-note-kept'), ['large', 'tablet']);
    assert.deepEqual(keys(el, 'graph-note-dim'), ['eyes', 'q']);
    assert.match(entry('Option').textContent, /in front/, 'said in words, not by colour');
    assert.equal(entry('Option').getAttribute('aria-pressed'), 'true');
  });

  test('choosing it again hides it, with the links to it', () => {
    entry('Option').click();
    assert.deepEqual(keys(el, 'graph-note-hidden'), ['large', 'tablet']);
    assert.deepEqual(links(el, 'graph-note-hidden'), ['0', '1', '2', '3']);
    assert.deepEqual(keys(el, 'graph-note-dim'), [], 'nothing is brought forward now');
    assert.match(entry('Option').textContent, /hidden/);
    assert.equal(entry('Option').getAttribute('aria-pressed'), 'false', 'a hidden line is not pressed in');
  });

  test('and once more puts it back', () => {
    entry('Option').click();
    assert.deepEqual(keys(el, 'graph-note-hidden'), []);
    assert.deepEqual(keys(el, 'graph-note-dim'), []);
    assert.doesNotMatch(entry('Option').textContent, /hidden|in front/);
  });

  test('a relationship type works the same way: it brings its links forward, then hides them', () => {
    entry('favours').click();
    assert.deepEqual(links(el, 'graph-note-kept'), ['2']);
    assert.deepEqual(keys(el, 'graph-note-kept'), ['eyes', 'large']);
    entry('favours').click();
    assert.deepEqual(links(el, 'graph-note-hidden'), ['2']);
    entry('favours').click();
    assert.deepEqual(links(el, 'graph-note-hidden'), []);
  });

  test('it is the drawing only: opening and choosing in it writes nothing, and a new card starts with it clear', async () => {
    entry('Question').click();
    assert.equal((env.state.writes ?? []).length, 0);
    const fresh = (await show(env, fence(GRAPH))).el;
    assert.deepEqual(keys(fresh, 'graph-note-dim'), []);
    assert.deepEqual(keys(fresh, 'graph-note-hidden'), []);
  });
});

describe('the shortest path between two things', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(ISLAND))).el;
  });
  after(() => env.uninstall());

  const offer = () => withText(el.querySelector('.graph-note-details'), 'button', 'Shortest path to another thing');

  test('the details of a thing offer it, and ask for the second thing', () => {
    tap(el, thing(el, 'tablet'));
    offer().click();
    assert.match(said(el), /Choose a second thing to find the shortest path from Tablet\./);
  });

  test('choosing a second brings the path forward, and says how long it is', () => {
    tap(el, thing(el, 'large'), 4);
    assert.match(
      said(el),
      /The shortest path from Tablet to Large reader is 2 steps: Tablet, Which device\?, Large reader\./,
    );
    assert.deepEqual(keys(el, 'graph-note-kept'), ['large', 'q', 'tablet']);
    assert.deepEqual(links(el, 'graph-note-kept'), ['0', '1']);
    assert.deepEqual(keys(el, 'graph-note-dim'), ['eyes', 'island']);
  });

  test('clearing the path puts the focus back', () => {
    withText(banner(el), 'button', 'Clear the path').click();
    assert.doesNotMatch(said(el), /shortest path/);
    assert.ok(thing(el, 'tablet').hasClass('graph-note-kept'), 'the first thing is still in focus');
    assert.ok(!thing(el, 'island').hasClass('graph-note-kept'));
  });

  test('with no path between them it says so, and brings nothing forward', () => {
    tap(el, thing(el, 'island'), 5);
    offer().click();
    tap(el, thing(el, 'q'), 6);
    assert.match(said(el), /There is no path between Left on its own and Which device\?\./);
    assert.deepEqual(keys(el, 'graph-note-hidden'), []);
  });

  test('with two things selected by Shift and a tap the same is offered without the button', () => {
    withText(banner(el), 'button', 'Clear the path').click();
    tap(el, thing(el, 'eyes'), 7);
    tap(el, thing(el, 'q'), 8, { shiftKey: true });
    assert.match(said(el), /The shortest path from Easy on the eyes to Which device\? is 2 steps/);
    withText(banner(el), 'button', 'Clear the path').click();
  });

  test('Escape leaves the question unanswered', () => {
    tap(el, thing(el, 'tablet'), 9);
    offer().click();
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
    assert.doesNotMatch(said(el), /Choose a second thing/);
  });

  test('an arrow key that walks the selection does not answer the question: it is still waiting for a second thing', () => {
    tap(el, thing(el, 'tablet'), 10);
    offer().click();
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'ArrowUp', target: thing(el, 'tablet') });
    assert.ok(thing(el, 'eyes').hasClass('is-selected'), 'the selection walked on to a neighbour');
    assert.match(said(el), /Choose a second thing to find the shortest path from Tablet\./);
    assert.doesNotMatch(said(el), /The shortest path from/);
    // tapping a second thing still answers it
    tap(el, thing(el, 'q'), 11);
    assert.match(said(el), /The shortest path from Tablet to Which device\? is 1 step/);
  });
});

describe('finding a thing', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(ISLAND))).el;
  });
  after(() => env.uninstall());

  const search = (text) => {
    const input = el.querySelector('.graph-note-find input');
    input.value = text;
    input.dispatch('input');
    return el.querySelectorAll('.graph-note-find-results button');
  };

  test('a button in the bar opens the search box', () => {
    const row = el.querySelector('.graph-note-find');
    assert.ok(row.hidden);
    labelled(el, 'Find a thing').click();
    assert.ok(!row.hidden);
    assert.ok(row.querySelector('input').getAttribute('aria-label'));
  });

  test('typing lists the things by name, case and all, saying what each is', () => {
    const found = search('TABL');
    assert.equal(found.length, 1);
    assert.match(found[0].textContent, /Tablet/);
    assert.match(found[0].textContent, /Option/);
  });

  test('choosing one selects it and opens its details, as tapping it does', () => {
    search('tablet')[0].click();
    assert.ok(thing(el, 'tablet').hasClass('is-selected'));
    assert.match(el.querySelector('.graph-note-details').textContent, /Tablet/);
    assert.deepEqual(keys(el, 'graph-note-kept'), ['eyes', 'q', 'tablet']);
  });

  test('Enter in the box chooses the first', () => {
    search('large');
    const input = el.querySelector('.graph-note-find input');
    input.dispatch('keydown', { key: 'Enter' });
    assert.ok(thing(el, 'large').hasClass('is-selected'));
  });

  test('a property’s value finds it too, and says which property', () => {
    const upon = `// graph: shop
(a:Item {name: 'Lamp', price: 249}), (b:Item {name: 'Desk', price: 99}), (a)-[:NEAR]->(b)`;
    return show(env, fence(upon)).then(({ el: shop }) => {
      labelled(shop, 'Find a thing').click();
      const input = shop.querySelector('.graph-note-find input');
      input.value = '249';
      input.dispatch('input');
      const found = shop.querySelectorAll('.graph-note-find-results button');
      assert.equal(found.length, 1);
      assert.match(found[0].textContent, /Lamp/);
      assert.match(found[0].textContent, /price: 249/);
    });
  });

  test('nothing like it says so', () => {
    // a status, so a screen reader hears how many were found, or that none were, as it is typed
    const status = el.querySelector('.graph-note-find [role="status"]');
    assert.ok(status, 'a status in the search row');
    search('tablet');
    assert.match(status.textContent, /^1 thing found\.$/);
    search('e');
    assert.match(status.textContent, /^\d+ things found\.$/);
    search('zzzz');
    assert.match(status.textContent, /^No thing matches\.$/);
    search('');
    assert.equal(status.textContent, '', 'nor with nothing typed');
  });

  test('a thing hidden by a filter is found: choosing it shows the whole graph first', () => {
    tap(el, thing(el, 'large'), 4);
    withText(el.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours').click();
    assert.ok(thing(el, 'island').hasClass('graph-note-hidden'));
    search('left on')[0].click();
    assert.ok(!thing(el, 'island').hasClass('graph-note-hidden'));
    assert.ok(thing(el, 'island').hasClass('is-selected'));
  });

  test('Escape in the box closes the row and gives the focus back to the button that opened it', () => {
    const button = labelled(el, 'Find a thing'),
      row = el.querySelector('.graph-note-find');
    assert.ok(!row.hidden, 'open');
    const input = row.querySelector('input');
    input.focus();
    const e = input.dispatch('keydown', { key: 'Escape' });
    assert.ok(row.hidden, 'closed');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(env.doc.activeElement, button);
    assert.ok(e.defaultPrevented);
  });
});

describe('finding a thing brings it into view', () => {
  let env, el, areas, ids;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
    const drawing = readNote([GRAPH]).graphs.get('reader');
    areas = hitAreas(draw(drawing, await loadEngine()).svg);
    ids = new Map(drawing.boxes.map((b, i) => [b.key, `node${i + 1}`]));
    for (let n = 0; n < 8; n++) labelled(el, 'Zoom in').click();
  });
  after(() => env.uninstall());

  /** Whether a thing is wholly inside the viewport, as the drawing is shown now. */
  const inView = (key) => {
    const svg = el.querySelector('svg.graph-note-svg'),
      vp = el.querySelector('.graph-note-viewport'),
      box = boundsOf(areas, ids.get(key));
    const w = Number(svg.getAttribute('width')),
      h = Number(svg.getAttribute('height'));
    const left = parseFloat(vp.cssProps['--graph-note-x']) + box.x * w,
      top = parseFloat(vp.cssProps['--graph-note-y']) + box.y * h,
      high = parseFloat(vp.cssProps['--graph-note-height']);
    return left >= 0 && top >= 0 && left + box.width * w <= 700 && top + box.height * h <= high;
  };

  test('a thing out of sight is in sight once found', () => {
    labelled(el, 'Find a thing').click();
    const input = el.querySelector('.graph-note-find input');
    const hidden = ['q', 'large', 'tablet', 'eyes'].find((k) => !inView(k));
    assert.ok(hidden, 'zoomed in far enough that something is out of sight');
    const text = { q: 'Which device', large: 'Large reader', tablet: 'Tablet', eyes: 'Easy on the eyes' }[hidden];
    input.value = text;
    input.dispatch('input');
    el.querySelectorAll('.graph-note-find-results button')[0].click();
    assert.ok(inView(hidden), `${hidden} is in view`);
  });
});

describe('walking the links by arrow key', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  const neighbours = {
    q: ['large', 'tablet'],
    large: ['q', 'eyes'],
    tablet: ['q', 'eyes'],
    eyes: ['large', 'tablet'],
  };
  const selected = () => keys(el, 'is-selected')[0];
  const arrow = (key) =>
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key, target: thing(el, selected()) });

  test('with a thing selected, an arrow moves the selection along a link to a neighbour', () => {
    thing(el, 'q').focus();
    thing(el, 'q').dispatch('keydown', { key: 'Enter' });
    assert.equal(selected(), 'q');
    const from = selected();
    arrow('ArrowUp'); // the drawing runs down the page, so what q links to is above it
    assert.notEqual(selected(), from);
    assert.ok(neighbours[from].includes(selected()), `${from} → ${selected()}`);
  });

  test('the walk is made without a pointer, and takes the keyboard focus and the focus on the drawing with it', () => {
    const now = selected();
    assert.equal(env.doc.activeElement, thing(el, now));
    assert.ok(thing(el, now).hasClass('graph-note-kept'));
    assert.match(el.querySelector('.graph-note-details').textContent, /Links/);
  });

  test('every neighbour can be reached by some arrow', () => {
    for (const from of Object.keys(neighbours)) {
      const reached = new Set();
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        tap(el, thing(el, from), 11);
        arrow(key);
        if (selected() !== from) reached.add(selected());
      }
      assert.deepEqual([...reached].sort(), [...neighbours[from]].sort(), `from ${from}`);
    }
  });

  test('with a link selected, or nothing, the arrows do nothing', () => {
    tap(el, el.querySelector('g.edge[data-link="0"]'), 12);
    const before = keys(el, 'is-selected');
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'ArrowRight' });
    assert.deepEqual(keys(el, 'is-selected'), before);
  });
});

describe('only the drawing changes, never the note', () => {
  let env, el;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('focusing, filtering, the legend, a path, a search and a walk write nothing', async () => {
    const note = fence(ISLAND);
    el = (await show(env, note)).el;
    const text = el.querySelector('.graph-note-view').textContent;
    const sourceBefore = JSON.stringify([...env.state.files.entries()]);
    tap(el, thing(el, 'large'));
    withText(el.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours').click();
    withText(banner(el), 'button', 'Show the whole graph').click();
    labelled(el, 'Filter by kind or link').click();
    el.querySelectorAll('.graph-note-filter button')[0].click();
    el.querySelectorAll('.graph-note-filter button')[0].click();
    tap(el, thing(el, 'tablet'), 4);
    withText(el.querySelector('.graph-note-details'), 'button', 'Shortest path to another thing').click();
    tap(el, thing(el, 'q'), 5);
    labelled(el, 'Find a thing').click();
    const input = el.querySelector('.graph-note-find input');
    input.value = 'eyes';
    input.dispatch('input');
    el.querySelectorAll('.graph-note-find-results button')[0].click();
    el.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'ArrowRight', target: thing(el, 'eyes') });
    assert.equal((env.state.writes ?? []).length, 0, 'the vault was never written');
    assert.equal(JSON.stringify([...env.state.files.entries()]), sourceBefore);
    assert.ok(text.length > 0);
    assert.equal(el.querySelectorAll('g.node').length, 5, 'every thing is still drawn');
  });

  test('on a card being edited in place the same steps leave the editor’s text and the note as they were', async () => {
    const edited = await loadWith({ files: { [PATH]: NOTE } });
    try {
      const live = await showIn(edited, 'live');
      labelled(live, 'Edit here').click();
      await until(() => !!live.querySelector('textarea'));
      const box = live.querySelector('textarea'),
        typed = box.value;
      tap(live, thing(live, 'large'));
      withText(live.querySelector('.graph-note-details'), 'button', 'Show only this and its neighbours').click();
      withText(banner(live), 'button', 'Show the whole graph').click();
      labelled(live, 'Filter by kind or link').click();
      live.querySelectorAll('.graph-note-filter button')[0].click();
      live.querySelectorAll('.graph-note-filter button')[0].click();
      tap(live, thing(live, 'q'), 4);
      withText(live.querySelector('.graph-note-details'), 'button', 'Shortest path to another thing').click();
      tap(live, thing(live, 'large'), 5);
      assert.match(said(live), /The shortest path from/);
      labelled(live, 'Find a thing').click();
      const input = live.querySelector('.graph-note-find input');
      input.value = 'large';
      input.dispatch('input');
      live.querySelectorAll('.graph-note-find-results button')[0].click();
      live.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'ArrowUp', target: thing(live, 'large') });
      live.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
      await wait(50);
      assert.ok(live.querySelector('textarea') === box, 'the editor is still open');
      assert.equal(box.value, typed, 'nothing was written into the text being edited');
      assert.equal(edited.state.files.get(PATH), NOTE, 'nothing was written into the note');
      assert.equal((edited.state.writes ?? []).length, 0, 'the vault was never written');
    } finally {
      edited.uninstall();
    }
  });
});
