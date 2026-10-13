// One change of a proposal written as text (editor spec §17, accepting_is_an_edit): on the texts of a graph's blocks, so the
// same code lays a proposal over a graph without writing and writes an accepted change. What cannot be done by taking out
// or putting in whole items is refused, not guessed at.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { applyChange, namesOf, newProblems, notTaken } from '../src/proposals-apply.ts';

/** A block of graph g: its items one to a line, comma-separated as a block writes them. */
const g = (...lines) => ['// graph: g', lines.join(',\n')].join('\n');
const change = (c) => ({ id: 'c1', group: 'x', ...c });
const apply = (texts, c) => {
  const r = applyChange(texts, 'g', change(c));
  assert.ok(r.ok, r.reason);
  return r.texts;
};
const refusal = (texts, c) => {
  const r = applyChange(texts, 'g', change(c));
  assert.equal(r.ok, false, 'applied: ' + JSON.stringify(r.texts));
  return r.reason;
};

describe('an addition', () => {
  test('is written after the last item of the graph’s last block, with the comma the block needs', () => {
    const texts = [g("(a:T {name: 'A'})", "(b:T {name: 'B'})"), 'not graph', g("(c:T {name: 'C'})")];
    assert.deepEqual(apply(texts, { op: 'add', gql: "(d:T {name: 'D'})" }), [
      texts[0],
      'not graph',
      g("(c:T {name: 'C'})", "(d:T {name: 'D'})"),
    ]);
  });

  test('is written before a SET the block ends with', () => {
    const [text] = apply([g("(a:T {name: 'A'})", 'SET a.x = 1')], { op: 'add', gql: "(b:T {name: 'B'})" });
    assert.equal(text, g("(a:T {name: 'A'})", "(b:T {name: 'B'})", 'SET a.x = 1'));
  });

  test('is written into the last block of data, never the schema locked after it', () => {
    const schema = "// graph: g · SOURCE\n(g_meta:GraphMeta {graph: 'g', schema: 'g@1'})";
    const texts = [g("(a:T {name: 'A'})"), schema];
    assert.deepEqual(apply(texts, { op: 'add', gql: "(b:T {name: 'B'})" }), [
      g("(a:T {name: 'A'})", "(b:T {name: 'B'})"),
      schema,
    ]);
  });

  test('has nowhere to go in a note with no block of the graph', () => {
    assert.match(refusal(['x', '// graph: other\n(a:T)'], { op: 'add', gql: '(b:T)' }), /graph g has no block/);
  });

  test('names what it writes, and what it needs to be there already', () => {
    assert.deepEqual(namesOf(change({ op: 'add', gql: '(a:T)-[:R]->(b)' })), { writes: ['a'], needs: ['b'] });
    assert.deepEqual(namesOf(change({ op: 'add', gql: "(a:T {name: 'x'})" })), { writes: ['a'], needs: [] });
    assert.deepEqual(namesOf(change({ op: 'set', thing: 'a', key: 'k', value: '1' })), { writes: [], needs: ['a'] });
    assert.deepEqual(namesOf(change({ op: 'remove-link', from: 'a', type: 'R', to: 'b' })), {
      writes: [],
      needs: ['a', 'b'],
    });
  });
});

describe('a change of a property', () => {
  test('is made in the map of the pattern that writes the thing, adding the key if it is not there', () => {
    const texts = [g("(a:T {name: 'A', price: 3})", "(b:T {name: 'B'})")];
    assert.equal(
      apply(texts, { op: 'set', thing: 'a', key: 'price', value: '4' })[0],
      g("(a:T {name: 'A', price: 4})", "(b:T {name: 'B'})"),
    );
    assert.equal(
      apply(texts, { op: 'set', thing: 'b', key: 'price', value: '9' })[0],
      g("(a:T {name: 'A', price: 3})", "(b:T {name: 'B', price: 9})"),
    );
  });

  test('is made in the SET that already gives the property, whatever block it is in', () => {
    const texts = [g("(a:T {name: 'A', price: 3})"), g('SET a.price = 5, a.size = 1')];
    assert.deepEqual(apply(texts, { op: 'set', thing: 'a', key: 'price', value: '4' }), [
      texts[0],
      g('SET a.price = 4, a.size = 1'),
    ]);
  });

  test('is a map added to the pattern when the pattern has none, and a key added to a block that also has a SET', () => {
    assert.equal(
      apply([g('(a:T)', "(b:T {name: 'B'})")], { op: 'set', thing: 'a', key: 'price', value: '4' })[0],
      g('(a:T {price: 4})', "(b:T {name: 'B'})"),
    );
    assert.equal(
      apply([g("(a:T {name: 'A'})", 'SET a.x = 1')], { op: 'set', thing: 'a', key: 'y', value: "'two'" })[0],
      g("(a:T {name: 'A', y: 'two'})", 'SET a.x = 1'),
    );
  });

  test('is refused for a thing no block of the graph writes, saying to edit it where it is written', () => {
    assert.match(
      refusal([g("(a:T {name: 'A'})")], { op: 'set', thing: 'ghost', key: 'k', value: '1' }),
      /ghost is not written in a block/,
    );
  });
});

