// Many views of one graph (editor spec §7, many_views_one_data, view_of_another_note): several views of the same graph
// are shown in one note or in several, each drawn from the one data set where it is written and none copying it; a view
// in one note draws a graph written in another, read there, saying which note the data comes from and opening it on a
// tap; and when the data changes where it is written, every view of it in every note draws the change.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const SOURCE = 'Trip.md';
const DATA = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe), (cafe)-[:NEAR]->(lake)`;
const NEAR = "// graph: trip · QUERY view round_park\nMATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m";
const ENDS = "// graph: trip · QUERY view ends\nMATCH (n) WHERE n.id IN ['home', 'lake'] RETURN n";
const PLACES = '// graph: trip · QUERY view places\nMATCH (n:Place) RETURN n';
const FROM = '// graph: trip · FROM [[Trip]]';
const noteOf = (...blocks) => ['# A note', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const keys = (el) => el.querySelectorAll('g.node').map((g) => g.getAttribute('data-key'));
const faded = (el) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.classList.contains('graph-note-faded'))
    .map((g) => g.getAttribute('data-key'));
const written = (note) => note.split("(home:Place {name: 'Home'})").length - 1;

describe('several views of one graph, in one note', () => {
  // proves: many_views_one_data
  test('are each drawn from the one data block, none copying it', async () => {
    const note = noteOf(DATA, NEAR, ENDS);
    const env = await load({ files: { 'Some note.md': note } });
    try {
      const first = await show(env, note, 1),
        second = await show(env, note, 2);
      await until(() => keys(first.el).length > 0 && keys(second.el).length > 0);
      assert.deepEqual(faded(first.el), ['lake']);
      assert.deepEqual(faded(second.el).sort(), ['cafe', 'park']);
      assert.equal(written(note), 1, 'the data is written once');
      assert.equal(env.state.writes, undefined, 'drawing them writes nothing');
    } finally {
      env.uninstall();
    }
  });
});

describe('a view in one note of a graph written in another', () => {
  // proves: view_of_another_note
  test('draws the graph where it is written, and the note it is in holds none of the data', async () => {
    const here = noteOf(FROM, NEAR);
    const env = await load({ files: { [SOURCE]: noteOf(DATA), 'Some note.md': here } });
    try {
      const { el } = await show(env, here, 1);
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el).sort(), ['cafe', 'home', 'lake', 'park']);
      assert.deepEqual(faded(el), ['lake']);
      assert.match(el.querySelector('.graph-note-view-reading').textContent, /everything within 1 step of The park/);
      assert.equal(written(here), 0, 'nothing of the data is in the note');
      assert.equal(env.state.writes, undefined);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_of_another_note
  test('says which note the data comes from, and opens that note on a tap', async () => {
    const here = noteOf(FROM, NEAR);
    const env = await load({ files: { [SOURCE]: noteOf(DATA), 'Some note.md': here } });
    try {
      const { el } = await show(env, here, 1);
      await until(() => keys(el).length > 0);
      assert.match(el.querySelector('.graph-note-source').textContent, /Drawn from the note Trip/);
      labelled(el, 'Open Trip').click();
      assert.deepEqual(env.state.opened, { link: 'Trip', from: 'Some note.md' });
    } finally {
      env.uninstall();
    }
  });

  // proves: view_of_another_note
  test('the FROM block itself draws the whole graph, read-only, saying where it comes from', async () => {
    const here = noteOf(FROM, NEAR);
    const env = await load({ files: { [SOURCE]: noteOf(DATA), 'Some note.md': here } });
    try {
      const { el } = await show(env, here, 0);
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el).sort(), ['cafe', 'home', 'lake', 'park']);
      assert.ok(labelled(el, 'Open Trip'), 'the way to the data');
      assert.equal(labelled(el, 'Edit here'), undefined, 'nothing here edits the other note’s data');
    } finally {
      env.uninstall();
    }
  });

  // proves: view_of_another_note
  test('a source note that is missing is named, with why, never a blank drawing', async () => {
    const here = noteOf('// graph: trip · FROM [[Nowhere]]', NEAR);
    const env = await load({ files: { 'Some note.md': here } });
    try {
      const { el } = await show(env, here, 1);
      const alert = el.querySelector('[role="alert"]');
      assert.match(alert.textContent, /The note Nowhere is not in the vault, so graph trip cannot be drawn from it/);
      assert.equal(el.querySelector('svg'), null);
      assert.match(el.querySelector('code').textContent, /round_park/, 'the view’s query, as text');
    } finally {
      env.uninstall();
    }
  });
});

describe('views of one graph in several notes', () => {
  // proves: many_views_one_data
  test('each draws the one data set: changed where it is written, every view draws the change', async () => {
    const second = noteOf(FROM, NEAR),
      third = noteOf(FROM, PLACES);
    const env = await load({ files: { [SOURCE]: noteOf(DATA), 'Some note.md': second } });
    try {
      const a = await show(env, second, 1),
        b = await show(env, third, 1);
      await until(() => keys(a.el).length > 0 && keys(b.el).length > 0);
      assert.deepEqual(keys(b.el).sort(), ['cafe', 'home', 'lake', 'park']);
      const changed = DATA.replace("'The park'", "'The big park'") + ",\n(zoo:Place {name: 'Zoo'})";
      await env.app.vault.modify(env.app.vault.getFileByPath(SOURCE), noteOf(changed));
      await until(() => keys(b.el).includes('zoo'));
      await until(() => /The big park/.test(a.el.textContent));
      assert.match(a.el.querySelector('.graph-note-view-reading').textContent, /The big park/);
      assert.equal(written(second) + written(third), 0, 'neither note holds a copy');
    } finally {
      env.uninstall();
    }
  });
});
