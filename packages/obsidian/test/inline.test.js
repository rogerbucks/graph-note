// Editing in place (editor spec §4, "In place"; decided 7 Oct 2026): the text of a graph block can be edited inside the
// drawing's own card in the note, with the same help as the pane. Each write redraws the block, as Obsidian redraws any
// block whose text changed, so the editor moves into each new card with its text, its caret and its focus.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './lib/load-plugin.js';
import { fakeContext } from './lib/fake-obsidian.js';
import { readFileSync } from 'node:fs';
import { rules, winner } from './lib/cascade.js';

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

/** Draws the block as Live Preview does: into a card that goes on the page only once the drawing is done. */
async function showOffPage(env) {
  const note = env.state.files.get(PATH),
    lines = note.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const el = env.doc.createElement('div');
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(note, open));
  env.doc.body.appendChild(el);
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

  // typing_keeps_focus (spec §4, 8 Oct 2026; Roger's try-out of d601110: "when I add a character, focus is lost with the
  // redraw"): Obsidian takes the old card off the page before it builds the new one, so the field is off the page, and has
  // lost the focus and its scroll, by the time the new card asks for the editor
  test('typing in the card keeps the same box through each redraw: focused, with its caret, selection and scroll', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      for (const [i, typed] of [
        READER + ",\n(s:Option {name: 'S'})",
        READER + ",\n(s:Option {name: 'Sm'})",
      ].entries()) {
        t.value = typed;
        t.setSelectionRange(typed.length - 3, typed.length - 1 + i);
        t.scrollLeft = 40 + i;
        t.scrollTop = 0;
        t.dispatch('input');
        t.dispatch('scroll');
        await until(() => env.state.files.get(PATH).includes(typed), 2000);
        el.remove(); // Obsidian takes the old card away first
        el = await show(env);
        // compared by identity: a failing equal on two fake elements would print the whole page
        assert.ok(el.querySelector('textarea') === t, 'the same field, so its undo history goes with it');
        assert.ok(env.doc.activeElement === t, 'still focused');
        assert.deepEqual([t.selectionStart, t.selectionEnd], [typed.length - 3, typed.length - 1 + i]);
        assert.equal(t.scrollLeft, 40 + i);
      }
    } finally {
      env.uninstall();
    }
  });

  test('a text that cannot be drawn, or nothing at all, still keeps the box in its card, focused, with its problems', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      // a comma typed at a line's end, before the next pattern: for that moment, nothing in the block can be read
      for (const typed of [READER + ',', '// graph: reader\n', READER]) {
        t.value = typed;
        t.setSelectionRange(typed.length, typed.length);
        t.dispatch('input');
        await until(() => env.state.files.get(PATH).includes('```gql\n' + typed + '\n```'), 2000);
        el.remove();
        el = await show(env);
        assert.ok(el.querySelector('textarea') === t, `the same field, for ${JSON.stringify(typed.slice(-12))}`);
        assert.ok(env.doc.activeElement === t, 'still focused');
        assert.deepEqual([t.selectionStart, t.selectionEnd], [typed.length, typed.length]);
        if (typed.endsWith(',')) assert.ok(el.querySelector('.graph-note-problems'), 'and why it cannot be drawn');
      }
    } finally {
      env.uninstall();
    }
  });

  // Chromium empties a field's own undo history when the field leaves the page (seen in the browser on 8 Oct 2026), so
  // undo and redo come from the editor's own history, by key, by the Edit menu and by a phone's undo gesture
  test('undo and redo still work after each redraw: a run of typing at a time, by key or by the platform’s undo', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.setSelectionRange(READER.length, READER.length);
      const typeOne = (ch) => {
        const c = t.selectionStart;
        t.value = t.value.slice(0, c) + ch + t.value.slice(c);
        t.setSelectionRange(c + 1, c + 1);
        t.dispatch('input');
      };
      for (const ch of ",\n(s:Option {name: 'S'})") typeOne(ch);
      const typed = t.value;
      await until(() => env.state.files.get(PATH).includes(typed), 2000);
      el.remove();
      el = await show(env);
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented);
      assert.equal(t.value, READER + ',\n', 'the run of typing on the new line');
      assert.equal(t.selectionStart, READER.length + 2);
      assert.ok(t.dispatch('beforeinput', { inputType: 'historyUndo' }).defaultPrevented);
      assert.equal(t.value, READER, 'then the comma and the new line');
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true, shiftKey: true }).defaultPrevented);
      assert.equal(t.value, READER + ',\n');
      assert.ok(t.dispatch('keydown', { key: 'y', ctrlKey: true }).defaultPrevented);
      assert.equal(t.value, typed, 'redone, by Ctrl+Y as on Windows');
      t.dispatch('beforeinput', { inputType: 'historyUndo' });
      await until(() => !env.state.files.get(PATH).includes("name: 'S'"), 2000);
      assert.equal(env.state.files.get(PATH), NOTE.replace(READER, READER + ',\n'), 'and what is undone is written');
    } finally {
      env.uninstall();
    }
  });

  // Roger's try-out, 8 Oct 2026: "if I type a comma on the last line then the image refresh loses focus again". In Live
  // Preview Obsidian draws a block into a card that is not on the page yet, and puts it there after; a block that cannot
  // be drawn, or an empty one, took the editor at once, while its card was still off the page, where nothing takes focus
  test('in Live Preview, where the new card goes on the page only after it is drawn, the box still keeps the focus', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      for (const typed of [READER + ',', '// graph: reader\n', READER]) {
        t.value = typed;
        t.setSelectionRange(typed.length, typed.length);
        t.dispatch('input');
        await until(() => env.state.files.get(PATH).includes('```gql\n' + typed + '\n```'), 2000);
        el.remove();
        el = await showOffPage(env);
        await until(() => env.doc.activeElement === t, 500).catch(() => {});
        assert.ok(el.querySelector('textarea') === t, `the same field, for ${JSON.stringify(typed.slice(-12))}`);
        assert.ok(env.doc.activeElement === t, `still focused, for ${JSON.stringify(typed.slice(-12))}`);
        assert.deepEqual([t.selectionStart, t.selectionEnd], [typed.length, typed.length]);
      }
    } finally {
      env.uninstall();
    }
  });

  test('a comma typed at the end of the last line keeps the drawing and the box; undo takes it back, still focused', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.setSelectionRange(READER.length, READER.length);
      t.value = READER + ',';
      t.setSelectionRange(READER.length + 1, READER.length + 1);
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes(READER + ','), 2000);
      el.remove();
      el = await showOffPage(env);
      await until(() => env.doc.activeElement === t, 500).catch(() => {});
      assert.ok(env.doc.activeElement === t, 'still focused');
      assert.equal(el.querySelectorAll('g.node').length, 2, 'and the drawing is all there');
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented);
      assert.equal(t.value, READER);
      await until(() => !env.state.files.get(PATH).includes(READER + ','), 2000);
      el.remove();
      el = await showOffPage(env);
      await until(() => env.doc.activeElement === t, 500).catch(() => {});
      assert.ok(env.doc.activeElement === t, 'still focused after the undo');
      assert.equal(t.selectionStart, READER.length);
    } finally {
      env.uninstall();
    }
  });

  test('a box left on purpose stays left: a redraw after it gives no focus back', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ",\n(s:Option {name: 'S'})";
      t.dispatch('input');
      t.blur();
      t.dispatch('blur');
      await until(() => env.state.files.get(PATH).includes("name: 'S'"), 2000);
      el.remove();
      el = await show(env);
      assert.ok(el.querySelector('textarea') === t, 'the same field');
      assert.ok(env.doc.activeElement !== t, 'not focused');
    } finally {
      env.uninstall();
    }
  });

  // edit_button_toggles (spec §4, 8 Oct 2026): while the card is being edited its edit button shows a view icon, and
  // pressing it closes the edit box exactly as Done does
  test('while the card is edited, its edit button shows a view icon; pressing it writes and closes, as Done does', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      assert.equal(labelled(el, 'Edit here').getAttribute('data-icon'), 'pencil');
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea') && !!labelled(el, 'Done editing'));
      assert.equal(labelled(el, 'Edit here'), undefined);
      assert.equal(labelled(el, 'Done editing').getAttribute('data-icon'), 'book-open');
      const t = el.querySelector('textarea');
      t.value = READER + ",\n(x:Option {name: 'X'})";
      t.dispatch('input');
      labelled(el, 'Done editing').click();
      await until(() => env.state.files.get(PATH).includes("name: 'X'"), 2000);
      await wait(20);
      assert.equal(el.querySelector('textarea'), null);
      assert.equal((await show(env)).querySelector('textarea'), null);
    } finally {
      env.uninstall();
    }
  });

  test('closing with nothing typed, by either button, gives the card back its edit button', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      for (const close of ['Done editing', 'Done']) {
        labelled(el, 'Edit here').click();
        await until(() => !!labelled(el, 'Done editing'));
        labelled(el, close).click();
        await until(() => !el.querySelector('textarea'));
        assert.equal(labelled(el, 'Edit here')?.getAttribute('data-icon'), 'pencil', `after ${close}`);
        assert.equal(labelled(el, 'Done editing'), undefined);
      }
    } finally {
      env.uninstall();
    }
  });

  test('a card redrawn while its block is edited shows the view icon', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const again = await show(env);
      assert.equal(labelled(again, 'Done editing')?.getAttribute('data-icon'), 'book-open');
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

describe('the text in the card fits its text', () => {
  // the try-out of 8 Oct 2026: the box in the card had a tall empty area under the text that the caret could land in, and
  // the note's own code styles wrapped the coloured picture of the text out of step with the field under it
  test('the coloured picture is not a code block, so the note’s own code styles never reach it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      assert.notEqual(el.querySelector('.graph-note-overlay').tagName, 'PRE');
      assert.equal(el.querySelector('textarea').getAttribute('rows'), String(READER.split('\n').length + 1));
    } finally {
      env.uninstall();
    }
  });

  test('in the card the box keeps no height of its own: as tall as its text, and one line to type on', () => {
    const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
    assert.match(css, /\.graph-note-pane\.graph-note-inline\s*\{[^}]*height:\s*auto;/);
    assert.match(
      css,
      /\.graph-note-inline \.graph-note-editor,\s*\.graph-note-inline \.graph-note-text\s*\{[^}]*min-height:\s*0;/,
    );
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
  const READER_LAST = '(large)-[:ANSWERS]->(q)';
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

  test('renaming onto a name the thing already has is refused, so no value is lost; a new row too', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      enter(row(panel, 'price').querySelector('.metadata-property-key-input'), 'name');
      assert.match(panel.querySelector('[role="alert"]').textContent, /already has a property called name/);
      assert.equal(text(el), PRICED);
      assert.equal(row(panel, 'price').querySelector('.metadata-property-key-input').value, 'price');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'price');
      enter(field(panel, 'Value of new property'), '1');
      assert.match(panel.querySelector('[role="alert"]').textContent, /already has a property called price/);
      assert.equal(text(el), PRICED);
    } finally {
      env.uninstall();
    }
  });

  test('a renamed value is kept exactly as written', async () => {
    const env = await load({ files: { [PATH]: NOTE2.replace('price: 300', 'price: 1.50') } });
    try {
      const el = await editing(env);
      tap(el, 1);
      enter(
        row(el.querySelector('.graph-note-details'), 'price').querySelector('.metadata-property-key-input'),
        'cost',
      );
      assert.match(text(el), /cost: 1\.50/);
    } finally {
      env.uninstall();
    }
  });

  test('a new row’s value typed before its name is written once the name is given', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'Value of new property'), 'grey');
      assert.match(panel.querySelector('[role="alert"]').textContent, /name it first/);
      enter(field(panel, 'New property name'), 'colour');
      assert.match(text(el), /colour: 'grey'\}/);
      assert.ok(panel.querySelector('[role="alert"]').hidden, 'the alert goes once the property is written');
    } finally {
      env.uninstall();
    }
  });

  test('once written, a new row is a property like the others: named, and removed from the note', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'colour');
      enter(field(panel, 'Value of new property'), 'grey');
      assert.ok(row(panel, 'colour'), 'the row carries its name');
      assert.ok(field(panel, 'Value of colour'));
      pick(env, panel, 'colour', 'Remove');
      assert.doesNotMatch(text(el), /colour/);
    } finally {
      env.uninstall();
    }
  });

  test('a property set elsewhere is not removed here, and the row stays, saying why', async () => {
    const env = await load({
      files: { [PATH]: NOTE2.replace(READER_LAST, `${READER_LAST}\nSET large.status = 'bought'`) },
    });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      pick(env, panel, 'status', 'Remove');
      assert.match(panel.querySelector('[role="alert"]').textContent, /status is not written in its pattern here/);
      assert.ok(row(panel, 'status'));
      assert.match(text(el), /SET large\.status = 'bought'/);
    } finally {
      env.uninstall();
    }
  });

  test('a new date and time takes the offset of the chosen day, not of today', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      panel.querySelector('.metadata-add-button').click();
      enter(field(panel, 'New property name'), 'start');
      pick(env, panel, '', 'Date & time');
      enter(field(panel, 'Value of new property'), '2026-07-01T09:00');
      assert.match(text(el), /start: DATETIME '2026-07-01T09:00\+10:00'/);
    } finally {
      env.uninstall();
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
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

describe('the box in the card, untouched by the theme', () => {
  // inline_untouched_by_theme (spec §4, 8 Oct 2026): the in-place box looks the same whether hovered, focused or neither,
  // and its accessible name raises no tooltip.
  const styles = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');

  // the try-out of 8 Oct 2026: Obsidian shows a tooltip for any aria-label, so hovering the field showed "Text of graph trip"
  test('the field is named for a screen reader by a hidden label, so no tooltip shows on hover', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      assert.equal(t.getAttribute('aria-label'), null);
      const label = el.querySelector(`#${t.getAttribute('aria-labelledby')}`);
      assert.equal(label?.textContent, 'Text of graph reader');
      assert.ok(label.classList.contains('graph-note-sr'));
    } finally {
      env.uninstall();
    }
  });

  // the try-out of 8 Oct 2026: on mouse hover the box went flat grey and hid the coloured text under it. Obsidian's app.css
  // styles every textarea, and textarea:hover (0,1,1) outweighed .graph-note-text (0,1,0). These are the rules it gives
  // every textarea, as shipped in the Mac app on 8 Oct 2026, cut to the properties that would show.
  const OBSIDIAN = `
    textarea { background: var(--background-modifier-form-field); border: var(--input-border-width) solid var(--background-modifier-border);
      color: var(--text-normal); font-family: inherit; padding: var(--input-padding); font-size: var(--font-ui-small);
      border-radius: var(--input-radius); outline: none; }
    @media (hover: hover) {
      textarea:hover { background-color: var(--background-modifier-form-field-hover); border-color: var(--background-modifier-border-hover); }
    }
    textarea:active, textarea:focus { border-color: var(--background-modifier-border-focus); }
    textarea:active, textarea:focus, textarea:focus-visible { box-shadow: 0 0 0 var(--input-border-width-focus) var(--background-modifier-border-focus); }
    textarea { line-height: var(--line-height-tight); border-radius: var(--textarea-radius, var(--input-radius)); padding: var(--textarea-padding, var(--input-padding)); }
  `;
  const all = [...rules(OBSIDIAN, 'obsidian'), ...rules(styles, 'graph-note')];
  const field = (states, inline) => ({
    tag: 'textarea',
    classes: ['graph-note-text'],
    states,
    ancestors: [
      { tag: 'div', classes: ['graph-note-editor'] },
      { tag: 'div', classes: ['graph-note-pane-text'] },
      { tag: 'div', classes: inline ? ['graph-note-pane', 'graph-note-inline'] : ['graph-note-pane'] },
      { tag: 'div', classes: ['markdown-rendered'] },
    ],
  });
  const LOOK = [
    'background-color',
    'border-color',
    'border-width',
    'border-radius',
    'box-shadow',
    'outline',
    'color',
    'padding',
    'font-family',
    'font-size',
    'line-height',
  ];

  for (const states of [[], ['hover'], ['focus'], ['active'], ['focus', 'focus-visible'], ['hover', 'focus']]) {
    test(`the field keeps the plugin’s look: ${states.join(' and ') || 'at rest'}`, () => {
      for (const inline of [false, true]) {
        const el = field(states, inline);
        for (const property of LOOK) {
          const won = winner(all, el, property);
          assert.equal(won?.source, 'graph-note', `${property} comes from ${won?.selector} (${won?.source})`);
        }
        assert.equal(winner(all, el, 'background-color').value, 'transparent');
        assert.equal(winner(all, el, 'color').value, 'transparent');
      }
    });
  }
});
