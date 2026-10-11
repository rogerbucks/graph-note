// The editors open in place, as the plugin keeps track of them (spec §4, typing_keeps_focus; slice 2's end-of-slice
// review, 11 Oct 2026: the editor in place dropped out of its card when the block's fence line moved, and Edit here
// pressed twice opened two editors on one block). A block is known by its card's identity, which a line added or taken
// away above it never changes, so the card and its editor survive the move with the focus and the selection; and a
// block has one editor in place at most.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { cmState, cmView, editorLivePreviewField, editorInfoField } from './host/fake-obsidian.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';

before(() => build());

/** The note open in the editing view, in Live Preview, with the plugin's own extension: its state moves on as it is changed. */
function openNote(env, text) {
  const view = {
    state: cmState.EditorState.create({
      doc: text,
      extensions: [
        editorLivePreviewField.init(() => true),
        editorInfoField.init(() => ({ file: { path: PATH } })),
        ...(env.state.editorExtensions ?? []).filter((e) => !e?.listener),
      ],
    }),
    dispatch(spec) {
      view.state = view.state.update(spec).state;
    },
  };
  env.plugin.editorViews.add(view);
  return view;
}

/** The graph block's card the editor would draw for the note as it now is. */
function cardOf(view) {
  for (const source of view.state.facet(cmView.EditorView.decorations)) {
    let found = null;
    source.between?.(0, view.state.doc.length, (_from, _to, deco) => {
      found ??= deco.spec.widget ?? null;
    });
    if (found) return found;
  }
  return null;
}

describe('the editor in place keeps its card when the block moves', () => {
  test('a line added above the block, and taken away again, keeps the same card and its editor, focused, with its selection', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const view = openNote(env, NOTE);
      const host = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const dom = cardOf(view).toDOM();
      host.appendChild(dom);
      await until(() => !!dom.querySelector('.graph-note-view'));
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      const t = dom.querySelector('textarea');
      // the card redrawn: one drawing in it, the old one gone, with a field in it
      const redrawn = () => dom.querySelectorAll('.graph-note-view').length === 1 && !!dom.querySelector('textarea');
      t.setSelectionRange(3, 9);
      for (const [why, change] of [
        ['a line added above', { from: 0, insert: 'A new first line\n' }],
        ['that line taken away', { from: 0, to: 'A new first line\n'.length }],
      ]) {
        view.dispatch({ changes: change });
        const moved = cardOf(view);
        assert.equal(moved.updateDOM(dom), true, `${why}: the same card, redrawn in place`);
        await until(redrawn, 3000);
        await until(() => env.doc.activeElement === t, 500).catch(() => {});
        assert.ok(dom.querySelector('textarea') === t, `${why}: the same field in the redrawn card`);
        assert.ok(env.doc.activeElement === t, `${why}: still focused`);
        assert.deepEqual([t.selectionStart, t.selectionEnd], [3, 9]);
        assert.ok(labelled(dom, 'Done editing'), `${why}: the card knows it is being edited`);
      }
      // the block's first line edited in place, after the move: written into the note, and the box stays in its card
      t.value = t.value.replace('// graph: reader', '// graph: reader · SOURCE');
      t.setSelectionRange(5, 5);
      t.dispatch('input');
      await until(() => view.state.doc.toString().includes('// graph: reader · SOURCE'), 2000);
      assert.equal(cardOf(view).updateDOM(dom), true);
      await until(redrawn, 3000);
      assert.ok(dom.querySelector('textarea') === t && env.doc.activeElement === t, 'the same field, focused');
      assert.equal(t.selectionStart, 5);
    } finally {
      env.uninstall();
    }
  });

  test('a new block written above the one edited never takes its editor: each card keeps its own', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const view = openNote(env, NOTE);
      const host = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const dom = cardOf(view).toDOM();
      host.appendChild(dom);
      await until(() => !!dom.querySelector('.graph-note-view'));
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      const other = "```gql\n// graph: other\n(x:Thing {name: 'X'})\n```\n";
      // written where the edited block's fence was: the new block's fence is on the line the edited one had
      view.dispatch({ changes: { from: NOTE.indexOf('```gql'), insert: other } });
      assert.equal(env.plugin.inlineFor(PATH, 2)?.session?.graph, undefined, 'the new block at the old line has none');
      assert.equal(env.plugin.inlineFor(PATH, 6)?.session?.graph, 'reader', 'the edited block, now lower, keeps it');
    } finally {
      env.uninstall();
    }
  });
});

describe('Edit here gives a block one editor in place', () => {
  test('pressed twice, the second before the first has opened, one editor opens and has the focus', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      const edit = labelled(el, 'Edit here');
      edit.click();
      edit.click();
      await until(() => !!el.querySelector('textarea'));
      await wait(50);
      assert.equal(env.plugin.inline.size, 1, 'one editor');
      assert.equal(el.querySelectorAll('textarea').length, 1);
      assert.ok(env.doc.activeElement === el.querySelector('textarea'), 'and the second press focused it');
      assert.equal(el.querySelector('textarea').value, READER);
    } finally {
      env.uninstall();
    }
  });
});
