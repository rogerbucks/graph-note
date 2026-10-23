// A graph block too big to read at once, opened in parts (editor spec §53, scale_in_parts; way E, step 7). Past the
// read limits the card read nothing before. Now the note is read into the local store a part at a time. The card
// shows the graph's overview from there, above its text and the reason it was not read whole.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';

/** A graph of 12,000 things and their links: 24,000 lines, past the read limit of 20,000. */
function huge() {
  const lines = ['// graph: big'];
  for (let i = 0; i < 12_000; i++) lines.push(`(n${i}:${['Person', 'Place', 'Thing'][i % 3]} {name: 'Item ${i}'}),`);
  for (let i = 1; i < 12_000; i++) lines.push(`(n${i})-[:NEAR]->(n${Math.floor(i / 2)})${i < 11_999 ? ',' : ''}`);
  return lines.join('\n');
}

test('a block too big to read at once shows its overview from the store, with its text and why', async () => {
  const source = huge();
  const note = ['# Big', '', '```gql', source, '```', ''].join('\n');
  const env = await load({ files: { [PATH]: note } });
  try {
    const el = env.doc.body.createDiv({ cls: 'block-language-gql' });
    await env.state.processors.get('gql')(source, el, fakeContext(note, 2));
    await until(() => !!el.querySelector('.thoughtknot-massive-stage'));
    assert.match(
      el.querySelector('.thoughtknot-massive-stage')?.getAttribute('aria-label') ?? '',
      /^Overview of big: 12,000 things in \d+ groups/,
    );
    assert.match(el.querySelector('.thoughtknot-banner')?.textContent ?? '', /too large to read/i, 'why, still said');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
