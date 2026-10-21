// Plug-ins from outside ThoughtKnot in Obsidian (spec §54, plugin_outside_file; API-10), as the built plugin loads them.
// A file in the vault folder `ThoughtKnot plug-ins`, or one added from a link, stays off until the person turns it on.
// Turned on, it runs in a worker from main.js's own sealing bundle, and its commands join Obsidian's. A file that
// changes after it was turned on is turned off and said.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until } from './host/load-plugin.js';
import { installWorkers } from './host/workers.js';
import { findsNetwork, read, sourceFiles } from '../../../test/repository/repo.js';

before(() => build());
let workers;
before(() => (workers = installWorkers()));
after(() => workers.uninstall());

const SAMPLE = readFileSync(new URL('../../../examples/sample-plugin/plugin.js', import.meta.url), 'utf8');
const FILE = 'ThoughtKnot plug-ins/sample.js';
const HELLO = 'example.sample.hello';

/** The plugin loaded with `files`, `data` and `reply` for the link; its settings tab, and the ids of its commands. */
async function loaded({ files = { [FILE]: SAMPLE }, data = null, reply } = {}) {
  const env = await load({ files, data });
  env.state.reply = reply;
  const tab = env.state.settingTabs[0];
  const commands = () => (env.state.commands ?? []).map((c) => c.id);
  const rows = () => JSON.stringify(tab.getSettingDefinitions());
  return { ...env, tab, commands, rows };
}

describe('plug-ins from outside, in Obsidian (plugin_outside_file)', () => {
  test('a file in the folder is offered off, and adds nothing until it is turned on', async () => {
    const { tab, commands, rows, plugin, uninstall } = await loaded();
    try {
      assert.match(rows(), /Plug-ins from outside/);
      assert.match(rows(), /"key":"outside\.sample\.js"/);
      assert.equal(tab.getControlValue('outside.sample.js'), false);
      assert.ok(!commands().includes(HELLO));
    } finally {
      plugin.onunload();
      uninstall();
    }
  });

  test('turned on, it runs apart and its command joins Obsidian’s; turned off, the command goes', async () => {
    const { tab, commands, state, plugin, uninstall } = await loaded();
    try {
      await tab.setControlValue('outside.sample.js', true);
      await until(() => commands().includes(HELLO));
      assert.equal(tab.getControlValue('outside.sample.js'), true);
      assert.match(state.data.outside['sample.js'].sha, /^[0-9a-f]{64}$/);
      await tab.setControlValue('outside.sample.js', false);
      assert.ok(!commands().includes(HELLO));
      assert.deepEqual(state.data.outside, {});
    } finally {
      plugin.onunload();
      uninstall();
    }
  });

  test('a file that changed since it was turned on is turned off, and said', async () => {
    const data = { outside: { 'sample.js': { sha: '0'.repeat(64) } } };
    const { commands, state, plugin, uninstall } = await loaded({ data });
    try {
      await until(() => state.notices.some((n) => /changed since you turned it on/.test(n)));
      assert.deepEqual(state.data.outside, {});
      assert.ok(!commands().includes(HELLO));
    } finally {
      plugin.onunload();
      uninstall();
    }
  });

  test('a file that imports other code is not turned on, and says why', async () => {
    const files = { [FILE]: `import x from 'https://e.com/x.js';\n${SAMPLE}` };
    const { tab, state, plugin, uninstall } = await loaded({ files });
    try {
      await tab.setControlValue('outside.sample.js', true);
      assert.ok(state.notices.some((n) => /was not turned on: it imports other code/.test(n)));
      assert.equal(state.data?.outside?.['sample.js'], undefined);
    } finally {
      plugin.onunload();
      uninstall();
    }
  });

  test('a link is fetched once, checked and kept in the folder, off; only https is taken', async () => {
    const reply = async () => ({ status: 200, text: SAMPLE });
    const { tab, state, plugin, uninstall } = await loaded({ files: {}, reply });
    const add = () => addRow(tab).action();
    try {
      await tab.setControlValue('outside-link', 'http://e.com/sample.js');
      add();
      await until(() => state.notices.some((n) => /Not added: that is not an address starting https/.test(n)));
      await tab.setControlValue('outside-link', 'https://e.com/plug-ins/sample.js');
      add();
      await until(() => state.files.has(FILE));
      assert.equal(state.files.get(FILE), SAMPLE);
      assert.equal(state.requests.length, 1);
      assert.equal(tab.getControlValue('outside.sample.js'), false);
    } finally {
      plugin.onunload();
      uninstall();
    }
  });
});

describe('the one fetch of plug-ins from outside (offline_and_mobile_apis)', () => {
  test('the link module fetches, and only the plug-ins from outside reach it, when Add is pressed', () => {
    assert.ok(findsNetwork(read('packages/obsidian/src/outside/outside-link.ts')));
    const reaching = sourceFiles().filter((f) => /from '\.\/outside-link'|outside\/outside-link'/.test(read(f)));
    assert.deepEqual(reaching, ['packages/obsidian/src/outside/outside-plugins.ts']);
  });
});

/** The settings row that adds a plug-in from the link typed in. */
function addRow(tab) {
  const group = tab.getSettingDefinitions().find((g) => g.heading === 'Plug-ins from outside');
  return group.items.find((i) => i.name === 'Add');
}
