// The places of a massive graph stay as they are (editor spec §53, scale_layout_static): layout-static.ts with the
// saved layouts (layout-cache.ts). An edit inside one group lays out that group only. Every other group keeps its place
// exactly. Panning, zooming or choosing lays out nothing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf } from '../src/scale-groups.ts';
import { overviewOf } from '../src/overview.ts';
import { partOf } from '../src/expand-on-demand.ts';
import { LayoutCache, layoutKey } from '../src/layout-cache.ts';
import { detailOrder } from '../src/detail-steps.ts';
import { flyPath, viewOnto } from '../src/search-fly.ts';
import { groupsToLay, keepPlaces } from '../src/layout-static.ts';
import { drawingOf } from './massive-drawing.js';

const LAID = {
  space: { width: 10, height: 10 },
  marks: [{ id: 'a', kind: 'box', style: 'node', x: 1, y: 1, width: 5, height: 5, of: 'a' }],
};
const boxes = (laid) =>
  new Map(laid.marks.filter((m) => m.kind === 'group').map((m) => [m.id, [m.x, m.y, m.width, m.height]]));

/** Each group of `drawing`'s own text, by its id: what is laid out for it. */
const sourcesOf = (drawing) => {
  const g = groupsOf(drawing);
  return new Map(g.groups.map((x) => [x.id, JSON.stringify(partOf(drawing, x.keys))]));
};

describe('a massive graph’s places stay', () => {
  const before = drawingOf(8, 30);
  const edited = {
    ...before,
    boxes: before.boxes.map((b) => (b.key === 't3' ? { ...b, text: 'Thing three, renamed' } : b)),
  };

  test('an edit inside one group lays out that group only; every other group is found saved', async () => {
    const cache = new LayoutCache();
    let laid = 0;
    const lay = async () => (laid++, LAID);
    const openAll = async (drawing) => {
      for (const [, text] of sourcesOf(drawing)) await cache.layout(await layoutKey(text), lay);
    };
    await openAll(before);
    assert.equal(laid, 8, 'every group laid out once');
    await openAll(before);
    assert.equal(laid, 8, 'seen before: nothing laid out');
    await openAll(edited);
    assert.equal(laid, 9, 'only the group the edit touched');
  });

  test('the groups to lay out again are those whose digest changed or is new', async () => {
    const digest = async (drawing) =>
      new Map(await Promise.all([...sourcesOf(drawing)].map(async ([id, text]) => [id, await layoutKey(text)])));
    const was = await digest(before),
      now = await digest(edited);
    assert.equal(groupsToLay(was, now).length, 1);
    assert.deepEqual(groupsToLay(was, was), []);
    assert.deepEqual(groupsToLay(new Map(), was).sort(), [...was.keys()].sort());
  });

  test('panning, zooming and choosing lay nothing out: they only change the view', async () => {
    const cache = new LayoutCache();
    let laid = 0;
    const key = await layoutKey('one group');
    await cache.layout(key, async () => (laid++, LAID));
    const overview = overviewOf(groupsOf(before));
    const sizes = new Map(groupsOf(before).groups.map((g) => [g.id, g.keys.length]));
    for (const scale of [0.2, 1, 3, 8]) {
      detailOrder(overview, {
        view: { x: 10 * scale, y: 5 * scale, scale },
        screen: { width: 800, height: 600 },
        opened: new Set(),
        sizes,
      });
      const path = flyPath(
        { x: 0, y: 0, scale },
        viewOnto({ x: 50, y: 50, width: 100, height: 100 }, 800, 600),
        800,
        600,
      );
      path(0.5);
    }
    await cache.layout(key, async () => (laid++, LAID));
    assert.equal(laid, 1);
  });

  test('after an edit every group of the overview is in the same place, and the edited one has its new count', () => {
    const was = overviewOf(groupsOf(before));
    // a thing added to one group: a bigger group, which the treemap alone would make everything else move for
    const grown = {
      ...before,
      boxes: [
        ...before.boxes,
        ...Array.from({ length: 40 }, (_, i) => ({ key: `x${i}`, kind: 'K0', text: `Extra ${i}` })),
      ],
    };
    const now = overviewOf(groupsOf(grown));
    assert.notDeepEqual([...boxes(now)], [...boxes(was)], 'laid out afresh, the places would move');
    const kept = keepPlaces(was, now);
    assert.deepEqual([...boxes(kept)], [...boxes(was)], 'every group where it was');
    const count = kept.marks.find(
      (m) => m.id === `${groupsOf(grown).groups.find((g) => g.keys.includes('x0')).id}:count`,
    );
    assert.equal(count.text, '70 things');
  });

  test('a new group goes below the rest and overlaps none; a gone group leaves its place empty', () => {
    const was = overviewOf(groupsOf(before));
    const added = {
      ...before,
      boxes: [
        ...before.boxes,
        ...Array.from({ length: 30 }, (_, i) => ({ key: `n${i}`, kind: 'Fresh', text: `New ${i}` })),
      ],
    };
    const kept = keepPlaces(was, overviewOf(groupsOf(added)));
    const old = boxes(was),
      now = boxes(kept);
    for (const [id, b] of old) assert.deepEqual(now.get(id), b);
    const fresh = [...now].filter(([id]) => !old.has(id));
    assert.equal(fresh.length, 1);
    assert.ok(fresh[0][1][1] >= was.space.height, 'below everything');
    assert.ok(kept.space.height >= fresh[0][1][1] + fresh[0][1][3]);
    // a group gone
    const fewer = { ...before, boxes: before.boxes.filter((b) => b.kind !== 'K1') };
    const gone = keepPlaces(was, overviewOf(groupsOf(fewer)));
    assert.equal(boxes(gone).size, 7);
    for (const [id, b] of boxes(gone)) assert.deepEqual(old.get(id), b);
  });

  test('the lines between groups follow the groups that stayed', () => {
    const linked = { ...before, links: [{ from: 't0', type: 'TO', reading: 'to', to: 't1' }] };
    const was = overviewOf(groupsOf(linked));
    const kept = keepPlaces(was, overviewOf(groupsOf(linked)));
    assert.deepEqual(
      kept.marks.filter((m) => m.kind === 'link').map((m) => m.points),
      was.marks.filter((m) => m.kind === 'link').map((m) => m.points),
    );
    assert.equal(keepPlaces(null, was), was);
  });
});
