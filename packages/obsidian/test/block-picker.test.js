// The pane's block picker (spec §4): the note's graph blocks, built again from the note as it is whenever it changes or
// is written, and a choice found again in the note as it is when it is used, so a block whose line moved is still the
// one opened. Found while fixing #451, 15 Oct 2026: the picker kept the lines it was built with, so after the note's
// line count changed, choosing a later block silently did nothing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { READER, OTHER, NOTE, PATH, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

/** The picker's options, as their labels. */
const labels = (env) => (env.el.querySelector('select')?.querySelectorAll('option') ?? []).map((o) => o.textContent);

/** Chooses the block of `graph` in the picker, as a person does: the option shown for it. */
function choose(env, graph) {
  const picker = env.el.querySelector('select');
  const option = picker.querySelectorAll('option').find((o) => o.textContent.startsWith(`${graph} ·`));
  picker.value = option.getAttribute('value');
  picker.dispatch('change');
}

const MORE = READER + ",\n(price:Reason {title: 'Costs more'})";

describe('the picker after the note’s line count changes', () => {
  test('a write that adds a line above a later block: the picker shows its new line, and choosing it opens it', async () => {
    const env = await open();
    try {
      type(env.el, MORE);
      await until(() => note(env) === NOTE.replace(READER, MORE));
      await until(() => labels(env).includes('other · line 15'));
      assert.deepEqual(labels(env), ['reader · line 3', 'other · line 15']);
      choose(env, 'other');
      await until(() => textarea(env.el).value === OTHER);
    } finally {
      env.uninstall();
    }
  });

  test('a block chosen before what was typed is written is found again once it is, and opened', async () => {
    const env = await open();
    try {
      type(env.el, MORE);
      choose(env, 'other');
      await until(() => textarea(env.el).value === OTHER);
      assert.equal(note(env), NOTE.replace(READER, MORE), 'what was typed is written first');
    } finally {
      env.uninstall();
    }
  });

  test('a change made outside the pane moves the picker’s lines with it', async () => {
    const env = await open();
    try {
      const moved = NOTE.replace('Between.', 'Between.\n\nA new paragraph.');
      await env.app.vault.modify({ path: PATH }, moved);
      await until(() => labels(env).includes('other · line 16'));
      choose(env, 'other');
      await until(() => textarea(env.el).value === OTHER);
    } finally {
      env.uninstall();
    }
  });

  // the review of #465, 15 Oct 2026: a choice found again by its place alone could open another block that came there
  test('a block chosen that is gone once what was typed is written: said in a notice, and nothing else opened', async () => {
    const env = await open();
    try {
      type(env.el, MORE);
      env.state.files.set(PATH, NOTE.replace(fence(OTHER), '')); // changed on disk, not yet heard
      choose(env, 'other');
      await until(() => env.state.notices.some((n) => /no longer in the note/.test(n)));
      assert.equal(textarea(env.el).value, MORE);
    } finally {
      env.uninstall();
    }
  });

  test('a block chosen whose place now holds another block of its graph: said in a notice, that block never opened', async () => {
    const env = await open();
    try {
      const another = "// graph: other\n(y:Thing {name: 'Y'})";
      type(env.el, MORE);
      env.state.files.set(PATH, NOTE.replace(OTHER, another));
      choose(env, 'other');
      await until(() => env.state.notices.some((n) => /no longer in the note/.test(n)));
      assert.equal(textarea(env.el).value, MORE, 'the block being edited stays open');
      assert.equal(note(env), NOTE.replace(READER, MORE).replace(OTHER, another), 'what was typed is written');
    } finally {
      env.uninstall();
    }
  });

  test('a graph block added to a note that had one gives it a picker', async () => {
    const one = ['# Reader', '', fence(READER), ''].join('\n');
    const env = await open({ note: one });
    try {
      assert.equal(env.el.querySelector('select'), null);
      await env.app.vault.modify({ path: PATH }, one + '\n' + fence(OTHER) + '\n');
      await until(() => labels(env).length === 2);
      choose(env, 'other');
      await until(() => textarea(env.el).value === OTHER);
    } finally {
      env.uninstall();
    }
  });
});
