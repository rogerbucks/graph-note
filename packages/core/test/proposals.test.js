// Proposals (editor spec §17, AI proposals — accepted or rejected in the editor): a change set proposed by an AI, or by any
// other source, is shown over the graph with nothing written, and each change in it is accepted or rejected by a person,
// on its own, in a group or all at once. An accepted change is written as text through the ordinary edit path, checked
// first and undone like any other edit; a rejected one leaves the graph as it was and is recorded in the change set.
// Each describe below is one requirement, named by its id.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@graph-note/graph-spec';
import { readNote } from '../src/drawing.ts';
import { lockBlock } from '../src/lock.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { MARK_WORDS } from '../src/proposals-marks.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { makeProposal } from '../src/proposals.ts';
import {
  ADA,
  AT,
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
  ROGER,
  blocksOf,
  decisionsIn,
  noteOf,
  noteWithChangeSet,
  proposalOf,
} from './proposals-fixtures.js';

const basisFor = (note) => basisOf(note, 'reader');
const accepted = (r) => {
  assert.equal(r.ok, true, 'refused: ' + (r.reason ?? ''));
  return r;
};
const SMALL = "(small_reader:Option {name: 'Small reader'})";
const LINK = '(small_reader)-[:ANSWERS]->(question)';
const marks = (shown) => ({
  boxes: [...shown.marks.boxes].map(([k, m]) => [k, m.kind]).sort(),
  links: [...shown.marks.links].map(([k, m]) => [k, m.kind]).sort(),
});

describe('proposal_shown_not_applied: a proposal is shown over the graph, each kind of change marked, and nothing written', () => {
  test('additions, changes and removals are each marked on the things and links they concern', () => {
    const shown = new ProposalReview(proposalOf()).show(NOTE);
    assert.deepEqual(marks(shown), {
      boxes: [
        ['alice', 'remove'],
        ['large_reader', 'change'],
        ['small_reader', 'add'],
      ],
      links: [
        [0, 'remove'],
        [1, 'add'],
      ],
    });
    assert.deepEqual(
      shown.rows.map((r) => r.mark),
      ['add', 'add', 'change', 'remove', 'remove'],
    );
  });

  test('a mark is said in words as well as drawn, so it is never told by colour alone', () => {
    assert.deepEqual(MARK_WORDS, { add: 'Added', change: 'Changed', remove: 'Removed' });
  });

  test('the drawing is the graph with the proposal laid over it: what is added and changed is drawn, what is removed is still there', () => {
    const { reading } = new ProposalReview(proposalOf()).show(NOTE);
    const drawn = reading.graphs.get('reader');
    assert.deepEqual(
      drawn.boxes.map((b) => b.key),
      ['question', 'large_reader', 'alice', 'small_reader'],
    );
    assert.equal(reading.world.reader.p('large_reader').price, 4);
    assert.equal(drawn.links.length, 2);
  });

  test('nothing is written: the note is the same, the review is undecided, and showing again gives the same', () => {
    const review = new ProposalReview(proposalOf());
    const first = review.show(NOTE);
    const again = review.show(NOTE);
    assert.deepEqual(marks(again), marks(first));
    assert.deepEqual(
      again.rows.map((r) => r.state),
      ['pending', 'pending', 'pending', 'pending', 'pending'],
    );
    const read = readNote(blocksOf(NOTE));
    assert.equal(
      read.graphs.get('reader').boxes.some((b) => b.key === 'small_reader'),
      false,
    );
    assert.equal(read.world.reader.p('large_reader').price, 3);
  });

  test('a change that could not be accepted says so in its row, in the words of the edit that refused it', () => {
    const proposal = proposalOf({ changes: [{ op: 'add', gql: "(alice:Person {name: 'Alicia'})" }, CHANGES[0]] });
    const rows = new ProposalReview(proposal).show(NOTE).rows;
    assert.match(rows[0].blocked, /alice is already a name in graph reader/);
    assert.equal(rows[1].blocked, null);
  });
});

