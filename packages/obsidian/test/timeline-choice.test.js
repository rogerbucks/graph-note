// A timeline's order and what it shows, on a drawing's card (editor spec §15, timeline_choice_card). A card drawn as a
// timeline offers Order and Show. Where the note is edited, a choice is written into the style graph. In reading view
// it only draws the card again, said not saved, with Back to saved; Keep it, where the note is edited, writes it whole.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';
const ORG = `// graph: org
(ada:Person {name: 'Ada', step: 2}),
(bea:Person {name: 'Bea', step: 1}),
(cy:Person {name: 'Cy', on: DATE '2026-09-01'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy)`;
const STYLE = "// graph: org_style · STYLE org\n(d1:Diagram {type: 'timeline'})";
const noteOf = (...blocks) => ['# Org', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

/** Keeps each drawing the plugin is asked to lay out. */
function watch(env) {
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing);
    return layout(drawing, owner);
  };
  return asked;
}

/** Shows block `n` of `note` as reading view does, read-only. */
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

/** The select labelled `label` on the card in `el`, set to `value`, as a person picks it. */
function choose(el, label, value) {
  const s = el.querySelectorAll('.thoughtknot-timeline select').find((x) => x.getAttribute('aria-label') === label);
  s.value = value;
  s.dispatch('change');
}
/** Each option a select offers: its value and its words. */
const options = (el, label) =>
  el
    .querySelectorAll('.thoughtknot-timeline select')
    .find((x) => x.getAttribute('aria-label') === label)
    .querySelectorAll('option')
    .map((o) => [o.getAttribute('value'), o.textContent]);

describe('a card drawn as a timeline', () => {
  // proves: timeline_choice_card
  test('offers Order and Show, in words, and nothing of them when drawn as another type', async () => {
    const env = await load({ files: { [PATH]: noteOf(ORG, STYLE) } });
    try {
      const { el } = await show(env, noteOf(ORG, STYLE), 0);
      assert.deepEqual(options(el, 'Order'), [
        ['date', 'By date'],
        ['number', 'By number'],
        ['written', 'As written'],
        ['links', 'By links'],
      ]);
      assert.deepEqual(options(el, 'Show'), [
        ['all', 'Everything'],
        ['dated', 'Only things with a date'],
        ['undated', 'Only things without a date'],
      ]);
      const plain = await show(env, noteOf(ORG), 0);
      assert.equal(plain.el.querySelector('.thoughtknot-timeline'), null);
    } finally {
      env.uninstall();
    }
  });

  // proves: timeline_choice_card, timeline_order, timeline_show
  test('where the note is edited, a choice is written into the style graph, whole', async () => {
    const note = noteOf(ORG, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await show(env, note, 0);
      choose(el, 'Order', 'number');
      await until(() => /order: 'number'/.test(env.state.files.get(PATH)));
      const again = await show(env, env.state.files.get(PATH), 0);
      choose(again.el, 'Show', 'dated');
      await until(() => /show: 'dated'/.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(d1:Diagram \{type: 'timeline', order: 'number', show: 'dated'\}\)/);
    } finally {
      env.uninstall();
    }
  });

  // proves: timeline_choice_card
  test('in reading view, a choice draws the card again, said not saved, and Back to saved puts it back', async () => {
    const note = noteOf(ORG, STYLE);
    const env = await load({ files: { [PATH]: note } });
    const asked = watch(env);
    try {
      const el = await readCard(env, note);
      assert.equal(asked.at(-1).diagram.order, 'date');
      choose(el, 'Order', 'links');
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      assert.deepEqual(asked.at(-1).diagram, { type: 'timeline', order: 'links', dates: [['ada'], ['bea', 'cy']] });
      assert.match(el.querySelector('.thoughtknot-type-tried').textContent, /Just looking: not saved/);
      assert.equal(env.state.files.get(PATH), note, 'the note unchanged');
      choose(el, 'Show', 'undated');
      await until(() => asked.at(-1).diagram?.hidden?.length === 1);
      assert.deepEqual(asked.at(-1).diagram.hidden, ['cy'], 'the order looked at is kept as the show changes');
      assert.equal(asked.at(-1).diagram.order, 'links');
      labelled(el, 'Back to saved').click();
      await until(() => !el.querySelector('.thoughtknot-type-tried') && asked.at(-1).diagram?.order === 'date');
      assert.equal(env.state.files.get(PATH), note, 'still unchanged');
    } finally {
      env.uninstall();
    }
  });

  // proves: timeline_choice_card
  test('an order looked at in reading view shows where the note is edited, and Keep it writes it', async () => {
    const note = noteOf(ORG, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      choose(await readCard(env, note), 'Order', 'written');
      const { el } = await show(env, note, 0);
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      labelled(el, 'Keep it').click();
      await until(() => /order: 'written'/.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(d1:Diagram \{type: 'timeline', order: 'written'\}\)/);
    } finally {
      env.uninstall();
    }
  });
});
