// The one colour mapping (spec §10, one_colour_map): each host writes the style's colours through one table. Obsidian's
// entry names its theme variables, so the drawing follows the theme; a host whose drawing is an isolated image, such as
// a Claude Code pane, takes fixed colours with the page painted in, and still meets the locked style's contrast (§11).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { instance } from '@viz-js/viz';
import { readNote } from '../src/drawing.ts';
import { layoutSource, STYLE } from '../src/layout.ts';
import { themed } from '../src/theme.ts';
import { PALETTES, THEME_COLOURS, fixedPalette } from '../src/palette.ts';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const HUES = [
  ...new Set([
    ...STYLE.kind_hues,
    ...STYLE.edge_hues,
    ...Object.values(STYLE.kind_colours),
    ...Object.values(STYLE.edge_colours),
  ]),
];
const GRAPH = `// graph: g
(q:Question {title: 'Which device?'}), (o1:Option {name: 'A tablet'}), (r:Reason {title: 'It costs nothing extra'}),
(o1)-[:ANSWERS]->(q), (r)-[:FAVOURS]->(o1), (r)-[:COUNTS_AGAINST]->(q)`;

describe('one table', () => {
  test('the table has Obsidian’s entry, a fixed light and dark one, and one that follows the system', () => {
    assert.deepEqual(Object.keys(PALETTES).sort(), ['dark', 'light', 'obsidian', 'system']);
  });

  test('the system entry carries both fixed entries in the drawing, the dark one chosen by prefers-color-scheme', () => {
    const p = PALETTES.system;
    // the drawing's own style sheet: each name with its light value, then again under the dark scheme
    const sheet = p.style ?? '';
    const [light, dark] = sheet.split('@media (prefers-color-scheme: dark)');
    const valuesIn = (part) => new Map([...part.matchAll(/(--gn-[\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
    const resolve = (c, values) => c.replace(/^var\((--gn-[\w-]+)\)$/, (_, name) => values.get(name) ?? 'unset');
    for (const [scheme, part] of [
      ['light', light],
      ['dark', dark],
    ]) {
      const values = valuesIn(part ?? ''),
        fixed = PALETTES[scheme];
      assert.equal(resolve(p.text, values), fixed.text, scheme);
      assert.equal(resolve(p.muted, values), fixed.muted, scheme);
      assert.equal(resolve(p.edge, values), fixed.edge, scheme);
      assert.equal(resolve(p.page ?? '', values), fixed.page, scheme);
      for (const h of HUES) {
        assert.equal(resolve(p.fill(h), values), fixed.fill(h), `${scheme} ${h} fill`);
        for (const pct of [STYLE.line_mix, STYLE.label_mix])
          assert.equal(resolve(p.blend(h, pct), values), fixed.blend(h, pct), `${scheme} ${h} ${pct}`);
      }
    }
    assert.equal(PALETTES.obsidian.style, undefined, "Obsidian's theme does this itself");
  });

  test('Obsidian’s entry names the theme’s variables, as the style file does', () => {
    const p = PALETTES.obsidian;
    assert.deepEqual([p.text, p.muted, p.edge, p.page], [STYLE.text, STYLE.muted, STYLE.edge, undefined]);
    assert.equal(p.fill('orange'), `rgba(var(--color-orange-rgb), ${STYLE.fill_opacity})`);
    assert.equal(p.blend('red', 50), 'color-mix(in srgb, var(--color-red) 50%, var(--text-normal))');
  });

  test('a fixed entry writes every colour as six hex digits, worked out as the CSS it stands for', () => {
    const p = fixedPalette({ ...THEME_COLOURS.light, page: '#ffffff', text: '#000000', red: '#ff0000' });
    assert.equal(p.blend('red', 50), '#800000', 'color-mix in sRGB, rounded');
    assert.equal(p.fill('red'), '#ffd6d6', `the hue at ${STYLE.fill_opacity} over the page`);
    for (const c of [p.text, p.muted, p.edge, p.page, p.fill('blue'), p.blend('blue', 75)])
      assert.match(c ?? '', /^#[0-9a-f]{6}$/);
  });
});

for (const name of ['light', 'dark']) {
  describe(`the fixed ${name} entry keeps the locked style's contrast on its own page`, () => {
    const p = PALETTES[name];
    for (const h of HUES) {
      test(`${h}: labels 4.5:1, lines 3:1, a box's text and caption 4.5:1`, () => {
        assert.ok(contrast(p.blend(h, STYLE.label_mix), p.page) >= 4.5, 'a label');
        assert.ok(contrast(p.blend(h, STYLE.line_mix), p.page) >= 3, 'a line');
        assert.ok(contrast(p.text, p.fill(h)) >= 4.5, "a box's text");
        assert.ok(contrast(p.muted, p.fill(h)) >= 4.5, "a box's kind caption");
      });
    }
    test('muted text and links 4.5:1', () => assert.ok(contrast(p.edge, p.page) >= 4.5));
  });
}

test('drawn with a fixed entry, the drawing names no variable and no color-mix, and paints its own page', async () => {
  const viz = await instance();
  const { source, kinds, readings } = layoutSource(readNote([GRAPH]).graphs.get('g'), 'LR');
  const raw = viz.renderString(source, { format: 'svg' });
  const svg = themed(raw, kinds, readings, PALETTES.dark);
  assert.doesNotMatch(svg, /var\(|color-mix|#000[0-4][0-9a-f]{2}"/);
  assert.match(svg, new RegExp(`<svg [^>]*style="[^"]*background:${THEME_COLOURS.dark.page}`));
  assert.match(svg, new RegExp(`stroke:${PALETTES.dark.blend('green', STYLE.line_mix)}`), 'favours is drawn green');
  const plain = themed(raw, kinds, readings);
  assert.match(plain, /var\(--text-normal\)/, "Obsidian's theme variables by default");
  assert.doesNotMatch(plain, /background:/, "Obsidian's own page shows through");
});

test('drawn with the system entry, the drawing holds its own style sheet and names only its own variables', async () => {
  const viz = await instance();
  const { source, kinds, readings } = layoutSource(readNote([GRAPH]).graphs.get('g'), 'LR');
  const svg = themed(viz.renderString(source, { format: 'svg' }), kinds, readings, PALETTES.system);
  assert.match(svg, /^<svg [^>]*>\n<style>[^<]*@media \(prefers-color-scheme: dark\)[^<]*<\/style>\n/);
  assert.doesNotMatch(svg, /color-mix|--color-|--text-|#000[0-4][0-9a-f]{2}"/, 'no host variable, no placeholder');
  for (const name of new Set([...svg.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1])))
    assert.match(PALETTES.system.style ?? '', new RegExp(`${name}:`), `${name} is defined in the drawing`);
  assert.match(svg, /<svg [^>]*style="[^"]*background:var\(--gn-page\)/);
});