describe('proposal_one_by_one: each change is accepted or rejected on its own, or all at once', () => {
  test('accepting one change writes that change and no other; the rest wait', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(NOTE, [C1], ROGER, { at: NOW }));
    assert.deepEqual(r.ids, [C1]);
    assert.equal(blocksOf(r.note)[0], `${GRAPH},\n${SMALL}`);
    assert.deepEqual(
      review.show(r.note).rows.map((x) => x.state),
      ['accepted', 'pending', 'pending', 'pending', 'pending'],
    );
  });

  test('one change is accepted and another rejected, in either order, each recorded with who and when', () => {
    const review = new ProposalReview(proposalOf());
    const rejected = accepted(review.reject(NOTE, [C3], ROGER, { at: NOW }));
    const r = accepted(review.accept(rejected.note, [C1], ROGER, { at: NOW }));
    assert.equal(blocksOf(r.note)[0], `${GRAPH},\n${SMALL}`);
    assert.deepEqual(review.decision(C3), { state: 'rejected', by: 'roger', at: NOW });
    assert.deepEqual(review.decision(C1), { state: 'accepted', by: 'roger', at: NOW });
    assert.equal(review.decision(C2), undefined);
  });

  test('all at once applies every change still waiting, in the order proposed, and one undo takes them all back', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(NOTE, { all: true }, ROGER, { at: NOW }));
    assert.deepEqual(r.ids, [C1, C2, C3, C4, C5]);
    assert.equal(
      blocksOf(r.note)[0],
      `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 4}),
${SMALL},
${LINK}`,
    );
    assert.equal(accepted(review.undo(r.note)).note, NOTE);
    assert.deepEqual(review.pending(), [C1, C2, C3, C4, C5]);
  });

  test('a change already decided is not decided again, and an id the proposal does not hold is refused', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(NOTE, [C1], ROGER, { at: NOW }));
    const again = review.accept(r.note, [C1], ROGER, { at: NOW });
    assert.equal(again.ok, false);
    assert.match(again.reason, new RegExp(`${C1} was already accepted by roger`));
    assert.match(review.accept(r.note, ['nosuchchange'], ROGER, { at: NOW }).reason, /no change nosuchchange/);
  });

  test('a change that needs another is refused with that other named, and nothing is written', () => {
    const review = new ProposalReview(proposalOf());
    const r = review.accept(NOTE, [C2], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, new RegExp(`${C2} needs ${C1}, which adds small_reader: accept ${C1} first`));
    assert.equal(review.pending().length, 5);
  });
});

describe('accepting_is_an_edit: an accepted change is written as text, checked first, like any other edit', () => {
  test('the text of the graph block gains exactly the change, and nothing else in the note moves', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(NOTE, [C1], ROGER, { at: NOW }));
    assert.equal(r.note, NOTE.replace(GRAPH, `${GRAPH},\n${SMALL}`));
    assert.deepEqual(readNote(blocksOf(r.note)).problems, []);
  });

  test('a change in a property is written in the thing’s own pattern', () => {
    const r = accepted(new ProposalReview(proposalOf()).accept(NOTE, [C3], ROGER, { at: NOW }));
    assert.equal(r.note, NOTE.replace('price: 3', 'price: 4'));
  });

  test('a removal takes out the text that wrote the link, and the comma that parted it, and nothing else', () => {
    const r = accepted(new ProposalReview(proposalOf()).accept(NOTE, [C4], ROGER, { at: NOW }));
    assert.equal(r.note, NOTE.replace(',\n(large_reader)-[:ANSWERS]->(question)', ''));
  });

  test('it is checked as the pane checks an edit: a name the graph has is refused in the pane’s words, and nothing is written', () => {
    const proposal = proposalOf({ changes: [{ op: 'add', gql: "(alice:Person {name: 'Alicia'})" }] });
    const review = new ProposalReview(proposal);
    const [only] = proposal.changes;
    const r = review.accept(NOTE, [only.id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /alice is already a name in graph reader: choose another/);
    assert.deepEqual(review.pending(), [only.id]);
  });

  test('a thing the graph draws only under a suggested name is not named until its name is accepted', () => {
    const note = noteOf(`${GRAPH},\n(:Option {name: 'Tablet'})`);
    const proposal = proposalOf({
      basis: basisFor(note),
      changes: [{ op: 'add', gql: '(tablet)-[:ANSWERS]->(question)' }],
    });
    const r = new ProposalReview(proposal).accept(note, [proposal.changes[0].id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /accept its name first/);
  });

  test('a change that leaves the graph with a problem it did not have is refused, saying which', () => {
    const schema = lockBlock(readNote([GRAPH]), 'reader', '2026-10-13');
    const note = `${NOTE}\n\`\`\`gql\n${schema}\n\`\`\`\n`;
    assert.deepEqual(
      readNote(blocksOf(note)).problems.filter((p) => p.severity !== 'hint'),
      [],
    );
    const proposal = proposalOf({
      basis: basisFor(note),
      changes: [{ op: 'add', gql: "(gadget:Gadget {name: 'Gadget'})" }],
    });
    const r = new ProposalReview(proposal).accept(note, [proposal.changes[0].id], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.match(r.reason, /Gadget/);
  });

  test('undone, it gives the note back as it was, byte for byte, and the change is waiting again', () => {
    const review = new ProposalReview(proposalOf());
    assert.equal(review.canUndo(), false);
    const r = accepted(review.accept(NOTE, [C3], ROGER, { at: NOW }));
    assert.equal(review.canUndo(), true);
    const u = accepted(review.undo(r.note));
    assert.equal(u.note, NOTE);
    assert.equal(review.state(C3), 'pending');
    assert.equal(review.canUndo(), false);
    assert.equal(review.undo(u.note).ok, false);
  });

  test('an undo that cannot be made, as the block has changed since, leaves the decision there to be undone', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(NOTE, [C3], ROGER, { at: NOW }));
    const changed = r.note.replace("name: 'Alice'", "name: 'Alicia'");
    assert.equal(review.undo(changed).ok, false);
    assert.equal(review.canUndo(), true);
    assert.equal(review.state(C3), 'accepted');
    assert.equal(accepted(review.undo(r.note)).note, NOTE);
    assert.equal(review.state(C3), 'pending');
  });
});

