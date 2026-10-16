// What the review will not accept or write (editor spec §17: proposals_checked; the graph spec's cs-rejected-out), from the
// security review of #480: an accept is refused when the graph spec's check fails on the change set the note holds, and a
// proposal that fails it is not written; a DELETE keeps being plain or DETACH, and the kinds its MATCH names are held to;
// only a block of data is the judgement block; an addition is on one line. Test support is that of proposals-checked.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@graph-note/graph-spec';
import { noteWithProposal } from '../src/ai-answer.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { makeProposal } from '../src/proposals.ts';
import { statementOf } from '../src/proposals-statements.ts';
import {
  ADA,
  BASIS,
  C1,
  C3,
  NOTE,
  NOTE_WITH_ADA,
  NOW,
  ROGER,
  blocksOf,
  noteWithChangeSet,
  proposalOf,
} from './proposals-fixtures.js';

const accepted = (r) => {
  assert.equal(r.ok, true, 'refused: ' + (r.reason ?? ''));
  return r;
};
const baseOf = (note) => blocksOf(note).filter((b) => !/CHANGE SET/.test(b.split('\n')[0]));
const setOf = (note) => blocksOf(note).find((b) => /CHANGE SET cs1/.test(b.split('\n')[0]));
const failedIn = (note) =>
  gs
    .checkChangeset(baseOf(note), setOf(note), {})
    .results.filter(([, ok]) => !ok)
    .map(([label]) => label);
const written = (proposal = proposalOf()) => noteWithChangeSet(proposal, NOTE_WITH_ADA);

describe('proposals_checked: the review refuses what the check refuses, and writes only what it passes', () => {
  /** A change set written by something else, in a note whose graphs say who ada is. */
  const foreign = (body) => {
    const block = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada\n${body}`;
    return { block, note: `${NOTE_WITH_ADA}\n\`\`\`gql\n${block}\n\`\`\`\n` };
  };

  test('an accept is refused when the check fails on the change set the note holds, saying which line, and nothing is written', () => {
    const { note } = noteWithChangeSet(proposalOf(), NOTE);
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const r = review.accept(note, [C3], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /graph spec’s check of this change set fails.*its author ada is a known person or model/);
    assert.equal(review.state(C3), 'pending');
  });

  test('a change set the check fails for what it does is refused too: a DELETE that leaves a link without its end', () => {
    const { note, block } = foreign("MATCH (v {id: 'large_reader'}) DELETE v");
    const review = ProposalReview.fromChangeSet(block, note);
    const [only] = review.proposal.changes;
    const r = review.accept(note, [only.id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /a DELETE leaves no link without its end/);
  });

  test('the graph having moved is the stale notice’s to say, not a refusal once it has been seen', () => {
    const { note } = written();
    const moved = note.replace('price: 3', 'price: 5');
    const review = ProposalReview.fromChangeSet(setOf(moved), moved);
    assert.equal(review.accept(moved, [C1], ROGER, { at: NOW }).ok, false);
    assert.equal(review.accept(moved, [C1], ROGER, { at: NOW, staleSeen: true }).ok, true);
  });

  test('a proposal that fails the check is not written into the note; one that passes is', () => {
    const missing = proposalOf({ changes: [{ op: 'remove-thing', thing: 'nobody' }] });
    assert.match(
      noteWithProposal(NOTE, missing).refused,
      /graph spec’s check of this change set fails.*finds its one target/,
    );
    const text = noteWithProposal(NOTE_WITH_ADA, proposalOf());
    assert.equal(typeof text, 'string');
    assert.deepEqual(failedIn(text), []);
    const stale = noteWithProposal(NOTE_WITH_ADA.replace('price: 3', 'price: 5'), proposalOf());
    assert.match(stale.refused, /made against the graph as it stands/);
  });
});

