// Edge cases (editor spec §9 and §7): empty, broken and oversized inputs each give a stated result, never a blank or a
// crash. One section for each kind of input; later work adds the empty view and the empty export to it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { PathPlayer, pathBlock, pathProblems, pathsOf } from '../src/paths.ts';

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
