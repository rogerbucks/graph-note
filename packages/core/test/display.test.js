// How a styled view or path is shown (editor spec §7): styling written in the style graph changes the colour, line and
// format of chosen things and links, within its view or path only, and keeps the locked rules — every colour that carries
// meaning is in a legend, and every colour is one of the locked style's hues, drawn through the same blends that give the
// locked contrast. Spans style.ts (reading), style-graph.ts (the hues) and theme.ts (the blends). And how properties are
// shown inline (editor spec §14): each property of things and of links switched on or off in the style graph, drawn below
// the text of its box or link at the locked style's size and contrast, and a box that would be crowded saying how many
// are hidden. Spans inline-properties.ts (the rows and the source), style-source.ts and render.ts (the source drawn).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { INLINE_ROWS, valueText } from '../src/inline-properties.ts';
import { layoutSource, STYLE } from '../src/layout.ts';
import { directions, draw } from '../src/render.ts';
import { legendOf, lookOf, readStyle } from '../src/style.ts';
import { STYLE_HUES } from '../src/style-graph.ts';
import { styledDrawing } from '../src/style-source.ts';
import { hueColour, themed } from '../src/theme.ts';

const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place:Green {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(walk:Path {title: 'Walk'}),
(walk)-[:STEP {seq: 1}]->(home),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(cafe)`;

const styleOfTrip = (...lines) => {
  const texts = [TRIP, ['// graph: trip_style · STYLE trip', ...lines].join('\n')];
  return readStyle(texts, 'trip', readNote(texts));
};

const LOOKS = [
  "(l1:Look {view: 'outdoors', kind: 'Place', colour: 'green', line: 'dashed', means: 'open air'}),",
  "(l2:Look {view: 'outdoors', thing: 'park', colour: 'orange', format: 'bold', means: 'the best of it'}),",
  "(l3:Look {path: 'walk', from: 'home', type: 'NEAR', to: 'park', colour: 'orange', line: 'bold', means: 'walked'}),",
  "(l4:Look {path: 'walk', thing: 'cafe', format: 'italic'})",
];

describe('styling a view or a path', () => {
  // proves: styled_paths_and_views
  test('changes the colour, line and format of the things and links it chooses, by kind or by name', () => {
    const { style, problems } = styleOfTrip(...LOOKS);
    assert.deepEqual(problems, []);
    const outdoors = { view: 'outdoors' },
      walk = { path: 'walk' };
    assert.deepEqual(lookOf(style, outdoors, { thing: 'home', kind: 'Place' }), { hue: 'green', line: 'dashed' });
    // a look for the thing itself wins over one for its kind; what it does not set, the kind's look keeps
    assert.deepEqual(lookOf(style, outdoors, { thing: 'park', kind: 'Green · Place' }), {
      hue: 'orange',
      line: 'dashed',
      format: 'bold',
    });
    assert.deepEqual(lookOf(style, walk, { link: { from: 'home', type: 'NEAR', to: 'park' } }), {
      hue: 'orange',
      line: 'bold',
    });
    assert.deepEqual(lookOf(style, walk, { thing: 'cafe', kind: 'Cafe' }), { format: 'italic' });
  });

  // proves: styled_paths_and_views
  test('applies only within its own view or path; elsewhere the locked style is kept', () => {
    const { style } = styleOfTrip(...LOOKS);
    assert.deepEqual(lookOf(style, {}, { thing: 'home', kind: 'Place' }), {});
    assert.deepEqual(lookOf(style, { view: 'indoors' }, { thing: 'home', kind: 'Place' }), {});
    assert.deepEqual(lookOf(style, { path: 'walk' }, { thing: 'home', kind: 'Place' }), {});
    assert.deepEqual(lookOf(style, { view: 'outdoors' }, { link: { from: 'home', type: 'NEAR', to: 'park' } }), {});
    assert.deepEqual(lookOf(style, { path: 'walk' }, { link: { from: 'park', type: 'NEAR', to: 'cafe' } }), {});
  });

  // proves: styled_paths_and_views
  test('a look names one view or one path, and one thing, kind or link, and changes something', () => {
    const { style, problems } = styleOfTrip(
      "(l1:Look {kind: 'Place', line: 'dashed'}),",
      "(l2:Look {view: 'v', path: 'walk', kind: 'Place', line: 'dashed'}),",
      "(l3:Look {view: 'v', line: 'dashed'}),",
      "(l4:Look {view: 'v', thing: 'home', kind: 'Place', line: 'dashed'}),",
      "(l5:Look {view: 'v', from: 'home', to: 'park', line: 'dashed'}),",
      "(l6:Look {view: 'v', thing: 'home'}),",
      "(l7:Look {view: 'v', thing: 'home', line: 'wavy', format: 'loud'})",
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message]),
      [
        [2, "a look is for a view or a path: add view: '<name>' or path: '<id>'"],
        [3, 'a look is for one view or one path, not both'],
        [4, 'a look styles one thing, kind or link: add thing, kind, or from, type and to'],
        [5, 'a look styles one thing, kind or link, not more'],
        [6, 'a look styles one thing, kind or link: add thing, kind, or from, type and to'],
        [7, 'a look changes a colour, a line or a format: add one'],
        [8, 'line must be solid, dashed, dotted or bold'],
        [8, 'format must be plain, bold or italic'],
      ],
    );
    assert.deepEqual(style.looks, []);
  });
});

describe('styling keeps the locked rules', () => {
  // proves: styling_keeps_locked_rules
  test('every colour styling uses in a view or path is in its legend, with what it means', () => {
    const { style } = styleOfTrip(...LOOKS);
    assert.deepEqual(legendOf(style, { view: 'outdoors' }), [
      { colour: 'green', means: 'open air' },
      { colour: 'orange', means: 'the best of it' },
    ]);
    assert.deepEqual(legendOf(style, { path: 'walk' }), [{ colour: 'orange', means: 'walked' }]);
    assert.deepEqual(legendOf(style, {}), []);
    // every hue a look can give in a scope is in that scope's legend
    for (const scope of [{ view: 'outdoors' }, { path: 'walk' }]) {
      const listed = new Set(legendOf(style, scope).map((e) => e.colour));
      for (const l of style.looks.filter((x) => x.view === scope.view && x.path === scope.path))
        if (l.colour) assert.ok(listed.has(l.colour), `${l.colour} is in the legend`);
    }
  });

  // proves: styling_keeps_locked_rules
  test('a colour with no meaning written is a problem, and is not drawn: the rest of the look is', () => {
    const { style, problems } = styleOfTrip("(l1:Look {view: 'v', thing: 'home', colour: 'blue', line: 'dotted'})");
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [
          2,
          'blue has no meaning written, so the legend cannot say what it means',
          "add means: '<what blue means here>'",
        ],
      ],
    );
    assert.deepEqual(lookOf(style, { view: 'v' }, { thing: 'home', kind: 'Place' }), { line: 'dotted' });
    assert.deepEqual(legendOf(style, { view: 'v' }), []);
  });

  // proves: styling_keeps_locked_rules
  test('one colour may mean one thing in a view: a second meaning for it is a problem', () => {
    const { style, problems } = styleOfTrip(
      "(l1:Look {view: 'v', thing: 'home', colour: 'blue', means: 'start'}),",
      "(l2:Look {view: 'v', thing: 'cafe', colour: 'blue', means: 'end'}),",
      "(l3:Look {view: 'w', thing: 'cafe', colour: 'blue', means: 'end'})",
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [[3, 'blue already means start in view v (line 2)', 'use another colour, or the same meaning']],
    );
    assert.deepEqual(legendOf(style, { view: 'v' }), [{ colour: 'blue', means: 'start' }]);
    assert.deepEqual(legendOf(style, { view: 'w' }), [{ colour: 'blue', means: 'end' }]);
  });

  // proves: styling_keeps_locked_rules
  test('a look whose colour already means something else keeps the rest of it: its line or its format alone', () => {
    const { style, problems } = styleOfTrip(
      "(l1:Look {view: 'v', thing: 'home', colour: 'blue', means: 'start'}),",
      "(l2:Look {view: 'v', thing: 'cafe', colour: 'blue', means: 'end', format: 'bold'}),",
      "(l3:Look {view: 'v', thing: 'park', colour: 'blue', means: 'end', line: 'dashed'})",
    );
    assert.equal(problems.length, 2);
    assert.deepEqual(lookOf(style, { view: 'v' }, { thing: 'cafe', kind: 'Place' }), { format: 'bold' });
    assert.deepEqual(lookOf(style, { view: 'v' }, { thing: 'park', kind: 'Place' }), { line: 'dashed' });
    assert.deepEqual(legendOf(style, { view: 'v' }), [{ colour: 'blue', means: 'start' }]);
  });

  // proves: styling_keeps_locked_rules
  test("colours are only the locked style's hues, named, never raw values; another is a problem with the nearest", () => {
    assert.deepEqual(
      [...STYLE_HUES].sort(),
      [...new Set([...STYLE.kind_hues, ...STYLE.edge_hues, 'red', 'green'])].sort(),
    );
    const { style, problems } = styleOfTrip(
      "(l1:Look {view: 'v', thing: 'home', colour: 'purpel', line: 'dotted', means: 'a'}),",
      "(l2:Look {view: 'v', thing: 'cafe', colour: '#ff0000', line: 'dotted', means: 'b'})",
    );
    const all = `${STYLE_HUES.slice(0, -1).join(', ')} or ${STYLE_HUES.at(-1)}`;
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'purpel is not a colour of the locked style', 'change purpel to purple'],
        [3, '#ff0000 is not a colour of the locked style', `change #ff0000 to one of ${all}`],
      ],
    );
    assert.deepEqual(
      style.looks.map((l) => [l.colour, l.line]),
      [
        [undefined, 'dotted'],
        [undefined, 'dotted'],
      ],
    );
    assert.deepEqual(legendOf(style, { view: 'v' }), []);
  });

  // proves: styling_keeps_locked_rules
  test("a styled hue is drawn through the same blends as a kind's hue, so it meets the locked contrast", () => {
    const kinds = ['Place', 'Cafe'],
      readings = ['near'];
    const kh = GraphLayout.pick(kinds, STYLE.kind_hues, STYLE.kind_colours);
    const eh = GraphLayout.pick(readings, STYLE.edge_hues, STYLE.edge_colours);
    const svg = [
      '<svg width="10pt" height="10pt">',
      '<path fill="#000100" stroke="#000200" d="M0,0"/>',
      '<path stroke="#000300" d="M0,0"/>',
      '<text text-anchor="middle" fill="#000400">near</text>',
      '</svg>',
    ].join('\n');
    const out = themed(svg, kinds, readings);
    assert.ok(out.includes(`fill:${hueColour(kh.Place, 'fill')};stroke:${hueColour(kh.Place, 'line')}`), out);
    assert.ok(out.includes(`stroke:${hueColour(eh.near, 'line')}`), out);
    assert.ok(out.includes(`fill:${hueColour(eh.near, 'label')}`), out);
    // the blends are the locked mixes with the theme's text colour, for every hue a look may give
    for (const hue of STYLE_HUES) {
      assert.equal(
        hueColour(hue, 'line'),
        `color-mix(in srgb, var(--color-${hue}) ${STYLE.line_mix}%, var(--text-normal))`,
      );
      assert.equal(
        hueColour(hue, 'label'),
        `color-mix(in srgb, var(--color-${hue}) ${STYLE.label_mix}%, var(--text-normal))`,
      );
      assert.equal(hueColour(hue, 'fill'), `rgba(var(--color-${hue}-rgb), ${STYLE.fill_opacity})`);
    }
  });
});