describe('rejecting_recorded: rejecting a change leaves the graph unchanged and records the rejection in the note', () => {
  test('the graph block is the same bytes, and the judgement graph says who rejected which change, and when', () => {
    const { note, block } = noteWithChangeSet();
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.reject(note, [C3], ROGER, { at: NOW }));
    assert.equal(blocksOf(r.note)[0], GRAPH);
    assert.notEqual(blocksOf(r.note)[1], block);
    assert.deepEqual(decisionsIn(r.note).get(C3), { state: 'rejected', by: 'roger', at: NOW });
    assert.equal(decisionsIn(r.note).size, 1);
  });

  test('the rejected change leaves the change set, so a tool that applies the set never applies it', () => {
    const { note } = noteWithChangeSet();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C3], ROGER, { at: NOW }));
    assert.doesNotMatch(blocksOf(r.note)[1], /SET large_reader\.price/);
    assert.match(blocksOf(r.note)[1], /MATCH \(v \{id: 'alice'\}\) DETACH DELETE v/);
  });

  test('every other byte of the note is kept: the change set loses the change and nothing else is rewritten', () => {
    const { note } = noteWithChangeSet();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C3], ROGER, { at: NOW }));
    assert.equal(blocksOf(r.note)[0], blocksOf(note)[0]);
    assert.ok(r.note.startsWith(note.slice(0, note.indexOf('```gql\n// graph: reader · CHANGE SET'))));
    assert.ok(r.note.includes('After.\n'));
  });

  test('it is still a change set after, against the same state and by the same author', () => {
    const { note } = noteWithChangeSet();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C3], ROGER, { at: NOW }));
    assert.deepEqual(gs.changesetHeader(blocksOf(r.note)[1]), {
      graph: 'reader',
      id: 'cs1',
      against: BASIS,
      by: 'ada',
    });
  });

  test('read again from the note, a rejected change stays rejected, and cannot then be accepted', () => {
    const { note } = noteWithChangeSet();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, [C3], ROGER, { at: NOW }));
    const again = ProposalReview.fromChangeSet(blocksOf(r.note)[1], r.note);
    assert.equal(again.state(C3), 'rejected');
    assert.equal(again.show(r.note).rows[2].state, 'rejected');
    assert.match(
      again.accept(r.note, [C3], ROGER, { at: NOW }).reason,
      new RegExp(`${C3} was already rejected by roger`),
    );
  });

  test('where the change set is not in the note the rejection is decided in memory only: nothing is written', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.reject(NOTE, [C3], ROGER, { at: NOW }));
    assert.equal(r.note, NOTE);
    assert.equal(review.state(C3), 'rejected');
    assert.doesNotMatch(review.changeSetText(), /SET large_reader\.price/);
  });

  test('rejecting all at once leaves the graph untouched and records every one', () => {
    const { note } = noteWithChangeSet();
    const r = accepted(new ProposalReview(proposalOf()).reject(note, { all: true }, ROGER, { at: NOW }));
    assert.equal(blocksOf(r.note)[0], GRAPH);
    assert.equal(decisionsIn(r.note).size, 5);
  });
});

