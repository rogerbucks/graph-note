// Completing as you type (editor spec §4, autocomplete): what to offer inline after the caret — the closer of a bracket,
// brace or quote just opened, a keyword, a declared kind or relationship type, a property name or a value already used —
// the best single match as the text to add; and the closer typed where it is already there, stepped over.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { inlineCompletion, stepOver } from '../src/autocomplete.ts';

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader', price: 300}),
(small:Option {name: 'Small reader'}),
(notes:Source {title: 'Trial notes'}),
(large)-[:ANSWERS]->(q),
(large)-[:CITES {where: 'day 2'}]->(notes)`;
const reading = readNote([BLOCK]);
/** What is offered with the caret at the end of `typed`, written on a new line of the block. */
const offer = (typed, r = reading) => {
  const text = BLOCK + ',\n' + typed;
  return inlineCompletion(r, 'reader', text, text.length);
};

describe('closing what was just opened', () => {
  test('a bracket, brace or quote just opened offers its closer, with the caret left inside', () => {
    const opened = [
      ['(', ')'],
      ['(x:T {', '}'],
      ['(a)-[', ']'],
      ["(x:T {name: '", "'"],
      ['(x:T {name: "', '"'],
    ];
    for (const [open, close] of opened)
      assert.deepEqual(offer(open), { add: close, kind: 'closer', caretAfter: 0 }, open);
  });

  test('the innermost bracket still open is closed once something is written in it, with the caret after', () => {
    assert.deepEqual(offer('(zzz'), { add: ')', kind: 'closer', caretAfter: 1 });
    assert.deepEqual(offer("(x:Option {name: 'it'"), { add: '}', kind: 'closer', caretAfter: 1 });
    assert.equal(offer('(zzz,'), null, 'after a comma more is coming');
    assert.equal(offer('(zzz '), null, 'after a space more is coming');
  });

  test('nothing is offered when the bracket is closed already, or text follows the caret on its line', () => {
    const closed = BLOCK + ',\n(zzz)';
    assert.equal(inlineCompletion(reading, 'reader', closed, closed.length - 1), null, '(zzz|) is closed');
    const tail = BLOCK + ',\n(zzz tail';
    assert.equal(inlineCompletion(reading, 'reader', tail, BLOCK.length + 6), null, 'text follows the caret');
  });

  test('nothing is offered inside a comment, or at the very start of the text', () => {
    assert.equal(offer('// (see'), null);
    assert.equal(offer('// it'), null);
    assert.equal(inlineCompletion(reading, 'reader', '(a', 0), null);
  });
});

describe('keywords', () => {
  test('a statement keyword is completed from its first two letters, in the case being typed', () => {
    assert.deepEqual(offer('MA'), { add: 'TCH', kind: 'keyword', caretAfter: 3 });
    assert.deepEqual(offer('ins'), { add: 'ert', kind: 'keyword', caretAfter: 3 });
    assert.deepEqual(offer('SE'), { add: 'T', kind: 'keyword', caretAfter: 1 });
  });

  test('one letter is not enough, and a keyword already complete adds nothing', () => {
    assert.equal(offer('M'), null);
    assert.equal(offer('SET'), null);
  });

  test('a value keyword is offered where a value goes, and DATE before the longer DATETIME', () => {
    assert.deepEqual(offer('(x:Option {ordered: DAT'), { add: 'E', kind: 'keyword', caretAfter: 1 });
    assert.deepEqual(offer('(x:Option {ordered: DATE'), { add: 'TIME', kind: 'keyword', caretAfter: 4 });
    assert.deepEqual(offer('(x:Option {done: TR'), { add: 'UE', kind: 'keyword', caretAfter: 2 });
    assert.deepEqual(offer('(x:Option {done: fa'), { add: 'lse', kind: 'keyword', caretAfter: 3 });
  });

  test('no keyword is offered after a dot: it is a property of something', () => {
    assert.equal(offer('a.se'), null);
    assert.equal(offer('WHERE a.in'), null);
  });

  test('a statement keyword is not offered inside a pattern, a string or a comment', () => {
    assert.notEqual(offer('(MA')?.kind, 'keyword');
    assert.equal(offer("(x:Option {name: 'MA"), null);
    assert.equal(offer('// MA'), null);
  });
});

describe('kinds and relationship types', () => {
  test('after (name: a kind already in the graph is completed', () => {
    assert.deepEqual(offer('(z:Op'), { add: 'tion', kind: 'kind', caretAfter: 4 });
    assert.deepEqual(offer('(z:So'), { add: 'urce', kind: 'kind', caretAfter: 4 });
  });

  test('only what the typed letters begin exactly is offered: another case would write an undeclared spelling', () => {
    assert.deepEqual(offer('(z:op'), { add: ')', kind: 'closer', caretAfter: 1 });
    assert.deepEqual(offer('(large)-[:an'), { add: ']', kind: 'closer', caretAfter: 1 });
    const schema = `// graph: reader
