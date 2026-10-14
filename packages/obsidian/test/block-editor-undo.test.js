// The block editor's Undo and Redo never undo over a change another program, a sync or another pane made to the block
// (editor spec §9, undo_never_over_theirs; §26, cc_undo_safe): after such a change the history starts again from the
// note as it now is, the buttons say why there is nothing to take back, and pressing one says so and leaves the note as
// it is. A change elsewhere in the note leaves Undo working. Found in review, 15 Oct 2026: the pane reloaded the other
// program's block and kept its history, so Undo wrote the old text over it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, READER, show } from './host/card-notes.js';
import * as two from './host/pane-notes.js';

before(() => build());

const NOTE = ['# Reader', '', fence(READER), '', 'Between.', ''].join('\n');
const MINE = READER + ',\n(mine:Reason)';
const THEIRS = READER + ',\n(theirs:Reason)';
const NOTHING = {
  undo: /^Nothing to undo: another program, a sync or another pane changed this block/,
  redo: /^Nothing to redo: another program, a sync or another pane changed this block/,
};

/** Opens the edit pane on the note's block, as Edit in pane does, and writes MINE from it. */
async function written() {
  const env = await load({ files: { [PATH]: NOTE } });
  await env.plugin.openEditor({ path: PATH, line: 2, graph: 'reader' });
  const el = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl;
  const t = el.querySelector('textarea');
  t.value = MINE;
  t.setSelectionRange(MINE.length, MINE.length);
  t.dispatch('input');
  await until(() => note(env) === NOTE.replace(READER, MINE));
  return { env, el };
}
const note = (env) => env.state.files.get(PATH);
/** The editor's Undo or Redo button, whatever it says. */
const tool = (el, which) => el.querySelectorAll('.graph-note-pane-tools button')[which === 'undo' ? 0 : 1];

/** Holds that the button says why there is nothing to take back, and that pressing it says so and changes nothing. */
async function refuses(env, el, which, expected) {
  const b = tool(el, which);
  assert.match(b.getAttribute('aria-label'), NOTHING[which], `${which} says why`);
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  const notices = env.state.notices.length;
  b.click();
  await wait(20);
  assert.equal(note(env), expected, 'the note is unchanged');
  assert.match(env.state.notices.slice(notices).join('\n'), NOTHING[which], 'pressed, it says why');
  assert.match(el.querySelector('.graph-note-announce').textContent, NOTHING[which], 'and to screen readers');
  assert.deepEqual(env.state.data?.drafts ?? {}, {}, 'nothing kept as a draft: nothing typed was refused');
}

describe('another program changes the block', () => {
  test('Undo refuses, saying why, and the note keeps its change', async () => {
    const { env, el } = await written();
    try {
      const theirs = NOTE.replace(READER, THEIRS);
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(20);
      assert.equal(el.querySelector('textarea').value, THEIRS, 'reloaded');
      await refuses(env, el, 'undo', theirs);
      assert.equal(el.querySelector('textarea').value, THEIRS);
    } finally {
      env.uninstall();
    }
  });
});

describe('a sync changes the block', () => {
  // Obsidian Sync writes the file itself, and the vault tells the editor only afterwards
  test('an Undo pressed before the editor hears of it, and Redo after, never write over it', async () => {
    const { env, el } = await written();
    try {
      const synced = NOTE.replace(READER, THEIRS);
      env.state.files.set(PATH, synced);
      labelled(el, 'Undo').click();
      await wait(20);
      assert.equal(note(env), synced, 'the undo is refused: the block changed since');
      assert.equal(el.querySelector('textarea').value, THEIRS, 'reloaded as the sync left it');
      await env.app.vault.modify({ path: PATH }, synced); // the change heard late
      await wait(20);
      env.state.data.drafts = {}; // the refused undo kept its text as a draft, as any refused write does
      await refuses(env, el, 'redo', synced);
      await refuses(env, el, 'undo', synced);
    } finally {
      env.uninstall();
    }
  });
});

