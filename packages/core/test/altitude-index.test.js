// The altitude and topic index of a note's graphs (editor spec §32, altitude_topic_index). A similarity search ranks by
// the derived certainty key and marks contested things, and a rebuilt index gives the same results.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { altitudeIndexOf, searchAltitude } from '../src/altitude-index.ts';

const BLOCKS = [
  `// graph: lending
(overview:Lens {name: 'Overview', query: '*'}),
(interest:Claim {topics: 'interest rates, lending', likelihood: 'likely', confidence: 'high'}),
(inflation:Claim {topic: 'interest rate', likelihood: 'very-likely', status: 'contested'}),
(fees:Claim {topics: 'fees', likelihood: 'unlikely'}),
(interest)-[:AT_ALTITUDE {level: 2}]->(overview)`,
  `// graph: branches
(north:Fact {topic: 'interest rates'})`,
  'not a graph block at all (',
];

describe('altitude_topic_index', () => {
  test('a similarity search ranks by the derived certainty key and marks contested things', () => {
    const found = searchAltitude(altitudeIndexOf(BLOCKS), { like: 'interest rates' });
    assert.deepEqual(
      found.map((f) => f.id),
      ['lending/inflation', 'lending/interest', 'branches/north'],
    );
    assert.equal(found[0].contested, true);
    assert.ok(found[0].score < found[1].score);
    assert.equal(found[2].sort_key, null);
  });

  test('an exact search and a search by lens and level find only their own', () => {
    const index = altitudeIndexOf(BLOCKS);
    assert.deepEqual(
      searchAltitude(index, { topic: 'fees' }).map((f) => f.id),
      ['lending/fees'],
    );
    assert.deepEqual(
      searchAltitude(index, { lens: 'overview', level: 2 }).map((f) => f.id),
      ['lending/interest'],
    );
  });

  test('a rebuilt index gives the same results, and a block that cannot be read adds nothing', () => {
    const first = altitudeIndexOf(BLOCKS),
      again = altitudeIndexOf([...BLOCKS]);
    assert.equal(first.hash, again.hash);
    assert.deepEqual(searchAltitude(first, { like: 'lend' }), searchAltitude(again, { like: 'lend' }));
    assert.ok(first.entries.every((e) => e.graph === 'lending' || e.graph === 'branches'));
  });
});
