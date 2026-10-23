// The test languages, laid out in a real browser (editor spec §42, pseudo_locales_checked). Every view of every host
// is opened in a headless Chrome set to `en-XA`, every word accented and 40 per cent longer. Then it is opened in
// `ar-XB`, the same read right to left. The hosts follow the browser's language. It fails on words cut off by their box, or
// drawn over other words in the same layer of the page. A menu or a sheet set over the page is a layer of its own.
// The judging is tried first on measures made up here. Then it is tried on planted faults in a real page, so a pass
// means it looked. The Obsidian host is its harness (packages/obsidian/harness), in the user guide's states
// (scripts/wiki-screens.mjs). The Claude Code host is its page served by the real server over a vault on disk.
// test/pseudo-locales.test.js checks the same languages where no layout is needed.
//
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser cases skip with one line, except in CI, where a missing Chrome fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

const layout = () => import('../scripts/pseudo-layout.mjs');

/** A run of words as the page measures it: its words, one box, the box that clips it if any, and its layer. */
const run = (text, rect, over = {}) => ({ text, rects: [rect], clip: null, layer: 0, cut: false, ...over });
const at = (left, top, right, bottom) => ({ left, top, right, bottom });
const measured = (runs, language = 'en-XA') => ({ language, direction: 'ltr', runs });

describe('judging what a page measured in a test language', () => {
  test('words that run past a box that hides what does not fit are named', async () => {
    const { findings } = await layout();
    const cut = run('⟦Ḗẋƥǿřŧ ·····⟧', at(10, 10, 120, 24), { clip: at(10, 10, 80, 24) });
    const fits = run('⟦Ƒīŧ ··⟧', at(10, 30, 60, 44), { clip: at(10, 30, 80, 44) });
    assert.deepEqual(findings('card', 'en-XA', measured([cut, fits])), [
      'card, en-XA: "⟦Ḗẋƥǿřŧ ·····⟧" is cut off by its box',
    ]);
  });

  test('words drawn over other words in the same layer are named; a layer over the page may cover them', async () => {
    const { findings } = await layout();
    const a = run('⟦Ƒīŧ ··⟧', at(10, 10, 80, 24));
    const b = run('⟦Ƒīƞḓ ··⟧', at(60, 10, 140, 24));
    const menu = run('⟦Ḗḓīŧ ··⟧', at(10, 10, 100, 24), { layer: 1 });
    const apart = run('⟦Ḓǿƞḗ ··⟧', at(150, 10, 220, 24));
    assert.deepEqual(findings('card', 'en-XA', measured([a, b, menu, apart])), [
      'card, en-XA: "⟦Ƒīŧ ··⟧" and "⟦Ƒīƞḓ ··⟧" are drawn over each other',
    ]);
  });

  test('a box that only touches another, within two pixels, is no fault', async () => {
    const { findings } = await layout();
    const a = run('⟦Ƒīŧ ··⟧', at(10, 10, 81, 24), { clip: at(10, 10, 80, 24) });
    const b = run('⟦Ƒīƞḓ ··⟧', at(79, 10, 140, 24));
    assert.deepEqual(findings('card', 'en-XA', measured([a, b])), []);
  });

  test('a view the browser did not show in the test language is named', async () => {
    const { findings } = await layout();
    assert.deepEqual(findings('card', 'ar-XB', measured([], 'en-US')), [
      'card, ar-XB: the browser said en-US, so the view was not in the language',
    ]);
  });

  test('a view’s steps find each control by its words in the test language', async () => {
    const { inLanguage } = await layout();
    const { pseudoWords } = await import('../packages/core/src/pseudo-words.ts');
    const { SOURCE_WORDS } = await import('../packages/core/src/source-words.ts');
    const xa = pseudoWords(SOURCE_WORDS, 'en-XA');
    const key = Object.keys(SOURCE_WORDS).find((k) => SOURCE_WORDS[k] === 'Export');
    assert.equal(inLanguage(`q('[aria-label="Export"]')`, 'en-XA'), `q('[aria-label="${xa[key]}"]')`);
    assert.equal(inLanguage('t === "Export"', 'en-XA'), `t === ${JSON.stringify(xa[key])}`);
    assert.equal(inLanguage('t === "Not a catalogue word"', 'en-XA'), 't === "Not a catalogue word"');
  });
});

describe('in a real browser, every view of every host, in each test language', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the test languages are laid out in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must lay out the test languages, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 300_000 };

  let built;
  before(() => {
    built = mkdtempSync(join(tmpdir(), 'pseudo-harness-'));
    execFileSync(process.execPath, [join(ROOT, 'packages/obsidian/harness/build.mjs'), built], { stdio: 'ignore' });
  });
  after(() => rmSync(built, { recursive: true, force: true }));

  test(
    'the check looks: words cut off and words drawn over others, planted in a real page, are found',
    options,
    async () => {
      const { checkHarness } = await layout();
      const planted = [
        `document.querySelector('#note').prepend(Object.assign(document.createElement('div'), { textContent: 'Too long for its box', style: 'width:40px;overflow:hidden;white-space:nowrap' }))`,
        `document.querySelector('#note').prepend(Object.assign(document.createElement('div'), { innerHTML: '<span>First words</span><span style="margin-left:-50px">Second words</span>' }))`,
      ];
      const found = await checkHarness(built, { chrome, views: [{ name: 'planted', steps: planted }] });
      for (const language of ['en-XA', 'ar-XB']) {
        assert.ok(
          found.includes(`planted, ${language}: "Too long for its box" is cut off by its box`),
          found.join('\n'),
        );
        assert.ok(
          found.includes(`planted, ${language}: "First words" and "Second words" are drawn over each other`),
          found.join('\n'),
        );
      }
    },
  );

  test('the Obsidian host: no words cut off or drawn over others, in any view', options, async () => {
    const { checkHarness } = await layout();
    assert.deepEqual(await checkHarness(built, { chrome }), []);
  });

  test('the Claude Code host: no words cut off or drawn over others, in any view', options, async () => {
    const { checkEditorPage } = await layout();
    const { launcherFor, modVault, opens } = await import('../packages/claude-code/test/editor-mod-support.js');
    const where = modVault();
    const { launcher } = launcherFor(where);
    await opens(launcher, where.plan);
    assert.deepEqual(await checkEditorPage(launcher.link, { chrome }), []);
  });
});
