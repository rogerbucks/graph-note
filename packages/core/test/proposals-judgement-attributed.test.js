// Who proposed and who decided, kept as W3C PROV attributions in the note's judgement graph (the graph spec's
// req:24.prov-attributed). Each Decision is WAS_ATTRIBUTED_TO the proposer (the change set's `by`) and the person who
// decided. Each is an agent typed Person or Model (a Model counts as a SoftwareAgent). The plain `proposed_by` and
// `decided_by` texts stay, as typed; the decider is still never a link to a Person of the data graph.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { C1, C2, C3, C4, NOTE_WITH_ADA, NOW, blocksOf, noteWithChangeSet, proposalOf } from './proposals-fixtures.js';

const written = (proposal = proposalOf()) => noteWithChangeSet(proposal, NOTE_WITH_ADA);
const accepted = (r) => {
  assert.equal(r.ok, true, 'refused: ' + (r.reason ?? ''));
  return r;
};
const judgementBlock = (note) => blocksOf(note).find((b) => /^\/\/ graph: (?:\w+_)?judgements\b/.test(b));
/** The note's judgement graph, read as any tool reads it. */
const judgementGraph = (note) => {
  const block = judgementBlock(note);
  return readNote([block]).world[/^\/\/ graph: (\S+)/.exec(block)[1]];
};
/** What a Decision is attributed to, by role: [labels, name]. */
function attributions(note, change) {
  const g = judgementGraph(note);
  const d = g.labelled('Decision').find((x) => g.p(x).change === change);
  return Object.fromEntries(
    g
      .out(d, 'WAS_ATTRIBUTED_TO')
      .map(([, , to, props]) => [props.role, [[...g.nodes.get(to)[0]].sort(), g.p(to).name]]),
  );
}

describe('req:24.prov-attributed: a decision is attributed to the proposer and to the person who decided', () => {
  test('an accept attributes the Decision to the proposer, a Model for a model, and to the decider, a Person', () => {
    const { note } = written();
    const as = accepted(new ProposalReview(proposalOf()).accept(note, [C3], { name: 'Dr  Roger B.' }, { at: NOW }));
    assert.deepEqual(attributions(as.note, C3), {
      proposed: [['Model'], 'ada'],
      decided: [['Person'], 'Dr  Roger B.'],
    });
  });

  test('a reject does the same', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C3], { name: 'Roger' }, { at: NOW }));
    assert.deepEqual(attributions(r.note, C3), { proposed: [['Model'], 'ada'], decided: [['Person'], 'Roger'] });
  });

  test('the plain texts stay beside the links, exactly as typed', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).accept(note, [C3], { name: 'Dr  Roger B.' }, { at: NOW }));
    const g = judgementGraph(r.note);
    const d = g.labelled('Decision').find((x) => g.p(x).change === C3);
    assert.equal(g.p(d).decided_by, 'Dr  Roger B.');
    assert.equal(g.p(d).proposed_by, 'ada');
  });

  test('a proposer that is a person is a Person, and one whose kind is not known is attributed to nobody', () => {
    const { note } = written(proposalOf({ by: { name: 'ada', kind: 'person' } }));
    const r = accepted(
      new ProposalReview(proposalOf({ by: { name: 'ada', kind: 'person' } })).accept(
        note,
        [C3],
        { name: 'Roger' },
        { at: NOW },
      ),
    );
    assert.deepEqual(attributions(r.note, C3).proposed, [['Person'], 'ada']);
    const none = written(proposalOf({ by: { name: 'ada' } }));
    const u = accepted(
      new ProposalReview(proposalOf({ by: { name: 'ada' } })).accept(none.note, [C3], { name: 'Roger' }, { at: NOW }),
    );
    assert.deepEqual(Object.keys(attributions(u.note, C3)), ['decided']);
  });

  test('the same agent decided or proposing twice is one node, written once', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const first = accepted(review.accept(note, [C3], { name: 'Roger' }, { at: NOW }));
    const second = accepted(review.accept(first.note, [C4], { name: 'Roger' }, { at: NOW }));
    const g = judgementGraph(second.note);
    assert.equal(g.labelled('Person').length, 1);
    assert.equal(g.labelled('Model').length, 1);
    assert.deepEqual(attributions(second.note, C4), { proposed: [['Model'], 'ada'], decided: [['Person'], 'Roger'] });
  });

  test('a person who proposes and decides is one Person, attributed in both roles', () => {
    const by = { name: 'ada', kind: 'person' };
    const { note } = written(proposalOf({ by }));
    const r = accepted(new ProposalReview(proposalOf({ by })).accept(note, [C3], { name: 'ada' }, { at: NOW }));
    const g = judgementGraph(r.note);
    assert.equal(g.labelled('Person').length, 1);
    assert.deepEqual(attributions(r.note, C3), { proposed: [['Person'], 'ada'], decided: [['Person'], 'ada'] });
  });

  test('the judgement graph passes the graph spec’s attribution check', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).accept(note, [C1, C2], { name: 'Roger' }, { at: NOW }));
    const block = judgementBlock(r.note);
    const name = /^\/\/ graph: (\S+)/.exec(block)[1];
    const world = gs.worldFromStore(gs.read([block]));
    const checks = gs.check(world, name, {});
    const attribution = checks.filter(([label]) => /req:24\.prov-attributed/.test(label));
    assert.equal(attribution.length, 1);
    assert.equal(attribution[0][1], true);
  });

  test('taking the decision back takes the agents out with it', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(note, [C3], { name: 'Roger' }, { at: NOW }));
    const back = review.undo(r.note);
    assert.equal(back.ok, true, back.reason ?? '');
    assert.equal(judgementBlock(back.note), undefined);
  });
});
