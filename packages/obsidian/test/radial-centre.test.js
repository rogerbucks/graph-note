// Picking the centre of a radial drawing on its card (editor spec §15, radial_centre_pick, radial_centre_anywhere,
// radial_centre_menu, radial_centre_hint). A thing's details offer Centre here, and so do C on its box and a right-click
// on it. From any type, the card is drawn radial around that thing, the boxes gliding there. Choosing Radial with a
// thing selected does the same. Where the note is edited, the centre is saved in the style graph. In reading view it is
// only looked at, never saved. A radial drawing says its centre and how to pick another, with Back to the usual centre.
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
const NETWORK = noteOf(SKY);

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
/** The menu a right-click on a thing opened, if open. */
const menu = (el) => el.querySelector('.thoughtknot-thing-menu');
/** The menu's item that says `text`. */
const item = (el, text) =>
  menu(el)
    ?.querySelectorAll('[role="menuitem"]')
    .find((b) => b.textContent === text);

describe('where the note is edited', () => {
  // proves: radial_centre_pick
  test('Centre here writes the centre, the card is laid out around it, and Back to the usual centre clears it', async () => {
    const { env, asked } = await loaded(RADIAL);
    try {
      const { el } = await show(env, RADIAL, 0);
      assert.equal(asked.at(-1).diagram.centre, 'sun', 'the most links, at first');
      assert.match(centred(el), /Centred on Sun/, 'the usual centre is said too');
      assert.equal(labelled(el, 'Back to the usual centre'), undefined, 'nothing to go back to');
      select(el, 'moon');
      saying(el, 'Centre here').click();
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
  test('C on a box puts it in the centre too; the centre itself offers nothing', async () => {
    const { env } = await loaded(RADIAL);
    try {
      const { el } = await show(env, RADIAL, 0);
      select(el, 'sun');
      assert.equal(saying(el, 'Centre here'), undefined, 'already the centre');
      box(el, 'mars').dispatch('keydown', { key: 'c' });
      await until(() => /centre: 'mars'/.test(env.state.files.get(PATH)));
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_anywhere
  test('from a network, Centre here draws the card radial around the thing, and saves it', async () => {
    const { env, asked } = await loaded(NETWORK);
    try {
      const { el } = await show(env, NETWORK, 0);
      assert.equal(centred(el), '', 'a network says no centre');
      select(el, 'moon');
      saying(el, 'Centre here').click();
      await until(() => /type: 'radial', centre: 'moon'/.test(env.state.files.get(PATH)));
      await show(env, env.state.files.get(PATH), 0);
      assert.equal(asked.at(-1).diagram.type, 'radial');
      assert.equal(asked.at(-1).diagram.centre, 'moon');
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_anywhere
  test('Radial chosen with a thing selected is drawn around it, and its tile says so', async () => {
    const { env } = await loaded(NETWORK);
    try {
      const { el } = await show(env, NETWORK, 0);
      labelled(el, 'Diagram type').click();
      assert.ok(saying(el, 'Radial'), 'nothing selected: plain Radial');
      labelled(el, 'Diagram type').click();
      select(el, 'earth');
      labelled(el, 'Diagram type').click();
      saying(el, 'Radial, around Earth').click();
      await until(() => /type: 'radial', centre: 'earth'/.test(env.state.files.get(PATH)));
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_anywhere
  test('Radial can be chosen around a thing selected even where radial does not fit, and is drawn around it', async () => {
    // pluto is joined to nothing, so a radial drawing does not fit with no centre picked
    const apart = noteOf(`${SKY},\n(pluto:Planet {name: 'Pluto'})`);
    const { env } = await loaded(apart);
    try {
      const { el } = await show(env, apart, 0);
      labelled(el, 'Diagram type').click();
      assert.equal(saying(el, 'Radial').disabled, true, 'nothing selected: radial does not fit');
      labelled(el, 'Diagram type').click();
      select(el, 'mars');
      labelled(el, 'Diagram type').click();
      const tile = saying(el, 'Radial, around Mars');
      assert.equal(tile.disabled, false, 'with a thing selected, Radial can be chosen');
      tile.click();
      await until(() => /type: 'radial', centre: 'mars'/.test(env.state.files.get(PATH)));
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_menu
  test('a right-click on a thing opens a menu with Centre here; Escape closes it', async () => {
    const { env } = await loaded(NETWORK);
    try {
      const { el } = await show(env, NETWORK, 0);
      const right = box(el, 'mars').dispatch('contextmenu', { clientX: 40, clientY: 30 });
      assert.ok(right.defaultPrevented, 'the host’s own menu is not shown');
      const shown = menu(el);
      assert.ok(shown, 'the menu is open');
      assert.equal(shown.getAttribute('role'), 'menu');
      assert.equal(env.doc.activeElement, item(el, 'Centre here'), 'its first item has the focus');
      shown.dispatch('keydown', { key: 'Escape' });
      assert.equal(menu(el), null, 'Escape closes it');
      // the menu key on a box opens it from the keyboard; a contextmenu some systems send after it opens no second one
      box(el, 'mars').dispatch('keydown', { key: 'ContextMenu' });
      const after = box(el, 'mars').dispatch('contextmenu', { clientX: 0, clientY: 0 });
      assert.equal(el.querySelectorAll('.thoughtknot-thing-menu').length, 1, 'one menu');
      assert.ok(after.defaultPrevented, 'and no host menu over it');
      // the arrow keys keep the focus on its items (one item: it stays there)
      menu(el).dispatch('keydown', { key: 'ArrowDown' });
      assert.equal(env.doc.activeElement, item(el, 'Centre here'));
      // a press outside closes it
      env.doc.body.dispatch('pointerdown', { target: env.doc.body });
      assert.equal(menu(el), null, 'a press outside closes it');
      // Shift+F10 opens it too
      box(el, 'mars').dispatch('keydown', { key: 'F10', shiftKey: true });
      item(el, 'Centre here').click();
      assert.equal(menu(el), null, 'an item closes the menu');
      await until(() => /type: 'radial', centre: 'mars'/.test(env.state.files.get(PATH)));
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_menu
  test('a right-click on the centre, or where radial does not fit, opens no menu', async () => {
    const { env } = await loaded(RADIAL);
    try {
      const { el } = await show(env, RADIAL, 0);
      const right = box(el, 'sun').dispatch('contextmenu', { clientX: 40, clientY: 30 });
      assert.equal(menu(el), null, 'already the centre');
      assert.equal(right.defaultPrevented, false, 'the host’s own menu stays');
      // one thing alone: there is nothing to draw around it, so nothing to offer
      const lone = noteOf(`// graph: lone\n(a:Thing {name: 'A'})`);
      const other = await show(env, lone, 0);
      const none = box(other.el, 'a').dispatch('contextmenu', { clientX: 40, clientY: 30 });
      assert.equal(menu(other.el), null, 'radial does not fit');
      assert.equal(none.defaultPrevented, false, 'the host’s own menu stays there too');
      // a finger held on a box opens its tooltip, never the menu: a touch press comes first, then the contextmenu
      const { el: held } = await show(env, NETWORK, 0);
      const mars = box(held, 'mars');
      mars.dispatch('pointerdown', { pointerId: 7, pointerType: 'touch', button: 0, clientX: 40, clientY: 30 });
      const touch = mars.dispatch('contextmenu', { clientX: 40, clientY: 30 });
      assert.equal(menu(held), null, 'a long press opens no menu');
      assert.equal(touch.defaultPrevented, false);
      mars.dispatch('pointercancel', { pointerId: 7 }); // the finger lifts, so no held timer outlives the test
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
  test('a thing’s details offer Centre here, which only looks', async () => {
    const { env, asked } = await loaded(RADIAL);
    try {
      const el = await readCard(env, RADIAL);
      select(el, 'earth');
      saying(el, 'Centre here').click();
      await until(() => asked.at(-1).diagram.centre === 'earth');
      assert.equal(env.state.files.get(PATH), RADIAL, 'the note unchanged');
    } finally {
      env.uninstall();
    }
  });

  // proves: radial_centre_anywhere, radial_centre_menu
  test('from a network, the menu’s Centre here draws it radial around the thing, only looked at', async () => {
    const { env, asked } = await loaded(NETWORK);
    try {
      const el = await readCard(env, NETWORK);
      box(el, 'mars').dispatch('contextmenu', { clientX: 40, clientY: 30 });
      item(el, 'Centre here').click();
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      assert.equal(asked.at(-1).diagram.type, 'radial');
      assert.equal(asked.at(-1).diagram.centre, 'mars');
      assert.match(centred(el), /Centred on Mars/);
      assert.equal(env.state.files.get(PATH), NETWORK, 'the note unchanged');
    } finally {
      env.uninstall();
    }
  });
});

describe('the hint', () => {
  // proves: radial_centre_hint
  test('a radial drawing says how to put another thing in the centre', async () => {
    const { env } = await loaded(RADIAL);
    try {
      const { el } = await show(env, RADIAL, 0);
      assert.match(centred(el), /right-click/i);
      assert.match(centred(el), /\bC\b/);
    } finally {
      env.uninstall();
    }
  });
});
