// A graph drawn as a table (editor spec §15, diagram_type_set, type_one_way_to_work): a plain table the plugin draws, not
// Graphviz — a row for each thing, with its kind and properties, and one for each link — worked as a drawing is: a row
// tapped, or opened from the keyboard, shows its details, the one shown marked; and the bar's zoom scales it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

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
      const [things, links] = el.querySelectorAll('.graph-note-table table');
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
      const vp = el.querySelector('.graph-note-viewport');
      const row = el.querySelectorAll('tr[data-key]')[1];
      const cell = row.querySelector('td');
      vp.dispatch('pointerdown', { target: cell, pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20 });
      vp.dispatch('pointerup', { target: cell, pointerId: 1, pointerType: 'touch', clientX: 21, clientY: 20 });
      const panel = el.querySelector('.graph-note-details');
      assert.ok(!panel.hidden);
      assert.match(panel.textContent, /The park/);
      assert.match(panel.textContent, /Home near this/);
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
      assert.match(el.querySelector('.graph-note-details').textContent, /From: Home/);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_one_way_to_work
  test('zooms by the bar’s buttons, as a drawing does', async () => {
    const { env, el } = await card();
    try {
      const table = el.querySelector('.graph-note-table');
      const before = Number(table.cssProps['--graph-note-scale']);
      labelled(el, 'Zoom in').click();
      assert.ok(Number(table.cssProps['--graph-note-scale']) > before, 'larger');
      labelled(el, 'Fit').click();
      assert.equal(Number(table.cssProps['--graph-note-scale']), before);
    } finally {
      env.uninstall();
    }
  });
});
