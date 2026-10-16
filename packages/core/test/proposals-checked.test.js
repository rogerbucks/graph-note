// A proposal checked by the graph spec's own change-set check, and who decided it (editor spec §17: proposals_checked,
// decider_named; the graph spec's cs-rejected-out). Every proposal the editor writes, removals and decisions included,
// passes `checkChangeset`, and its answer is shown. A removal is a real DELETE and a change of a value a real SET; a
// change's id is derived from its statement. An accepted or rejected change is kept as a Decision in the note's judgement
// graph (reused, or added), a rejected addition is nowhere in the live graph, and the decider is the settings' text as
// typed, or "you".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@graph-note/graph-spec';
import { noteWithProposal } from '../src/ai-answer.ts';
import { readNote } from '../src/drawing.ts';
import { statementOf } from '../src/proposals-statements.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { DECIDER_DEFAULT, deciderName } from '../src/proposals-judgement.ts';
import { makeProposal } from '../src/proposals.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';
import { changeSetText } from '../src/proposals-text.ts';
import {
  ADA,
  BASIS,
  C1,
  C2,
  C3,
  C4,
  C5,
  CHANGES,
  GRAPH,
  NOTE,
  NOTE_WITH_ADA,
  NOW,
  PEOPLE,
  ROGER,
  blocksOf,
  decisionsIn,
  noteWithChangeSet,
  proposalOf,
} from './proposals-fixtures.js';

const accepted = (r) => {
  assert.equal(r.ok, true, 'refused: ' + (r.reason ?? ''));
  return r;
};
/** The note's graphs the check is run against: everything but the change sets. */
const baseOf = (note) => blocksOf(note).filter((b) => !/CHANGE SET/.test(b.split('\n')[0]));
/** The change set block of a note, as the note holds it now. */
const setOf = (note) => blocksOf(note).find((b) => /CHANGE SET cs1/.test(b.split('\n')[0]));
/** The graph spec's check of the note's change set against the note's other graphs: the labels that failed. */
const failedIn = (note) =>
  gs
    .checkChangeset(baseOf(note), setOf(note), {})
    .results.filter(([, ok]) => !ok)
    .map(([label]) => label);
const judgementBlocks = (note) => blocksOf(note).filter((b) => /^\/\/ graph: (?:\w+_)?judgements\b/.test(b));
const written = (proposal = proposalOf()) => noteWithChangeSet(proposal, NOTE_WITH_ADA);
/** The Decision records of the note, by their change, with every property they hold. */
function recordsIn(note) {
  const [block] = judgementBlocks(note);
  const name = /^\/\/ graph: (\S+)/.exec(block)[1];
  const g = readNote([block]).world[name];
  return new Map(g.labelled('Decision').map((d) => [g.p(d).change, g.p(d)]));
}

