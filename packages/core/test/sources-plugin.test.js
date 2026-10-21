// A graph drawn from a plug-in's source (editor spec §20, plugin_source_from; §43, plugin_interface). A block writes the
// source's word and its place after FROM: `// graph: trip · FROM sample:trip`. The host asks the plug-in that adds the
// source, and the core reads what comes back as it reads a .gql file. With no plug-in on that adds it, the block says
// so, naming the source, and draws nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readSource, sourceName, sourcesOf } from '../src/sources.ts';

const note = (block) => '# Trip\n\n```gql\n' + block + '\n```\n';
const texts = (n) => gqlBlocks(n).map((b) => b.text);
const FROM_SAMPLE = { graph: 'trip', kind: 'plugin', scheme: 'sample', target: 'trip', block: 0 };
const GRAPH = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;

describe('a block that draws its graph from a plug-in’s source (plugin_source_from)', () => {
  test('names the source by its word and the place after it', () => {
    assert.deepEqual(sourcesOf(texts(note('// graph: trip · FROM sample:trip'))), [FROM_SAMPLE]);
    assert.deepEqual(sourcesOf(texts(note('// graph: trip · FROM acme-db:orders/2026'))), [
      { ...FROM_SAMPLE, scheme: 'acme-db', target: 'orders/2026' },
    ]);
  });

  test('is never read as a drive letter, a link or a note named with a colon', () => {
    assert.match(sourcesOf(texts(note('// graph: trip · FROM C:/graphs/trip.gql')))[0].fault, /not a place inside/);
    assert.equal(sourcesOf(texts(note('// graph: trip · FROM [[Trip plan]]')))[0].kind, 'note');
    assert.equal(sourcesOf(texts(note('// graph: trip · FROM sample:')))[0].kind, undefined);
  });

  test('reads what the plug-in gave as a .gql file is read, and names the source in words', () => {
    const read = readSource(FROM_SAMPLE, { found: 'sample:trip', text: GRAPH });
    assert.deepEqual(
      read.reading.graphs.get('trip').boxes.map((b) => b.key),
      ['home', 'park'],
    );
    assert.equal(sourceName(FROM_SAMPLE), 'The plug-in source sample:trip');
  });

  test('with no plug-in on that adds the source, says so and draws nothing', () => {
    const read = readSource(FROM_SAMPLE, { missing: true });
    assert.equal(read.why, 'missing');
    assert.match(read.refused, /No plug-in that is turned on reads sample: sources/);
  });
});
