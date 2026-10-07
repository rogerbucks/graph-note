// The comma added for you (editor spec §4, comma_added_for_you; decided 7 Oct 2026): while typing, once the next pattern
// starts on a new line and the line before is otherwise valid, the comma is added at the end of the line before. Never
// when it would not make the block valid, never twice, never inside a string or a comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commaFor } from '../src/commas.ts';

/** Where the comma goes after typing `typed` at the end of `before`: the index in the new text, or null. */
const after = (before, typed = '(') => {
  const text = before + typed;
  return commaFor(text, text.length);
};

test('a ( that starts a new line after a complete pattern adds the comma at the end of that pattern', () => {
  const text = "// graph: g\n(a:T {name: 'A'})\n";
  assert.equal(after(text), text.indexOf(')\n') + 1);
});

test('blank lines, comment lines and indentation between them make no difference', () => {
  const text = '// graph: g\n(a:T)\n\n// the next thing\n    ';
  assert.equal(after(text), '// graph: g\n(a:T)'.length);
});

test('the comma goes after the pattern, before any spaces at the end of its line', () => {
  assert.equal(after('// graph: g\n(a:T)   \n'), '// graph: g\n(a:T)'.length);
});

test('a line that already ends with a comma gets no second one', () => {
  assert.equal(after('// graph: g\n(a:T),\n'), null);
});

test('a line that is not otherwise valid gets none: the comma would not make the block valid', () => {
  assert.equal(after('// graph: g\n(a:T {name: })\n'), null);
  assert.equal(after('// graph: g\n(a:T\n'), null);
  assert.equal(after('// graph: g\n(a)-[:R]->\n'), null);
});

test('only a ( at the start of a line asks for one: mid-line, or anything else typed, does not', () => {
  assert.equal(after('// graph: g\n(a:T) '), null);
  assert.equal(after('// graph: g\n(a:T)\n', 'x'), null);
  assert.equal(after('// graph: g\n(a:T)\n(b', ':'), null);
});

test('nothing is added inside a string or after SET, and nothing on the graph line', () => {
  assert.equal(after("// graph: g\n(a:T {name: 'first\n"), null);
  assert.equal(after('// graph: g\n(a:T)\nSET a.x = 1\n'), null);
  assert.equal(after('// graph: g\n'), null);
});

test('a link line counts as a complete pattern', () => {
  const text = '// graph: g\n(a:T),\n(b:T),\n(a)-[:R]->(b)\n';
  assert.equal(after(text), text.lastIndexOf(')') + 1);
});

test('in a note, the comma is added only inside a graph block: never in a query, other code, or the note’s prose', async () => {
  const { commaInNote } = await import('../src/commas.ts');
  const graph = '```gql\n// graph: g\n(a:T)\n(\n```';
  assert.equal(
    commaInNote('Intro.\n\n' + graph, 'Intro.\n\n```gql\n// graph: g\n(a:T)\n('.length),
    'Intro.\n\n```gql\n// graph: g\n(a:T)'.length,
  );
  const query = '```gql\n// graph: g · QUERY\nMATCH (a:T)\n(\n```';
  assert.equal(commaInNote(query, '```gql\n// graph: g · QUERY\nMATCH (a:T)\n('.length), null);
  const prose = 'Some text (aside)\n(more';
  assert.equal(commaInNote(prose, 'Some text (aside)\n('.length), null);
  const python = '```python\nf(a)\n(\n```';
  assert.equal(commaInNote(python, '```python\nf(a)\n('.length), null);
});
