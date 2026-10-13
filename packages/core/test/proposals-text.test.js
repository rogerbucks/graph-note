// A proposal as a change set in the note (editor spec §17): graph-spec's change set for what it adds and sets, with the
// rest — who proposed it and what it read, the removals, each change's id and group, and what a person decided — written
// beside it as comments its readers pass over, so the change set in the note is the record and reads back whole.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@graph-note/graph-spec';
import { makeProposal } from '../src/proposals.ts';
import { changeSetId, changeSetText, readChangeSet, recordDecisions } from '../src/proposals-text.ts';
import { ADA, AT, BASIS, CHANGES, GRAPH, NOW, proposalOf } from './proposals-fixtures.js';

const read = (block) => {
  const r = readChangeSet(block);
  assert.ok(!('refused' in r), r.refused);
  return r;
};

describe('a proposal written as a change set', () => {
  test('is graph-spec’s change set: the header names the graph, the id, the state it was made against and the author', () => {
    const text = changeSetText(proposalOf(), new Map(), null);
    assert.deepEqual(gs.changesetHeader(text), { graph: 'reader', id: 'cs1', against: BASIS, by: 'ada' });
    assert.deepEqual(gs.header(text), ['reader', 'changeset']);
    assert.deepEqual(changeSetId(text), { graph: 'reader', id: 'cs1' });
    assert.equal(changeSetId(GRAPH), null);
  });

  test('is, in full, the comments of its provenance, then each change under its id and group, the removals last', () => {
    assert.equal(
      changeSetText(proposalOf(), new Map(), null),
      `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada
// proposer kind: model
// proposed: ${AT}
// read: reader
//@ change: c1
//@ group: New Option
(small_reader:Option {name: 'Small reader'}),
//@ change: c2
//@ group: New ANSWERS links
(small_reader)-[:ANSWERS]->(question)
//@ change: c3
//@ group: Changed price
SET large_reader.price = 4

//@ change: c4
//@ group: Removed ANSWERS links
//@ remove: link large_reader ANSWERS question

//@ change: c5
//@ group: Removed things
//@ remove: thing alice`,
    );
  });

  test('is passed by graph-spec’s own check of a change set that only adds: the linter finds no trap and it loads', () => {
    const adds = proposalOf({ changes: [CHANGES[0], CHANGES[1]] });
    const text = changeSetText(adds, new Map([['c1', { state: 'rejected', by: 'roger', at: NOW }]]), BASIS);
    assert.deepEqual(gs.lint(text), []);
    const { results } = gs.checkChangeset([GRAPH], text, {});
    const failed = results.filter(([, ok]) => !ok).map(([label]) => label);
    assert.deepEqual(failed, ['its author ada is a known person or model']);
  });

  test('with things, links and a SET together is passed by graph-spec’s check: a comma parts the items of a run, never a run from the SET', () => {
    const mixed = proposalOf({
      changes: [CHANGES[0], CHANGES[1], CHANGES[2], { ...CHANGES[2], key: 'size', value: '2' }],
    });
    const text = changeSetText(mixed, new Map(), null);
    assert.deepEqual(gs.lint(text), []);
    const { results } = gs.checkChangeset([GRAPH], text, {}, new Set(['additions-only']));
    assert.deepEqual(
      results.filter(([, ok]) => !ok).map(([label]) => label),
      ['its author ada is a known person or model'],
    );
    assert.match(
      text,
      /\(small_reader\)-\[:ANSWERS\]->\(question\)\n\/\/@ change: c3\n\/\/@ group: Changed price\nSET large_reader\.price = 4,\n/,
    );
    assert.deepEqual(read(text).proposal, mixed);
  });

  test('keeps a decision above its change, and the graph’s state after the changes accepted', () => {
    const decisions = new Map([['c2', { state: 'accepted', by: 'roger', at: NOW }]]);
    const text = changeSetText(proposalOf(), decisions, 'bafbcdeeb6103e8f');
    assert.match(text, /\/\/ basis now: bafbcdeeb6103e8f\n/);
    assert.match(
      text,
      new RegExp(`//@ accepted: roger, ${NOW}\\n\\(small_reader\\)-\\[:ANSWERS\\]->\\(question\\)\\n`),
    );
  });

  test('keeps a name as one word, so a decision never breaks the line that holds it', () => {
    const text = changeSetText(
      proposalOf(),
      new Map([['c1', { state: 'rejected', by: 'Roger B, esq.', at: NOW }]]),
      null,
    );
    assert.match(text, /\/\/@ rejected: Roger_B_esq\., 2026/);
  });
});

