// A note written as an XML comment (editor spec §24, note_standard; graph spec req:26.plain). It is held to the table
// the Python library's SCXML export is held to (python/graph_spec/tests/note_comment_cases.json). So both write the
// same comment for the same note. It is read back by the strict reader of export-data-readers.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commentPieces, noteComment } from '../src/xml-comment.ts';
import { commentNote, xmlTree } from './export-data-readers.js';

const { cases } = JSON.parse(
  readFileSync(new URL('../../../python/graph_spec/tests/note_comment_cases.json', import.meta.url), 'utf8'),
);

// proves: note_standard
test('each note of the shared table is written as the comment the table gives', () => {
  assert.ok(cases.length > 10);
  for (const c of cases) assert.equal(noteComment(c.text), c.comment, c.id);
});

// proves: note_standard
test('each comment is one XML reads, holding no -- and no - at its end, and reads back as the note written', () => {
  for (const c of cases) {
    const written = noteComment(c.text);
    const [only, ...rest] = xmlTree(`<graphml>${written}</graphml>`).children;
    assert.deepEqual(rest, [], c.id);
    assert.equal(commentNote(only.comment), c.text, c.id);
  }
});

/** A text given one character at a time, counting the characters taken and, at each, the pieces given out so far. */
function counted(text, work) {
  return {
    *[Symbol.iterator]() {
      for (const c of text) {
        work.taken++;
        work.ahead = Math.max(work.ahead, work.taken - work.given);
        yield c;
      }
    },
  };
}

// proves: note_standard
test('the work is linear in the note: each character is taken once and given out as one short piece before the next is taken, 500,000 hyphens among them', () => {
  for (const text of ['-'.repeat(500_000), '\\-\r'.repeat(170_000), 'a-'.repeat(250_000)]) {
    const work = { taken: 0, given: 0, ahead: 0, longest: 0 };
    const pieces = [];
    for (const piece of commentPieces(counted(text, work))) {
      work.given++;
      work.longest = Math.max(work.longest, piece.length);
      pieces.push(piece);
    }
    const chars = [...text].length;
    assert.equal(work.taken, chars, 'each character is taken once');
    assert.equal(work.given, chars, 'one piece for each character');
    assert.equal(work.ahead, 1, 'a piece is given out before the next character is taken');
    assert.ok(work.longest <= 10, 'each piece is a few characters, whatever came before it');
    assert.equal(`<!-- ${pieces.join('')} -->`, noteComment(text), 'the comment is its pieces joined');
  }
});

// proves: note_standard
test('no note can end its comment early: every run of hyphens is broken, at the start, the middle and the end', () => {
  for (let n = 1; n <= 6; n++) {
    const dashes = '-'.repeat(n);
    for (const text of [dashes, `${dashes}>`, `a${dashes}`, `<!${dashes}`, `${dashes}\\${dashes}\r${dashes}`]) {
      const written = noteComment(text);
      const inside = written.slice(4, -3);
      assert.equal(inside.includes('--'), false, JSON.stringify(text));
      assert.equal(inside.endsWith('-'), false, JSON.stringify(text));
      assert.equal(commentNote(inside), text, JSON.stringify(text));
    }
  }
});