describe('proposals_checked: every proposal the editor writes passes the graph spec’s own change-set check', () => {
  const shapes = {
    'one addition': [CHANGES[0]],
    'a link': [CHANGES[0], CHANGES[1]],
    'a change of a value': [CHANGES[2]],
    'a removal of a link': [CHANGES[3]],
    'a removal of a thing': [CHANGES[4]],
    'every kind together': CHANGES,
    'with a reason and a group': [
      { ...CHANGES[0], reason: 'a pocket one', group: 'Pocket' },
      { ...CHANGES[2], reason: 'costs more now' },
      { ...CHANGES[3], reason: 'no longer answers it' },
    ],
    'a text with a quotation and a comma in it': [
      { op: 'add', gql: '(odd:Option {name: \'Two, "odd" // things\'})' },
      { op: 'set', thing: 'large_reader', key: 'name', value: '\'Big, "large" // one\'' },
    ],
  };
  for (const [what, changes] of Object.entries(shapes))
    test(`a proposal of ${what} passes every line of the check`, () => {
      const { note } = written(proposalOf({ changes }));
      const { results, after } = gs.checkChangeset(baseOf(note), setOf(note), {});
      assert.deepEqual(
        results.filter(([, ok]) => !ok),
        [],
      );
      assert.ok(results.length >= 10, 'the whole check ran');
      assert.notEqual(after, null);
    });

  test('a removal of a thing with links is a DETACH DELETE, and the check lists the links it takes', () => {
    const p = proposalOf({ changes: [{ op: 'remove-thing', thing: 'large_reader' }] });
    const { note } = written(p);
    const { header, results } = gs.checkChangeset(baseOf(note), setOf(note), {});
    assert.deepEqual(
      results.filter(([, ok]) => !ok),
      [],
    );
    assert.deepEqual(header.changes[0].links, [['large_reader', 'ANSWERS', 'question']]);
  });

  test('the result is shown with the proposal: every line of the check’s answer, and whether it passed', () => {
    const { note } = written();
    const shown = new ProposalReview(proposalOf()).show(note);
    const answer = gs.checkChangeset(baseOf(note), setOf(note), {}).results;
    assert.deepEqual(
      shown.checked.results.map((r) => [r.label, r.ok]),
      answer,
    );
    assert.equal(shown.checked.passed, true);
  });

  test('a line that fails is shown as failed, naming it: a proposer the note’s graphs do not know', () => {
    const { note } = noteWithChangeSet(proposalOf(), NOTE);
    const shown = new ProposalReview(proposalOf()).show(note);
    assert.equal(shown.checked.passed, false);
    assert.deepEqual(
      shown.checked.results.filter((r) => !r.ok).map((r) => r.label),
      ['its author ada is a known person or model'],
    );
  });

  test('a proposal whose graph has moved shows the check’s own line for it, failed', () => {
    const { note } = written();
    const moved = note.replace('price: 3', 'price: 5');
    const shown = new ProposalReview(proposalOf()).show(moved);
    assert.deepEqual(
      shown.checked.results.filter((r) => !r.ok).map((r) => r.label),
      ['it was made against the graph as it stands'],
    );
  });

  test('a review given only the proposal, with the note holding no change set, is checked as the review writes it out', () => {
    const shown = new ProposalReview(proposalOf()).show(NOTE_WITH_ADA);
    assert.equal(shown.checked.passed, true);
  });

  test('every proposal it writes after a decision passes too, change by change, accepted or rejected', () => {
    let { note } = written();
    const review = ProposalReview.fromChangeSet(setOf(note), note);
    for (const [id, how] of [
      [C1, 'accept'],
      [C2, 'accept'],
      [C3, 'reject'],
      [C4, 'accept'],
      [C5, 'reject'],
    ]) {
      note = accepted(review[how](note, [id], ROGER, { at: NOW })).note;
      assert.deepEqual(failedIn(note), [], `${how} ${id}`);
    }
  });
});

