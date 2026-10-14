// Rich details (editor spec §18, rich_details, node_is_a_note): a thing's text and properties are shown in its details as
// Markdown that Obsidian renders, through its own MarkdownRenderer, never HTML the plugin writes; a thing whose id is a
// link to a note shows that note, rendered, and opens it. Nothing remote is loaded: an image from outside the vault is
// shown as a link only (§13; asking to load one is remote_images_asked, slice 5).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/card-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { fence } from './host/notes.js';

before(() => build());

const PATH = 'Some note.md';
const GRAPH = `// graph: trip
(plan:Doc {name: 'The *plan*', pic: '![[photo.png]]', sum: 'Costs $E = mc^2$ in **total**', chart: '![chart](https://example.com/c.png)', raw: '<img src="https://example.com/t.gif"> <b>bold</b>'}),
(trip:Doc {id: '[[Trip plan]]'}),
(plan)-[:FOR]->(trip)`;
const FILES = { [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n'), 'Trip plan.md': '# Trip plan\nGo by train.' };

/** The card, drawn, with the details of `key` open. */
async function details(env, key) {
  const el = await show(env);
  await until(() => !!el.querySelector('g.node'));
  tapKey(el, key);
  const panel = el.querySelector('.graph-note-details');
  await until(() => (env.state.rendered ?? []).length > 0);
  return { el, panel };
}

describe('the details of a thing, rendered by Obsidian (rich_details)', () => {
  test('its text and properties are handed to Obsidian’s Markdown renderer, from the note they are written in', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'plan');
      const handed = env.state.rendered.map((r) => r.markdown);
      for (const m of ['The *plan*', '![[photo.png]]', 'Costs $E = mc^2$ in **total**'])
        assert.ok(handed.includes(m), `${m} rendered by the host`);
      assert.ok(env.state.rendered.every((r) => r.sourcePath === PATH && r.component));
      // as Obsidian renders them: an embed, maths and emphasis appear as in a note
      assert.ok(panel.querySelector('.internal-embed[src="photo.png"]'), 'the image embed');
      assert.equal(panel.querySelector('.math')?.textContent, 'E = mc^2');
      assert.ok(panel.querySelector('strong'), 'bold');
    } finally {
      env.uninstall();
    }
  });

  test('the plugin writes no HTML of its own, and Obsidian is handed none to render', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'plan');
      assert.equal(panel.querySelector('b'), null, 'HTML in a property is shown as text');
      assert.ok(panel.textContent.includes('<b>bold</b>'));
      assert.ok(env.state.rendered.every((r) => !/<[a-z]/i.test(r.markdown)));
    } finally {
      env.uninstall();
    }
  });

  test('an image from outside the vault is never loaded: it is shown as a link only', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'plan');
      const remote = panel.querySelectorAll('img').filter((i) => /^(https?:)?\/\//.test(i.getAttribute('src') ?? ''));
      assert.deepEqual(remote, []);
      assert.ok(panel.querySelectorAll('a').some((a) => a.getAttribute('href') === 'https://example.com/c.png'));
    } finally {
      env.uninstall();
    }
  });
});

describe('a thing that stands for a note (node_is_a_note)', () => {
  test('its details show the note, rendered by Obsidian, and opening the thing opens the note', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, '[[Trip plan]]');
      assert.ok(
        env.state.rendered.some((r) => r.markdown === '![[Trip plan]]'),
        'the note is embedded as Obsidian embeds one',
      );
      assert.ok(panel.querySelector('.internal-embed[src="Trip plan"]'));
      const open = panel.querySelectorAll('a').find((a) => a.textContent === 'Open Trip plan');
      assert.ok(open, 'Open the note');
      open.click();
      assert.deepEqual(env.state.opened, { link: 'Trip plan', from: PATH, newLeaf: false });
    } finally {
      env.uninstall();
    }
  });

  test('a thing whose id names no note is no note', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'plan');
      assert.ok(!panel.querySelectorAll('a').some((a) => /^Open /.test(a.textContent)));
    } finally {
      env.uninstall();
    }
  });
});
