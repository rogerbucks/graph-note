// Pointer targets and reflow, in a real browser (editor spec §41, a11y_targets_reflow_auto; WCAG 2.2 SC 2.5.8 and
// 1.4.10). Every view of every host is opened in a headless Chrome, as wide as a desktop and 320 CSS pixels wide: each
// control a pointer can take must be at least 24 by 24, the page must never scroll sideways at 320, and every control
// seen wide must still be there narrow, on the page or in a box of its own that scrolls to it. The drawing's own boxes
// are two-dimensional content and a link inside a sentence is inline, so both are left out of the size rule (WCAG's own
// exceptions). The judging is tried first on measures made up here, then on planted faults in a real page, so a pass
// means it looked. The Obsidian host is its harness (packages/obsidian/harness), its views the user guide's own states
// (scripts/wiki-screens.mjs); the Claude Code host is its page served by the real server over a vault on disk.
//
// Chrome is the one GRAPH_NOTE_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser cases skip with one line, except in CI, where a missing Chrome fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

const reflow = () => import('../scripts/targets-reflow.mjs');

/** A control as the page measures it: its name, its box, and where it sits. */
const control = (name, over = {}) => ({ name, width: 44, height: 44, left: 10, right: 54, ...over });
const measure = (controls, over = {}) => ({ width: 1400, scrollWidth: 1400, controls, ...over });

describe('judging what a page measured', () => {
  test('a control under 24 by 24 CSS pixels is named, with its size', async () => {
    const { findings, MIN_TARGET } = await reflow();
    assert.equal(MIN_TARGET, 24);
    const small = control('button Compare with…', { width: 112, height: 21 });
    assert.deepEqual(
      findings('card', measure([small, control('button Fit')]), measure([small, control('button Fit')])),
      [
        'card: button Compare with… is 112 by 21 CSS pixels, under 24 by 24 (wide)',
        'card: button Compare with… is 112 by 21 CSS pixels, under 24 by 24 (narrow)',
      ],
    );
    const edge = control('button Edge', { width: 24, height: 24 });
    assert.deepEqual(findings('card', measure([edge]), measure([edge], { width: 320, scrollWidth: 320 })), []);
  });

  test('the drawing’s boxes and a link inside a sentence are left out of the size rule', async () => {
    const { findings } = await reflow();
    const boxes = [
      control('g Thing 1', { width: 18, height: 12, drawing: true }),
      control('a the guide', { width: 60, height: 17, inline: true }),
    ];
    assert.deepEqual(findings('card', measure(boxes), measure(boxes, { width: 320, scrollWidth: 320 })), []);
  });

  test('a page wider than 320 CSS pixels at 320 is named, with how wide it is', async () => {
    const { findings, NARROW } = await reflow();
    assert.equal(NARROW, 320);
    const narrow = measure([control('button Fit')], { width: 320, scrollWidth: 693 });
    assert.deepEqual(findings('card', measure([control('button Fit')]), narrow), [
      'card: at 320 CSS pixels the page is 693 wide, so it scrolls sideways',
    ]);
  });

  test('a control seen wide that is gone narrow, or out of reach, is named', async () => {
    const { findings } = await reflow();
    const wide = measure([control('button Fit'), control('button Export'), control('button Find')]);
    const narrow = measure([control('button Fit'), control('button Export', { left: 330, right: 374 })], {
      width: 320,
      scrollWidth: 320,
    });
    assert.deepEqual(findings('card', wide, narrow), [
      'card: at 320 CSS pixels button Export is out of reach, at 330 to 374',
      'card: at 320 CSS pixels button Find is gone',
    ]);
  });

  test('a control in a box of its own that scrolls sideways is in reach', async () => {
    const { findings } = await reflow();
    const wide = measure([control('button Fit')]);
    const narrow = measure([control('button Fit', { left: 330, right: 374, scrolls: true })], {
      width: 320,
      scrollWidth: 320,
    });
    assert.deepEqual(findings('card', wide, narrow), []);
  });
});

describe('judging a view the narrow layout splits, or keeps off-screen on purpose', () => {
  test('a control placed off-screen at every width, as a skip link is until focused, is not out of reach', async () => {
    const { findings } = await reflow();
    const skip = { left: -999, right: -860 };
    const wide = measure([control('a Skip to the note', skip)]);
    const narrow = measure([control('a Skip to the note', skip)], { width: 320, scrollWidth: 320 });
    assert.deepEqual(findings('page', wide, narrow), []);
  });

  test('a control behind one of the tabs a phone’s layout shows instead is there', async () => {
    const { findings } = await reflow();
    const wide = measure([control('button Fit'), control('textarea Text'), control('button Done')]);
    const at = { width: 320, scrollWidth: 320 };
    const tabs = [measure([control('textarea Text')], at), measure([control('button Fit')], at)];
    assert.deepEqual(findings('page', wide, tabs), ['page: at 320 CSS pixels button Done is gone']);
  });
});

describe('in a real browser, every view of every host', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.GRAPH_NOTE_CHROME);
  } catch {
    why = 'no Chrome found here (set GRAPH_NOTE_CHROME): pointer targets and reflow are checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check pointer targets and reflow, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 300_000 };

  let built;
  before(() => {
    built = mkdtempSync(join(tmpdir(), 'targets-harness-'));
    execFileSync(process.execPath, [join(ROOT, 'packages/obsidian/harness/build.mjs'), built], { stdio: 'ignore' });
  });
  after(() => rmSync(built, { recursive: true, force: true }));

  test('the check looks: a small control and a wide box planted in a real page are found', options, async () => {
    const { checkHarness } = await reflow();
    const planted = [
      `document.querySelector('#note').prepend(Object.assign(document.createElement('button'), { textContent: 'Tiny', style: 'width:10px;height:10px;padding:0' }))`,
      `document.querySelector('#note').append(Object.assign(document.createElement('div'), { style: 'width:600px;height:4px' }))`,
    ];
    const found = await checkHarness(built, { chrome, views: [{ name: 'planted', steps: planted }] });
    assert.ok(
      found.some((f) => /^planted: button Tiny is 10 by 10 CSS pixels/.test(f)),
      found.join('\n'),
    );
    assert.ok(
      found.some((f) => /^planted: at 320 CSS pixels the page is \d+ wide/.test(f)),
      found.join('\n'),
    );
  });

  test('the Obsidian host: every control 24 by 24 at least, and every view reflows at 320', options, async () => {
    const { checkHarness } = await reflow();
    assert.deepEqual(await checkHarness(built, { chrome }), []);
  });

  test('the Claude Code host: every control 24 by 24 at least, and its page reflows at 320', options, async () => {
    const { checkEditorPage } = await reflow();
    const { launcherFor, modVault, opens } = await import('../packages/claude-code/test/editor-mod-support.js');
    const where = modVault();
    const { launcher } = launcherFor(where);
    await opens(launcher, where.plan);
    assert.deepEqual(await checkEditorPage(launcher.link, { chrome }), []);
  });
});
