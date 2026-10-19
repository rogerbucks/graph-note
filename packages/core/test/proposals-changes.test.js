// A proposal as data (editor spec §17): who proposed it, when, what it read and the state it was made against. Its
// changes — additions, changes of a property and removals — each have an id and a group. It has the builders a source
// with its answer as data uses (an AI's answer, §19, or a graph step's output, §20). So a proposal does not have to be
// written as GQL.
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
import { ADA, AT, BASIS, C1, C2, C3, C4, C5, CHANGES, proposalOf } from './proposals-fixtures.js';

const made = (over = {}) =>
  makeProposal({ id: 'cs1', graph: 'reader', by: ADA, basis: BASIS, changes: [CHANGES[0]], ...over });

describe('making a proposal', () => {
  test('gives each change its derived id, and the group its source did not name', () => {
    const p = proposalOf();
    assert.deepEqual(
      p.changes.map((c) => [c.id, c.group]),
      [
        [C1, 'New Option'],
        [C2, 'New ANSWERS links'],
        [C3, 'Changed price'],
        [C4, 'Removed ANSWERS links'],
        [C5, 'Removed things'],
      ],
    );
    assert.equal(new Set(p.changes.map((c) => c.id)).size, 5);
    for (const c of p.changes) assert.match(c.id, /^[0-9a-f]{16}$/, 'the id is a hash of the statement, not a number');
  });

  test('keeps a group a source gave, and never takes an id from the source: the id is the statement’s', () => {
    const p = made({
      changes: [{ ...CHANGES[0], id: 'c1' }, CHANGES[1], { ...CHANGES[2], id: 'c2', group: ' Prices ' }],
    });
    assert.deepEqual(
      p.changes.map((c) => [c.id, c.group]),
      [
        [C1, 'New Option'],
        [C2, 'New ANSWERS links'],
        [C3, 'Prices'],
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
    // a value is one value: never more than the property it is for, whatever it is dressed as
    for (const value of ['4, extra: true', "4}), (mallory:Option {name: 'Mallory'", '4, other.x = 5'])
      assert.match(
        refused({ op: 'set', thing: 'a', key: 'k', value }),
        /change 2: .*one value, and nothing else/,
        value,
      );
    for (const value of ['4', "'two, three'", "'a}), (b'", "DATE '2026-10-13'", 'true'])
      assert.equal(made({ changes: [{ op: 'set', thing: 'a', key: 'k', value }] }).refused, undefined, value);
    assert.match(refused({ op: 'remove-thing', thing: 'two words' }), /change 2: a removal names the thing/);
    assert.match(refused({ op: 'remove-link', from: 'a', type: 'R', to: '' }), /change 2: a removal of a link/);
    assert.match(refused({ ...CHANGES[0], group: ' ' }), /change 2: a group/);
    assert.match(refused({ ...CHANGES[0], reason: 'a\nb' }), /change 2: a reason/);
  });

  test('is refused when one change is proposed twice, however it is spaced: the two have the one derived id', () => {
    const again = { op: 'add', gql: "(small_reader : Option {name:'Small reader'})" };
    assert.match(made({ changes: [CHANGES[0], again] }).refused, /two changes are the same change/);
    assert.match(made({ changes: [CHANGES[2], { ...CHANGES[2] }] }).refused, /same change/);
  });
});

describe('the value of a change of a property', () => {
  const refused = (value) => made({ changes: [{ op: 'set', thing: 'a', key: 'k', value }] }).refused;

  test('is one value: a number, a truth, a date or a text, with brackets and commas in the text as it likes', () => {
    for (const value of ['4', 'true', "DATE '2026-10-13'", "'a}), (b'", "'two, three'", "'[1, 2]'"])
      assert.equal(refused(value), undefined, value);
  });

  test('is refused when it carries more than the property it is for, however it is written', () => {
    for (const value of ['4, extra: true', "4}), (mallory:Option {name: 'Mallory'", '4, other.x = 5', '[1}), (m:T'])
      assert.match(refused(value), /gives one value, and nothing else/, value);
  });

  // the document profile holds no list value (the reader: "'[' is not a value a graph can hold"). So a list literal is no
  // value to write. It is refused here, rather than accepted and then refused when the change is written
  test('is never a list literal, which the profile cannot hold, alone or with more', () => {
    for (const value of ['[1, 2]', "['a', 'b']", '[1, 2], extra: 3'])
      assert.match(refused(value), /gives one value, and nothing else/, value);
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
    const state = (id) => ({ [C1]: 'accepted', [C2]: 'rejected' })[id] ?? 'pending';
    assert.deepEqual(groupsOf(proposalOf(), state)[0], {
      name: 'New Option',
      ids: [C1],
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
      'The change set says it was proposed by roger, a person.',
      'It says it was proposed on 13 Oct 2026.',
      'It says it read: a.',
    ]);
    assert.equal(
      provenanceLines(made({ by: { name: 's', kind: 'step' }, at: '2026-10-13T09:00:00+10:00' }))[1],
      'It says it was proposed on 13 Oct 2026, 09:00.',
    );
    assert.equal(
      provenanceLines(made({ by: { name: 's', kind: 'step' } }))[0],
      'The change set says it was proposed by s, a graph step.',
    );
    assert.equal(
      provenanceLines(made({ by: { name: 's', kind: 'unknown' } }))[0],
      'The change set says it was proposed by s, of a kind it does not say.',
    );
    assert.equal(
      provenanceLines(made({ at: '2026-10-13T00:00:00Z' }))[1],
      'It says it was proposed on 13 Oct 2026, 00:00 UTC.',
    );
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
