// A timeline's order and what it shows (editor spec §15). A timeline draws every graph with things in it, dated or not.
// It is ordered by date, by a number such as a step, as written, or by links. Things without the value it is ordered by
// stand together after the rest. It shows every thing, only the dated ones, or only the undated ones. The choice is
// read from the style graph's Diagram, and written there by styleEdit. Spans types.ts, style-source.ts (the drawing
// without the things hidden), style-choice-checks.ts and style-edit.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { styledDrawing } from '../src/style-source.ts';
import { diagramFor, shapeOf, suggestType, typeFits } from '../src/types.ts';

const ORG = `// graph: org
(ada:Person {name: 'Ada'}),
(bea:Person {name: 'Bea'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy),
(bea)-[:MANAGES]->(dee)`;

const TRIP = `// graph: trip
(leave:Event {name: 'Leave home', on: DATE '2026-09-01', step: 2}),
(rest:Event {name: 'Rest', on: DATE '2026-09-03', step: 1, booked: DATE '2026-01-05'}),
(note:Event {name: 'A note', step: 1}),
(arrive:Event {name: 'Arrive', on: DATE '2026-09-03', cost: 9, booked: DATE '2026-01-02'}),
(back:Event {name: 'Back', on: DATE '2026-09-10', step: 3}),
(leave)-[:THEN]->(arrive),
(arrive)-[:THEN]->(rest),
(rest)-[:THEN]->(back),
(note)-[:ABOUT]->(rest)`;

const LOOP = `// graph: loop
(plan:Step {name: 'Plan'}),
(make:Step {name: 'Make'}),
(check:Step {name: 'Check'}),
(plan)-[:NEXT]->(make),
(make)-[:NEXT]->(check),
(check)-[:NEXT]->(plan)`;

const LONE = `// graph: lone
(c:Thing {name: 'C'}),
(a:Thing {name: 'A'}),
(b:Thing {name: 'B'})`;

/** Graph `graph` of a note of `data`, its style a style block of the given lines, as a host reads it. */
function shown(data, ...lines) {
  const graph = /^\/\/ graph: (\w+)/.exec(data)[1];
  const texts = lines.length ? [data, [`// graph: ${graph}_style · STYLE ${graph}`, ...lines].join('\n')] : [data];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, graph, reading);
  return { plain: reading.graphs.get(graph), style, problems, g: reading.world[graph] };
}

/** The timeline plan `data` is drawn by, its Diagram written with `keys`. */
const planOf = (data, keys = '') => {
  const { plain, style, g, problems } = shown(data, `(d1:Diagram {type: 'timeline'${keys}})`);
  assert.deepEqual(problems, []);
  return styledDrawing(plain, style, g).diagram;
};

describe('a timeline draws every graph with things in it', () => {
  // proves: timeline_fits
  test('fits a graph with no dates at all, and one with some things undated', () => {
    for (const data of [ORG, LOOP, LONE, TRIP]) {
      const { plain, g } = shown(data);
      const timeline = typeFits(shapeOf(plain, g)).find((f) => f.type === 'timeline');
      assert.deepEqual(timeline, { type: 'timeline', fits: true }, data.split('\n')[0]);
    }
  });

  // proves: timeline_fits
  test('things without a date stand together after the dated ones, in the order written', () => {
    const plan = planOf(TRIP);
    assert.deepEqual(plan, {
      type: 'timeline',
      order: 'date',
      dates: [['leave'], ['rest', 'arrive'], ['back'], ['note']],
    });
  });

  // proves: timeline_fits, suggest_type
  test('is suggested only when every thing carries a date, as before', () => {
    const { plain, g } = shown(LOOP);
    const shape = shapeOf(plain, g);
    assert.equal(suggestType(typeFits(shape), shape).type, 'network');
  });
});

describe('a timeline’s order', () => {
  // proves: timeline_order
  test('with none chosen: by date when a thing carries one, else by links when there are any, else as written', () => {
    assert.equal(planOf(TRIP).order, 'date');
    assert.deepEqual(planOf(ORG), { type: 'timeline', order: 'links', dates: [['ada'], ['bea', 'cy'], ['dee']] });
    assert.deepEqual(planOf(LONE), { type: 'timeline', order: 'written', dates: [['c'], ['a'], ['b']] });
  });

  // proves: timeline_order
  test('by date: by the date property chosen, when one is', () => {
    assert.deepEqual(planOf(TRIP, ", order: 'date', by: 'booked'").dates, [
      ['arrive'],
      ['rest'],
      ['leave', 'note', 'back'],
    ]);
  });

  // proves: timeline_order
  test('by a number: the one most things carry, or the one chosen; equal numbers share a place', () => {
    // step is carried by four things, cost by one: step it is, the unnumbered last
    assert.deepEqual(planOf(TRIP, ", order: 'number'"), {
      type: 'timeline',
      order: 'number',
      dates: [['rest', 'note'], ['leave'], ['back'], ['arrive']],
    });
    assert.deepEqual(planOf(TRIP, ", order: 'number', by: 'cost'").dates, [
      ['arrive'],
      ['leave', 'rest', 'note', 'back'],
    ]);
  });

  // proves: timeline_order
  test('as written: each thing in a place of its own, in the order written', () => {
    assert.deepEqual(planOf(TRIP, ", order: 'written'").dates, [['leave'], ['rest'], ['note'], ['arrive'], ['back']]);
  });

  // proves: timeline_order
  test('by links: each thing after the things that link to it; a loop is broken where it is first written', () => {
    assert.deepEqual(planOf(TRIP, ", order: 'links'").dates, [['leave', 'note'], ['arrive'], ['rest'], ['back']]);
    assert.deepEqual(planOf(LOOP, ", order: 'links'").dates, [['plan'], ['make'], ['check']]);
  });

  // proves: timeline_order
  test('by a value no thing carries: as with none chosen', () => {
    assert.deepEqual(planOf(ORG, ", order: 'date'").order, 'links');
    assert.deepEqual(planOf(LONE, ", order: 'number'").order, 'written');
  });

  // proves: timeline_order
  test('laid out as before: each place a rank across, the links never moving a thing', () => {
    const { plain, style, g } = shown(ORG, "(d1:Diagram {type: 'timeline'})");
    const [laid] = directions(styledDrawing(plain, style, g));
    assert.equal(laid.rankdir, 'LR');
    assert.ok(laid.dot.includes('  {rank=same; "bea"; "cy";}'), laid.dot);
    assert.ok(laid.dot.includes('  "bea" -> "dee" [style=invis];'), laid.dot);
  });
});