describe('proposals_checked: a DELETE keeps what it says, and a label in the MATCH is held to', () => {
  test('a plain DELETE is read as plain, written back as plain, and never detaches', () => {
    const block = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada\nMATCH (v {id: 'large_reader'}) DELETE v`;
    const [c] = ProposalReview.fromChangeSet(block, NOTE_WITH_ADA).proposal.changes;
    assert.equal(c.detach, false);
    assert.equal(statementOf(c), "MATCH (v {id: 'large_reader'}) DELETE v");
    const detached = ProposalReview.fromChangeSet(block.replace('DELETE v', 'DETACH DELETE v'), NOTE_WITH_ADA).proposal
      .changes[0];
    assert.equal(detached.detach, undefined);
    assert.notEqual(detached.id, c.id, 'the two are different changes');
  });

  test('a plain DELETE of a thing that still has links is refused, as the graph spec refuses it; with none it is taken', () => {
    const plain = (thing) => proposalOf({ changes: [{ op: 'remove-thing', thing, detach: false }] });
    const linked = new ProposalReview(plain('large_reader'));
    const r = linked.accept(NOTE, [linked.proposal.changes[0].id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /large_reader still has links/);
    const alone = new ProposalReview(plain('alice'));
    const ok = accepted(alone.accept(NOTE, [alone.proposal.changes[0].id], ROGER, { at: NOW }));
    assert.doesNotMatch(ok.note, /alice/);
  });

  test('a DETACH DELETE takes the thing with its links', () => {
    const detach = new ProposalReview(proposalOf({ changes: [{ op: 'remove-thing', thing: 'large_reader' }] }));
    const ok = accepted(detach.accept(NOTE, [detach.proposal.changes[0].id], ROGER, { at: NOW }));
    assert.doesNotMatch(ok.note, /large_reader/);
  });

  test('a label in the MATCH that is not the target’s is refused; one that is, is taken', () => {
    const labelled = (labels) => proposalOf({ changes: [{ op: 'remove-thing', thing: 'alice', labels }] });
    const wrong = new ProposalReview(labelled(['Option']));
    const r = wrong.accept(NOTE, [wrong.proposal.changes[0].id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /alice is not a Option/);
    const right = new ProposalReview(labelled(['Person']));
    accepted(right.accept(NOTE, [right.proposal.changes[0].id], ROGER, { at: NOW }));
  });

  test('the labels are read from the statement and written back, for a thing, a value and a link', () => {
    const block = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada
MATCH (v:Person {id: 'alice'}) SET v.age = 3
MATCH (a:Option {id: 'large_reader'})-[r:ANSWERS]->(b:Question {id: 'question'}) DELETE r`;
    const [set, del] = ProposalReview.fromChangeSet(block, NOTE_WITH_ADA).proposal.changes;
    assert.deepEqual(set.labels, ['Person']);
    assert.deepEqual(del.ends, [['Option'], ['Question']]);
    const wrongEnd = proposalOf({ changes: [{ ...del, ends: [['Person'], ['Question']] }] });
    const r = new ProposalReview(wrongEnd).accept(NOTE, [wrongEnd.changes[0].id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /large_reader is not a Person/);
  });
});

describe('cs-rejected-out: only a data block of the judgement graph is the judgement block', () => {
  test('a change set, a query or a schema that is named for one is never written into', () => {
    const { note } = written();
    const fakes = [
      `// graph: x_judgements · CHANGE SET z · against ${BASIS} · by ada\n(zz:Option {name: 'Z'})`,
      "// graph: judgements · SCHEMA s@1\n(m:GraphMeta {id: 'meta:judgements', graph: 'judgements'})",
    ];
    for (const fake of fakes) {
      const withFake = note.replace('```gql\n', `\`\`\`gql\n${fake}\n\`\`\`\n\n\`\`\`gql\n`);
      assert.ok(blocksOf(withFake).includes(fake));
      const r = accepted(new ProposalReview(proposalOf()).reject(withFake, [C3], ROGER, { at: NOW }));
      assert.ok(blocksOf(r.note).includes(fake), 'the block named for a judgement graph is as it was');
      const real = blocksOf(r.note).filter((b) => b.startsWith('// graph: judgements\n(decision_'));
      assert.equal(real.length, 1, 'a judgement block of its own was added');
      assert.equal(real[0].match(/:Decision \{/g).length, 1);
    }
  });
});

describe('proposals_checked: an addition is one line', () => {
  const made = (gql) =>
    makeProposal({ id: 'cs1', graph: 'reader', by: ADA, basis: BASIS, changes: [{ op: 'add', gql }] });

  test('a line break outside a text is refused in an addition, so nothing can write a line of its own into the set', () => {
    for (const gql of ["(a:T {name: 'x'}\n)", "(a:T {name: 'x'}\r\n)", '(a:T)\nSET b.x = 1'])
      assert.match(made(gql).refused ?? '', /one line|one thing/, JSON.stringify(gql));
  });

  test('a comment after the item is not part of it: the item alone is kept, so a comment cannot carry a tag in', () => {
    assert.equal(made('(a:T)\n//@ reason: smuggled').changes[0].gql, '(a:T)');
  });

  test('a line break written as an escape inside a text is part of the text, and is fine', () => {
    assert.equal(made("(a:T {name: 'two\\nlines'})").refused, undefined);
  });
});