const PLACES = `// graph: trip · SOURCE
(home:Place {name: 'Home', open: 'always', rooms: 4}),
(park:Place {name: 'The park', open: 'dawn', since: DATE '1901-05-01', free: TRUE}),
(cafe:Cafe {name: 'Cafe', open: '8am'}),
(home)-[:NEAR {miles: 1.5, by: 'foot'}]->(park),
(cafe)-[:SERVES {since: DATE '2020-01-01'}]->(park)`;

/** Graph `graph` of `data` drawn in `view` (none: the whole graph), its style a style block of the given lines. */
function shownIn(data, view, ...lines) {
  const graph = /^\/\/ graph: (\w+)/.exec(data)[1];
  const texts = [data, [`// graph: ${graph}_style · STYLE ${graph}`, ...lines].join('\n')];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, graph, reading);
  assert.deepEqual(problems, []);
  const plain = reading.graphs.get(graph);
  return { plain, world: reading.world[graph], drawing: styledDrawing(plain, style, reading.world[graph], view) };
}
const inline = (view, ...lines) => shownIn(PLACES, view, ...lines);
/** The rows shown inline, as {boxes: {key: rows}, links: {index: rows}}. */
const rowsOf = (drawing) => ({
  boxes: Object.fromEntries(drawing.inline?.boxes ?? []),
  links: Object.fromEntries(drawing.inline?.links ?? []),
});
/** One row of a box or a link as the layout source writes it. */
const row = (text) => `<tr><td cellpadding="0"><font point-size="${STYLE.kind_font_size}">${text}</font></td></tr>`;
const GAP = `<tr><td cellpadding="0" height="${STYLE.caption_gap}"></td></tr>`;
/** The group Graphviz draws a box or a link in (`node1`, `edge1`), from a drawn SVG. */
const groupOf = (svg, id) => svg.split(`<g id="${id}" class="`)[1].split('</g>')[0];
/** Each text in a group: where it stands (y, downwards), its size, its colour as themed, and its words. */
const textsIn = (group) =>
  [...group.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map(([, attrs, text]) => ({
    y: Number(/ y="([\d.-]+)"/.exec(attrs)?.[1]),
    size: Number(/font-size="([\d.]+)"/.exec(attrs)?.[1]),
    fill: /fill:([^;"]+)/.exec(attrs)?.[1],
    text,
  }));

describe('properties shown inline', () => {
  // proves: properties_switch
  test('every property of every thing and of every link can be switched on, and is drawn', () => {
    const { plain, world } = inline(undefined);
    let switched = 0;
    for (const b of plain.boxes)
      for (const [p, v] of Object.entries(world.p(b.key)).filter(([k]) => k !== 'id')) {
        const { drawing } = inline(undefined, `(s1:Show {property: '${p}', thing: '${b.key}'})`);
        assert.deepEqual(drawing.inline, { boxes: [[b.key, [[p, valueText(v)]]]], links: [] }, `${b.key}.${p}`);
        assert.ok(directions(drawing)[0].dot.includes(row(GraphLayout.escape(`${p}: ${valueText(v)}`))));
        switched++;
      }
    for (const type of new Set(plain.links.map((l) => l.type)))
      for (const p of new Set(
        world.edges.filter(([, t]) => t === type).flatMap(([, , , props]) => Object.keys(props)),
      )) {
        const { drawing } = inline(undefined, `(s1:Show {property: '${p}', type: '${type}'})`);
        const links = plain.links.flatMap((l, i) =>
          l.type === type ? [[i, [[p, valueText(world.edges[i][3][p])]]]] : [],
        );
        assert.deepEqual(drawing.inline, { boxes: [], links }, `${type}.${p}`);
        switched++;
      }
    assert.equal(switched, 12, 'nine properties of things and three of links');
  });

  // proves: properties_switch
  test('switched on for a kind, a thing or a type, and off again for a thing or in a view', () => {
    const lines = [
      "(s1:Show {property: 'open', kind: 'Place'}),",
      "(s2:Show {property: 'open', thing: 'park', inline: 'off'}),",
      "(s3:Show {property: 'miles', type: 'NEAR'}),",
      "(s4:Show {property: 'open', kind: 'Place', view: 'quiet', inline: 'off'}),",
      "(s5:Show {property: 'open', kind: 'Cafe', view: 'quiet'}),",
      "(s6:Show {property: 'since', type: 'SERVES', inline: 'off'})",
    ];
    assert.deepEqual(rowsOf(inline(undefined, ...lines).drawing), {
      boxes: { home: [['open', 'always']] },
      links: { 0: [['miles', '1.5']] },
    });
    assert.deepEqual(rowsOf(inline('quiet', ...lines).drawing), {
      boxes: { cafe: [['open', '8am']] },
      links: { 0: [['miles', '1.5']] },
    });
  });

  // proves: properties_switch
  test('with nothing switched on, nothing is added: the source is the layout source byte for byte', () => {
    const { plain, drawing } = inline(undefined, "(s1:Show {property: 'open', kind: 'Place', inline: 'off'})");
    assert.equal(drawing.inline, undefined);
    assert.equal(directions(drawing)[0].dot, layoutSource(plain, 'LR').source);
  });

  // proves: properties_switch
  test('a value is said as it is written: text bare, a number, a date and true or false', () => {
    const { drawing } = inline(
      undefined,
      "(s1:Show {property: 'since', kind: 'Place'}),",
      "(s2:Show {property: 'free', kind: 'Place'}),",
      "(s3:Show {property: 'rooms', kind: 'Place'})",
    );
    assert.deepEqual(rowsOf(drawing).boxes, {
      home: [['rooms', '4']],
      park: [
        ['since', '1901-05-01'],
        ['free', 'true'],
      ],
    });
  });
});

describe('properties shown inline are readable', () => {
  // proves: properties_readable
  test('below the text of their box, at the kind caption size, in the box text colour', () => {
    const { plain, drawing } = inline(undefined, "(s1:Show {property: 'open', kind: 'Place'})");
    const before = layoutSource(plain, 'LR').source.split('\n'),
      after = directions(drawing)[0].dot.split('\n');
    const home = (lines) => lines.find((l) => l.startsWith('  "home" ['));
    const text = '<tr><td cellpadding="1">Home</td></tr>';
    assert.ok(home(before).includes(`${text}</table>>`));
    assert.ok(home(after).includes(`${text}${GAP}${row('open: always')}</table>>`), home(after));
    // the row names no colour: it is drawn in the box's own text colour, as its text is
    assert.ok(!row('x').includes('color='));
    assert.equal(after.length, before.length, 'nothing else is added');
  });

  // proves: properties_readable
  test("below the reading of their link, at the kind caption size, in the link's label colour", () => {
    const { drawing } = inline(undefined, "(s1:Show {property: 'miles', type: 'NEAR'})");
    const near = directions(drawing)[0]
      .dot.split('\n')
      .find((l) => l.startsWith('  "home" -> "park"'));
    assert.equal(
      near,
      `  "home" -> "park" [label=<<table border="0" cellborder="0" cellspacing="0" cellpadding="0"><tr><td>near</td></tr>${GAP}${row('miles: 1.5')}</table>>, color="#000300", fontcolor="#000400"];`,
    );
  });

  // proves: properties_readable
  test('drawn and themed: inside the box, under its text, in the locked text colour and caption size', async () => {
    const { drawing } = inline(
      undefined,
      "(s1:Show {property: 'open', kind: 'Place'}),",
      "(s2:Show {property: 'miles', type: 'NEAR'})",
    );
    const svg = draw(drawing, await loadEngine()).svg;
    // Graphviz numbers the boxes and links in the drawing's order: park is the second box, home to park the first link
    const park = textsIn(groupOf(svg, 'node2'));
    const name = park.find((t) => t.text === 'The park'),
      open = park.find((t) => t.text === 'open: dawn');
    assert.ok(name && open, JSON.stringify(park));
    assert.ok(open.y > name.y, 'below the text');
    assert.equal(open.size, STYLE.kind_font_size);
    assert.equal(open.fill, name.fill, 'the text colour of the box');
    assert.equal(open.fill, 'var(--text-normal)');
    // inside the box: between the top and bottom of its outline
    const ys = [...groupOf(svg, 'node2').matchAll(/(?:[\d.-]+),([\d.-]+)/g)].map((m) => Number(m[1]));
    assert.ok(open.y < Math.max(...ys) && open.y > Math.min(...ys), 'inside the box');
    const link = textsIn(groupOf(svg, 'edge1'));
    const reading = link.find((t) => t.text === 'near'),
      miles = link.find((t) => t.text === 'miles: 1.5');
    assert.ok(reading && miles, JSON.stringify(link));
    assert.ok(miles.y > reading.y);
    assert.equal(miles.fill, reading.fill, "the link's label colour, which meets the locked contrast");
    assert.equal(miles.size, STYLE.kind_font_size);
  });
});

describe('a box crowded with properties', () => {
  const HALL = `// graph: venue
(hall:Venue {name: 'Hall', a1: 'one', a2: 'two', a3: 'three', a4: 'four', a5: 'five', a6: 'six',
  note: 'a long note that wraps over more than one row of its box'})`;
  const show = (...props) =>
    props.map((p, i) => `(s${i}:Show {property: '${p}', thing: 'hall'})${i < props.length - 1 ? ',' : ''}`);

  // proves: crowded_properties
  test('says how many are hidden, rather than drawing more rows than it holds', () => {
    const { drawing } = shownIn(HALL, undefined, ...show('a1', 'a2', 'a3', 'a4', 'a5', 'a6'));
    const hall = directions(drawing)[0]
      .dot.split('\n')
      .find((l) => l.startsWith('  "hall" ['));
    assert.ok(
      hall.endsWith(
        `${GAP}${row('a1: one')}${row('a2: two')}${row('a3: three')}${row('3 properties hidden')}</table>>, fillcolor="#000100", color="#000200"];`,
      ),
      hall,
    );
    assert.equal(INLINE_ROWS, 4);
  });

  // proves: crowded_properties
  test('counts a long value by the rows it wraps to, and shows only whole properties', () => {
    const fits = directions(shownIn(HALL, undefined, ...show('a1', 'note')).drawing)[0].dot;
    assert.ok(
      fits.includes(
        `${row('a1: one')}${row('note: a long note that')}${row('wraps over more than')}${row('one row of its box')}</table>>`,
      ),
    );
    const crowded = directions(shownIn(HALL, undefined, ...show('a1', 'a2', 'note')).drawing)[0].dot;
    assert.ok(crowded.includes(`${row('a1: one')}${row('a2: two')}${row('1 property hidden')}</table>>`), crowded);
  });

  // proves: crowded_properties
  test('drawn, no two rows of the box overlap', async () => {
    const svg = draw(
      shownIn(HALL, undefined, ...show('a1', 'a2', 'a3', 'a4', 'a5', 'a6')).drawing,
      await loadEngine(),
    ).svg;
    const rows = textsIn(groupOf(svg, 'node1'));
    assert.deepEqual(
      rows.map((r) => r.text),
      ['VENUE', 'Hall', 'a1: one', 'a2: two', 'a3: three', '3 properties hidden'],
    );
    for (let i = 1; i < rows.length; i++)
      assert.ok(rows[i].y - rows[i - 1].y >= rows[i].size, `${rows[i].text} clears the row above`);
  });

  // proves: crowded_properties
  test('a single value too long for the rows is cut short with an ellipsis, never hidden', () => {
    const LONG = `// graph: venue
(hall:Venue {name: 'Hall', story: 'a story so long that it wraps over far more than three rows of its box, and on'})`;
    const hall = directions(shownIn(LONG, undefined, ...show('story')).drawing)[0]
      .dot.split('\n')
      .find((l) => l.startsWith('  "hall" ['));
    assert.ok(
      hall.includes(
        `${GAP}${row('story: a story so long')}${row('that it wraps over far')}${row('more than three rows…')}</table>>`,
      ),
      hall,
    );
    assert.ok(!hall.includes('hidden'));
  });

  // proves: crowded_properties
  test("drawn, no two rows of a crowded link's label overlap", async () => {
    const LINKED = `// graph: venue
(hall:Venue {name: 'Hall'}), (room:Venue {name: 'Room'}),
(hall)-[:HAS {a: 'one', b: 'two', c: 'three', d: 'four', e: 'five'}]->(room)`;
    const { drawing } = shownIn(
      LINKED,
      undefined,
      ...['a', 'b', 'c', 'd', 'e'].map(
        (p, i, all) => `(s${i}:Show {property: '${p}', type: 'HAS'})${i < all.length - 1 ? ',' : ''}`,
      ),
    );
    const rows = textsIn(groupOf(draw(drawing, await loadEngine()).svg, 'edge1'));
    assert.deepEqual(
      rows.map((r) => r.text),
      ['has', 'a: one', 'b: two', 'c: three', '2 properties hidden'],
    );
    for (let i = 1; i < rows.length; i++)
      assert.ok(rows[i].y - rows[i - 1].y >= rows[i].size, `${rows[i].text} clears the row above`);
  });
});

// type_one_look (editor spec §15): every diagram type keeps the locked style. A graph of three kinds, with a date on each
// thing, so every type Graphviz draws fits it; each is drawn, themed, beside the network it is a type of.
const TYPED = `// graph: team · SOURCE
(ada:Person {name: 'Ada', on: DATE '2026-01-01'}),
(bea:Person {name: 'Bea', on: DATE '2026-02-01'}),
(ops:Team {name: 'Ops', on: DATE '2026-03-01'}),
(plan:Plan {name: 'The plan', on: DATE '2026-04-01'}),
(ada)-[:LEADS]->(bea),
(bea)-[:JOINS]->(ops),
(ops)-[:OWNS]->(plan)`;
/** Each box's shape as themed: its group (Graphviz numbers boxes in the order drawn), and its fill and stroke. */
const boxLooks = (svg) =>
  Object.fromEntries(
    [...svg.matchAll(/<g id="(node\d+)" class="node">\s*<(?:path|polygon) style="([^"]*)"/g)].map(([, id, style]) => [
      id,
      style,
    ]),
  );

describe('every diagram type keeps the locked style', () => {
  // proves: type_one_look
  test("each type's boxes and links keep their colours, its texts the locked sizes, and no colour is left unthemed", async () => {
    const engine = await loadEngine();
    const network = draw(shownIn(TYPED, undefined).drawing, engine).svg;
    const sizes = new Set([STYLE.font_size, STYLE.kind_font_size, STYLE.edge_font_size]);
    const lines = (svg) =>
      svg
        .split('class="edge"')
        .slice(1)
        .flatMap((e) => [...e.split('</g>')[0].matchAll(/<path style="(stroke:[^"]*)"/g)].map((m) => m[1]));
    // a lane's box is outlined as a group's is, in the locked muted colour
    const muted = (svg) => [...svg.matchAll(/class="cluster">\s*<path style="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(Object.keys(boxLooks(network)), ['node1', 'node2', 'node3', 'node4'], 'every box is compared');
    assert.equal(new Set(lines(network)).size, 3, 'every reading’s line is compared');
    for (const type of ['tree', 'flow', 'radial', 'lanes', 'timeline']) {
      const { drawing } = shownIn(TYPED, undefined, `(d1:Diagram {type: '${type}'})`);
      assert.equal(drawing.diagram?.type, type, `${type} fits, and is drawn`);
      const svg = draw(drawing, engine).svg;
      // the same kind hues, blended to the locked contrast, on every box; the same reading hues on every link
      assert.deepEqual(boxLooks(svg), boxLooks(network), `${type}: the boxes keep their colours`);
      assert.deepEqual(new Set(lines(svg)), new Set(lines(network)), `${type}: the links keep their colours`);
      for (const outline of muted(svg)) assert.equal(outline, 'stroke:var(--text-muted)', `${type}: a lane's outline`);
      if (type === 'lanes') assert.equal(muted(svg).length, 3, 'a lane for each kind');
      for (const [, size] of svg.matchAll(/<text[^>]*font-size="([\d.]+)"/g))
        assert.ok(sizes.has(Number(size)), `${type}: a text at ${size}, a size of the locked style`);
      assert.doesNotMatch(svg, /#000[0-4][0-9a-f]{2}/, `${type}: every placeholder colour themed`);
      assert.equal(svg.includes('font-family="'), network.includes('font-family="'), `${type}: the locked font`);
    }
  });
});

describe('a link guessed from a near miss of its type', () => {
  // proves: properties_switch
  test('shows the properties chosen for the type it is taken for, as its arrowhead goes by that type', () => {
    const NEAR = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR {miles: 1}]->(park),
(park)-[:NEAR {miles: 2}]->(cafe),
(cafe)-[:NEER {miles: 3}]->(home)`;
    const { plain, drawing } = shownIn(NEAR, undefined, "(s1:Show {property: 'miles', type: 'NEAR'})");
    assert.deepEqual(
      plain.estimates.map((e) => [e.kind, e.written, e.taken, e.index]),
      [['type', 'NEER', 'NEAR', 2]],
    );
    assert.deepEqual(rowsOf(drawing).links, {
      0: [['miles', '1']],
      1: [['miles', '2']],
      2: [['miles', '3']],
    });
  });
});
