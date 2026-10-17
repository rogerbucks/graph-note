// Right to left (editor spec §42, rtl_mirrors): the style sheets say sides by where reading starts and ends, never left or
// right, so the interface mirrors in a right-to-left language with no rule of its own. The only rules left on a physical
// side are those placed at a point measured on the screen, which is the same in either direction: each is listed here
// with why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHEETS = ['styles.css', 'packages/claude-code/page/page.css'];

/** The rules placed at a point measured on the screen, by sheet and selector: these keep a physical side. */
const PLACED = {
  'styles.css': {
    '.graph-note-table': 'laid over the drawing, whose coordinates are the screen’s',
    '.graph-note-svg': 'the drawing itself, moved by the zoom in screen coordinates',
    '.graph-note-view > .graph-note-details.graph-note-sheet': 'set from the drawing’s measured place',
    '.graph-note-viewport > .graph-note-pointer': 'set at the point the pointer is',
    '.graph-note-quick-info': 'set beside the thing pointed at, measured on the screen',
  },
  'packages/claude-code/page/page.css': {},
};

const PHYSICAL =
  /^\s*((?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|left|right|float|clear|text-align)\s*:\s*([^;]+);/;

/** Each declaration on a physical side, as `selector → property: value`, with its sheet's rules read in order. */
function physicalSides(sheet) {
  const text = readFileSync(new URL(`../${sheet}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  let selector = '';
  for (const line of text.split('\n')) {
    const open = /^([^{}]+)\{\s*$/.exec(line);
    if (open) selector = open[1].trim();
    const m = PHYSICAL.exec(line);
    if (!m) continue;
    const [, property, value] = m;
    // text-align, float and clear are physical only when they name a side
    if (['text-align', 'float', 'clear'].includes(property) && !/\b(left|right)\b/.test(value)) continue;
    found.push({ selector, property, value: value.trim() });
  }
  return found;
}

describe('the style sheets mirror in a right-to-left language', () => {
  for (const sheet of SHEETS)
    test(`${sheet} says sides by reading direction, except where a rule is placed at a measured point`, () => {
      const stray = physicalSides(sheet)
        .filter((d) => !Object.hasOwn(PLACED[sheet], d.selector))
        .map((d) => `${d.selector} → ${d.property}: ${d.value}`);
      assert.deepEqual(
        stray,
        [],
        'use margin-inline-start, padding-inline-end, inset-inline-start, text-align: start…',
      );
    });

  test('every rule listed as placed at a measured point is still in its sheet, with a reason', () => {
    for (const sheet of SHEETS)
      for (const [selector, why] of Object.entries(PLACED[sheet])) {
        assert.ok(
          physicalSides(sheet).some((d) => d.selector === selector),
          `${selector} keeps no physical side: take it off the list`,
        );
        assert.ok(why.length > 10, selector);
      }
  });
});
