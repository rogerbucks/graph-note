// A graph drawn from a plug-in's source in Obsidian (editor spec §20, plugin_source_from; §54, plugin_outside_file). A
// block written `· FROM sample:trip` asks the plug-in from outside that adds the source `sample`, once it is turned on.
// Its card draws what the plug-in gave, named on its strip. With the plug-in off, the block says so and draws nothing.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until } from './host/load-plugin.js';
import { installWorkers } from './host/workers.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());
let workers;
before(() => (workers = installWorkers()));
after(() => workers.uninstall());

const SAMPLE = readFileSync(new URL('../../../examples/sample-plugin/plugin.js', import.meta.url), 'utf8');
const note = ['# Trip', '', fence('// graph: trip · FROM sample:trip'), ''].join('\n');
const files = { 'Some note.md': note, 'ThoughtKnot plug-ins/sample.js': SAMPLE };
const keys = (el) => el.querySelectorAll('g.node').map((g) => g.getAttribute('data-key'));

describe('a block drawn from a plug-in’s source, in Obsidian (plugin_source_from)', () => {
  test('draws the graph the plug-in turned on gives, and names the source on its strip', async () => {
    const env = await load({ files });
    try {
      await env.state.settingTabs[0].setControlValue('outside.sample.js', true);
      await until(() => (env.state.commands ?? []).some((c) => c.id === 'example.sample.hello'));
      const { el } = await show(env, note, 0);
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['start', 'end']);
      assert.match(el.querySelector('.thoughtknot-source').textContent, /Drawn from the plug-in source sample:trip/);
      assert.equal(el.querySelector('.thoughtknot-source button'), null);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });

  test('with the plug-in off, says so and draws nothing', async () => {
    const env = await load({ files });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(
        el.querySelector('[role="alert"]').textContent,
        /No plug-in that is turned on reads sample: sources/,
      );
      assert.equal(el.querySelector('svg'), null);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });
});
