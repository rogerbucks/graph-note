// Edge cases (editor spec §9 and §7): empty, broken and oversized inputs each give a stated result, never a blank or a
// crash. One section for each kind of input: paths, the empty view, the empty export, and diagram types (§15).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { exportPlan } from '../src/export-plan.ts';
import { exportScope } from '../src/export-scope.ts';
import { exportSvg } from '../src/export.ts';
import { writeSafely } from '../src/export-write.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { PathPlayer, pathBlock, pathProblems, pathsOf } from '../src/paths.ts';
import { evaluate } from '../src/view-evaluate.ts';
import { DIAGRAM_TYPES, shapeOf, suggestType, typeFits } from '../src/types.ts';
import { wayIn } from '../src/types-table.ts';

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

describe('exports: nothing to export', () => {
  const GROUP = `// graph: group · SOURCE
(ann:Person {name: 'Ann'}),
(ben:Person {name: 'Ben'}),
(solo:Person {name: 'Solo'}),
(ann)-[:KNOWS]->(ben)`;
  const reading = readNote([GROUP]);
  // a note with no classification, so nothing here is asked about
  const unclassified = { noteClassification: null };
  const plan = (scope) =>
    exportPlan({
      scope,
      format: 'svg',
      note: 'Group.md',
      date: '2026-10-11',
      settings: DEFAULT_SETTINGS,
      ...unclassified,
    });
  const emptyViews = [
    { name: 'robots', spec: { kind: 'kinds', kinds: ['Robot'] } },
    { name: 'nobody', spec: { kind: 'picked', ids: [] } },
    { name: 'gone', spec: { kind: 'near', id: 'zed', depth: 2 } },
    { name: 'alone', spec: { kind: 'near', id: 'solo', depth: 1 } },
    { name: 'apart', spec: { kind: 'reaches', from: 'ann', to: 'solo', steps: 3, directed: true } },
    { name: 'tour', spec: { kind: 'path', path: 'tour' } },
  ];

  // proves: empty_export
  test('a note with nothing in it, a graph that is not there, and a block that cannot be read each say so', () => {
    for (const [r, graph] of [
      [readNote([]), 'group'],
      [readNote(['']), 'group'],
      [reading, 'elsewhere'],
      [readNote(['// graph: void · SOURCE\n']), 'void'],
      [readNote(['// graph: broken · SOURCE\n(((']), 'broken'],
    ]) {
      const d = plan(exportScope(r, { graph }));
      assert.deepEqual(Object.keys(d), ['nothing'], graph);
      assert.match(d.nothing, new RegExp(`^There is nothing to export: graph ${graph} has no things in this note`));
    }
  });

  // proves: empty_export
  test('a view that matches nothing says so, with the reason the view gives, whether or not the context is asked for', () => {
    for (const view of emptyViews)
      for (const context of [false, true]) {
        const d = plan(exportScope(reading, { graph: 'group', view, context }));
        assert.deepEqual(Object.keys(d), ['nothing'], `${view.name} ${context}`);
        assert.ok(d.nothing.startsWith(`There is nothing to export: view ${view.name} matches nothing`), d.nothing);
        assert.match(d.nothing, /change the view/);
      }
  });

  // proves: empty_export
  test('whatever the scope, either there is something to export or nothing is said, never both or neither', () => {
    const ids = ['ann', 'ben', 'solo', 'zed'];
    const views = [
      ...ids.map((id) => ({ name: `near_${id}`, spec: { kind: 'near', id, depth: 1 } })),
      ...ids.map((id) => ({ name: `pick_${id}`, spec: { kind: 'picked', ids: [id] } })),
      ...emptyViews,
    ];
    for (const view of [undefined, ...views])
      for (const graph of ['group', 'elsewhere']) {
        const scope = exportScope(reading, { graph, ...(view ? { view } : {}) });
        const d = plan(scope);
        assert.equal('nothing' in d, scope.empty, `${graph} ${view?.name}`);
        assert.equal('go' in d, !scope.empty, `${graph} ${view?.name}`);
        assert.equal(scope.drawing.boxes.length === 0, scope.empty);
      }
  });

  // proves: empty_export
  test('no image is drawn and no file is touched for an empty export', async () => {
    const scope = exportScope(reading, { graph: 'group', view: emptyViews[0] });
    const engine = {
      version: '0',
      render() {
        throw new Error('the engine must not be asked');
      },
    };
    assert.throws(
      () => exportSvg(scope, engine, { note: 'Group.md', date: '2026-10-11', theme: 'light' }),
      /nothing to export/,
    );
    const touched = [];
    const ops = {
      write: async (p) => touched.push(p),
      rename: async (p) => touched.push(p),
      remove: async (p) => touched.push(p),
    };
    const r = await writeSafely('Group.svg', '', ops);
    assert.equal(r.ok, false);
    assert.deepEqual(touched, []);
  });
});

describe('diagram types: empty and oversized', () => {
  const things = (n) =>
    `// graph: big\n${Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`).join(',\n')}`;

  // proves: large_way_in
  test('a graph of more than 1,000 things says so and offers the table or a view; one of 1,000 is drawn as it is', () => {
    for (const n of [1001, 1900]) {
      const plain = readNote([things(n)]).graphs.get('big');
      const way = wayIn(plain.boxes.length);
      assert.equal(way.count, n);
      assert.match(way.say, /open it as a table, or make a view/);
      const shape = shapeOf(plain);
      assert.equal(suggestType(typeFits(shape), shape).type, 'table');
    }
    for (const n of [50, 400, 1000]) assert.equal(wayIn(readNote([things(n)]).graphs.get('big').boxes.length), null);
  });

  // proves: type_only_when_fits
  test('a graph with nothing in it is offered the network alone, each other type saying why, and no way in', () => {
    const fits = typeFits({ things: [], links: [] });
    assert.deepEqual(
      fits.map((f) => [f.type, f.fits]),
      DIAGRAM_TYPES.map((t) => [t, t === 'network']),
    );
    assert.equal(wayIn(0), null);
    assert.deepEqual(suggestType(fits, { things: [], links: [] }), {
      type: 'network',
      because: 'a network fits any graph',
    });
  });
});
