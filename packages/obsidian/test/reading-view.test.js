// A note shown in reading view is never changed by the plugin (spec §3, reading_view_whole_note; Roger, 11 Oct 2026): a
// command that would rewrite the note in front refuses while it is shown in reading view, and says why and what to do.
// The note in Live Preview or Source mode is changed as before.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';

before(() => build());

const PATH = 'Slip.md';
const SLIP = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'})";
const NOTE = `# Slip\n\n${fence(SLIP)}\n`;
const CONVERTED = NOTE.replace("(a:T {text: 'A'})\n", "(a:T {text: 'A'}),\n");

/** The plugin, with the note in front shown in `mode`: 'preview' is reading view, 'source' Live Preview or Source mode. */
async function inFront(mode) {
  const env = await load({ files: { [PATH]: NOTE } });
  env.state.active = PATH;
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, mode);
  return env;
}
const convert = (env) => env.state.commands.find((c) => c.id === 'convert-to-standard');

describe('a command that would rewrite a note refuses while it is shown in reading view', () => {
  test('Convert this note to standard GQL leaves it as it is, and the notice says why', async () => {
    const env = await inFront('preview');
    try {
      await convert(env).callback();
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.equal(
        env.state.notices.at(-1),
        'This note is shown in reading view, which never changes it: switch to Live Preview or Source mode to convert it.',
      );
    } finally {
      env.uninstall();
    }
  });

  test('the same action on the settings page refuses too', async () => {
    const env = await inFront('preview');
    try {
      const tab = env.state.settingTabs[0];
      tab.display();
      labelled(tab.containerEl, 'Convert to standard GQL').click();
      await wait(50);
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.match(env.state.notices.at(-1) ?? '', /reading view/);
    } finally {
      env.uninstall();
    }
  });

  test('no command of the plugin changes a note shown in reading view', async () => {
    const env = await inFront('preview');
    try {
      assert.ok(env.state.commands.length >= 1, 'the plugin has commands');
      for (const c of env.state.commands) {
        await (c.callback?.() ??
          c.checkCallback?.(false) ??
          c.editorCallback?.(env.state.activeView.editor, env.state.activeView));
        assert.equal(env.state.files.get(PATH), NOTE, `${c.name} left the note as it is`);
      }
    } finally {
      env.uninstall();
    }
  });

  test('a note in Live Preview or Source mode still converts', async () => {
    const env = await inFront('source');
    try {
      await convert(env).callback();
      assert.equal(env.state.files.get(PATH), CONVERTED);
      assert.match(env.state.notices.at(-1) ?? '', /Converted 1 departure/);
    } finally {
      env.uninstall();
    }
  });
});
