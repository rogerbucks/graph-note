// Nothing the plugin offers in reading view changes the note (spec §3, reading_view_whole_note; Roger, 11 Oct 2026): a
// command that would rewrite a note acts only on the note in the pane in front, and refuses, saying why, while that pane
// is in reading view or holds no note. Another pane showing the note decides nothing, and an edit pane keeps saving
// while another pane reads the note.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';

before(() => build());

const PATH = 'Slip.md';
const SLIP = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'})";
const NOTE = `# Slip\n\n${fence(SLIP)}\n`;
const CONVERTED = NOTE.replace("(a:T {text: 'A'})\n", "(a:T {text: 'A'}),\n");
const REFUSED =
  'This note is shown in reading view, which never changes it: switch to Live Preview or Source mode to convert it to standard GQL.';
const NO_NOTE = 'The pane in front holds no note: open a note to convert it to standard GQL.';

/** The plugin, with the note last made active, as Obsidian's getActiveFile still gives it when a pane of another kind is in front. */
async function loaded() {
  const env = await load({ files: { [PATH]: NOTE } });
  env.state.active = PATH;
  return env;
}

/** A pane showing the note in `mode` ('preview' is reading view, 'source' Live Preview or Source mode); in front when asked. */
function pane(env, mode, { front = false } = {}) {
  const leaf = new env.obsidian.WorkspaceLeaf(env.app);
  leaf.view = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, mode);
  env.app.workspace.leaves.push(leaf);
  if (front) env.state.activeView = leaf.view;
  return leaf;
}
const convert = (env) => env.state.commands.find((c) => c.id === 'convert-to-standard');

describe('a command that would rewrite a note refuses while it is shown in reading view', () => {
  test('Convert this note to standard GQL leaves it as it is, and the notice says why', async () => {
    const env = await loaded();
    try {
      pane(env, 'preview', { front: true });
      await convert(env).callback();
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(env.state.notices.at(-1), REFUSED);
    } finally {
      env.uninstall();
    }
  });

  test('the same action on the settings page refuses too', async () => {
    const env = await loaded();
    try {
      pane(env, 'preview', { front: true });
      const tab = env.state.settingTabs[0];
      tab.display();
      labelled(tab.containerEl, 'Convert to standard GQL').click();
      await wait(50);
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(env.state.notices.at(-1), REFUSED);
    } finally {
      env.uninstall();
    }
  });

  test('no command of the plugin changes a note shown in reading view', async () => {
    const env = await loaded();
    try {
      const front = pane(env, 'preview', { front: true });
      assert.ok(env.state.commands.length >= 1, 'the plugin has commands');
      for (const c of env.state.commands) {
        await (c.callback?.() ?? c.checkCallback?.(false) ?? c.editorCallback?.(front.view.editor, front.view));
        assert.equal(env.state.files.get(PATH), NOTE, `${c.name} left the note as it is`);
      }
    } finally {
      env.uninstall();
    }
  });

  test('a note in Live Preview or Source mode still converts', async () => {
    const env = await loaded();
    try {
      pane(env, 'source', { front: true });
      await convert(env).callback();
      assert.equal(env.state.files.get(PATH), CONVERTED);
      assert.match(env.state.notices.at(-1) ?? '', /Converted 1 departure/);
    } finally {
      env.uninstall();
    }
  });
});

describe('the pane in front is checked again just before the write', () => {
  /** Converts with the pane in front changed once the note has been read, before it is written. */
  async function convertWhile(env, change) {
    const read = env.app.vault.read;
    env.app.vault.read = async (f) => {
      const text = await read(f);
      change();
      return text;
    };
    await convert(env).callback();
  }

  test('a pane switched to reading view after the note was read is not written, and the notice says why', async () => {
    const env = await loaded();
    try {
      const front = pane(env, 'source', { front: true });
      await convertWhile(env, () => (front.view.mode = 'preview'));
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(env.state.notices.at(-1), REFUSED);
    } finally {
      env.uninstall();
    }
  });

  test('a different pane in front by then, or none holding a note, is not written either', async () => {
    for (const [change, notice] of [
      [(env) => (env.state.activeView = null), NO_NOTE],
      [(env) => pane(env, 'source', { front: true }), /pane in front changed/],
    ]) {
      const env = await loaded();
      try {
        pane(env, 'source', { front: true });
        await convertWhile(env, () => change(env));
        assert.equal(env.state.files.get(PATH), NOTE);
        assert.match(env.state.notices.at(-1) ?? '', notice instanceof RegExp ? notice : new RegExp(notice));
      } finally {
        env.uninstall();
      }
    }
  });
});

describe('the pane in front decides', () => {
  test('open in two panes, the one in front decides: Live Preview converts, reading view refuses', async () => {
    for (const [behind, front, expected, notice] of [
      ['preview', 'source', CONVERTED, /Converted 1 departure/],
      ['source', 'preview', NOTE, /reading view/],
    ]) {
      const env = await loaded();
      try {
        pane(env, behind);
        pane(env, front, { front: true });
        await convert(env).callback();
        assert.equal(env.state.files.get(PATH), expected, `${front} in front, ${behind} behind`);
        assert.match(env.state.notices.at(-1) ?? '', notice);
      } finally {
        env.uninstall();
      }
    }
  });

  test('with the edit pane in front, the note last active is not converted, though Obsidian still names it', async () => {
    const env = await loaded();
    try {
      pane(env, 'source');
      await env.app.workspace.getLeaf('split', 'vertical').setViewState({ type: 'graph-note-pane', state: {} });
      env.state.activeView = null; // the edit pane is not a Markdown view
      assert.equal(env.app.workspace.getActiveFile()?.path, PATH, 'Obsidian still gives the last note');
      await convert(env).callback();
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(env.state.notices.at(-1), NO_NOTE);
    } finally {
      env.uninstall();
    }
  });

  test('with no note in the pane in front (a canvas, a PDF, an empty tab), nothing is converted', async () => {
    const env = await loaded();
    try {
      env.state.activeView = null;
      await convert(env).callback();
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(env.state.notices.at(-1), NO_NOTE);
    } finally {
      env.uninstall();
    }
  });

  test('an edit pane keeps saving while another pane shows the note in reading view', async () => {
    const env = await loaded();
    try {
      pane(env, 'preview', { front: true });
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'g' });
      const t = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl.querySelector('textarea');
      t.value = `${SLIP},`;
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes(`${SLIP},`), 2000);
    } finally {
      env.uninstall();
    }
  });
});
