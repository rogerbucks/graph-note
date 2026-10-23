// A filter saved in the style graph (editor spec §53, scale_filter_live). In edit mode, a filter chosen on a huge
// graph's overview is written as one Filter line in its style block. Drawn again, the overview starts filtered. Spans
// filter-saved.ts (the text written and read), style-edit.ts (the write) and style-checks.ts (the check).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { filterRefusal, filterText, savedFilterFor } from '../src/filter-saved.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';

const TASKS = `// graph: work
(a:Task {status: 'done'}),
(b:Task {status: 'open'}),
(n:Note {status: 'done'}),
(a)-[:SEE]->(n)`;

const NOTE = ['# Work', '', '```gql', TASKS, '```', ''].join('\n');
const texts = (note) => gqlBlocks(note).map((b) => b.text);
const data = (note) =>
  gqlSpans(note)
    .filter((s) => styleOf(s.text) === null)
    .map((s) => s.text);

/** The style of the work graph in `note`, read back, with its problems as line, message and fix. */
function read(textsOf) {
  const { style, problems } = readStyle(textsOf, 'work', readNote(textsOf));
  return { style, problems: problems.map((p) => [p.line, p.message, p.fix]) };
}

describe('a filter saved in the style graph', () => {
  // proves: scale_filter_live
  test('is written as one Filter line, read back as chosen, and changed in place when chosen again', () => {
    const first = styleEdit(NOTE, 'work', { filter: { keep: { Kind: ['Task'], status: ['done'] } } });
    assert.ok('note' in first, first.refused);
    assert.deepEqual(data(first.note), data(NOTE), 'the data is never touched');
    const block = gqlBlocks(first.note).at(-1).text;
    assert.match(block, /^\/\/ graph: work_style · STYLE work/);
    assert.ok(block.includes("(filter_1:Filter {keep: 'Kind: Task; status: done'})"), block);
    const again = styleEdit(first.note, 'work', { filter: { keep: { Kind: ['Task', 'Note'] } } });
    assert.ok('note' in again, again.refused);
    const after = gqlBlocks(again.note).at(-1).text;
    assert.equal(after.match(/:Filter/g).length, 1, 'changed in place, never written twice');
    const { style, problems } = read(texts(again.note));
    assert.deepEqual(problems, []);
    assert.deepEqual(savedFilterFor(style.filters), { Kind: ['Task', 'Note'] });
    assert.equal(savedFilterFor(style.filters, 'board'), undefined, 'a view has its own filter');
  });

  // proves: scale_filter_live
  test('keeps everything when nothing is chosen', () => {
    assert.equal(filterText({ Kind: [], status: [] }), '');
    const r = styleEdit(NOTE, 'work', { filter: { keep: {} } });
    assert.ok('note' in r, r.refused);
    const { style, problems } = read(texts(r.note));
    assert.deepEqual(problems, []);
    assert.deepEqual(savedFilterFor(style.filters), {});
  });

  // proves: scale_filter_live
  test('what cannot be used is a problem on its line with its fix, and the rest is kept', () => {
    const lines = [
      '// graph: work_style · STYLE work',
      "(f1:Filter {keep: 'Kind: Tsk, Note; status; status: done; status: open'}),",
      '(f2:Filter {})',
    ];
    const { style, problems } = read([TASKS, lines.join('\n')]);
    assert.deepEqual(savedFilterFor(style.filters), { Kind: ['Note'], status: ['done'] });
    const messages = problems.map(([line, message]) => [line, message]);
    assert.deepEqual(messages, [
      [2, 'Tsk is not a kind in graph work'],
      [2, 'the filter status cannot be read: a filter is its name, a colon, then the values kept'],
      [2, 'the filter status is written twice in one Filter'],
      [3, 'a Filter says what it keeps'],
    ]);
    assert.match(problems[0][2], /Task/, 'the fix names the nearest kind');
  });

  // proves: scale_filter_live
  test('a value the text could not hold is refused, with the reason, and nothing is written', () => {
    assert.equal(filterRefusal({ status: ['done'] }), null);
    const refused = { refused: 'a, b cannot be saved in a filter: it is empty, or holds a semicolon, colon or comma' };
    assert.deepEqual(styleEdit(NOTE, 'work', { filter: { keep: { status: ['a, b'] } } }), refused);
    assert.ok('refused' in styleEdit(NOTE, 'work', { filter: { keep: { Kind: ['Task'] }, view: '' } }));
  });
});
