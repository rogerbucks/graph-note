// Marking a drawn SVG for an export (editor spec §16, §7). What is outside a view is faded by a style attribute on its
// group. Each look is drawn by attributes of its own, in the locked blends of its hue, because an image cannot take
// Obsidian's stylesheet. The groups are found by Graphviz's numbering, node1, node2… and edge1, edge2…
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FADED_OPACITY, marked } from '../src/export-marks.ts';
import { PALETTES } from '../src/palette.ts';
import { STYLE_HUES } from '../src/style-graph.ts';
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
  test('draws a thing’s outline in the locked line blend of its hue, in the palette’s own colours, and not its text', () => {
    for (const theme of ['light', 'dark']) {
      const p = PALETTES[theme];
      const out = marked(SVG, ['alice', 'bob', 'ten'], look([['alice', { hue: 'green' }]]), p);
      const g = group(out, 'node1');
      assert.ok(g.includes(`stroke:${hueColour('green', 'line', p)}`), theme);
      assert.ok(!g.includes(hueColour('green', 'label', p)), theme);
      // the text and the box keep their own colours
      assert.ok(g.includes('<text style="fill:#222222"'), theme);
      assert.ok(g.includes('fill:#f8dfeb'), theme);
      assert.doesNotMatch(out, /var\(--|color-mix\(/);
    }
  });

  // proves: styled_paths_and_views
  test('keeps the locked 4.5:1 for the text on the box, whatever the look’s hue and the kind’s hue, in both themes', () => {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lum = (hex) => {
      const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    let checked = 0;
    for (const theme of ['light', 'dark']) {
      const p = PALETTES[theme];
      for (const kindHue of STYLE_HUES)
        for (const lookHue of STYLE_HUES) {
          const box = `<svg><g id="node1" class="node"><path style="fill:${hueColour(kindHue, 'fill', p)};stroke:${hueColour(kindHue, 'line', p)}" d="M1,1"/><text style="fill:${p.text}" x="1" y="1">A</text></g></svg>`;
          const out = marked(box, ['a'], look([['a', { hue: lookHue, line: 'bold', format: 'bold' }]]), p);
          const fill = /<path style="fill:(#[0-9a-f]{6})/.exec(out)[1];
          const text = /<text style="fill:(#[0-9a-f]{6})/.exec(out)[1];
          assert.ok(contrast(text, fill) >= 4.5, `${theme} ${lookHue} look on ${kindHue}: ${contrast(text, fill)}`);
          checked++;
        }
    }
    assert.equal(checked, 2 * STYLE_HUES.length ** 2);
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
  test('draws a link in its hue, arrowhead included, and leaves its label’s colour as it was', () => {
    const p = PALETTES.light;
    const out = marked(SVG, ['alice', 'bob', 'ten'], look([], new Map([[0, { hue: 'red', line: 'dashed' }]])), p);
    const g = group(out, 'edge1');
    const line = hueColour('red', 'line', p);
    assert.ok(g.includes(`<path style="stroke:${line};stroke-dasharray:6 4" fill="none"`), g);
    assert.ok(g.includes(`<polygon style="fill:${line};stroke:${line};stroke-dasharray:6 4"`), g);
    assert.ok(g.includes('<text style="fill:#874c11"'), g);
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

describe('a hostile drawing', () => {
  // proves: view_export_stays_view
  test('a run of groups never closed is left as it was, and every closed group before it still marked', () => {
    const fade = { ...NONE, faded: { things: ['alice'], links: [] } };
    const open = '<g id="node0"' + '<g id="edge0"'.repeat(20000);
    assert.equal(marked(open, ['alice'], fade, PALETTES.light), open);
    const tail = '<g id="node1">a</g>' + '<g id="edge0">a'.repeat(20000);
    const out = marked(tail, ['alice'], fade, PALETTES.light);
    assert.ok(out.startsWith(`<g id="node1" style="opacity:${FADED_OPACITY}">a</g>`));
    assert.equal(out.length, tail.length + ` style="opacity:${FADED_OPACITY}"`.length);
  });
});
