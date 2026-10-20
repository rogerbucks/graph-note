// The state of a graph a proposal is made against (editor spec §17, proposal_provenance). It is graph-spec's own, so a
// change set made against it is checked as made "against the graph as it stands". This also tests whether the graph has
// moved since.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { NO_BASIS, basisOf, staleness } from '../src/proposals-basis.ts';
import { BASIS, GRAPH, NOTE, noteOf, noteWithChangeSet } from './proposals-fixtures.js';

describe('the state of a graph', () => {
  test('is the sixteen digits graph-spec names a change set’s state by, for the graph as the note holds it', () => {
    assert.match(BASIS, /^[0-9a-f]{16}$/);
    const block = `// graph: reader · CHANGE SET c · against sha-256-64:${BASIS} · by ada\n(x:Option {name: 'X'})`;
    const checked = gs.checkChangeset([GRAPH], block, {}).results;
    assert.equal(checked.find(([l]) => l.startsWith('it was made against'))[1], true);
    const moved = `// graph: reader · CHANGE SET c · against sha-256-64:${basisOf(noteOf(`${GRAPH},\n(z:T)`), 'reader')} · by ada\n(x:Option)`;
    assert.equal(
      gs.checkChangeset([GRAPH], moved, {}).results.find(([l]) => l.startsWith('it was made against'))[1],
      false,
    );
  });

  test('moves with the graph and stays with what is not the graph: a change set, a query or the words round the blocks', () => {
    assert.notEqual(basisOf(noteOf(`${GRAPH},\n(z:T)`), 'reader'), BASIS);
    assert.equal(basisOf(noteWithChangeSet().note, 'reader'), BASIS);
    assert.equal(
      basisOf(`${NOTE}\n\`\`\`gql\n// graph: reader · QUERY view v\nMATCH (n) RETURN n\n\`\`\`\n`, 'reader'),
      BASIS,
    );
    assert.equal(basisOf(NOTE.replace('After.', 'After, and more.'), 'reader'), BASIS);
  });

  test('is the same however the graph is split over blocks', () => {
    const [head, ...rest] = GRAPH.split('\n');
    const split = `\`\`\`gql\n${head}\n${rest.slice(0, 2).join('\n')}\n\`\`\`\n\n\`\`\`gql\n// graph: reader\n${rest.slice(2).join('\n')}\n\`\`\``;
    assert.equal(basisOf(split, 'reader'), BASIS);
  });

  test('is no state at all for a graph the note does not hold', () => {
    assert.equal(basisOf(NOTE, 'elsewhere'), NO_BASIS);
  });
});

describe('a graph that has moved', () => {
  test('is said so, with the state it was and the state it is, and a graph that has not is not', () => {
    assert.equal(staleness(NOTE, 'reader', BASIS), null);
    const s = staleness(noteOf(`${GRAPH},\n(z:T)`), 'reader', BASIS);
    assert.equal(s.was, BASIS);
    assert.notEqual(s.now, BASIS);
    assert.match(s.message, new RegExp(`${BASIS}.*${s.now}`));
  });
});
