// Editing in place (editor spec §4, "In place"; decided 7 Oct 2026): the text of a graph block can be edited inside the
// drawing's own card in the note, with the same help as the pane. Each write redraws the block, as Obsidian redraws any
// block whose text changed, so the editor moves into each new card with its text, its caret and its focus.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './lib/load-plugin.js';
import { fakeContext } from './lib/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';
const fence = (t) => '```gql\n' + t + '\n```';
const READER = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(q)`;
const NOTE = ['# Reader', '', fence(READER), ''].join('\n');

const labelled = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);

/** Draws the note's graph block, as Obsidian does when the note is shown or its block's text changes. */
async function show(env) {
  const note = env.state.files.get(PATH),
    lines = note.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const el = env.doc.body.createDiv();
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(note, open));
  return el;
}

describe('edit here, in the card', () => {
  test('the bar offers both: Edit here, and Edit in pane', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      assert.ok(labelled(el, 'Edit here'));
      assert.ok(labelled(el, 'Edit in pane'));
    } finally {
      env.uninstall();
    }
  });

  test('Edit here opens the text inside the drawing’s own card, with the help the pane has, and the focus in it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('.graph-note-view textarea'));
      const t = el.querySelector('.graph-note-view textarea');
      assert.equal(t.value, READER);
      assert.equal(env.doc.activeElement, t);
      const card = el.querySelector('.graph-note-view');
      for (const part of [
        '.graph-note-overlay',
        '.graph-note-readback',
        '.graph-note-suggestions',
        '.graph-note-pane-problems',
      ])
        assert.ok(card.querySelector(part), part);
      assert.ok(labelled(card, 'Done') && labelled(card, 'Undo') && labelled(card, 'Lock the graph'));
      assert.equal(card.querySelector('select'), null, 'no picker: it edits this block');
    } finally {
      env.uninstall();
    }
  });

  test('what is typed reaches the note, and the editor carries on in the redrawn card with its text, caret and focus', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      const typed = READER + ",\n(small:Option {name: 'Small reader'})";
      t.value = typed;
      t.setSelectionRange(10, 12);
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes('Small reader'), 2000);
      assert.equal(env.state.files.get(PATH), NOTE.replace(READER, typed));
      // Obsidian redraws the block from the note's new text: the same editor appears in the new card
      const again = await show(env);
      const moved = again.querySelector('.graph-note-view textarea');
      assert.equal(moved, t, 'the same field, not a new one');
      assert.equal(moved.value, typed);
      assert.deepEqual([moved.selectionStart, moved.selectionEnd], [10, 12]);
      assert.equal(env.doc.activeElement, moved);
      assert.equal(again.querySelectorAll('g.node').length, 3, 'and the redrawn drawing shows what was typed');
    } finally {
      env.uninstall();
    }
  });

  test('Done writes what is left and closes the editor; the next drawing has none', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ",\n(x:Option {name: 'X'})";
      t.dispatch('input');
      labelled(el, 'Done').click();
      await until(() => env.state.files.get(PATH).includes("name: 'X'"), 2000);
      await wait(20);
      assert.equal(el.querySelector('textarea'), null);
      assert.equal((await show(env)).querySelector('textarea'), null);
    } finally {
      env.uninstall();
    }
  });

  test('a block changed in the note meanwhile is never overwritten in place either: what was typed is kept as a draft', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ',\n(mine:Option)';
      t.dispatch('input');
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Option)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(1000);
      assert.equal(env.state.files.get(PATH), theirs);
      assert.ok(Object.values(env.state.data.drafts).some((d) => d.text === READER + ',\n(mine:Option)'));
    } finally {
      env.uninstall();
    }
  });

  test('on a phone the editor in place has no tabs: the card’s drawing is its drawing', async () => {
    const env = await load({ files: { [PATH]: NOTE }, mobile: true });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      assert.equal(el.querySelector('[role="tablist"]'), null);
    } finally {
      env.uninstall();
    }
  });
});

describe('the inspector, in edit mode', () => {
  // inspector_native (spec §14, 7 Oct 2026): it looks and behaves like Obsidian's own Properties panel — one row for each
  // property with its name and a field suited to its type, adding and removing in place, in the theme's spacing, type and
  // colours — built on Obsidian's own markup and classes, so it takes the theme for free.
  const PRICED = READER.replace(
    "(large:Option {name: 'Large reader'})",
    "(large:Option {name: 'Large reader', price: 300, ordered: DATE '2026-10-01', checked: TRUE})",
  );
  const NOTE2 = NOTE.replace(READER, PRICED);
  const field = (el, label) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === label);
  const row = (el, key) => el.querySelector(`.metadata-property[data-property-key="${key}"]`);
  const text = (el) => el.querySelector('textarea').value;
  /** Sets a field as a person would, and lets it go: the change is written when the field is left. */
  const enter = (input, value) => {
    if (input.getAttribute('type') === 'checkbox') input.checked = value;
    else input.value = value;
    input.dispatch('change');
  };
  /** Opens a property's type menu, from its icon, and picks an item. */
  const pick = (env, el, key, title) => {
    const icon = row(el, key).querySelector('.metadata-property-icon');
    icon.click();
    const menu = env.state.menus.at(-1);
    const item = menu.items.find((it) => it.title === title);
    assert.ok(item, `${title} in ${menu.items.map((it) => it.title)}`);
    item.click();
  };

  async function editing(env) {
    const el = await show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    return el;
  }
  const tap = (el, which) => el.querySelectorAll('g.node')[which].dispatch('keydown', { key: 'Enter' });

  test('outside edit mode, a box’s details are for reading only', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await show(env);
      tap(el, 1);
      assert.equal(el.querySelector('.graph-note-details input'), null);
    } finally {
      env.uninstall();
    }
  });

  test('it is built as Obsidian’s Properties panel: one row for each property, its name, and a field suited to its type', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      const box = panel.querySelector('.metadata-container');
      assert.ok(box.querySelector('.metadata-properties-heading .metadata-properties-title'));
      const rows = box.querySelectorAll('.metadata-properties .metadata-property');
      assert.deepEqual(
        rows.map((r) => r.getAttribute('data-property-key')),
        ['checked', 'name', 'ordered', 'price'],
      );
      for (const r of rows) {
        assert.ok(r.querySelector('.metadata-property-key .metadata-property-icon'));
        assert.ok(r.querySelector('.metadata-property-key input.metadata-property-key-input'));
        assert.ok(r.querySelector('.metadata-property-value'));
      }
      assert.equal(field(panel, 'Value of price').getAttribute('type'), 'number');
      assert.equal(field(panel, 'Value of price').value, '300');
      assert.equal(field(panel, 'Value of name').getAttribute('type'), 'text');
      assert.equal(field(panel, 'Value of ordered').getAttribute('type'), 'date', 'a date picker for a date');
      assert.equal(field(panel, 'Value of ordered').value, '2026-10-01');
      assert.equal(field(panel, 'Value of checked').getAttribute('type'), 'checkbox', 'a switch for true or false');
      assert.equal(field(panel, 'Value of checked').checked, true);
      assert.equal(row(panel, 'price').getAttribute('data-property-type'), 'number');
      assert.ok(box.querySelector('.metadata-add-button'), 'adding is in place, as Obsidian adds');
      assert.equal(
        panel.querySelectorAll('button').filter((b) => /^Save/.test(b.getAttribute('aria-label') ?? '')).length,
        0,
        'no Save buttons',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a value is written when the field is left, checked against its type first', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      enter(field(panel, 'Value of price'), 'three hundred');
      assert.match(panel.querySelector('[role="alert"]').textContent, /a number/);
      assert.equal(text(el), PRICED, 'nothing written');
      enter(field(el.querySelector('.graph-note-details'), 'Value of price'), '320');
      assert.equal(text(el), PRICED.replace('price: 300', 'price: 320'));
      await until(() => env.state.files.get(PATH).includes('price: 320'), 2000);
    } finally {
      env.uninstall();
    }
  });

  test('the switch writes true or false, and the date picker a date', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(field(el.querySelector('.graph-note-details'), 'Value of checked'), false);
      assert.match(text(el), /checked: FALSE/);
      enter(field(el.querySelector('.graph-note-details'), 'Value of ordered'), '2026-11-05');
      assert.match(text(el), /ordered: DATE '2026-11-05'/);
    } finally {
      env.uninstall();
    }
  });

  test('a property is added in place: a new row, its name offered from those used on things of its kind', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      const name = field(panel, 'New property name');
      assert.equal(env.doc.activeElement, name, 'the new row’s name has the focus');
      const list = panel.querySelector(`datalist#${name.getAttribute('list')}`);
      assert.deepEqual(
        list.querySelectorAll('option').map((o) => o.getAttribute('value')),
        ['checked', 'name', 'ordered', 'price', 'title'],
      );
      enter(name, 'colour');
      assert.equal(text(el), PRICED, 'a name alone writes nothing');
      enter(field(panel, 'Value of new property'), 'grey');
      assert.match(text(el), /checked: TRUE, colour: 'grey'\}/);
    } finally {
      env.uninstall();
    }
  });

  test('the icon’s menu changes a property’s type, or removes it, as in Obsidian', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      row(el.querySelector('.graph-note-details'), 'price').querySelector('.metadata-property-icon').click();
      const menu = env.state.menus.at(-1);
      assert.deepEqual(
        menu.items.map((it) => it.title),
        ['Text', 'List', 'Number', 'Checkbox', 'Date', 'Date & time', 'Remove'],
      );
      assert.equal(menu.items.find((it) => it.checked)?.title, 'Number');
      pick(env, el.querySelector('.graph-note-details'), 'price', 'Text');
      assert.match(text(el), /price: '300'/);
      pick(env, el.querySelector('.graph-note-details'), 'name', 'Remove');
      assert.doesNotMatch(text(el), /name: 'Large reader'/);
    } finally {
      env.uninstall();
    }
  });

  test('a type its value does not fit is refused, saying why, and nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      pick(env, el.querySelector('.graph-note-details'), 'name', 'Number');
      assert.match(el.querySelector('.graph-note-details [role="alert"]').textContent, /name: expected a number/);
      assert.equal(text(el), PRICED);
    } finally {
      env.uninstall();
    }
  });

  test('List is offered, as in Obsidian, but refused until lists come as linked things, saying so', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      pick(env, el.querySelector('.graph-note-details'), 'name', 'List');
      assert.match(
        el.querySelector('.graph-note-details [role="alert"]').textContent,
        /name: lists are coming, as linked things; until then, write one property for each value/,
      );
      assert.equal(text(el), PRICED);
    } finally {
      env.uninstall();
    }
  });

  test('a property is renamed in place, keeping its value', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(
        row(el.querySelector('.graph-note-details'), 'price').querySelector('.metadata-property-key-input'),
        'cost',
      );
      assert.match(text(el), /cost: 300/);
      assert.doesNotMatch(text(el), /price/);
    } finally {
      env.uninstall();
    }
  });

  test('a link’s properties are edited the same way', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      el.querySelectorAll('g.edge')[0].dispatch('keydown', { key: 'Enter' });
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'weight');
      pick(env, panel, '', 'Number');
      enter(field(panel, 'Value of new property'), '2');
      assert.match(text(el), /\(large\)-\[:ANSWERS \{weight: 2\}\]->\(q\)/);
    } finally {
      env.uninstall();
    }
  });

  test('the inspector stays open on the same box after the card is redrawn, so things can be edited in turn', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(field(el.querySelector('.graph-note-details'), 'Value of price'), '310');
      await until(() => env.state.files.get(PATH).includes('price: 310'), 2000);
      const again = await show(env);
      const reopened = again.querySelector('.graph-note-details');
      assert.ok(!reopened.hidden);
      assert.equal(field(reopened, 'Value of price').value, '310');
    } finally {
      env.uninstall();
    }
  });

  test('on a phone the inspector opens as a bottom sheet; on a desktop it stays in the card', async () => {
    for (const mobile of [true, false]) {
      const env = await load({ files: { [PATH]: NOTE2 }, mobile });
      try {
        const el = await editing(env);
        tap(el, 1);
        assert.equal(el.querySelector('.graph-note-details').classList.contains('is-sheet'), mobile);
      } finally {
        env.uninstall();
      }
    }
  });
});
