// What an export holds (editor spec §16): the whole diagram, or a view; a view only of what is in it, unless the faded
// context is asked for, and then the whole graph with what is outside the view marked to be faded. A graph or view with
// nothing in it is said to be empty, never drawn as a blank.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { exportScope } from '../src/export-scope.ts';
import { drawingSource } from '../src/layout.ts';

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
// the same, with a link whose type is a near miss (link 8, drawn as a guess) and one whose end is (link 9)
const READER = `// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(price:Reason {title: 'Costs less'}),
(small_reader)-[:ANSWERS]->(question),
(large_reader)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large_reader),
(price)-[:FAVOURS]->(small_reader),
(eyes)-[:FAVORS]->(small_reader),
(price)-[:FAVOURS]->(large_reedr)`;

const team = readNote([TEAM]);
const reader = readNote([READER]);
const keys = (d) => d.boxes.map((b) => b.key);

describe('the whole diagram', () => {
  // proves: export_two_scopes
  test('is the graph as it is drawn, with nothing faded', () => {
    const s = exportScope(team, { graph: 'team' });
    assert.equal(s.kind, 'diagram');
    assert.equal(s.empty, false);
    assert.equal(s.drawing, team.graphs.get('team'));
    assert.deepEqual(s.faded, { things: [], links: [] });
    assert.equal(s.view, undefined);
  });

  // proves: export_two_scopes
  test('a request for the faded context means nothing for the whole diagram', () => {
    const s = exportScope(team, { graph: 'team', context: true });
    assert.equal(s.context, false);
    assert.deepEqual(s.faded, { things: [], links: [] });
  });
});

