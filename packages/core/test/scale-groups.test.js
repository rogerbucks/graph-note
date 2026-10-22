// The groups a massive graph opens as (editor spec §53, scale_groups): scale-groups.ts. The person's own groups come
// first, then kinds, then groups found by links. No group is over its size, and each is named for the reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_MOST, groupsOf } from '../src/scale-groups.ts';
import { readNote } from '../src/drawing.ts';
import { hugeBlock } from '../../../scripts/scale-benchmark.mjs';

/** A drawing of boxes `[key, kind, text]` and links `[from, to, type]`, with the style graph's `groups` as [label, keys]. */
function drawing(boxes, links, groups = []) {
  return {
    graph: 'g',
    boxes: boxes.map(([key, kind = 'Thing', text = key]) => ({ key, kind, text })),
    links: links.map(([from, to, type = 'LINKS']) => ({ from, type, reading: type.toLowerCase(), to })),
    estimates: [],
    nudges: groups.flatMap(([group, keys]) => keys.map((thing) => ({ word: 'group', thing, group, at: {} }))),
  };
}

/** Two tight bunches of five things, joined by one link, all of one kind. */
const twoBunches = () => {
  const keys = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const pairs = (from) => keys.slice(from, from + 5).flatMap((a, i, all) => all.slice(i + 1).map((b) => [a, b]));
  return { keys, links: [...pairs(0), ...pairs(5), ['t0', 't5']] };
};

/** Every key of a grouping, once each, in the order of its groups. */
const allKeys = (grouping) => grouping.groups.flatMap((g) => g.keys);

test('the style graph’s groups come first, when they hold at least half the things', () => {
  const { keys, links } = twoBunches();
  const d = drawing(
    keys.map((k) => [k]),
    links,
    [['Team', ['t0', 't1', 't2', 't3', 't4', 't5']]],
  );
  const g = groupsOf(d, 500, 1);
  assert.equal(g.by, 'style');
  assert.deepEqual(g.groups[0], {
    id: 'group:t0',
    label: 'Team',
    by: 'style',
    keys: ['t0', 't1', 't2', 't3', 't4', 't5'],
  });
  // the things left over are grouped by their links
  assert.deepEqual(
    g.groups.slice(1).map((x) => x.by),
    ['links'],
  );
  assert.deepEqual(allKeys(g).sort(), [...keys].sort());
});

test('the clusters written in the graph come next, each with its members, a thing in two in the first', () => {
  const d = drawing(
    [['c1', 'Cluster', 'Atoms'], ['c2', 'Cluster', 'Ions'], ['h'], ['o'], ['n'], ['na'], ['cl']],
    [
      ['h', 'c1', 'MEMBER_OF'],
      ['o', 'c1', 'MEMBER_OF'],
      ['o', 'c2', 'MEMBER_OF'],
      ['na', 'c2', 'MEMBER_OF'],
      ['cl', 'c2', 'MEMBER_OF'],
      ['n', 'h'],
    ],
  );
  const g = groupsOf(d, 500, 1);
  assert.equal(g.by, 'cluster');
  assert.deepEqual(g.groups.slice(0, 2), [
    { id: 'group:c1', label: 'Atoms', by: 'cluster', keys: ['c1', 'h', 'o'] },
    { id: 'group:c2', label: 'Ions', by: 'cluster', keys: ['c2', 'na', 'cl'] },
  ]);
  assert.deepEqual(
    g.groups.slice(2).map((x) => [x.by, x.keys]),
    [['links', ['n']]],
  );
});

test('style groups that hold less than half the things give way to kinds', () => {
  const d = drawing(
    [
      ['a', 'Person'],
      ['b', 'Person'],
      ['c', 'Place'],
      ['d', 'Place'],
    ],
    [['a', 'c']],
    [['Pair', ['a']]],
  );
  const g = groupsOf(d, 500, 1);
  assert.equal(g.by, 'kind');
  assert.deepEqual(
    g.groups.map((x) => [x.label, x.keys]),
    [
      ['Person', ['a', 'b']],
      ['Place', ['c', 'd']],
    ],
  );
  assert.deepEqual(g.between, [{ from: 0, to: 1, links: 1 }]);
});

test('with one kind, groups are found by links and named after their most linked thing', () => {
  const { keys, links } = twoBunches();
  const g = groupsOf(
    drawing(
      keys.map((k) => [k, 'Thing', `Thing ${k}`]),
      links,
    ),
    500,
    1,
  );
  assert.equal(g.by, 'links');
  assert.deepEqual(
    g.groups.map((x) => x.keys),
    [keys.slice(0, 5), keys.slice(5)],
  );
  assert.deepEqual(
    g.groups.map((x) => x.label),
    ['Around Thing t0', 'Around Thing t5'],
  );
  assert.deepEqual(g.between, [{ from: 0, to: 1, links: 1 }]);
});

test('a group over its size is split by its own links, each part saying which it is', () => {
  const { keys, links } = twoBunches();
  const g = groupsOf(drawing(keys.map((k) => [k, 'Thing', k]).concat([['p', 'Place']]), links), 6, 1);
  assert.equal(g.by, 'kind');
  assert.deepEqual(
    g.groups.map((x) => x.label),
    ['Thing, around t0', 'Thing, around t5', 'Place'],
  );
  assert.ok(g.groups.every((x) => x.keys.length <= 6));
});

test('things with no links are pooled, in written order, and split by size when the pool is too big', () => {
  const keys = Array.from({ length: 7 }, (_, i) => `n${i}`);
  const g = groupsOf(
    drawing(
      keys.map((k) => [k]),
      [],
    ),
    3,
    2,
  );
  assert.deepEqual(
    g.groups.map((x) => x.keys),
    [['n0', 'n1', 'n2'], ['n3', 'n4', 'n5'], ['n6']],
  );
  assert.equal(new Set(g.groups.map((x) => x.label)).size, 3, 'no two groups share a label');
  assert.equal(new Set(g.groups.map((x) => x.id)).size, 3, 'no two groups share an id');
});

test('the V-10 graph opens as its kinds, every thing in one group, none over the size', () => {
  const d = readNote([hugeBlock()]).graphs.get('huge');
  const g = groupsOf(d);
  assert.equal(g.by, 'kind');
  assert.deepEqual(allKeys(g).sort(), d.boxes.map((b) => b.key).sort());
  assert.ok(g.groups.every((x) => x.keys.length <= GROUP_MOST));
  assert.deepEqual(groupsOf(d), g, 'the same groups every time');
});

test('10 copies of the V-10 graph, of one kind, are grouped by links, none over the size', () => {
  const d = readNote([hugeBlock()]).graphs.get('huge');
  const boxes = [],
    links = [];
  for (let c = 0; c < 10; c++) {
    for (const b of d.boxes) boxes.push({ ...b, key: `${b.key}_c${c}`, kind: 'Thing' });
    for (const l of d.links) links.push({ ...l, from: `${l.from}_c${c}`, to: `${l.to}_c${c}` });
  }
  // how long it takes, up to 100 copies, is held by the scale benchmark's budgets (scripts/scale-benchmark.mjs)
  const g = groupsOf({ ...d, boxes, links, nudges: [] });
  assert.equal(g.by, 'links');
  assert.equal(allKeys(g).length, boxes.length);
  assert.ok(g.groups.every((x) => x.keys.length <= GROUP_MOST));
});
