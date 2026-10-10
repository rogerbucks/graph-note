// Marking a drawn SVG for an export (editor spec §16, §7): what is outside a view faded by a style attribute on its group,
// and each look drawn by attributes of its own, in the locked blends of its hue, because an image cannot take Obsidian's
// stylesheet. The groups are found by Graphviz's numbering, node1, node2… and edge1, edge2…
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FADED_OPACITY, marked } from '../src/export-marks.ts';
import { PALETTES } from '../src/palette.ts';
import { hueColour } from '../src/theme.ts';

const SVG = `<svg width="339" viewBox="0.00 0.00 254.00 163.00">
<g id="graph0" class="graph">
<g id="node1" class="node">
<path style="fill:#f8dfeb;stroke:#a8336c" stroke-width="1.2" d="M1,1"/>
<text style="fill:#222222" x="1" y="1">Alice</text>
</g>
<g id="node2" class="node">
<path style="fill:#f8dfeb;stroke:#a8336c" stroke-width="1.2" d="M2,2"/>
<text style="fill:#222222" x="2" y="2">Bob</text>
</g>
<g id="node3" class="node">
<path style="fill:#f8dfeb;stroke:#a8336c" d="M3,3"/>
<text x="3" y="3">Third</text>
</g>
<g id="node10" class="node">
<path style="fill:#f8dfeb;stroke:#a8336c" d="M4,4"/>
<text x="4" y="4">Tenth</text>
</g>
<g id="edge1" class="edge">
<path style="stroke:#ba6009" fill="none" d="M1,1C2,2"/>
<polygon style="fill:#ba6009;stroke:#ba6009" points="1,1 2,2 3,3"/>
<text style="fill:#874c11" x="1" y="1">knows</text>
</g>
</g>
</svg>`;
const NONE = { faded: { things: [], links: [] }, looks: { things: new Map(), links: new Map() } };
const group = (svg, id) => new RegExp(`<g id="${id}"[^>]*>[\\s\\S]*?</g>`).exec(svg)[0];

describe('fading', () => {
  // proves: view_export_stays_view
  test('puts an opacity in the style attribute of the group of each faded thing and link, and no other', () => {
    const out = marked(
      SVG,
      ['alice', 'bob', 'ten'],
      { ...NONE, faded: { things: ['bob'], links: [0] } },
      PALETTES.light,
    );
    assert.match(group(out, 'node2'), new RegExp(`^<g id="node2" class="node" style="opacity:${FADED_OPACITY}">`));
    assert.match(group(out, 'edge1'), new RegExp(`style="opacity:${FADED_OPACITY}">`));
    assert.doesNotMatch(group(out, 'node1'), /opacity/);
    assert.doesNotMatch(group(out, 'node10'), /opacity/);
  });

  // proves: view_export_stays_view
  test('faded things are not mixed up with a later number that starts the same', () => {
    const out = marked(
      SVG,
      ['alice', 'bob', 'ten'],
      { ...NONE, faded: { things: ['alice'], links: [] } },
      PALETTES.light,
    );
    assert.match(group(out, 'node1'), /opacity/);
    assert.doesNotMatch(group(out, 'node10'), /opacity/);
  });

  // proves: view_export_stays_view
  test('nothing to fade and no looks leaves the drawing exactly as it was', () => {
    assert.equal(marked(SVG, ['alice', 'bob', 'ten'], NONE, PALETTES.light), SVG);
  });
});

describe('a look', () => {
  const look = (things, links = new Map()) => ({ ...NONE, looks: { things: new Map(things), links } });

  // proves: styled_paths_and_views
  test('draws a thing’s border and text in the locked blends of its hue, in the palette’s own colours', () => {
    for (const theme of ['light', 'dark']) {
      const p = PALETTES[theme];
      const out = marked(SVG, ['alice', 'bob', 'ten'], look([['alice', { hue: 'green' }]]), p);
      const g = group(out, 'node1');
      assert.ok(g.includes(`stroke:${hueColour('green', 'line', p)}`), theme);
      assert.ok(g.includes(`fill:${hueColour('green', 'label', p)}`), theme);
      // the box keeps its own fill
      assert.ok(g.includes('fill:#f8dfeb'), theme);
      assert.doesNotMatch(out, /var\(--|color-mix\(/);
    }
  });

  // proves: styled_paths_and_views
  test('draws a line as bold, dashed or dotted, and a format as bold or italic', () => {
    const out = marked(
      SVG,
      ['alice', 'bob', 'ten'],
      look([
        ['alice', { line: 'bold', format: 'bold' }],
        ['bob', { line: 'dashed', format: 'italic' }],
        ['ten', { line: 'dotted' }],
      ]),
      PALETTES.light,
    );
    assert.match(group(out, 'node1'), /<path style="[^"]*stroke-width:3[^"]*"/);
    assert.match(group(out, 'node1'), /<text style="[^"]*font-weight:bold/);
    assert.match(group(out, 'node2'), /stroke-dasharray:6 4/);
    assert.match(group(out, 'node2'), /font-style:italic/);
    assert.match(group(out, 'node3'), /<path style="fill:#f8dfeb;stroke:#a8336c;stroke-dasharray:2 3"/);
    // a text with no style attribute is given one when a look sets its format
    const plain = marked(SVG, ['alice', 'bob', 'ten'], look([['ten', { format: 'italic' }]]), PALETTES.light);
    assert.match(group(plain, 'node3'), /<text x="3" y="3" style="font-style:italic">Third<\/text>/);
  });

  // proves: styled_paths_and_views
  test('draws a link in its hue, arrowhead included, and its label in the label blend', () => {
    const p = PALETTES.light;
    const out = marked(SVG, ['alice', 'bob', 'ten'], look([], new Map([[0, { hue: 'red', line: 'dashed' }]])), p);
    const g = group(out, 'edge1');
    const line = hueColour('red', 'line', p);
    assert.ok(g.includes(`<path style="stroke:${line};stroke-dasharray:6 4" fill="none"`), g);
    assert.ok(g.includes(`<polygon style="fill:${line};stroke:${line};stroke-dasharray:6 4"`), g);
    assert.ok(g.includes(`fill:${hueColour('red', 'label', p)}`), g);
  });

  // proves: styled_paths_and_views
  test('a look and a fade can be on one thing', () => {
    const out = marked(
      SVG,
      ['alice', 'bob', 'ten'],
      { faded: { things: ['alice'], links: [] }, looks: look([['alice', { hue: 'green' }]]).looks },
      PALETTES.dark,
    );
    assert.match(group(out, 'node1'), /^<g id="node1" class="node" style="opacity:/);
    assert.ok(group(out, 'node1').includes(`stroke:${hueColour('green', 'line', PALETTES.dark)}`));
  });
});