describe('a view', () => {
  const near = { name: 'around_bob', spec: { kind: 'near', id: 'bob', depth: 1 } };

  // proves: export_two_scopes
  test('is its own scope: it names the view and says it in plain English', () => {
    const s = exportScope(team, { graph: 'team', view: near });
    assert.deepEqual([s.kind, s.view, s.graph], ['view', 'around_bob', 'team']);
    assert.equal(s.reading, 'everything within 1 step of Bob');
  });

  // proves: view_export_stays_view
  test('holds only the things in the view and the links between them, in the order the graph draws them', () => {
    const s = exportScope(team, { graph: 'team', view: near });
    assert.deepEqual(keys(s.drawing), ['alice', 'bob', 'carol', 'core']);
    assert.deepEqual(
      s.drawing.links.map((l) => [l.from, l.to]),
      [
        ['alice', 'bob'],
        ['bob', 'carol'],
        ['alice', 'core'],
        ['bob', 'core'],
      ],
    );
    assert.deepEqual(s.faded, { things: [], links: [] });
    assert.equal(s.context, false);
    // the rest of the graph is not in what is laid out at all
    const source = drawingSource(s.drawing, 'LR');
    for (const gone of ['dan', 'zoe']) assert.ok(!source.includes(`"${gone}"`), gone);
  });

  // proves: view_export_stays_view
  test('a view of a walked path holds the path and its steps, and the links it walks', () => {
    const walk = readNote([
      `${TEAM},\n(tour:Path {title: 'Tour'}),\n(tour)-[:STEP {seq: 1}]->(alice),\n(tour)-[:STEP {seq: 2}]->(core)`,
    ]);
    const s = exportScope(walk, { graph: 'team', view: { name: 'tour', spec: { kind: 'path', path: 'tour' } } });
    assert.deepEqual(keys(s.drawing), ['alice', 'core', 'tour']);
    assert.deepEqual(
      s.drawing.links.map((l) => l.type),
      ['STEP', 'STEP'],
    );
  });

  // proves: view_export_stays_view
  test('a guess inside the view stays a guess, at its new place; one that reaches outside the view is left out', () => {
    const view = { name: 'reasons', spec: { kind: 'picked', ids: ['eyes', 'small_reader', 'price'] } };
    const s = exportScope(reader, { graph: 'reader', view });
    assert.deepEqual(keys(s.drawing), ['small_reader', 'eyes', 'price']);
    // links 3 (price to small_reader) and 4 (eyes to small_reader, typed FAVORS) are inside; the guess was link 4
    assert.deepEqual(
      s.drawing.links.map((l) => [l.from, l.type, l.to]),
      [
        ['price', 'FAVOURS', 'small_reader'],
        ['eyes', 'FAVORS', 'small_reader'],
      ],
    );
    assert.deepEqual(
      s.drawing.estimates.map((e) => [e.kind, e.index, e.taken]),
      [['type', 1, 'FAVOURS']],
    );
    // the dashed guess is still drawn dashed, and marked as a guess in words
    assert.match(drawingSource(s.drawing, 'LR'), /label="⚠ favours \(estimated\)"/);
    assert.equal((drawingSource(s.drawing, 'LR').match(/\(estimated\)/g) ?? []).length, 1);
  });

  // proves: view_export_stays_view
  test('a guess at a name is kept when both its ends are in the view', () => {
    const whole = { name: 'all', spec: { kind: 'kinds', kinds: ['Reason', 'Option'] } };
    const s = exportScope(reader, { graph: 'reader', view: whole });
    assert.deepEqual(s.drawing.estimates.map((e) => [e.kind, e.to]).sort(), [
      ['name', 'large_reader'],
      ['type', 'small_reader'],
    ]);
  });

  // proves: view_export_stays_view
  test('with the faded context asked for, it holds the whole graph, and says which things and links to fade', () => {
    const s = exportScope(team, { graph: 'team', view: near, context: true });
    assert.equal(s.context, true);
    assert.equal(s.drawing, team.graphs.get('team'));
    assert.deepEqual(s.faded, { things: ['dan', 'zoe'], links: [2] });
  });

  // proves: view_export_stays_view
  test('a guess at a name outside the view is faded with the context, numbered after the links', () => {
    const view = { name: 'options', spec: { kind: 'picked', ids: ['small_reader', 'large_reader'] } };
    const s = exportScope(reader, { graph: 'reader', view, context: true });
    const d = reader.graphs.get('reader');
    assert.equal(
      d.estimates.some((e) => e.kind === 'name'),
      true,
    );
    // every link is outside the picked pair, and so is the guess drawn after them
    assert.deepEqual(s.faded.links, [...d.links.keys(), d.links.length]);
  });
});

describe('nothing to export', () => {
  // proves: empty_export
  test('a graph that is not in the note, or has nothing in it, is empty and says so', () => {
    for (const [r, graph] of [
      [readNote([]), 'team'],
      [team, 'elsewhere'],
      [readNote(['// graph: void · SOURCE\n']), 'void'],
    ]) {
      const s = exportScope(r, { graph });
      assert.equal(s.empty, true, graph);
      assert.equal(s.drawing.boxes.length, 0);
      assert.match(s.why, new RegExp(`^Graph ${graph} has no things in this note`));
    }
  });

  // proves: empty_export
  test('a view that matches nothing is empty, with the reason the view gives and the view named', () => {
    const s = exportScope(team, { graph: 'team', view: { name: 'robots', spec: { kind: 'kinds', kinds: ['Robot'] } } });
    assert.equal(s.empty, true);
    assert.equal(s.kind, 'view');
    assert.deepEqual(s.drawing.boxes, []);
    assert.equal(s.why, 'View robots matches nothing: No thing is a Robot: pick other kinds, or change the view');
    assert.deepEqual(s.faded, { things: [], links: [] });
  });

  // proves: empty_export
  test('a view with the context asked for is still empty when the view matches nothing', () => {
    const view = { name: 'robots', spec: { kind: 'kinds', kinds: ['Robot'] } };
    assert.equal(exportScope(team, { graph: 'team', view, context: true }).empty, true);
  });
});
