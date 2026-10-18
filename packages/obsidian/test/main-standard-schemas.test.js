// The standard schemas in the plugin (editor spec §27, standard_schemas, schema_named_found). A graph that names one is
// typed by it with no schema in the note or the vault. A graph that names a schema there is none of is warned of.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DECISION = `// graph: reader · schema decision@1
(question:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)`;
const TRIP = `// graph: trip · schema places@2
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const noteOf = (block) => ['# A note', '', fence(block), ''].join('\n');

async function drawn(block) {
  const note = noteOf(block);
  const env = await load({ files: { [PATH]: note } });
  env.state.files.set(PATH, note);
  const { el } = await show(env, note, 0);
  return { env, el };
}

describe('a standard schema named by a graph', () => {
  test('types it with nothing else in the vault: its links are read in the schema’s words, and nothing is wrong', async () => {
    const { env, el } = await drawn(DECISION);
    try {
      assert.match(el.querySelector('svg').textContent, /favours/);
      assert.doesNotMatch(el.textContent, /is not in the vault/);
    } finally {
      env.uninstall();
    }
  });

  test('a schema that is not there is warned of, naming it', async () => {
    const { env, el } = await drawn(TRIP);
    try {
      assert.ok(el.querySelector('svg'), 'still drawn');
      assert.match(el.textContent, /places@2 is not in the vault or the standard schemas/);
    } finally {
      env.uninstall();
    }
  });
});
