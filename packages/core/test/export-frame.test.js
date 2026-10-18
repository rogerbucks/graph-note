// The frame round an exported image (editor spec §16). It has its own background, a title, the legend and a footer
// saying which note it came from and when. All are in the locked style's font and sizes, in fixed colours. The drawing
// is put inside, untouched, at its natural size.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_MIN_WIDTH, framed, saidDate } from '../src/export-frame.ts';
import { STYLE } from '../src/layout.ts';
import { PALETTES } from '../src/palette.ts';
import { fixed } from '../src/theme.ts';

// a themed drawing as theme.ts gives it: 200 by 100 pixels, laid out in a 150 by 75 point box
const INNER = {
  svg: `<svg width="200" style="max-width:100%;height:auto;filter:none;background:#ffffff"
viewBox="0.00 0.00 150.00 75.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 71)">
<g id="node1" class="node"><path style="fill:#f8dfeb;stroke:#a8336c" d="M0,0"/></g>
</g>
</svg>`,
  width: 200,
  height: 100,
};
const TEXT = {
  title: 'trip',
  legend: [
    { label: 'Place', fill: '#f8dfeb', stroke: '#a8336c' },
    { label: 'Cafe', fill: '#e9e3fc', stroke: '#6346bb' },
  ],
  footer: 'From Trips/Lisbon.md, exported 11 Oct 2026',
};
const px = (pt) => fixed((pt * 4) / 3, 2);
const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

