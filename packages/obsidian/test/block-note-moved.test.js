// The note behind a block editor renamed or deleted while its block is edited (spec §9, nothing_typed_lost; slice 2's
// end-of-slice review, 11 Oct 2026: "text typed after the note is renamed or deleted is lost silently"). Renamed or
// moved, the editor follows the note, so what is typed keeps reaching it; deleted, what is typed is kept as a draft, and
// the editor says so. In the pane and in place alike.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
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
      // compared by its text and when it was kept: the draft is also given an id of its own when it is first read
      assert.deepEqual(Object.keys(drafts(env)), [`${MOVED}#reader`]);
      const moved = drafts(env)[`${MOVED}#reader`];
      assert.deepEqual([moved.text, moved.kept], [kept.text, kept.kept]);
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
      const banner = env.el.querySelector('.thoughtknot-draft');
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

// the third review of #91, 11 Oct 2026: after a rename, an editor took the block's first draft for its own, so Restore
// and Discard deleted another's draft, and its next refused write kept a stale copy beside its own
describe('an editor’s own draft, after its note is renamed', () => {
  const OLD = { text: READER + ',\n(old:Reason)', kept: '2026-10-10T08:00:00.000Z' };
  /** The pane on a note that already keeps the draft "old"; "new" typed and refused, so kept beside it; then renamed. */
  async function keptThenRenamed() {
    const env = await open({ data: { drafts: { [`${PATH}#reader`]: OLD } } });
    type(env.el, READER + ',\n(new:Reason)');
    await env.app.vault.modify({ path: PATH }, NOTE.replace(READER, READER + ',\n(theirs:Reason)'));
    await until(() => Object.keys(drafts(env)).length === 2, 2000);
    await rename(env, PATH, MOVED);
    await until(() => Object.keys(drafts(env)).every((k) => k.startsWith(MOVED)), 2000);
    return env;
  }
  const texts = (env) => Object.values(drafts(env)).map((d) => d.text);

  test('Restore brings back its own draft, and leaves the other kept', async () => {
    const env = await keptThenRenamed();
    try {
      const banner = env.el.querySelector('.thoughtknot-draft');
      labelled(banner, 'Restore draft').click();
      assert.equal(textarea(env.el).value, READER + ',\n(new:Reason)');
      await until(() => Object.keys(drafts(env)).length === 1, 2000);
      assert.deepEqual(texts(env), [OLD.text], 'the other draft is still kept');
    } finally {
      env.uninstall();
    }
  });

  test('Discard forgets only its own draft', async () => {
    const env = await keptThenRenamed();
    try {
      labelled(env.el.querySelector('.thoughtknot-draft'), 'Discard draft').click();
      await until(() => Object.keys(drafts(env)).length === 1, 2000);
      assert.deepEqual(texts(env), [OLD.text]);
    } finally {
      env.uninstall();
    }
  });

  test('its next refused write keeps its draft where it was, with no stale copy beside it', async () => {
    const env = await keptThenRenamed();
    try {
      type(env.el, textarea(env.el).value + ',\n(newer:Reason)');
      const now = env.state.files.get(MOVED);
      await env.app.vault.modify({ path: MOVED }, now.replace('(theirs:Reason)', '(theirs:Reason),\n(again:Reason)'));
      await until(() => texts(env).some((t) => t.includes('(newer:Reason)')), 2000);
      assert.equal(Object.keys(drafts(env)).length, 2, 'the other draft and its own, no third');
      assert.ok(texts(env).includes(OLD.text));
    } finally {
      env.uninstall();
    }
  });

  test('the pane and the card, each with its draft: after the rename, the card’s Discard forgets only the card’s', async () => {
    const env = await load({ files: { [card.PATH]: card.NOTE } });
    try {
      await env.plugin.openEditor({ path: card.PATH, line: 2, graph: 'reader' });
      const inPane = env.app.workspace.getLeavesOfType('thoughtknot-pane')[0].view.contentEl;
      const el = await card.show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      type(inPane, card.READER + ',\n(fromPane:Option)');
      const t = el.querySelector('textarea');
      t.value = card.READER + ',\n(fromCard:Option)';
      t.dispatch('input');
      const theirs = card.NOTE.replace(card.READER, card.READER + ',\n(theirs:Option)');
      await env.app.vault.modify({ path: card.PATH }, theirs);
      await until(() => Object.keys(drafts(env)).length === 2, 2000);
      await rename(env, card.PATH, 'Renamed.md');
      await until(() => Object.keys(drafts(env)).every((k) => k.startsWith('Renamed.md')), 2000);
      await until(() => !el.querySelector('.thoughtknot-draft').hidden, 2000);
      labelled(el.querySelector('.thoughtknot-draft'), 'Discard draft').click();
      await until(() => Object.keys(drafts(env)).length === 1, 2000);
      assert.deepEqual(texts(env), [card.READER + ',\n(fromPane:Option)'], 'the pane’s draft is still kept');
    } finally {
      env.uninstall();
    }
  });
});

