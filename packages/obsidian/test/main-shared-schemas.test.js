// The shared schemas the plugin finds in the vault (editor spec §5). Each note is read to find them. A note named as
// people name them, with a `?` or dots before `.md`, is read like any other. A note that cannot be read is skipped, so
// one bad note never stops a graph from drawing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const ODD = '+Contacts as a single source of truth/Best Contact manager for gmail? I want to get con....md';
const SHARED = `// graph: shared · SCHEMA places@1
(t1:Meta:ElementType {name: 'Place', kind: 'node'}),
(t2:Meta:ElementType {name: 'NEAR', kind: 'edge', reading: 'is near', reverse_name: 'is near'})`;
const TRIP = `// graph: trip · schema places@1
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const noteOf = (block) => ['# A note', '', fence(block), ''].join('\n');

async function drawn(files) {
  const note = noteOf(TRIP);
  const env = await load({ files: { ...files, [PATH]: note } });
  env.state.files.set(PATH, note);
  const { el } = await show(env, note, 0);
  return { env, el };
}

describe('shared schemas in the vault', () => {
  test('one in a note named with a `+`, a `?` and dots before `.md` is found, and the graph is drawn with no error', async () => {
    const { env, el } = await drawn({ [ODD]: noteOf(SHARED) });
    try {
      assert.ok(el.querySelector('svg'), 'drawn');
      assert.doesNotMatch(el.textContent, /is not in the vault/);
    } finally {
      env.uninstall();
    }
  });

  test('a note whose path cannot be read is skipped, and the graph is still drawn', async () => {
    const { env, el } = await drawn({ 'Bad: name.md': '# bad\n', 'Places.md': noteOf(SHARED) });
    try {
      assert.ok(el.querySelector('svg'), 'drawn');
      assert.doesNotMatch(el.textContent, /is not in the vault/);
    } finally {
      env.uninstall();
    }
  });
});
