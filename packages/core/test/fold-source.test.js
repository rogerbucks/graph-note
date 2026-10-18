// The layout source written as a drawing is folded, merged and routed (editor spec §25):
// - a busy hub's links as one stub with their count (untangle_hubs);
// - a group as one box with its count (untangle_groups);
// - the links between two groups as one trunk, with each link still its own line at either end (untangle_merge);
// - the links straight or right-angled (untangle_routing).
// Every box and link still drawn keeps the number Graphviz gave it unfolded, so a tap, a focus or a selection finds it
// as before. With nothing folded, merged or routed, the source is the one the Python library writes.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { edgesOf } from '../src/focus.ts';
import { drawingSource } from '../src/layout.ts';
import { foldedSource, routedSource } from '../src/fold-source.ts';
import { nudgedSource } from '../src/style-source.ts';
import { drawnGroups, foldPlan } from '../src/untangle-fold.ts';
import { loadEngine } from '../src/engine.ts';

const star = (n) =>
  [
    '// graph: g',
    "(hub:Hub {name: 'Hub'}),",
    "(far:Far {name: 'Far'}),",
    ...Array.from({ length: n }, (_, i) => `(leaf${i + 1}:Leaf {name: 'Leaf ${i + 1}'}),`),
    ...Array.from({ length: n }, (_, i) => `(hub)-[:HAS]->(leaf${i + 1}),`),
    '(leaf1)-[:NEAR]->(far)',
  ].join('\n');
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
const GROUPS = [
  { word: 'group', thing: 'ann', group: 'Red team' },
  { word: 'group', thing: 'bob', group: 'Red team' },
  { word: 'group', thing: 'cy', group: 'Blue team' },
  { word: 'group', thing: 'dee', group: 'Blue team' },
];
const NONE = { hubs: false, groups: false, merge: false };
const drawingOf = (text) => readNote([text]).graphs.get('g');
const keys = (d) => d.boxes.map((b) => b.key);
/** The source of a drawing with its group nudges, as render.ts writes it before folding. */
const grouped = (d) => nudgedSource(drawingSource(d, 'LR'), GROUPS, keys(d));
const nodeLines = (dot) => dot.split('\n').filter((l) => /^ {2}"[^"]*" \[/.test(l));
const linkLines = (dot) => dot.split('\n').filter((l) => /^ {2}"[^"]*" -> "[^"]*" \[/.test(l));
const idOf = (l) => /\[id="([^"]*)"/.exec(l)?.[1];

describe('nothing folded, merged or routed', () => {
  test('leaves the source as it is, byte for byte', () => {
    const d = drawingOf(TEAMS),
      dot = grouped(d);
    assert.equal(foldedSource(dot, undefined), dot);
    assert.equal(routedSource(dot, undefined), dot);
    assert.equal(routedSource(dot, 'curved'), dot);
    // merging with no two links between the same two groups changes nothing either
    const lone = drawingOf(TEAMS.replace('(bob)-[:ASKS]->(dee),\n', ''));
    const plan = foldPlan(keys(lone), edgesOf(lone), drawnGroups(GROUPS, keys(lone)), { ...NONE, merge: true });
    assert.equal(foldedSource(grouped(lone), plan), grouped(lone));
  });
});

describe('a busy hub folded', () => {
  const d = drawingOf(star(13));
  const plan = foldPlan(keys(d), edgesOf(d), [], { ...NONE, hubs: true });
  const dot = foldedSource(drawingSource(d, 'LR'), plan);

  test('draws only what is left, each box and link under the number it had', () => {
    assert.deepEqual(nodeLines(dot).map(idOf), ['node1', 'node2', 'node3', 'fold_hub_1']);
    assert.deepEqual(linkLines(dot).map(idOf), ['edge14', 'fold_hub_1_link']);
    assert.ok(!dot.includes('"leaf2"'), 'a thing hidden with the hub is named nowhere, so Graphviz never makes it');
    assert.ok(!dot.includes('rank=same'), 'a column of one is no column');
  });

  test('a box around things some of which are hidden with it keeps only those still drawn', () => {
    const nudges = ['leaf1', 'leaf2', 'leaf3'].map((thing) => ({ word: 'group', thing, group: 'Front' }));
    const grouped = foldedSource(nudgedSource(drawingSource(d, 'LR'), nudges, keys(d)), plan);
    const box = grouped.split('\n').find((l) => l.startsWith('  subgraph cluster_1 '));
    assert.ok(box.endsWith('style="rounded"; "leaf1"; }'), box);
  });

  test('draws its links as one stub, joined to it, marked with their count', () => {
    const lines = dot.split('\n');
    assert.deepEqual(lines.slice(-3), [
      '  "hub: 1" [id="fold_hub_1", label="13 links", shape=box, style="rounded,dashed", fontsize=9, color="#0000fe", fontcolor="#0000fe"];',
      '  "hub" -> "hub: 1" [id="fold_hub_1_link", style=dashed, dir=none, color="#0000fe"];',
      '}',
    ]);
  });
});

describe('a group folded', () => {
  const d = drawingOf(TEAMS);
  const plan = foldPlan(keys(d), edgesOf(d), drawnGroups(GROUPS, keys(d)), { ...NONE, groups: true });
  const dot = foldedSource(grouped(d), plan);

  test('draws its things as one box showing its count, in place of its box around them', () => {
    assert.deepEqual(nodeLines(dot).map(idOf), ['node5', 'fold_group_1', 'fold_group_2']);
    assert.ok(!dot.includes('subgraph cluster_'), 'no box around things no longer drawn');
    assert.ok(
      dot.includes(
        '  "group: 1" [id="fold_group_1", label=<Red team<br/><font point-size="9">2 things</font>>, style="rounded", color="#0000fe", fontcolor="#0000fe"];',
      ),
    );
  });

  test('draws each link to one of its things to the box, under its own number; a link inside it is not drawn', () => {
    assert.deepEqual(
      linkLines(dot).map((l) => [idOf(l), /^ {2}("[^"]*" -> "[^"]*")/.exec(l)[1]]),
      [
        ['edge2', '"group: 1" -> "group: 2"'],
        ['edge3', '"group: 1" -> "group: 2"'],
        ['edge5', '"group: 2" -> "eve"'],
      ],
    );
  });
});

