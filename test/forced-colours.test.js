// Forced colours and more contrast (editor spec §44, forced_colours): when the system forces its own colours, such as a
// high contrast theme of Windows, every view is drawn in the system's colours with nothing lost, and when it asks for more
// contrast, secondary text and lines take the full text colour. Each sheet maps the tokens by the core's tables, the
// drawing is drawn in the system's colours by its own rules, as the browser does not force a colour written on a shape,
// nothing is shown by a shadow alone, which forced colours drop, and no focus is hidden without another way of showing it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FORCED_TOKEN_COLOURS, MORE_CONTRAST_TOKENS, THEME_TOKENS } from '../packages/core/src/theme-tokens.ts';
import { PALETTES } from '../packages/core/src/palette.ts';
import { SHEETS, rulesOf, valueOf } from './repository/sheet-rules.js';

const FORCED = '(forced-colors: active)';
const MORE = '(prefers-contrast: more)';

/** The selector of each sheet's mapping block, where its tokens are given. */
const MAPPING = {
  'styles.css': ".graph-note, [class^='graph-note-'], [class*=' graph-note-'], [class^='gql-'], [class*=' gql-']",
  'packages/claude-code/page/page.css': ':root',
};

/** The system colours of CSS Color 4 a forced colour may be. */
const SYSTEM = [
  'Canvas',
  'CanvasText',
  'LinkText',
  'Highlight',
  'HighlightText',
  'GrayText',
  'ButtonFace',
  'ButtonText',
];

/** The rules that keep their own colours in forced colours, each with why: every other is forced by the browser. */
const KEEPS_OWN = {
  '.graph-note-svg':
    'the drawing, whose colours are written on each shape: drawn in the system’s colours by its own rules',
  '.graph-note-editor textarea.graph-note-text': 'the editor’s see-through field over its coloured picture',
};

/** Each rule that hides the browser's focus ring, by its first selector, and the rule that shows the focus instead. */
const FOCUS_SHOWN = {
  '.graph-note-svg g.node:focus': '.graph-note-svg g.node:focus-visible > :is(path, polygon)',
  '.graph-note-editor textarea.graph-note-text': '.graph-note-editor:focus-within',
  '.graph-note-type-list button:focus-visible': '.graph-note-type-list button:focus-visible::after',
};

const ruleWith = (rules, selector, media = '') =>
  rules.find((r) => r.media === media && r.selectors.join(', ') === selector);

