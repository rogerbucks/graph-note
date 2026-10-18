// The interface's design tokens (editor spec §44, ui_theme_tokens): one set of named tokens, `--gn-*`, for colour, type,
// spacing, corners and depth, which every rule of both style sheets reads, and nothing else of a host's. Each sheet maps
// its host's theme to the tokens in one block, and nowhere else: the plugin's sheet reads Obsidian's theme through the
// core's table (theme-tokens.ts, `OBSIDIAN_TOKEN_MAP`), and the browser page's reads the theme it is built with
// (theme-css.ts). So a theme changes the interface with no code, and the interface looks native in each host.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME_TOKENS, OBSIDIAN_TOKEN_MAP } from '../packages/core/src/theme-tokens.ts';
import { PALETTES } from '../packages/core/src/palette.ts';
import { themeCss } from '../packages/claude-code/page/theme-css.ts';

/** Each sheet, with the selector of its one mapping block. */
const SHEETS = {
  'styles.css': ".thoughtknot, [class^='thoughtknot-'], [class*=' thoughtknot-'], [class^='gql-'], [class*=' gql-']",
  'packages/claude-code/page/page.css': ':root',
};

/**
 * The properties a sheet reads that are not the theme's: an element's own measures, which the code sets on it as it is
 * drawn (`--thoughtknot-*`), and the icon file a page's icon rule names (`--gn-icon-image`, esbuild.page.mjs).
 */
const OWN = /^--thoughtknot-[a-z0-9-]+$|^--gn-icon-image$/;

const read = (sheet) => readFileSync(new URL(`../${sheet}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** A sheet's mapping block, as its declarations by name, and the rest of the sheet without it. */
function split(sheet) {
  const text = read(sheet);
  // each rule's selector follows the end of the rule before it, or starts the sheet
  const blocks = [...text.matchAll(/(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/g)].filter(
    (m) => m[1].replace(/\s+/g, ' ').trim() === SHEETS[sheet],
  );
  assert.equal(blocks.length, 1, `${sheet} has one mapping block, under ${SHEETS[sheet]}`);
  const [block] = blocks;
  const declared = Object.fromEntries(
    block[2]
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
  );
  return { declared, rest: text.replace(block[0], '') };
}

const NAMES = Object.keys(THEME_TOKENS);
const reads = (text) => [...text.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]);

describe('the interface is styled through the design tokens alone', () => {
  for (const sheet of Object.keys(SHEETS)) {
    test(`every rule of ${sheet} reads a design token or an element's own measure, never a host's variable`, () => {
      const stray = reads(split(sheet).rest).filter((n) => !NAMES.includes(n) && !OWN.test(n));
      assert.deepEqual([...new Set(stray)], [], 'name the --gn-* token the mapping block gives it');
    });

    test(`${sheet} defines every design token in its one mapping block, and none anywhere else`, () => {
      const { declared, rest } = split(sheet);
      assert.deepEqual(Object.keys(declared).sort(), [...NAMES].sort());
      // the system's forced colours and more contrast give tokens anew in a block each (test/forced-colours.test.js)
      const system = /@media \((?:forced-colors: active|prefers-contrast: more)\) \{[^{}]*\{[^{}]*\}\s*\}/g;
      const elsewhere = [...rest.replace(system, '').matchAll(/(--gn-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
      assert.deepEqual(elsewhere, [], 'a token is mapped from the host’s theme in one place');
    });
  }

  test('the plugin’s sheet maps Obsidian’s theme to the tokens by the core’s one table, and only that', () => {
    const { declared } = split('styles.css');
    assert.deepEqual(
      declared,
      Object.fromEntries(NAMES.map((n) => [n, `var(${OBSIDIAN_TOKEN_MAP[n]})`])),
      'the block in styles.css is OBSIDIAN_TOKEN_MAP, written out',
    );
  });

  test('the page’s sheet maps the theme the page is built with, which defines everything it reads in both schemes', () => {
    const { declared } = split('packages/claude-code/page/page.css');
    const theme = themeCss();
    const light = /:root\{([^}]*)\}/.exec(theme)?.[1] ?? '';
    const defined = new Set(light.split(';').map((d) => d.slice(0, d.indexOf(':'))));
    for (const [name, value] of Object.entries(declared)) {
      assert.match(value, /^var\(--[a-z0-9-]+\)$/, `${name} reads the page’s theme`);
      for (const n of reads(value)) assert.ok(defined.has(n), `${name}: the page’s theme defines ${n}`);
    }
    // the shared styles come into the page with their own mapping, for their own elements: it must resolve there too
    for (const n of Object.values(OBSIDIAN_TOKEN_MAP)) assert.ok(defined.has(n), `the page’s theme defines ${n}`);
  });

  test('each token says what it is for and what kind of thing it is, and none takes a name the drawing uses', () => {
    const kinds = new Set(['colour', 'type', 'spacing', 'corners', 'depth', 'pointer']);
    for (const [name, t] of Object.entries(THEME_TOKENS)) {
      assert.match(name, /^--gn-[a-z][a-z0-9-]*$/);
      assert.ok(kinds.has(t.kind), `${name}: ${t.kind}`);
      assert.ok(t.says.length > 10, name);
      assert.ok(Object.hasOwn(OBSIDIAN_TOKEN_MAP, name), `${name} is mapped from Obsidian’s theme`);
    }
    assert.deepEqual(Object.keys(OBSIDIAN_TOKEN_MAP).sort(), [...NAMES].sort());
    for (const kind of ['colour', 'type', 'spacing', 'corners'])
      assert.ok(
        Object.values(THEME_TOKENS).some((t) => t.kind === kind),
        `a token of ${kind}`,
      );
    // the drawing carries its own sheet of --gn-* colours (palette.ts, systemPalette): a token must never shadow one
    const drawing = [...PALETTES.system.style.matchAll(/(--gn-[a-z0-9-]+):/g)].map((m) => m[1]);
    assert.ok(drawing.length > 4);
    assert.deepEqual(
      NAMES.filter((n) => drawing.includes(n)),
      [],
    );
  });
});
