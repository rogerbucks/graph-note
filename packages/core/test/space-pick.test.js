// Picking in the 3D view (editor spec §53, space_pick_opens): space-pick.ts. A link is picked within a fingertip of
// where it is painted, and the point picked is on the link. A thing in front is picked before a link behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_REACH, blockAt, lineAt } from '../src/space-pick.ts';
import { orbitFit, projectPoint, spaceMatrix } from '../src/space-view.ts';
import { spreadSpace } from '../src/space-spread.ts';

const thing = (key) => ({ id: `t:${key}`, kind: 'box', style: 's', of: key, x: 0, y: 0, width: 1, height: 1 });
const link = (of, from, to) => ({
  id: `e:${of}`,
  kind: 'link',
  style: 's',
  of,
  points: [
    [0, 0],
    [1, 1],
  ],
  from,
  to,
});
const MARKS = [thing('a'), thing('b'), thing('c'), link('0', 'a', 'b'), link('1', 'b', 'c')];

test('a link is picked near where it is painted, with the point picked on it, and not from afar', () => {
  const { space } = spreadSpace(MARKS);
  const reach = Math.hypot(...space.most.map((v, k) => v - space.least[k]));
  const m = spaceMatrix(orbitFit(space, 1), 1, reach);
  for (const line of space.lines) {
    const mid = line.points[Math.floor(line.points.length / 2)];
    const at = projectPoint(m, mid, 800, 800);
    const hit = lineAt(space, m, 800, 800, at.x + LINE_REACH / 2, at.y);
    assert.equal(hit?.line.of, line.of, `link ${line.of}`);
    const seen = projectPoint(m, hit.at, 800, 800);
    assert.ok(Math.hypot(seen.x - at.x, seen.y - at.y) <= LINE_REACH, 'the point picked is on the link');
  }
  assert.equal(lineAt(space, m, 800, 800, 2, 2), null);
});

test("a thing's ball is picked where it covers a link, and the link keeps its key", () => {
  const { space } = spreadSpace(MARKS);
  const reach = Math.hypot(...space.most.map((v, k) => v - space.least[k]));
  const m = spaceMatrix(orbitFit(space, 1), 1, reach);
  const b = space.blocks.find((x) => x.of === 'b');
  const at = projectPoint(m, [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2], 800, 800);
  assert.equal(blockAt(space, m, 800, 800, at.x, at.y)?.of, 'b');
  assert.deepEqual(
    space.lines.map((l) => l.of),
    ['0', '1'],
  );
});
