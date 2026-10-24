// Things as cards in the 3D view (editor spec §53, space_cards): space-cards.ts. Each thing is a card flat to the
// screen, with its whole name inside. Far ones come first, a click picks the nearest, and arrowheads sit at card edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardArrows, cardAt, cardsOnScreen, frameOf, rowsOf } from '../src/space-cards.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { orbitFit, spaceMatrix } from '../src/space-view.ts';

const LONG = 'Data warehouse and reporting suite for the whole company';
/** Two things in a row and a link from the first to the second, as the 2D drawing marks them. */
const MARKS = [
  { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 130, height: 50 },
  { id: 'l:a', kind: 'label', style: 'thing', of: 'a', x: 65, y: 25, text: LONG, size: 14, anchor: 'middle' },
  { id: 't:b', kind: 'box', style: 'thing', of: 'b', x: 300, y: 0, width: 90, height: 40 },
  { id: 'l:b', kind: 'label', style: 'thing', of: 'b', x: 345, y: 20, text: 'Billing', size: 14, anchor: 'middle' },
  { id: 'e:ab', kind: 'link', style: 'link', from: 'a', to: 'b', name: 'FEEDS', points: [] },
];
const W = 800,
  H = 600;
const seen = () => {
  const { space } = spreadSpace(MARKS, undefined, true);
  const orbit = orbitFit(space, W / H);
  return { space, matrix: spaceMatrix(orbit, W / H, orbit.distance * 4) };
};

test('words are cut into rows at their spaces, a long word a row of its own', () => {
  assert.deepEqual(rowsOf('Identity and access management', 14), ['Identity and', 'access', 'management']);
  assert.deepEqual(rowsOf('Supercalifragilistic word', 8), ['Supercalifragilistic', 'word']);
  assert.deepEqual(rowsOf('  ', 8), []);
});

test('laid out as cards, each thing keeps its box size and its links run to its middle', () => {
  const { space } = spreadSpace(MARKS, undefined, true);
  assert.equal(space.cards, true);
  const a = space.blocks.find((b) => b.of === 'a');
  assert.deepEqual(a.card, { width: 130, height: 50 });
  assert.equal(spreadSpace(MARKS).space.cards, undefined, 'balls by default here');
});

test('each card holds the whole name, wrapped to fit, and the picked card is marked', () => {
  const { space, matrix } = seen();
  const cards = cardsOnScreen(space, matrix, W, H, 'a');
  const a = cards.find((c) => c.block.of === 'a'),
    b = cards.find((c) => c.block.of === 'b');
  assert.equal(a.rows.join(' '), LONG, 'nothing of the name is lost');
  assert.ok(a.rows.length > 1, 'a long name wraps');
  assert.ok(a.picked && !b.picked);
  assert.ok(a.width >= Math.max(...a.rows.map((r) => r.length)) * a.size * 0.5, 'the card is wide enough');
  assert.ok(a.height >= a.rows.length * a.size, 'and tall enough');
  for (let i = 1; i < cards.length; i++) assert.ok(cards[i - 1].far >= cards[i].far, 'far ones first');
});

test('a click picks the nearest card under it', () => {
  const near = { block: { id: 'near' }, x: 100, y: 100, width: 80, height: 40, far: 10, rows: [], size: 11 },
    far = { ...near, block: { id: 'far' }, far: 50 };
  assert.equal(cardAt([far, near], 110, 105)?.block.id, 'near');
  assert.equal(cardAt([far, near], 300, 300), undefined);
});

test("each arrowhead's tip is on the edge of the card it points to", () => {
  const { space, matrix } = seen();
  const cards = cardsOnScreen(space, matrix, W, H);
  const [arrow] = cardArrows(space, matrix, W, H, cards);
  const b = cards.find((c) => c.block.of === 'b');
  const dx = Math.abs(arrow.tip.x - b.x) - b.width / 2,
    dy = Math.abs(arrow.tip.y - b.y) - b.height / 2;
  assert.ok(Math.abs(Math.max(dx, dy)) < 0.5, `the tip is ${dx.toFixed(1)}, ${dy.toFixed(1)} off the edge`);
});

test('with cards the graphics chip paints only the lines, and only link words float', () => {
  const { space, matrix } = seen();
  const frame = frameOf(space, matrix, W, H, null);
  assert.deepEqual(frame.shapes.blocks, []);
  assert.equal(frame.shapes.lines.length, 1);
  assert.deepEqual(
    frame.labels.map((l) => l.text),
    ['FEEDS'],
  );
  assert.equal(frame.ring, null);
  const balls = spreadSpace(MARKS).space;
  assert.equal(frameOf(balls, matrix, W, H, null).shapes, balls, 'balls are painted as before');
});
