// Right-to-left labels fit their boxes (editor spec §42, bidi_labels). The drawing is laid out in a real browser. It is
// the Claude Code host's page, served over a vault. Its note names things in Arabic, Hebrew, and both mixed with
// English. Each thing's words must sit inside its box. The judging is tried first on made-up measures. Then a label is made too long
// in a real page, so a pass means it looked.
//
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser cases skip with one line, except in CI, where a missing Chrome fails.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { findChrome } from '../scripts/chrome.mjs';

const fit = () => import('../scripts/label-fit.mjs');

const thing = (name, words) => ({ name, box: { left: 0, right: 100, top: 0, bottom: 40 }, words });
const line = (text, left, right) => ({ text, left, right, top: 10, bottom: 30 });

describe('judging what the drawing measured', () => {
  test('words that run past their box are named, with the thing', async () => {
    const { findings } = await fit();
    const measured = [
      thing('Step: שלום', [line('שלום', 10, 90)]),
      thing('Step: مرحبا', [line('STEP', 10, 40), line('مرحبا بالعالم', 10, 130)]),
    ];
    assert.deepEqual(findings(measured), ['Step: مرحبا: "مرحبا بالعالم" runs past its box']);
  });

  test('words within a unit of their box fit, and a drawing with no things is named', async () => {
    const { findings } = await fit();
    assert.deepEqual(findings([thing('Step: a', [line('a', -1, 101)])]), []);
    assert.deepEqual(findings([]), ['no thing was drawn']);
  });

  test('the note names its things in Arabic, Hebrew and both mixed with English and numbers', async () => {
    const { rtlNote, RTL_NAMES } = await fit();
    const note = rtlNote();
    for (const name of RTL_NAMES) assert.ok(note.includes(`{name: '${name}'}`), name);
    assert.match(note, /\(t0\)-\[:THEN\]->\(t1\)/);
  });
});

describe('in a real browser, the Claude Code host', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): right-to-left labels are fitted in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must fit right-to-left labels, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 300_000 };

  /** The page's link, over a vault whose note is `rtlNote()`. */
  async function rtlPage() {
    const { launcherFor, modVault, opens } = await import('../packages/claude-code/test/editor-mod-support.js');
    const { rtlNote } = await fit();
    const where = modVault();
    writeFileSync(where.plan, rtlNote());
    const { launcher } = launcherFor(where);
    await opens(launcher, where.plan);
    return launcher.link;
  }

  test('every right-to-left and mixed label sits inside its box', options, async () => {
    const { checkLabels } = await fit();
    assert.deepEqual(await checkLabels(await rtlPage(), { chrome }), []);
  });

  test('the check looks: a label made too long in a real page is found', options, async () => {
    const { checkLabels } = await fit();
    const longer = `document.querySelector('.thoughtknot-svg g.node text:last-of-type').textContent += ' ${'מילה '.repeat(20)}'`;
    const found = await checkLabels(await rtlPage(), { chrome, steps: [longer] });
    assert.ok(
      found.some((f) => /runs past its box$/.test(f)),
      found.join('\n'),
    );
  });
});