(k1:Meta:ElementType {name: 'Reason', kind: 'node'})`;
    assert.equal(offer('(z:re', readNote([BLOCK, schema]))?.kind, 'closer');
  });

  test('with no kind matching, the open bracket is closed instead', () => {
    assert.deepEqual(offer('(z:Zzz'), { add: ')', kind: 'closer', caretAfter: 1 });
  });

  test('after -[: a relationship type already in the graph is completed', () => {
    assert.deepEqual(offer('(large)-[:AN'), { add: 'SWERS', kind: 'type', caretAfter: 5 });
  });

  test('a locked graph offers only the kinds and types its schema declares', () => {
    const schema = `// graph: reader
(k1:Meta:ElementType {name: 'Option', kind: 'node'}), (k2:Meta:ElementType {name: 'Reason', kind: 'node'}),
(e1:Meta:ElementType {name: 'FAVOURS', kind: 'edge', reading: 'favours'})`;
    const locked = readNote([BLOCK, schema]);
    assert.deepEqual(offer('(z:Re', locked), { add: 'ason', kind: 'kind', caretAfter: 4 }, 'declared, not yet used');
    assert.equal(offer('(z:So', locked)?.kind, 'closer', 'used, but not declared');
    assert.deepEqual(offer('(large)-[:FA', locked), { add: 'VOURS', kind: 'type', caretAfter: 5 });
  });
});

describe('property names and values already used', () => {
  test('after { a property name used on that kind is completed, with its colon', () => {
    assert.deepEqual(offer('(z:Option {na'), { add: 'me: ', kind: 'property', caretAfter: 4 });
    assert.deepEqual(offer('(z:Question {ti'), { add: 'tle: ', kind: 'property', caretAfter: 5 });
  });

  test('after a comma inside the braces too, but never a name already written there', () => {
    assert.deepEqual(offer("(z:Option {name: 'a', pr"), { add: 'ice: ', kind: 'property', caretAfter: 5 });
    assert.notEqual(offer("(z:Option {name: 'a', na")?.kind, 'property');
    assert.notEqual(offer('(z:Option {NA')?.kind, 'property', 'a name is case-sensitive: NA is not na');
  });

  test('a link’s properties are those used on links of that type', () => {
    assert.deepEqual(offer('(large)-[:CITES {wh'), { add: 'ere: ', kind: 'property', caretAfter: 5 });
  });

  test('inside a string after name: a value already used for that property on that kind is completed', () => {
    assert.deepEqual(offer("(z:Option {name: 'Sm"), { add: "all reader'", kind: 'value', caretAfter: 11 });
    assert.deepEqual(offer("(z:Option {name: 'L"), { add: "arge reader'", kind: 'value', caretAfter: 12 });
  });

  test('a value is not borrowed from another property or another kind', () => {
    assert.equal(offer("(z:Option {title: 'Wh"), null);
    assert.equal(offer("(z:Source {name: 'Sm"), null);
  });

  test('the value most often used is the best match; one with a quote in it is completed escaped', () => {
    const more = readNote([
      `// graph: g\n(a:T {n: 'Alpha'}), (b:T {n: 'Alpine'}), (c:T {n: 'Alpine'}), (d:T {n: 'it\\'s long'})`,
    ]);
    const at = (text) => inlineCompletion(more, 'g', text, text.length);
    assert.equal(at("(e:T {n: 'Al")?.add, "pine'");
    assert.equal(at("(e:T {n: 'it")?.add, "\\'s long'");
  });
});

describe('the closer typed where it is already there', () => {
  /** The text after a keystroke that inserted `typed` at `at` of `before`, and what stepping over would change. */
  const keyed = (before, at, typed) => stepOver(before, before.slice(0, at) + typed + before.slice(at), at + 1);

  test('typing a closer before the one that closes the bracket still open steps over it', () => {
    assert.deepEqual(keyed('(a)', 2, ')'), { from: 3, to: 4, text: '' });
    assert.deepEqual(keyed("(x:T {n: 'a'})", 12, '}'), { from: 13, to: 14, text: '' });
    assert.deepEqual(keyed("(x:T {n: 'a'})", 11, "'"), { from: 12, to: 13, text: '' });
  });

  test('a closer with nothing open to close, or a different one next, is typed as it is', () => {
    assert.equal(keyed('a)', 1, ')'), null);
    assert.equal(keyed('(a]', 2, ')'), null);
    assert.equal(keyed('(a', 2, ')'), null);
  });

  test('only a single typed character counts: a paste is left alone', () => {
    assert.equal(stepOver('(a)', '(a))))', 4), null);
  });

  test('inside a string a bracket is only a character', () => {
    assert.equal(keyed("('a)", 3, ')'), null);
  });
});