describe('a decision recorded in a change set', () => {
  const decided = (...entries) => new Map(entries.map(([id, state]) => [id, { state, by: 'roger', at: NOW }]));
  /** The lines `after` has that `before` has not, and `after` with exactly those lines taken out. */
  const added = (before, after) => {
    const had = before.split('\n');
    const lines = after.split('\n');
    const extra = lines.filter((l) => !had.includes(l));
    return { extra, rest: lines.filter((l) => had.includes(l)).join('\n') };
  };

  test('is one line above the change, and one for the state after; every other byte, an author’s comment among them, is kept', () => {
    const p = proposalOf();
    const written = changeSetText(p, new Map(), null);
    const block = written
      .replace('// read: reader\n', '// read: reader\n// checked by Bob, 12 Oct\n')
      .replace('//@ change: c2', '// a word from Ada\n//@ change: c2');
    const after = recordDecisions(block, p, decided(['c2', 'accepted']), 'bafbcdeeb6103e8f');
    const { extra, rest } = added(block, after);
    assert.deepEqual(extra, ['// basis now: bafbcdeeb6103e8f', `//@ accepted: roger, ${NOW}`]);
    assert.equal(rest, block);
    assert.match(
      after,
      new RegExp(`//@ accepted: roger, ${NOW}\\n\\(small_reader\\)-\\[:ANSWERS\\]->\\(question\\)\\n`),
    );
    assert.deepEqual(read(after).decisions.get('c2'), { state: 'accepted', by: 'roger', at: NOW });
  });

  test('replaces its own line when the change is decided again, and takes it away when the decision is gone', () => {
    const p = proposalOf();
    const once = recordDecisions(changeSetText(p, new Map(), null), p, decided(['c1', 'rejected']), null);
    const twice = recordDecisions(once, p, decided(['c1', 'accepted']), 'bafbcdeeb6103e8f');
    assert.equal(twice.match(/\/\/@ (accepted|rejected):/g).length, 1);
    assert.match(twice, /\/\/@ accepted: roger/);
    const none = recordDecisions(twice, p, new Map(), null);
    assert.equal(none, changeSetText(p, new Map(), null));
  });

  test('goes above a removal’s own line, and the state after is put with the other facts of the header', () => {
    const p = proposalOf();
    const block = changeSetText(p, new Map(), null);
    const after = recordDecisions(block, p, decided(['c5', 'rejected']), 'bafbcdeeb6103e8f');
    assert.match(after, new RegExp(`//@ rejected: roger, ${NOW}\\n//@ remove: thing alice`));
    assert.match(after, /\/\/ read: reader\n\/\/ basis now: bafbcdeeb6103e8f\n\/\/@ change: c1/);
  });

  test('in a change set written by something else adds no tag nobody decided: only the line of the decision', () => {
    const text = `// graph: reader · CHANGE SET from_ada · against ${BASIS} · by ada
// my own comment
(small_reader:Option {name: 'Small reader'}),
(small_reader)-[:ANSWERS]->(question)
SET large_reader.price = 4`;
    const { proposal } = read(text);
    const after = recordDecisions(text, proposal, decided(['c2', 'rejected'], ['c3', 'accepted']), null);
    const { extra, rest } = added(text, after);
    assert.deepEqual(extra, [`//@ rejected: roger, ${NOW}`, `//@ accepted: roger, ${NOW}`]);
    assert.equal(rest, text);
    const back = read(after).decisions;
    assert.deepEqual([...back.keys()], ['c2', 'c3']);
    assert.equal(back.get('c2').state, 'rejected');
    assert.equal(back.get('c3').state, 'accepted');
  });

  test('is the whole change set written afresh only when the block no longer holds the proposal', () => {
    const p = proposalOf();
    const other = proposalOf({ changes: [CHANGES[0]] });
    const block = changeSetText(other, new Map(), null);
    assert.equal(
      recordDecisions(block, p, decided(['c1', 'accepted']), null),
      changeSetText(p, decided(['c1', 'accepted']), null),
    );
  });
});

