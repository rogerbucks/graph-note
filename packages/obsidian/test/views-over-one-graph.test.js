// Views over one graph (editor spec §36, views_over_one_graph). Each view is a choice of how to draw the same graph.
// - Two views of one graph sit stacked in one note, each drawn as its own diagram type.
// - An edit to the graph shows in both views at once. Neither holds a copy of the data.
// - A diagram type chosen in one view is written for that view alone. The other view keeps its own.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe)`;
const SOURCE = 'Trip.md';
const FROM = '// graph: trip · FROM [[Trip]]';
const ALL = '// graph: trip · QUERY view all\nMATCH (n:Place) RETURN n';
const GRID = '// graph: trip · QUERY view grid\nMATCH (n:Place) RETURN n';
const STYLE = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'thoughtknot.diagrams.matrix', view: 'grid'})";
const noteOf = (...blocks) => ['# Trip', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const NOTE = noteOf(DATA, ALL, GRID, STYLE);
const keys = (el) => el.querySelectorAll('g.node').map((g) => g.getAttribute('data-key'));
const picture = (el) => el.querySelector('.thoughtknot-plugin-picture svg');

async function both(env) {
  const all = await show(env, NOTE, 1),
    grid = await show(env, NOTE, 2);
  await until(() => keys(all.el).length > 0 && picture(grid.el));
  return { all: all.el, grid: grid.el };
}

describe('two views of one graph, stacked in one note', () => {
  // proves: views_over_one_graph
  test('are each drawn as their own diagram type, from the one data block', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { all, grid } = await both(env);
      assert.deepEqual(keys(all).sort(), ['cafe', 'home', 'park']);
      assert.equal(picture(all), null, 'the first is drawn as boxes and links');
      assert.match(grid.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as Matrix/);
      assert.match(picture(grid).textContent, /The park/);
      assert.equal(env.state.writes, undefined, 'drawing them writes nothing');
    } finally {
      env.uninstall();
    }
  });

  // proves: views_over_one_graph
  test('both draw an edit to the graph where it is written, and neither holds a copy of it', async () => {
    const here = noteOf(FROM, ALL, GRID, STYLE);
    const env = await load({ files: { [SOURCE]: noteOf(DATA), [PATH]: here } });
    try {
      const all = (await show(env, here, 1)).el,
        grid = (await show(env, here, 2)).el;
      await until(() => keys(all).length > 0 && picture(grid));
      const changed = DATA.replace("'The park'", "'The big park'") + ",\n(zoo:Place {name: 'Zoo'})";
      await env.app.vault.modify(env.app.vault.getFileByPath(SOURCE), noteOf(changed));
      await until(() => keys(all).includes('zoo'));
      await until(() => /Zoo/.test(picture(grid)?.textContent ?? ''));
      assert.match(picture(grid).textContent, /The big park/);
      assert.match(all.textContent, /The big park/);
      assert.ok(!here.includes('(home:Place'), 'the note with the views holds no copy');
    } finally {
      env.uninstall();
    }
  });

  // proves: views_over_one_graph
  test('a diagram type chosen in one view is written for it alone, and the other keeps its own', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { all } = await both(env);
      labelled(all, 'Diagram type').click();
      all
        .querySelectorAll('.thoughtknot-view-list button')
        .find((b) => b.textContent === 'Treemap')
        .click();
      await until(() => /treemap/.test(env.state.files.get(PATH)));
      await settled();
      const now = env.state.files.get(PATH);
      assert.match(now, /Diagram \{type: 'thoughtknot\.diagrams\.treemap', view: 'all'\}/);
      assert.match(now, /\{type: 'thoughtknot\.diagrams\.matrix', view: 'grid'\}/, 'the other view keeps Matrix');
      assert.ok(now.includes(fence(DATA)), 'the data block untouched');
    } finally {
      env.uninstall();
    }
  });
});
