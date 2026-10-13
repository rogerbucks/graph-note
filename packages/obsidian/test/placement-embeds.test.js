// A graph in an embed of another note (`![[Some note]]`) is read-only wherever it is shown (spec §3,
// reading_view_whole_note; Roger, 11 Oct 2026): in a note in reading view, and in a note in Live Preview too, where
// Obsidian draws the embed as an `.internal-embed.markdown-embed` inside the editor. Only the note's own block, where the
// note is edited, can be edited.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, showIn } from './host/card-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const GRAPH = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader', weight: 180}),
(large)-[:ANSWERS]->(q)`;
const NOTE = ['# Reader', '', fence(GRAPH), ''].join('\n');

/**
 * Draws the note's graph block as Obsidian draws a note embedded in another: in an embed, inside a note in Live Preview
 * ('live') or in reading view ('reading').
 */
async function showEmbedded(env, where) {
  const lines = NOTE.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  const live = where === 'live';
  const host = env.doc.body.createDiv({
    cls: live ? 'markdown-source-view mod-cm6 is-live-preview' : 'markdown-reading-view',
  });
  const page = host.createDiv({ cls: live ? 'cm-editor' : 'markdown-preview-view markdown-rendered' });
  const embed = page.createDiv({
    cls: `internal-embed markdown-embed inline-embed is-loaded${live ? ' cm-embed-block' : ''}`,
  });
  const el = embed
    .createDiv({ cls: 'markdown-embed-content' })
    .createDiv({ cls: 'markdown-preview-view markdown-rendered' })
    .createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(GRAPH, el, fakeContext(NOTE, open));
  await until(() => !!el.querySelector('svg'));
  await wait(20);
  return el;
}

/**
 * Every control in the details that can be pressed or typed in, by its name, its words or its tag; but those that only
 * find the way round the drawing (§25): a linked thing or link chosen, a step along the trail, the sheet minimised.
 */
const controls = (el) =>
  el
    .querySelectorAll(
      '.graph-note-details button, .graph-note-details input, .graph-note-details textarea, .graph-note-details [role="button"]',
    )
    .filter((c) => !c.closest('.graph-note-link-group, .graph-note-trail') && !c.hasClass('graph-note-sheet-toggle'))
    .map((c) => c.getAttribute('aria-label') || c.textContent || c.tagName);

/** What a thing's details offer beside closing, where the note is only read (§25): both change the picture, never the note. */
const UNTANGLING = ['Show only this and its neighbours', 'Shortest path to another thing'];

describe('a graph embedded in another note is read-only wherever it is shown', () => {
  test('embedded in a note in Live Preview: Source and no Edit, and its details change nothing, while its own block is edited', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const live = await showIn(env, 'live');
      labelled(live, 'Edit here').click();
      await until(() => !!live.querySelector('textarea'));
      const typed = live.querySelector('textarea').value;
      const el = await showEmbedded(env, 'live');
      for (const label of ['Edit here', 'Edit in pane', 'Record a path', 'Make a view'])
        assert.ok(!labelled(el, label), `no ${label}`);
      assert.ok(labelled(el, 'Show source'), 'Source is offered');
      tapKey(el, 'large');
      assert.deepEqual(controls(el), ['Close details', ...UNTANGLING]);
      await wait(50);
      assert.equal(live.querySelector('textarea').value, typed);
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });

  test('embedded in a note in reading view: Source and no Edit', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await showEmbedded(env, 'reading');
      assert.ok(!labelled(el, 'Edit here') && !labelled(el, 'Edit in pane'), 'no Edit');
      assert.ok(labelled(el, 'Show source'), 'Source is offered');
    } finally {
      env.uninstall();
    }
  });
});
