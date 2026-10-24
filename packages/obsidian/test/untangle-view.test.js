// Untangling a drawing (editor spec §25, slice 3). All of it changes the drawing and never the note.
// - A thing and its neighbours alone, behind a banner with a step back.
// - The legend bringing a kind or a relationship type forward, then hiding it.
// - The shortest path between two things, or that there is none.
// - Finding a thing and bringing it into view. Walking the links by arrow key.
// The built plugin, loaded against the stand-ins for the page.
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
  const vp = el.querySelector('.thoughtknot-viewport');
  const init = { target: g, pointerId, pointerType: 'touch', clientX: 20, clientY: 20, button: 0, ...extra };
  vp.dispatch('pointerdown', init);
  vp.dispatch('pointerup', { ...init, clientX: 21 });
};
const banner = (el) => el.querySelector('.thoughtknot-untangle');
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

  const details = () => el.querySelector('.thoughtknot-details');
  const drawnKeys = () =>
    el
      .querySelectorAll('g.node[data-key]')
      .map((g) => g.getAttribute('data-key'))
      .sort();
  const drawnLinks = () =>
    el
      .querySelectorAll('g.edge')
      .map((g) => g.getAttribute('data-link'))
      .sort();

  test('the details of a thing offer it', () => {
    const offer = withText(details(), 'button', 'Show only this and its neighbours');
    assert.ok(offer);
  });

  test('it filters the drawing to the thing and what is within a step, hiding the rest and their links', () => {
    withText(details(), 'button', 'Show only this and its neighbours').click();
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), ['island', 'tablet']);
    assert.deepEqual(links(el, 'thoughtknot-hidden'), ['1', '3']);
  });

  test('then lays out only them, so they sit together, each link drawn as itself (untangle_regroup)', async () => {
    await until(() => !thing(el, 'island'));
    assert.deepEqual(drawnKeys(), ['eyes', 'large', 'q']);
    assert.deepEqual(drawnLinks(), ['0', '2']);
    assert.ok(thing(el, 'large').hasClass('is-selected'), 'the thing stays selected');
  });

  test('a banner names the filter and offers a step back to the whole graph', () => {
    assert.match(said(el), /Showing only Large reader and the things within 1 step of it\./);
    assert.ok(banner(el).getAttribute('role') === 'status', 'announced');
    assert.ok(withText(banner(el), 'button', 'Show the whole graph'));
  });

  test('the button is a toggle: pressed again, it lays the whole graph out again (untangle_toggle)', async () => {
    const again = withText(details(), 'button', 'Show the whole graph');
    assert.ok(again, 'it says what pressing it again does');
    again.click();
    await until(() => !!thing(el, 'island'));
    assert.deepEqual(drawnKeys(), ['eyes', 'island', 'large', 'q', 'tablet']);
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), []);
    assert.doesNotMatch(said(el), /Showing only/);
    assert.ok(withText(details(), 'button', 'Show only this and its neighbours'));
  });

  test('the step back shows everything again', async () => {
    withText(details(), 'button', 'Show only this and its neighbours').click();
    await until(() => !thing(el, 'island'));
    withText(banner(el), 'button', 'Show the whole graph').click();
    await until(() => !!thing(el, 'island'));
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), []);
    assert.deepEqual(links(el, 'thoughtknot-hidden'), []);
    assert.doesNotMatch(said(el), /Showing only/);
  });

  test('two steps reach further, chosen from the banner, and are laid out together too', async () => {
    withText(details(), 'button', 'Show only this and its neighbours').click();
    await until(() => !thing(el, 'tablet'));
    withText(banner(el), 'button', 'Widen to 2 steps').click();
    assert.match(said(el), /within 2 steps of it/);
    await until(() => !!thing(el, 'tablet'));
    assert.deepEqual(drawnKeys(), ['eyes', 'large', 'q', 'tablet']);
    withText(banner(el), 'button', 'Narrow to 1 step').click();
    await until(() => !thing(el, 'tablet'));
    withText(banner(el), 'button', 'Show the whole graph').click();
    await until(() => !!thing(el, 'island'));
  });

  test('the zoom it had before comes back with the whole graph', async () => {
    labelled(el, 'Zoom in').click();
    labelled(el, 'Zoom in').click();
    const svg = el.querySelector('svg'),
      vp = el.querySelector('.thoughtknot-viewport'),
      was = [svg.getAttribute('width'), vp.cssProps['--thoughtknot-x']];
    withText(details(), 'button', 'Show only this and its neighbours').click();
    await until(() => !thing(el, 'island'));
    assert.notEqual(svg.getAttribute('width'), was[0], 'the few left are fitted to the card');
    withText(details(), 'button', 'Show the whole graph').click();
    await until(() => !!thing(el, 'island'));
    assert.deepEqual([svg.getAttribute('width'), vp.cssProps['--thoughtknot-x']], was);
  });

  test('the setting for how far focus reaches starts it at two steps', async () => {
    await env.plugin.saveSettings({ ...env.plugin.settings, focusDepth: 'two' });
    const two = (await show(env, fence(ISLAND))).el;
    tap(two, thing(two, 'large'));
    withText(two.querySelector('.thoughtknot-details'), 'button', 'Show only this and its neighbours').click();
    assert.match(said(two), /within 2 steps of it/);
    await until(() => !thing(two, 'island')); // laid out together before the card goes
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
    el.querySelectorAll('.thoughtknot-filter button').find((b) => b.textContent.startsWith(label));

  test('a button in the bar opens it, listing each kind and each relationship type with how many', () => {
    const panel = el.querySelector('.thoughtknot-filter');
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
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['large', 'tablet']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['eyes', 'q']);
    assert.match(entry('Option').textContent, /in front/, 'said in words, not by colour');
    assert.equal(entry('Option').getAttribute('aria-pressed'), 'true');
  });

  test('choosing it again hides it, with the links to it', () => {
    entry('Option').click();
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), ['large', 'tablet']);
    assert.deepEqual(links(el, 'thoughtknot-hidden'), ['0', '1', '2', '3']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'nothing is brought forward now');
    assert.match(entry('Option').textContent, /hidden/);
    assert.equal(entry('Option').getAttribute('aria-pressed'), 'false', 'a hidden line is not pressed in');
  });

  test('and once more puts it back', () => {
    entry('Option').click();
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), []);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), []);
    assert.doesNotMatch(entry('Option').textContent, /hidden|in front/);
  });

  test('a relationship type works the same way: it brings its links forward, then hides them', () => {
    entry('favours').click();
    assert.deepEqual(links(el, 'thoughtknot-kept'), ['2']);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['eyes', 'large']);
    entry('favours').click();
    assert.deepEqual(links(el, 'thoughtknot-hidden'), ['2']);
    entry('favours').click();
    assert.deepEqual(links(el, 'thoughtknot-hidden'), []);
  });

  test('it is the drawing only: opening and choosing in it writes nothing, and a new card starts with it clear', async () => {
    entry('Question').click();
    assert.equal((env.state.writes ?? []).length, 0);
    const fresh = (await show(env, fence(GRAPH))).el;
    assert.deepEqual(keys(fresh, 'thoughtknot-dim'), []);
    assert.deepEqual(keys(fresh, 'thoughtknot-hidden'), []);
  });
});

