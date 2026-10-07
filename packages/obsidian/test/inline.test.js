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
  const note = env.state.files.get(PATH), lines = note.split('\n'), open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1; while (!/^```\s*$/.test(lines[end])) end++;
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
    } finally { env.uninstall(); }
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
      for (const part of ['.graph-note-overlay', '.graph-note-readback', '.graph-note-suggestions', '.graph-note-pane-problems']) assert.ok(card.querySelector(part), part);
      assert.ok(labelled(card, 'Done') && labelled(card, 'Undo') && labelled(card, 'Lock the graph'));
      assert.equal(card.querySelector('select'), null, 'no picker: it edits this block');
    } finally { env.uninstall(); }
  });

  test('what is typed reaches the note, and the editor carries on in the redrawn card with its text, caret and focus', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      const typed = READER + ",\n(small:Option {name: 'Small reader'})";
      t.value = typed; t.setSelectionRange(10, 12); t.dispatch('input');
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
    } finally { env.uninstall(); }
  });

  test('Done writes what is left and closes the editor; the next drawing has none', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ",\n(x:Option {name: 'X'})"; t.dispatch('input');
      labelled(el, 'Done').click();
      await until(() => env.state.files.get(PATH).includes("name: 'X'"), 2000);
      await wait(20);
      assert.equal(el.querySelector('textarea'), null);
      assert.equal((await show(env)).querySelector('textarea'), null);
    } finally { env.uninstall(); }
  });

  test('a block changed in the note meanwhile is never overwritten in place either: what was typed is kept as a draft', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ',\n(mine:Option)'; t.dispatch('input');
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Option)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(1000);
      assert.equal(env.state.files.get(PATH), theirs);
      assert.ok(Object.values(env.state.data.drafts).some((d) => d.text === READER + ',\n(mine:Option)'));
    } finally { env.uninstall(); }
  });

  test('on a phone the editor in place has no tabs: the card’s drawing is its drawing', async () => {
    const env = await load({ files: { [PATH]: NOTE }, mobile: true });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      assert.equal(el.querySelector('[role="tablist"]'), null);
    } finally { env.uninstall(); }
  });
});

describe('the inspector, in edit mode', () => {
  const PRICED = READER.replace("(large:Option {name: 'Large reader'})", "(large:Option {name: 'Large reader', price: 300})");
  const NOTE2 = NOTE.replace(READER, PRICED);
  const field = (el, label) => el.querySelectorAll('input, select').find((x) => x.getAttribute('aria-label') === label);

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
      assert.equal(el.querySelector('.graph-note-details input'), undefined ?? null);
    } finally { env.uninstall(); }
  });

  test('in edit mode, each property can be changed, its value checked against its type, and the change is written as text', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      assert.equal(field(panel, 'Type of price').value, 'number');
      const v = field(panel, 'Value of price');
      v.value = 'three hundred';
      labelled(panel, 'Save price').click();
      assert.match(panel.querySelector('[role="alert"]').textContent, /a number/);
      assert.equal(el.querySelector('textarea').value, PRICED, 'nothing written');
      v.value = '320';
      labelled(panel, 'Save price').click();
      assert.equal(el.querySelector('textarea').value, PRICED.replace('price: 300', 'price: 320'));
      await until(() => env.state.files.get(PATH).includes('price: 320'), 2000);
    } finally { env.uninstall(); }
  });

  test('a property can be added, with the names already used on things of its kind offered, and removed', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      const names = panel.querySelectorAll('datalist option').map((o) => o.getAttribute('value'));
      assert.deepEqual(names, ['name', 'price', 'title']);
      field(panel, 'New property name').value = 'colour';
      field(panel, 'New property type').value = 'text';
      field(panel, 'New property value').value = 'grey';
      labelled(panel, 'Add property').click();
      assert.match(el.querySelector('textarea').value, /price: 300, colour: 'grey'\}/);
      labelled(el.querySelector('.graph-note-details'), 'Remove name').click();
      assert.doesNotMatch(el.querySelector('textarea').value, /name: 'Large reader'/);
    } finally { env.uninstall(); }
  });

  test('a link’s properties can be edited the same way', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      el.querySelectorAll('g.edge')[0].dispatch('keydown', { key: 'Enter' });
      const panel = el.querySelector('.graph-note-details');
      field(panel, 'New property name').value = 'weight';
      field(panel, 'New property type').value = 'number';
      field(panel, 'New property value').value = '2';
      labelled(panel, 'Add property').click();
      assert.match(el.querySelector('textarea').value, /\(large\)-\[:ANSWERS \{weight: 2\}\]->\(q\)/);
    } finally { env.uninstall(); }
  });

  test('the inspector stays open on the same box after the card is redrawn, so things can be edited in turn', async () => {
    const env = await load({ files: { [PATH]: NOTE2 } });
    try {
      const el = await editing(env);
      tap(el, 1);
      const panel = el.querySelector('.graph-note-details');
      field(panel, 'Value of price').value = '310';
      labelled(panel, 'Save price').click();
      await until(() => env.state.files.get(PATH).includes('price: 310'), 2000);
      const again = await show(env);
      const reopened = again.querySelector('.graph-note-details');
      assert.ok(!reopened.hidden);
      assert.equal(field(reopened, 'Value of price').value, '310');
    } finally { env.uninstall(); }
  });

  test('on a phone the inspector opens as a bottom sheet; on a desktop it stays in the card', async () => {
    for (const mobile of [true, false]) {
      const env = await load({ files: { [PATH]: NOTE2 }, mobile });
      try {
        const el = await editing(env);
        tap(el, 1);
        assert.equal(el.querySelector('.graph-note-details').classList.contains('is-sheet'), mobile);
      } finally { env.uninstall(); }
    }
  });
});
