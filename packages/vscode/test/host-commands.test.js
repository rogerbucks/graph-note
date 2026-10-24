// The extension's commands go through the plug-in interface (spec §43, plugin_interface): VS Code is given each under
// the id it always had, and a command that fails is named in a message rather than lost.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanUpVscode, emptyFolder, vscodeOn } from './vscode-window.js';

after(cleanUpVscode);

test('VS Code is given the two commands under the ids its menus and keys name', async () => {
  const vs = await vscodeOn(emptyFolder(), 'Reader.md');
  assert.deepEqual([...vs.commands.keys()].sort(), ['thoughtknot.askAi', 'thoughtknot.openGraph']);
});

test('a command that fails is said in an error message, and does not throw into VS Code', async () => {
  const vs = await vscodeOn(emptyFolder(), 'Reader.md');
  vs.vscode.window.createWebviewPanel = () => {
    throw new Error('cannot read');
  };
  await vs.open();
  assert.equal(vs.said.length, 1);
  assert.match(vs.said[0], /cannot read/);
});
