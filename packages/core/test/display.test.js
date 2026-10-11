// How a styled view or path is shown (editor spec §7): styling written in the style graph changes the colour, line and
// format of chosen things and links, within its view or path only, and keeps the locked rules — every colour that carries
// meaning is in a legend, and every colour is one of the locked style's hues, drawn through the same blends that give the
// locked contrast. Spans style.ts (reading), style-graph.ts (the hues) and theme.ts (the blends).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { readNote } from '../src/drawing.ts';
import { STYLE } from '../src/layout.ts';
import { legendOf, lookOf, readStyle } from '../src/style.ts';
import { STYLE_HUES } from '../src/style-graph.ts';
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
