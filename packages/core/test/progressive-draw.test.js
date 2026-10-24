// A massive graph drawn in steps (editor spec §53, scale_progressive): detail-steps.ts. The overview comes first. Then
// the detail most likely wanted: the chosen group, and the groups on screen near its middle. Each step adds to the
// picture. It clears nothing but the opened group's own name and count. So the screen is never blank while it waits.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf } from '../src/scale-groups.ts';
import { overviewOf } from '../src/overview.ts';
import { DETAIL_SIDE, DETAIL_THINGS_MOST, detailFrames, detailOrder } from '../src/detail-steps.ts';
import { drawingOf } from './massive-drawing.js';

/** A one-box inside for a group: what laying it out alone gives. */
const insideOf = () => ({
  space: { width: 100, height: 100 },
  marks: [{ id: 'a', kind: 'box', style: 'node', x: 10, y: 10, width: 80, height: 30, of: 'a' }],
});

const grouping = groupsOf(drawingOf(6, 40));
const overview = overviewOf(grouping);
const sizes = new Map(grouping.groups.map((g) => [g.id, g.keys.length]));
const SCREEN = { width: 800, height: 600 };
const boxOf = (id) => overview.marks.find((m) => m.id === id && m.kind === 'group');

describe('a massive graph drawn in steps', () => {
  test('the first picture is the overview, with no detail in it', () => {
    const [first, ...rest] = detailFrames(overview, [], new Map());
    assert.equal(first, overview);
    assert.equal(rest.length, 0);
    assert.ok(first.marks.length > 0, 'never blank');
    assert.ok(
      first.marks.every((m) => m.style.startsWith('overview.')),
      'only the overview’s own marks',
    );
  });

  test('the chosen group comes first, then the groups on screen nearest its middle, and none off screen', () => {
    // zoomed in so that one group's box is big on screen and its neighbours are partly in view
    const target = boxOf(grouping.groups[0].id);
    const scale = (DETAIL_SIDE * 1.2) / Math.min(target.width, target.height);
    const view = { x: target.x - 5, y: target.y - 5, scale };
    const ask = { view, screen: SCREEN, opened: new Set(), sizes };
    const plain = detailOrder(overview, ask);
    assert.ok(plain.length > 0);
    const chosen = plain.at(-1);
    const withChoice = detailOrder(overview, { ...ask, chosen });
    assert.equal(withChoice[0], chosen, 'the chosen one first');
    assert.deepEqual([...withChoice].sort(), [...plain].sort(), 'the same groups, in another order');
    // none is off screen
    const wide = { x: view.x, y: view.y, width: SCREEN.width / scale, height: SCREEN.height / scale };
    for (const id of withChoice) {
      const b = boxOf(id);
      assert.ok(
        b.x < wide.x + wide.width && wide.x < b.x + b.width && b.y < wide.y + wide.height && wide.y < b.y + b.height,
        id,
      );
    }
    // the others are nearer the middle one after another
    const middle = [wide.x + wide.width / 2, wide.y + wide.height / 2];
    const far = (id) =>
      Math.hypot(boxOf(id).x + boxOf(id).width / 2 - middle[0], boxOf(id).y + boxOf(id).height / 2 - middle[1]);
    const rest = withChoice.slice(1).map(far);
    assert.deepEqual(
      rest,
      [...rest].sort((a, b) => a - b),
    );
  });

  test('each step adds to the picture: nothing goes but the opened group’s own name and count', () => {
    const order = grouping.groups.slice(0, 3).map((g) => g.id);
    const inside = new Map(order.map((id) => [id, insideOf()]));
    const frames = detailFrames(overview, order, inside);
    assert.equal(frames.length, 4);
    for (let i = 1; i < frames.length; i++) {
      const before = new Set(frames[i - 1].marks.map((m) => m.id));
      const now = new Set(frames[i].marks.map((m) => m.id));
      const gone = [...before].filter((id) => !now.has(id));
      assert.deepEqual(gone.sort(), [`${order[i - 1]}:count`, `${order[i - 1]}:name`].sort(), `step ${i}`);
      assert.ok(frames[i].marks.length > 0, 'never blank');
      assert.ok(
        [...now].some((id) => id.startsWith(`${order[i - 1]}/`)),
        'the detail arrived',
      );
    }
    // every box of the overview is still where it was
    for (const g of grouping.groups) {
      const a = boxOf(g.id),
        b = frames.at(-1).marks.find((m) => m.id === g.id && m.kind === 'group');
      assert.deepEqual([b.x, b.y, b.width, b.height], [a.x, a.y, a.width, a.height]);
    }
  });

  test('a group with no inside to show is skipped, and the steps go on', () => {
    const [a, b] = grouping.groups.map((g) => g.id);
    const frames = detailFrames(overview, [a, b], new Map([[b, insideOf()]]));
    assert.equal(frames.length, 2);
  });

  test('opened groups on screen never hold more things than the screen can show', () => {
    const many = groupsOf(drawingOf(40, 100));
    const big = overviewOf(many);
    const sz = new Map(many.groups.map((g) => [g.id, g.keys.length]));
    const ask = {
      view: { x: 0, y: 0, scale: 2 },
      screen: { width: big.space.width, height: big.space.height },
      opened: new Set(),
      sizes: sz,
    };
    const order = detailOrder(big, { ...ask, view: { x: 0, y: 0, scale: 1 } });
    const things = order.reduce((n, id) => n + sz.get(id), 0);
    assert.ok(things <= DETAIL_THINGS_MOST, `${things}`);
    assert.ok(order.length > 0);
    // once those are open, no more are offered
    const full = detailOrder(big, { ...ask, view: { x: 0, y: 0, scale: 1 }, opened: new Set(order) });
    assert.equal(full.reduce((n, id) => n + sz.get(id), 0) + things <= DETAIL_THINGS_MOST, true);
  });
});
