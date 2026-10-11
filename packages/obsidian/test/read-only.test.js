// Reading view is read-only, strictly (spec §3 "Read-only in Reading view", decided 9 Oct 2026; Roger's device check
// Z-09, 11 Oct 2026: "properties can still be added in reading view. I don't want that."). A card in reading view shows
// everything a tap shows — properties among it — and offers nothing that writes, even while its block is edited in
// place in Live Preview. One check closes every write: each path a write could take is tried here, by its control and
// by a direct call, and the note and the text being edited are left as they were.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, showIn } from './host/card-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

/** A graph with what every write path needs: properties on a thing and a link, a list, and a thing written unnamed. */
const RICH = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader', weight: 180}),
(large)-[:ANSWERS {since: 2024}]->(q),
(light:Tag),
(large)-[:HAS_TAG]->(light),
(cheap:Tag),
(large)-[:HAS_TAG]->(cheap),
(:Option {name: 'Small reader'})`;
const NOTE = ['# Reader', '', fence(RICH), ''].join('\n');

/** A view of the graph, for the view's own writes. */
const VIEW = "// graph: reader · QUERY view answers\nMATCH (n {id: 'q'})-[]-{1,1}(m) RETURN n, m";
const VIEW_NOTE = ['# Reader', '', fence(RICH), '', fence(VIEW), ''].join('\n');

/** Every control in the card's details that can be pressed or typed in, by its name, its class or its tag. */
const controls = (el) =>
  el
    .querySelectorAll(
      '.graph-note-details button, .graph-note-details input, .graph-note-details select, .graph-note-details textarea, .graph-note-details [role="button"]',
    )
    .map((c) => c.getAttribute('aria-label') || c.getAttribute('class') || c.tagName);

const details = (el) => el.querySelector('.graph-note-details');

/**
 * The block edited in place in Live Preview, as Roger had it, and the same block drawn in reading view: the case where a
 * card in reading view could reach the editor. `children` gathers the reading card's components.
 */
async function readingWhileEdited(env, children = []) {
  const live = await showIn(env, 'live');
  labelled(live, 'Edit here').click();
  await until(() => !!live.querySelector('textarea'));
  const reading = await showIn(env, 'reading', { children });
  await until(() => !labelled(reading, 'Edit in pane'), 1000);
  const box = live.querySelector('textarea');
  return { live, reading, box, typed: box.value };
}

/** The note and the text being edited are as they were. */
async function unchanged(env, { live, box, typed }, note = NOTE) {
  await wait(50);
  assert.ok(live.querySelector('textarea') === box, 'the editor in Live Preview is still open');
  assert.equal(box.value, typed, 'nothing was written into the text being edited');
  assert.equal(env.state.files.get(PATH), note, 'nothing was written into the note');
}

describe('a card in reading view shows its details and offers nothing that writes, while its block is edited elsewhere', () => {
  test('a box’s details show its properties, and offer no Add property', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      tapKey(shown.reading, 'large');
      const d = details(shown.reading);
      assert.ok(d && !d.hidden, 'the details are shown');
      const items = d.querySelectorAll('li').map((li) => li.textContent);
      assert.ok(items.includes('name: Large reader') && items.includes('weight: 180'), `its properties: ${items}`);
      assert.ok(!d.querySelector('.metadata-add-button'), 'no Add property');
      assert.ok(!d.textContent.includes('Add property'));
      assert.deepEqual(controls(shown.reading), ['Close details']);
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('no property offers its type menu, and no click or right-click in the card opens a menu', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      tapKey(shown.reading, 'large');
      const menus = env.state.menus.length;
      // the type icon is the one control that opens a menu: pressed, if it is there at all
      shown.reading.querySelector('.metadata-property-icon')?.click();
      for (const g of shown.reading.querySelectorAll('g.node, g.edge')) g.dispatch('contextmenu');
      details(shown.reading).dispatch('contextmenu');
      assert.equal(env.state.menus.length, menus, 'no menu: no type to change, no List, no Remove');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('no value or name of a property, a thing’s or a link’s, can be typed in', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      tapKey(shown.reading, 'q');
      assert.equal(details(shown.reading).querySelectorAll('input').length, 0, 'a thing: no field');
      const items = () =>
        details(shown.reading)
          .querySelectorAll('li')
          .map((li) => li.textContent);
      assert.ok(items().includes('title: Which device?'), `its property is shown: ${items()}`);
      shown.reading
        .querySelectorAll('g.edge')
        .find((g) => g.getAttribute('data-link') === '0')
        .dispatch('keydown', { key: 'Enter' });
      const d = details(shown.reading);
      assert.equal(d.querySelectorAll('input').length, 0, 'a link: no field');
      assert.ok(items().includes('since: 2024'), `a link’s property is shown: ${items()}`);
      assert.deepEqual(controls(shown.reading), ['Close details']);
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('a list shows its things, with no x to remove one and no field to add one', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      tapKey(shown.reading, 'large');
      const d = details(shown.reading);
      assert.ok(!d.querySelector('.multi-select-pill-remove-button'), 'no x');
      assert.ok(!d.querySelector('input.multi-select-input'), 'no field to add');
      const items = d.querySelectorAll('li').map((li) => li.textContent);
      assert.ok(items.includes('has tag → light') && items.includes('has tag → cheap'), `its things: ${items}`);
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('no Park for later', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      tapKey(shown.reading, 'q');
      assert.ok(!labelled(shown.reading, 'Park for later'), 'no Park for later');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('a thing drawn under a suggested name says so, and offers no fix that writes it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      tapKey(shown.reading, 'small_reader');
      assert.deepEqual(controls(shown.reading), ['Close details'], 'no Add the name');
      assert.ok(details(shown.reading).textContent.includes('Suggested name: small_reader'), 'the name is said');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('no Record a path', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      assert.ok(!labelled(shown.reading, 'Record a path'), 'no Record a path');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('no Make a view', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      assert.ok(!labelled(shown.reading, 'Make a view'), 'no Make a view');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('a card drawn off the page, as reading view draws it, takes back Record a path and Make a view once it is placed', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const live = await showIn(env, 'live');
      labelled(live, 'Edit here').click();
      await until(() => !!live.querySelector('textarea'));
      const box = live.querySelector('textarea');
      // reading view draws a block into an element of its own, and puts it in the page only after: nothing around it
      // says reading view until then, so the card is built as if it could write
      const lines = NOTE.split('\n'),
        open = lines.findIndex((l) => l.startsWith('```gql'));
      const el = env.doc.createElement('div');
      await env.state.processors.get('gql')(RICH, el, fakeContext(NOTE, open));
      assert.ok(labelled(el, 'Record a path'), 'before it is placed, the card offers Record a path');
      env.doc.body
        .createDiv({ cls: 'markdown-reading-view' })
        .createDiv({ cls: 'markdown-preview-view markdown-rendered' })
        .appendChild(el);
      await until(() => !labelled(el, 'Edit in pane'), 1000);
      assert.ok(!labelled(el, 'Record a path'), 'no Record a path once it is in reading view');
      assert.ok(!labelled(el, 'Make a view'), 'no Make a view');
      await unchanged(env, { live, box, typed: box.value });
    } finally {
      env.uninstall();
    }
  });

  test('by keyboard, Enter and Space on a box open its details read-only, and no key pressed in the card writes', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      const box = shown.reading.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === 'large');
      for (const key of ['Enter', ' ']) {
        box.dispatch('keydown', { key });
        assert.ok(!details(shown.reading).hidden, `${key === ' ' ? 'Space' : key} opens the details`);
        assert.deepEqual(controls(shown.reading), ['Close details'], 'and they hold nothing to change');
      }
      for (const key of ['Delete', 'Backspace', 'z', 'Enter'])
        for (const ctrl of [false, true]) box.dispatch('keydown', { key, ctrlKey: ctrl, metaKey: ctrl });
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('a tap in reading view leaves the selection in the text being edited in Live Preview where it was', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      shown.box.setSelectionRange(0, 0);
      tapKey(shown.reading, 'large');
      assert.deepEqual([shown.box.selectionStart, shown.box.selectionEnd], [0, 0]);
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('full screen opened in reading view is read-only too: no Edit here, no Edit in pane, no inspector', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      labelled(shown.reading, 'Full screen').click();
      const full = env.doc.body.querySelector('.graph-note-fullscreen');
      assert.ok(full, 'full screen is open');
      for (const label of ['Edit here', 'Edit in pane', 'Record a path', 'Make a view'])
        assert.ok(!labelled(full, label), `no ${label}`);
      tapKey(full, 'large');
      assert.deepEqual(controls(full), ['Close details']);
      assert.ok(details(full).textContent.includes('name: Large reader'), 'its properties are shown');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('a view’s full screen opened in reading view offers neither Fade or Hide others nor Save as shown', async () => {
    const env = await load({ files: { [PATH]: VIEW_NOTE } });
    try {
      const fences = VIEW_NOTE.split('\n').flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const el = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' }).createDiv();
      await env.state.processors.get('gql')(VIEW, el, fakeContext(VIEW_NOTE, fences[1]));
      await until(() => !!el.querySelector('svg'));
      labelled(el, 'Full screen').click();
      const full = env.doc.body.querySelector('.graph-note-fullscreen');
      for (const label of ['Hide others', 'Fade others', 'Save as shown', 'Edit in pane'])
        assert.ok(!labelled(full, label), `no ${label}`);
      assert.ok(full.textContent.includes('View answers'), 'the view is still said');
    } finally {
      env.uninstall();
    }
  });

  test('Export, which never writes the note, still exports from reading view: each time to a new file of its own', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const shown = await readingWhileEdited(env);
      const svgs = () => [...env.state.files.keys()].filter((p) => p.endsWith('.svg'));
      for (const n of [1, 2]) {
        if (!shown.reading.querySelector('.graph-note-export')) labelled(shown.reading, 'Export').click();
        labelled(shown.reading.querySelector('.graph-note-export'), 'Export it').click();
        await until(() => svgs().length === n);
      }
      assert.equal(new Set(svgs()).size, 2, 'two files, neither written over');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });
});

