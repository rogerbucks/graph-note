// The editors open in place (spec §4, typing_keeps_focus; the review of #91, 11 Oct 2026): an editor whose card's block
// is cut never goes to the block that comes to sit on its line, and comes back to its own block when it is pasted and
// saved, even when the block that comes is another of the same graph; an editor is released, its typing written, when
// its note is closed, whether its card was on the page or scrolled away, and an editor with nothing to open is never
// kept, each leaving no listener behind, as after Done; and Edit here pressed again while the editor opens moves it into
// the newer card only once it is made.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';
import { cardsOf, openNote, place } from './host/editing-view.js';

before(() => build());

/**
 * Closes every editor in place, as Done does, so that a field left off the page stops waiting to be given the focus
 * again before the test's page is taken down, whether the test passed or not.
 */
async function closeAll(env) {
  for (const e of [...env.plugin.inline.open.keys()]) await e.done();
}

const OTHER = "// graph: other\n(x:Thing {name: 'X'})";
/** `# Reader`, then block A, the reader graph, then block B, another graph. */
const TWO = ['# Reader', '', fence(READER), '', fence(OTHER), ''].join('\n');

describe('an editor whose block is cut', () => {
  test('never goes to the block that comes to its line; pasted and saved, its own block gets it back', async () => {
    const env = await load({ files: { [PATH]: TWO } });
    try {
      const view = openNote(env, TWO, PATH);
      const [a] = cardsOf(view.state);
      const dom = await place(env, a.widget, until);
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      const t = dom.querySelector('textarea');
      const editor = env.plugin.inlineFor(PATH, 2);
      assert.equal(editor?.session?.graph, 'reader');
      // A's lines cut: B's fence comes to line 2, where A's was
      const cut = fence(READER) + '\n\n';
      view.dispatch({ changes: { from: TWO.indexOf(cut), to: TWO.indexOf(cut) + cut.length } });
      a.widget.destroy(dom);
      dom.remove();
      assert.equal(cardsOf(view.state)[0].line, 2, 'B is on line 2 now');
      assert.ok(env.plugin.inlineFor(PATH, 2) === undefined, 'B’s card has no editor');
      // A pasted at the end, and the note saved
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\n' + fence(READER) + '\n' } });
      const pasted = cardsOf(view.state).find((c) => c.line !== 2);
      await env.app.vault.modify({ path: PATH }, view.state.doc.toString());
      await until(() => editor.session.ref.line === pasted.line, 2000);
      assert.ok(env.plugin.inlineFor(PATH, 2) === undefined, 'B’s card still has none');
      assert.ok(env.plugin.inlineFor(PATH, pasted.line) === editor, 'A’s card has A’s editor');
      const back = await place(env, pasted.widget, until);
      await until(() => back.querySelector('textarea') === t, 3000);
      assert.equal(t.value, READER);
    } finally {
      env.uninstall();
    }
  });

  // the re-review of #91, 11 Oct 2026: a graph written over two blocks, so the block that comes to the line is the same graph
  test('of a graph written over two blocks, never goes to the graph’s other block when that comes to its line', async () => {
    const more = "// graph: reader\n(small:Option {name: 'Small reader'}),\n(small)-[:ANSWERS]->(q)";
    const note = ['# Reader', '', fence(READER), '', fence(more), ''].join('\n');
    const env = await load({ files: { [PATH]: note } });
    try {
      const view = openNote(env, note, PATH);
      const [a1] = cardsOf(view.state);
      const dom = await place(env, a1.widget, until);
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      const editor = env.plugin.inlineFor(PATH, 2);
      const cut = fence(READER) + '\n\n';
      view.dispatch({ changes: { from: note.indexOf(cut), to: note.indexOf(cut) + cut.length } });
      a1.widget.destroy(dom);
      dom.remove();
      // compared by identity: a failing equal on an editor would print the whole plugin and page
      assert.ok(env.plugin.inlineFor(PATH, 2) === undefined, 'A2, now on A1’s line, has no editor');
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\n' + fence(READER) + '\n' } });
      const pasted = cardsOf(view.state).find((c) => c.line !== 2);
      await env.app.vault.modify({ path: PATH }, view.state.doc.toString());
      await until(() => editor.session.ref.line === pasted.line, 2000);
      assert.ok(env.plugin.inlineFor(PATH, 2) === undefined, 'A2 still has none');
      assert.ok(env.plugin.inlineFor(PATH, pasted.line) === editor, 'A1, pasted and saved, has its editor');
    } finally {
      await closeAll(env);
      env.uninstall();
    }
  });
});

