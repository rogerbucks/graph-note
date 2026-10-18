// Editing in place (editor spec §4, "In place"; decided 7 Oct 2026): the text of a graph block can be edited inside the
// drawing's own card in the note, with the same help as the pane. Each write redraws the block, as Obsidian redraws any
// block whose text changed, so the editor moves into each new card with its text, its caret and its focus.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH, READER, NOTE, show, showOffPage } from './host/card-notes.js';

before(() => build());

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

  test('while edited, Record a path, Make a view and Add a thing sit in one row of the card’s tools, not a row each', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const rows = ['Record a path', 'Make a view', 'Add a thing'].map(
        (name) => labelled(el, name)?.closest('.graph-note-card-tools') ?? null,
      );
      assert.ok(rows[0], 'in the card’s tools');
      assert.ok(
        rows.every((r) => r === rows[0]),
        'one row',
      );
      assert.ok(labelled(el, 'Done').classList.contains('graph-note-primary'), 'Done stands out as the way out');
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
      await until(() => el.querySelector('textarea') === null); // the editor closed
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

  // Roger's Mac, 9 Oct 2026, traced in the app: after a write, reading view draws the block, then takes that same card off
  // the page and puts it back some 20 ms later, with nothing drawn in between and so no hand-over: the box lost its focus
  // the second time and never had it back
  test('a card taken off the page and put back as it was, any number of times, still gives the box its focus back', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ',';
      t.setSelectionRange(READER.length + 1, READER.length + 1);
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes(READER + ','), 2000);
      el.remove();
      el = await show(env);
      for (let n = 1; n <= 3; n++) {
        el.remove(); // the same card, off the page and back, as reading view does
        await wait(10);
        env.doc.body.appendChild(el);
        await until(() => env.doc.activeElement === t, 500).catch(() => {});
        assert.ok(env.doc.activeElement === t, `focused again after return ${n}`);
        assert.deepEqual([t.selectionStart, t.selectionEnd], [READER.length + 1, READER.length + 1]);
      }
    } finally {
      env.uninstall();
    }
  });

  test('once the person has moved to something else, a card coming back never takes the focus from it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      let el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ',';
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes(READER + ','), 2000);
      el.remove();
      el = await show(env);
      const elsewhere = env.doc.body.createEl('button', { text: 'Elsewhere' });
      elsewhere.focus();
      el.remove();
      await wait(10);
      env.doc.body.appendChild(el);
      await wait(150);
      assert.ok(env.doc.activeElement === elsewhere, 'the focus stays where the person put it');
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
      await until(() => el.querySelector('textarea') === null); // the editor closed
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

describe('selecting in the drawing moves the text to it', () => {
  // select_moves_text (spec §4, slice 2; Roger, 7 Oct 2026: "selecting an item in the graph should move the editor to
  // the item in the text edit box if editing"): a box or a link chosen in the drawing selects where it is written
  const choose = (el, selector, which) => el.querySelectorAll(selector)[which].dispatch('keydown', { key: 'Enter' });

  test('in the card, choosing a box selects its pattern in the box being edited', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      const boxes = [...el.querySelectorAll('g.node')];
      const large = boxes.findIndex((g) => g.getAttribute('data-key') === 'large');
      choose(el, 'g.node', large);
      const from = READER.indexOf("(large:Option {name: 'Large reader'})");
      assert.deepEqual(
        [t.selectionStart, t.selectionEnd],
        [from, from + "(large:Option {name: 'Large reader'})".length],
      );
      assert.ok(env.doc.activeElement === t, 'the box takes the focus, so the selection shows');
    } finally {
      env.uninstall();
    }
  });

  test('in the card, choosing a link selects the link where it is written', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      choose(el, 'g.edge[data-link]', 0);
      // the link's own arrow, as the inspector edits it
      assert.equal(t.value.slice(t.selectionStart, t.selectionEnd), '-[:ANSWERS]->');
      assert.equal(t.selectionStart, READER.indexOf('-[:ANSWERS]->'));
    } finally {
      env.uninstall();
    }
  });

  test('when nothing is being edited, choosing a box changes no text and moves no focus', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      choose(el, 'g.node', 0);
      assert.ok(el.querySelector('textarea') === null);
      assert.ok(!el.querySelector('.graph-note-details').hidden, 'its details show, as before');
    } finally {
      env.uninstall();
    }
  });
});