describe('a write attempted anyway, by a direct call, changes nothing', () => {
  test('the card’s editor, Edit here, Done, Edit in pane, the editor’s slot, a selection and a view written by tapping', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const children = [];
      const shown = await readingWhileEdited(env, children);
      const card = children.find((c) => c.o?.drawn);
      assert.ok(card, 'the card is reached');
      const o = card.o;
      const leaves = env.plugin.app.workspace.leaves.length;
      assert.ok(o.editing?.() === undefined, 'no editor reaches the card');
      o.onEditHere?.();
      await o.onDoneEditing?.();
      o.onEdit?.();
      const slot = env.doc.body.createDiv();
      o.onReady?.(slot);
      o.onSelect?.({ thing: 'q' });
      const refused = await o.writeView?.(VIEW);
      assert.equal(refused, undefined, 'the view is neither written nor refused: nothing was tried');
      assert.ok(!slot.querySelector('textarea'), 'the editor did not move into the card');
      assert.equal(env.plugin.app.workspace.leaves.length, leaves, 'no pane was opened');
      await unchanged(env, shown);
    } finally {
      env.uninstall();
    }
  });

  test('a view’s Fade or Hide others and Save as shown, called on a card in reading view', async () => {
    const env = await load({ files: { [PATH]: VIEW_NOTE } });
    try {
      const fences = VIEW_NOTE.split('\n').flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const el = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' }).createDiv();
      const children = [];
      await env.state.processors.get('gql')(VIEW, el, fakeContext(VIEW_NOTE, fences[1], children));
      await until(() => !!el.querySelector('svg'));
      const card = children.find((c) => c.o?.drawn);
      card.o.view.setOutside('hide');
      card.o.view.saveShown({ scale: 2, x: 10, y: 20, width: 100, height: 100 }, 'q');
      await wait(50);
      assert.equal(env.state.files.get(PATH), VIEW_NOTE);
    } finally {
      env.uninstall();
    }
  });
});

