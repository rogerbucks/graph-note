// A proposal as data (editor spec §17): who proposed it, when, what it read and the state it was made against; its changes —
// additions, changes of a property and removals — each with an id and a group; and the builders a source with its answer
// as data uses (an AI's answer, §19, or a graph step's output, §20), so a proposal does not have to be written as GQL.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIG_PROPOSAL,
  groupOf,
  groupsOf,
  linkChange,
  makeProposal,
  provenanceLines,
  thingChange,
  valueGql,
} from '../src/proposals.ts';
import { ADA, AT, BASIS, CHANGES, proposalOf } from './proposals-fixtures.js';

const made = (over = {}) =>
  makeProposal({ id: 'cs1', graph: 'reader', by: ADA, basis: BASIS, changes: [CHANGES[0]], ...over });

describe('making a proposal', () => {
  test('gives each change an id, c1 on, and the group its source did not name', () => {
    const p = proposalOf();
    assert.deepEqual(
      p.changes.map((c) => [c.id, c.group]),
      [
        ['c1', 'New Option'],
        ['c2', 'New ANSWERS links'],
        ['c3', 'Changed price'],
        ['c4', 'Removed ANSWERS links'],
        ['c5', 'Removed things'],
      ],
    );
  });

  test('keeps an id and a group a source gave, and numbers the others round them without a clash', () => {
    const p = made({
      changes: [{ ...CHANGES[0], id: 'c1' }, CHANGES[1], { ...CHANGES[2], id: 'c2', group: ' Prices ' }],
    });
    assert.deepEqual(
      p.changes.map((c) => [c.id, c.group]),
      [
        ['c1', 'New Option'],
        ['c3', 'New ANSWERS links'],
        ['c2', 'Prices'],
      ],
    );
  });

  test('keeps an addition as the one item it is, without a comma or a comment round it', () => {
    const p = made({ changes: [{ op: 'add', gql: "  (a:T {name: 'A'}), // my own" }] });
    assert.equal(p.changes[0].gql, "(a:T {name: 'A'})");
  });

  test('says who proposed it, when, what it read and the state it was made against', () => {
    const p = made({ at: AT, read: ['reader', 'Notes; Devices\n'] });
    assert.deepEqual(p.provenance, { by: ADA, at: AT, read: ['reader', 'Notes, Devices'], basis: BASIS });
    assert.deepEqual(made().provenance.read, []);
    assert.equal(made().provenance.at, null);
  });

  test('is refused without a proposer of one word, a state it was made against, or a change', () => {
    assert.match(made({ by: { name: 'two words', kind: 'model' } }).refused, /who proposed it/);
    assert.match(made({ basis: '' }).refused, /state of the graph/);
    assert.match(made({ basis: '05D75FDCBDB1D37B' }).refused, /state of the graph/);
    assert.match(made({ changes: [] }).refused, /at least one change/);
    assert.match(made({ id: 'two words' }).refused, /id of one word/);
    assert.match(made({ graph: '' }).refused, /names the graph/);
    assert.match(made({ at: 'yesterday' }).refused, /as a day/);
  });

  test('is refused for a change that is not written as a block writes it, naming which', () => {
    const refused = (change) => made({ changes: [CHANGES[0], change] }).refused;
    assert.match(refused({ op: 'add', gql: '(a:T), (b:T)' }), /change 2: an addition is one thing/);
    assert.match(refused({ op: 'add', gql: 'SET a.x = 1' }), /change 2: an addition/);
    assert.match(refused({ op: 'add', gql: 'nothing' }), /change 2: an addition/);
    assert.match(refused({ op: 'set', thing: 'a', key: 'id', value: "'x'" }), /change 2: a change of a property/);
    assert.match(refused({ op: 'set', thing: 'a', key: 'k', value: ' ' }), /gives its value/);
    assert.match(refused({ op: 'remove-thing', thing: 'two words' }), /change 2: a removal names the thing/);
    assert.match(refused({ op: 'remove-link', from: 'a', type: 'R', to: '' }), /change 2: a removal of a link/);
    assert.match(refused({ ...CHANGES[0], id: 'a b' }), /change 2: an id/);
    assert.match(refused({ ...CHANGES[0], group: ' ' }), /change 2: a group/);
    assert.match(refused({ ...CHANGES[0], reason: 'a\nb' }), /change 2: a reason/);
    assert.match(
      made({
        changes: [
          { ...CHANGES[0], id: 'x' },
          { ...CHANGES[1], id: 'x' },
        ],
      }).refused,
      /same id/,
    );
  });
});

