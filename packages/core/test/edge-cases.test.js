// Edge cases (editor spec §9 and §7): empty, broken and oversized inputs each give a stated result, never a blank or a
// crash. One section for each kind of input: paths, and the empty view; later work adds the empty export to it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { PathPlayer, pathBlock, pathProblems, pathsOf } from '../src/paths.ts';
import { evaluate } from '../src/view-evaluate.ts';

const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'})`;

describe('paths: empty and broken', () => {
  // proves: path_no_steps
  test('a Path with no steps is stated, marked empty, refused by the player, and never a blank', () => {
    const reading = readNote([`${TRIP},\n(tour:Path {title: 'Walk'})`]);
    assert.deepEqual(
      reading.problems.map((p) => p.message),
      ['the path Walk has no steps'],
    );
    const [path] = pathsOf(reading, 'trip');
    assert.equal(path.empty, true);
    assert.equal(PathPlayer.refusal(path), 'the path Walk has no steps');
    assert.throws(() => new PathPlayer(path), /has no steps/);
  });

  // proves: path_no_steps
  test('a path whose every step is missing is stated once for each, plays by announcing each as missing', () => {
    const block = `${TRIP},
(tour:Path {title: 'Lost'}),
(tour)-[:STEP {seq: 1}]->(gone_one),
(tour)-[:STEP {seq: 2}]->(gone_two)`;
    const reading = readNote([block]);
    assert.deepEqual(
      reading.problems.map((p) => p.message),
      [
        'the path Lost steps through gone_one, which is not in graph trip',
        'the path Lost steps through gone_two, which is not in graph trip',
      ],
    );
    const [path] = pathsOf(reading, 'trip');
    assert.equal(path.empty, false);
    assert.deepEqual(
      path.steps.map((s) => s.missing),
      [true, true],
    );
    const player = new PathPlayer(path);
    assert.deepEqual(player.sentences, [
      'Step 1 of 2: missing. gone_one is not in the graph.',
      'Step 2 of 2: missing. gone_two is not in the graph.',
    ]);
  });

  // proves: path_no_steps
  test('an empty title is stated by the path’s name, never a blank, in the problem, the data and the sentence', () => {
    for (const written of ["(tour:Path {title: ''})", '(tour:Path)']) {
      const reading = readNote([`${TRIP},\n${written}`]);
      // a hint only offers a fix, and is no problem (a path written with no title at all is offered one)
      assert.deepEqual(
        reading.problems.filter((p) => p.severity !== 'hint').map((p) => p.message),
        ['the path tour has no steps'],
        written,
      );
      const [path] = pathsOf(reading, 'trip');
      assert.equal(path.title, 'tour', written);
      assert.equal(PathPlayer.refusal(path), 'the path tour has no steps', written);
    }
    const steps = `${TRIP},\n(tour:Path {title: ''}),\n(tour)-[:STEP {seq: 1}]->(home)`;
    const [path] = pathsOf(readNote([steps]), 'trip');
    assert.equal(path.title, 'tour');
    assert.equal(new PathPlayer(path).sentence, 'Step 1 of 1: Home');
  });

  // proves: path_no_steps
  test('a path recorded with nothing, or no title, is refused with a reason, and nothing is written', () => {
    const reading = readNote([TRIP]);
    for (const [title, steps, said] of [
      ['A walk', [], /no steps/],
      ['', ['home'], /title/],
      ['A walk', ['home', 'gone'], /gone/],
    ]) {
      const r = pathBlock(reading, 'trip', TRIP, title, steps);
      assert.ok('refused' in r, `${title}/${steps}`);
      assert.match(r.refused, said);
    }
  });

  // proves: path_missing_step
  test('asking of a note with nothing in it, or a graph that is not there, gives an empty answer, not a crash', () => {
    const none = readNote([]);
    assert.deepEqual(pathProblems(none), []);
    assert.deepEqual(pathsOf(none, 'trip'), []);
    assert.deepEqual(pathProblems(readNote([TRIP]), 'elsewhere'), []);
  });

  // proves: path_missing_step
  test('a block that cannot be read at all gives its own problem, and no path is made up', () => {
    const reading = readNote(['// graph: trip · SOURCE\n(((']);
    assert.ok(reading.problems.length >= 1);
    assert.deepEqual(pathProblems(reading), []);
  });
});

