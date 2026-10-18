// Sources and steps in the editing view (editor spec §20; §7 view_of_another_note): in Live Preview a block drawn FROM
// a file or a note, and a graph step, each get the plugin's own card, as a graph and a view do, so each redraws with the
// note's other blocks and its page stays still; a plain query is still left to Obsidian. The step's card is found by
// its graph line alone, so a long block is never read to decide it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { cardsOf, openNote } from './host/editing-view.js';
import { fence, labelled } from './host/notes.js';

before(() => build());

const PATH = 'Some note.md';
const TEAM = `// graph: team
(ada:Person {name: 'Ada'}),
(bob:Person {name: 'Bob'}),
(atlas:Project {name: 'Atlas'}),
(ada)-[:WORKS_ON]->(atlas), (bob)-[:WORKS_ON]->(atlas)`;
const STEP = `// graph: team · QUERY step colleagues
// takes people: (:Person), (:Project), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)
INSERT (a)-[:WORKS_WITH]->(b)`;
const FROM = '// graph: trip · FROM [[Trip]]';
const QUERY = '// graph: team · QUERY\nMATCH (n) RETURN n';
const TRIP = "# Trip\n\n```gql\n// graph: trip\n(home:Place {name: 'Home'})\n```\n";

describe('sources and steps in Live Preview', () => {
  // proves: view_of_another_note
  test('a FROM block and a step each get the plugin’s own card; a plain query is left to Obsidian', async () => {
    const note = ['# Team', '', fence(TEAM), '', fence(FROM), '', fence(STEP), '', fence(QUERY), ''].join('\n');
    const env = await load({ files: { [PATH]: note, 'Trip.md': TRIP } });
    const view = openNote(env, note, PATH);
    try {
      const fences = note.split('\n').flatMap((l, i) => (l === '```gql' ? [i] : []));
      assert.deepEqual(
        cardsOf(view.state).map((c) => c.line),
        fences.slice(0, 3),
        'the graph, the FROM block and the step; not the query',
      );
    } finally {
      view.close();
      env.uninstall();
    }
  });

  // proves: run_declared_only
  test('the step’s card, placed in the editing view, offers Run and Edit, and runs nothing until Run is pressed', async () => {
    const note = ['# Team', '', fence(TEAM), '', fence(STEP), ''].join('\n');
    const env = await load({ files: { [PATH]: note } });
    const view = openNote(env, note, PATH);
    try {
      const card = cardsOf(view.state).at(-1);
      const host = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const dom = card.widget.toDOM();
      host.appendChild(dom);
      await until(() => !!dom.querySelector('.thoughtknot-step'));
      assert.ok(labelled(dom, 'Run step colleagues'), 'Run');
      assert.ok(labelled(dom, 'Edit'), 'Edit');
      assert.equal(env.state.writes, undefined, 'nothing written');
    } finally {
      view.close();
      env.uninstall();
    }
  });

  // proves: run_declared_only
  test('a step block too long to be a step still gets its card, which says so: the card is chosen by its first line', async () => {
    const long = `${STEP}\n${'// padding\n'.repeat(20_000)}`;
    const note = ['# Team', '', fence(TEAM), '', fence(long), ''].join('\n');
    const env = await load({ files: { [PATH]: note } });
    const view = openNote(env, note, PATH);
    try {
      const cards = cardsOf(view.state);
      assert.equal(cards.length, 2, 'the graph and the step block each have a card');
      const card = cards.at(-1);
      const host = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const dom = card.widget.toDOM();
      host.appendChild(dom);
      await until(() => !!dom.querySelector('.thoughtknot-step [role="alert"]'));
      assert.match(dom.querySelector('[role="alert"]').textContent, /a step is at most 8,192 characters long/);
    } finally {
      view.close();
      env.uninstall();
    }
  });
});
