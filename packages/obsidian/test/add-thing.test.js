// Adding a thing in a drawing (editor spec §5, add_thing; §4, name_from_text, suggested_name_unique): while the card is
// edited, Add a thing asks for the thing's text first; the name is suggested from the text as it is typed, in the style of
// the graph's names and never one of them, and is shown before anything is written; Add the thing then writes the thing
// into the text being edited, one undo takes it back, and a name of the user's own is kept and held to the same rules.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';
import { editing, field, text } from './host/inspector-steps.js';

before(() => build());

const strip = (el) => el.querySelector('.graph-note-add-thing');
const said = (el) => strip(el).querySelector('[aria-live]').textContent;
const alert = (el) => strip(el).querySelector('[role="alert"]');
const nameField = (el) => field(strip(el), 'Name of the new thing');
const nameRow = (el) => strip(el).querySelector('.graph-note-add-name');
const textField = (el) => field(strip(el), 'Text of the new thing');
const type = (el, input, value) => {
  input.value = value;
  input.dispatch('input');
  return el;
};

async function adding(note = NOTE) {
  const env = await load({ files: { [PATH]: note } });
  const el = await editing(env);
  await until(() => !!labelled(el, 'Add a thing'));
  labelled(el, 'Add a thing').click();
  return { env, el };
}

