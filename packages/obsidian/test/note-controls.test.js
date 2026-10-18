// The details' note controls (editor spec §24, note_add). While the block is edited in place, a thing's details offer to
// add its note, or to change or remove the one it has. Each is written into the block as the `///` lines above the thing.
// The core's setNote writes them (tested in packages/core/test/notes-edits.test.js). A refusal is said, and nothing is written.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { editing, tapKey } from './host/inspector-steps.js';

before(() => build());

const PATH = 'Some note.md';
const GRAPH = `// graph: trip
/// Packed already.
(start:Place {name: 'Start'}),
(mid:Place {name: 'Middle'})`;
const FILES = { [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n') };
/** The block as typed in the editor's field, not the note field in the details. */
const text = (el) => el.querySelector('textarea.thoughtknot-text').value;
const panelOf = (el) => el.querySelector('.thoughtknot-details');
const pressed = (el, label) =>
  panelOf(el)
    .querySelectorAll('button')
    .find((b) => b.textContent === label);

/** Opens the block for editing and the details of `key`. */
async function opened(env, key) {
  const el = await editing(env);
  await until(() => !!el.querySelector('g.node'));
  tapKey(el, key);
  await until(() => !!pressed(el, 'Add a note') || !!pressed(el, 'Change the note'));
  return el;
}

describe('note_add: the details offer to add, change and remove a note while the block is edited', () => {
  test('a thing with no note is offered Add a note, and the words typed are written above it', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await opened(env, 'mid');
      assert.equal(pressed(el, 'Remove the note'), undefined);
      pressed(el, 'Add a note').click();
      const field = panelOf(el).querySelector('textarea');
      field.value = 'Where we **rest**.';
      pressed(el, 'Save note').click();
      await until(() => text(el).includes('/// Where we **rest**.\n(mid:'));
      assert.ok(text(el).includes('/// Packed already.\n(start:'), 'the other note is as it was');
    } finally {
      env.uninstall();
    }
  });

  test('a thing with a note is offered Change and Remove: change rewrites its lines, remove takes them away', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await opened(env, 'start');
      pressed(el, 'Change the note').click();
      const field = panelOf(el).querySelector('textarea');
      assert.equal(field.value, 'Packed already.', 'the field holds the note as written');
      field.value = 'Packed twice.';
      pressed(el, 'Save note').click();
      await until(() => text(el).includes('/// Packed twice.\n(start:'));
      assert.ok(!text(el).includes('Packed already.'));
      tapKey(el, 'start');
      await until(() => !!pressed(el, 'Remove the note'));
      pressed(el, 'Remove the note').click();
      await until(() => !text(el).includes('///'));
      assert.ok(text(el).includes("(start:Place {name: 'Start'})"), 'the thing itself is untouched');
    } finally {
      env.uninstall();
    }
  });

  test('Cancel writes nothing, and a thing in the block with another on its line is refused in words', async () => {
    const files = {
      [PATH]: ['# Trip', '', fence("// graph: trip\n(a:T {name: 'A'}), (b:T {name: 'B'})"), ''].join('\n'),
    };
    const env = await load({ files });
    try {
      const el = await opened(env, 'b');
      const before = text(el);
      pressed(el, 'Add a note').click();
      pressed(el, 'Cancel').click();
      assert.ok(pressed(el, 'Add a note'), 'the offer is back');
      assert.equal(text(el), before);
      pressed(el, 'Add a note').click();
      panelOf(el).querySelector('textarea').value = 'A note.';
      pressed(el, 'Save note').click();
      assert.match(panelOf(el).querySelector('.thoughtknot-note-said').textContent, /line of its own/);
      assert.equal(text(el), before, 'nothing written');
    } finally {
      env.uninstall();
    }
  });
});