describe('the groups of a proposal', () => {
  test('are named for what the changes add, change or remove', () => {
    const g = (c) => groupOf(c);
    assert.equal(g({ op: 'add', gql: '(a:Option)' }), 'New Option');
    assert.equal(g({ op: 'add', gql: '(a)-[:R]->(b)' }), 'New R links');
    assert.equal(g({ op: 'add', gql: "(a {name: 'x'})" }), 'Additions');
    assert.equal(g({ op: 'set', thing: 'a', key: 'price', value: '1' }), 'Changed price');
    assert.equal(g({ op: 'remove-thing', thing: 'a' }), 'Removed things');
    assert.equal(g({ op: 'remove-link', from: 'a', type: 'R', to: 'b' }), 'Removed R links');
  });

  test('count what waits, what is accepted and what is rejected, in the order the first change of each comes', () => {
    const state = (id) => ({ c1: 'accepted', c2: 'rejected' })[id] ?? 'pending';
    assert.deepEqual(groupsOf(proposalOf(), state)[0], {
      name: 'New Option',
      ids: ['c1'],
      pending: 0,
      accepted: 1,
      rejected: 0,
    });
    assert.deepEqual(
      groupsOf(proposalOf(), state).map((x) => [x.name, x.pending, x.accepted, x.rejected]),
      [
        ['New Option', 0, 1, 0],
        ['New ANSWERS links', 0, 0, 1],
        ['Changed price', 1, 0, 0],
        ['Removed ANSWERS links', 1, 0, 0],
        ['Removed things', 1, 0, 0],
      ],
    );
  });

  test('are asked for once a proposal is bigger than a person reads in one list', () => {
    assert.equal(BIG_PROPOSAL, 8);
  });
});

describe('saying where a proposal came from', () => {
  test('names the proposer’s kind, the day, the time in UTC when it is, and what was read', () => {
    assert.deepEqual(provenanceLines(made({ by: { name: 'roger', kind: 'person' }, at: '2026-10-13', read: ['a'] })), [
      'Proposed by roger, a person.',
      'Proposed on 13 Oct 2026.',
      'It read: a.',
    ]);
    assert.equal(
      provenanceLines(made({ by: { name: 's', kind: 'step' }, at: '2026-10-13T09:00:00+10:00' }))[1],
      'Proposed on 13 Oct 2026, 09:00.',
    );
    assert.equal(provenanceLines(made({ by: { name: 's', kind: 'step' } }))[0], 'Proposed by s, a graph step.');
    assert.equal(
      provenanceLines(made({ by: { name: 's', kind: 'unknown' } }))[0],
      'Proposed by s, of a kind not stated.',
    );
    assert.equal(provenanceLines(made({ at: '2026-10-13T00:00:00Z' }))[1], 'Proposed on 13 Oct 2026, 00:00 UTC.');
  });
});

describe('the builders for a source whose answer is data', () => {
  test('write a value as a block writes it', () => {
    assert.equal(valueGql("it's"), "'it\\'s'");
    assert.equal(valueGql(4), '4');
    assert.equal(valueGql(false), 'false');
  });

  test('write a thing and a link from their parts', () => {
    assert.deepEqual(thingChange('small_reader', 'Option', { name: 'Small reader', price: 2, new: true }), {
      op: 'add',
      gql: "(small_reader:Option {name: 'Small reader', price: 2, new: true})",
    });
    assert.deepEqual(thingChange('x', 'T', {}, { group: 'G', reason: 'because' }), {
      op: 'add',
      gql: '(x:T)',
      group: 'G',
      reason: 'because',
    });
    assert.deepEqual(linkChange('a', 'R', 'b', { since: 'then' }), { op: 'add', gql: "(a)-[:R {since: 'then'}]->(b)" });
    assert.equal(
      made({ changes: [thingChange('x', 'T', { name: 'X' }), linkChange('x', 'R', 'x')] }).changes.length,
      2,
    );
  });
});
