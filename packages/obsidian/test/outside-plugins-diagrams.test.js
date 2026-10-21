// A diagram type a plug-in from outside adds, drawn in Obsidian (editor spec §15, plugin_diagram_type_named; §54). A
// style graph chooses `example.sample.row`. With the sample plug-in on, the card shows the core's picture of its marks,
// never laid out by Graphviz. It says which plug-in drew it. With it off, the graph is a network, and
// the strip says which plug-in draws that type.
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
const TRIP =
  "// graph: trip\n(home:Place {name: 'Home'}),\n(park:Place {name: 'The <b>park</b>'}),\n(home)-[:NEAR]->(park)";
const ROW = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'example.sample.row'})";
const note = ['# Trip', '', fence(TRIP), '', fence(ROW), ''].join('\n');
const files = { 'Some note.md': note, 'ThoughtKnot plug-ins/sample.js': SAMPLE };

/** The plugin loaded, with the sample turned on when `on`, and every drawing it was asked to lay out. */
async function loaded(on) {
  const env = await load({ files });
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing);
    return layout(drawing, owner);
  };
  if (on) {
    await env.state.settingTabs[0].setControlValue('outside.sample.js', true);
    await until(() => (env.state.commands ?? []).some((c) => c.id === 'example.sample.hello'));
  }
  return { env, asked };
}

describe('a diagram type a plug-in from outside adds, in Obsidian (plugin_diagram_type_named)', () => {
  test('turned on, it draws the graph as the core’s picture of its marks, and says which plug-in drew it', async () => {
    const { env, asked } = await loaded(true);
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('.thoughtknot-plugin-picture svg'));
      const picture = el.querySelector('.thoughtknot-plugin-picture');
      assert.deepEqual(
        picture.querySelectorAll('[data-thing]').map((g) => g.getAttribute('data-thing')),
        ['home', 'park'],
      );
      assert.equal(picture.querySelector('b'), null, 'a label’s markup is drawn as text');
      assert.equal(asked.length, 0, 'nothing laid out by Graphviz');
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /example\.sample\.row.*example\.sample/);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });

  test('with the plug-in off, the graph is a network, and the strip says which plug-in draws that type', async () => {
    const { env } = await loaded(false);
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('svg g.node'));
      assert.equal(el.querySelector('.thoughtknot-plugin-picture'), null);
      assert.match(el.querySelector('.thoughtknot-type-plugin').textContent, /comes from the plug-in example\.sample/);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });
});
