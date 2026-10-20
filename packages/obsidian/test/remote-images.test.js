// Images from outside the vault, asked for (editor spec §18, remote_images_asked; §13). Showing a graph never sends a
// request on its own. An image from outside the vault is a link with a Load image button beside it. Only pressing that
// button puts the image on the page. That goes for an image in a thing's details and in a note embedded there.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/card-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { fence } from './host/notes.js';

before(() => build());

const PATH = 'Some note.md';
const GRAPH = `// graph: trip
(plan:Doc {name: 'Plan', chart: '![chart](https://example.com/c.png)', raw: '<img src="https://example.com/t.gif">', see: '[the site](https://example.com/)'}),
(guide:Doc {name: 'Guide', see: 'Read ![[Trip plan]] first'})`;
const FILES = {
  [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n'),
  'Trip plan.md': ['# Trip plan', 'Go by train.', '![](https://example.com/a.png)'].join('\n'),
};

/** Every address an image on the page would fetch from outside the vault. */
const remoteImages = (panel) =>
  panel
    .querySelectorAll('img')
    .map((i) => i.getAttribute('src') ?? '')
    .filter((src) => /^(https?:)?\/\//.test(src));

/** The Load image buttons in the details. */
const loadButtons = (panel) => panel.querySelectorAll('button.thoughtknot-load-image');

/** The card, drawn, with the details of `key` open. */
async function details(env, key) {
  const el = await show(env);
  await until(() => !!el.querySelector('g.node'));
  tapKey(el, key);
  const panel = el.querySelector('.thoughtknot-details');
  await until(() => (env.state.rendered ?? []).length > 0);
  return { el, panel };
}

describe('an image from outside the vault loads only when asked (remote_images_asked)', () => {
  test('showing the details loads nothing: each outside image is a link with a Load image button', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'plan');
      await until(() => loadButtons(panel).length === 2);
      assert.deepEqual(remoteImages(panel), [], 'nothing outside the vault is on the page to load');
      // one button for each image, Markdown and HTML, and none for a plain web link
      const named = loadButtons(panel).map((b) => b.getAttribute('aria-label'));
      assert.deepEqual(named, ['Load the image from example.com', 'Load the image from example.com']);
      assert.ok(loadButtons(panel).every((b) => b.getAttribute('type') === 'button'));
    } finally {
      env.uninstall();
    }
  });

  test('pressing Load image shows that image alone, sending no referrer, and the button goes', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'plan');
      await until(() => loadButtons(panel).length === 2);
      loadButtons(panel)[0].click();
      assert.deepEqual(remoteImages(panel), ['https://example.com/c.png'], 'the image asked for, and only it');
      const img = panel.querySelectorAll('img').find((i) => i.getAttribute('src') === 'https://example.com/c.png');
      assert.equal(img.getAttribute('referrerpolicy'), 'no-referrer');
      assert.equal(img.getAttribute('alt'), 'chart');
      assert.equal(loadButtons(panel).length, 1, 'the other image still waits to be asked for');
      // the link to it stays, to open it outside Obsidian as before
      assert.ok(panel.querySelectorAll('a').some((a) => a.getAttribute('data-href') === 'https://example.com/c.png'));
    } finally {
      env.uninstall();
    }
  });

  test('an image in a note embedded in the details waits to be asked for too', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { panel } = await details(env, 'guide');
      await until(() => panel.textContent.includes('Go by train.'));
      await until(() => loadButtons(panel).length === 1);
      assert.deepEqual(remoteImages(panel), []);
      loadButtons(panel)[0].click();
      assert.deepEqual(remoteImages(panel), ['https://example.com/a.png']);
    } finally {
      env.uninstall();
    }
  });
});