describe('another pane changes the block', () => {
  test('the pane refuses to undo it, and the card that wrote it still undoes its own change', async () => {
    const { env, el } = await written();
    try {
      const card = await show(env);
      labelled(card, 'Edit here').click();
      await until(() => !!card.querySelector('textarea'));
      const t = card.querySelector('textarea');
      assert.equal(t.value, MINE);
      const theirs = NOTE.replace(READER, THEIRS);
      t.value = THEIRS;
      t.setSelectionRange(THEIRS.length, THEIRS.length);
      t.dispatch('input');
      await until(() => note(env) === theirs, 2000);
      await wait(20);
      assert.equal(el.querySelector('textarea').value, THEIRS, 'the pane reloaded');
      await refuses(env, el, 'undo', theirs);
      labelled(card, 'Undo').click();
      await until(() => note(env) === NOTE.replace(READER, MINE));
    } finally {
      env.uninstall();
    }
  });
});

describe('a change elsewhere in the note', () => {
  test('leaves Undo working: the editor’s own change is taken back, the other kept', async () => {
    const { env, el } = await written();
    try {
      await env.app.vault.modify({ path: PATH }, note(env).replace('Between.', 'Changed.'));
      await wait(20);
      assert.equal(tool(el, 'undo').getAttribute('aria-label'), 'Undo');
      assert.equal(tool(el, 'undo').getAttribute('aria-disabled'), null);
      labelled(el, 'Undo').click();
      await wait(20);
      assert.equal(note(env), NOTE.replace('Between.', 'Changed.'));
      assert.equal(el.querySelector('textarea').value, READER);
    } finally {
      env.uninstall();
    }
  });
});

// editor spec §9, undo_stays_in_its_block. Review of #451, 15 Oct 2026: Undo after switching blocks in the picker wrote
// the first block's old text over the second
describe('switching blocks in the picker', () => {
  const EDITED = two.READER.replace('Easy on the eyes', 'Kind to the eyes'); // as many lines, so no block moves
  /** The pane on the note's first block, with EDITED written from it. */
  async function edited() {
    const env = await two.open();
    two.type(env.el, EDITED);
    await until(() => two.note(env) === two.NOTE.replace(two.READER, EDITED));
    return env;
  }
  /** Chooses the note's second block in the pane's picker. */
  async function chooseOther(env) {
    const picker = env.el.querySelector('select');
    picker.value = '13';
    picker.dispatch('change');
    await until(() => two.textarea(env.el)?.value === two.OTHER);
  }

  test('Undo in the block chosen never writes the first block’s text into it', async () => {
    const env = await edited();
    try {
      const written = two.note(env);
      await chooseOther(env);
      labelled(env.el, 'Undo').click();
      await wait(20);
      assert.equal(two.note(env), written, 'neither block changed');
      assert.equal(two.textarea(env.el).value, two.OTHER);
    } finally {
      env.uninstall();
    }
  });

  test('the reason that held for the first block is not given for the one chosen', async () => {
    const env = await edited();
    try {
      const theirs = two.note(env).replace('Kind to the eyes', 'Gentle on the eyes');
      await env.app.vault.modify({ path: two.PATH }, theirs);
      await wait(20);
      assert.equal(tool(env.el, 'undo').getAttribute('aria-disabled'), 'true', 'the first block’s Undo says why');
      await chooseOther(env);
      const undo = tool(env.el, 'undo');
      assert.equal(undo.getAttribute('aria-label'), 'Undo');
      assert.equal(undo.getAttribute('aria-disabled'), null);
      const notices = env.state.notices.length;
      undo.click();
      await wait(20);
      assert.equal(two.note(env), theirs);
      assert.deepEqual(env.state.notices.slice(notices), [], 'nothing said: there is simply nothing to undo');
    } finally {
      env.uninstall();
    }
  });
});