describe('proposal_provenance: a proposal shows who proposed it, when and what it read, and says if its basis has moved', () => {
  test('says who proposed it, when, and what it read', () => {
    const shown = new ProposalReview(proposalOf({ read: ['reader', 'Notes/Devices'] })).show(NOTE);
    assert.deepEqual(shown.provenance, [
      'The change set says it was proposed by ada, a model.',
      'It says it was proposed on 13 Oct 2026, 09:00 UTC.',
      'It says it read: reader; Notes/Devices.',
    ]);
  });

  test('says so when it is not told when it was proposed or what it read, rather than leaving it out', () => {
    const shown = new ProposalReview(proposalOf({ at: null, read: [] })).show(NOTE);
    assert.deepEqual(shown.provenance, [
      'The change set says it was proposed by ada, a model.',
      'It does not say when it was proposed.',
      'It does not say what it read.',
    ]);
  });

  test('a proposal is refused that does not say who proposed it or the state it was made against', () => {
    const base = { id: 'cs1', graph: 'reader', changes: CHANGES, basis: BASIS };
    assert.match(makeProposal({ ...base, by: { name: '', kind: 'model' } }).refused, /who proposed it/);
    assert.match(makeProposal({ ...base, by: ADA, basis: 'moved' }).refused, /state/);
  });

  test('the basis is the graph’s state as graph-spec’s change sets name it: a change set made against it passes that check', () => {
    const base = blocksOf(NOTE);
    const block = `// graph: reader · CHANGE SET cs1 · against ${BASIS} · by ada\n${SMALL}`;
    const results = gs.checkChangeset(base, block, {}).results;
    assert.deepEqual(
      results.find(([label]) => label.startsWith('it was made against the graph as it stands')),
      ['it was made against the graph as it stands', true],
    );
  });

  test('a proposal whose graph has moved since says so before anything is accepted, and nothing is accepted until it is seen', () => {
    const moved = NOTE.replace('price: 3', 'price: 5');
    const review = new ProposalReview(proposalOf());
    const shown = review.show(moved);
    assert.match(shown.stale.message, /changed since this was proposed/);
    assert.equal(review.show(NOTE).stale, null);
    const r = review.accept(moved, [C1], ROGER, { at: NOW });
    assert.equal(r.ok, false);
    assert.equal(r.stale.was, BASIS);
    assert.match(r.reason, /changed since this was proposed/);
    assert.equal(review.state(C1), 'pending');
    const seen = accepted(review.accept(moved, [C1], ROGER, { at: NOW, staleSeen: true }));
    assert.equal(blocksOf(seen.note)[0], moved.match(/```gql\n([\s\S]*?)\n```/)[1] + `,\n${SMALL}`);
  });

  test('the graph moving because changes were accepted is not the basis moving: the rest of the proposal is not called stale', () => {
    const { note } = noteWithChangeSet(proposalOf(), NOTE_WITH_ADA);
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(note, [C1], ROGER, { at: NOW }));
    assert.equal(review.show(r.note).stale, null);
    const reread = ProposalReview.fromChangeSet(
      blocksOf(r.note).find((b) => b.includes('CHANGE SET')),
      r.note,
    );
    assert.equal(reread.show(r.note).stale, null);
    assert.equal(accepted(reread.accept(r.note, [C3], ROGER, { at: NOW })).ids[0], C3);
  });
});

