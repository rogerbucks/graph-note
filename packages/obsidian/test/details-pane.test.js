// A card's details in a side pane of Obsidian's own (editor spec §25, details_in_host_pane and note_open_beside).
// - The sheet's place button offers the side pane. The details then open in a view in Obsidian's right sidebar, and
//   follow whatever is chosen in the card. They are the inspector there while the block is edited.
// - Closing the details empties the pane. Closing the pane sends the details back to their card, closed, and the next
//   open as the sheet again. Choosing a place on the screen from the pane brings them back over the card.
// - Only one card's details are in the pane at a time. Another card's taking it closes the first's.
// - A thing that stands for a note offers to open the note beside the graph, in a split, to read and edit there.
// The built plugin, against the stand-ins.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, settled } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';
import { editing, tapKey, field, enter, text } from './host/inspector-steps.js';

before(() => build());

const PRICED = NOTE.replace(
  "(large:Option {name: 'Large reader'})",
  "(large:Option {name: 'Large reader', price: 300})",
);
const details = (el) => el.querySelector('.thoughtknot-details');
/** The leaves holding the details pane. */
const panes = (env) => env.app.workspace.getLeavesOfType('thoughtknot-details');
/** What the details pane holds, once it is open. */
const pane = (env) => panes(env)[0]?.view?.contentEl;
/** Presses the place button of `el` and chooses `title` from its menu. */
const choose = (env, el, title) => {
  labelled(el, 'Move details').click();
  const item = env.state.menus.at(-1).items.find((i) => i.title === title);
  assert.ok(item, `the menu offers ${title}`);
  item.click();
};
/** Opens a card's details in the side pane, from a thing's details as the sheet. */
async function inPane(env, el, key = 'large') {
  tapKey(el, key);
  choose(env, el, 'Open in the side pane');
  await until(() => !!pane(env)?.querySelector('.thoughtknot-details'));
}

describe('the details in Obsidian’s side pane', () => {
  test('chosen from the place button, they move into a view in the right sidebar, as the whole of them', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const el = await show(env);
      await inPane(env, el);
      const [leaf] = panes(env);
      assert.equal(leaf.how, 'right', 'in the right sidebar');
      assert.equal(env.state.revealed, leaf, 'and shown');
      const d = pane(env).querySelector('.thoughtknot-details');
      assert.equal(details(el), null, 'no longer in the card');
      assert.ok(!d.hidden);
      assert.ok(!d.hasClass('thoughtknot-sheet'), 'not the sheet');
      assert.equal(d.querySelector('.thoughtknot-sheet-resizer'), null, 'nor its resize bar');
      assert.equal(labelled(d, 'Minimise details'), undefined, 'nor its toggle');
      assert.match(d.textContent, /Large reader/);
      assert.ok(pane(env).hasClass('thoughtknot'), 'drawn in the plugin’s own colours');
      assert.equal(leaf.view.getDisplayText(), 'Graph details');
    } finally {
      env.uninstall();
    }
  });

  test('they follow what is chosen in the card, and later details open there too', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const el = await show(env);
      await inPane(env, el);
      tapKey(el, 'q');
      assert.match(pane(env).textContent, /Which device\?/);
      labelled(pane(env), 'Close details').click();
      assert.equal(pane(env).querySelector('.thoughtknot-details'), null, 'closed, they leave the pane');
      assert.match(pane(env).textContent, /Choose a thing in a drawing/, 'which says how to fill it');
      assert.ok(details(el).hidden, 'back in their card, closed');
      tapKey(el, 'large');
      await settled();
      assert.match(pane(env).textContent, /Large reader/, 'opened in the pane again');
      assert.equal(panes(env).length, 1, 'the same pane, not a second');
    } finally {
      env.uninstall();
    }
  });

  test('closing the pane sends them back to their card, closed, and the next open as the sheet', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const el = await show(env);
      await inPane(env, el);
      panes(env)[0].detach();
      const d = details(el);
      assert.ok(d, 'back in the card');
      assert.ok(d.hidden, 'closed');
      assert.equal(el.querySelector('g.is-selected'), null, 'and the selection with them');
      tapKey(el, 'large');
      assert.ok(details(el).hasClass('thoughtknot-sheet'), 'the sheet again');
      assert.equal(panes(env).length, 0);
    } finally {
      env.uninstall();
    }
  });

  test('a place on the screen, chosen from the pane, brings them back over the card', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const el = await show(env);
      await inPane(env, el);
      choose(env, pane(env), 'Dock at the top');
      assert.ok(details(el), 'back in the card');
      assert.ok(details(el).hasClass('thoughtknot-sheet'));
      assert.ok(details(el).hasClass('is-dock-top'));
      assert.match(details(el).textContent, /Large reader/, 'still open on the same thing');
      assert.equal(pane(env).querySelector('.thoughtknot-details'), null);
    } finally {
      env.uninstall();
    }
  });

  test('while the block is edited, they are the inspector in the pane, and change the note from there', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const el = await show(env);
      await inPane(env, el);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'large');
      await settled();
      const price = field(pane(env), 'Value of price');
      assert.ok(price, 'the property is a field to change');
      enter(price, '250');
      await until(() => text(el).includes('price: 250'));
      assert.match(text(el), /\(large:Option \{name: 'Large reader', price: 250\}\)/);
    } finally {
      env.uninstall();
    }
  });

  test('another card’s details take the pane, and the first card’s close', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const first = await show(env),
        second = await show(env);
      await inPane(env, first);
      tapKey(second, 'q');
      await settled();
      assert.match(pane(env).textContent, /Which device\?/);
      assert.ok(details(first)?.hidden, 'the first card’s details are back in it, closed');
      assert.equal(pane(env).querySelectorAll('.thoughtknot-details').length, 1, 'one card’s at a time');
    } finally {
      env.uninstall();
    }
  });

  test('a card that goes takes its details out of the pane', async () => {
    const env = await load({ files: { [PATH]: PRICED } });
    try {
      const { fakeContext } = await import('./host/fake-obsidian.js');
      const el = env.doc.body.createDiv(),
        ctx = fakeContext(
          PRICED,
          PRICED.split('\n').findIndex((l) => l.startsWith('```gql')),
        );
      await env.state.processors.get('gql')(READER.replace("'Large reader'}", "'Large reader', price: 300}"), el, ctx);
      await inPane(env, el);
      for (const child of ctx.children) child.unload();
      assert.equal(pane(env).querySelector('.thoughtknot-details'), null);
      assert.match(pane(env).textContent, /Choose a thing in a drawing/);
    } finally {
      env.uninstall();
    }
  });
});

describe('a thing that stands for a note opens it beside the graph', () => {
  const TRIP = `// graph: trip
(plan:Doc {name: 'Plan'}),
(trip:Doc {id: 'note:Trip plan', name: 'Trip'}),
(plan)-[:FOR]->(trip)`;
  const FILES = { [PATH]: ['# Trip', '', fence(TRIP), ''].join('\n'), 'Trip plan.md': '# Trip plan' };

  test('its details offer Open … beside the graph, which opens the note in a split', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await show(env);
      await until(() => !!el.querySelector('g.node'));
      tapKey(el, 'note:Trip plan'); // a thing whose id is a note's is keyed by it
      await until(() => (env.state.rendered ?? []).length > 0); // its note rendered, as Obsidian renders it
      const b = labelled(details(el), 'Open Trip plan beside the graph');
      assert.ok(b, 'a button to open it beside');
      b.click();
      assert.deepEqual(env.state.opened, { link: 'Trip plan', from: PATH, newLeaf: 'split' });
    } finally {
      env.uninstall();
    }
  });
});
