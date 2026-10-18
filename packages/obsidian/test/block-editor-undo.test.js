// The block editor's Undo and Redo never undo over another's change to the block (editor spec §9,
// undo_never_over_theirs; §26, cc_undo_safe). Another program, a sync or another pane may make it. After such a change:
// - the history starts again from the note as it now is;
// - the buttons say why there is nothing to take back;
// - pressing one says so and leaves the note as it is.
// A change elsewhere in the note leaves Undo working. Found in review, 15 Oct 2026: the pane reloaded the other
// program's block and kept its history. So Undo wrote the old text over it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
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
  const el = env.app.workspace.getLeavesOfType('thoughtknot-pane')[0].view.contentEl;
  const t = el.querySelector('textarea');
  t.value = MINE;
  t.setSelectionRange(MINE.length, MINE.length);
  t.dispatch('input');
  await until(() => note(env) === NOTE.replace(READER, MINE));
  return { env, el };
}
const note = (env) => env.state.files.get(PATH);
/** The editor's Undo or Redo button, whatever it says. */
const tool = (el, which) => el.querySelectorAll('.thoughtknot-pane-tools button')[which === 'undo' ? 0 : 1];
/** Resolves once the pane has drawn its tools again, as it does on hearing the note changed or on an Undo or Redo. */
async function toolsRedrawn(el, act) {
  const before = tool(el, 'undo');
  await act();
  await until(() => tool(el, 'undo') !== before);
}

/** What the editor says to screen readers from now on, each text it is set to in turn. */
function heard(el) {
  const announce = el.querySelector('.thoughtknot-announce'),
    said = [],
    set = announce.setText.bind(announce);
  announce.setText = (text) => {
    said.push(text);
    set(text);
  };
  return said;
}

/**
 * Holds that the button keeps its name, so voice control finds it. It says why there is nothing to take back.
 * Pressing it, twice, says so each time, to screen readers too, and changes nothing.
 */
async function refuses(env, el, which, expected) {
  const label = which === 'undo' ? 'Undo' : 'Redo',
    said = heard(el),
    notices = env.state.notices.length;
  for (let press = 0; press < 2; press++) {
    const b = tool(el, which);
    assert.equal(b.getAttribute('aria-label'), label, `${which} keeps its name`);
    assert.match(b.getAttribute('aria-description') ?? '', NOTHING[which], `${which} says why`);
    assert.equal(b.getAttribute('aria-disabled'), 'true');
    b.click();
    // pressed, it says why in a notice, and to screen readers on the next frame: both waited for, then checked below
    await until(() => env.state.notices.length === notices + press + 1 && said.length === 2 * (press + 1));
  }
  assert.equal(note(env), expected, 'the note is unchanged');
  const told = env.state.notices.slice(notices);
  assert.equal(told.length, 2, 'pressed, it says why, each time');
  for (const n of told) assert.match(n, NOTHING[which]);
  const reason = told[0];
  assert.deepEqual(said, ['', reason, '', reason], 'cleared, then said again, so a repeat is heard');
  assert.deepEqual(env.state.data?.drafts ?? {}, {}, 'nothing kept as a draft: nothing typed was refused');
}