describe('person_decides: the editor never applies a proposal without a person accepting it', () => {
  test('showing, reading back, grouping and writing out the proposal apply none of it and decide none of it', () => {
    const review = new ProposalReview(proposalOf());
    const text = review.changeSetText();
    review.show(NOTE);
    review.show(NOTE.replace('price: 3', 'price: 5'));
    assert.equal(review.changeSetText(), text);
    assert.deepEqual(review.pending(), [C1, C2, C3, C4, C5]);
    assert.deepEqual(review.decisions(), []);
  });

  test('accepting needs a person: none given, a blank name, or an object that is no person, is refused', () => {
    const review = new ProposalReview(proposalOf());
    for (const by of [undefined, null, {}, { name: '' }, { name: '   ' }, 'roger'])
      assert.match(review.accept(NOTE, [C1], by, { at: NOW }).reason, /a person decides/);
    assert.deepEqual(review.pending().length, 5);
  });

  test('rejecting needs a person too', () => {
    const review = new ProposalReview(proposalOf());
    assert.match(review.reject(NOTE, [C1], undefined, { at: NOW }).reason, /a person decides/);
    assert.equal(review.state(C1), 'pending');
  });

  test('whoever proposed a change, if not a person, cannot be the one to accept it', () => {
    const review = new ProposalReview(proposalOf());
    assert.match(
      review.accept(NOTE, [C1], { name: 'ada' }, { at: NOW }).reason,
      /ada proposed this, and is not a person/,
    );
    assert.match(review.reject(NOTE, [C1], { name: 'ada' }, { at: NOW }).reason, /a person decides/);
    const own = new ProposalReview(proposalOf({ by: { name: 'roger', kind: 'person' } }));
    // a person who proposes is declared by the one who owns the graph, which the check wants of any author
    const known = `${NOTE}\n\`\`\`gql\n// graph: people\n(roger:Person {name: 'Roger'})\n\`\`\`\n`;
    assert.equal(own.accept(known, [C1], ROGER, { at: NOW }).ok, true);
  });

  test('the proposer is known by its name in any case, and no other name is taken for it', () => {
    const named = new ProposalReview(proposalOf({ by: { name: 'Ada', kind: 'model' } }));
    assert.match(
      named.accept(NOTE, [C1], { name: 'aDA' }, { at: NOW }).reason,
      /Ada proposed this, and is not a person/,
    );
    assert.match(named.accept(NOTE, [C1], { name: ' ada ' }, { at: NOW }).reason, /proposed this, and is not a person/);
    // a person at the keyboard whose label is not the proposer's is never blocked, whatever the proposer is called
    const you = new ProposalReview(proposalOf({ by: { name: 'you', kind: 'model' } }));
    assert.equal(you.accept(NOTE, [C1], { name: 'the reader' }, { at: NOW }).ok, true);
  });

  test('a proposer is known by its raw name: one called the_reader is no stand-in for the person labelled "the reader"', () => {
    const review = new ProposalReview(proposalOf({ by: { name: 'the_reader', kind: 'model' } }));
    assert.equal(review.accept(NOTE, [C1], { name: 'the reader' }, { at: NOW }).ok, true);
    assert.match(review.accept(NOTE, [C2], { name: 'The_Reader' }, { at: NOW }).reason, /is not a person/);
  });

  test('an empty choice applies nothing', () => {
    const review = new ProposalReview(proposalOf());
    const r = accepted(review.accept(NOTE, [], ROGER, { at: NOW }));
    assert.equal(r.note, NOTE);
    assert.deepEqual(r.ids, []);
  });
});

/** A proposal of many changes: twelve things, a link for each, and six prices of one thing. */
function bigProposal() {
  const changes = [];
  for (let i = 1; i <= 12; i++) changes.push({ op: 'add', gql: `(o${i}:Option {name: 'Option ${i}'})` });
  for (let i = 1; i <= 12; i++) changes.push({ op: 'add', gql: `(o${i})-[:ANSWERS]->(question)` });
  for (let i = 1; i <= 6; i++)
    changes.push({ op: 'set', thing: 'large_reader', key: `p${i}`, value: String(i), group: 'Prices' });
  return proposalOf({ changes });
}

