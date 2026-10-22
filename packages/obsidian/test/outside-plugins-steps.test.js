// A graph step a plug-in from outside adds, run in Obsidian (editor spec §20, plugin_step_named; §54). A step block
// names `example.sample.chain` and what it takes. With the sample plug-in on, Run asks it, and the links it gives back
// are written beside the graph as a proposal, the graph untouched. With it off, Run says no plug-in adds the step.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until } from './host/load-plugin.js';
import { installWorkers } from './host/workers.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());
let workers;
before(() => (workers = installWorkers()));
after(() => workers.uninstall());

const SAMPLE = readFileSync(new URL('../../../examples/sample-plugin/plugin.js', import.meta.url), 'utf8');
const PATH = 'Some note.md';
const TRIP = "// graph: trip\n(home:Place {name: 'Home'}),\n(park:Place {name: 'The park'})";
const STEP = '// graph: trip · QUERY step example.sample.chain\n// takes places: (:Place)';
const note = ['# Trip', '', fence(TRIP), '', fence(STEP), ''].join('\n');
const files = { [PATH]: note, 'ThoughtKnot plug-ins/sample.js': SAMPLE };

/** The step's card, with the sample plug-in turned on when `on`. */
async function stepCard(on) {
  const env = await load({ files });
  if (on) {
    await env.state.settingTabs[0].setControlValue('outside.sample.js', true);
    await until(() => (env.state.commands ?? []).some((c) => c.id === 'example.sample.hello'));
  }
  const { el } = await show(env, note, 1);
  return { env, el };
}

describe('a step a plug-in from outside adds, in Obsidian (plugin_step_named)', () => {
  test('turned on, Run asks the plug-in, and its links are written beside the graph as a proposal', async () => {
    const { env, el } = await stepCard(true);
    try {
      labelled(el, 'Run step example.sample.chain').click();
      await until(() => env.state.files.get(PATH).includes('CHANGE SET'));
      const now = env.state.files.get(PATH);
      assert.match(now, /\/\/ graph: trip · CHANGE SET example_sample_chain_1 .* by example_sample_chain/);
      assert.match(now, /\(home\)-\[:NEXT\]->\(park\)/);
      assert.ok(now.startsWith(['# Trip', '', fence(TRIP)].join('\n')), 'the graph untouched');
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });

  test('with the plug-in off, Run says no plug-in adds the step, and writes nothing', async () => {
    const { env, el } = await stepCard(false);
    try {
      labelled(el, 'Run step example.sample.chain').click();
      await until(() =>
        el.querySelector('.thoughtknot-step-said [role="alert"], .thoughtknot-step-said .thoughtknot-banner'),
      );
      assert.match(el.querySelector('.thoughtknot-step-said').textContent, /no plug-in that is turned on adds it/);
      assert.equal(env.state.files.get(PATH), note);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });
});