describe('another program changes the block', () => {
  test('Undo refuses, saying why, and the note keeps its change', async () => {
    const { env, el } = await written();
    try {
      const theirs = NOTE.replace(READER, THEIRS);
      await env.app.vault.modify({ path: PATH }, theirs);
      await until(() => el.querySelector('textarea').value === THEIRS); // reloaded
      await refuses(env, el, 'undo', theirs);
      assert.equal(el.querySelector('textarea').value, THEIRS);
    } finally {
      env.uninstall();
    }
  });

  test('Undo by key or the Edit menu says why too, in a notice and to screen readers', async () => {
    const { env, el } = await written();
    try {
      await env.app.vault.modify({ path: PATH }, NOTE.replace(READER, THEIRS));
      await until(() => el.querySelector('textarea').value === THEIRS);
      const said = heard(el),
        notices = env.state.notices.length,
        t = el.querySelector('textarea');
      t.dispatch('beforeinput', { inputType: 'historyUndo' });
      await until(() => env.state.notices.length === notices + 1 && said.length === 2);
      t.dispatch('beforeinput', { inputType: 'historyUndo' });
      await until(() => env.state.notices.length === notices + 2 && said.length === 4);
      const told = env.state.notices.slice(notices);
      assert.equal(told.length, 2);
      assert.match(told[0], NOTHING.undo);
      assert.deepEqual(said, ['', told[0], '', told[0]]);
      assert.equal(t.value, THEIRS, 'nothing taken back');
      assert.equal(note(env), NOTE.replace(READER, THEIRS));
    } finally {
      env.uninstall();
    }
  });

  test('typing after it makes Undo available again at once, its own to take back', async () => {
    const { env, el } = await written();
    try {
      const theirs = NOTE.replace(READER, THEIRS);
      await env.app.vault.modify({ path: PATH }, theirs);
      await until(() => el.querySelector('textarea').value === THEIRS);
      assert.equal(tool(el, 'undo').getAttribute('aria-disabled'), 'true');
      const t = el.querySelector('textarea'),
        more = THEIRS + ',\n(more:Reason)';
      t.value = more;
      t.setSelectionRange(more.length, more.length);
      t.dispatch('input');
      const undo = tool(el, 'undo');
      assert.equal(undo.getAttribute('aria-disabled'), null, 'available as soon as it is typed');
      assert.equal(undo.getAttribute('aria-description'), null);
      undo.click();
      await until(() => note(env) === theirs && t.value === THEIRS);
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
      // refused, the block is reloaded as the sync left it once the text typed is kept as a draft
      await until(() => el.querySelector('textarea').value === THEIRS);
      assert.equal(note(env), synced, 'the undo is refused: the block changed since');
      await env.app.vault.modify({ path: PATH }, synced); // the change heard late
      // The editor already holds this text, from the refused Undo. So it finds nothing new and nothing shows it.
      // What it started, a read of the note, is let finish.
      await settled();
      env.state.data.drafts = {}; // the refused undo kept its text as a draft, as any refused write does
      await refuses(env, el, 'redo', synced);
      await refuses(env, el, 'undo', synced);
    } finally {
      env.uninstall();
    }
  });

  // review of #451, 15 Oct 2026: a refused Undo took the note it was pressed on as read, so the late change was skipped
  test('a change heard, a second synced but not yet heard, Undo refused: the late change still reaches the field', async () => {
    const { env, el } = await written();
    try {
      await env.app.vault.modify({ path: PATH }, NOTE.replace(READER, THEIRS)); // T1, heard
      await until(() => el.querySelector('textarea').value === THEIRS);
      const second = READER + ',\n(second:Reason)',
        synced = NOTE.replace(READER, second);
      env.state.files.set(PATH, synced); // T2, written by the sync, not yet heard
      const notices = env.state.notices.length;
      tool(el, 'undo').click();
      await until(() => env.state.notices.length === notices + 1); // refused, saying why
      assert.equal(note(env), synced, 'the undo is refused');
      await env.app.vault.modify({ path: PATH }, synced); // T2 heard late
      await until(() => el.querySelector('textarea').value === second); // the field shows the late change
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
      await until(() => el.querySelector('textarea').value === THEIRS); // the pane reloaded
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
      // heard, the block unchanged, the pane draws its tools again: Undo still offered
      await toolsRedrawn(el, () => env.app.vault.modify({ path: PATH }, note(env).replace('Between.', 'Changed.')));
      assert.equal(tool(el, 'undo').getAttribute('aria-label'), 'Undo');
      assert.equal(tool(el, 'undo').getAttribute('aria-disabled'), null);
      labelled(el, 'Undo').click();
      await until(() => el.querySelector('textarea').value === READER);
      assert.equal(note(env), NOTE.replace('Between.', 'Changed.'));
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
      // nothing to take back: the pane draws its tools again, and writes nothing
      await toolsRedrawn(env.el, () => labelled(env.el, 'Undo').click());
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
      await until(() => two.textarea(env.el).value.includes('Gentle on the eyes'));
      assert.equal(tool(env.el, 'undo').getAttribute('aria-disabled'), 'true', 'the first block’s Undo says why');
      await chooseOther(env);
      const undo = tool(env.el, 'undo');
      assert.equal(undo.getAttribute('aria-label'), 'Undo');
      assert.equal(undo.getAttribute('aria-disabled'), null);
      const notices = env.state.notices.length;
      await toolsRedrawn(env.el, () => undo.click());
      assert.equal(two.note(env), theirs);
      assert.deepEqual(env.state.notices.slice(notices), [], 'nothing said: there is simply nothing to undo');
    } finally {
      env.uninstall();
    }
  });
});
