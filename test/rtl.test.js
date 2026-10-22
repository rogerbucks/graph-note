// Right to left (editor spec §42, rtl_mirrors). The style sheets say sides by where reading starts and ends, never left
// or right. So the interface mirrors in a right-to-left language with no rule of its own. The only rules left on a
// physical side are those placed at a point measured on the screen. That point is the same in either direction. Each
// is listed here with why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHEETS = ['styles.css', 'packages/claude-code/page/page.css'];

/** The rules placed at a point measured on the screen, by sheet and selector: these keep a physical side. */
const PLACED = {
  'styles.css': {
    '.thoughtknot-table': 'laid over the drawing, whose coordinates are the screen’s',
    '.thoughtknot-svg': 'the drawing itself, moved by the zoom in screen coordinates',
    '.thoughtknot-view > .thoughtknot-details.thoughtknot-sheet': 'set from the drawing’s measured place',
    '.is-dock-left > .thoughtknot-sheet-resizer':
      'the bar on the side of a sheet the plugin placed on the left as seen',
    '.is-dock-right > .thoughtknot-sheet-resizer':
      'the bar on the side of a sheet the plugin placed on the right as seen',
    '.thoughtknot-viewport > .thoughtknot-pointer': 'set at the point the pointer is',
    '.thoughtknot-quick-info': 'set beside the thing pointed at, measured on the screen',
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

/** The roots of the interface's views, by file: each is set to read in the host's direction as it is made. */
const ROOTS = {
  'packages/core/src/display/graph-view/graph-view.ts': 'a drawing’s card',
  'packages/core/src/display/editor/editor-layout.ts': 'the edit pane',
  'packages/core/src/display/graph-view/full-screen.ts': 'full screen, made on the page’s body',
  'packages/core/src/display/graph-view/quick-info.ts': 'the tooltip, made on the page’s body',
  'packages/claude-code/page/page-main.ts': 'the browser page, as a whole',
  'packages/obsidian/src/style-block.ts': 'a style block’s fold',
  'packages/obsidian/src/step-block.ts': 'a step’s card',
  'packages/obsidian/src/ai/send-dialog.ts': 'the AI send dialog',
  'packages/obsidian/src/links/link-host.ts': 'the dialog before leaving Obsidian for a link',
};

describe('the interface reads in the host’s direction', () => {
  test('each view’s root is set to the host’s direction as it is made', () => {
    for (const [file, what] of Object.entries(ROOTS))
      assert.match(
        readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
        /readInHostDirection\(/,
        `${what} (${file})`,
      );
  });

  test('the drawing keeps the screen’s direction, as it is laid out and walked by arrow keys in the screen’s coordinates', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\n\.thoughtknot-svg \{([^}]*)\}/.exec(css)?.[1] ?? '';
    assert.match(rule, /direction: ltr;/);
  });
});
