// Links that show flow by moving (editor spec §7, §11): dashes running along a link's arrow, or a dot travelling along it,
// set only in the style graph and off by default (flow_in_style_graph), never the only signal — a moving link carries an
// icon on its label and says what its movement means in its legend and to a screen reader (motion_not_alone) — and
// still whenever the system asks for reduced motion (motion_reduced_respected). Spans link-flow.ts (the choice, its
// words and the source), style-checks.ts and style-conflicts.ts (the words checked), style-source.ts and render.ts (the
// source drawn) and export-motion.ts (the movement written into an exported SVG).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { exportSvg } from '../src/export.ts';
import { exportScope } from '../src/export-scope.ts';
import { layoutSource } from '../src/layout.ts';
import { FLOW_ICONS, flowFor, flowLegend, flowLinks, flowSaid, flowSource, reversedLinks } from '../src/link-flow.ts';
import { directions, draw } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { unscoped } from './sheet-scope.js';

const engine = await loadEngine();

// two kinds only receive links, Source and Tag, so the one that is not the main destination is laid out on the far side
// with its link drawn backwards (dir=back): its movement must run backwards along the line drawn, so it reads forwards
const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(guide:Source {name: 'The guide'}),
(green:Tag {name: 'Green'}),
(home)-[:NEAR]->(park),
(cafe)-[:SERVES]->(park),
(home)-[:CITES]->(guide),
(cafe)-[:CITES]->(guide),
(park)-[:TAGGED]->(green)`;

/** The note's blocks: graph trip, and a style block of the given lines when there are any. */
const textsWith = (...lines) =>
  lines.length ? [TRIP, ['// graph: trip_style · STYLE trip', ...lines].join('\n')] : [TRIP];

/** The style of graph trip read from a style block of the given lines, and its problems. */
function styleOf(...lines) {
  const texts = textsWith(...lines);
  const reading = readNote(texts);
  return { reading, ...readStyle(texts, 'trip', reading) };
}

/** Graph trip drawn in `view` (none: the whole graph), styled by a style block of the given lines, read with no problem. */
function drawn(view, ...lines) {
  const { reading, style, problems } = styleOf(...lines);
  assert.deepEqual(problems, []);
  const plain = reading.graphs.get('trip');
  return { reading, plain, style, drawing: styledDrawing(plain, style, reading.world.trip, view) };
}

/** The lines of a source that draw a link, in the order the links are drawn. */
const linkLines = (dot) => dot.split('\n').filter((l) => /^ {2}"[^"]*" -> "[^"]*" \[label=/.test(l));
/** The source of each direction the drawing is laid out in. */
const sources = (drawing) => directions(drawing).map((d) => d.dot);
/** For each link of a source, how it moves: its flow class, or null when it is still. */
const moving = (dot) => linkLines(dot).map((l) => /class="graph-note-flow graph-note-flow-(\w+)/.exec(l)?.[1] ?? null);

const MEANS = "means: 'the visit goes this way'";

describe('links are still unless the style graph moves them', () => {
  // proves: flow_in_style_graph
  test('with no style graph, or one that says nothing of flow, no link moves and the source is the layout source', () => {
    for (const lines of [
      [],
      ["(n1:Nudge {word: 'direction', direction: 'LR'})"],
      ["(a1:Arrows {arrowheads: 'hide'})"],
    ]) {
      const { plain, drawing } = drawn(undefined, ...lines);
      assert.equal(drawing.flow, undefined, lines.join(' '));
      for (const dot of sources(drawing)) assert.deepEqual(moving(dot), [null, null, null, null, null]);
    }
    const { plain, drawing } = drawn(undefined);
    assert.equal(sources(drawing)[0], layoutSource(plain, 'LR').source);
  });

  // proves: flow_in_style_graph, links_show_flow
  test('a Flow for every link moves every link, as dashes running along it', () => {
    const { drawing } = drawn(undefined, `(f1:Flow {motion: 'dashes', ${MEANS}})`);
    assert.deepEqual(
      drawing.flow.map((f) => [f.index, f.motion, f.means]),
      [0, 1, 2, 3, 4].map((i) => [i, 'dashes', 'the visit goes this way']),
    );
    for (const dot of sources(drawing)) assert.deepEqual(moving(dot), Array(5).fill('dashes'));
  });

  // proves: flow_in_style_graph, links_show_flow
  test('a Flow for a relationship type moves only its links; a dot travels along them', () => {
    const { drawing } = drawn(undefined, `(f1:Flow {motion: 'dot', type: 'CITES', ${MEANS}})`);
    assert.deepEqual(
      drawing.flow.map((f) => [f.index, f.motion]),
      [
        [2, 'dot'],
        [3, 'dot'],
      ],
    );
    assert.deepEqual(moving(sources(drawing)[0]), [null, null, 'dot', 'dot', null]);
  });

  // proves: flow_in_style_graph
  test('a Flow for a view moves links only in that view, and a view may keep them still', () => {
    const lines = [
      `(f1:Flow {motion: 'dashes', ${MEANS}}),`,
      "(f2:Flow {motion: 'still', view: 'quiet'}),",
      "(f3:Flow {motion: 'dot', view: 'busy', type: 'NEAR', means: 'people walk this way'})",
    ];
    assert.equal(drawn(undefined, ...lines).drawing.flow.length, 5);
    assert.equal(drawn('quiet', ...lines).drawing.flow, undefined, 'still in view quiet');
    const busy = drawn('busy', ...lines).drawing.flow;
    assert.deepEqual(
      busy.map((f) => [f.index, f.motion, f.means]),
      [
        [0, 'dot', 'people walk this way'],
        [1, 'dashes', 'the visit goes this way'],
        [2, 'dashes', 'the visit goes this way'],
        [3, 'dashes', 'the visit goes this way'],
        [4, 'dashes', 'the visit goes this way'],
      ],
    );
  });

  // proves: flow_in_style_graph
  test('the most particular Flow wins: a view over the whole graph, a type over every link, the first of two alike', () => {
    const { style } = drawn(
      undefined,
      "(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'near'}),",
      "(f2:Flow {motion: 'dot', means: 'all'}),",
      "(f3:Flow {motion: 'still', view: 'v', type: 'NEAR'}),",
      "(f4:Flow {motion: 'dot', view: 'v', means: 'in v'})",
    );
    assert.deepEqual(flowFor(style, undefined, 'NEAR'), { motion: 'dashes', means: 'near' });
    assert.deepEqual(flowFor(style, undefined, 'CITES'), { motion: 'dot', means: 'all' });
    assert.equal(flowFor(style, 'v', 'NEAR'), null);
    assert.deepEqual(flowFor(style, 'v', 'CITES'), { motion: 'dot', means: 'in v' });
  });

  // proves: flow_in_style_graph
  test('a Flow written in the data is a thing of the data, never a movement; the data reads the same with a style', () => {
    const inData = readNote([`${TRIP},\n(f1:Flow {motion: 'dashes', ${MEANS}})`]);
    const { style } = readStyle([TRIP], 'trip', inData);
    assert.deepEqual(style.flows, []);
    assert.ok(
      inData.graphs.get('trip').boxes.some((b) => b.key === 'f1'),
      'drawn as a thing',
    );
    const plain = readNote([TRIP]),
      styled = readNote(textsWith(`(f1:Flow {motion: 'dashes', ${MEANS}})`));
    assert.deepEqual(styled.graphs.get('trip'), plain.graphs.get('trip'));
    assert.deepEqual(styled.whole, plain.whole);
  });
});

describe('the words of a Flow are checked, and what is at fault is left out', () => {
  // proves: flow_in_style_graph
  test('a Flow with no motion, a motion not allowed or a type not in the graph is a problem, with its fix', () => {
    const said = (...lines) => styleOf(...lines).problems.map((p) => [p.message, p.fix]);
    assert.deepEqual(said(`(f1:Flow {${MEANS}})`), [
      ['a Flow says how its links move', "add motion: 'dashes', 'dot' or 'still'"],
    ]);
    assert.deepEqual(said(`(f1:Flow {motion: 'dahses', ${MEANS}})`), [
      ['motion must be dashes, dot or still', 'change dahses to dashes'],
    ]);
    assert.deepEqual(said(`(f1:Flow {motion: 'dot', type: 'NEER', ${MEANS}})`), [
      ['NEER is not a relationship type in graph trip', 'change NEER to NEAR'],
    ]);
    assert.deepEqual(said(`(f1:Flow {motion: 'dot', speed: 'fast', ${MEANS}})`).length, 1);
    for (const lines of [
      [`(f1:Flow {${MEANS}})`],
      [`(f1:Flow {motion: 'dahses', ${MEANS}})`],
      [`(f1:Flow {motion: 'dot', type: 'NEER', ${MEANS}})`],
      [`(f1:Flow {motion: 'dot', speed: 'fast', ${MEANS}})`],
    ])
      assert.deepEqual(styleOf(...lines).style.flows, [], lines.join(' '));
  });

  // proves: flow_in_style_graph
  test('two Flows that move the same links differently: the first is kept, the later is a problem', () => {
    const { style, problems } = styleOf(
      "(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'walking'}),",
      "(f2:Flow {motion: 'dot', type: 'NEAR', means: 'walking'}),",
      "(f3:Flow {motion: 'dashes', type: 'NEAR', means: 'walking'})",
    );
    assert.deepEqual(
      style.flows.map((f) => f.at.id),
      ['f1', 'f3'],
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [
          3,
          'the links of NEAR in the whole graph are set to move both as dashes, meaning walking (line 2), and as dot, meaning walking',
          'remove one of them',
        ],
      ],
    );
  });
});

describe('movement is never the only signal', () => {
  // proves: motion_not_alone
  test('a Flow that moves links but does not say what the movement means is a problem, and they stay still', () => {
    for (const motion of ['dashes', 'dot']) {
      const { style, problems } = styleOf(`(f1:Flow {motion: '${motion}'})`);
      assert.deepEqual(style.flows, []);
      assert.deepEqual(
        problems.map((p) => [p.message, p.fix]),
        [
          [
            `a link that moves must say what its movement means, so it is never told by movement alone`,
            "add means: '<what the movement means>'",
          ],
        ],
      );
    }
    assert.deepEqual(styleOf("(f1:Flow {motion: 'still'})").problems, [], 'still needs no meaning');
  });

  // proves: motion_not_alone
  test('each moving link carries its icon on its label, in every direction laid out; a still one carries none', () => {
    const { drawing } = drawn(
      undefined,
      "(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'walking'}),",
      "(f2:Flow {motion: 'dot', type: 'CITES', means: 'read'})",
    );
    for (const dot of sources(drawing)) {
      const labels = linkLines(dot).map((l) => /\[label="([^"]*)"/.exec(l)[1]);
      assert.deepEqual(labels, [
        `${FLOW_ICONS.dashes} near`,
        'serves',
        `${FLOW_ICONS.dot} cites`,
        `${FLOW_ICONS.dot} cites`,
        'tagged',
      ]);
    }
  });

  // proves: motion_not_alone
  test('the legend says each icon with its movement and its meaning, once; a screen reader hears the same words', () => {
    const { drawing } = drawn(
      undefined,
      "(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'walking'}),",
      "(f2:Flow {motion: 'dot', type: 'CITES', means: 'read'})",
    );
    assert.deepEqual(
      flowLegend(drawing.flow).map((e) => e.words),
      [`${FLOW_ICONS.dashes} moving dashes: walking`, `${FLOW_ICONS.dot} a moving dot: read`],
    );
    assert.equal(flowSaid(drawing.flow[0]), 'moving dashes: walking');
    assert.equal(flowSaid(drawing.flow[1]), 'a moving dot: read');
  });
});

describe('how a link moves', () => {
  // proves: links_show_flow
  test('dashes are drawn dashed, so still they still show; a link laid out backwards moves backwards along its line', () => {
    const { drawing } = drawn(undefined, `(f1:Flow {motion: 'dashes', ${MEANS}})`);
    const lines = linkLines(sources(drawing)[0]);
    for (const l of lines) assert.ok(l.includes('style=dashed'), l);
    const back = lines.filter((l) => l.includes('dir=back'));
    assert.equal(back.length, 1, 'one link is laid out from its far end');
    assert.ok(back[0].includes('graph-note-flow-back'), back[0]);
    assert.equal(lines.filter((l) => l.includes('graph-note-flow-back')).length, 1);
    assert.deepEqual(reversedLinks(drawing, 'LR'), [linkLines(sources(drawing)[0]).indexOf(back[0])]);
  });

  // proves: links_show_flow
  test('flowSource with nothing to move gives the source unchanged; with arrowheads hidden the link still moves', () => {
    const { plain } = drawn(undefined);
    const dot = layoutSource(plain, 'LR').source;
    assert.equal(flowSource(dot, []), dot);
    const { drawing } = drawn(undefined, `(f1:Flow {motion: 'dashes', ${MEANS}}),`, "(a1:Arrows {arrowheads: 'hide'})");
    for (const l of linkLines(sources(drawing)[0])) {
      assert.ok(l.includes('dir=none'), l);
      assert.ok(l.includes('graph-note-flow-dashes'), l);
    }
  });

  // proves: links_show_flow
  test('Graphviz keeps the classes on each moving link it draws', () => {
    const { drawing } = drawn(undefined, `(f1:Flow {motion: 'dot', type: 'NEAR', ${MEANS}})`);
    // Graphviz writes a hyphen in a class as &#45;, which reads as a hyphen wherever the SVG is parsed
    const svg = draw(drawing, engine).svg.replaceAll('&#45;', '-');
    assert.match(svg, /<g id="edge1" class="edge graph-note-flow graph-note-flow-dot">/);
    assert.match(svg, /<g id="edge2" class="edge">/);
  });

  // proves: links_show_flow
  test('only the links written move: flowLinks takes the style chosen for each link by its type', () => {
    const { plain, style } = drawn(undefined, `(f1:Flow {motion: 'dot', type: 'TAGGED', ${MEANS}})`);
    assert.deepEqual(
      flowLinks(plain, style).map((f) => f.index),
      [4],
    );
    assert.deepEqual(flowLinks(plain, style, 'any view'), flowLinks(plain, style));
  });
});

describe('an exported SVG moves its links, and is still under reduced motion', () => {
  const exported = (motion, ...lines) => {
    const { reading, style } = drawn(undefined, ...lines);
    const info = { note: 'Trips/Trip.md', date: '2026-10-14', theme: 'light', style, data: reading.world.trip, motion };
    return exportSvg(exportScope(reading, { graph: 'trip' }), engine, info).svg;
  };
  const LINES = [
    "(f1:Flow {motion: 'dashes', type: 'NEAR', means: 'walking'}),",
    "(f2:Flow {motion: 'dot', means: 'read'})",
  ];

  // proves: links_show_flow, motion_reduced_respected
  test('its style sheet runs the dashes and the dots, and stops every one of them under reduced motion', () => {
    const svg = exported(true, ...LINES);
    const sheet = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
    assert.match(sheet, /@keyframes graph-note-flow-dashes/);
    assert.match(sheet, /@keyframes graph-note-flow-dot/);
    const [moving, still] = sheet.split('@media (prefers-reduced-motion: reduce)');
    const animated = [...moving.matchAll(/([^{}]+)\{[^}]*animation:[^}]*\}/g)].map((m) => m[1].trim());
    assert.ok(animated.length >= 2, sheet);
    for (const selector of animated) assert.ok(still.includes(selector), `${selector} is still under reduced motion`);
    assert.match(still, /animation: none/);
    // a dot runs along a copy of each moving link's line, so the line itself is still drawn
    const runners = svg.match(/class="graph-note-flow-runner"/g) ?? [];
    assert.equal(runners.length, 4, 'one for each link a dot moves along');
  });

  // proves: links_show_flow
  test('its style sheet reaches only into the image: every rule under the class the image carries', () => {
    const svg = exported(true, ...LINES);
    assert.match(svg, /^<svg [^>]*class="graph-note-image"/);
    assert.deepEqual(unscoped(/<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''), []);
  });

  // proves: motion_not_alone
  test('its legend says what each movement means', () => {
    const svg = exported(true, ...LINES);
    assert.ok(svg.includes(`${FLOW_ICONS.dashes} moving dashes: walking`), 'dashes in the legend');
    assert.ok(svg.includes(`${FLOW_ICONS.dot} a moving dot: read`), 'the dot in the legend');
  });

  // proves: motion_reduced_respected
  test('a still image, as a PNG is drawn from, has no movement in it at all; nor has an export with no Flow', () => {
    const still = exported(false, ...LINES);
    assert.doesNotMatch(still, /@keyframes|animation/);
    assert.doesNotMatch(still, /graph-note-flow-runner/);
    assert.ok(still.includes(`${FLOW_ICONS.dashes} moving dashes: walking`), 'the legend is still there');
    assert.doesNotMatch(exported(true), /@keyframes|animation/);
  });
});
