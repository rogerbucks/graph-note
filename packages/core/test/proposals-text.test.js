// A proposal as a change set in the note (editor spec §17). It is graph-spec's change set, so every tool that reads GQL
// reads it. It holds the things and links it adds as a block writes them. A change of a property is a SET, and a
// removal a DELETE. Who proposed it and what it read are comments its readers pass over. A change's id is derived from
// its statement and never written; the reason is an optional `//@ reason:` line. What a person decided is not in it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { makeProposal } from '../src/proposals.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { changeSetId, changeSetText, readChangeSet } from '../src/proposals-text.ts';
import { ADA, AT, BASIS, C1, C2, C3, C4, C5, CHANGES, GRAPH, NOTE_WITH_ADA, proposalOf } from './proposals-fixtures.js';

const read = (block) => {
  const r = readChangeSet(block);
  assert.ok(!('refused' in r), r.refused);
  return r;
};
/** The proposal a block holds, as the review reads it from a note whose graphs say what ada is. */
const proposalIn = (block) => {
  const r = ProposalReview.fromChangeSet(block, NOTE_WITH_ADA);
  assert.ok(!('refused' in r), r.refused);
  return r.proposal;
};
const failed = (block, base = [GRAPH, "// graph: people\n(ada:Model {name: 'Ada'})"]) =>
  gs
    .checkChangeset(base, block, {})
    .results.filter(([, ok]) => !ok)
    .map(([label]) => label);