describe('proposals_checked: a removal is a real DELETE, a change of a value a real SET, and the id is derived', () => {
  test('a removal is a DELETE of exactly one target, never a comment', () => {
    const { block } = written();
    assert.match(block, /^MATCH \(a \{id: 'large_reader'\}\)-\[r:ANSWERS\]->\(b \{id: 'question'\}\) DELETE r$/m);
    assert.match(block, /^MATCH \(v \{id: 'alice'\}\) DETACH DELETE v$/m);
    assert.match(block, /^SET large_reader\.price = 4$/m);
    assert.doesNotMatch(block, /remove:/);
    const { changes } = gs.splitChangeset(block);
    assert.deepEqual(
      changes.map((c) => gs.readChange(c.text).op),
      ['set-thing', 'delete-link', 'detach-delete-thing'],
    );
  });

  test('the id of a change is derived from its statement: the one the graph library gives', () => {
    const p = proposalOf();
    const { header } = gs.checkChangeset(baseOf(written().note), written().block, {});
    assert.deepEqual(
      header.changes.map((c) => c.id),
      [C3, C4, C5],
    );
    assert.deepEqual(
      p.changes.map((c) => c.id),
      [C1, C2, C3, C4, C5],
    );
  });

  test('the id is stable: the same change has the same id in another proposal, in another place, or written another way', () => {
    const other = proposalOf({ id: 'cs9', changes: [CHANGES[4], CHANGES[2], CHANGES[0]] });
    assert.deepEqual(
      other.changes.map((c) => c.id),
      [C5, C3, C1],
    );
    const spaced = proposalOf({
      changes: [
        { op: 'add', gql: "(small_reader:Option   {name:'Small reader'})" },
        { ...CHANGES[2], value: '4' },
      ],
    });
    assert.deepEqual(
      spaced.changes.map((c) => c.id),
      [C1, C3],
    );
    const again = ProposalReview.fromChangeSet(written().block, NOTE_WITH_ADA).proposal;
    assert.deepEqual(
      again.changes.map((c) => c.id),
      [C1, C2, C3, C4, C5],
    );
  });

  test('a different change has a different id, and an id a source supplies is not used', () => {
    const dearer = proposalOf({ changes: [{ ...CHANGES[2], value: '5' }] });
    assert.notEqual(dearer.changes[0].id, C3);
    const supplied = makeProposal({
      id: 'cs1',
      graph: 'reader',
      by: ADA,
      basis: BASIS,
      changes: [{ ...CHANGES[0], id: 'mine' }],
    });
    assert.equal(supplied.changes[0].id, C1);
    assert.doesNotMatch(changeSetText(supplied), /mine|\/\/@ change/);
  });

  test('the reason is the optional line `//@ reason:` directly above a change, which the check reports', () => {
    const p = proposalOf({ changes: [{ ...CHANGES[2], reason: 'it costs more now' }, CHANGES[3]] });
    const { note } = written(p);
    const { header } = gs.checkChangeset(baseOf(note), setOf(note), {});
    assert.deepEqual(
      header.changes.map((c) => c.reason),
      ['it costs more now', null],
    );
    assert.match(setOf(note), /\n\/\/@ reason: it costs more now\nSET large_reader\.price = 4\n/);
  });
});

