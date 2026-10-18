// Folding a busy hub's links into one stub, and a group into one box (editor spec §25, untangle_hubs, untangle_groups).
// Also merging the links between two groups into trunks (untangle_merge). What is folded, hidden or merged is worked
// out from the drawing alone. So the host changes the drawing and nothing else (untangle_data_untouched).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { edgesOf } from '../src/focus.ts';
import { BUSY_HUB, busyHubs, drawnGroups, foldPlan, foldsHiding } from '../src/untangle-fold.ts';

/** A graph with a hub linked to `n` leaves, and one of those leaves linked on to another thing. */
const star = (n) => {
  const leaves = Array.from({ length: n }, (_, i) => `(leaf${i + 1}:Leaf {name: 'Leaf ${i + 1}'})`);
  const links = Array.from({ length: n }, (_, i) => `(hub)-[:HAS]->(leaf${i + 1})`);
  return [
    '// graph: g',
    "(hub:Hub {name: 'Hub'}),",
    "(far:Far {name: 'Far'}),",
    ...leaves.map((l) => `${l},`),
    ...links.map((l) => `${l},`),
    '(leaf1)-[:NEAR]->(far)',
  ].join('\n');
};
const drawingOf = (text) => readNote([text]).graphs.get('g');
const keysOf = (d) => d.boxes.map((b) => b.key);
const NONE = { hubs: false, groups: false, merge: false };

describe('a busy hub', () => {
  test('is a thing with more links than the set number, counting each link once at each end', () => {
    assert.equal(BUSY_HUB, 12);
    const busy = drawingOf(star(BUSY_HUB + 1)),
      quiet = drawingOf(star(BUSY_HUB));
    assert.deepEqual(busyHubs(keysOf(busy), edgesOf(busy)), ['hub']);
    assert.deepEqual(busyHubs(keysOf(quiet), edgesOf(quiet)), []);
  });

  test('folded, its links are drawn as one stub with their count, and what hung only from it is hidden with them', () => {
    const d = drawingOf(star(13));
    const plan = foldPlan(keysOf(d), edgesOf(d), [], { ...NONE, hubs: true });
    assert.deepEqual(plan.hubs, [['hub', 13]]);
    assert.deepEqual(
      plan.folded,
      Array.from({ length: 13 }, (_, i) => i),
    );
    // leaf1 has a link of its own to far, so it stays, with far
    assert.deepEqual(
      plan.hidden,
      Array.from({ length: 12 }, (_, i) => `leaf${i + 2}`),
    );
    assert.deepEqual(plan.groups, []);
    assert.equal(plan.merge, false);
  });

  test('a hub opened again is not folded; with the switch off, or no hub busy, nothing is', () => {
    const d = drawingOf(star(13));
    assert.equal(foldPlan(keysOf(d), edgesOf(d), [], { ...NONE, hubs: true, opened: { hubs: ['hub'] } }), undefined);
    assert.equal(foldPlan(keysOf(d), edgesOf(d), [], NONE), undefined);
    const quiet = drawingOf(star(12));
    assert.equal(foldPlan(keysOf(quiet), edgesOf(quiet), [], { ...NONE, hubs: true }), undefined);
  });

  test('says which folds hide a thing, so finding it can open them', () => {
    const d = drawingOf(star(13));
    const plan = foldPlan(keysOf(d), edgesOf(d), [], { ...NONE, hubs: true });
    assert.deepEqual(foldsHiding(plan, edgesOf(d), 'leaf5'), { hubs: ['hub'] });
    assert.deepEqual(foldsHiding(plan, edgesOf(d), 'leaf1'), { hubs: [] });
    assert.deepEqual(foldsHiding(undefined, edgesOf(d), 'leaf5'), { hubs: [] });
  });
});

