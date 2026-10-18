// A graph drawn as a table (editor spec §15, diagram_type_set, type_one_way_to_work): a plain table the plugin draws, not
// Graphviz — a row for each thing, with its kind and properties, and one for each link — worked as a drawing is: a row
// tapped, or opened from the keyboard, shows its details, the one shown marked; and the bar's zoom scales it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { groupsRead } from './host/details-read.js';

before(() => build());

const PATH = 'Some note.md';
const TRIP = `// graph: trip
(home:Place {name: 'Home', open: 'always'}),
(park:Place {name: 'The park', since: DATE '1901-05-01'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR {miles: 2}]->(park),
(cafe)-[:SERVES]->(park)`;
const TABLE = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'table'})";
const note = ['# Trip', '', fence(TRIP), '', fence(TABLE), ''].join('\n');

async function card() {
  const env = await load({ files: { [PATH]: note } });
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing);
    return layout(drawing, owner);
  };
  const { el } = await show(env, note, 0);
  return { env, el, asked };
}
const cells = (tr) => tr.querySelectorAll('td').map((td) => td.textContent);

describe('a graph drawn as a table', () => {
  // proves: diagram_type_set
  test('is a plain table, never laid out by Graphviz: a row for each thing and each link', async () => {
    const { env, el, asked } = await card();
    try {
      assert.equal(asked.length, 0, 'nothing laid out');
      assert.equal(el.querySelector('svg g.node'), null);
      const [things, links] = el.querySelectorAll('.thoughtknot-table table');
      assert.deepEqual(
        things.querySelectorAll('th').map((th) => th.textContent),
        ['Thing', 'Kind', 'open', 'since'],
      );
      assert.deepEqual(things.querySelectorAll('tr[data-key]').map(cells), [
        ['Home', 'Place', 'always', ''],
        ['The park', 'Place', '', '1901-05-01'],
        ['Cafe', 'Cafe', '', ''],
      ]);
      assert.deepEqual(links.querySelectorAll('tr[data-link]').map(cells), [
        ['Home', 'near', 'The park', 'miles: 2'],
        ['Cafe', 'serves', 'The park', ''],
      ]);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('a row tapped shows its details, as a box tapped does, and is marked as the one shown', async () => {
    const { env, el } = await card();
    try {
      const vp = el.querySelector('.thoughtknot-viewport');
      const row = el.querySelectorAll('tr[data-key]')[1];
      const cell = row.querySelector('td');
      vp.dispatch('pointerdown', { target: cell, pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20 });
      vp.dispatch('pointerup', { target: cell, pointerId: 1, pointerType: 'touch', clientX: 21, clientY: 20 });
      const panel = el.querySelector('.thoughtknot-details');
      assert.ok(!panel.hidden);
      assert.match(panel.textContent, /The park/);
      assert.ok(groupsRead(panel).includes('near this Home'), 'its link in, with no reading back');
      assert.equal(row.getAttribute('aria-pressed'), 'true');
      assert.ok(row.classList.contains('is-selected'));
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('each row is reached from the keyboard, named, and Enter opens it: a link’s row its link', async () => {
    const { env, el } = await card();
    try {
      const row = el.querySelectorAll('tr[data-key]')[0];
      assert.equal(row.getAttribute('tabindex'), '0');
      assert.equal(row.getAttribute('aria-label'), 'Place: Home');
      const link = el.querySelectorAll('tr[data-link]')[0];
      assert.equal(link.getAttribute('aria-label'), 'Link: Home near The park');
      link.dispatch('keydown', { key: 'Enter' });
      assert.match(el.querySelector('.thoughtknot-details').textContent, /From: Home/);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('zooms by the bar’s buttons, as a drawing does', async () => {
    const { env, el } = await card();
    try {
      const table = el.querySelector('.thoughtknot-table');
      const before = Number(table.cssProps['--thoughtknot-scale']);
      labelled(el, 'Zoom in').click();
      assert.ok(Number(table.cssProps['--thoughtknot-scale']) > before, 'larger');
      labelled(el, 'Fit').click();
      assert.equal(Number(table.cssProps['--thoughtknot-scale']), before);
    } finally {
      env.uninstall();
    }
  });
});

// The selection of §25 on a table: what it can do there it does, as in a drawing — Find opens a thing and gives its row the
// focus, Escape clears it — and what needs a drawing (the fade, the kept outline, walking the links by arrow key, filtering
// by kind, a neighbourhood alone, a path) is neither done nor offered, and never fails for want of the drawing's SVG.
describe('the selection on a graph drawn as a table', () => {
  const rowOf = (el, key) => el.querySelectorAll('tr[data-key]').find((r) => r.getAttribute('data-key') === key);
  const marked = (el) =>
    el
      .querySelectorAll('tr')
      .filter((r) => ['thoughtknot-dim', 'thoughtknot-kept', 'thoughtknot-hot'].some((c) => r.classList.contains(c)));

  // proves: type_one_way_to_work
  test('with a row selected, an arrow key walks nowhere: the selection stays and the key is left to the page', async () => {
    const { env, el } = await card();
    try {
      const row = rowOf(el, 'home');
      row.dispatch('keydown', { key: 'Enter' });
      assert.ok(row.classList.contains('is-selected'));
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const e = row.dispatch('keydown', { key });
        assert.equal(e.defaultPrevented, false, `${key} not taken`);
        assert.ok(row.classList.contains('is-selected'), `${key} leaves the selection`);
      }
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('a row taking and losing the focus marks nothing: no fade, no kept outline, no highlight', async () => {
    const { env, el } = await card();
    try {
      const [home, park] = [rowOf(el, 'home'), rowOf(el, 'park')];
      home.focus();
      park.focus();
      park.blur();
      home.dispatch('keydown', { key: 'Enter' }); // and with a thing selected, which a drawing would focus on
      park.focus();
      park.blur();
      assert.deepEqual(
        marked(el).map((r) => r.getAttribute('aria-label')),
        [],
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('Find opens the details of the thing found and gives its row the keyboard focus', async () => {
    const { env, el } = await card();
    try {
      labelled(el, 'Find a thing').click();
      const input = el.querySelector('.thoughtknot-find input');
      input.value = 'park';
      input.dispatch('input');
      el.querySelectorAll('.thoughtknot-find-results button')[0].click();
      assert.match(el.querySelector('.thoughtknot-details').textContent, /The park/);
      assert.ok(rowOf(el, 'park').classList.contains('is-selected'));
      // compared, not printed: a failure would otherwise print the whole page
      assert.ok(env.doc.activeElement === rowOf(el, 'park'), 'the row found has the keyboard focus');
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('Escape clears the selection and closes the details', async () => {
    const { env, el } = await card();
    try {
      const row = rowOf(el, 'park');
      row.dispatch('keydown', { key: 'Enter' });
      assert.ok(row.classList.contains('is-selected'));
      const e = row.dispatch('keydown', { key: 'Escape' });
      assert.ok(e.defaultPrevented);
      assert.ok(!row.classList.contains('is-selected'));
      assert.equal(row.getAttribute('aria-pressed'), 'false');
      assert.ok(el.querySelector('.thoughtknot-details').hidden);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('offers no filter by kind, neighbourhood or path: a table has nothing to fade or hide', async () => {
    const { env, el } = await card();
    try {
      assert.ok(labelled(el, 'Find a thing'), 'Find is still offered');
      assert.ok(!labelled(el, 'Filter by kind or link'), 'Filter by kind or link is not offered');
      rowOf(el, 'park').dispatch('keydown', { key: 'Enter' });
      const offered = el.querySelectorAll('.thoughtknot-details button').map((b) => b.textContent);
      assert.ok(!offered.includes('Show only this and its neighbours'), offered.join(', '));
      assert.ok(!offered.includes('Shortest path to another thing'), offered.join(', '));
    } finally {
      env.uninstall();
    }
  });
});
