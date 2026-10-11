// Where an estimate's fix acts (spec §3; review of #85, 11 Oct 2026): at the path's own reference to the misspelt name,
// each item of a line taken once, never a word in a text, and every reference the sentence names; a type in its own
// brackets, never one in a text. Each case is read as a note is, and its fix made as the fix bar makes it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { estimateFix } from '../src/estimate-fix.ts';

const BASE = `// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(small_reader)-[:ANSWERS]->(question),
(large_reader)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large_reader)`;
/** The 0-based line the added text starts on. */
const FIRST = BASE.split('\n').length;

/** The text with one fix's edits made, as an editor makes an LSP edit. */
function applied(text, fix) {
  const lines = text.split('\n');
  const at = (p) => lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  return Object.values(fix.edit.changes)
    .flat()
    .sort((a, b) => at(b.range.start) - at(a.range.start))
    .reduce((t, e) => t.slice(0, at(e.range.start)) + e.newText + t.slice(at(e.range.end)), text);
}

/** Estimate `n` of the note `BASE` plus `added`, its fix made: the text after, and the range the fix bar marks. */
function fixed(added, n = 0) {
  const text = `${BASE},\n${added}`;
  const found = estimateFix(readNote([text]), 'reader', n, text, 'note');
  assert.ok(found, `estimate ${n} has a fix`);
  return { after: applied(text, found.fix).slice(BASE.length + 2), range: found.range };
}
/** A range on one line of what was added. */
const on = (line, character, word) => ({
  start: { line: FIRST + line, character },
  end: { line: FIRST + line, character: character + word.length },
});

describe('a misspelt name is fixed where the path names it', () => {
  test('two paths written alike on one line: the second estimate fixes the second, each item taken once', () => {
    const line = '(eyes)-[:FAVOURS]->(small_reeder), (eyes)-[:FAVOURS]->(small_reeder)';
    const { after, range } = fixed(line, 1);
    const second = line.lastIndexOf('small_reeder');
    assert.equal(after, `${line.slice(0, second)}small_reader)`);
    assert.deepEqual(range, on(0, second, 'small_reeder'));
  });

  test('a path over two lines with the name in a text on the first: the text is untouched', () => {
    const added = "(eyes)-[:LIKES {w: '(small_reeder'}]->\n(small_reeder)";
    const { after, range } = fixed(added);
    assert.equal(after, "(eyes)-[:LIKES {w: '(small_reeder'}]->\n(small_reader)");
    assert.deepEqual(range, on(1, 1, 'small_reeder'));
  });

  test('a path naming the misspelt name twice: one press fixes both, as the sentence says', () => {
    const line = '(small_reeder)-[:LIKES]->(eyes)-[:LIKES]->(small_reeder)';
    const text = `${BASE},\n${line}`;
    for (const e of readNote([text]).graphs.get('reader').estimates)
      assert.match(e.explain, /To fix it, change small_reeder to small_reader\.$/);
    const { after, range } = fixed(line);
    assert.equal(after, '(small_reader)-[:LIKES]->(eyes)-[:LIKES]->(small_reader)');
    assert.deepEqual(range, on(0, 1, 'small_reeder'));
  });

  test('a text holding // in the path is not taken for a comment: the name is still estimated and fixed', () => {
    const line = "(eyes)-[:LIKES {u: 'http://x'}]->(small_reeder)";
    const { after, range } = fixed(line);
    assert.equal(after, "(eyes)-[:LIKES {u: 'http://x'}]->(small_reader)");
    assert.deepEqual(range, on(0, line.indexOf('small_reeder'), 'small_reeder'));
  });
});

describe('a misspelt type is fixed in its own brackets', () => {
  // the text is a link's property: on a thing already written, `(eyes {w: …})` is read as writing eyes twice
  test('the same type written in a text before it is untouched', () => {
    const first = "(eyes)-[:FAVOURS {w: '-[:FAVORS]->'}]->(large_reader),";
    const { after, range } = fixed(`${first}\n(eyes)-[:FAVORS]->(small_reader)`);
    assert.equal(after, `${first}\n(eyes)-[:FAVOURS]->(small_reader)`);
    assert.deepEqual(range, on(1, '(eyes)-[:'.length, 'FAVORS'));
  });
});