describe('Add a thing, while the card is edited', () => {
  test('is offered only while the card is edited', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      assert.equal(labelled(el, 'Add a thing'), undefined, 'not before Edit here');
      labelled(el, 'Edit here').click();
      await until(() => !!labelled(el, 'Add a thing'));
      labelled(el, 'Done editing').click();
      await until(() => strip(el).hidden);
      assert.equal(labelled(el, 'Add a thing'), undefined, 'and gone when Done is pressed');
    } finally {
      env.uninstall();
    }
  });

  test('asks for the text first: the name is not asked for until there is some, and the focus is on the text', async () => {
    const { env, el } = await adding();
    try {
      assert.ok(textField(el), 'the text is asked for');
      assert.ok(env.doc.activeElement === textField(el), 'the focus is on it');
      assert.ok(nameRow(el).hidden, 'no name yet');
      type(el, textField(el), '   ');
      assert.ok(nameRow(el).hidden, 'spaces are no text');
      assert.equal(text(el), READER, 'nothing is written');
    } finally {
      env.uninstall();
    }
  });

  test('suggests the name from the text as it is typed, shows it, and writes nothing until the thing is added', async () => {
    const { env, el } = await adding();
    try {
      type(el, textField(el), 'Small reader');
      assert.ok(!nameRow(el).hidden);
      assert.equal(nameField(el).value, 'small_reader', 'in the style of the graph’s names');
      assert.match(said(el), /Suggested name: small_reader\. Nothing is written until you press Add the thing\./);
      type(el, textField(el), 'Large');
      assert.equal(nameField(el).value, 'large_2', 'never a name the graph has');
      assert.equal(text(el), READER, 'nothing is written');
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });

  test('counts a name typed in the block since the drawing was made', async () => {
    const { env, el } = await adding();
    try {
      const t = el.querySelector('textarea');
      t.value = `${READER},\n(small_reader:Option {name: 'Tiny'})`;
      t.dispatch('input');
      type(el, textField(el), 'Small reader');
      assert.equal(nameField(el).value, 'small_reader_2');
    } finally {
      env.uninstall();
    }
  });

  test('Add the thing writes it, with the shown name, in one edit that one undo takes back', async () => {
    const { env, el } = await adding();
    try {
      type(el, textField(el), 'Small reader');
      type(el, field(strip(el), 'Kind of the new thing'), 'Option');
      labelled(el, 'Add the thing').click();
      assert.equal(text(el), `${READER},\n(small_reader:Option {name: 'Small reader'})`);
      assert.match(said(el), /Added Small reader as small_reader\./);
      await until(() => env.state.files.get(PATH).includes("(small_reader:Option {name: 'Small reader'})"), 2000);
      assert.equal(textField(el), undefined, 'the form is closed');
      assert.ok(labelled(el, 'Add a thing'), 'and Add a thing is offered again');
      const t = el.querySelector('textarea');
      assert.ok(t.dispatch('beforeinput', { inputType: 'historyUndo' }).defaultPrevented);
      assert.equal(t.value, READER, 'one undo takes it back');
    } finally {
      env.uninstall();
    }
  });

  test('a name of its own is kept as the text changes, and is the one written', async () => {
    const { env, el } = await adding();
    try {
      type(el, textField(el), 'Small reader');
      type(el, nameField(el), 'tiny');
      type(el, textField(el), 'Small reader, large print');
      assert.equal(nameField(el).value, 'tiny', 'not suggested over');
      assert.match(said(el), /^Name: tiny\./);
      labelled(el, 'Add the thing').click();
      assert.match(text(el), /\(tiny \{name: 'Small reader, large print'\}\)$/);
    } finally {
      env.uninstall();
    }
  });

  test('clearing the name goes back to the suggested one', async () => {
    const { env, el } = await adding();
    try {
      type(el, textField(el), 'Small reader');
      type(el, nameField(el), 'tiny');
      type(el, nameField(el), '');
      assert.equal(nameField(el).value, 'small_reader');
    } finally {
      env.uninstall();
    }
  });

  test('no text, a name that is taken, one word too many, or a name the language keeps: refused in words, nothing written', async () => {
    const { env, el } = await adding();
    try {
      labelled(el, 'Add the thing').click();
      assert.match(alert(el).textContent, /give the thing its text first/);
      type(el, textField(el), 'Small reader');
      for (const [name, why] of [
        ['Large', /already a name in graph reader/],
        ['two words', /one word/],
        ['match', /language keeps/],
      ]) {
        type(el, nameField(el), name);
        labelled(el, 'Add the thing').click();
        assert.match(alert(el).textContent, why, name);
        assert.equal(text(el), READER, 'nothing written');
      }
      assert.ok(textField(el), 'the form stays, so it can be put right');
    } finally {
      env.uninstall();
    }
  });

  test('Cancel closes the form and writes nothing', async () => {
    const { env, el } = await adding();
    try {
      type(el, textField(el), 'Small reader');
      labelled(el, 'Cancel adding').click();
      assert.equal(textField(el), undefined);
      assert.equal(text(el), READER);
      assert.ok(labelled(el, 'Add a thing'));
    } finally {
      env.uninstall();
    }
  });

  test('in a graph whose names show a prefix from their kinds, the kind typed gives the suggestion that prefix', async () => {
    const styled = `// graph: shop
(item_tea:Item {name: 'Tea'}),
(item_milk:Item {name: 'Milk'}),
(shop_corner:Shop {name: 'Corner shop'}),
(shop_market:Shop {name: 'Market'})`;
    const { env, el } = await adding(['# Shop', '', fence(styled), ''].join('\n'));
    try {
      type(el, textField(el), 'Sugar');
      type(el, field(strip(el), 'Kind of the new thing'), 'Item');
      assert.equal(nameField(el).value, 'item_sugar');
      type(el, field(strip(el), 'Kind of the new thing'), 'Shop');
      assert.equal(nameField(el).value, 'shop_sugar');
    } finally {
      env.uninstall();
    }
  });

  test('the kinds the graph uses are offered', async () => {
    const { env, el } = await adding();
    try {
      const list = strip(el).querySelector(
        `datalist#${field(strip(el), 'Kind of the new thing').getAttribute('list')}`,
      );
      assert.deepEqual(
        list.querySelectorAll('option').map((o) => o.getAttribute('value')),
        ['Option', 'Question'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('the box added is drawn once the text is read again, under the name that was shown', async () => {
    const { env, el } = await adding();
    try {
      type(el, textField(el), 'Small reader');
      type(el, field(strip(el), 'Kind of the new thing'), 'Option');
      labelled(el, 'Add the thing').click();
      await until(() => env.state.files.get(PATH).includes('small_reader'), 2000);
      const again = await show(env);
      const box = again.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === 'small_reader');
      assert.equal(box.getAttribute('aria-label'), 'Option: Small reader');
    } finally {
      env.uninstall();
    }
  });
});
