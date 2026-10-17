// Text scaling to 200 per cent (editor spec §44, text_scaling): every text of the interface is sized by a token or by its
// parent's size, so it follows the host's font size (Obsidian's setting, which its font variables carry) and the
// browser's (the page's theme in rem), as well as the browser's zoom; no line height is fixed, and no box that holds text
// has a fixed height that would clip it. The drawing's own marks are sized in its units, so they scale with its zoom.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OBSIDIAN_TOKEN_MAP, THEME_TOKENS } from '../packages/core/src/theme-tokens.ts';
import { themeCss } from '../packages/claude-code/page/theme-css.ts';
import { SHEETS, rulesOf, valueOf } from './repository/sheet-rules.js';

/** A length that does not follow the font size: pixels and points. */
const FIXED = /(?<![\w.-])\d*\.?\d+(?:px|pt)\b/;

/** The rules with a fixed height that hold no text, each with why. */
const FIXED_HEIGHT = {
  '.graph-note-image img': 'an image, shown whole within its height',
  '.graph-note-sr': 'the screen reader’s text, kept off the screen on purpose',
};

/** A rule of the drawing: its marks are in its own units, laid out with it, and scale with its zoom. */
const inDrawing = (rule) => rule.selectors.every((s) => s.startsWith('.graph-note-svg'));

describe('text scales to 200 per cent with nothing lost', () => {
  for (const sheet of SHEETS) {
    test(`${sheet} sizes every text of the interface by a token or its parent’s size, never in pixels or points`, () => {
      const fixed = rulesOf(sheet)
        .filter((r) => !inDrawing(r))
        .flatMap((r) =>
          ['font-size', 'font']
            .map((p) => [p, valueOf(r, p)])
            .filter(([, v]) => v && FIXED.test(v))
            .map(([p, v]) => `${r.selectors.join(', ')} → ${p}: ${v}`),
        );
      assert.deepEqual(fixed, [], 'size it with a --gn-font-size-* token, em, rem or per cent');
    });

    test(`${sheet} fixes no line height, and no box that holds text to a height`, () => {
      const rules = rulesOf(sheet);
      const lines = rules
        .filter((r) => FIXED.test(valueOf(r, 'line-height') ?? ''))
        .map((r) => `${r.selectors.join(', ')} → line-height: ${valueOf(r, 'line-height')}`);
      assert.deepEqual(lines, [], 'a line height is a number, so it scales with the text');
      const boxes = rules
        .filter((r) => ['height', 'max-height'].some((p) => FIXED.test(valueOf(r, p) ?? '')))
        .flatMap((r) => r.selectors)
        .filter((s) => !Object.hasOwn(FIXED_HEIGHT, s));
      assert.deepEqual(boxes, [], 'let the box grow with its text, or list it with why in FIXED_HEIGHT');
    });
  }

  test('every rule listed with a fixed height is still in its sheet', () => {
    const selectors = new Set(SHEETS.flatMap((s) => rulesOf(s)).flatMap((r) => r.selectors));
    for (const s of Object.keys(FIXED_HEIGHT)) assert.ok(selectors.has(s), s);
  });

  test('the browser page’s theme sizes its text in rem, so the browser’s own font size scales it', () => {
    const sizes = Object.keys(THEME_TOKENS)
      .filter((n) => /^--gn-(?:font-size|code-size)/.test(n))
      .map((n) => OBSIDIAN_TOKEN_MAP[n]);
    assert.ok(sizes.length >= 4);
    const theme = themeCss();
    for (const name of sizes) {
      const value = new RegExp(`${name}:([^;}]+)`).exec(theme)?.[1];
      assert.match(value ?? '', /^\d*\.?\d+rem$/, `${name}: ${value}`);
    }
  });
});