describe('what a timeline shows', () => {
  // proves: timeline_show
  test('only the dated things: the others and their links are left out of the drawing', () => {
    const { plain, style, g } = shown(TRIP, "(d1:Diagram {type: 'timeline', show: 'dated'})");
    const drawing = styledDrawing(plain, style, g);
    assert.deepEqual(drawing.diagram, {
      type: 'timeline',
      order: 'date',
      dates: [['leave'], ['rest', 'arrive'], ['back']],
      hidden: ['note'],
    });
    assert.deepEqual(
      drawing.boxes.map((b) => b.key),
      ['leave', 'rest', 'arrive', 'back'],
    );
    assert.deepEqual(
      drawing.links.map((l) => [l.from, l.to, l.edge]),
      [
        ['leave', 'arrive', 0],
        ['arrive', 'rest', 1],
        ['rest', 'back', 2],
      ],
    );
    assert.ok(!directions(drawing)[0].dot.includes('"note"'));
  });

  // proves: timeline_show
  test('only the undated things: ordered as with none chosen, as dates cannot order them', () => {
    const plan = planOf(TRIP, ", show: 'undated'");
    assert.deepEqual(plan, {
      type: 'timeline',
      order: 'written',
      dates: [['note']],
      hidden: ['leave', 'rest', 'arrive', 'back'],
    });
  });

  // proves: timeline_show, type_stops_fitting
  test('with nothing left to show: said, and drawn as a network', () => {
    const { plain, style, g } = shown(ORG, "(d1:Diagram {type: 'timeline', show: 'dated'})");
    assert.deepEqual(diagramFor(plain, style, g), {
      chosen: 'timeline',
      drawn: 'network',
      stopped: {
        type: 'timeline',
        why: 'a timeline of the things with a date needs one, and no thing carries a date',
        nearest: 'flow',
      },
    });
    const all = shown(
      TRIP.replace(/\(note[^\n]*\n/, '').replace(/,\n\(note\)[^\n]*/, ''),
      "(d1:Diagram {type: 'timeline', show: 'undated'})",
    );
    assert.equal(
      diagramFor(all.plain, all.style, all.g).stopped.why,
      'a timeline of the things without a date needs one, and every thing carries a date',
    );
  });
});

describe('a timeline’s choice in the style graph', () => {
  // proves: timeline_order, timeline_show
  test('is checked: known words only, and only for a timeline', () => {
    const { problems } = shown(
      ORG,
      "(d1:Diagram {type: 'timeline', order: 'size', show: 'some'}),",
      "(d2:Diagram {type: 'flow', view: 'v', order: 'links'}),",
      "(d3:Diagram {type: 'timeline', view: 'w', order: 'links', by: 'step'})",
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'order must be date, number, written or links', 'change size to one of date, number, written or links'],
        [2, 'show must be all, dated or undated', 'change some to one of all, dated or undated'],
        [3, 'an order and what is shown are chosen only for a timeline', "remove them, or make it type: 'timeline'"],
        [4, 'by is chosen only for an order by date or number', "remove by, or make it order: 'date' or 'number'"],
      ],
    );
  });

  // proves: timeline_order, timeline_show
  test('is written into the style block, changed in place, never into the data', () => {
    const note = `\`\`\`gql\n${LONE}\n\`\`\`\n`;
    const first = styleEdit(note, 'lone', {
      diagram: { type: 'timeline', order: 'number', by: 'step', show: 'dated' },
    });
    assert.match(first.note, /\(diagram_1:Diagram \{type: 'timeline', order: 'number', by: 'step', show: 'dated'\}\)/);
    const again = styleEdit(first.note, 'lone', { diagram: { type: 'timeline', order: 'links' } });
    assert.match(again.note, /\(diagram_1:Diagram \{type: 'timeline', order: 'links'\}\)/);
    assert.equal(gqlBlocks(again.note)[0].text, LONE, 'the data untouched');
    assert.deepEqual(styleEdit(note, 'lone', { diagram: { type: 'flow', order: 'links' } }), {
      refused: 'an order and what is shown are chosen only for a timeline',
    });
    assert.deepEqual(styleEdit(note, 'lone', { diagram: { type: 'timeline', order: 'size' } }), {
      refused: 'order must be date, number, written or links',
    });
    assert.deepEqual(styleEdit(note, 'lone', { diagram: { type: 'timeline', order: 'written', by: 'step' } }), {
      refused: 'by is chosen only for an order by date or number',
    });
  });
});