const TEAMS = `// graph: g
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(eve:Person {name: 'Eve'}),
(ann)-[:HELPS]->(bob),
(ann)-[:ASKS]->(cy),
(bob)-[:ASKS]->(dee),
(cy)-[:HELPS]->(dee),
(dee)-[:ASKS]->(eve)`;
const STYLE = `// graph: g_style · STYLE g
(n1:Nudge {word: 'group', thing: 'ann', group: 'Red team'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Red team'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Blue team'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Blue team'})`;

describe('groups', () => {
  const texts = [TEAMS, STYLE];
  const reading = readNote(texts);
  const d = reading.graphs.get('g');
  const nudges = [
    { word: 'group', thing: 'ann', group: 'Red team' },
    { word: 'group', thing: 'bob', group: 'Red team' },
    { word: 'group', thing: 'cy', group: 'Blue team' },
    { word: 'group', thing: 'dee', group: 'Blue team' },
    { word: 'group', thing: 'dee', group: 'Blue team' },
    { word: 'beside', thing: 'ann', other: 'eve' },
  ];

  test('are the groups the nudges draw, in the order first written, each thing once; none drawn as lanes', () => {
    const groups = drawnGroups(nudges, keysOf(d));
    assert.deepEqual(groups, [
      ['Red team', ['ann', 'bob']],
      ['Blue team', ['cy', 'dee']],
    ]);
    assert.deepEqual(drawnGroups(nudges, ['ann', 'cy', 'dee']), [
      ['Red team', ['ann']],
      ['Blue team', ['cy', 'dee']],
    ]);
    assert.deepEqual(drawnGroups(nudges, keysOf(d), { type: 'lanes' }), []);
  });

  test('folded, each is one box: the links inside it are folded, and its things drawn as the box', () => {
    const groups = drawnGroups(nudges, keysOf(d));
    const plan = foldPlan(keysOf(d), edgesOf(d), groups, { ...NONE, groups: true });
    assert.deepEqual(plan.groups, [
      ['Red team', ['ann', 'bob'], true],
      ['Blue team', ['cy', 'dee'], true],
    ]);
    assert.deepEqual(plan.folded, [0, 3], 'ann helps bob and cy helps dee are inside their boxes');
    assert.deepEqual(plan.hidden, []);
    assert.deepEqual(foldsHiding(plan, edgesOf(d), 'bob'), { hubs: [], group: 'Red team' });
  });

  test('a group opened again is drawn as it was, the others still folded', () => {
    const groups = drawnGroups(nudges, keysOf(d));
    const plan = foldPlan(keysOf(d), edgesOf(d), groups, { ...NONE, groups: true, opened: { groups: ['Red team'] } });
    assert.deepEqual(
      plan.groups.map(([label, , folded]) => [label, folded]),
      [
        ['Red team', false],
        ['Blue team', true],
      ],
    );
    assert.deepEqual(plan.folded, [3]);
  });

  test('merged, the links between groups are left to the source, which trunks them: the plan says so', () => {
    const groups = drawnGroups(nudges, keysOf(d));
    const plan = foldPlan(keysOf(d), edgesOf(d), groups, { ...NONE, merge: true });
    assert.equal(plan.merge, true);
    assert.deepEqual(plan.folded, []);
    assert.deepEqual(
      plan.groups.map(([label, , folded]) => [label, folded]),
      [
        ['Red team', false],
        ['Blue team', false],
      ],
    );
    assert.equal(
      foldPlan(keysOf(d), edgesOf(d), [], { ...NONE, merge: true }),
      undefined,
      'no groups, nothing to merge',
    );
  });

  test('a busy hub inside a folded group is drawn as the box, never folded on its own', () => {
    const big = drawingOf(star(13));
    const plan = foldPlan(keysOf(big), edgesOf(big), [['Centre', ['hub', 'far']]], {
      hubs: true,
      groups: true,
      merge: false,
    });
    assert.deepEqual(plan.hubs, []);
    assert.deepEqual(plan.hidden, []);
  });
});
