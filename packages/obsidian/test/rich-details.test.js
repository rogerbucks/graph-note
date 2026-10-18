// Rich details (editor spec §18, rich_details, node_is_a_note). A thing's text and properties are shown in its details as
// Markdown. Obsidian renders it with its own MarkdownRenderer, never HTML the plugin writes. Some things show a note,
// rendered, and open it. They are a thing whose id is a global note id (`note:Trip plan`, graph spec §10), or a link to a
// note. Nothing remote is loaded, from the details or from a note embedded in them. An image from outside the vault is
// shown as a link only (§13, offline_and_mobile_apis). Asking to load one is remote_images_asked, slice 5.
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
(trip:Doc {id: 'note:Trip plan', name: 'Trip'}),
(old:Doc {id: '[[Trip plan]]', name: 'Old trip'}),
(guide:Doc {name: 'Guide', see: 'Read ![[Trip plan]] first'}),
(way:Doc {name: 'Way', see: '![[Trip plan#Route]]'}),
(plan)-[:FOR]->(trip)`;
/** The note a thing stands for: remote images in it, as Markdown and as HTML, and a note it embeds, holding another. */
const TRIP_PLAN = [
  '# Trip plan',
  'Go by train.',
  '![](https://example.com/a.png)',
  '<img src=https://example.com/b.png>',
  '![[Inner]]',
  '## Route',
  'By the coast.',
].join('\n');
const FILES = {
  [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n'),
  'Trip plan.md': TRIP_PLAN,
  'Inner.md': '![](https://example.com/inner.png)',
};

/** The address of each image on the page that would be fetched from outside the vault: as text, so a failure says only that. */
const remoteImages = (panel) =>
  panel
    .querySelectorAll('img')
    .map((i) => i.getAttribute('src') ?? '')
    .filter((src) => /^(https?:)?\/\//.test(src));

/** The card, drawn, with the details of `key` open. */
async function details(env, key) {
  const el = await show(env);
  await until(() => !!el.querySelector('g.node'));
  tapKey(el, key);
  const panel = el.querySelector('.thoughtknot-details');
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
      const remote = remoteImages(panel);
      assert.deepEqual(remote, []);
      // a link to it, its address kept for the plugin to hand over, never one the browser follows
      assert.ok(panel.querySelectorAll('a').some((a) => a.getAttribute('data-href') === 'https://example.com/c.png'));
    } finally {
      env.uninstall();
    }
  });
});

describe('a thing that stands for a note (node_is_a_note)', () => {
  /** The note's details: the note shown, rendered by Obsidian from its own text, and Open, which opens it. */
  async function standsFor(key) {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, key);
      await until(() => panel.textContent.includes('Go by train.'));
      assert.ok(
        env.state.rendered.some(
          (r) => r.markdown.startsWith('# Trip plan\nGo by train.') && r.sourcePath === 'Trip plan.md',
        ),
        'the note’s own text, rendered from where it is',
      );
      const open = panel.querySelectorAll('a').find((a) => a.textContent === 'Open Trip plan');
      assert.ok(open, 'Open the note');
      open.click();
      assert.deepEqual(env.state.opened, { link: 'Trip plan', from: PATH, newLeaf: false });
      return { env, panel };
    } catch (e) {
      env.uninstall();
      throw e;
    }
  }

  test('a global note id, note: and its name, shows the note in the details, and Open opens it (graph spec §10)', async () => {
    const { env } = await standsFor('note:Trip plan');
    env.uninstall();
  });

  test('a link to a note as its id stands for the note too', async () => {
    const { env } = await standsFor('[[Trip plan]]');
    env.uninstall();
  });

  test('the note shown loads no remote image, written as Markdown or as HTML, nor any note it embeds', async () => {
    const { env, panel } = await standsFor('note:Trip plan');
    try {
      const remote = remoteImages(panel);
      assert.deepEqual(remote, [], 'nothing remote is on the page to load');
      for (const r of env.state.rendered)
        assert.doesNotMatch(r.markdown, /!\[[^\]]*\]\(https?:|<img|!\[\[/i, r.markdown);
      // each remote image a link to it, its whole address kept for the plugin to hand over, and no other address
      const outside = panel
        .querySelectorAll('a')
        .map((a) => a.getAttribute('data-href') ?? '')
        .filter((h) => h.startsWith('https:') || h.startsWith('http:'));
      assert.deepEqual(outside, ['https://example.com/a.png', 'https://example.com/b.png']);
      assert.ok(!panel.textContent.includes('inner.png'), 'a note it embeds is a link, never read in');
    } finally {
      env.uninstall();
    }
  });

  test('a note embedded in a property loads nothing remote either', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'guide');
      await until(() => panel.textContent.includes('Go by train.'));
      const remote = remoteImages(panel);
      assert.deepEqual(remote, []);
    } finally {
      env.uninstall();
    }
  });

  test('a heading of a note embedded shows that section alone', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'way');
      await until(() => panel.textContent.includes('By the coast.'));
      assert.ok(!panel.textContent.includes('Go by train.'), 'nothing of the note above the heading');
      assert.ok(
        env.state.rendered.some((r) => r.markdown === '## Route\nBy the coast.' && r.sourcePath === 'Trip plan.md'),
      );
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
