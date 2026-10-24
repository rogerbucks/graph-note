// Each AI write gets a safety score (editor spec §37, ai_write_scoring). It only sorts and groups the review queue, and
// nothing applies until a person accepts it. A permission-bearing or historical change is marked for a closer look,
// and the owner sets the weights by hand, as graph data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, policyOf, reviewQueue, scoreWrite } from '../src/ai-write-scoring.ts';
import { BIG_REMOVAL, GRAPH, SMALL_ADD, graphOf, proposal } from './ai-write-fixtures.js';

const AI = { kind: 'ai', name: 'ada' };

test('a large destructive write and a small additive one both wait in the queue, sorted by their scores, nothing applies until a person accepts it, and a permission-bearing or historical change is marked for a closer look', () => {
  const g = graphOf(GRAPH);
  const queue = reviewQueue(
    [
      { proposal: BIG_REMOVAL, source: AI },
      { proposal: SMALL_ADD, source: AI },
    ],
    g,
  );
  assert.deepEqual(
    queue.map((q) => [q.write.proposal.id, q.state]),
    [
      ['small_add', 'waiting'],
      ['big_removal', 'waiting'],
    ],
  );
  assert.ok(queue[0].score > queue[1].score);
  assert.equal(queue[0].group, 'safer');
  assert.equal(queue[1].group, 'check');
  assert.equal(graphOf(GRAPH).nodes.has('tablet'), false, 'nothing was written');
  // the removal renames Alice, a Person, and people carry permissions
  assert.deepEqual(
    queue.map((q) => q.closerLook),
    [false, true],
  );

  const grant = proposal('grant', [
    { op: 'add', gql: "(g:Grant {access: 'read', path: 'diary.md', status: 'asserted'})" },
  ]);
  assert.equal(scoreWrite({ proposal: grant, source: AI }, g).closerLook, true);
  const old = graphOf(
    GRAPH.replace("(alice:Person {name: 'Alice'})", "(alice:Person {name: 'Alice', historical: TRUE})"),
  );
  const rename = proposal('rename', [{ op: 'set', thing: 'alice', key: 'name', value: "'Alicia'" }]);
  assert.equal(scoreWrite({ proposal: rename, source: AI }, old).closerLook, true, 'a historical item');
  assert.equal(scoreWrite({ proposal: rename, source: AI }, g).closerLook, true, 'a Person carries permissions');
});

test('the score weighs certainty, contested things, failed intents and the source’s record', () => {
  const rename = proposal('price', [{ op: 'set', thing: 'large_reader', key: 'price', value: '4' }]);
  const plain = graphOf(GRAPH);
  const doubtful = graphOf(GRAPH.replace('price: 3}', "price: 3, likelihood: 'unlikely'}"));
  const contested = graphOf(GRAPH.replace('price: 3}', "price: 3, status: 'contested'}"));
  const base = scoreWrite({ proposal: rename, source: AI }, plain).score;
  assert.equal(scoreWrite({ proposal: rename, source: AI }, doubtful).score, base - DEFAULT_POLICY.per_doubtful);
  assert.equal(scoreWrite({ proposal: rename, source: AI }, contested).score, base - DEFAULT_POLICY.per_contested);
  assert.equal(
    scoreWrite({ proposal: rename, source: AI, failedIntents: ['prices only rise'] }, plain).score,
    base - DEFAULT_POLICY.per_failed_intent,
  );
  assert.equal(
    scoreWrite({ proposal: rename, source: AI }, plain, DEFAULT_POLICY, { ada: { accepted: 1, rejected: 1 } }).score,
    base - DEFAULT_POLICY.per_rejection_share / 2,
  );
});

test('the scoring policy is graph data the owner sets by hand', () => {
  const policy = policyOf(graphOf('// graph: policy\n(p:ScoringPolicy {per_removal: 40, per_change: -5})'));
  assert.equal(policy.per_removal, 40);
  assert.equal(policy.per_change, DEFAULT_POLICY.per_change, 'a weight below zero is not taken');
  const g = graphOf(GRAPH);
  assert.ok(
    scoreWrite({ proposal: BIG_REMOVAL, source: AI }, g, policy).score <
      scoreWrite({ proposal: BIG_REMOVAL, source: AI }, g).score,
  );
});
