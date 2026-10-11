// The drafts kept in the plugin's data (spec §9, nothing_typed_lost; the review of #91, 11 Oct 2026): they follow their
// note when it is renamed with no editor open on it, still offered when it is edited again; and every one, a deleted
// note's among them, can be recovered into a new note from the command palette.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { fakeContext } from './host/fake-obsidian.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';
import * as pane from './host/pane-notes.js';

before(() => build());

const drafts = (env) => env.state.data?.drafts ?? {};
const command = (env, id) => env.state.commands.find((c) => c.id === id);

describe('drafts follow their note', () => {
  test('kept, then Done, then the note renamed: Edit here on it there offers the draft', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = READER + ',\n(mine:Option)';
      t.dispatch('input');
      // the block changed in the note meanwhile: what was typed is kept as a draft
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Option)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await until(() => !!drafts(env)[`${PATH}#reader`], 2000);
      labelled(el, 'Done').click();
      await until(() => !el.querySelector('textarea'));
      await env.app.vault.rename(env.app.vault.getFileByPath(PATH), 'Renamed.md');
      await until(() => !!drafts(env)['Renamed.md#reader'], 2000);
      assert.deepEqual(Object.keys(drafts(env)), ['Renamed.md#reader'], 'none left under the old name');
      const again = env.doc.body.createDiv();
      await env.state.processors.get('gql')(READER + ',\n(theirs:Option)', again, {
        ...fakeContext(theirs, 2),
        sourcePath: 'Renamed.md',
      });
      labelled(again, 'Edit here').click();
      await until(() => !!again.querySelector('textarea'));
      const banner = again.querySelector('.graph-note-draft');
      assert.ok(!banner.hidden, 'the draft is offered');
      labelled(banner, 'Restore draft').click();
      assert.equal(again.querySelector('textarea').value, READER + ',\n(mine:Option)');
    } finally {
      env.uninstall();
    }
  });
});

