// Printing a note (editor spec §44, print_ready). Each graph is printed whole, in print colours, with its legend. The
// checks:
// - in print, the card follows the host's print colours: Obsidian prints in its light theme, whose variables the card
//   and its drawing read. The card asks for light system colours too, and for its colours to be printed;
// - the drawing is drawn whole: not cut by its frame, nor moved or zoomed as it was on screen;
// - the card's controls are left out, as paper cannot press them, but its legends are kept.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES } from '../packages/core/src/palette.ts';
import { build } from '../packages/obsidian/test/host/load-plugin.js';
import { fence } from '../packages/obsidian/test/host/notes.js';
import { load, GRAPH, show, svgOf } from '../packages/obsidian/test/host/view-notes.js';
import { rulesOf, valueOf } from './repository/sheet-rules.js';

const PRINT = 'print';
const rules = rulesOf('styles.css').filter((r) => r.media === PRINT);
/** The last value the print rules give `property` on `selector`. */
const printed = (selector, property) =>
  rules
    .filter((r) => r.selectors.includes(selector))
    .map((r) => valueOf(r, property))
    .findLast((v) => v !== undefined)
    ?.replace(/\s*!important$/, '');

/** The parts of a card that only a person at a screen can use. */
const CONTROLS = [
  '.thoughtknot button',
  '.thoughtknot-bar',
  '.thoughtknot-card-tools',
  '.thoughtknot-details',
  '.thoughtknot-mini-map',
  '.thoughtknot-pointer',
  '.thoughtknot-find',
  '.thoughtknot-filter',
  '.thoughtknot-quick-info',
  '.thoughtknot-edit-slot',
  '.thoughtknot-shortcuts',
  '.thoughtknot-tour',
];
/** The parts that say what the drawing's colours and marks mean, which a printed graph keeps. */
const LEGENDS = ['.thoughtknot-legend', '.thoughtknot-flow-legend', '.thoughtknot-view-strip'];

describe('a printed note', () => {
  // proves: print_ready
  test('draws each card in the host’s print colours, and prints them', () => {
    const rule = rules.find((r) => r.selectors.join(', ') === '.thoughtknot');
    assert.ok(rule, 'a print block for the card');
    assert.equal(valueOf(rule, 'color-scheme'), 'light', 'light system colours');
    assert.equal(valueOf(rule, 'print-color-adjust'), 'exact', 'the colours are printed, not dropped');
    // the drawing's colours are the theme's variables, so it takes the light theme Obsidian prints in
    assert.match(PALETTES.obsidian.fill('blue'), /var\(--color-blue-rgb\)/);
    assert.match(PALETTES.obsidian.blend('blue', 50), /var\(--color-blue\)/);
  });

  // proves: print_ready
  test('draws each graph whole: not cut by its frame, nor moved or zoomed as on screen', () => {
    assert.equal(printed('.thoughtknot-viewport', 'height'), 'auto');
    assert.equal(printed('.thoughtknot-viewport', 'overflow'), 'visible');
    assert.equal(printed('.thoughtknot-viewport', 'break-inside'), 'avoid');
    assert.equal(printed('.thoughtknot-svg', 'position'), 'static');
    assert.equal(printed('.thoughtknot-svg', 'transform'), 'none');
    assert.equal(printed('.thoughtknot-svg', 'width'), '100%');
    assert.equal(printed('.thoughtknot-svg', 'height'), 'auto');
    assert.equal(printed('.thoughtknot-table', 'transform'), 'none');
  });

  // proves: print_ready
  test('leaves out the card’s controls, and keeps its legends', () => {
    for (const c of CONTROLS) assert.equal(printed(c, 'display'), 'none', c);
    for (const l of LEGENDS) assert.equal(printed(l, 'display'), undefined, `${l} is printed`);
  });
});

describe('a drawn card can be printed whole', () => {
  before(() => build());

  // proves: print_ready
  test('its drawing keeps the frame of the whole graph, so it scales to the page', async () => {
    const env = await load({ width: 300 });
    try {
      const { el } = await show(env, fence(GRAPH));
      const box = svgOf(el).getAttribute('viewBox');
      assert.match(box ?? '', /^[\d.-]+ [\d.-]+ [\d.]+ [\d.]+$/, 'a viewBox of the whole graph');
      assert.ok(svgOf(el).classList.contains('thoughtknot-svg'));
    } finally {
      env.uninstall();
    }
  });
});
