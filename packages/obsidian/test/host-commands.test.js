// Obsidian's own commands, added through the plug-in interface (editor spec §43, plugin_interface). Each reaches
// Obsidian's command list under the word it always had, so a key a person gave it stays theirs. A command that is offered
// only while a drawing is in use stays so.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';

before(() => build());

/** The ids of the commands the plugin added, sorted. */
const ids = (env) => env.state.commands.map((c) => c.id).sort();

describe('Obsidian’s commands', () => {
  // proves: plugin_interface
  test('each keeps the word it always had, with the drawing’s commands and the tour offered only while a drawing is in use', async () => {
    const env = await load({});
    try {
      assert.deepEqual(ids(env), [
        'ask-ai-model',
        'clear-ai-sends',
        'convert-to-standard',
        'fit',
        'full-screen',
        'import-from-database',
        'recover-drafts',
        'shortcuts',
        'tour',
        'zoom-in',
        'zoom-out',
      ]);
      for (const id of ['fit', 'full-screen', 'tour', 'zoom-in', 'zoom-out']) {
        const command = env.state.commands.find((c) => c.id === id);
        assert.equal(typeof command.checkCallback, 'function', `${id} is offered only while a drawing is in use`);
        assert.equal(command.checkCallback(true), false, `${id} is not offered with no drawing in use`);
      }
      for (const id of ['ask-ai-model', 'convert-to-standard', 'recover-drafts', 'shortcuts'])
        assert.equal(typeof env.state.commands.find((c) => c.id === id).callback, 'function', id);
    } finally {
      env.uninstall();
    }
  });
});
