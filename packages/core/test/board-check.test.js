// A board graph is checked like any graph (editor spec §45, board_checked). A kind the board does not know is a
// problem with its fix. So is a place that is not whole numbers, and a link to a thing that is gone. The board still
// holds every item it can read, so it can still be drawn.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';

const codes = (problems) => problems.map((p) => [p.code, p.line]);

describe('checking a board', () => {
  test('a sound board has no problems', () => {
    const text = `// graph: ideas · BOARD ON trip\n(a:Sticky {x: 1, y: 2, graph: 'paris'})`;
    assert.deepEqual(readBoard(text, new Set(['paris'])).problems, []);
  });

  test('an item kind the board does not know is a problem naming the kinds it does, and the item is left out', () => {
    const text = `// graph: ideas · BOARD\n(a:Sticky {x: 1, y: 2}),\n(b:Blob {x: 3, y: 4})`;
    const { board, problems } = readBoard(text);
    assert.deepEqual(codes(problems), [['GN901', 3]]);
    assert.match(problems[0].message, /Blob/);
    assert.match(problems[0].fix, /Sticky/);
    assert.deepEqual(
      board.items.map((i) => i.id),
      ['a'],
    );
  });

  test('a place that is missing or not a whole number is a problem, and the item is drawn at the nearest whole place', () => {
    const text = `// graph: ideas · BOARD\n(a:Sticky {x: 1.5, y: 2}),\n(b:Sticky {y: 4})`;
    const { board, problems } = readBoard(text);
    assert.deepEqual(codes(problems), [
      ['GN902', 2],
      ['GN902', 3],
    ]);
    assert.deepEqual(
      board.items.map((i) => [i.id, i.x, i.y]),
      [
        ['a', 2, 2],
        ['b', 0, 4],
      ],
    );
  });

  test('a link to a thing the graph does not hold is a problem whose fix offers to relink or remove it', () => {
    const text = `// graph: ideas · BOARD ON trip\n(a:Sticky {x: 1, y: 2, graph: 'rome'})`;
    const { board, problems } = readBoard(text, new Set(['paris']));
    assert.deepEqual(codes(problems), [['GN903', 2]]);
    assert.match(problems[0].message, /rome/);
    assert.match(problems[0].fix, /trip/);
    assert.equal(board.items[0].graph, 'rome', 'the link is kept, never removed silently');
  });

  test('a link is not checked when the board names no graph or none is given', () => {
    const text = `// graph: ideas · BOARD ON trip\n(a:Sticky {x: 1, y: 2, graph: 'rome'})`;
    assert.deepEqual(readBoard(text).problems, []);
  });

  test('a link of a kind other than CONNECTS is a problem, and is left out', () => {
    const text = `// graph: ideas · BOARD\n(a:Sticky {x: 1, y: 2}),\n(b:Sticky {x: 3, y: 4}),\n(a)-[:KNOWS]->(b)`;
    const { board, problems } = readBoard(text);
    assert.deepEqual(codes(problems), [['GN904', 4]]);
    assert.deepEqual(board.connectors, []);
  });

  test('a block that cannot be read is a problem, and the board still holds what could be read', () => {
    const text = `// graph: ideas · BOARD\n(a:Sticky {x: 1, y: 2}),\n(b:Sticky {x: 3, y: `;
    const { board, problems } = readBoard(text);
    assert.ok(problems.length > 0);
    assert.ok(problems.every((p) => p.severity === 'error' && p.code && p.fix));
    assert.deepEqual(
      board.items.map((i) => i.id),
      ['a'],
    );
  });

  test('every problem names the board graph, its block and line, with a code and a fix', () => {
    const text = `// graph: ideas · BOARD\n(b:Blob {x: 3, y: 4})`;
    const [p] = readBoard(text).problems;
    assert.equal(p.graph, 'ideas');
    assert.equal(p.block, 0);
    assert.equal(p.severity, 'error');
    assert.ok(p.fix);
  });
});