describe('views: nothing matches', () => {
  const GROUP = `// graph: group · SOURCE
(ann:Person {name: 'Ann'}),
(ben:Person {name: 'Ben'}),
(solo:Person {name: 'Solo'}),
(ann)-[:KNOWS]->(ben)`;
  const reading = readNote([GROUP]);
  const on = (view, r = reading, graph = 'group') => evaluate(view, r, graph);
  /** A result that matches nothing says so in a sentence that offers to change the view, and draws nothing. */
  const stated = (r, said) => {
    assert.equal(r.empty, true);
    assert.deepEqual([r.things, r.links], [[], []]);
    assert.equal(r.why, said);
    assert.match(r.why, /change the view/);
  };

  // proves: empty_view
  test('a view naming a thing the graph does not hold says which, and to pick another, whatever the kind', () => {
    const said = 'No thing is called zed: pick another, or change the view';
    stated(on({ kind: 'picked', ids: ['zed'] }), said);
    stated(on({ kind: 'near', id: 'zed', depth: 2 }), said);
    stated(on({ kind: 'reaches', from: 'zed', to: 'ann', steps: 3, directed: true }), said);
    stated(on({ kind: 'reaches', from: 'ann', to: 'zed', steps: 3, directed: false }), said);
    stated(
      on({ kind: 'reaches', from: 'zed', to: 'yok', steps: 3, directed: true }),
      'No thing is called zed or yok: pick others, or change the view',
    );
    stated(
      on({ kind: 'picked', ids: ['zed', 'yok'] }),
      'No thing is called zed or yok: pick others, or change the view',
    );
  });

  // proves: empty_view
  test('a hand-picked set of nothing, kinds none of which exist, and a path with no steps each say so', () => {
    stated(on({ kind: 'picked', ids: [] }), 'Nothing is picked: pick a thing, or change the view');
    stated(on({ kind: 'kinds', kinds: ['Robot'] }), 'No thing is a Robot: pick other kinds, or change the view');
    stated(
      on({ kind: 'kinds', kinds: ['Robot', 'Ghost', 'Yeti'] }),
      'No thing is a Robot, Ghost or Yeti: pick other kinds, or change the view',
    );
    const bare = readNote([`${GROUP},\n(walk:Path {title: 'Walk'})`]);
    stated(on({ kind: 'path', path: 'walk' }, bare), 'The path Walk has no steps: record a walk, or change the view');
  });

  // proves: empty_view
  test('a thing with no links, and two things with no way between them, say so', () => {
    stated(
      on({ kind: 'near', id: 'solo', depth: 3 }),
      'Solo has no links, so nothing is near it: pick another thing, or change the view',
    );
    stated(
      on({ kind: 'reaches', from: 'ben', to: 'ann', steps: 6, directed: true }),
      'Ben does not reach Ann in up to 6 steps: allow either direction, or change the view',
    );
    stated(
      on({ kind: 'reaches', from: 'ann', to: 'solo', steps: 1, directed: false }),
      'Ann and Solo are not connected in up to 1 step: pick other things, or change the view',
    );
  });

  // proves: empty_view
  test('an empty graph, a graph that is not there and a note with nothing in it each say so, never a blank', () => {
    const empty = readNote(['// graph: void · SOURCE\n']);
    for (const view of [
      { kind: 'picked', ids: ['a'] },
      { kind: 'near', id: 'a', depth: 1 },
      { kind: 'reaches', from: 'a', to: 'b', steps: 2, directed: true },
      { kind: 'kinds', kinds: ['A'] },
      { kind: 'path', path: 'a' },
    ]) {
      stated(on(view, empty, 'void'), 'Graph void has no things in this note: add some, or change the view');
      stated(
        on(view, reading, 'elsewhere'),
        'Graph elsewhere has no things in this note: add some, or change the view',
      );
      stated(on(view, readNote([]), 'group'), 'Graph group has no things in this note: add some, or change the view');
    }
  });

  // proves: empty_view
  test('whatever the view, either something is shown or the result is empty with its reason, and never both or neither', () => {
    const ids = ['ann', 'ben', 'solo', 'zed'];
    const views = [
      ...ids.map((id) => ({ kind: 'near', id, depth: 1 })),
      ...ids.flatMap((from) => ids.map((to) => ({ kind: 'reaches', from, to, steps: 2, directed: false }))),
      ...ids.map((id) => ({ kind: 'picked', ids: [id] })),
      ...['Person', 'Robot'].map((k) => ({ kind: 'kinds', kinds: [k] })),
      ...ids.map((path) => ({ kind: 'path', path })),
    ];
    for (const view of views) {
      const r = on(view);
      assert.equal(r.empty, r.things.length === 0, JSON.stringify(view));
      assert.equal(typeof r.why === 'string' && r.why.length > 0, r.empty, JSON.stringify(view));
      if (r.empty) assert.deepEqual(r.links, []);
    }
  });
});