describe('drafts follow their note, never over another', () => {
  const kept = (text) => ({ text, kept: '2026-10-11T08:00:00.000Z' });

  // the re-review of #91, 11 Oct 2026: a note renamed onto the name of a deleted note whose draft is kept
  test('a note renamed to where a deleted note’s draft is kept: both drafts kept, the one moved beside the other', async () => {
    const data = {
      drafts: { 'B.md#reader': kept('deleted B'), 'A.md#reader': kept('A'), 'A.md#reader (2)': kept('A, the pane') },
    };
    const env = await load({ files: { 'A.md': NOTE }, data });
    try {
      await env.app.vault.rename(env.app.vault.getFileByPath('A.md'), 'B.md');
      await until(() => !Object.keys(drafts(env)).some((k) => k.startsWith('A.md')), 2000);
      const byText = Object.fromEntries(Object.entries(drafts(env)).map(([k, d]) => [d.text, k]));
      assert.deepEqual(Object.keys(byText).sort(), ['A', 'A, the pane', 'deleted B'], 'none lost');
      assert.equal(byText['deleted B'], 'B.md#reader', 'the deleted note’s left where it was');
      for (const text of ['A', 'A, the pane']) assert.match(byText[text], /^B\.md#reader \(\d+\)$/, text);
    } finally {
      env.uninstall();
    }
  });

  test('a folder renamed: the drafts of the notes in it go with them, and no other note’s', async () => {
    const data = { drafts: { 'Folder/A.md#reader': kept('in the folder'), 'Folder.md#reader': kept('beside it') } };
    const env = await load({ files: { 'Folder/A.md': NOTE, 'Folder.md': NOTE }, data });
    try {
      // Obsidian tells a folder's rename as the folder, at its new path, and the path it had
      env.state.tell('rename', { path: 'Moved' }, 'Folder');
      await until(() => !!drafts(env)['Moved/A.md#reader'], 2000);
      assert.deepEqual(Object.keys(drafts(env)).sort(), ['Folder.md#reader', 'Moved/A.md#reader']);
    } finally {
      env.uninstall();
    }
  });
});

// Roger's choice A, 11 Oct 2026: each draft has an id from the moment it is kept, which no rename changes; and drafts
// kept before ids were kept with them are given one when first read, so none is lost or left without one
describe('each draft keeps its id', () => {
  test('a draft kept by an editor has an id, and keeps it when its note, and then its folder, are renamed', async () => {
    const env = await pane.open();
    try {
      pane.type(env.el, pane.READER + ',\n(mine:Reason)');
      const theirs = pane.NOTE.replace(pane.READER, pane.READER + ',\n(theirs:Reason)');
      await env.app.vault.modify({ path: pane.PATH }, theirs);
      await until(() => !!drafts(env)[`${pane.PATH}#reader`], 2000);
      const { id } = drafts(env)[`${pane.PATH}#reader`];
      assert.equal(typeof id, 'string');
      assert.ok(id.length > 0, 'an id');
      await env.app.vault.rename(env.app.vault.getFileByPath(pane.PATH), 'Notes/Reader.md');
      await until(() => !!drafts(env)['Notes/Reader.md#reader'], 2000);
      assert.equal(drafts(env)['Notes/Reader.md#reader'].id, id, 'the same id after the note is renamed');
      env.state.tell('rename', { path: 'Moved' }, 'Notes');
      await until(() => !!drafts(env)['Moved/Reader.md#reader'], 2000);
      assert.equal(drafts(env)['Moved/Reader.md#reader'].id, id, 'and after its folder is');
    } finally {
      env.uninstall();
    }
  });

  test('drafts kept before ids were kept are each given one when read, and act as any draft does', async () => {
    const old = (text) => ({ text, kept: '2026-10-09T08:00:00.000Z' });
    const data = { drafts: { [`${PATH}#reader`]: old('first'), 'Other.md#reader': old('second') } };
    const env = await load({ files: { [PATH]: NOTE }, data });
    try {
      const ids = Object.values(env.plugin.drafts()).map((d) => d.id);
      assert.equal(ids.length, 2);
      assert.ok(
        ids.every((id) => typeof id === 'string' && id.length > 0),
        'each has an id',
      );
      assert.notEqual(ids[0], ids[1], 'its own');
      assert.deepEqual(
        Object.values(env.plugin.drafts()).map((d) => d.id),
        ids,
        'the same each time they are read',
      );
      // offered and discarded as any draft is: by that id, the other left kept
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea') && !el.querySelector('.graph-note-draft').hidden);
      labelled(el.querySelector('.graph-note-draft'), 'Discard draft').click();
      await until(() => !drafts(env)[`${PATH}#reader`], 2000);
      assert.deepEqual(Object.keys(drafts(env)), ['Other.md#reader']);
      assert.equal(drafts(env)['Other.md#reader'].id, ids[1]);
      // recovered once, named by its id
      await command(env, 'recover-drafts').callback();
      assert.equal(env.state.files.get('Kept drafts.md').split(ids[1]).length - 1, 1);
    } finally {
      env.uninstall();
    }
  });
});

describe('every kept draft can be recovered', () => {
  test('a deleted note’s draft: the notice names the command, which writes it into a new note', async () => {
    const env = await pane.open();
    try {
      const typed = pane.READER + ',\n(mine:Reason)';
      pane.type(env.el, typed);
      await env.app.vault.delete(env.app.vault.getFileByPath(pane.PATH));
      await until(() => drafts(env)[`${pane.PATH}#reader`]?.text === typed, 2000);
      const recover = command(env, 'recover-drafts');
      assert.ok(recover, 'a command recovers kept drafts');
      assert.ok(
        env.state.notices.some((n) => n.includes(recover.name)),
        'and what is said of the deleted note names it',
      );
      await recover.callback();
      const note = env.state.files.get('Kept drafts.md');
      assert.ok(note?.includes(typed), 'the draft written into a new note');
      assert.match(note, new RegExp(`## ${pane.PATH}, graph reader`));
      assert.doesNotMatch(note, /```gql/, 'as plain text, never drawn as a graph');
      assert.ok(env.state.notices.some((n) => /1 kept draft written into Kept drafts\.md/.test(n)));
      assert.ok(drafts(env)[`${pane.PATH}#reader`], 'and the draft stays kept');
    } finally {
      env.uninstall();
    }
  });

  test('a note already named Kept drafts is never replaced: the drafts go into Kept drafts-2', async () => {
    const data = { drafts: { [`${PATH}#reader`]: { text: 'mine', kept: '2026-10-11T08:00:00.000Z' } } };
    const env = await load({ files: { [PATH]: NOTE, 'Kept drafts.md': 'my own note' }, data });
    try {
      await command(env, 'recover-drafts').callback();
      assert.equal(env.state.files.get('Kept drafts.md'), 'my own note');
      assert.ok(env.state.files.get('Kept drafts-2.md')?.includes('mine'));
      assert.ok(env.state.notices.some((n) => n.includes('Kept drafts-2.md')));
    } finally {
      env.uninstall();
    }
  });

  // on a Mac a note named only in another case, such as kept drafts.md, is the same file, and creating it fails
  test('when the note cannot be written, it says so, and the drafts stay kept', async () => {
    const data = { drafts: { [`${PATH}#reader`]: { text: 'mine', kept: '2026-10-11T08:00:00.000Z' } } };
    const env = await load({ files: { [PATH]: NOTE }, data });
    try {
      env.app.vault.create = async () => {
        throw new Error('File already exists.');
      };
      await command(env, 'recover-drafts').callback();
      assert.ok(
        env.state.notices.some((n) => /could not be written.*File already exists/.test(n)),
        'it says why',
      );
      assert.ok(drafts(env)[`${PATH}#reader`]);
    } finally {
      env.uninstall();
    }
  });

  test('with no draft kept, the command says so and writes nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      await command(env, 'recover-drafts').callback();
      assert.deepEqual([...env.state.files.keys()], [PATH]);
      assert.ok(env.state.notices.includes('No drafts are kept.'));
    } finally {
      env.uninstall();
    }
  });
});