describe('cs-rejected-out: a rejected addition leaves the live graph, and the rejection is kept as a Decision', () => {
  test('the rejected addition is in no graph and no change set: nothing that applies the note applies it', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C1, C2], ROGER, { at: NOW }));
    assert.doesNotMatch(setOf(r.note), /small_reader/);
    assert.equal(readNote(baseOf(r.note)).world.reader.nodes.has('small_reader'), false);
    // the change set, applied by the library, leaves it out too: what it adds is not the thing that was rejected
    const { results, after } = gs.checkChangeset(baseOf(r.note), setOf(r.note), {});
    assert.deepEqual(
      results.filter(([, ok]) => !ok),
      [],
    );
    assert.notEqual(after, null);
    assert.equal(baseOf(r.note)[0], GRAPH, 'the graph is the same bytes');
  });

  test('a thing is not rejected while a change that waits needs it: the set left would not load, so it is refused, naming it', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const r = review.reject(note, [C1], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, new RegExp(`${C2} needs small_reader, which ${C1} adds: reject ${C2} too`));
    assert.equal(review.state(C1), 'pending');
    assert.equal(review.reject(note, [C2], ROGER, { at: NOW }).ok, true);
  });

  test('the Decision holds the statement, who proposed it, who rejected it and when', () => {
    const { note } = written(proposalOf({ changes: [{ ...CHANGES[0], reason: 'a pocket one' }, CHANGES[1]] }));
    const p = ProposalReview.fromChangeSet(setOf(note), note);
    const [first, second] = p.proposal.changes;
    const r = accepted(p.reject(note, [first.id, second.id], ROGER, { at: NOW }));
    const d = recordsIn(r.note).get(first.id);
    assert.equal(d.state, 'rejected');
    assert.equal(d.statement, "(small_reader:Option {name: 'Small reader'})");
    assert.equal(d.proposed_by, 'ada');
    assert.equal(d.decided_by, 'roger');
    assert.equal(d.at, NOW);
    assert.equal(d.change_set, 'cs1');
    assert.equal(d.graph, 'reader');
    assert.equal(d.reason, 'a pocket one');
  });

  test('an accepted change is a Decision too, and leaves the set for the graph it was written into', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).accept(note, [C3], ROGER, { at: NOW }));
    assert.deepEqual(decisionsIn(r.note).get(C3), { state: 'accepted', by: 'roger', at: NOW });
    assert.equal(recordsIn(r.note).get(C3).statement, 'SET large_reader.price = 4');
    assert.doesNotMatch(setOf(r.note), /SET large_reader\.price/);
    assert.equal(readNote(baseOf(r.note)).world.reader.p('large_reader').price, 4);
  });

  test('the set that is left is held to the graph as the accepts left it, and still passes', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).accept(note, [C1], ROGER, { at: NOW }));
    assert.equal(gs.changesetHeader(setOf(r.note)).against, basisOf(r.note, 'reader'));
    assert.notEqual(gs.changesetHeader(setOf(r.note)).against, BASIS);
    assert.deepEqual(failedIn(r.note), []);
  });

  test('the judgement graph is added when the note has none, as a block of its own after the change set', () => {
    const { note } = written();
    assert.equal(judgementBlocks(note).length, 0);
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C2], ROGER, { at: NOW }));
    assert.equal(judgementBlocks(r.note).length, 1);
    assert.match(judgementBlocks(r.note)[0], /^\/\/ graph: judgements\n\(decision_/);
    const blocks = blocksOf(r.note);
    assert.equal(blocks.indexOf(judgementBlocks(r.note)[0]), blocks.indexOf(setOf(r.note)) + 1);
  });

  test('the judgement graph is reused when the note has one, whatever else it holds', () => {
    const own = "// graph: reader_judgements\n(earlier:Decision {title: 'Large reader chosen'})";
    const { note } = noteWithChangeSet(proposalOf(), `${NOTE_WITH_ADA}\n\`\`\`gql\n${own}\n\`\`\`\n`);
    const review = new ProposalReview(proposalOf());
    const one = accepted(review.reject(note, [C2], ROGER, { at: NOW }));
    const two = accepted(review.accept(one.note, [C3], ROGER, { at: NOW }));
    assert.equal(judgementBlocks(two.note).length, 1);
    assert.equal(blocksOf(two.note).length, blocksOf(note).length, 'no block was added');
    assert.match(judgementBlocks(two.note)[0], /^\/\/ graph: reader_judgements\n\(earlier:Decision/);
    assert.equal(recordsIn(two.note).get(C2).state, 'rejected');
    assert.equal(recordsIn(two.note).get(C3).state, 'accepted');
  });

  test('a second decision joins the first in the same block', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const one = accepted(review.reject(note, [C2], ROGER, { at: NOW }));
    const two = accepted(review.reject(one.note, [C1], ROGER, { at: NOW }));
    assert.equal(judgementBlocks(two.note).length, 1);
    assert.deepEqual(new Set(decisionsIn(two.note).keys()), new Set([C1, C2]));
  });

  test('the judgement block reads without a problem, and links to nothing: the decider is not a Person', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, { all: true }, ROGER, { at: NOW }));
    const read = readNote(blocksOf(r.note));
    assert.deepEqual(
      read.problems.filter((p) => p.severity !== 'hint'),
      [],
    );
    const name = /^\/\/ graph: (\S+)/.exec(judgementBlocks(r.note)[0])[1];
    assert.equal(read.world[name].edges.length, 0);
    assert.equal(read.world[name].labelled('Person').length, 0);
  });

  test('fully decided, the change set is a header the check still passes, and the record is all in the judgement graph', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, { all: true }, ROGER, { at: NOW }));
    assert.equal(setOf(r.note).split('\n').length, 3, 'the header, when and what it read');
    assert.deepEqual(failedIn(r.note), []);
    assert.equal(decisionsIn(r.note).size, 5);
  });

  test('read again from the note, what was decided stays decided, in the order proposed, with the changes that wait', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const one = accepted(review.reject(note, [C2], ROGER, { at: NOW }));
    const two = accepted(review.accept(one.note, [C3], ROGER, { at: NOW }));
    const again = ProposalReview.fromChangeSet(setOf(two.note), two.note);
    assert.deepEqual(
      again.proposal.changes.map((c) => c.id),
      [C1, C2, C3, C4, C5],
    );
    assert.deepEqual(
      again.show(two.note).rows.map((r) => r.state),
      ['pending', 'rejected', 'accepted', 'pending', 'pending'],
    );
    assert.deepEqual(again.proposal, review.proposal, 'the review and a fresh reading of the note agree');
  });

  test('an accept or reject undone takes the Decisions out and gives the note back byte for byte', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const one = accepted(review.reject(note, [C2], ROGER, { at: NOW }));
    const two = accepted(review.accept(one.note, [C3], ROGER, { at: NOW }));
    assert.equal(accepted(review.undo(two.note)).note, one.note);
    assert.equal(accepted(review.undo(one.note)).note, note);
    assert.equal(judgementBlocks(note).length, 0);
    assert.equal(review.state(C2), 'pending');
  });

  test('an undo that cannot be made, as the judgement block was changed since, leaves the decision to be undone', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const one = accepted(review.reject(note, [C2], ROGER, { at: NOW }));
    const edited = one.note.replace("state: 'rejected'", "state: 'accepted'");
    assert.notEqual(edited, one.note);
    assert.equal(review.undo(edited).ok, false);
    assert.equal(review.canUndo(), true);
    assert.equal(review.state(C2), 'rejected');
  });

  test('the old form is refused, saying so, and nothing is decided', () => {
    const old = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada\n//@ change: c1\n//@ remove: thing alice`;
    const r = ProposalReview.fromChangeSet(old, NOTE_WITH_ADA);
    assert.match(r.refused, /old form/);
  });
});