describe('a removal of a link', () => {
  test('takes out the item that is that link alone, whichever way its arrow points, and the comma parting it', () => {
    const texts = [g('(a:T)', '(b:T)', '(a)-[:R]->(b)', '(c:T)', '(c)<-[:R]-(a)')];
    const one = apply(texts, { op: 'remove-link', from: 'a', type: 'R', to: 'b' });
    assert.equal(one[0], g('(a:T)', '(b:T)', '(c:T)', '(c)<-[:R]-(a)'));
    const other = apply(texts, { op: 'remove-link', from: 'a', type: 'R', to: 'c' });
    assert.equal(other[0], g('(a:T)', '(b:T)', '(a)-[:R]->(b)', '(c:T)'));
  });

  test('is refused where the link is written in a longer path, saying to edit it in the text', () => {
    const texts = [g('(a:T)-[:R]->(b:T)')];
    assert.match(
      refusal(texts, { op: 'remove-link', from: 'a', type: 'R', to: 'b' }),
      /not written by itself.*edit it in the text/,
    );
  });
});

describe('a removal of a thing', () => {
  const texts = [g("(a:T {name: 'A'})", "(b:T {name: 'B'})", '(a)-[:R]->(b)', '(b)-[:R]->(a)', 'SET a.x = 1, b.y = 2')];

  test('takes out the item that writes it, the links that are items of their own and the SET lines that give it properties', () => {
    assert.equal(apply(texts, { op: 'remove-thing', thing: 'a' })[0], g("(b:T {name: 'B'})", 'SET b.y = 2'));
  });

  test('keeps the one SET a block may have when the item that carried the word goes', () => {
    const [text] = apply(texts, { op: 'remove-thing', thing: 'b' });
    assert.match(text, /SET a\.x = 1\s*$/);
    assert.doesNotMatch(text, /b/);
  });

  test('is refused where the thing is written in a longer path, or named in one', () => {
    assert.match(refusal([g('(a:T)-[:R]->(b:T)')], { op: 'remove-thing', thing: 'a' }), /not written by itself/);
    assert.match(
      refusal([g('(a:T)', '(b:T)', '(a)-[:R]->(b)-[:R]->(c:T)')], { op: 'remove-thing', thing: 'a' }),
      /named in a longer path/,
    );
  });
});

describe('reading back what was written', () => {
  const reading = (...lines) => readNote([g(...lines)]);

  test('an addition took effect when its things and links are in the graph', () => {
    const c = change({ op: 'add', gql: '(a:T {name: "A"})-[:R]->(b:T {name: "B"})' });
    assert.equal(notTaken(reading("(a:T {name: 'A'})", "(b:T {name: 'B'})", '(a)-[:R]->(b)'), 'g', c), null);
    assert.match(notTaken(reading("(a:T {name: 'A'})"), 'g', c), /b is not in the graph/);
  });

  test('a change of a property took effect when the graph holds the value, read as the reader reads it', () => {
    const c = change({ op: 'set', thing: 'a', key: 'price', value: '4' });
    assert.equal(notTaken(reading("(a:T {name: 'A', price: 4})"), 'g', c), null);
    assert.match(notTaken(reading("(a:T {name: 'A', price: 3})"), 'g', c), /a\.price is not 4/);
    const text = change({ op: 'set', thing: 'a', key: 'name', value: "'A'" });
    assert.equal(notTaken(reading("(a:T {name: 'A'})"), 'g', text), null);
  });

  test('a removal took effect when the thing, or the link, is no longer in the graph', () => {
    const r = reading('(a:T)', '(b:T)', '(a)-[:R]->(b)');
    assert.match(notTaken(r, 'g', change({ op: 'remove-thing', thing: 'a' })), /a is still in the graph/);
    assert.match(
      notTaken(r, 'g', change({ op: 'remove-link', from: 'a', type: 'R', to: 'b' })),
      /link a R b is still in the graph/,
    );
    assert.equal(
      notTaken(reading('(a:T)', '(b:T)'), 'g', change({ op: 'remove-link', from: 'a', type: 'R', to: 'b' })),
      null,
    );
  });

  test('a problem is new when the graph has it after and did not before; a hint is no problem, and one already there is not new', () => {
    const before = reading('(a:T)', '(a)-[:R]->(b)');
    const same = reading('(a:T)', '(a)-[:R]->(b)', '(c:T)');
    assert.deepEqual(newProblems(before, same, 'g'), []);
    const worse = reading('(a:T)', '(a)-[:R]->(b)', '(c:T)-[:S]->(d)');
    assert.equal(newProblems(before, worse, 'g').length, 1);
    assert.match(newProblems(before, worse, 'g')[0].message, /d/);
  });
});