describe('the shortest path between two things', () => {
  let env, el;
  before(async () => {
    env = await load();
    el = (await show(env, fence(ISLAND))).el;
  });
  after(() => env.uninstall());

  const offer = () => withText(el.querySelector('.thoughtknot-details'), 'button', 'Shortest path to another thing');

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
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['large', 'q', 'tablet']);
    assert.deepEqual(links(el, 'thoughtknot-kept'), ['0', '1']);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['eyes', 'island']);
  });

  test('clearing the path puts the focus back', () => {
    withText(banner(el), 'button', 'Clear the path').click();
    assert.doesNotMatch(said(el), /shortest path/);
    assert.ok(thing(el, 'tablet').hasClass('thoughtknot-kept'), 'the first thing is still in focus');
    assert.ok(!thing(el, 'island').hasClass('thoughtknot-kept'));
  });

  test('with no path between them it says so, and brings nothing forward', () => {
    tap(el, thing(el, 'island'), 5);
    offer().click();
    tap(el, thing(el, 'q'), 6);
    assert.match(said(el), /There is no path between Left on its own and Which device\?\./);
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), []);
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
    el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'Escape' });
    assert.doesNotMatch(said(el), /Choose a second thing/);
  });

  test('an arrow key that walks the selection does not answer the question: it is still waiting for a second thing', () => {
    tap(el, thing(el, 'tablet'), 10);
    offer().click();
    el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'ArrowUp', target: thing(el, 'tablet') });
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
    const input = el.querySelector('.thoughtknot-find input');
    input.value = text;
    input.dispatch('input');
    return el.querySelectorAll('.thoughtknot-find-results button');
  };

  test('a button in the bar opens the search box', () => {
    const row = el.querySelector('.thoughtknot-find');
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
    assert.match(el.querySelector('.thoughtknot-details').textContent, /Tablet/);
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['eyes', 'q', 'tablet']);
  });

  test('Enter in the box chooses the first', () => {
    search('large');
    const input = el.querySelector('.thoughtknot-find input');
    input.dispatch('keydown', { key: 'Enter' });
    assert.ok(thing(el, 'large').hasClass('is-selected'));
  });

  test('a property’s value finds it too, and says which property', () => {
    const upon = `// graph: shop
(a:Item {name: 'Lamp', price: 249}), (b:Item {name: 'Desk', price: 99}), (a)-[:NEAR]->(b)`;
    return show(env, fence(upon)).then(({ el: shop }) => {
      labelled(shop, 'Find a thing').click();
      const input = shop.querySelector('.thoughtknot-find input');
      input.value = '249';
      input.dispatch('input');
      const found = shop.querySelectorAll('.thoughtknot-find-results button');
      assert.equal(found.length, 1);
      assert.match(found[0].textContent, /Lamp/);
      assert.match(found[0].textContent, /price: 249/);
    });
  });

  test('nothing like it says so', () => {
    // a status, so a screen reader hears how many were found, or that none were, as it is typed
    const status = el.querySelector('.thoughtknot-find [role="status"]');
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
    withText(el.querySelector('.thoughtknot-details'), 'button', 'Show only this and its neighbours').click();
    assert.ok(thing(el, 'island').hasClass('thoughtknot-hidden'));
    search('left on')[0].click();
    assert.ok(!thing(el, 'island').hasClass('thoughtknot-hidden'));
    assert.ok(thing(el, 'island').hasClass('is-selected'));
  });

  test('Escape in the box closes the row and gives the focus back to the button that opened it', () => {
    const button = labelled(el, 'Find a thing'),
      row = el.querySelector('.thoughtknot-find');
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
    const svg = el.querySelector('svg.thoughtknot-svg'),
      vp = el.querySelector('.thoughtknot-viewport'),
      box = boundsOf(areas, ids.get(key));
    const w = Number(svg.getAttribute('width')),
      h = Number(svg.getAttribute('height'));
    const left = parseFloat(vp.cssProps['--thoughtknot-x']) + box.x * w,
      top = parseFloat(vp.cssProps['--thoughtknot-y']) + box.y * h,
      high = parseFloat(vp.cssProps['--thoughtknot-height']);
    return left >= 0 && top >= 0 && left + box.width * w <= 700 && top + box.height * h <= high;
  };

  test('a thing out of sight is in sight once found', () => {
    labelled(el, 'Find a thing').click();
    const input = el.querySelector('.thoughtknot-find input');
    const hidden = ['q', 'large', 'tablet', 'eyes'].find((k) => !inView(k));
    assert.ok(hidden, 'zoomed in far enough that something is out of sight');
    const text = { q: 'Which device', large: 'Large reader', tablet: 'Tablet', eyes: 'Easy on the eyes' }[hidden];
    input.value = text;
    input.dispatch('input');
    el.querySelectorAll('.thoughtknot-find-results button')[0].click();
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
    el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key, target: thing(el, selected()) });

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
    assert.ok(thing(el, now).hasClass('thoughtknot-kept'));
    assert.match(el.querySelector('.thoughtknot-details').textContent, /Links/);
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
    el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'ArrowRight' });
    assert.deepEqual(keys(el, 'is-selected'), before);
  });
});

