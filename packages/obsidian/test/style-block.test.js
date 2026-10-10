// The style graph in a note (editor spec §2, style_block_in_note, broken_style_block, style_graph_checked; §6,
// four_nudge_words): a style block is shown folded away until opened, never drawn as a graph; the graph it styles is
// drawn with its nudges; what is wrong in the style is listed with the graph's problems, and a style block that cannot be
// read never stops the drawing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const DATA = `// graph: reader
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(q:Question {title: 'Which?'}),
(large)-[:ANSWERS]->(q), (small)-[:ANSWERS]->(q)`;
const STYLE = `// graph: reader_style · STYLE reader
(down:Nudge {word: 'direction', direction: 'TB'}),
(pair:Nudge {word: 'beside', thing: 'large', other: 'small'})`;
const noteOf = (...blocks) => ['# Reader', '', ...blocks.map(fence).flatMap((b) => [b, '']), ''].join('\n');

/** Shows block `n` of a note, keeping each drawing the plugin is asked to lay out. */
async function shown(note, n) {
  const env = await load();
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing);
    return layout(drawing, owner);
  };
  const { el } = await show(env, note, n);
  return { env, el, asked };
}
const items = (el) =>
  el
    .querySelectorAll('li')
    .map((li) => li.textContent)
    .join(' | ');

describe('a style block in a note', () => {
  test('is shown folded away until opened, its text inside, and never drawn as a graph', async () => {
    const { env, el } = await shown(noteOf(DATA, STYLE), 1);
    try {
      const fold = el.querySelector('details.graph-note-style');
      assert.ok(fold, 'folded');
      assert.equal(fold.hasAttribute('open'), false, 'closed until opened');
      assert.match(fold.querySelector('summary').textContent, /Style of graph reader: 2 nudges/);
      assert.match(fold.textContent, /word: 'direction'/);
      assert.equal(el.querySelector('svg'), null, 'no drawing of the style itself');
    } finally {
      env.uninstall();
    }
  });

  test('says on its fold how many problems it has', async () => {
    const bad = STYLE.replace("'beside'", "'besides'");
    const { env, el } = await shown(noteOf(DATA, bad), 1);
    try {
      assert.match(el.querySelector('details.graph-note-style summary').textContent, /1 problem/);
    } finally {
      env.uninstall();
    }
  });
});

describe('the graph it styles', () => {
  test('is laid out with its nudges, in the direction its style sets', async () => {
    const { env, el, asked } = await shown(noteOf(DATA, STYLE), 0);
    try {
      assert.ok(el.querySelector('svg g.node'), 'Graphviz drew it, nudges and all');
      const d = asked.at(-1);
      assert.equal(d.direction, 'TB');
      assert.deepEqual(
        d.nudges.map((x) => x.word),
        ['direction', 'beside'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('a nudge of a fifth word is listed as a problem with the graph’s, and the graph is still drawn', async () => {
    const bad = STYLE.replace("'beside'", "'besides'");
    const { env, el } = await shown(noteOf(DATA, bad), 0);
    try {
      assert.ok(el.querySelector('svg'), 'drawn');
      assert.match(items(el), /a nudge must be one of four words: beside, before, group or direction/);
    } finally {
      env.uninstall();
    }
  });

  test('a style naming a thing not in the graph is listed, with its fix', async () => {
    const bad = STYLE.replace("other: 'small'", "other: 'smal'");
    const { env, el } = await shown(noteOf(DATA, bad), 0);
    try {
      assert.match(items(el), /smal/);
      assert.match(items(el), /small/);
    } finally {
      env.uninstall();
    }
  });

  test('a style block that cannot be read never stops the drawing: drawn in the locked style, the problem listed', async () => {
    const broken = "// graph: reader_style · STYLE reader\n(down:Nudge {word: 'direction', direction: })";
    const { env, el, asked } = await shown(noteOf(DATA, broken), 0);
    try {
      assert.ok(el.querySelector('svg'), 'drawn');
      assert.equal(asked.at(-1).direction, undefined, 'in the locked style: no nudge read from it');
      assert.ok(
        el.querySelectorAll('li').some((li) => /is-error/.test(li.className)),
        items(el),
      );
    } finally {
      env.uninstall();
    }
  });
});
