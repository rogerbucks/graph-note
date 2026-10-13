// Diagram types (editor spec §15): the editor offers network, tree, flow, radial, lanes, timeline and table; each only
// when the data fits it, saying why when it does not; it suggests the type that fits best and never switches without
// being asked; when an edit makes the data stop fitting the chosen type it says so, offers the nearest type that fits
// and draws the graph as a network meanwhile, never wrongly; and a graph of more than 50 things is offered the table or
// a view as the way in. Spans types.ts (what fits, the suggestion, the choice), types-table.ts (the table and the way
// in), graph-layout.js (each type's source) and render.ts (the directions laid out).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { layoutSource } from '../src/layout.ts';
import { directions, draw } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import {
  DIAGRAM_TYPES,
  LARGE_GRAPH,
  diagramFor,
  diagramOffer,
  nearestType,
  shapeOf,
  suggestType,
  typeFits,
} from '../src/types.ts';
import { scrollsOneWay, tableOf, wayIn } from '../src/types-table.ts';

const ORG = `// graph: org
(ada:Person {name: 'Ada'}),
(bea:Person {name: 'Bea'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy),
(bea)-[:MANAGES]->(dee)`;

const TRIP = `// graph: trip
(leave:Event {name: 'Leave home', on: DATE '2026-09-01'}),
(rest:Event {name: 'Rest', on: DATE '2026-09-03'}),
(arrive:Event {name: 'Arrive', on: DATE '2026-09-03'}),
(back:Event {name: 'Back', on: DATE '2026-09-10'}),
(leave)-[:THEN]->(arrive),
(arrive)-[:THEN]->(rest),
(rest)-[:THEN]->(back)`;

const LOOP = `// graph: loop
(plan:Step {name: 'Plan'}),
(make:Step {name: 'Make'}),
(check:Step {name: 'Check'}),
(plan)-[:NEXT]->(make),
(make)-[:NEXT]->(check),
(check)-[:NEXT]->(plan)`;

const TEAMS = `// graph: teams
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(ops:Team {name: 'Ops'}),
(ann)-[:IN]->(ops),
(bob)-[:IN]->(ops),
(ann)-[:ASKS]->(bob)`;

const LONE = `// graph: lone
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(c:Thing {name: 'C'}),
(a)-[:SEES]->(b)`;

/** Graph `graph` of a note of `data`, its style a style block of the given lines, as a host reads it. */
function shown(data, ...lines) {
  const graph = /^\/\/ graph: (\w+)/.exec(data)[1];
  const texts = lines.length ? [data, [`// graph: ${graph}_style · STYLE ${graph}`, ...lines].join('\n')] : [data];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, graph, reading);
  const plain = reading.graphs.get(graph);
  return { plain, style, problems, g: reading.world[graph], reading };
}
const fitsOf = (data, relationship) => {
  const { plain, g } = shown(data);
  return Object.fromEntries(typeFits(shapeOf(plain, g), relationship).map((f) => [f.type, f]));
};
const fitting = (data) =>
  Object.values(fitsOf(data))
    .filter((f) => f.fits)
    .map((f) => f.type);

describe('the diagram types', () => {
  // proves: diagram_type_set
  test('are network, tree, flow, radial, lanes, timeline and table, and each is judged for every graph', () => {
    assert.deepEqual(DIAGRAM_TYPES, ['network', 'tree', 'flow', 'radial', 'lanes', 'timeline', 'table']);
    for (const data of [ORG, TRIP, LOOP, TEAMS, LONE])
      assert.deepEqual(Object.keys(fitsOf(data)), [...DIAGRAM_TYPES], data.split('\n')[0]);
  });

  // proves: diagram_type_set, type_only_when_fits
  test('a network and a table fit any graph with things in it', () => {
    for (const data of [ORG, TRIP, LOOP, TEAMS, LONE]) {
      const f = fitsOf(data);
      assert.equal(f.network.fits, true);
      assert.equal(f.table.fits, true);
    }
  });

  // proves: diagram_type_set
  test('each type that fits is drawn by Graphviz in its own way, but the table, which the host draws', async () => {
    const engine = await loadEngine();
    for (const [data, type] of [
      [ORG, 'tree'],
      [ORG, 'flow'],
      [ORG, 'radial'],
      [TEAMS, 'lanes'],
      [TRIP, 'timeline'],
    ]) {
      const { plain, style, g } = shown(data, `(d1:Diagram {type: '${type}'})`);
      const drawing = styledDrawing(plain, style, g);
      assert.equal(drawing.diagram?.type, type, type);
      const svg = draw(drawing, engine).svg;
      assert.equal(svg.split('class="node"').length - 1, plain.boxes.length, `${type}: every box drawn`);
      assert.equal(directions(drawing).length, 1, `${type}: laid out in its own direction only`);
    }
    const { plain, style, g } = shown(ORG, "(d1:Diagram {type: 'table'})");
    assert.equal(styledDrawing(plain, style, g).diagram, undefined, 'a table is not laid out by Graphviz');
  });
});

