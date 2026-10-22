// Drawing marks (editor spec §43, plugin_interface): the one picture format the built-in and the plug-in diagram
// types both give back. These prove what a mark may hold, that ids stay each mark's own, and the boxes marks cover.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_MARK_LIMIT,
  drawMarksOf,
  drawOrder,
  fromPluginMarks,
  markBounds,
  marksBounds,
} from '../src/drawing-marks.ts';

const SPACE = { width: 400, height: 300 };
const BOX = {
  id: 'loan',
  of: 'loan',
  style: 'thing',
  kind: 'box',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  role: 'thing',
  name: 'Loan',
};
const LABEL = {
  id: 'loan.label',
  of: 'loan',
  style: 'thing.label',
  kind: 'label',
  x: 60,
  y: 45,
  text: 'Loan',
  size: 14,
  anchor: 'middle',
  maxWidth: 90,
};
const LINK = {
  id: 'loan>borrower#0',
  of: 'loan>borrower',
  from: 'loan',
  to: 'borrower',
  style: 'link',
  kind: 'link',
  points: [
    [110, 40],
    [150, 40],
    [190, 60],
    [200, 80],
  ],
  curve: true,
};
const HEAD = { id: 'loan>borrower#0.head', style: 'link', kind: 'arrowhead', x: 200, y: 80, angle: 90, size: 6 };
const GROUP = { id: 'cluster', style: 'group', kind: 'group', x: 0, y: 0, width: 250, height: 120, role: 'group' };

describe('drawing marks (plugin_interface)', () => {
  test('a mark of each kind is kept as given, holding only what a mark may', () => {
    const extra = { ...BOX, group: 'cluster', z: 2, onclick: 'alert(1)', html: '<b>x</b>' };
    const marks = drawMarksOf([GROUP, extra, LABEL, LINK, HEAD], SPACE);
    assert.ok(Array.isArray(marks), marks);
    assert.deepEqual(marks[1], { ...BOX, group: 'cluster', z: 2 });
    assert.deepEqual(marks.slice(2), [LABEL, LINK, HEAD]);
  });

  test('a mark is refused with why: no id, a raw colour for its style, outside the space, an unknown kind', () => {
    const why = (m) => drawMarksOf([m], SPACE);
    assert.match(why({ ...BOX, id: '' }), /mark 1 is a mark with no id/);
    assert.match(why({ ...BOX, style: 'fill:red' }), /style is not a token/);
    assert.match(why({ ...BOX, x: 350 }), /a box outside the space/);
    assert.match(why({ ...LABEL, anchor: 'left' }), /not anchored/);
    assert.match(
      why({
        ...LINK,
        points: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      }),
      /curved link/,
    );
    assert.match(why({ ...BOX, kind: 'script' }), /not one of box, link, label, arrowhead, group/);
    assert.match(why({ ...BOX, z: 1.5 }), /whole number/);
    assert.match(why({ ...LINK, to: 42 }), /a link whose to is not a short text/);
  });

  test('a mark may keep the exact outline it was laid out with, its line width and its font, and only finite ones', () => {
    const outline = {
      points: [
        [10, 20],
        [110, 20],
        [110, 60],
        [10, 60],
      ],
    };
    const exact = { ...BOX, outline, lineWidth: 1.6 };
    const label = { ...LABEL, font: 'Helvetica' };
    assert.deepEqual(drawMarksOf([exact, label], SPACE), [exact, label]);
    const why = (m) => drawMarksOf([m], SPACE);
    assert.match(why({ ...BOX, outline: { points: [[0, NaN]] } }), /outline is not finite points/);
    const three = outline.points.slice(0, 3);
    assert.match(why({ ...BOX, outline: { points: three, curve: true } }), /outline is not finite points, or a curve/);
    assert.match(why({ ...BOX, lineWidth: -1 }), /line width is not a size/);
    assert.match(why({ ...LABEL, font: 'x;y{}' }), /font is not a family name/);
  });

  test('every id is its own, and a mark sits only in a group that is drawn', () => {
    assert.match(drawMarksOf([BOX, { ...LABEL, id: 'loan' }], SPACE), /mark 2 has the id "loan"/);
    assert.match(drawMarksOf([{ ...BOX, group: 'nowhere' }], SPACE), /the group "nowhere", which no group mark is/);
  });

  test('a drawing holds up to the mark limit and no more', () => {
    assert.match(drawMarksOf(Array(DRAW_MARK_LIMIT + 1).fill(BOX), SPACE), /over the 100000 allowed/);
  });

  test('the box marks cover: each one, and all of them', () => {
    assert.deepEqual(markBounds(LINK), { x: 110, y: 40, width: 90, height: 40 });
    assert.deepEqual(markBounds(LABEL), { x: 15, y: 31, width: 90, height: 14 });
    assert.deepEqual(markBounds(HEAD), { x: 194, y: 74, width: 12, height: 12 });
    assert.deepEqual(marksBounds([BOX, LINK, HEAD]), { x: 10, y: 20, width: 196, height: 66 });
    assert.equal(marksBounds([]), null);
  });

  test('marks are drawn by their order on top, keeping the order given where it is the same', () => {
    const order = drawOrder([{ ...LABEL, z: 1 }, GROUP, { ...BOX, z: -1 }, LINK]).map((m) => m.id);
    assert.deepEqual(order, ['loan', 'cluster', 'loan>borrower#0', 'loan.label']);
  });

  test("a plug-in's boxes, lines and text come into the one format, each with its own id", () => {
    const marks = fromPluginMarks([
      { kind: 'box', x: 0, y: 0, width: 50, height: 20, label: 'A', thing: 'a' },
      {
        kind: 'line',
        points: [
          [50, 10],
          [90, 10],
        ],
        arrow: true,
        thing: 'a',
      },
      { kind: 'text', x: 5, y: 40, text: 'note' },
    ]);
    assert.deepEqual(
      marks.map((m) => [m.id, m.kind, m.of]),
      [
        ['a#0', 'box', 'a'],
        ['a#0.label', 'label', 'a'],
        ['a#1', 'link', 'a'],
        ['a#1.arrow', 'arrowhead', 'a'],
        ['mark#2', 'label', undefined],
      ],
    );
    assert.equal(marks[3].angle, 0);
    assert.ok(Array.isArray(drawMarksOf(marks, { width: 100, height: 50 })));
  });
});
