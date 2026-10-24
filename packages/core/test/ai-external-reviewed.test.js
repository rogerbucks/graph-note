// Writes from outside always go to review (editor spec §37, external_writes_reviewed), whatever their score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewQueue, scoreWrite } from '../src/ai-write-scoring.ts';
import { GRAPH, SMALL_ADD, graphOf } from './ai-write-fixtures.js';

test('an external write with a high score still queues for review', () => {
  const g = graphOf(GRAPH);
  const outside = scoreWrite({ proposal: SMALL_ADD, source: { kind: 'external', name: 'partner_feed' } }, g);
  assert.ok(outside.score >= 90);
  assert.equal(outside.state, 'waiting');
  assert.equal(outside.group, 'external');
  const queue = reviewQueue(
    [
      { proposal: SMALL_ADD, source: { kind: 'ai', name: 'ada' } },
      { proposal: SMALL_ADD, source: { kind: 'external', name: 'partner_feed' } },
    ],
    g,
  );
  assert.deepEqual(
    queue.map((q) => [q.group, q.state]),
    [
      ['external', 'waiting'],
      ['safer', 'waiting'],
    ],
  );
});
