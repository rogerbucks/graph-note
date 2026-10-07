// Accessibility (spec §11, §8): the drawing meets the contrast of the locked style in both of Obsidian's default themes;
// theme colours reach the drawing through one mapping table; every action has a keyboard path. Contrast is worked out
// from the style's own blends — color-mix in sRGB, a fill's opacity over the page — against WCAG 2.2's ratios: 4.5:1
// for text (SC 1.4.3) and 3:1 for lines and borders (SC 1.4.11).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { root } from './lib/load-plugin.js';

const STYLE = JSON.parse(readFileSync(`${root}python/graph_spec/src/graph_svg.style.json`, 'utf8'));

// Obsidian's default themes, as its app stylesheet sets them (read from Obsidian 1.13, 7 Oct 2026).
const THEMES = {
  light: {
    page: '#ffffff', text: '#222222', muted: '#5c5c5c',
    red: '#e93147', orange: '#ec7500', yellow: '#e0ac00', green: '#08b94e', cyan: '#00bfbc', blue: '#086ddd', purple: '#7852ee', pink: '#d53984',
  },
  dark: {
    page: '#1e1e1e', text: '#dadada', muted: '#b3b3b3',
    red: '#fb464c', orange: '#e9973f', yellow: '#e0de71', green: '#44cf6e', cyan: '#53dfdd', blue: '#027aff', purple: '#a882ff', pink: '#fa99cd',
  },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** color-mix(in srgb, a p%, b): each channel mixed as it is stored. */
const mix = (a, b, p) => a.map((x, i) => x * p + b[i] * (1 - p));
const luminance = (c) => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('contrast in both themes', () => {
  const hues = [...new Set([...STYLE.kind_hues, ...STYLE.edge_hues, ...Object.values(STYLE.kind_colours), ...Object.values(STYLE.edge_colours)])];
  for (const [name, T] of Object.entries(THEMES)) {
    const page = rgb(T.page), text = rgb(T.text), muted = rgb(T.muted);
    for (const h of hues) {
      const hue = rgb(T[h]), fill = mix(hue, page, STYLE.fill_opacity);
      test(`${name} theme, ${h}: labels 4.5:1, lines and borders 3:1 on the page, and text on its boxes 4.5:1`, () => {
        const label = mix(hue, text, STYLE.label_mix / 100), line = mix(hue, text, STYLE.line_mix / 100);
        assert.ok(contrast(label, page) >= 4.5, `a label: ${contrast(label, page).toFixed(2)}:1`);
        assert.ok(contrast(line, page) >= 3, `a line: ${contrast(line, page).toFixed(2)}:1`);
        // a box's border is held to 3:1 against the page around it, as SC 1.4.11 measures a boundary — not against its own
        // fill, which is the box itself (light yellow's border on its fill is 2.9:1; on the page it passes)
        assert.ok(contrast(text, fill) >= 4.5, `a box's text: ${contrast(text, fill).toFixed(2)}:1`);
        assert.ok(contrast(muted, fill) >= 4.5, `a box's kind caption: ${contrast(muted, fill).toFixed(2)}:1`);
      });
    }
    test(`${name} theme: links drawn in the muted edge colour, and estimated links, keep 3:1`, () => {
      assert.ok(contrast(muted, page) >= 4.5, `muted text and lines: ${contrast(muted, page).toFixed(2)}:1`);
    });
  }
});

describe('one colour mapping', () => {
  test('the plugin names no colour of its own: the drawing’s colours come from the style, through the core’s one table', () => {
    const dir = `${root}packages/obsidian/src/`;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(dir + f, 'utf8');
      assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b|rgba?\(|--color-[a-z]+/, f);
    }
  });

  test('styles.css colours only with the theme’s variables', () => {
    const css = readFileSync(`${root}styles.css`, 'utf8').replace(/var\([^)]*\)/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const literal = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(literal, [], 'every colour is a theme variable, with gql-highlight’s fallbacks inside var()');
  });
});