describe('an editor in place that outlives its note is released', () => {
  test('its card scrolled away, then its note closed: the editor goes, with every listener it had', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const listening = env.state.listening(),
        watching = env.plugin.settingsWatchers.size;
      const view = openNote(env, NOTE, PATH);
      const [card] = cardsOf(view.state);
      const dom = await place(env, card.widget, until);
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      // scrolled far away: the card is taken down, while the note stays open
      card.widget.destroy(dom);
      dom.remove();
      await wait(1200);
      assert.equal(env.plugin.inline.size, 1, 'kept while the note is open');
      // the note closed: its editor goes, and no card is left on the page to go with it
      view.close();
      await until(() => env.plugin.inline.size === 0, 3000);
      assert.equal(env.state.listening(), listening, 'no listener left on the vault');
      assert.equal(env.plugin.settingsWatchers.size, watching, 'nor on the settings');
    } finally {
      await closeAll(env);
      env.uninstall();
    }
  });

  test('Edit here on a card drawn before its note was renamed: no editor is left behind, and it says why', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      await env.app.vault.rename(env.app.vault.getFileByPath(PATH), 'Renamed.md');
      const listening = env.state.listening();
      labelled(el, 'Edit here').click();
      await until(() => env.state.notices.some((n) => /not there any more/.test(n)), 2000);
      assert.equal(env.plugin.inline.size, 0, 'no editor kept');
      assert.ok(env.plugin.inlineFor(PATH, 2) === undefined, 'and no editor is found for the card');
      assert.equal(env.state.listening(), listening, 'and no listener left on the vault');
    } finally {
      env.uninstall();
    }
  });

  // the third review of #91, 11 Oct 2026: an opening whose read failed was never released, and every later press waited
  // on it, so Edit here on the block did nothing until Obsidian was reloaded
  test('Edit here when the note cannot be read: it says so, keeps no editor, and a later press opens one', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      const listening = env.state.listening();
      const read = env.app.vault.read;
      let failing = true;
      env.app.vault.read = async (f) => {
        if (failing) throw new Error('the disk could not be read');
        return read(f);
      };
      labelled(el, 'Edit here').click();
      await until(() => env.state.notices.some((n) => /could not be read/.test(n)), 2000);
      await until(() => env.plugin.inline.size === 0, 2000);
      assert.equal(env.state.listening(), listening, 'no listener left on the vault');
      failing = false;
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'), 3000);
      assert.equal(el.querySelector('textarea').value, READER);
    } finally {
      await closeAll(env);
      env.uninstall();
    }
  });

  test('the note open in two editing views: one closed, the editor stays for the other', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const one = openNote(env, NOTE, PATH);
      openNote(env, NOTE, PATH);
      const [card] = cardsOf(one.state);
      const dom = await place(env, card.widget, until);
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      // the first view closed, with its card
      one.close();
      card.widget.destroy(dom);
      dom.remove();
      await wait(1300);
      assert.equal(env.plugin.inline.size, 1, 'kept, its note still open in the other view');
    } finally {
      await closeAll(env);
      env.uninstall();
    }
  });

  test('Edit here on a note with no graph block: no editor is left behind', async () => {
    const env = await load({ files: { 'Plain.md': '# Plain\n\nNo graph here.\n' } });
    try {
      const listening = env.state.listening();
      const slot = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      await env.plugin.editHere({ path: 'Plain.md', line: 0, graph: 'reader' }, slot);
      assert.equal(env.plugin.inline.size, 0, 'no editor kept');
      assert.equal(env.state.listening(), listening, 'and no listener left on the vault');
      assert.match(slot.textContent, /no graph block to edit/, 'and the card says why');
    } finally {
      env.uninstall();
    }
  });
});

describe('an editor in place is released with its card', () => {
  test('its note closed, the editor whose card is gone is closed as Done closes it: typing written, no listener left', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const listening = env.state.listening();
      const view = openNote(env, NOTE, PATH);
      const [card] = cardsOf(view.state);
      const dom = await place(env, card.widget, until);
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      const t = dom.querySelector('textarea');
      t.value = READER + ',\n(closed:Option)';
      t.dispatch('input');
      // the note closed: its editor goes, then its cards
      env.plugin.editorViews.delete(view);
      card.widget.destroy(dom);
      dom.remove();
      await until(() => env.plugin.inline.size === 0, 3000);
      await until(() => env.state.files.get(PATH).includes('(closed:Option)'), 2000);
      assert.equal(env.state.listening(), listening, 'no listener left on the vault');
    } finally {
      env.uninstall();
    }
  });

  test('a card that leaves while its note stays open keeps its editor, to come back in the card drawn next', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const view = openNote(env, NOTE, PATH);
      const [card] = cardsOf(view.state);
      const dom = await place(env, card.widget, until);
      labelled(dom, 'Edit here').click();
      await until(() => !!dom.querySelector('textarea'));
      const t = dom.querySelector('textarea');
      card.widget.destroy(dom);
      dom.remove();
      await wait(1300);
      assert.equal(env.plugin.inline.size, 1);
      const again = await place(env, cardsOf(view.state)[0].widget, until);
      await until(() => again.querySelector('textarea') === t, 3000);
    } finally {
      env.uninstall();
    }
  });

  test('after Done, the editor listens to the vault no more: a rename then changes nothing of it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const listening = env.state.listening();
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const editor = env.plugin.inlineFor(PATH, 2);
      assert.ok(env.state.listening() > listening, 'open, it listens');
      labelled(el, 'Done').click();
      await until(() => !el.querySelector('textarea'));
      assert.equal(env.state.listening(), listening, 'closed, it listens no more');
      await env.app.vault.rename(env.app.vault.getFileByPath(PATH), 'Renamed.md');
      assert.equal(editor.path, PATH, 'and does not follow the note');
    } finally {
      env.uninstall();
    }
  });
});

describe('Edit here pressed again while the editor opens', () => {
  test('into a newer card: the editor goes there once it is made, never half made, and has the focus', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      // the note is slow to read, so the second press comes while the first is still opening the editor
      const read = env.app.vault.read;
      env.app.vault.read = async (f) => {
        await wait(100);
        return read(f);
      };
      const first = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const second = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const target = { path: PATH, line: 2, graph: 'reader' };
      const opening = env.plugin.editHere(target, first);
      const again = env.plugin.editHere(target, second);
      assert.equal(second.textContent, '', 'nothing is put in the newer card while the editor is still being made');
      await Promise.all([opening, again]);
      assert.equal(env.plugin.inline.size, 1, 'one editor');
      assert.ok(second.querySelector('textarea'), 'in the newer card');
      assert.ok(first.querySelector('textarea') === null, 'and not left in the first');
      assert.ok(env.doc.activeElement === second.querySelector('textarea'), 'with the focus');
      assert.doesNotMatch(second.textContent, /no graph block/);
    } finally {
      env.uninstall();
    }
  });
});