describe('a type is offered only when the data fits it, and says why when it does not', () => {
  // proves: type_only_when_fits
  test('each type that does not fit says why, in words naming the things at fault', () => {
    const loop = fitsOf(LOOP);
    assert.equal(loop.flow.why, 'a flow runs one way, and this loops back: Plan → Make → Check → Plan');
    assert.equal(loop.lanes.why, 'lanes need things of two kinds or more');
    assert.equal(loop.timeline.why, 'a timeline needs every thing to carry a date, and Plan carries none');
    const lone = fitsOf(LONE);
    assert.equal(lone.radial.why, 'a radial drawing needs every thing joined to the centre, A, and C is not');
    for (const f of [...Object.values(loop), ...Object.values(lone)])
      assert.equal(f.fits, f.why === undefined, `${f.type}: a why exactly when it does not fit`);
  });

  // proves: type_only_when_fits
  test('a thing of two kinds, or of none, cannot sit in one lane', () => {
    const two = `// graph: two
(a:Person:Author {name: 'Ada'}),
(b:Book {name: 'Notes'}),
(a)-[:WROTE]->(b)`;
    assert.equal(fitsOf(two).lanes.why, 'Ada is of two kinds, Author and Person, so it cannot sit in one lane');
    const none = `// graph: none
(a:Person {name: 'Ada'}),
(b {name: 'Notes'}),
(a)-[:WROTE]->(b)`;
    assert.equal(fitsOf(none).lanes.why, 'Notes has no kind, so it has no lane');
    assert.equal(fitsOf(TEAMS).lanes.fits, true);
  });

  // proves: type_only_when_fits
  test('a radial drawing needs three things or more, and a flow and a tree need links', () => {
    const pair = `// graph: pair
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'})`;
    const f = fitsOf(pair);
    assert.equal(f.radial.why, 'a radial drawing needs three things or more');
    assert.equal(f.flow.why, 'a flow needs links, and there are none');
    assert.equal(f.tree.why, 'a tree needs links, and there are none');
  });

  // proves: type_only_when_fits
  test('with nothing to draw, only the network is offered, and every other type says so', () => {
    const fits = typeFits({ things: [], links: [] });
    assert.deepEqual(
      fits.filter((f) => f.fits).map((f) => f.type),
      ['network'],
    );
    for (const f of fits.filter((x) => !x.fits)) assert.equal(f.why, 'there is nothing here to draw');
  });
});