describe('every view in forced colours and with more contrast', () => {
  for (const sheet of SHEETS) {
    test(`${sheet} gives every colour token its system colour in forced colours, by the core’s table`, () => {
      const rule = ruleWith(rulesOf(sheet), MAPPING[sheet], FORCED);
      assert.ok(rule, `${sheet} has a forced-colors block under ${MAPPING[sheet]}`);
      assert.deepEqual(Object.fromEntries(rule.declarations), FORCED_TOKEN_COLOURS);
    });

    test(`${sheet} gives secondary text and lines the full text colour when more contrast is asked`, () => {
      const rule = ruleWith(rulesOf(sheet), MAPPING[sheet], MORE);
      assert.ok(rule, `${sheet} has a prefers-contrast block under ${MAPPING[sheet]}`);
      assert.deepEqual(Object.fromEntries(rule.declarations), MORE_CONTRAST_TOKENS);
    });

    test(`${sheet}: whatever a shadow lifts keeps an edge when forced colours drop the shadow`, () => {
      const rules = rulesOf(sheet);
      const edged = new Set(
        rules.filter((r) => r.media === FORCED && valueOf(r, 'border')).flatMap((r) => r.selectors),
      );
      const bare = rules
        .filter((r) => r.media !== FORCED && /var\(--gn-shadow-/.test(valueOf(r, 'box-shadow') ?? ''))
        .filter((r) => !valueOf(r, 'border'))
        .flatMap((r) => r.selectors)
        .filter((s) => !edged.has(s));
      assert.deepEqual(bare, [], 'give each a border in the forced-colors block');
    });

    test(`${sheet} hides no focus ring without showing the focus another way`, () => {
      const rules = rulesOf(sheet);
      for (const rule of rules.filter((r) => ['none', '0'].includes(valueOf(r, 'outline') ?? ''))) {
        const shownBy = FOCUS_SHOWN[rule.selectors[0]];
        assert.ok(shownBy, `${rule.selectors[0]} hides the focus ring: say in FOCUS_SHOWN what shows it instead`);
        const shows = rules.find((r) => r.selectors.includes(shownBy));
        assert.ok(shows, `${shownBy} is in ${sheet}`);
        assert.ok(
          /^\d/.test(valueOf(shows, 'outline') ?? '') || valueOf(shows, 'stroke-width'),
          `${shownBy} draws an outline or a heavier line, which forced colours keep`,
        );
      }
    });
  }

  test('only the rules listed keep their own colours, and each is still in the sheet', () => {
    const kept = SHEETS.flatMap((s) => rulesOf(s))
      .filter((r) => valueOf(r, 'forced-color-adjust') === 'none')
      .flatMap((r) => r.selectors.map((selector) => ({ selector, media: r.media })));
    assert.deepEqual(kept.map((k) => k.selector).sort(), Object.keys(KEEPS_OWN).sort());
    for (const k of kept) assert.equal(k.media, FORCED, `${k.selector} keeps its own colours only in forced colours`);
  });

  test('the drawing draws each box, line and word in the system’s colours, the chosen or focused thing highlighted', () => {
    const rules = rulesOf('styles.css').filter((r) => r.media === FORCED);
    const paint = (selector, property) => valueOf(ruleWith(rules, selector, FORCED) ?? { declarations: [] }, property);
    const box = '.graph-note-svg :is(g.node, g.cluster) > :is(path, polygon, ellipse)';
    assert.equal(paint(box, 'fill'), 'Canvas !important');
    assert.equal(paint(box, 'stroke'), 'CanvasText !important');
    assert.equal(paint('.graph-note-svg g.edge > :is(path, polyline)', 'stroke'), 'CanvasText !important');
    assert.equal(paint('.graph-note-svg g.edge > polygon', 'fill'), 'CanvasText !important');
    assert.equal(paint('.graph-note-svg text:not(.graph-note-link)', 'fill'), 'CanvasText !important');
    assert.equal(
      paint('.graph-note-svg :is(g.is-selected, g.node:focus-visible) > :is(path, polygon, ellipse)', 'stroke'),
      'Highlight !important',
    );
  });

  test('the editor’s field keeps its text see-through, so the text is not shown twice, with the caret in the text colour', () => {
    const rule = ruleWith(rulesOf('styles.css'), '.graph-note-editor textarea.graph-note-text', FORCED);
    assert.equal(valueOf(rule, 'color'), 'transparent');
    assert.equal(valueOf(rule, 'caret-color'), 'CanvasText');
  });

  test('a drawing shown as an image, which no browser forces, gives every one of its colours a system colour itself', () => {
    const style = PALETTES.system.style ?? '';
    const forced = style.slice(style.indexOf(`@media ${FORCED}`));
    assert.ok(forced.startsWith('@media'), 'the drawing’s sheet has a forced-colors block');
    const named = [...style.matchAll(/(--gn-[\w-]+):/g)].map((m) => m[1]);
    const given = new Map([...forced.matchAll(/(--gn-[\w-]+):([A-Za-z]+)/g)].map((m) => [m[1], m[2]]));
    for (const name of new Set(named)) assert.ok(SYSTEM.includes(given.get(name)), `${name}: ${given.get(name)}`);
  });

  test('the tables give every colour token a system colour, and more contrast only colour tokens', () => {
    const colours = Object.keys(THEME_TOKENS).filter((n) => THEME_TOKENS[n].kind === 'colour');
    assert.deepEqual(Object.keys(FORCED_TOKEN_COLOURS).sort(), colours.sort());
    for (const [name, value] of Object.entries(FORCED_TOKEN_COLOURS)) assert.ok(SYSTEM.includes(value), name);
    for (const [name, value] of Object.entries(MORE_CONTRAST_TOKENS)) {
      assert.ok(colours.includes(name), name);
      assert.match(value, /^var\(--gn-text-normal\)$/);
    }
  });
});
