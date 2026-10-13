// Notes on things and links in what the core reads (editor spec §24): each box and link drawn carries its note, read by
// the graph library's own reader (note_comment, note_text), so the editor can show it; a note above a line holding more
// than one thing belongs to none of them, and is a problem whose fix says to put the thing on its own line
// (note_one_owner); and a note changes nothing drawn (note_standard).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';

const NOTED = `// graph: g
/// The **first** thing.
///
/// More about it.
(a:T {name: 'A'}),
(b:T {name: 'B'}),
/// Why a leads to b.
(a)-[:R]->(b)`;

const drawn = (blocks, graph = 'g') => {
  const d = readNote(blocks).graphs.get(graph);
  assert.ok(d, `graph ${graph} is drawn`);
  return d;
};
const box = (d, key) => d.boxes.find((b) => b.key === key);

describe('note_comment and note_text: a note is on the box or link it is written directly above', () => {
  test("a thing's note is on its box: its text as CommonMark, its summary, its block and its /// lines", () => {
    const d = drawn([NOTED]);
    assert.deepEqual(box(d, 'a').note, {
      text: 'The **first** thing.\n\nMore about it.',
      summary: 'The **first** thing.',
      block: 0,
      lines: [2, 3, 4],
    });
    assert.equal('note' in box(d, 'b'), false);
  });

  test("a link's note is on the link drawn", () => {
    const d = drawn([NOTED]);
    assert.deepEqual(d.links.find((l) => l.from === 'a' && l.to === 'b').note, {
      text: 'Why a leads to b.',
      summary: 'Why a leads to b.',
      block: 0,
      lines: [7],
    });
  });

  test('a thing written with an id of its own has its note on the box of that id', () => {
    const d = drawn(["// graph: g\n/// On x.\n(x:T {id: 'thing_x', name: 'X'})"]);
    assert.equal(box(d, 'thing_x').note?.text, 'On x.');
  });

  test('a link between things written in another block, or found by MATCH, has its note, with its own block', () => {
    const across = '// graph: g\n/// Across blocks.\n(a)-[:S]->(b)';
    const matched = "// graph: g\nMATCH (p:T {id: 'b'}), (q:T {id: 'a'})\nINSERT\n/// Through MATCH.\n(p)-[:S]->(q)";
    const d = drawn([NOTED, across, matched]);
    const link = (from, to) => d.links.find((l) => l.from === from && l.type === 'S' && l.to === to);
    assert.deepEqual(link('a', 'b').note, { text: 'Across blocks.', summary: 'Across blocks.', block: 1, lines: [2] });
    assert.deepEqual(link('b', 'a').note, {
      text: 'Through MATCH.',
      summary: 'Through MATCH.',
      block: 2,
      lines: [4],
    });
  });

  test('a link written without its colon has its note on the link it is read as', () => {
    const d = drawn([NOTED, '// graph: g\n/// Bare.\n(b)-[r]->(a)']);
    assert.equal(d.links.find((l) => l.from === 'b' && l.to === 'a').note?.text, 'Bare.');
  });

  test('two links written alike each have their own note, in the order written', () => {
    const d = drawn([NOTED, '// graph: g\n/// Again.\n(a)-[:R]->(b)']);
    const ab = d.links.filter((l) => l.from === 'a' && l.to === 'b');
    assert.deepEqual(
      ab.map((l) => l.note?.text),
      ['Why a leads to b.', 'Again.'],
    );
  });

  test('a note in a block after the one drawn up to is not read', () => {
    const reading = readNote([NOTED, "// graph: g\n/// Later.\n(c:T {name: 'C'})"], 0);
    assert.equal(
      reading.graphs.get('g').boxes.some((b) => b.note?.text === 'Later.'),
      false,
    );
  });
});

describe('note_one_owner: a note above a line holding more than one thing belongs to none of them', () => {
  const SHARED = "// graph: g\n/// A note.\n(a:T {name: 'A'}), (b:T {name: 'B'})";

  test('no box has the note', () => {
    const d = drawn([SHARED]);
    assert.deepEqual(
      d.boxes.filter((b) => b.note),
      [],
    );
  });

  test("the editor says so, on the note's first line, with the fix of putting the thing on its own line", () => {
    const said = readNote([SHARED]).problems.filter((p) => p.message.includes('note'));
    assert.deepEqual(said, [
      {
        graph: 'g',
        block: 0,
        line: 2,
        severity: 'warning',
        message: 'this note is above a line holding more than one thing, so it belongs to none of them',
        fix: 'put the thing the note is about on a line of its own, directly below the note',
      },
    ]);
  });

  test('a path of two things and a link under a note is said too, and a note owned by one thing is not', () => {
    const path = readNote(['// graph: g\n/// A note.\n(a:T)-[:R]->(b:T)']).problems;
    assert.equal(path.filter((p) => p.message.includes('belongs to none')).length, 1);
    assert.equal(readNote([NOTED]).problems.length, 0);
  });
});

describe('note_standard: a note changes nothing drawn', () => {
  test('the layout source is the same with the notes as without them', () => {
    const without = NOTED.split('\n')
      .filter((line) => !line.startsWith('///'))
      .join('\n');
    for (const dir of ['LR', 'TB'])
      assert.equal(layoutSource(drawn([NOTED]), dir).source, layoutSource(drawn([without]), dir).source);
  });
});
