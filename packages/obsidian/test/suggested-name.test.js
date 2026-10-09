// A box drawn under a suggested name (spec §4, unnamed_drawn_suggested; Roger, 10 Oct 2026): a thing written without a
// name is drawn dashed and labelled as suggested, is selected like any box, and shows its suggested name with the fix that
// writes it; nothing is written until the fix is pressed, one undo takes it back, and then the box is drawn as written.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';

before(() => build());

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(q)`;
const NOTE = ['# Reader', '', fence(BLOCK), ''].join('\n');
const UNNAMED = "(:Option {name: 'Small reader'})";
const NAMED = BLOCK.replace('(:Option', '(small_reader:Option');

const boxOf = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
const choose = (el, key) => boxOf(el, key).dispatch('keydown', { key: 'Enter' });
const details = (el) => el.querySelector('.graph-note-details');

async function editing(env) {
  const el = await show(env);
  labelled(el, 'Edit here').click();
  await until(() => !!el.querySelector('textarea'));
  return el;
}

describe('a box drawn under a suggested name', () => {
  test('it is drawn dashed and labelled as suggested, by a sign and in words, and named so for screen readers', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      const box = boxOf(el, 'small_reader');
      assert.ok(box, 'drawn under its suggested name');
      assert.match(
        box.getAttribute('aria-label'),
        /^Option: Small reader \(suggested name small_reader, not yet written\)$/,
      );
      assert.ok(
        box.querySelectorAll('path, polygon').some((s) => s.getAttribute('stroke-dasharray')),
        'its outline is dashed',
      );
      assert.ok(box.textContent.includes('✎ SUGGESTED NAME'), 'and it says so');
      const large = boxOf(el, 'large');
      assert.equal(large.getAttribute('aria-label'), 'Option: Large reader');
      assert.ok(!large.textContent.includes('SUGGESTED'));
    } finally {
      env.uninstall();
    }
  });

  test('outside edit mode, its details show the suggested name and say how to write it, and nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      choose(el, 'small_reader');
      const text = details(el).textContent;
      assert.ok(text.includes('Small reader'));
      assert.ok(text.includes('✎ Suggested name: small_reader'), text);
      assert.ok(text.includes('not written yet'), text);
      assert.equal(labelled(details(el), 'Add the name small_reader'), undefined, 'no fix outside edit mode');
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });

  test('in edit mode, choosing it selects where it is written, by its (', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await editing(env);
      const t = el.querySelector('textarea');
      choose(el, 'small_reader');
      assert.equal(t.value.slice(t.selectionStart, t.selectionEnd), UNNAMED);
      assert.ok(env.doc.activeElement === t);
    } finally {
      env.uninstall();
    }
  });

  test('its fix writes the name, one undo takes it back, and until it is pressed nothing is written', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await editing(env);
      const t = el.querySelector('textarea');
      choose(el, 'small_reader');
      assert.equal(t.value, BLOCK, 'choosing it writes nothing');
      const fix = labelled(details(el), 'Add the name small_reader');
      assert.ok(fix, 'the one-click fix');
      fix.click();
      assert.equal(t.value, NAMED);
      await until(() => env.state.files.get(PATH).includes('(small_reader:Option'), 2000);
      // once written, the box is drawn as any other: solid, unlabelled, its warning gone
      const again = await show(env);
      const box = boxOf(again, 'small_reader');
      assert.equal(box.getAttribute('aria-label'), 'Option: Small reader');
      assert.ok(!box.querySelectorAll('path, polygon').some((s) => s.getAttribute('stroke-dasharray')));
      assert.ok(!box.textContent.includes('SUGGESTED'));
      choose(again, 'small_reader');
      assert.ok(!details(again).textContent.includes('Suggested name'));
      assert.ok(!details(again).textContent.includes('has no name'));
      assert.ok(t.dispatch('beforeinput', { inputType: 'historyUndo' }).defaultPrevented);
      assert.equal(t.value, BLOCK, 'one undo takes it back');
    } finally {
      env.uninstall();
    }
  });
});
