// A large graph's curves after its drawing (spec §11, curves_after_drawing). Past 300 things a card is drawn with
// straight links first, which costs about two fifths less to lay out. Its curves are laid out next, in the same worker,
// and put in the card. Every box stays where it was. The built plugin, loaded against the stand-ins for the page,
// laying out with the real engine. The page here has no worker, and the page's own limit is 300 things. So the test
// draws a small graph, and has its first layout drawn straight and marked as a large one is.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, settled } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const NOTE = [
  '# Kit',
  '',
  fence(
    [
      '// graph: kit',
      "(a:Thing {name: 'Alpha'}), (b:Thing {name: 'Beta'}), (c:Thing {name: 'Gamma'}), (d:Thing {name: 'Delta'}),",
      '(a)-[:THEN]->(b), (b)-[:THEN]->(c), (a)-[:THEN]->(c), (c)-[:THEN]->(d), (a)-[:THEN]->(d)',
    ].join('\n'),
  ),
  '',
].join('\n');

/** Each box's place, and each link's path, as the card shows them now. */
const boxes = (el) => el.querySelectorAll('g.node').map((g) => g.querySelector('path, polygon')?.toString());
const links = (el) => el.querySelectorAll('g.edge path').map((p) => p.getAttribute('d'));

/**
 * The card of the note, with each layout the plugin was asked for. A layout asked straight first is drawn straight,
 * marked as having its curves to come, as one of more than 300 things is.
 */
async function card(markStraight = true) {
  const env = await load({ files: { [PATH]: NOTE } });
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing.straightFirst);
    if (!drawing.straightFirst || !markStraight) return layout(drawing, owner);
    return layout({ ...drawing, routing: 'straight' }, owner).then((d) => d && { ...d, curvesToCome: true });
  };
  const { el } = await show(env, NOTE);
  return { env, el, asked };
}

describe('a card drawn with straight links first', () => {
  // proves: curves_after_drawing
  test('asks for its curves next, and puts them in with every box where it was', async () => {
    const { env, el, asked } = await card();
    try {
      assert.equal(asked[0], true, 'a card asks for straight links first');
      const straight = links(el),
        before = boxes(el);
      await until(() => links(el).join() !== straight.join());
      assert.deepEqual(asked, [true, false], 'then once for its curves');
      assert.deepEqual(boxes(el), before, 'every box where it was');
    } finally {
      env.uninstall();
    }
  });

  // proves: curves_after_drawing
  test('is laid out once when its layout says no curves are to come', async () => {
    const { env, asked } = await card(false);
    try {
      await settled();
      assert.deepEqual(asked, [true], 'a drawing curved at once asks for nothing more');
    } finally {
      env.uninstall();
    }
  });

  // proves: curves_after_drawing
  test('laid out again by a View switch, asks for the new drawing’s curves too', async () => {
    const { env, el, asked } = await card();
    try {
      await until(() => asked.length === 2);
      labelled(el, 'View').click();
      el.querySelectorAll('.thoughtknot-view-menu button')
        .find((b) => b.textContent.startsWith('Parallel links merged'))
        .click();
      await until(() => asked.length === 4);
      assert.deepEqual(asked, [true, false, true, false]);
    } finally {
      env.uninstall();
    }
  });
});
