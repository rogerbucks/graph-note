// A note written as an XML comment (editor spec §24, note_standard; graph spec req:26.plain): held to the table the
// Python library's SCXML export is held to (python/graph_spec/tests/note_comment_cases.json), so both write the same
// comment for the same note, and read back by the strict reader of export-data-readers.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteComment } from '../src/xml-comment.ts';
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
