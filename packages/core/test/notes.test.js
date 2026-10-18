// Notes on things and links in what the core reads (editor spec §24). Each box and link drawn carries its note, read by
// the graph library's own reader (note_comment, note_text), so the editor can show it. A note above a line holding more
// than one thing belongs to none of them. It is a problem whose fix says to put the thing on its own line
// (note_one_owner). A note changes nothing drawn (note_standard).
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

  test('a note in a block after the one drawn up to is never read: a box drawn with no note gets none, and nothing is said of it', () => {
    const reading = readNote([NOTED, '// graph: g\n/// Later.\n(b:T)'], 0);
    assert.equal(box(reading.graphs.get('g'), 'b').note, undefined);
    assert.deepEqual(
      reading.problems.filter((p) => p.block === 1),
      [],
    );
  });

  test('a thing written without a name has its note on the box drawn under its suggested name, and the notes after it are read too', () => {
    const d = drawn(["// graph: g\n/// On X.\n(:T {name: 'X'}),\n/// On b.\n(b:T {name: 'B'})"]);
    const x = d.boxes.find((b) => b.text === 'X');
    assert.ok(x?.suggested, 'X is drawn under a suggested name');
    assert.equal(x.note?.text, 'On X.');
    assert.equal(box(d, 'b').note?.text, 'On b.');
  });
});

describe('a note that cannot be shown is said', () => {
  const LOST = 'this note is not shown, as what it is on could not be read';
  const lostLines = (reading, block = 0) =>
    reading.problems.filter((p) => p.message === LOST && p.block === block).map((p) => p.line);

  test('a note that belongs to nothing is not said to be lost when something else in its block is left out', () => {
    const reading = readNote(["// graph: g\n/// orphan\n\n(a:T {name: 'A'}),\n/// On b.\n(b:T {name: 'it\\q'})"]);
    assert.deepEqual(lostLines(reading), [5]);
  });

  test('each note on something left out of a block is said, on its own first line', () => {
    const reading = readNote([
      "// graph: g\n/// On a.\n(a:T {name: 'it\\q'}),\n/// On b.\n//@ k: v\n/// More on b.\n(b:T {name: 'so\\q'}),\n(c:T {name: 'C'})",
    ]);
    assert.deepEqual(lostLines(reading), [2, 4]);
  });

  test('a block the reader gives up on whole says each note in it is lost', () => {
    const bad = Array.from({ length: 8 }, (_, i) => `(x${i}:T {name: 'it\\q'})`).join(',\n');
    const reading = readNote([
      `// graph: g\n${bad}`,
      "// graph: g\n/// On c.\n(c:T {name: 'C'}),\n/// On d.\n(d:T {name: 'so\\q'})",
    ]);
    assert.equal(
      reading.graphs.get('g')?.boxes.some((b) => b.key === 'c') ?? false,
      false,
      'block 1 is left out whole',
    );
    assert.deepEqual(lostLines(reading, 1), [2, 4]);
  });

  test('in a block the reader cannot read whole, each note on what it reads is shown, and a note on what it leaves out is a warning', () => {
    const reading = readNote(["// graph: g\n/// On a.\n(a:T {name: 'A'}),\n/// On b.\n(b:T {name: 'it\\q'})"]);
    assert.equal(box(reading.graphs.get('g'), 'a').note?.text, 'On a.');
    assert.deepEqual(
      reading.problems.filter((p) => p.message === LOST),
      [
        {
          graph: 'g',
          block: 0,
          line: 4,
          severity: 'warning',
          message: LOST,
          fix: 'fix the problem in this block, and the note is shown again',
        },
      ],
    );
  });

  test('a thing noted where it is written first and again where it is written a second time keeps the first note, and the second is a hint naming it', () => {
    const reading = readNote([NOTED, "// graph: g\n/// Second.\n(a:T {name: 'A again'})"]);
    assert.equal(box(reading.graphs.get('g'), 'a').note?.text, 'The **first** thing.\n\nMore about it.');
    assert.deepEqual(
      reading.problems.filter((p) => p.severity === 'hint' && p.message.includes('note')),
      [
        {
          graph: 'g',
          block: 1,
          line: 2,
          severity: 'hint',
          message: 'this note is on a, which already has a note where it is first written, so this one is not shown',
          fix: 'join the two notes into one, above a where it is first written',
        },
      ],
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