describe('a change set read back', () => {
  test('gives the proposal it was written from, change for change', () => {
    const p = proposalOf({ read: ['reader', 'Notes/Devices'] });
    const r = read(changeSetText(p, new Map(), null));
    assert.deepEqual(r.proposal, p);
    assert.equal(r.decisions.size, 0);
    assert.equal(r.basisNow, null);
  });

  test('gives the decisions in it, and the state the accepts left the graph in', () => {
    const decisions = new Map([
      ['c1', { state: 'accepted', by: 'roger', at: NOW }],
      ['c4', { state: 'rejected', by: 'roger', at: NOW }],
    ]);
    const r = read(changeSetText(proposalOf(), decisions, 'bafbcdeeb6103e8f'));
    assert.deepEqual([...r.decisions], [...decisions]);
    assert.equal(r.basisNow, 'bafbcdeeb6103e8f');
  });

  test('gives a reason the source gave, written as a note above the change', () => {
    const p = proposalOf({ changes: [{ ...CHANGES[0], reason: 'the smaller one is what people asked for' }] });
    const text = changeSetText(p, new Map(), null);
    assert.match(text, /\/\/\/ the smaller one is what people asked for\n\(small_reader/);
    assert.equal(read(text).proposal.changes[0].reason, 'the smaller one is what people asked for');
  });

  test('keeps the ids and groups a source named, whatever order the changes are written in', () => {
    const p = proposalOf({
      changes: [
        { ...CHANGES[2], id: 'price', group: 'Prices' },
        { ...CHANGES[0], id: 'thing', group: 'Things' },
      ],
    });
    const r = read(changeSetText(p, new Map(), null));
    assert.deepEqual(
      r.proposal.changes.map((c) => [c.id, c.group, c.op]),
      [
        ['thing', 'Things', 'add'],
        ['price', 'Prices', 'set'],
      ],
    );
  });

  test('reads a change set written by something else — plain GQL, with no comments of ours — number by number', () => {
    const text = `// graph: reader · CHANGE SET from_ada · against ${BASIS} · by ada
(small_reader:Option {name: 'Small reader'}),
(small_reader)-[:ANSWERS]->(question),
SET large_reader.price = 4,
 small_reader.price = 2`;
    const { proposal } = read(text);
    assert.equal(proposal.provenance.by.kind, 'unknown');
    assert.equal(proposal.provenance.at, null);
    assert.deepEqual(
      proposal.changes.map((c) => [c.id, c.group, c.op]),
      [
        ['c1', 'New Option', 'add'],
        ['c2', 'New ANSWERS links', 'add'],
        ['c3', 'Changed price', 'set'],
        ['c4', 'Changed price', 'set'],
      ],
    );
    assert.deepEqual(proposal.changes[3], {
      op: 'set',
      thing: 'small_reader',
      key: 'price',
      value: '2',
      id: 'c4',
      group: 'Changed price',
    });
  });

  test('a block that is not a change set is refused, saying what the first line should read', () => {
    assert.match(readChangeSet(GRAPH).refused, /not a change set.*CHANGE SET/);
  });

  test('a text with a quotation or a comma in it is kept as it was written', () => {
    const p = makeProposal({
      id: 'cs2',
      graph: 'reader',
      by: ADA,
      basis: BASIS,
      changes: [{ op: 'add', gql: '(odd:Option {name: \'Two, "odd" // things\'})' }],
    });
    assert.deepEqual(read(changeSetText(p, new Map(), null)).proposal.changes, p.changes);
  });
});
