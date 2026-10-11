// The details of a thing or link are the editable inspector only while the card is in edit mode (spec §14,
// inspector_in_details); when Done closes the editor, a details panel that is open turns read-only, with nothing left in it
// that could write to the note — and a control kept from before cannot write either.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';
import { editing, tapKey, field, enter } from './host/inspector-steps.js';

before(() => build());

const TAGGED = READER.replace(
  "(large:Option {name: 'Large reader'})",
  "(large:Option {name: 'Large reader', price: 300})",
).replace(
  '(large)-[:ANSWERS]->(q)',
  '(large)-[:ANSWERS]->(q),\n(light:Tag),\n(large)-[:HAS_TAG]->(light),\n(cheap:Tag),\n(large)-[:HAS_TAG]->(cheap)',
);
const WITH_LIST = NOTE.replace(READER, TAGGED);

/** Everything in a panel that a person could change something with. */
const controls = (panel) => ({
  inputs: panel.querySelectorAll('input').length,
  add: panel.querySelectorAll('.metadata-add-button').length,
  removes: panel.querySelectorAll('.multi-select-pill-remove-button').length,
  chips: panel.querySelectorAll('.multi-select-pill').length,
  icons: panel.querySelectorAll('.metadata-property-icon').length,
});
const NONE = { inputs: 0, add: 0, removes: 0, chips: 0, icons: 0 };

describe('the details after Done', () => {
  test('a box’s open details turn read-only when Done closes the editor: no field, Add property, x or add box is left', async () => {
    const env = await load({ files: { [PATH]: WITH_LIST } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      assert.ok(
        controls(panel).inputs > 0 && controls(panel).add === 1 && controls(panel).removes === 2,
        'editable while editing',
      );
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      assert.ok(panel.hidden === false, 'the details are still open');
      assert.equal(panel.getAttribute('aria-label'), 'Details of Large reader');
      assert.deepEqual(controls(panel), NONE);
      assert.match(panel.textContent, /Links out/, 'the read-only view a tap shows');
      assert.ok(
        el
          .querySelectorAll('g.node')
          .find((n) => n.getAttribute('data-key') === 'large')
          .classList.contains('is-selected'),
        'and the box is still the one selected',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a link’s open details turn read-only too', async () => {
    const env = await load({ files: { [PATH]: WITH_LIST } });
    try {
      const el = await editing(env);
      el.querySelectorAll('g.edge')[0].dispatch('keydown', { key: 'Enter' });
      const panel = el.querySelector('.graph-note-details');
      assert.ok(controls(panel).add === 1, 'editable while editing');
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      assert.ok(panel.hidden === false);
      assert.deepEqual(controls(panel), NONE);
      assert.match(panel.textContent, /From: Large reader/);
    } finally {
      env.uninstall();
    }
  });

  test('a control kept from before Done writes nothing to the note, and details closed before Done stay closed', async () => {
    const env = await load({ files: { [PATH]: WITH_LIST } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      const price = field(panel, 'Value of price'),
        adder = panel.querySelector('input.multi-select-input'),
        x = panel.querySelector('.multi-select-pill-remove-button');
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      await wait(400);
      const settled = env.state.files.get(PATH);
      assert.deepEqual(controls(panel), NONE);
      enter(price, '999');
      adder.value = 'Open late';
      adder.dispatch('keydown', { key: 'Enter' });
      x.click();
      await wait(400);
      assert.equal(env.state.files.get(PATH), settled, 'the note is as Done left it');
      // details closed before Done are not opened by it
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'large');
      labelled(panel, 'Close details').click();
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      assert.ok(panel.hidden === true);
    } finally {
      env.uninstall();
    }
  });
});

describe('Park for later after Done', () => {
  // a locked graph whose schema, in a later block, does not declare Deferred and DEFERS: declaring them writes that
  // block through the vault, apart from the text being edited (graph-view-parked.test.js)
  const PLAIN = `// graph: reader
(q:Question {title: 'Which device?'}),
(small:Option {name: 'Small reader'}),
(small)-[:ANSWERS]->(q)`;
  const SCHEMA = `// graph: reader
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'is answered by'}),
(reader_schema)-[:DECLARES]->(kind_option),
(reader_schema)-[:DECLARES]->(kind_question),
(reader_schema)-[:DECLARES]->(link_answers)`;
  const LOCKED = ['# Reader', '', '```gql', PLAIN, '```', '', '```gql', SCHEMA, '```', ''].join('\n');
  const DECLARE = 'Declare Deferred and DEFERS in the schema';

  test('a Declare Deferred and DEFERS button kept from before Done declares nothing', async () => {
    const env = await load({ files: { [PATH]: LOCKED } });
    try {
      const el = await editing(env);
      tapKey(el, 'small');
      labelled(el, 'Park for later').click();
      const panel = el.querySelector('.graph-note-details');
      enter(field(panel, 'What is needed'), 'its price');
      enter(field(panel, 'Why it waits'), 'the shop has not said');
      labelled(el, 'Park it').click();
      await until(() => !!labelled(el, DECLARE));
      const declare = labelled(el, DECLARE);
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      await wait(400);
      const settled = env.state.files.get(PATH);
      declare.click();
      await wait(400);
      assert.equal(env.state.files.get(PATH), settled, 'the schema is as Done left it');
      assert.doesNotMatch(env.state.files.get(PATH), /kind_deferred/);
    } finally {
      env.uninstall();
    }
  });
});

describe('the details when editing starts again', () => {
  test('after Done, pressing Edit here makes the open read-only details the editable inspector again, without a tap', async () => {
    const env = await load({ files: { [PATH]: WITH_LIST } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      assert.deepEqual(controls(panel), NONE);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      assert.ok(panel.hidden === false, 'still open');
      assert.equal(controls(panel).add, 1, 'Add property is back');
      assert.equal(controls(panel).removes, 2, 'and the x on each chip');
      assert.ok(field(panel, 'Value of price'), 'and the fields');
    } finally {
      env.uninstall();
    }
  });

  test('details opened by a tap outside edit mode become the inspector when Edit here is pressed, and read-only again at Done', async () => {
    const env = await load({ files: { [PATH]: WITH_LIST } });
    try {
      const el = await show(env);
      tapKey(el, 'large');
      const panel = el.querySelector('.graph-note-details');
      assert.deepEqual(controls(panel), NONE, 'read-only to begin with');
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      assert.equal(controls(panel).add, 1);
      assert.ok(field(panel, 'Value of price'));
      labelled(el, 'Done').click();
      await until(() => el.querySelector('textarea') === null);
      assert.deepEqual(controls(panel), NONE);
    } finally {
      env.uninstall();
    }
  });
});