describe('big_proposal: many changes are reviewed in groups, and accept-all applies to one group at a time', () => {
  test('a proposal with many changes is grouped, each group named for what it holds', () => {
    const shown = new ProposalReview(bigProposal()).show(NOTE);
    assert.equal(shown.grouped, true);
    assert.deepEqual(
      shown.groups.map((g) => [g.name, g.ids.length, g.pending]),
      [
        ['New Option', 12, 12],
        ['New ANSWERS links', 12, 12],
        ['Prices', 6, 6],
      ],
    );
  });

  test('a small proposal is not grouped, though its changes still have groups to choose by', () => {
    const shown = new ProposalReview(proposalOf()).show(NOTE);
    assert.equal(shown.grouped, false);
    assert.deepEqual(
      shown.groups.map((g) => g.name),
      ['New Option', 'New ANSWERS links', 'Changed price', 'Removed ANSWERS links', 'Removed things'],
    );
  });

  test('accept-all on a group applies that group’s changes and no other', () => {
    const review = new ProposalReview(bigProposal());
    const r = accepted(review.accept(NOTE, { group: 'New Option' }, ROGER, { at: NOW }));
    assert.equal(r.ids.length, 12);
    const drawn = readNote(blocksOf(r.note)).graphs.get('reader');
    assert.equal(drawn.boxes.filter((b) => b.kind === 'Option').length, 13);
    assert.equal(drawn.links.length, 1);
    assert.deepEqual(
      review.show(r.note).groups.map((g) => [g.name, g.pending]),
      [
        ['New Option', 0],
        ['New ANSWERS links', 12],
        ['Prices', 6],
      ],
    );
  });

  test('accept-all on a group applies only what is still waiting in it, and one undo takes back that group', () => {
    const big = bigProposal();
    const review = new ProposalReview(big);
    const one = accepted(review.accept(NOTE, [big.changes[0].id], ROGER, { at: NOW }));
    const r = accepted(review.accept(one.note, { group: 'New Option' }, ROGER, { at: NOW }));
    assert.equal(r.ids.length, 11);
    assert.equal(accepted(review.undo(r.note)).note, one.note);
  });

  test('a group is rejected as a whole too, and nothing in the graph moves', () => {
    const { note } = noteWithChangeSet(bigProposal());
    const review = new ProposalReview(bigProposal());
    const r = accepted(review.reject(note, { group: 'Prices' }, ROGER, { at: NOW }));
    assert.equal(r.ids.length, 6);
    assert.equal(blocksOf(r.note)[0], GRAPH);
    assert.equal(decisionsIn(r.note).size, 6);
  });

  test('a group the proposal does not hold is refused', () => {
    const r = new ProposalReview(bigProposal()).accept(NOTE, { group: 'Nothing' }, ROGER, { at: NOW });
    assert.match(r.reason, /no group called Nothing/);
  });

  test('a group of links accepted before the things they join is refused, naming what is missing', () => {
    const r = new ProposalReview(bigProposal()).accept(NOTE, { group: 'New ANSWERS links' }, ROGER, { at: NOW });
    assert.equal(r.ok, false);
    const ids = new ProposalReview(bigProposal()).proposal.changes.map((c) => c.id);
    assert.match(r.reason, new RegExp(`${ids[12]} needs ${ids[0]}, which adds o1: accept ${ids[0]} first`));
  });
});

describe('proposals_read_back: each proposed change is read back in plain English, as lines are in the text pane', () => {
  test('an addition, a change and a removal each say what they do', () => {
    const rows = new ProposalReview(proposalOf()).show(NOTE).rows;
    assert.deepEqual(
      rows.map((r) => r.said),
      [
        'Added: Small reader is an Option',
        'Added: Small reader —ANSWERS→ Which device?',
        'Changed: Large reader: price is 4',
        'Removed: Large reader —ANSWERS→ Which device?',
        'Removed: Alice is a Person',
      ],
    );
  });

  test('each row also holds the exact text of the change: the GQL it writes, the SET line, or the removal', () => {
    assert.deepEqual(
      new ProposalReview(proposalOf()).show(NOTE).rows.map((r) => r.text),
      [
        SMALL,
        LINK,
        'SET large_reader.price = 4',
        "MATCH (a {id: 'large_reader'})-[r:ANSWERS]->(b {id: 'question'}) DELETE r",
        "MATCH (v {id: 'alice'}) DETACH DELETE v",
      ],
    );
  });

  test('a link is read in the words its schema gives the type, as the text pane reads it', () => {
    const declared = `${GRAPH},
(kind_a:ElementType {id: 'type:ANSWERS', name: 'ANSWERS', kind: 'edge', reading: 'is an answer to', reverse_name: 'is answered by'}),
(meta:GraphMeta {id: 'meta:reader', graph: 'reader', schema: 'reader@1'}),
(meta)-[:DECLARES]->(kind_a)`;
    const note = noteOf(declared);
    const proposal = proposalOf({ basis: basisFor(note), changes: [CHANGES[0], CHANGES[1]] });
    const rows = new ProposalReview(proposal).show(note).rows;
    assert.equal(rows[1].said, 'Added: Small reader is an answer to Which device?');
  });

  test('a change refused is still read back, in the same words', () => {
    const proposal = proposalOf({ changes: [{ op: 'add', gql: '(ghost)-[:ANSWERS]->(question)' }] });
    const row = new ProposalReview(proposal).show(NOTE).rows[0];
    assert.match(row.blocked, /needs ghost, which is not in the graph/);
    assert.equal(row.said, 'Added: ghost (not in the graph) —ANSWERS→ Which device?');
  });

  test('a change rejected, which is not in the drawing, is read back the same as when it waited', () => {
    const { note } = noteWithChangeSet();
    const review = new ProposalReview(proposalOf());
    const before = review.show(note).rows.map((r) => r.said);
    const r = accepted(review.reject(note, [C1, C2], ROGER, { at: NOW }));
    assert.deepEqual(
      review.show(r.note).rows.map((x) => x.said),
      before,
    );
  });
});