// the fourth review of #91, 11 Oct 2026, and Roger's choice A: a draft is known by an id kept with it, and the banner's
// buttons act on the very draft they showed, never on whichever draft is found where it was
describe('the banner acts on the draft it showed, and on no other', () => {
  const OLD = { text: card.READER + ',\n(old:Option)', kept: '2026-10-10T08:00:00.000Z' };
  /**
   * "old" kept; the pane and the card both open on the block, both showing it; the pane restores it, so it is no longer
   * kept; the pane's next refused write keeps "P1", where "old" was. The card's banner still shows "old".
   */
  async function oldThenP1() {
    const env = await load({ files: { [card.PATH]: card.NOTE }, data: { drafts: { [`${card.PATH}#reader`]: OLD } } });
    await env.plugin.openEditor({ path: card.PATH, line: 2, graph: 'reader' });
    const inPane = env.app.workspace.getLeavesOfType('thoughtknot-pane')[0].view.contentEl;
    const el = await card.show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea') && !el.querySelector('.thoughtknot-draft').hidden);
    labelled(inPane.querySelector('.thoughtknot-draft'), 'Restore draft').click();
    await until(() => Object.keys(drafts(env)).length === 0, 2000);
    await until(() => env.state.files.get(card.PATH).includes('(old:Option)'), 2000);
    const p1 = card.READER + ',\n(old:Option),\n(p1:Option)';
    type(inPane, p1);
    const theirs = env.state.files.get(card.PATH).replace('(old:Option)', '(old:Option),\n(theirs:Option)');
    await env.app.vault.modify({ path: card.PATH }, theirs);
    await until(() => Object.values(drafts(env)).some((d) => d.text === p1), 2000);
    assert.match(el.querySelector('.thoughtknot-draft').textContent, /draft/, 'the card still offers what it showed');
    return { env, el, p1 };
  }

  test('the card’s Discard of the draft it showed, no longer kept, never deletes the pane’s newer one', async () => {
    const { env, el, p1 } = await oldThenP1();
    try {
      labelled(el.querySelector('.thoughtknot-draft'), 'Discard draft').click();
      await wait(100);
      assert.deepEqual(
        Object.values(drafts(env)).map((d) => d.text),
        [p1],
        'the pane’s draft is still kept',
      );
    } finally {
      env.uninstall();
    }
  });

  test('the card’s Restore of a draft no longer kept says so, and changes no draft and no text', async () => {
    const { env, el, p1 } = await oldThenP1();
    try {
      const t = el.querySelector('textarea'),
        before = t.value;
      labelled(el.querySelector('.thoughtknot-draft'), 'Restore draft').click();
      await wait(100);
      const said = env.state.notices.some((n) => /no longer kept/.test(n));
      assert.ok(said, 'it says the draft is gone');
      assert.equal(t.value, before, 'the text is left as it was');
      assert.deepEqual(
        Object.values(drafts(env)).map((d) => d.text),
        [p1],
      );
    } finally {
      env.uninstall();
    }
  });

  test('two editors that keep the same text keep two drafts, each its own', async () => {
    const env = await load({ files: { [card.PATH]: card.NOTE } });
    try {
      await env.plugin.openEditor({ path: card.PATH, line: 2, graph: 'reader' });
      const inPane = env.app.workspace.getLeavesOfType('thoughtknot-pane')[0].view.contentEl;
      const el = await card.show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const same = card.READER + ',\n(same:Option)';
      type(inPane, same);
      const t = el.querySelector('textarea');
      t.value = same;
      t.dispatch('input');
      await remove(env, card.PATH);
      await until(() => Object.keys(drafts(env)).length === 2, 2000);
      const kept = Object.values(drafts(env));
      assert.deepEqual(
        kept.map((d) => d.text),
        [same, same],
      );
      assert.notEqual(kept[0].id, kept[1].id, 'each with an id of its own');
    } finally {
      env.uninstall();
    }
  });
});

describe('the pane and the editor in place on one block, when the note is deleted', () => {
  // the review of #91, 11 Oct 2026: both wrote the same draft, and the last one written won
  test('both typed in and not yet written: what each typed is kept, neither over the other', async () => {
    const env = await load({ files: { [card.PATH]: card.NOTE } });
    try {
      await env.plugin.openEditor({ path: card.PATH, line: 2, graph: 'reader' });
      const inPane = env.app.workspace.getLeavesOfType('thoughtknot-pane')[0].view.contentEl;
      const el = await card.show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      type(inPane, card.READER + ',\n(fromPane:Option)');
      const t = el.querySelector('textarea');
      t.value = card.READER + ',\n(fromCard:Option)';
      t.dispatch('input');
      await remove(env, card.PATH);
      const kept = () => Object.values(drafts(env)).map((d) => d.text);
      await until(() => kept().length === 2, 2000);
      assert.deepEqual(kept().sort(), [card.READER + ',\n(fromCard:Option)', card.READER + ',\n(fromPane:Option)']);
      // each editor goes on keeping its own as it is typed
      t.value = card.READER + ',\n(fromCard:Option),\n(more:Option)';
      t.dispatch('input');
      await until(() => kept().includes(t.value), 2000);
      assert.equal(kept().length, 2);
      assert.ok(kept().includes(card.READER + ',\n(fromPane:Option)'));
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