describe('the frame', () => {
  // proves: export_self_explaining
  test('is one self-contained SVG, as large as its width and height say, with its own background', () => {
    for (const theme of ['light', 'dark']) {
      const p = PALETTES[theme];
      const f = framed(INNER, TEXT, p);
      const root = /^<svg\b[^>]*>/.exec(f.svg)[0];
      assert.equal(attr(root, 'xmlns'), 'http://www.w3.org/2000/svg');
      assert.equal(attr(root, 'width'), String(f.width));
      assert.equal(attr(root, 'height'), String(f.height));
      assert.equal(attr(root, 'viewBox'), `0 0 ${f.width} ${f.height}`);
      assert.match(f.svg, new RegExp(`<rect [^>]*width="${f.width}" height="${f.height}"[^>]*fill="${p.page}"`));
      assert.doesNotMatch(f.svg, /var\(--|color-mix\(/);
      assert.match(f.svg, /<\/svg>$/);
    }
  });

  // proves: export_self_explaining
  test('carries the title, the legend and the footer as text, escaped', () => {
    const f = framed(
      INNER,
      { ...TEXT, title: 'R&D <draft>', subtitle: 'everything within 2 steps of "Alice"' },
      PALETTES.light,
    );
    assert.match(f.svg, />R&amp;D &lt;draft&gt;</);
    assert.match(f.svg, /everything within 2 steps of &quot;Alice&quot;/);
    for (const label of ['Place', 'Cafe']) assert.match(f.svg, new RegExp(`>${label}<`));
    assert.match(f.svg, /From Trips\/Lisbon\.md, exported 11 Oct 2026/);
    assert.match(f.svg, /<title>R&amp;D &lt;draft&gt;<\/title>/);
  });

  // proves: export_self_explaining
  test('draws the legend’s swatches in the colours it is given', () => {
    const f = framed(INNER, TEXT, PALETTES.light);
    const swatches = [...f.svg.matchAll(/<rect class="legend-swatch"[^>]*>/g)].map((m) => m[0]);
    assert.equal(swatches.length, 2);
    assert.match(swatches[0], /fill="#f8dfeb"[^>]*stroke="#a8336c"/);
    assert.match(swatches[1], /fill="#e9e3fc"[^>]*stroke="#6346bb"/);
  });

  // proves: export_self_explaining
  test('uses the locked style’s font and sizes: the title at the font size, the rest at the edge and caption sizes', () => {
    const f = framed(INNER, { ...TEXT, subtitle: 'a reading' }, PALETTES.light);
    const text = (s) => new RegExp(`<text[^>]*>(?:<tspan[^>]*>)?${s}`).exec(f.svg)?.[0];
    assert.equal(attr(text('trip'), 'font-size'), px(STYLE.font_size));
    assert.match(text('trip'), /font-weight="bold"/);
    assert.equal(attr(text('a reading'), 'font-size'), px(STYLE.edge_font_size));
    assert.equal(attr(text('Place'), 'font-size'), px(STYLE.edge_font_size));
    assert.equal(attr(text('From Trips'), 'font-size'), px(STYLE.kind_font_size));
    for (const t of f.svg.match(/<text\b[^>]*>/g)) assert.ok(attr(t, 'font-family').startsWith(STYLE.font), t);
  });

  // proves: export_fixed_theme
  test('writes its text in the palette’s fixed colours', () => {
    for (const theme of ['light', 'dark']) {
      const p = PALETTES[theme];
      const f = framed(INNER, { ...TEXT, subtitle: 'a reading' }, p);
      const fills = new Set([...f.svg.matchAll(/<text[^>]*\bfill="([^"]*)"/g)].map((m) => m[1]));
      assert.deepEqual([...fills].sort(), [p.muted, p.text].sort(), theme);
    }
  });

  // proves: export_self_explaining
  test('puts the drawing inside, at its natural size and below the title, with the footer under it', () => {
    const f = framed(INNER, TEXT, PALETTES.light);
    const nested = /<svg x="([\d.]+)" y="([\d.]+)" width="200" height="100" viewBox="0.00 0.00 150.00 75.00"/.exec(
      f.svg,
    );
    assert.ok(nested, 'the drawing is nested with its own viewBox');
    const [x, y] = [Number(nested[1]), Number(nested[2])];
    assert.ok(x >= 0 && x + 200 <= f.width);
    const titleY = Number(/<text[^>]* y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?trip/.exec(f.svg)[1]);
    const footY = Number(/<text[^>]* y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)?From Trips/.exec(f.svg)[1]);
    assert.ok(titleY < y, 'the title is above the drawing');
    assert.ok(y + 100 < footY, 'the footer is below it');
    assert.ok(footY < f.height);
    assert.match(f.svg, /<g id="node1" class="node">/);
    // the drawing’s own root, with its max-width style and background, is not carried over
    assert.doesNotMatch(f.svg, /max-width|filter:none/);
  });

  // proves: export_self_explaining
  test('is never narrower than the least width, and as wide as a wider drawing', () => {
    assert.equal(framed(INNER, TEXT, PALETTES.light).width, FRAME_MIN_WIDTH);
    const wide = framed({ ...INNER, width: 900 }, TEXT, PALETTES.light);
    assert.ok(wide.width >= 900);
  });

  // proves: export_self_explaining
  test('a long reading and a long path wrap onto more lines, and a long legend onto more rows, within the width', () => {
    const long = {
      title: 'trip',
      subtitle: 'everything within 3 steps of the place we stayed in Lisbon before the long drive north '.repeat(3),
      legend: Array.from({ length: 24 }, (_, i) => ({ label: `Kind number ${i}`, fill: '#f8dfeb', stroke: '#a8336c' })),
      footer: `From ${'Archive/Travel/2026/Portugal/'.repeat(4)}Lisbon.md, exported 11 Oct 2026`,
    };
    const f = framed(INNER, long, PALETTES.light);
    assert.ok((f.svg.match(/<tspan/g) ?? []).length >= 4, 'wrapped');
    const rows = new Set([...f.svg.matchAll(/<rect class="legend-swatch"[^>]* y="([\d.]+)"/g)].map((m) => m[1]));
    assert.ok(rows.size >= 3, 'rows');
    for (const m of f.svg.matchAll(/<rect class="legend-swatch"[^>]* x="([\d.]+)"/g)) assert.ok(Number(m[1]) < f.width);
    // the same text in a roomier frame takes fewer lines
    const roomy = framed({ ...INNER, width: 1600 }, long, PALETTES.light);
    assert.ok((roomy.svg.match(/<tspan/g) ?? []).length < (f.svg.match(/<tspan/g) ?? []).length);
  });

  // proves: export_self_explaining
  test('wide characters, East Asian and emoji, count as about one em each, so titles and legends wrap in time', () => {
    const lines = (svg, size) =>
      [
        ...svg.matchAll(new RegExp(`<text[^>]*font-size="${size}"[^>]*>((?:<tspan[^>]*>[^<]*</tspan>)+)</text>`, 'g')),
      ].flatMap((m) => [...m[1].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => t[1]));
    const wide = FRAME_MIN_WIDTH - 32;
    for (const title of [
      '京都の旅の計画と記録のまとめ'.repeat(4),
      'ｆｕｌｌ－ｗｉｄｔｈ　ｔｅｘｔ'.repeat(4),
      '🙂🌍🚀✨'.repeat(12),
      '한국어로 쓴 제목입니다'.repeat(4),
    ]) {
      const f = framed(INNER, { ...TEXT, title }, PALETTES.light);
      const said = lines(f.svg, px(STYLE.font_size));
      assert.ok(said.length >= 2, title);
      for (const line of said)
        assert.ok(
          [...line].length * ((STYLE.font_size * 4) / 3) <= wide,
          `${line}: ${[...line].length} wide characters`,
        );
    }
    // the legend wraps a long wide label too
    const legend = [{ label: '京都の旅の計画と記録のまとめ'.repeat(3), fill: '#f8dfeb', stroke: '#a8336c' }];
    const rows = lines(framed(INNER, { ...TEXT, legend }, PALETTES.light).svg, px(STYLE.edge_font_size));
    assert.ok(rows.length >= 2);
    for (const line of rows) assert.ok([...line].length * ((STYLE.edge_font_size * 4) / 3) <= wide - 20, line);
    // plain letters are not made wider
    const plain = framed(INNER, { ...TEXT, title: 'a'.repeat(30) }, PALETTES.light);
    assert.equal(lines(plain.svg, px(STYLE.font_size)).length, 1);
  });

  // proves: export_self_explaining
  test('with no subtitle and no legend, there is no gap left for them', () => {
    const bare = framed(INNER, { title: 'trip', legend: [], footer: 'x' }, PALETTES.light);
    const full = framed(INNER, { ...TEXT, subtitle: 'a reading' }, PALETTES.light);
    assert.ok(bare.height < full.height);
    assert.doesNotMatch(bare.svg, /legend-swatch/);
  });

  // proves: export_fixed_theme
  test('refuses a palette with no page of its own: an export reads the same outside Obsidian', () => {
    assert.throws(() => framed(INNER, TEXT, PALETTES.obsidian), /fixed palette/);
  });
});

describe('the date', () => {
  // proves: export_self_explaining
  test('is said with its month named', () => {
    assert.equal(saidDate('2026-10-11'), '11 Oct 2026');
    assert.equal(saidDate('2026-01-05'), '5 Jan 2026');
    assert.equal(saidDate('2027-12-31'), '31 Dec 2027');
  });

  // proves: export_self_explaining
  test('is passed through as given when it is not a day', () => {
    for (const odd of ['yesterday', '2026-13-40', '']) assert.equal(saidDate(odd), odd);
  });
});
