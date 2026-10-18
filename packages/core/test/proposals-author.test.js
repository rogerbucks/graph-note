// The proposer is declared by the editor, in the proposal itself (editor spec §17, proposals_checked; the graph spec's
// §24 author rule). The graph spec's check wants a change set's author to be a known person or model. So the editor
// puts the declaration (the Model from the AI settings, or the Step as a Person) first among the proposal's additions.
// It is shown on the card like any change and never in the data until a change is accepted. Nothing a model writes can
// declare an author.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { noteWithProposal } from '../src/ai-answer.ts';
import { changesIn } from '../src/ai-request.ts';
import { readNote } from '../src/drawing.ts';
import { proposerKind } from '../src/proposals-check.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { declaresProposer } from '../src/proposals-author.ts';
import {
  BASIS,
  C1,
  C2,
  C3,
  C4,
  C5,
  CHANGES,
  NOTE,
  NOTE_WITH_ADA,
  NOW,
  ROGER,
  blocksOf,
  decisionsIn,
  proposalOf,
} from './proposals-fixtures.js';

const DECLARE = "(ada:Model {name: 'ada'})";
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
/** The note a model's proposal is written into: the graph alone, with no word of who ada is. */
const written = (proposal = proposalOf()) => {
  const note = noteWithProposal(NOTE, proposal);
  assert.equal(typeof note, 'string', note.refused);
  return note;
};
/** The Model nodes the note's data holds, outside any change set or judgement graph. */
const modelsIn = (note) =>
  baseOf(note)
    .filter((b) => !/^\/\/ graph: (?:\w+_)?judgements/.test(b))
    .flatMap((b) => [...b.matchAll(/\((\w+):(?:Model|Person)\b/g)].filter((m) => m[1] !== 'alice').map((m) => m[1]));

describe('the editor declares the proposer in the proposal, as its first addition', () => {
  test('a proposal written into a note that does not know its proposer carries the declaration first, and passes the check', () => {
    const note = written();
    const set = setOf(note);
    assert.ok(set.includes(`\n${DECLARE},\n(small_reader:Option`), 'the declaration is the first addition');
    assert.deepEqual(failedIn(note), []);
  });

  test('nothing lands in the note’s data: the graph block is the same bytes, and the declaration waits in the set', () => {
    const note = written();
    assert.equal(baseOf(note)[0], baseOf(NOTE)[0]);
    assert.deepEqual(modelsIn(note), []);
  });

  test('a note that already declares the proposer gets no second declaration', () => {
    const note = noteWithProposal(NOTE_WITH_ADA, proposalOf());
    assert.doesNotMatch(setOf(note), /ada:Model/);
  });

  test('a step is declared as a Person that is a Step, and the note then says it is a step', () => {
    const step = proposalOf({ by: { name: 'colleagues', kind: 'step' } });
    const note = noteWithProposal(NOTE, step);
    assert.match(note, /\n\(colleagues:Person:Step \{name: 'colleagues'\}\),\n/);
    const set = blocksOf(note).find((b) => /CHANGE SET/.test(b));
    assert.deepEqual(
      gs.checkChangeset(baseOf(note), set, {}).results.filter(([, ok]) => !ok),
      [],
    );
    const accept = ProposalReview.fromChangeSet(set, note);
    const [id] = accept.proposal.changes.map((c) => c.id);
    const r = accepted(accept.accept(note, [id], ROGER, { at: NOW }));
    assert.equal(proposerKind(r.note, 'colleagues'), 'step');
  });

  test('it is shown on the card as a change like the rest: an addition of a Model, with the reason it is there', () => {
    const note = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const [first] = review.show(note).rows;
    assert.equal(first.text, DECLARE);
    assert.equal(first.mark, 'add');
    assert.match(first.reason, /declares who proposed this/);
    assert.equal(review.proposal.changes.length, 6);
  });

  test('accepting one change writes the declaration with it, in the one write', () => {
    const note = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const r = accepted(review.accept(note, [C3], ROGER, { at: NOW }));
    assert.deepEqual(modelsIn(r.note), ['ada']);
    assert.equal(readNote(baseOf(r.note)).world.reader.p('large_reader').price, 4);
    assert.equal(decisionsIn(r.note).size, 2, 'both are decided: the change and the declaration');
    assert.deepEqual(
      [...decisionsIn(r.note).values()].map((d) => d.state),
      ['accepted', 'accepted'],
    );
    assert.deepEqual(failedIn(r.note), []);
    // one undo takes both back
    assert.equal(accepted(review.undo(r.note)).note, note);
  });

  test('accepting a group or all writes it once, not twice', () => {
    const note = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const r = accepted(review.accept(note, { all: true }, ROGER, { at: NOW }));
    assert.deepEqual(modelsIn(r.note), ['ada']);
    assert.equal(r.ids.length, 6);
  });

  test('rejecting everything removes the declaration too: no Model is left, and the data is as it was', () => {
    const note = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const r = accepted(review.reject(note, { all: true }, ROGER, { at: NOW }));
    assert.deepEqual(modelsIn(r.note), []);
    assert.equal(baseOf(r.note)[0], baseOf(NOTE)[0]);
    assert.doesNotMatch(setOf(r.note), /ada:Model/);
    assert.equal(decisionsIn(r.note).size, 6);
    // nothing waits in the set, so there is nothing for the check to ask a known author for
    assert.equal(ProposalReview.fromChangeSet(setOf(r.note), r.note).show(r.note).checked.passed, true);
  });

  test('rejecting every change but the declaration rejects it too, since nothing is left for it to declare', () => {
    const note = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const r = accepted(review.reject(note, [C1, C2, C3, C4, C5], ROGER, { at: NOW }));
    assert.equal(r.ids.length, 6);
    assert.deepEqual(modelsIn(r.note), []);
    assert.doesNotMatch(setOf(r.note), /ada:Model/);
  });

  test('the declaration is not rejected alone while other changes wait: they would have no known author', () => {
    const note = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    const declaration = review.proposal.changes[0].id;
    const r = review.reject(note, [declaration], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /declares who proposed this/);
  });
});

describe('a model’s own answer cannot declare an author', () => {
  const answer = (change) => JSON.stringify({ changes: [change] });

  test('an addition of a Model, a Person or a Step from a model’s answer is refused, saying so', () => {
    for (const kind of ['Model', 'Person', 'Step']) {
      const r = changesIn(answer({ op: 'add-thing', name: 'mallory', kind, properties: {} }));
      assert.match(
        r.unread,
        /cannot add a Person, an Organization, a SoftwareAgent, a Model or a Step: the editor declares who proposed/,
        kind,
      );
    }
  });

  test('in any case: model, PERSON and sTeP are refused as Model, Person and Step are', () => {
    for (const kind of ['model', 'PERSON', 'sTeP', 'MODEL'])
      assert.match(
        changesIn(answer({ op: 'add-thing', name: 'mallory', kind, properties: {} })).unread,
        /cannot add/,
        kind,
      );
  });

  test('nor an Organization or a SoftwareAgent, in any case', () => {
    for (const kind of ['Organization', 'ORGANIZATION', 'SoftwareAgent', 'softwareagent'])
      assert.match(
        changesIn(answer({ op: 'add-thing', name: 'mallory', kind, properties: {} })).unread,
        /cannot add a Person, an Organization, a SoftwareAgent, a Model or a Step/,
        kind,
      );
  });

  test('nor a plan, an association or an attribution: HAD_PLAN, ASSOCIATED_WITH or WAS_ATTRIBUTED_TO, in any case', () => {
    for (const type of [
      'HAD_PLAN',
      'had_plan',
      'ASSOCIATED_WITH',
      'associated_with',
      'WAS_ATTRIBUTED_TO',
      'Was_Attributed_To',
    ])
      assert.match(
        changesIn(answer({ op: 'add-link', from: 'large_reader', type, to: 'question' })).unread,
        /cannot add a HAD_PLAN, ASSOCIATED_WITH or WAS_ATTRIBUTED_TO link/,
        type,
      );
  });

  test('any other thing is still proposed, and so is a link to a Person that is already there', () => {
    assert.ok(Array.isArray(changesIn(answer({ op: 'add-thing', name: 'gadget', kind: 'Option', properties: {} }))));
    assert.ok(Array.isArray(changesIn(answer({ op: 'add-link', from: 'alice', type: 'ASKED', to: 'question' }))));
  });
});

describe('only the declaration the editor writes is written with the first accept', () => {
  const header = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada`;

  /** A change set from elsewhere, whose first item names its own author, accepting its SET alone. */
  const acceptSet = (first) => {
    const block = `${header}\n${first}\nSET large_reader.price = 4`;
    const note = `${NOTE}\n\`\`\`gql\n${block}\n\`\`\`\n`;
    const review = ProposalReview.fromChangeSet(block, note);
    const set = review.proposal.changes.find((c) => c.op === 'set');
    return { review, r: review.accept(note, [set.id], ROGER, { at: NOW }), note };
  };

  test('a first item that names the author with more than the declaration is an ordinary change, not written unasked', () => {
    for (const first of [
      "(ada:Person {admin: true})-[:OWNS]->(vault:Thing {name: 'Vault'})",
      "(ada:Model {name: 'ada', admin: true})",
      "(ada:Person {name: 'ada'})",
      "(ada:Model {name: 'Ada'})",
    ]) {
      const { review, r } = acceptSet(first);
      assert.equal(r.ok, true, `${first}: ${r.reason}`);
      assert.deepEqual(r.ids, [review.proposal.changes.find((c) => c.op === 'set').id], first);
      assert.deepEqual(modelsIn(r.note), [], first);
      assert.equal(review.state(review.proposal.changes[0].id), 'pending', first);
    }
  });

  test('exactly what the editor writes for a model or a step, for that header’s `by`, is its declaration', () => {
    for (const [kind, first] of [
      ['model', "(ada:Model {name: 'ada'})"],
      ['step', "(ada:Person:Step {name: 'ada'})"],
    ]) {
      const p = proposalOf({ by: { name: 'ada', kind }, changes: [{ op: 'add', gql: first }, ...CHANGES.slice(2, 3)] });
      assert.equal(declaresProposer(p, p.changes[0]), true, kind);
      assert.equal(declaresProposer(p, p.changes[1]), false, kind);
    }
  });

  test('a name with characters a pattern would read is compared as text: it declares nothing and breaks nothing', () => {
    for (const name of ['a.c', 'a(b', 'a*', '[x', 'a|b', '$']) {
      const p = proposalOf({
        by: { name, kind: 'model' },
        changes: [{ op: 'add', gql: "(abc:Model {name: 'abc'})" }, CHANGES[2]],
      });
      assert.doesNotThrow(() => declaresProposer(p, p.changes[0]), name);
      assert.equal(declaresProposer(p, p.changes[0]), false, name);
      const review = new ProposalReview(p);
      assert.doesNotThrow(() => review.accept(NOTE, [p.changes[1].id], ROGER, { at: NOW }), name);
    }
  });
});

describe('an accept of a proposal held only in memory is checked too', () => {
  test('a proposer the note does not know and the editor does not declare is refused, saying so', () => {
    const p = proposalOf({ by: { name: 'stranger', kind: 'person' } });
    const r = new ProposalReview(p).accept(NOTE, [C3], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /graph spec’s check of this change set fails.*stranger is a known person or model/);
  });

  test('a change the check fails for what it does is refused in memory as it is in the note', () => {
    const p = proposalOf({ changes: [{ op: 'remove-thing', thing: 'large_reader', detach: false }, CHANGES[2]] });
    const r = new ProposalReview(p).accept(NOTE, [p.changes[1].id], ROGER, { at: NOW });
    assert.equal(
      r.ok,
      false,
      'the plain DELETE of a thing with links fails the check, though only the SET is accepted',
    );
    assert.match(r.reason, /graph spec’s check of this change set fails.*a DELETE leaves no link without its end/);
  });

  test('a model’s proposal, declared by the editor as it would be written, passes', () => {
    const r = new ProposalReview(proposalOf()).accept(NOTE, [C3], ROGER, { at: NOW });
    assert.equal(r.ok, true, r.reason);
  });
});