describe('a tree', () => {
  // proves: tree_fits
  test('fits when every thing has at most one parent along a relationship, and nothing loops back', () => {
    const f = fitsOf(ORG);
    assert.equal(f.tree.fits, true);
    assert.equal(f.tree.relationship, 'MANAGES');
    assert.equal(fitsOf(ORG, 'MANAGES').tree.fits, true);
  });

  // proves: tree_fits
  test('does not fit when a thing has a second parent along the chosen relationship, and says which', () => {
    const twice = `${ORG},\n(cy)-[:MANAGES]->(dee)`;
    assert.equal(fitsOf(twice, 'MANAGES').tree.why, 'along MANAGES, Dee has two parents, Bea and Cy');
    const thrice = `${twice},\n(ada)-[:MANAGES]->(dee)`;
    assert.equal(fitsOf(thrice, 'MANAGES').tree.why, 'along MANAGES, Dee has 3 parents, Bea, Cy and Ada');
  });

  // proves: tree_fits
  test('does not fit when the relationship loops back, a thing to itself included', () => {
    assert.equal(fitsOf(LOOP, 'NEXT').tree.why, 'along NEXT, it loops back: Plan → Make → Check → Plan');
    const self = `// graph: self
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'}),
(a)-[:HOLDS]->(b),
(a)-[:HOLDS]->(a)`;
    assert.equal(fitsOf(self, 'HOLDS').tree.why, 'along HOLDS, it loops back: A → A');
  });

  // proves: tree_fits
  test('is judged along the chosen relationship only: another relationship may have second parents', () => {
    const mixed = `${ORG},\n(dee)-[:ADVISES]->(cy),\n(bea)-[:ADVISES]->(cy)`;
    assert.equal(fitsOf(mixed, 'MANAGES').tree.fits, true);
    assert.equal(fitsOf(mixed, 'ADVISES').tree.why, 'along ADVISES, Cy has two parents, Dee and Bea');
    // with none chosen, the relationship with the most links that makes a tree
    assert.equal(fitsOf(mixed).tree.relationship, 'MANAGES');
    assert.equal(fitsOf(ORG, 'KNOWS').tree.why, 'along KNOWS, there is no KNOWS link here');
  });

  // proves: tree_fits
  test('with none chosen and no relationship making a tree, says why of the one with the most links', () => {
    assert.equal(
      fitsOf(LOOP).tree.why,
      'no relationship makes a tree: along NEXT, it loops back: Plan → Make → Check → Plan',
    );
  });

  // proves: tree_fits
  test('drawn, it runs top to bottom, its links laid out forward, the other links never moving a thing', () => {
    const data = `${ORG},\n(dee)-[:ADVISES]->(ada)`;
    const { plain, style, g } = shown(data, "(d1:Diagram {type: 'tree', relationship: 'MANAGES'})");
    const drawing = styledDrawing(plain, style, g);
    assert.deepEqual(drawing.diagram, { type: 'tree', tree: [0, 1, 2] });
    const laid = directions(drawing);
    assert.deepEqual(
      laid.map((d) => d.rankdir),
      ['TB'],
    );
    const links = laid[0].dot.split('\n').filter((l) => / -> /.test(l));
    assert.deepEqual(
      links.map((l) => /constraint=false/.test(l)),
      [false, false, false, true],
    );
    assert.ok(!laid[0].dot.includes('rank=same'), 'no column of a kind across the levels');
    assert.ok(!laid[0].dot.includes('dir=back'), 'every link laid out forward');
  });
});

