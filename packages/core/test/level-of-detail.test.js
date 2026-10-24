// A massive graph opens as clusters and shows more as the reader zooms in (editor spec §53, scale_level_of_detail).
// It is detail-steps.ts with the overview (overview.ts) and its mark index (mark-index.ts). Far out, each group is
// one box. Zoomed in on a group, its things are shown. Never more is drawn than the screen can show.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf } from '../src/scale-groups.ts';
import { overviewOf } from '../src/overview.ts';
import { MarkIndex } from '../src/mark-index.ts';
import { DETAIL_SIDE, detailFrames, detailOrder } from '../src/detail-steps.ts';
import { drawingOf } from './massive-drawing.js';

const SCREEN = { width: 1000, height: 700 };
const inside = () => ({
  space: { width: 100, height: 100 },
  marks: Array.from({ length: 12 }, (_, i) => ({
    id: `n${i}`,
    kind: 'box',
    style: 'node',
    x: (i % 4) * 25,
    y: Math.floor(i / 4) * 30,
    width: 20,
    height: 20,
    of: `n${i}`,
  })),
});

describe('a massive graph at its levels of detail', () => {
  const grouping = groupsOf(drawingOf(100, 100));
  const overview = overviewOf(grouping);
  const sizes = new Map(grouping.groups.map((g) => [g.id, g.keys.length]));
  const fit = Math.min(SCREEN.width / overview.space.width, SCREEN.height / overview.space.height);

  test('it opens as one box for each group, and a bounded number of marks, not one for each thing', () => {
    const boxes = overview.marks.filter((m) => m.kind === 'group');
    assert.equal(boxes.length, 100);
    assert.ok(grouping.groups.reduce((n, g) => n + g.keys.length, 0) === 10_000);
    // a name and a count for each group, and a line for each pair of groups that link
    assert.ok(overview.marks.length <= boxes.length * 3 + grouping.between.length, `${overview.marks.length} marks`);
    assert.deepEqual(
      detailOrder(overview, { view: { x: 0, y: 0, scale: fit }, screen: SCREEN, opened: new Set(), sizes }),
      [],
    );
  });

  test('zoomed in on a group its inside is offered, and zoomed out again it is not', () => {
    const target = overview.marks.find((m) => m.kind === 'group');
    const scale = (DETAIL_SIDE * 1.1) / Math.min(target.width, target.height);
    const ask = { view: { x: target.x, y: target.y, scale }, screen: SCREEN, opened: new Set(), sizes };
    assert.ok(detailOrder(overview, ask).includes(target.id));
    // just under the size worth showing: nothing
    const small = (DETAIL_SIDE * 0.9) / Math.min(target.width, target.height);
    assert.deepEqual(detailOrder(overview, { ...ask, view: { x: target.x, y: target.y, scale: small } }), []);
  });

  test('opening a cluster shows its things, and draws no more than is on screen', () => {
    const target = overview.marks.find((m) => m.kind === 'group');
    const frames = detailFrames(overview, [target.id], new Map([[target.id, inside()]]));
    const opened = frames[1];
    const things = opened.marks.filter((m) => m.id.startsWith(`${target.id}/`));
    assert.equal(things.length, 12);
    // looking at one corner, only the marks that touch the screen are given, whatever the drawing holds
    const index = new MarkIndex(opened);
    const view = { x: 0, y: 0, width: opened.space.width / 8, height: opened.space.height / 8 };
    const drawn = index.visible(view, 8);
    assert.ok(drawn.length < opened.marks.length / 10, `${drawn.length} of ${opened.marks.length}`);
    // and text too small to read at the overview's scale is left out
    const labels = (m) => m.kind === 'label';
    assert.equal(
      new MarkIndex(overview)
        .visible({ x: 0, y: 0, width: overview.space.width, height: overview.space.height }, 0.01)
        .filter(labels).length,
      0,
    );
  });
});