describe('the one check', () => {
  test('every function in a card’s options is closed where it is read-only, but those named as only reading', async () => {
    const { gateWrites } = await import('../src/graph-view/read-only.ts');
    const called = [];
    let readOnly = true;
    const o = gateWrites(
      {
        graph: 'g',
        lineOf: () => 7,
        onClose: () => called.push('close'),
        editing: () => ({ session: { text: '' } }),
        aNewWrite: () => called.push('new'),
        view: { name: 'v', saveShown: () => called.push('save') },
        exporting: { path: 'p', run: () => called.push('export') },
      },
      () => readOnly,
    );
    assert.equal(o.editing(), undefined, 'no editor');
    assert.equal(o.aNewWrite(), undefined, 'a new option is closed by default');
    o.view.saveShown();
    assert.deepEqual(called, [], 'nothing written');
    assert.equal(o.lineOf(), 7, 'a read is open');
    o.onClose();
    o.exporting.run();
    assert.deepEqual(called, ['close', 'export'], 'leaving full screen and exporting, which never write the note');
    assert.equal(o.graph, 'g');
    assert.equal(o.view.name, 'v');
    readOnly = false;
    o.aNewWrite();
    o.view.saveShown();
    assert.deepEqual(o.editing(), { session: { text: '' } });
    assert.deepEqual(called, ['close', 'export', 'new', 'save'], 'where the note is edited, each is open');
  });

  test('functions held at any depth, in lists and in objects with no prototype, are closed too, and keep their this', async () => {
    const { gateWrites } = await import('../src/graph-view/read-only.ts');
    const called = [];
    let readOnly = true;
    const bare = Object.assign(Object.create(null), { write: () => called.push('bare') });
    const o = gateWrites(
      {
        graph: 'g',
        lists: [() => called.push('list'), { write: () => called.push('in list') }],
        deep: { a: { b: { write: () => called.push('deep') } } },
        bare,
        counter: {
          n: 1,
          next() {
            called.push(`this ${this.n}`);
            return this.n;
          },
        },
        exporting: { path: 'p', run: () => called.push('export'), forget: () => called.push('forget') },
      },
      () => readOnly,
    );
    o.lists[0]();
    o.lists[1].write();
    o.deep.a.b.write();
    o.bare.write();
    assert.equal(o.counter.next(), undefined);
    o.exporting.forget();
    assert.deepEqual(called, [], 'nothing runs while read-only, a write added to the export among them');
    assert.equal(Object.getPrototypeOf(o.bare), null, 'an object with no prototype stays so');
    readOnly = false;
    o.lists[0]();
    o.lists[1].write();
    o.deep.a.b.write();
    o.bare.write();
    assert.equal(o.counter.next(), 1, 'called with its own this');
    o.exporting.forget();
    assert.deepEqual(called, ['list', 'in list', 'deep', 'bare', 'this 1', 'forget']);
  });

  test('a gated async function gives a promise of nothing; one that only returns a promise gives nothing, as documented', async () => {
    const { gateWrites } = await import('../src/graph-view/read-only.ts');
    let wrote = false;
    const o = gateWrites(
      {
        graph: 'g',
        save: async () => {
          wrote = true;
        },
        writeView: () => Promise.resolve('written'),
      },
      () => true,
    );
    const p = o.save();
    assert.ok(p instanceof Promise, 'a promise, so .then and await work on it');
    assert.equal(await p, undefined);
    assert.equal(o.writeView(), undefined, 'not written async: undefined, which await takes as it is');
    assert.equal(wrote, false);
  });

  test('an option holding an object of a class with methods is refused when the card is made, loudly', async () => {
    const { gateWrites } = await import('../src/graph-view/read-only.ts');
    class Writer {
      write() {
        return 'written';
      }
    }
    assert.throws(() => gateWrites({ graph: 'g', writer: new Writer() }, () => true), /writer.*class with methods/);
    assert.throws(() => gateWrites({ graph: 'g', deep: { list: [new Writer()] } }, () => true), /deep\.list\[0\]/);
    const data = { graph: 'g', when: new Date(0), looks: { things: new Map([['a', 1]]) }, reading: new Writer() };
    assert.doesNotThrow(() => gateWrites(data, () => true), 'dates, maps and the data the card shows pass as they are');
  });

  test('a Map or a Set holding functions is refused when the card is made, as a class’s object is', async () => {
    const { gateWrites } = await import('../src/graph-view/read-only.ts');
    const write = () => 'written';
    assert.throws(() => gateWrites({ graph: 'g', byName: new Map([['save', write]]) }, () => true), /byName/);
    assert.throws(() => gateWrites({ graph: 'g', deep: { all: new Set([write]) } }, () => true), /deep\.all/);
    assert.throws(() => gateWrites({ graph: 'g', nested: new Map([['a', { write }]]) }, () => true), /nested/);
  });

  test('an async function gated twice, as full screen gates the card’s gated options again, still gives a promise', async () => {
    const { gateWrites } = await import('../src/graph-view/read-only.ts');
    let readOnly = true;
    const once = gateWrites({ graph: 'g', save: async () => 'saved' }, () => readOnly);
    const twice = gateWrites({ ...once, mode: 'full' }, () => readOnly);
    const p = twice.save();
    assert.ok(p instanceof Promise, 'a promise, so .then and await work on it');
    assert.equal(await p, undefined);
    readOnly = false;
    assert.equal(await twice.save(), 'saved');
  });
});
