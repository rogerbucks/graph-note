// What a view shows (editor spec §7): each of the five kinds put to a small graph, giving the things Grafeo gives for the
// same query and the links to draw with them, as indexes into the drawing's links. The expected things were checked
// against Grafeo too: 2,764 queries on 260 random graphs, run on 11 Oct 2026, gave the same things (and, for how one thing
// reaches another, the same links) as the core.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { evaluate } from '../src/view-evaluate.ts';

// links 0..4 in the order written
const TEAM = `// graph: team · SOURCE
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(carol:Person {name: 'Carol'}),
(dan:Person {name: 'Dan'}),
(zoe:Person {name: 'Zoe'}),
(core:Team {name: 'Core'}),
(alice)-[:KNOWS]->(bob),
(bob)-[:KNOWS]->(carol),
(carol)-[:KNOWS]->(dan),
(alice)-[:MEMBER_OF]->(core),
(bob)-[:MEMBER_OF]->(core)`;
const TOUR = `${TEAM},
(tour:Path {title: 'Tour'}),
(tour)-[:STEP {seq: 1}]->(alice),
(tour)-[:STEP {seq: 2}]->(core),
(tour)-[:STEP {seq: 3}]->(bob)`;
// a walk may use a link again: a to b can go x to y and back to x
const LOOPS = `// graph: loops · SOURCE
(a:Thing {name: 'A'}),
(x:Thing {name: 'X'}),
(y:Thing {name: 'Y'}),
(b:Thing {name: 'B'}),
(a)-[:R]->(x),
(x)-[:R]->(y),
(y)-[:R]->(x),
(x)-[:R]->(b)`;

const team = readNote([TEAM]);
const run = (reading, graph, view) => evaluate(view, reading, graph);
const onTeam = (view) => run(team, 'team', view);

describe('a hand-picked set', () => {
  // proves: five_view_kinds
  test('is the things named, in the order named, with the links between them', () => {
    assert.deepEqual(onTeam({ kind: 'picked', ids: ['core', 'alice'] }), {
      things: ['core', 'alice'],
      links: [3],
      empty: false,
    });
    assert.deepEqual(onTeam({ kind: 'picked', ids: ['bob', 'alice', 'bob'] }).things, ['bob', 'alice']);
  });

  // proves: empty_view
  test('says which names the graph does not hold, and still gives the rest', () => {
    const r = onTeam({ kind: 'picked', ids: ['alice', 'zed'] });
    assert.deepEqual([r.things, r.missing, r.empty], [['alice'], ['zed'], false]);
  });
});

describe('everything near a thing', () => {
  // proves: five_view_kinds
  test('is the thing and what is 1 to 3 links from it either way, with every link among them', () => {
    const near = (id, depth) => onTeam({ kind: 'near', id, depth });
    assert.deepEqual(near('alice', 1), { things: ['alice', 'bob', 'core'], links: [0, 3, 4], empty: false });
    assert.deepEqual(near('alice', 2), {
      things: ['alice', 'bob', 'carol', 'core'],
      links: [0, 1, 3, 4],
      empty: false,
    });
    assert.deepEqual(near('dan', 1), { things: ['carol', 'dan'], links: [2], empty: false });
    assert.deepEqual(near('dan', 3).things, ['alice', 'bob', 'carol', 'dan', 'core']);
    assert.deepEqual(near('dan', 3).links, [0, 1, 2, 3, 4]);
  });

  // proves: empty_view
  test('a thing with no links has nothing near it, which is said', () => {
    const r = onTeam({ kind: 'near', id: 'zoe', depth: 2 });
    assert.deepEqual([r.things, r.links, r.empty], [[], [], true]);
    assert.equal(r.why, 'Zoe has no links, so nothing is near it: pick another thing, or change the view');
  });
});

describe('how one thing reaches another', () => {
  const reach = (from, to, steps, directed = true) => onTeam({ kind: 'reaches', from, to, steps, directed });

  // proves: five_view_kinds
  test('is the things and links on the routes, following the arrows', () => {
    assert.deepEqual(reach('alice', 'dan', 6), {
      things: ['alice', 'bob', 'carol', 'dan'],
      links: [0, 1, 2],
      empty: false,
    });
    assert.equal(reach('alice', 'dan', 3).empty, false);
    assert.equal(reach('alice', 'core', 1).empty, false);
  });

  // proves: five_view_kinds
  test('without the arrow, goes either way along a link, so more of the graph is on a route as steps are allowed', () => {
    assert.deepEqual(reach('alice', 'dan', 3, false), {
      things: ['alice', 'bob', 'carol', 'dan'],
      links: [0, 1, 2],
      empty: false,
    });
    assert.deepEqual(reach('alice', 'dan', 4, false).things, ['alice', 'bob', 'carol', 'dan', 'core']);
    assert.deepEqual(reach('alice', 'dan', 4, false).links, [0, 1, 2, 3, 4]);
    assert.deepEqual(reach('dan', 'alice', 3, false).links, [0, 1, 2]);
  });

  // proves: views_agree_with_grafeo
  test('takes a route as Grafeo does, a walk that may use a link again, so it can go round a loop on the way', () => {
    const loops = readNote([LOOPS]);
    const walk = (steps) => run(loops, 'loops', { kind: 'reaches', from: 'a', to: 'b', steps, directed: true });
    assert.deepEqual(walk(2), { things: ['a', 'x', 'b'], links: [0, 3], empty: false });
    assert.deepEqual(walk(3), { things: ['a', 'x', 'b'], links: [0, 3], empty: false });
    assert.deepEqual(walk(4), { things: ['a', 'x', 'y', 'b'], links: [0, 1, 2, 3], empty: false });
    // from a thing to itself: round the loop
    const round = (steps) => run(loops, 'loops', { kind: 'reaches', from: 'x', to: 'x', steps, directed: true });
    assert.equal(round(1).empty, true);
    assert.deepEqual(round(2), { things: ['x', 'y'], links: [1, 2], empty: false });
  });

  // proves: empty_view
  test('with no route in the steps allowed, says so and what could be changed', () => {
    const r = reach('alice', 'dan', 2);
    assert.deepEqual([r.things, r.links, r.empty], [[], [], true]);
    assert.equal(r.why, 'Alice does not reach Dan in up to 2 steps: allow either direction, or change the view');
    assert.equal(
      reach('zoe', 'alice', 6, false).why,
      'Zoe and Alice are not connected in up to 6 steps: pick other things, or change the view',
    );
    assert.equal(
      reach('alice', 'alice', 1).why,
      'Alice does not reach Alice in up to 1 step: allow either direction, or change the view',
    );
  });
});

