// The details panel kept open (editor spec §24, details_always_visible, details_narrow): a setting, off by default, lets the
// details stay open beside the drawing, in a card and in the pane, showing the graph's summary while nothing is chosen;
// and a card too narrow for the panel and the drawing side by side puts the panel below the drawing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until, root } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { open as openPane } from './host/pane-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { GRAPH, show } from './host/view-notes.js';

before(() => build());

const OPEN = { settings: { detailsOpen: 'on' } };
const panelOf = (el) => el.querySelector('.graph-note-details');
const rootOf = (el) => el.querySelector('.graph-note-view');
/** The card drawn, with the setting on or off, in a note of the width given. */
async function card({ on = true, width = 700 } = {}) {
  const env = await load({ width, ...(on ? { data: OPEN } : {}) });
  const { el } = await show(env, fence(GRAPH));
  await until(() => !!el.querySelector('g.node'));
  return { env, el };
}
/** Tells every resize observer the card has, as the page does when the card changes size. */
const resized = (env) => env.doc.observers.forEach((o) => o.cb([]));

describe('details_always_visible: a setting keeps the details open, showing the graph’s summary while nothing is chosen', () => {
  test('off by default: the details are closed until something is chosen, and the setting says Off, in the Drawing section', async () => {
    const { env, el } = await card({ on: false });
    try {
      assert.equal(panelOf(el).hidden, true);
      assert.equal(rootOf(el)?.hasClass('is-details-open') ?? el.hasClass('is-details-open'), false);
      const tab = env.state.settingTabs[0];
      tab.display();
      const row = tab.containerEl
        .querySelectorAll('.setting-item')
        .find((r) => r.querySelector('.setting-item-name')?.textContent === 'Keep the details open');
      assert.ok(row, 'the setting is on the page');
      assert.equal(row.querySelector('select').value, 'off');
    } finally {
      env.uninstall();
    }
  });

  test('on: the panel is open from the start, with the graph’s summary: its things, its links and its problems, in words', async () => {
    const { env, el } = await card();
    try {
      const panel = panelOf(el);
      assert.equal(panel.hidden, false);
      const words = panel.textContent;
      assert.ok(words.includes('4 things'), words);
      assert.ok(words.includes('4 links'), words);
      assert.ok(words.includes('No problems'), words);
      assert.ok(words.includes('reader'), 'which graph it sums up');
      for (const kind of ['Question', 'Option', 'Reason']) assert.ok(words.includes(kind), kind);
    } finally {
      env.uninstall();
    }
  });

  test('choosing a thing shows its details in the panel; closing them brings the summary back, never an empty card', async () => {
    const { env, el } = await card();
    try {
      tapKey(el, 'large');
      await until(() => panelOf(el).textContent.includes('Large reader'));
      assert.ok(!panelOf(el).textContent.includes('4 things'));
      [...panelOf(el).querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Close details').click();
      assert.equal(panelOf(el).hidden, false);
      assert.ok(panelOf(el).textContent.includes('4 things'));
      assert.equal(el.querySelectorAll('g.is-selected').length, 0, 'and nothing is selected');
    } finally {
      env.uninstall();
    }
  });

  test('it is a panel in the card, never the screen-pinned sheet', async () => {
    const { env, el } = await card();
    try {
      tapKey(el, 'large');
      await until(() => panelOf(el).textContent.includes('Large reader'));
      assert.equal(panelOf(el).hasClass('graph-note-sheet'), false);
    } finally {
      env.uninstall();
    }
  });

  test('its summary is text, never HTML', () => {
    for (const file of ['details-panel.ts', 'details-summary.ts']) {
      const src = readFileSync(`${root}packages/core/src/display/graph-view/${file}`, 'utf8');
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src), file);
    }
  });

  test('in the pane too: open from the start, with the summary', async () => {
    const env = await openPane({ data: OPEN });
    try {
      await until(() => !!env.el.querySelector('g.node'));
      const panel = panelOf(env.el);
      assert.equal(panel.hidden, false);
      assert.ok(panel.textContent.includes('3 things'), panel.textContent);
    } finally {
      env.uninstall();
    }
  });
});

describe('details_narrow: where the card is too narrow, the panel goes below the drawing', () => {
  test('a wide card has the panel beside the drawing', async () => {
    const { env, el } = await card({ width: 700 });
    try {
      const top = rootOf(el) ?? el;
      assert.ok(top.hasClass('is-details-open'));
      assert.equal(top.hasClass('is-details-below'), false);
    } finally {
      env.uninstall();
    }
  });

  test('a narrow card has it below', async () => {
    const { env, el } = await card({ width: 320 });
    try {
      const top = rootOf(el) ?? el;
      assert.ok(top.hasClass('is-details-open'));
      assert.ok(top.hasClass('is-details-below'));
    } finally {
      env.uninstall();
    }
  });

  test('a card that is made narrower, or wider, puts it below, or beside, again', async () => {
    const { env, el } = await card({ width: 700 });
    try {
      const top = rootOf(el) ?? el;
      env.doc.width = 320;
      resized(env);
      assert.ok(top.hasClass('is-details-below'));
      env.doc.width = 700;
      resized(env);
      assert.equal(top.hasClass('is-details-below'), false);
    } finally {
      env.uninstall();
    }
  });

  test('the style sheet puts the drawing and the panel side by side unless it is below, where they stack', () => {
    const css = readFileSync(`${root}styles.css`, 'utf8');
    assert.match(css, /\.graph-note-view\.is-details-open:not\(\.is-details-below\)\s*\{[^}]*display:\s*flex/);
    assert.match(
      css,
      /\.graph-note-view\.is-details-open:not\(\.is-details-below\)\s*>\s*\.graph-note-details\s*\{[^}]*flex/,
    );
  });
});
