// A graph block drawn with no place in a note (spec §3, reading_view_whole_note): another plugin (Dataview, Kanban and the
// like) renders Markdown where Obsidian can say nothing of the section a block is in, so the card cannot know which line
// of which note it would write. It is read-only there: Source and no Edit, and nothing in it writes.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { fakeContext } from './host/fake-obsidian.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const PATH = 'Some note.md';
const GRAPH = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader', weight: 180}),
(large)-[:ANSWERS]->(q)`;
const VIEW = "// graph: reader · QUERY view answers\nMATCH (n {id: 'q'})-[]-{1,1}(m) RETURN n, m";
const NOTE = ['# Reader', '', fence(GRAPH), '', fence(VIEW), ''].join('\n');

/** Draws `source` as another plugin's rendering would: on the page, with no section info (getSectionInfo gives null). */
async function drawnWithNoSection(env, source, children = []) {
  const el = env.doc.body.createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(source, el, fakeContext(NOTE, -1, children));
  await wait(20);
  return el;
}

describe('a graph with no section info is read-only', () => {
  test('its bar offers Source and no Edit, its details nothing to change, and its options write nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const children = [];
      const el = await drawnWithNoSection(env, GRAPH, children);
      await until(() => !!el.querySelector('svg'));
      assert.ok(!labelled(el, 'Edit here') && !labelled(el, 'Edit in pane'), 'no Edit');
      assert.ok(labelled(el, 'Show source'), 'Source is offered');
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      assert.ok(
        panel.querySelectorAll('li').some((li) => li.textContent === 'weight: 180'),
        'its properties are shown',
      );
      assert.equal(panel.querySelectorAll('input, [role="button"]').length, 0, 'nothing to change them with');
      const card = children.find((c) => c.o?.drawn);
      card.o.onEdit?.();
      assert.ok(card.o.editing?.() === undefined, 'no editor reaches it');
      assert.equal(await card.o.writeView?.(VIEW), undefined);
      await wait(50);
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(env.app.workspace.leaves.length, 0, 'no pane was opened');
    } finally {
      env.uninstall();
    }
  });

  test('an empty graph with no section info offers no Edit', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await drawnWithNoSection(env, '// graph: reader');
      assert.ok(el.querySelector('.graph-note-empty'), 'the prompt is shown');
      assert.ok(!el.querySelectorAll('button').some((b) => b.getAttribute('aria-label') === 'Edit'), 'no Edit');
    } finally {
      env.uninstall();
    }
  });
});