describe('only some kinds', () => {
  // proves: five_view_kinds
  test('is the things of those kinds, in the drawing’s order, with the links among them', () => {
    assert.deepEqual(onTeam({ kind: 'kinds', kinds: ['Person'] }), {
      things: ['alice', 'bob', 'carol', 'dan', 'zoe'],
      links: [0, 1, 2],
      empty: false,
    });
    assert.deepEqual(onTeam({ kind: 'kinds', kinds: ['Team', 'Nothing'] }), {
      things: ['core'],
      links: [],
      empty: false,
    });
    assert.equal(onTeam({ kind: 'kinds', kinds: ['Person', 'Team'] }).things.length, 6);
  });

  // proves: empty_view
  test('with none of those kinds in the graph, says so', () => {
    const r = onTeam({ kind: 'kinds', kinds: ['Nothing', 'Zilch'] });
    assert.deepEqual([r.things, r.empty], [[], true]);
    assert.equal(r.why, 'No thing is a Nothing or Zilch: pick other kinds, or change the view');
  });
});

describe('a walked path', () => {
  const tour = readNote([TOUR]);
  const walk = (path) => run(tour, 'team', { kind: 'path', path });

  // proves: five_view_kinds
  test('is the Path and its steps, with the steps in order', () => {
    const r = walk('tour');
    assert.deepEqual(r.things, ['tour', 'alice', 'core', 'bob']);
    assert.deepEqual(r.walk, ['alice', 'core', 'bob']);
    assert.deepEqual(
      r.links.map((i) => tour.graphs.get('team').links[i]).map((l) => `${l.from} ${l.type} ${l.to}`),
      ['tour STEP alice', 'tour STEP core', 'tour STEP bob'],
    );
  });

  // proves: five_view_kinds
  test('goes by the steps’ numbers, not the order they were written in, and a thing revisited is one thing', () => {
    const turned = readNote([
      `${TEAM},\n(tour:Path {title: 'Tour'}),\n(tour)-[:STEP {seq: 2}]->(bob),\n(tour)-[:STEP {seq: 1}]->(alice),\n(tour)-[:STEP {seq: 3}]->(alice)`,
    ]);
    const r = run(turned, 'team', { kind: 'path', path: 'tour' });
    assert.deepEqual(r.walk, ['alice', 'bob', 'alice']);
    assert.deepEqual(r.things, ['tour', 'alice', 'bob']);
    assert.deepEqual(r.links, [6, 5, 7]);
  });

  // proves: empty_view
  test('something that is not a path, or is not there, says so', () => {
    assert.equal(walk('alice').why, 'Alice is not a path: pick a path, or change the view');
    assert.equal(walk('nowhere').why, 'No path is called nowhere: pick another, or change the view');
    assert.equal(walk('alice').empty && walk('nowhere').empty, true);
  });

  // proves: empty_view
  test('a step through something removed is left out of the walk; with every step gone, the path is empty and says so', () => {
    const part = readNote([
      `${TEAM},\n(tour:Path {title: 'Tour'}),\n(tour)-[:STEP {seq: 1}]->(alice),\n(tour)-[:STEP {seq: 2}]->(gone)`,
    ]);
    assert.deepEqual(run(part, 'team', { kind: 'path', path: 'tour' }).walk, ['alice']);
    const none = readNote([`${TEAM},\n(tour:Path {title: 'Lost'}),\n(tour)-[:STEP {seq: 1}]->(gone)`]);
    const r = run(none, 'team', { kind: 'path', path: 'tour' });
    assert.equal(r.empty, true);
    assert.equal(r.why, 'Every step of the path Lost is gone from the graph: restore a step, or change the view');
  });
});

describe('the links are the drawing’s', () => {
  // proves: views_agree_with_grafeo
  test('each link of a view is an index into the links the graph draws, and is one whose ends are both in the view', () => {
    const links = team.graphs.get('team').links;
    const r = onTeam({ kind: 'near', id: 'alice', depth: 1 });
    assert.deepEqual(
      r.links.map((i) => `${links[i].from} ${links[i].type} ${links[i].to}`),
      ['alice KNOWS bob', 'alice MEMBER_OF core', 'bob MEMBER_OF core'],
    );
    for (const i of r.links) assert.ok(r.things.includes(links[i].from) && r.things.includes(links[i].to));
  });

  // proves: views_agree_with_grafeo
  test('a view’s answer is the same whatever else the note holds, and the reading is not changed by it', () => {
    const before = JSON.stringify(team.graphs.get('team'));
    onTeam({ kind: 'reaches', from: 'alice', to: 'dan', steps: 6, directed: false });
    assert.equal(JSON.stringify(team.graphs.get('team')), before);
  });
});
