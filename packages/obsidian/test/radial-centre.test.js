// Picking the centre of a radial drawing on its card (editor spec §15, radial_centre_pick). A thing's details offer
// Put in the centre, and C on its box does the same. The drawing is laid out again around it, the boxes gliding there.
// Where the note is edited, the centre is saved in the style graph. In reading view it is only looked at, never saved.
// While a centre is picked, the strip says so and offers Back to the usual centre.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';
const SKY = `// graph: sky
(sun:Star {name: 'Sun'}),
(earth:Planet {name: 'Earth'}),
(mars:Planet {name: 'Mars'}),
(moon:Moon {name: 'The moon'}),
(earth)-[:CIRCLES]->(sun),
(mars)-[:CIRCLES]->(sun),
(moon)-[:CIRCLES]->(earth)`;
const styled = (...lines) => ['// graph: sky_style · STYLE sky', ...lines].join('\n');
const noteOf = (...blocks) => ['# Sky', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const RADIAL = noteOf(SKY, styled("(d1:Diagram {type: 'radial'})"));

/** Loads the plugin with a note at PATH, keeping each drawing it is asked to lay out. */
async function loaded(note) {
  const env = await load({ files: { [PATH]: note } });
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing);
    return layout(drawing, owner);
  };
  return { env, asked };
}
/** Draws block `n` of `note` in reading view, as Obsidian does; resolves once drawn. */
async function readCard(env, note, n = 0) {
  const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
  const el = host
    .createDiv({ cls: 'markdown-preview-view markdown-rendered' })
    .createDiv({ cls: 'block-language-gql' });
  const lines = note.split('\n'),
    fences = lines.flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
  const source = lines.slice(fences[n] + 1, lines.indexOf('```', fences[n] + 1)).join('\n');
  await env.state.processors.get('gql')(source, el, fakeContext(note, fences[n]));
  await until(() => !!el.querySelector('svg'));
  return el;
}
/** The box of thing `key` in the card in `el`. */
const box = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
/** Opens the details of thing `key`, as Enter on its box does. */
const select = (el, key) => box(el, key).dispatch('keydown', { key: 'Enter' });
/** The button in `el` that says `text`. */
const saying = (el, text) => el.querySelectorAll('button').find((b) => b.textContent === text);
/** What the strip says of the centre, if anything. */
const centred = (el) => el.querySelector('.thoughtknot-type-centre')?.textContent ?? '';

describe('where the note is edited', () => {
  // proves: radial_centre_pick
  test('Put in the centre writes the centre, the card is laid out around it, and Back to the usual centre clears it', async () => {
    const { env, asked } = await loaded(RADIAL);
    try {
      const { el } = await show(env, RADIAL, 0);
      assert.equal(asked.at(-1).diagram.centre, 'sun', 'the most links, at first');
      assert.equal(centred(el), '', 'nothing said of a centre not picked');
      select(el, 'moon');
      saying(el, 'Put in the centre').click();
      await until(() => /centre: 'moon'/.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(d1:Diagram \{type: 'radial', centre: 'moon'\}\)/);
      const again = await show(env, env.state.files.get(PATH), 0);
      assert.equal(asked.at(-1).diagram.centre, 'moon');
      await until(() => !!again.el.querySelector('.thoughtknot-type-centre'));
      assert.match(centred(again.el), /Centred on The moon/);
      labelled(again.el, 'Back to the usual centre').click();
      await until(() => !/centre:/.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(d1:Diagram \{type: 'radial'\}\)/);
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_pick
  test('C on a box puts it in the centre too; the centre itself and other types offer nothing', async () => {
    const { env } = await loaded(RADIAL);
    try {
      const { el } = await show(env, RADIAL, 0);
      select(el, 'sun');
      assert.equal(saying(el, 'Put in the centre'), undefined, 'already the centre');
      box(el, 'mars').dispatch('keydown', { key: 'c' });
      await until(() => /centre: 'mars'/.test(env.state.files.get(PATH)));
      const flow = noteOf(SKY);
      const other = await show(env, flow, 0);
      select(other.el, 'moon');
      assert.equal(saying(other.el, 'Put in the centre'), undefined, 'a network has no centre');
    } finally {
      env.uninstall();
    }
  });
});

describe('in reading view', () => {
  // proves: radial_centre_pick
  test('a centre picked is drawn at once, said not saved, and Back to saved draws the saved centre again', async () => {
    const { env, asked } = await loaded(RADIAL);
    try {
      const el = await readCard(env, RADIAL);
      box(el, 'moon').dispatch('keydown', { key: 'C' });
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      assert.equal(asked.at(-1).diagram.centre, 'moon');
      assert.match(centred(el), /Centred on The moon/);
      assert.equal(env.state.files.get(PATH), RADIAL, 'the note unchanged');
      labelled(el, 'Back to saved').click();
      await until(() => !el.querySelector('.thoughtknot-type-tried') && !!el.querySelector('svg'));
      assert.equal(asked.at(-1).diagram.centre, 'sun');
      assert.equal(env.state.files.get(PATH), RADIAL);
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_pick
  test('a thing’s details offer Put in the centre, which only looks', async () => {
    const { env, asked } = await loaded(RADIAL);
    try {
      const el = await readCard(env, RADIAL);
      select(el, 'earth');
      saying(el, 'Put in the centre').click();
      await until(() => asked.at(-1).diagram.centre === 'earth');
      assert.equal(env.state.files.get(PATH), RADIAL, 'the note unchanged');
    } finally {
      env.uninstall();
    }
  });
});
