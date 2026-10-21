// The plug-in's command names follow Obsidian's language (editor spec §42, words_catalogue). The plug-in names each
// command once, as it loads. The test loads the built plug-in in a test language and reads the names it gave.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { isPseudoWord, SOURCE_WORDS } from '@thoughtknot/core';
import { build, load } from './host/load-plugin.js';

before(() => build());

/** The name of the command `id`, as the plug-in gave it when loaded in `language`. */
async function commandName(id, language) {
  const env = await load({ language });
  try {
    return env.state.commands.find((c) => c.id === id)?.name;
  } finally {
    env.uninstall();
  }
}

describe('the command names in Obsidian’s language', () => {
  test('the convert command is named in the test language when Obsidian is in it, and in UK English when in English', async () => {
    assert.ok(isPseudoWord(await commandName('convert-to-standard', 'en-XA')), 'in the test language');
    assert.equal(await commandName('convert-to-standard', 'en'), SOURCE_WORDS['host.command.convert']);
  });
});
