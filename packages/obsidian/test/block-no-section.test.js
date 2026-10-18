// A graph block drawn with no place in a note (spec §3, reading_view_whole_note). Another plugin (Dataview, Kanban and
// the like) renders Markdown where Obsidian can say nothing of the section a block is in.
// So the card cannot know which line of which note it would write. It is read-only there: Source and no Edit, and nothing in it writes.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { fakeContext } from './host/fake-obsidian.js';
import { tapKey } from './host/inspector-steps.js';
import { propertiesShown } from './host/details-read.js';

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
  // The processor resolves when the card is drawn: bar, drawing, banner or empty prompt.
  // (A layout refused by the worker is waited for by its test.)
  await env.state.processors.get('gql')(source, el, fakeContext(NOTE, -1, children));
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
      const panel = el.querySelector('.thoughtknot-details');
      assert.ok(propertiesShown(panel).includes('weight: 180'), 'its properties are shown');
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
      assert.ok(el.querySelector('.thoughtknot-empty'), 'the prompt is shown');
      assert.ok(!el.querySelectorAll('button').some((b) => b.getAttribute('aria-label') === 'Edit'), 'no Edit');
    } finally {
      env.uninstall();
    }
  });
});

// The paths that show a block as text, or hold its place for an editor, are read-only with no section info too.
// The block may be edited at the line the card names (line 0, as no section info gives). The editor still never mounts.
describe('a graph shown as text, or with nothing drawable while edited, is read-only with no section info', () => {
  const AT_TOP = `${fence(GRAPH)}\n`;

  /** The plugin with the block at line 0 of the note open in an editor in place, as when it is edited in Live Preview. */
  async function editedAtTop() {
    const env = await load({ files: { [PATH]: AT_TOP } });
    await env.plugin.editHere({ path: PATH, line: 0, graph: 'reader' }, env.doc.body.createDiv());
    assert.ok(env.plugin.inlineFor(PATH, 0), 'the editor is open on the block the card names');
    return env;
  }

  /** What read-only means here: the text, no editor, no Edit, nothing written, no pane. */
  function assertReadOnly(env, el, why) {
    assert.ok(el.querySelector('pre.thoughtknot-code'), `${why}: its text is shown`);
    assert.equal(el.querySelector('textarea'), null, `${why}: no editor in the card`);
    assert.equal(el.querySelector('.thoughtknot-edit-slot'), null, `${why}: no place held for an editor`);
    assert.ok(!labelled(el, 'Edit here') && !labelled(el, 'Edit in pane') && !labelled(el, 'Edit'), `${why}: no Edit`);
    assert.equal(env.state.files.get(PATH), AT_TOP, `${why}: nothing written`);
    assert.equal(env.app.workspace.leaves.length, 0, `${why}: no pane was opened`);
  }

  test('a block too large to read is its text under the banner, with no editor and no Edit', async () => {
    const env = await editedAtTop();
    try {
      const el = await drawnWithNoSection(env, `${GRAPH}\n${'// padding\n'.repeat(10_000)}`);
      await wait(50);
      assert.match(el.querySelector('.thoughtknot-banner')?.textContent ?? '', /too large to read/i);
      assertReadOnly(env, el, 'too large');
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });

  test('a block whose layout is refused is its text under the banner, with no editor and no Edit', async () => {
    const env = await editedAtTop();
    Object.assign(env.plugin.layoutLimits, { things: 1 });
    try {
      const el = await drawnWithNoSection(env, GRAPH);
      await until(() => !!el.querySelector('.thoughtknot-banner'));
      assert.match(el.querySelector('.thoughtknot-banner')?.textContent ?? '', /too large/i);
      assertReadOnly(env, el, 'layout refused');
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });

  test('with nothing to draw while it is edited, the block is its text, and the editor does not take its place', async () => {
    const env = await editedAtTop();
    try {
      const el = await drawnWithNoSection(env, '// graph: reader\n(q');
      await wait(50);
      assertReadOnly(env, el, 'nothing drawable');
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });
});
