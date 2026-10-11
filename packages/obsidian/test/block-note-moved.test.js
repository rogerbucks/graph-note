// The note behind a block editor renamed or deleted while its block is edited (spec §9, nothing_typed_lost; slice 2's
// end-of-slice review, 11 Oct 2026: "text typed after the note is renamed or deleted is lost silently"). Renamed or
// moved, the editor follows the note, so what is typed keeps reaching it; deleted, what is typed is kept as a draft, and
// the editor says so. In the pane and in place alike.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { READER, NOTE, PATH, open, textarea, type } from './host/pane-notes.js';
import * as card from './host/card-notes.js';

before(() => build());

const MOVED = 'Moved/Reader.md';
/** The drafts kept, by note and graph. */
const drafts = (env) => env.state.data?.drafts ?? {};
const rename = (env, from, to) => env.app.vault.rename(env.app.vault.getFileByPath(from), to);
const remove = (env, path) => env.app.vault.delete(env.app.vault.getFileByPath(path));

describe('the pane, when its note is renamed or deleted', () => {
  test('renamed while typing: the pane follows the note, and what is typed after reaches it at its new path', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(one:Reason)');
      await rename(env, PATH, MOVED);
      type(env.el, READER + ',\n(one:Reason),\n(two:Reason)');
      await until(() => !!env.state.files.get(MOVED)?.includes('(two:Reason)'), 2000);
      assert.equal(env.state.files.get(MOVED), NOTE.replace(READER, READER + ',\n(one:Reason),\n(two:Reason)'));
      assert.equal(env.state.files.has(PATH), false, 'no note is made again at the old path');
      assert.equal(env.pane.getState().path, MOVED, 'and the pane is on the note where it now is');
    } finally {
      env.uninstall();
    }
  });

  test('a draft kept before the rename goes with the note, still offered', async () => {
    const kept = { text: READER + ',\n(mine:Reason)', kept: '2026-10-11T08:00:00.000Z' };
    const env = await open({ data: { drafts: { [`${PATH}#reader`]: kept } } });
    try {
      await rename(env, PATH, MOVED);
      await until(() => !!drafts(env)[`${MOVED}#reader`]);
      assert.deepEqual(drafts(env), { [`${MOVED}#reader`]: kept });
    } finally {
      env.uninstall();
    }
  });

  test('deleted while typing: what was typed is kept as a draft, said, and what is typed after is kept as it is typed', async () => {
    const env = await open();
    try {
      const typed = READER + ',\n(mine:Reason)';
      type(env.el, typed, 10);
      await remove(env, PATH);
      const banner = env.el.querySelector('.graph-note-draft');
      await until(() => drafts(env)[`${PATH}#reader`]?.text === typed && !banner.hidden, 2000);
      assert.match(banner.textContent, /deleted/, 'the draft is shown, saying why');
      assert.ok(
        env.state.notices.some((n) => /deleted/.test(n)),
        'and a notice says so',
      );
      assert.equal(textarea(env.el).value, typed, 'the text is left as typed');
      assert.equal(textarea(env.el).selectionStart, 10, 'with its caret');
      const more = typed + ',\n(more:Reason)';
      type(env.el, more);
      await until(() => drafts(env)[`${PATH}#reader`]?.text === more, 2000);
      assert.equal(textarea(env.el).value, more);
      assert.equal(env.state.files.has(PATH), false, 'never written back as a new note');
    } finally {
      env.uninstall();
    }
  });

  test('renamed, then deleted: what is typed is kept as the draft of the note where it last was', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(one:Reason)');
      await rename(env, PATH, MOVED);
      type(env.el, READER + ',\n(one:Reason),\n(two:Reason)');
      await until(() => !!env.state.files.get(MOVED)?.includes('(two:Reason)'), 2000);
      const last = READER + ',\n(one:Reason),\n(two:Reason),\n(three:Reason)';
      type(env.el, last);
      await remove(env, MOVED);
      await until(() => drafts(env)[`${MOVED}#reader`]?.text === last, 2000);
      assert.deepEqual(Object.keys(drafts(env)), [`${MOVED}#reader`]);
      assert.deepEqual([...env.state.files.keys()], [], 'never written back as a new note');
    } finally {
      env.uninstall();
    }
  });
});

describe('the editor in place, when its note is renamed or deleted', () => {
  /** Opens the editor in the note's card; returns its card and its field. */
  async function editHere(env) {
    const el = await card.show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    return { el, t: el.querySelector('textarea') };
  }

  test('renamed while typing: what is typed after reaches the note at its new path, and the card can still close it', async () => {
    const env = await load({ files: { [card.PATH]: card.NOTE } });
    try {
      const { el, t } = await editHere(env);
      await rename(env, card.PATH, 'Renamed.md');
      t.value = card.READER + ",\n(small:Option {name: 'Small reader'})";
      t.dispatch('input');
      // the card was drawn before the rename, so it knows the note by its old name
      labelled(el, 'Done editing').click();
      await until(() => !!env.state.files.get('Renamed.md')?.includes('Small reader'), 2000);
      await until(() => !el.querySelector('textarea'));
      assert.equal(env.state.files.get('Renamed.md'), card.NOTE.replace(card.READER, t.value));
    } finally {
      env.uninstall();
    }
  });

  test('deleted while typing: what was typed is kept as a draft and said, and so is what is typed after', async () => {
    const env = await load({ files: { [card.PATH]: card.NOTE } });
    try {
      const { t } = await editHere(env);
      const typed = card.READER + ',\n(mine:Option)';
      t.value = typed;
      t.dispatch('input');
      await remove(env, card.PATH);
      await until(() => drafts(env)[`${card.PATH}#reader`]?.text === typed, 2000);
      assert.ok(
        env.state.notices.some((n) => /deleted/.test(n)),
        'a notice says so, as the card may be gone with its note',
      );
      t.value = typed + ',\n(more:Option)';
      t.dispatch('input');
      await until(() => drafts(env)[`${card.PATH}#reader`]?.text === t.value, 2000);
    } finally {
      env.uninstall();
    }
  });
});