describe('links between two groups merged', () => {
  const d = drawingOf(TEAMS);
  const plan = foldPlan(keys(d), edgesOf(d), drawnGroups(GROUPS, keys(d)), { ...NONE, merge: true });
  const dot = foldedSource(grouped(d), plan);
  const lines = dot.split('\n');

  test('run as one trunk: each link from its thing to the trunk, then from the trunk on, with its reading', () => {
    const ask = linkLines(drawingSource(d, 'LR'))[1];
    const colour = /, color="(#[0-9a-f]{6})"/.exec(ask)[1];
    assert.ok(lines.includes(`  "ann" -> "trunk: 1 in" [id="edge2_tail", color="${colour}", dir=none];`));
    assert.ok(lines.includes(`  "trunk: 1 out" -> "cy" [id="edge2", ${/\[(.*)\];$/.exec(ask)[1]}];`));
    assert.ok(lines.includes('  "bob" -> "trunk: 1 in" [id="edge3_tail", color="' + colour + '", dir=none];'));
    assert.deepEqual(lines.slice(-4), [
      '  "trunk: 1 in" [id="trunk_1_in", shape=point, width=0.08, label=""];',
      '  "trunk: 1 out" [id="trunk_1_out", shape=point, width=0.08, label=""];',
      '  "trunk: 1 in" -> "trunk: 1 out" [id="trunk_1", dir=none, penwidth=2.5];',
      '}',
    ]);
  });

  test('a link inside a group, or to a thing in no group, is drawn as it was, under its number', () => {
    assert.ok(lines.some((l) => l.startsWith('  "ann" -> "bob" [id="edge1", label=')));
    assert.ok(lines.some((l) => l.startsWith('  "dee" -> "eve" [id="edge5", label=')));
    assert.ok(dot.includes('subgraph cluster_1'), 'the groups are drawn as before');
  });
});

describe('links routed', () => {
  const dot = drawingSource(drawingOf(TEAMS), 'LR');

  test('straight: every link a straight line', () => {
    assert.deepEqual(routedSource(dot, 'straight').split('\n').slice(0, 2), ['digraph G {', '  graph [splines=line];']);
  });

  test('right-angled: every link at right angles, its reading set beside it, as such links take it', () => {
    const routed = routedSource(dot, 'right-angled');
    assert.equal(routed.split('\n')[1], '  graph [splines=ortho];');
    assert.deepEqual(
      linkLines(routed).map((l) => /\[(x?label)=/.exec(l)[1]),
      ['xlabel', 'xlabel', 'xlabel', 'xlabel', 'xlabel'],
    );
    const folded = routedSource('digraph G {\n  "a" -> "b" [id="edge2", label="x"];\n}', 'right-angled');
    assert.ok(folded.includes('  "a" -> "b" [id="edge2", xlabel="x"];'));
  });

  // proves: radial_links_round
  test('a radial drawing curves its links unless they are routed, and then they go the way chosen', () => {
    const radial = 'digraph G {\n  rankdir=LR;\n  graph [layout=twopi, root="a", overlap=false, splines=true];\n}';
    assert.equal(routedSource(radial, undefined), radial, 'curved: as the radial drawing asks');
    for (const [routing, splines] of [
      ['straight', 'line'],
      ['right-angled', 'ortho'],
    ]) {
      const routed = routedSource(radial, routing);
      assert.deepEqual(
        [...routed.matchAll(/splines=(\w+)/g)].map((m) => m[1]),
        [splines],
        `${routing}: one way to route`,
      );
      assert.ok(routed.includes('  graph [layout=twopi, root="a", overlap=false];'), `${routing}: still radial`);
    }
  });
});

describe('Graphviz draws it so', () => {
  let engine;
  before(async () => {
    engine = await loadEngine();
  });
  const ids = (svg, kind) => [...svg.matchAll(new RegExp(`<g id="([^"]*)" class="${kind}"`, 'g'))].map((m) => m[1]);

  test('each box and link still drawn under its own number, the stub, box and trunk under theirs', () => {
    const hub = drawingOf(star(13));
    const hubPlan = foldPlan(keys(hub), edgesOf(hub), [], { ...NONE, hubs: true });
    const folded = engine.render(foldedSource(drawingSource(hub, 'LR'), hubPlan));
    // Graphviz writes them in the order it lays them out, so they are compared in order of name
    assert.deepEqual(ids(folded, 'node').sort(), ['fold_hub_1', 'node1', 'node2', 'node3']);
    assert.deepEqual(ids(folded, 'edge').sort(), ['edge14', 'fold_hub_1_link']);
    const teams = drawingOf(TEAMS);
    const both = foldPlan(keys(teams), edgesOf(teams), drawnGroups(GROUPS, keys(teams)), { ...NONE, merge: true });
    const merged = engine.render(routedSource(foldedSource(grouped(teams), both), 'straight'));
    assert.deepEqual(ids(merged, 'edge').sort(), [
      'edge1',
      'edge2',
      'edge2_tail',
      'edge3',
      'edge3_tail',
      'edge4',
      'edge5',
      'trunk_1',
    ]);
  });
});