describe('decider_named: the person who accepts or rejects is recorded by the name set in the settings, or as "you"', () => {
  test('the name is the settings’ text exactly as typed: spaces and capitals kept', () => {
    assert.equal(deciderName('Dr  Roger B.'), 'Dr  Roger B.');
    assert.equal(deciderName(' R. Bucks '), ' R. Bucks ');
    assert.equal(deciderName('ROGER'), 'ROGER');
  });

  test('the settings keep it as typed, on one line, and an option on the page asks for it; nothing set is empty', () => {
    assert.equal(DEFAULT_SETTINGS.decider, '');
    assert.equal(settingsFrom({ decider: 'Dr  Roger B.' }).decider, 'Dr  Roger B.');
    assert.equal(settingsFrom({ decider: 'Two\nlines' }).decider, 'Two lines');
    assert.equal(settingsFrom({ decider: 42 }).decider, '');
    assert.equal(deciderName(settingsFrom({ decider: 'Dr  Roger B.' }).decider), 'Dr  Roger B.');
    assert.equal(deciderName(settingsFrom(null).decider), 'you');
    const o = OPTIONS.find((x) => x.key === 'decider');
    assert.equal(o.section, 'Proposals');
    assert.match(o.sentence, /exactly as you type it.*“you”/);
  });

  test('a proposer called "you" does not stop the person who is recorded as "you"', () => {
    const { note } = written(proposalOf({ by: { name: 'you', kind: 'model' } }));
    const r = new ProposalReview(proposalOf({ by: { name: 'you', kind: 'model' } })).accept(
      note,
      [C3],
      { name: deciderName('') },
      { at: NOW },
    );
    assert.equal(r.ok, true, r.reason);
  });

  test('with nothing set, or only spaces, it is "you"', () => {
    for (const none of [undefined, null, '', '   ', '\t'])
      assert.equal(deciderName(none), DECIDER_DEFAULT, JSON.stringify(none));
    assert.equal(DECIDER_DEFAULT, 'you');
  });

  test('an accept records the name as typed, in the judgement graph', () => {
    const { note } = written();
    const as = deciderName('Dr  Roger B.');
    const r = accepted(new ProposalReview(proposalOf()).accept(note, [C3], { name: as }, { at: NOW }));
    assert.equal(recordsIn(r.note).get(C3).decided_by, 'Dr  Roger B.');
    assert.equal(decisionsIn(r.note).get(C3).by, 'Dr  Roger B.');
  });

  test('a reject records it too, and "you" where none is set', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const typed = accepted(review.reject(note, [C3], { name: deciderName('Roger Bucks') }, { at: NOW }));
    const unset = accepted(review.reject(typed.note, [C4], { name: deciderName('') }, { at: NOW }));
    assert.equal(recordsIn(unset.note).get(C3).decided_by, 'Roger Bucks');
    assert.equal(recordsIn(unset.note).get(C4).decided_by, 'you');
  });

  test('the proposer is the change set’s `by`, kept apart from the decider', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C3], { name: 'Roger Bucks' }, { at: NOW }));
    assert.equal(recordsIn(r.note).get(C3).proposed_by, 'ada');
    assert.equal(gs.changesetHeader(setOf(r.note)).by, 'ada');
  });

  test('a decider with a space or a capital is not mistaken for the proposer, and a blank one decides nothing', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    assert.equal(review.accept(note, [C1], { name: '   ' }, { at: NOW }).ok, false);
    assert.equal(review.accept(note, [C1], { name: 'Ada Lovelace' }, { at: NOW }).ok, true);
  });

  test('the name is plain text, not a link: no Person is made, and no edge written', () => {
    const { note } = written();
    const r = accepted(new ProposalReview(proposalOf()).accept(note, [C3], { name: 'Dr  Roger B.' }, { at: NOW }));
    assert.doesNotMatch(judgementBlocks(r.note)[0], /Person|DECIDED_BY|-\[/);
    assert.equal(blocksOf(r.note).includes(PEOPLE), true, 'the people graph is as it was');
  });
});

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
    const refused = noteWithProposal(NOTE, proposalOf());
    assert.match(refused.refused, /graph spec’s check of this change set fails.*ada is a known person or model/);
    const text = noteWithProposal(NOTE_WITH_ADA, proposalOf());
    assert.equal(typeof text, 'string');
    assert.deepEqual(failedIn(text), []);
    const stale = noteWithProposal(NOTE_WITH_ADA.replace('price: 3', 'price: 5'), proposalOf());
    assert.match(stale.refused, /made against the graph as it stands/);
  });
});

