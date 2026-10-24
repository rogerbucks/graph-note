// The board graph kept as text (editor spec §45, board_is_text). A board is its own block in the note, in the same
// notation. Writing a board read from a note gives the same bytes. Moving one item changes one line. So the note stays
// the only store, and every board edit is a change to its text.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boardOf, moveItem, readBoard, writeBoard } from '../src/board.ts';
import { dataKind } from '../src/blocks.ts';

const BOARD = `// graph: ideas · BOARD ON trip
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 200, y: 20, w: 160, h: 90, text: 'Paris', graph: 'paris'}),
(c:Frame {x: 0, y: 0, w: 400, h: 200, layer: -1, text: 'Travel'}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`;

describe('the board line', () => {
  test('names the board and the graph it decomposes into', () => {
    assert.deepEqual(boardOf(BOARD), { name: 'ideas', on: 'trip' });
  });

  test('may name no graph: a free board', () => {
    assert.deepEqual(boardOf('// graph: wall · BOARD\n(a:Sticky {x: 0, y: 0})'), { name: 'wall', on: null });
  });

  test('is null for any other block', () => {
    assert.equal(boardOf('// graph: trip\n(a:Place)'), null);
    assert.equal(boardOf('// graph: trip_style · STYLE trip\n(a:Look)'), null);
  });

  test('keeps a board out of the data the drawing draws', () => {
    assert.equal(dataKind(BOARD), null);
    assert.equal(dataKind('// graph: trip\n(a:Place)'), 'data');
  });
});

describe('reading and writing a board', () => {
  test('reads each item with its kind, place, size and text, and each connector', () => {
    const { board, problems } = readBoard(BOARD);
    assert.deepEqual(problems, []);
    assert.equal(board.name, 'ideas');
    assert.equal(board.on, 'trip');
    assert.deepEqual(
      board.items.map((i) => [i.id, i.kind, i.x, i.y, i.text]),
      [
        ['a', 'Sticky', 10, 20, 'Go by train'],
        ['b', 'Card', 200, 20, 'Paris'],
        ['c', 'Frame', 0, 0, 'Travel'],
      ],
    );
    assert.equal(board.items[1].graph, 'paris');
    assert.equal(board.items[2].layer, -1);
    assert.deepEqual(board.connectors, [{ from: 'a', to: 'b', label: 'leads to' }]);
  });

  test('writes a board read from a note back to the same bytes', () => {
    assert.equal(writeBoard(readBoard(BOARD).board), BOARD);
  });

  test('writes properties in one fixed order, whatever order they were given in', () => {
    const text = `// graph: wall · BOARD\n(a:Sticky {text: 'Hi', y: 2, x: 1, colour: 'yellow'})`;
    assert.equal(
      writeBoard(readBoard(text).board),
      `// graph: wall · BOARD\n(a:Sticky {x: 1, y: 2, text: 'Hi', colour: 'yellow'})`,
    );
  });

  test('keeps quotes and backslashes in text safe', () => {
    const text = `// graph: wall · BOARD\n(a:Sticky {x: 0, y: 0, text: 'It\\'s a \\\\ path'})`;
    const { board } = readBoard(text);
    assert.equal(board.items[0].text, "It's a \\ path");
    assert.equal(writeBoard(board), text);
  });
});

describe('an edit to a board', () => {
  test('moving an item changes its one line and nothing else', () => {
    const before = BOARD.split('\n');
    const after = moveItem(BOARD, 'a', 30, 45).split('\n');
    assert.equal(after.length, before.length);
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
    assert.deepEqual(changed, [1]);
    assert.equal(after[1], "(a:Sticky {x: 30, y: 45, text: 'Go by train'}),");
  });

  test('rounds a move to whole numbers, so the same board is always the same bytes', () => {
    assert.match(moveItem(BOARD, 'a', 30.4, 44.6), /\(a:Sticky \{x: 30, y: 45,/);
  });

  test('refuses to move an item the board does not hold, leaving the text as it was', () => {
    assert.equal(moveItem(BOARD, 'zz', 1, 1), BOARD);
  });
});