describe('a proposal written as a change set', () => {
  test('is graph-spec’s change set: the header names the graph, the id, the state it was made against and the author', () => {
    const text = changeSetText(proposalOf());
    assert.deepEqual(gs.changesetHeader(text), { graph: 'reader', id: 'cs1', against: BASIS, by: 'ada' });
    assert.deepEqual(gs.header(text), ['reader', 'changeset']);
    assert.deepEqual(changeSetId(text), { graph: 'reader', id: 'cs1' });
    assert.equal(changeSetId(GRAPH), null);
  });

  test('is, in full, the comments of its provenance, the additions, then a statement for each other change', () => {
    assert.equal(
      changeSetText(proposalOf()),
      `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada
// proposed: ${AT}
// read: reader
(small_reader:Option {name: 'Small reader'}),
(small_reader)-[:ANSWERS]->(question)
SET large_reader.price = 4
MATCH (a {id: 'large_reader'})-[r:ANSWERS]->(b {id: 'question'}) DELETE r
MATCH (v {id: 'alice'}) DETACH DELETE v`,
    );
  });

  test('writes no id, no proposer kind, no basis of its own and no removal as a comment: the header alone carries the basis and the author', () => {
    const text = changeSetText(proposalOf());
    assert.doesNotMatch(text, /\/\/@ change:/);
    assert.doesNotMatch(text, /proposer kind/);
    assert.doesNotMatch(text, /basis now/);
    assert.doesNotMatch(text, /\/\/@ remove:/);
    assert.equal(gs.splitChangeset(text).basisOk, true);
  });

  test('is passed by graph-spec’s own check, removals and changes of a value among its changes', () => {
    assert.deepEqual(failed(changeSetText(proposalOf())), []);
  });

  test('with things, links and several SETs together is passed by graph-spec’s check: each SET is a statement of its own', () => {
    const mixed = proposalOf({
      changes: [CHANGES[0], CHANGES[1], CHANGES[2], { ...CHANGES[2], key: 'size', value: '2' }],
    });
    const text = changeSetText(mixed);
    assert.deepEqual(failed(text), []);
    assert.match(text, /\nSET large_reader\.price = 4\nSET large_reader\.size = 2$/);
    assert.deepEqual(proposalIn(text).changes, mixed.changes);
  });

  test('puts a group above its change only when it is not the one its kind gives, and a reason directly above', () => {
    const p = proposalOf({
      changes: [
        { ...CHANGES[2], group: 'Prices', reason: 'it costs more now' },
        { ...CHANGES[0], reason: 'a pocket one' },
      ],
    });
    const text = changeSetText(p);
    assert.match(text, /\/\/@ reason: a pocket one\n\(small_reader:Option/);
    assert.match(text, /\/\/@ group: Prices\n\/\/@ reason: it costs more now\nSET large_reader\.price = 4$/);
    assert.deepEqual(failed(text), []);
  });
});

describe('a change set read back', () => {
  test('gives the proposal it was written from, change for change', () => {
    const p = proposalOf({ read: ['reader', 'Notes/Devices'] });
    assert.deepEqual(proposalIn(changeSetText(p)), p);
  });

  test('gives the ids the graph library derives for the statements, the ones checkChangeset reports', () => {
    const p = proposalOf();
    const { header } = gs.checkChangeset([GRAPH], changeSetText(p), {});
    assert.deepEqual(
      header.changes.map((c) => c.id),
      [C3, C4, C5],
    );
    assert.deepEqual(
      p.changes.map((c) => c.id),
      [C1, C2, C3, C4, C5],
    );
  });

  test('gives a reason the source gave, from the line `//@ reason:` above the change', () => {
    const p = proposalOf({ changes: [{ ...CHANGES[0], reason: 'the smaller one is what people asked for' }] });
    const text = changeSetText(p);
    assert.match(text, /\/\/@ reason: the smaller one is what people asked for\n\(small_reader/);
    assert.equal(proposalIn(text).changes[0].reason, 'the smaller one is what people asked for');
    const { header } = gs.checkChangeset(
      [GRAPH],
      changeSetText(proposalOf({ changes: [{ ...CHANGES[2], reason: 'why' }] })),
      {},
    );
    assert.equal(header.changes[0].reason, 'why');
  });

  test('keeps the groups a source named, in the order the changes are written', () => {
    const p = proposalOf({
      changes: [
        { ...CHANGES[2], group: 'Prices' },
        { ...CHANGES[0], group: 'Things' },
      ],
    });
    assert.deepEqual(
      proposalIn(changeSetText(p)).changes.map((c) => [c.group, c.op]),
      [
        ['Things', 'add'],
        ['Prices', 'set'],
      ],
    );
  });

  test('reads a change set written by something else — plain GQL, with no comments of ours — change by change', () => {
    const text = `// graph: reader · CHANGE SET from_ada · against ${BASIS} · by ada
(small_reader:Option {name: 'Small reader'}),
(small_reader)-[:ANSWERS]->(question)
SET large_reader.price = 4
MATCH (v:Person {id: 'alice'}) DELETE v
MATCH (v {id: 'large_reader'}) SET v.size = 2`;
    const proposal = proposalIn(text);
    assert.equal(proposal.provenance.by.kind, 'model');
    assert.equal(proposal.provenance.at, null);
    assert.deepEqual(
      proposal.changes.map((c) => [c.group, c.op]),
      [
        ['New Option', 'add'],
        ['New ANSWERS links', 'add'],
        ['Changed price', 'set'],
        ['Removed things', 'remove-thing'],
        ['Changed size', 'set'],
      ],
    );
    assert.deepEqual(proposal.changes[4], {
      op: 'set',
      thing: 'large_reader',
      key: 'size',
      value: '2',
      id: proposal.changes[4].id,
      group: 'Changed size',
    });
  });

  test('a SET of more than one target, as the editor once wrote one, is refused as the check refuses it', () => {
    const text = `// graph: reader · CHANGE SET old · against ${BASIS} · by ada
SET large_reader.price = 4,
 alice.name = 'Alicia'`;
    assert.match(readChangeSet(text).refused, /line 2: .*more than one target/);
    assert.ok(failed(text).includes('each DELETE and SET is its own statement and names exactly one target (§24)'));
  });

  test('a change set in the editor’s old form is refused, saying why and what to do', () => {
    for (const old of [
      '//@ change: c1',
      '//@ remove: thing alice',
      '// proposer kind: model',
      '// basis now: 05d75fdcbdb1d37b',
      '//@ rejected: roger, 2026-10-13T10:30:00Z',
    ]) {
      const text = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada\n${old}\n(small_reader:Option)`;
      assert.match(readChangeSet(text).refused, /old form.*comments that other tools skip/, old);
    }
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
    assert.deepEqual(proposalIn(changeSetText(p)).changes, p.changes);
  });

  test('says what the block holds without making a proposal of it: the header, the facts and the changes in order', () => {
    const r = read(changeSetText(proposalOf({ read: ['reader', 'Notes/Devices'] })));
    assert.deepEqual(
      [r.id, r.graph, r.by, r.basis, r.at, r.read],
      ['cs1', 'reader', 'ada', BASIS, AT, ['reader', 'Notes/Devices']],
    );
    assert.deepEqual(
      r.changes.map((c) => c.op),
      ['add', 'add', 'set', 'remove-link', 'remove-thing'],
    );
  });

  test('knows its proposer by what the note’s graphs say: a Model is a model, and nothing said is unknown', () => {
    const block = changeSetText(proposalOf());
    assert.equal(ProposalReview.fromChangeSet(block, NOTE_WITH_ADA).proposal.provenance.by.kind, 'model');
    assert.equal(ProposalReview.fromChangeSet(block).proposal.provenance.by.kind, 'unknown');
  });
});