describe('a timeline', () => {
  // proves: timeline_fits
  test('fits when every thing carries a date, and not when one carries none', () => {
    assert.equal(fitsOf(TRIP).timeline.fits, true);
    const undated = `${TRIP},\n(note:Event {name: 'A note'})`;
    assert.equal(fitsOf(undated).timeline.why, 'a timeline needs every thing to carry a date, and A note carries none');
  });

  // proves: timeline_fits
  test('drawn, things stand in date order across, those of one day together, the links never moving them', () => {
    const { plain, style, g } = shown(TRIP, "(d1:Diagram {type: 'timeline'})");
    const drawing = styledDrawing(plain, style, g);
    assert.deepEqual(drawing.diagram, { type: 'timeline', dates: [['leave'], ['rest', 'arrive'], ['back']] });
    const [laid] = directions(drawing);
    assert.equal(laid.rankdir, 'LR');
    assert.ok(laid.dot.includes('  {rank=same; "rest"; "arrive";}'), laid.dot);
    assert.ok(laid.dot.includes('  "leave" -> "rest" [style=invis];'), laid.dot);
    assert.ok(laid.dot.includes('  "rest" -> "back" [style=invis];'), laid.dot);
    const links = laid.dot.split('\n').filter((l) => /\[label=/.test(l) && / -> /.test(l));
    assert.equal(links.length, 3);
    assert.ok(links.every((l) => l.includes('constraint=false')));
  });

  // proves: timeline_fits
  test('a date and an instant are both dates, ordered by when they are', () => {
    const mixed = `// graph: day
(a:Event {name: 'Late', at: DATETIME '2026-09-01T18:00:00Z'}),
(b:Event {name: 'Early', on: DATE '2026-09-01'}),
(c:Event {name: 'Next', on: DATE '2026-09-02', noted: DATE '2020-01-01'})`;
    const { plain, style, g } = shown(mixed, "(d1:Diagram {type: 'timeline'})");
    assert.deepEqual(styledDrawing(plain, style, g).diagram.dates, [['b'], ['a'], ['c']]);
  });
});

describe('what a host offers', () => {
  // proves: type_only_when_fits, suggest_type, type_stops_fitting
  test('every type with whether it fits, judged along the chosen tree’s relationship; the suggestion; the type drawn', () => {
    const mixed = `${ORG},\n(dee)-[:ADVISES]->(cy),\n(bea)-[:ADVISES]->(cy)`;
    const { plain, style, g } = shown(mixed, "(d1:Diagram {type: 'tree', relationship: 'ADVISES'})");
    const offer = diagramOffer(plain, style, g);
    assert.equal(offer.fits.find((f) => f.type === 'tree').why, 'along ADVISES, Cy has two parents, Dee and Bea');
    // the suggestion is the data's best fit, whatever was chosen
    assert.deepEqual(offer.suggested, { type: 'tree', because: 'each thing has at most one parent along MANAGES' });
    assert.deepEqual(offer.choice, diagramFor(plain, style, g));
    assert.equal(offer.choice.stopped.nearest, 'flow');
    const none = shown(ORG);
    assert.deepEqual(diagramOffer(none.plain, none.style, none.g).suggested.type, 'tree');
  });
});

describe('the suggested type', () => {
  // proves: suggest_type
  test('is the one that best fits the data, with why in words', () => {
    const suggest = (data) => {
      const { plain, g } = shown(data);
      const shape = shapeOf(plain, g);
      return suggestType(typeFits(shape), shape);
    };
    assert.deepEqual(suggest(TRIP), { type: 'timeline', because: 'every thing carries a date' });
    assert.deepEqual(suggest(ORG), { type: 'tree', because: 'each thing has at most one parent along MANAGES' });
    assert.deepEqual(suggest(TEAMS), { type: 'lanes', because: 'its things are of 2 kinds' });
    const hub = `// graph: hub
(sun:Star {name: 'Sun'}),
(earth:Star {name: 'Earth'}),
(mars:Star {name: 'Mars'}),
(venus:Star {name: 'Venus'}),
(earth)-[:CIRCLES]->(sun),
(mars)-[:CIRCLES]->(sun),
(venus)-[:CIRCLES]->(sun)`;
    assert.deepEqual(suggest(hub), { type: 'radial', because: 'every thing links to Sun' });
    const chain = `// graph: chain
(a:Step {name: 'A'}),
(b:Step {name: 'B'}),
(c:Step {name: 'C'}),
(a)-[:NEXT]->(b),
(b)-[:NEXT]->(c),
(a)-[:NEXT]->(c)`;
    assert.deepEqual(suggest(chain), { type: 'flow', because: 'the links run one way' });
    assert.deepEqual(suggest(LOOP), { type: 'network', because: 'a network fits any graph' });
  });

  // proves: suggest_type
  test('is never drawn unless chosen: with no type in the style graph, the drawing is the network, byte for byte', () => {
    for (const data of [ORG, TRIP, TEAMS]) {
      const { plain, style, g } = shown(data);
      const drawing = styledDrawing(plain, style, g);
      assert.equal(drawing.diagram, undefined);
      assert.deepEqual(diagramFor(plain, style, g), { drawn: 'network' });
      for (const d of directions(drawing)) assert.equal(d.dot, layoutSource(plain, d.rankdir).source);
    }
  });
});

describe('when an edit makes the data stop fitting the chosen type', () => {
  // proves: type_stops_fitting
  test('a second parent in a tree: it says so, offers the nearest type that fits, and draws a network', () => {
    const twice = `${ORG},\n(cy)-[:MANAGES]->(dee)`;
    const { plain, style, g } = shown(twice, "(d1:Diagram {type: 'tree', relationship: 'MANAGES'})");
    assert.deepEqual(diagramFor(plain, style, g), {
      chosen: 'tree',
      drawn: 'network',
      stopped: { type: 'tree', why: 'along MANAGES, Dee has two parents, Bea and Cy', nearest: 'flow' },
    });
    const drawing = styledDrawing(plain, style, g);
    assert.equal(drawing.diagram, undefined, 'never drawn as a tree');
    for (const d of directions(drawing)) assert.equal(d.dot, layoutSource(plain, d.rankdir).source);
  });

  // proves: type_stops_fitting
  test('the nearest is the first of the type’s neighbours that fits, and at worst the network', () => {
    const fits = (types) => DIAGRAM_TYPES.map((type) => ({ type, fits: types.includes(type) }));
    assert.equal(nearestType('tree', fits(['network', 'flow', 'radial'])), 'flow');
    assert.equal(nearestType('tree', fits(['network', 'radial'])), 'radial');
    assert.equal(nearestType('timeline', fits(['network', 'table'])), 'table');
    assert.equal(nearestType('lanes', fits(['network'])), 'network');
  });

  // proves: type_stops_fitting
  test('a thing without a date on a timeline: said, and drawn as a network until another type is chosen', () => {
    const { plain, style, g } = shown(`${TRIP},\n(note:Event {name: 'A note'})`, "(d1:Diagram {type: 'timeline'})");
    const choice = diagramFor(plain, style, g);
    assert.deepEqual(choice.stopped, {
      type: 'timeline',
      why: 'a timeline needs every thing to carry a date, and A note carries none',
      nearest: 'flow',
    });
    assert.equal(choice.drawn, 'network');
  });

  // proves: type_stops_fitting, type_remembered
  test('the type chosen for a view is judged on what the view draws, and wins there over the whole graph’s', () => {
    const { plain, style, g } = shown(
      ORG,
      "(d1:Diagram {type: 'flow'}),",
      "(d2:Diagram {type: 'radial', view: 'team'})",
    );
    assert.equal(diagramFor(plain, style, g).drawn, 'flow');
    assert.equal(diagramFor(plain, style, g, 'team').drawn, 'radial');
    const two = { ...plain, boxes: plain.boxes.slice(0, 2), links: plain.links.slice(0, 1) };
    assert.equal(diagramFor(two, style, g, 'team').stopped?.why, 'a radial drawing needs three things or more');
  });
});

describe('a table', () => {
  // proves: diagram_type_set
  test('lists each thing with its kind and properties, and each link, in the order drawn', () => {
    const { plain, g } = shown(`${TRIP},\n(leave)-[:THEN {by: 'train'}]->(back)`);
    const t = tableOf(plain, g);
    assert.deepEqual(t.columns, ['Thing', 'Kind', 'on']);
    assert.deepEqual(t.rows[0], { key: 'leave', cells: ['Leave home', 'Event', '2026-09-01'] });
    assert.equal(t.rows.length, 4);
    assert.deepEqual(t.links.at(-1), { index: 3, cells: ['Leave home', 'then', 'Back'], properties: 'by: train' });
  });
});

describe('a large graph', () => {
  // proves: large_way_in
  test('of more than 50 things is offered the table or a view as the way in, and the table is suggested', () => {
    const things = (n) =>
      `// graph: big\n${Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`).join(',\n')}`;
    assert.equal(LARGE_GRAPH, 50);
    assert.equal(wayIn(50), null);
    assert.deepEqual(wayIn(51), {
      count: 51,
      say: 'This graph has 51 things, too many to read in one drawing: open it as a table, or make a view of the part you need.',
    });
    const { plain, g } = shown(things(51));
    const shape = shapeOf(plain, g);
    assert.deepEqual(suggestType(typeFits(shape), shape), {
      type: 'table',
      because: 'a graph of 51 things reads best as a table first',
    });
    const small = shown(things(50));
    assert.notEqual(suggestType(typeFits(shapeOf(small.plain, small.g)), shapeOf(small.plain, small.g)).type, 'table');
  });
});

describe('a wide tree, flow or timeline on a phone', () => {
  // proves: wide_types_phone
  test('scrolls one way only when it is wider than its card; on a desktop, or of another type, it is fitted as ever', () => {
    for (const type of ['tree', 'flow', 'timeline']) {
      assert.equal(scrollsOneWay(type, true, 1200, 375), true, type);
      assert.equal(scrollsOneWay(type, true, 300, 375), false, `${type} that fits its card`);
      assert.equal(scrollsOneWay(type, false, 1200, 375), false, `${type} on a desktop`);
    }
    for (const type of ['network', 'radial', 'lanes', 'table'])
      assert.equal(scrollsOneWay(type, true, 1200, 375), false);
  });
});

describe('only the types that fit are offered', () => {
  // proves: type_only_when_fits
  test('as the graphs above show', () => {
    assert.deepEqual(fitting(ORG), ['network', 'tree', 'flow', 'radial', 'table']);
    assert.deepEqual(fitting(TRIP), ['network', 'tree', 'flow', 'radial', 'timeline', 'table']);
    assert.deepEqual(fitting(LOOP), ['network', 'radial', 'table']);
    assert.deepEqual(fitting(TEAMS), ['network', 'tree', 'flow', 'radial', 'lanes', 'table']);
  });
});