describe('labels by zoom, folded hubs and groups, merged links and routing', () => {
  // a hub of 13 parts, two groups of two people, and the style graph's links routed straight
  const HUB = [
    '// graph: kit',
    "(hub:Hub {name: 'Hub'}),",
    ...Array.from({ length: 13 }, (_, i) => `(p${i}:Part {name: 'Part ${i}'}),`),
    "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cy:Person {name: 'Cy'}), (dee:Person {name: 'Dee'}),",
    ...Array.from({ length: 13 }, (_, i) => `(hub)-[:HAS]->(p${i}),`),
    '(ann)-[:ASKS]->(cy), (bob)-[:ASKS]->(dee)',
  ].join('\n');
  const STYLED = `// graph: kit_style · STYLE kit
(n1:Nudge {word: 'group', thing: 'ann', group: 'Askers'}), (n2:Nudge {word: 'group', thing: 'bob', group: 'Askers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Asked'}), (n4:Nudge {word: 'group', thing: 'dee', group: 'Asked'}),
(r1:Links {routing: 'straight'})`;
  const NOTED = ['# Kit', '', fence(HUB), '', fence(STYLED), ''].join('\n');
  const byId = (el, id) => el.querySelector(`#${id}`);
  const switched = (el, name) =>
    el.querySelectorAll('.thoughtknot-view-menu button').find((b) => b.textContent.startsWith(name));

  test('each changes only the drawing: folded, merged, routed and labelled by zoom, the note never written', async () => {
    const env = await loadWith({ files: { [PATH]: NOTED }, width: 150 });
    try {
      const laid = [];
      const layout = env.plugin.layout.bind(env.plugin);
      env.plugin.layout = (d, owner) => (laid.push(d), layout(d, owner));
      const el = await showIn(env, 'live', { note: NOTED });
      // untangle_routing: the style graph's straight links, laid out so
      assert.equal(laid[0].routing, 'straight');
      // untangle_labels: a card too narrow to read a link's label hides them, zoomed in it shows them
      const svg = el.querySelector('svg');
      assert.ok(svg.hasClass('thoughtknot-labels-hidden'));
      for (let i = 0; i < 12 && svg.hasClass('thoughtknot-labels-hidden'); i++) labelled(el, 'Zoom in').click();
      assert.ok(!svg.hasClass('thoughtknot-labels-hidden'));
      // untangle_hubs: the hub's links folded into a stub with their count, opened from it
      assert.match(byId(el, 'fold_hub_1').textContent, /13 links/);
      assert.ok(!thing(el, 'p3'));
      tap(el, byId(el, 'fold_hub_1'));
      await until(() => !!thing(el, 'p3'));
      // untangle_groups and untangle_merge, from the View menu
      switched(el, 'Parallel links merged').click();
      await until(() => !!byId(el, 'trunk_1'));
      assert.equal(byId(el, 'edge14_tail').getAttribute('data-link'), '13');
      switched(el, 'Groups folded').click();
      await until(() => !!byId(el, 'fold_group_1'));
      assert.match(byId(el, 'fold_group_1').textContent, /Askers.*2 things/);
      // untangle_data_untouched
      assert.equal(env.state.files.get(PATH), NOTED);
      assert.equal((env.state.writes ?? []).length, 0);
    } finally {
      env.uninstall();
    }
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
    const text = el.querySelector('.thoughtknot-view').textContent;
    const sourceBefore = JSON.stringify([...env.state.files.entries()]);
    tap(el, thing(el, 'large'));
    withText(el.querySelector('.thoughtknot-details'), 'button', 'Show only this and its neighbours').click();
    withText(banner(el), 'button', 'Show the whole graph').click();
    labelled(el, 'Filter by kind or link').click();
    el.querySelectorAll('.thoughtknot-filter button')[0].click();
    el.querySelectorAll('.thoughtknot-filter button')[0].click();
    tap(el, thing(el, 'tablet'), 4);
    withText(el.querySelector('.thoughtknot-details'), 'button', 'Shortest path to another thing').click();
    tap(el, thing(el, 'q'), 5);
    labelled(el, 'Find a thing').click();
    const input = el.querySelector('.thoughtknot-find input');
    input.value = 'eyes';
    input.dispatch('input');
    el.querySelectorAll('.thoughtknot-find-results button')[0].click();
    el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'ArrowRight', target: thing(el, 'eyes') });
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
      withText(live.querySelector('.thoughtknot-details'), 'button', 'Show only this and its neighbours').click();
      withText(banner(live), 'button', 'Show the whole graph').click();
      labelled(live, 'Filter by kind or link').click();
      live.querySelectorAll('.thoughtknot-filter button')[0].click();
      live.querySelectorAll('.thoughtknot-filter button')[0].click();
      tap(live, thing(live, 'q'), 4);
      withText(live.querySelector('.thoughtknot-details'), 'button', 'Shortest path to another thing').click();
      tap(live, thing(live, 'large'), 5);
      assert.match(said(live), /The shortest path from/);
      labelled(live, 'Find a thing').click();
      const input = live.querySelector('.thoughtknot-find input');
      input.value = 'large';
      input.dispatch('input');
      live.querySelectorAll('.thoughtknot-find-results button')[0].click();
      live.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'ArrowUp', target: thing(live, 'large') });
      live.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'Escape' });
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