describe('proposals_checked: a DELETE keeps what it says, and a label in the MATCH is held to', () => {
  test('a plain DELETE is read as plain, written back as plain, and never detaches', () => {
    const { block, note } = {
      block: `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada\nMATCH (v {id: 'large_reader'}) DELETE v`,
      note: NOTE_WITH_ADA,
    };
    const [c] = ProposalReview.fromChangeSet(block, note).proposal.changes;
    assert.equal(c.detach, false);
    assert.equal(statementOf(c), "MATCH (v {id: 'large_reader'}) DELETE v");
    const detached = ProposalReview.fromChangeSet(block.replace('DELETE v', 'DETACH DELETE v'), note).proposal
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
      assert.equal(decisionsIn(r.note).size, 1);
    }
  });
});

describe('proposals_checked: an addition is one line, and a step’s ids are plain words', () => {
  test('a line break outside a text is refused in an addition, so nothing can write a line of its own into the set', () => {
    for (const gql of ["(a:T {name: 'x'}\n)", '(a:T)\r', '(a:T)\n//@ reason: smuggled', '(a:T)\nSET b.x = 1'])
      assert.match(
        makeProposal({
          id: 'cs1',
          graph: 'reader',
          by: ADA,
          basis: BASIS,
          changes: [{ op: 'add', gql }],
        }).refused ?? '',
        /one line|one thing/,
        JSON.stringify(gql),
      );
    const fine = makeProposal({
      id: 'cs1',
      graph: 'reader',
      by: ADA,
      basis: BASIS,
      changes: [{ op: 'add', gql: "(a:T {name: 'two\\nlines'})" }],
    });
    assert.equal(fine.refused, undefined);
  });
});
