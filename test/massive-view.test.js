// A graph too large to draw, shown as its overview on the card, in a real browser: massive-view.ts. Editor spec
// §53, scale_massive_card and scale_search_fly.
// - The overview is painted by a painter the device has, with a box for each group, and is named for screen readers.
// - Typing in its search box lists matches by name from every group, the best first.
// - Choosing one lays out only its group, puts it in the group's box, and flies the view to the thing.
//
// Chrome paints in software here (SwiftShader). Chrome is the one THOUGHTKNOT_CHROME names, or the first on the PATH.
// Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

/** Chrome's switches to paint with WebGL 2 in software. */
const SOFTWARE = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

/** Keeps the first error the page throws, so a broken page says why. */
const CAUGHT = "addEventListener('error', (e) => (window.failed ??= String(e.error?.stack ?? e.message)));";

/** The page's script: a graph of 3,000 things in chains of 20, shown as its overview, its layouts faked. */
const PAGE = `
import { installDomHelpers } from './packages/core/src/display/dom-helpers.ts';
import { massiveView } from './packages/core/src/display/graph-view/massive-view.ts';
import { PALETTES } from './packages/core/src/palette.ts';
installDomHelpers(window);
const boxes = [], links = [];
for (let i = 0; i < 3000; i++) {
  boxes.push({ key: 't' + i, kind: 'Thing', text: i === 1234 ? 'Needle in the stack' : 'Thing ' + i });
  if (i % 20) links.push({ from: 't' + (i - 1), type: 'Thing', reading: 'next', to: 't' + i });
}
const drawing = { graph: 'Big', boxes, links, estimates: [] };
window.parts = [];
// a layout as the worker gives it: a row of boxes, five to a line, each with its name
function layout(part) {
  window.parts.push(part.boxes.map((b) => b.key));
  const nodes = part.boxes.map((b, i) => {
    const x = (i % 5) * 120 + 10, y = Math.floor(i / 5) * 60 + 10;
    return '<g class="node"><title>' + b.key + '</title><polygon fill="rgb(200, 240, 200)" stroke="rgb(0, 100, 0)" points="' +
      x + ',' + y + ' ' + (x + 100) + ',' + y + ' ' + (x + 100) + ',' + (y + 40) + ' ' + x + ',' + (y + 40) +
      '"/><text x="' + (x + 50) + '" y="' + (y + 25) + '" font-size="14" fill="rgb(10, 10, 10)">' + b.text + '</text></g>';
  });
  const width = 610, height = Math.ceil(part.boxes.length / 5) * 60 + 20;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><g class="graph">' +
    nodes.join('') + '</g></svg>';
  return Promise.resolve({ svg, rankdir: 'TB', width, height });
}
const card = document.body.appendChild(document.createElement('div'));
card.style.width = '600px';
window.view = massiveView(card, drawing, { graph: 'Big', palette: PALETTES.light, layout });
window.stage = () => {
  const stage = card.querySelector('.thoughtknot-massive-stage');
  return { label: stage.getAttribute('aria-label'), width: stage.clientWidth, height: stage.clientHeight };
};
window.type = (text) => {
  const input = card.querySelector('.thoughtknot-massive-search');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return [...card.querySelectorAll('.thoughtknot-massive-list [role=option]')].map((li) => li.textContent);
};
// the ink of the words canvas: the groups' names and counts. A canvas on the graphics chip is not read back here,
// as in space-painters.test.js: in software, Chrome may read it back blank
window.inked = () => {
  const words = card.querySelectorAll('canvas')[1];
  const data = words.getContext('2d').getImageData(0, 0, words.width, words.height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
};
// presses a key on the overview a number of times, and gives the ink of its words once painted again
window.press = async (key, times) => {
  const stage = card.querySelector('.thoughtknot-massive-stage');
  for (let i = 0; i < times; i++) stage.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return inked();
};
// the ink of the words in the middle of the view, a band 160 by 30 pixels
window.wordsInMiddle = () => {
  const words = card.querySelectorAll('canvas')[1];
  const ctx = words.getContext('2d'), w = words.width, h = words.height;
  const data = ctx.getImageData(w / 2 - 80, h / 2 - 15, 160, 30).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
};
window.flyToNeedle = async () => {
  const [match] = view.find('needle');
  await view.flyTo(match);
  return { match, view: view.view(), said: card.querySelector('.thoughtknot-massive-said').textContent };
};
`;

describe('a graph too large to draw, as its overview, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the overview is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the overview, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let browser, folder;
  const run = async (js) => JSON.parse(await browser.run(`Promise.resolve(${js}).then(JSON.stringify)`));
  before(async () => {
    if (why) return;
    const bundle = await build({
      stdin: { contents: PAGE, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
    });
    browser = await startChrome({ chrome, width: 700, height: 900, scale: 1, flags: SOFTWARE });
    folder = mkdtempSync(join(tmpdir(), 'massive-view-'));
    // the script is written into the page itself, so an error it throws is read in full, not as a bare Script error
    const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
    const css = `<link rel="stylesheet" href="${pathToFileURL(join(ROOT, 'styles.css')).href}">`;
    writeFileSync(
      join(folder, 'page.html'),
      `<!doctype html><title>Overview</title>${css}<body><script>${CAUGHT}</script><script>${script}</script>`,
    );
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
    const failed = await browser.run('window.failed ?? null');
    if (failed) throw new Error(`the page failed: ${failed}`);
    // the painters are picked a moment after the overview is made
    for (let i = 0; i < 50 && (await run('view.painter()')) === null; i++) await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  test('the overview is painted and named, with how many things and groups it holds', options, async () => {
    const stage = await run('stage()');
    assert.ok(stage.width > 100 && stage.height > 100, `the stage has room: ${JSON.stringify(stage)}`);
    assert.match(stage.label, /^Overview of Big: 3,000 things in \d+ groups\./);
    assert.ok(['webgpu', 'webgl2', 'canvas'].includes(await run('view.painter()')), 'a painter was picked');
    // fitted, the names of 150 groups are too small to read, so they are left out; a little closer, they are painted
    assert.ok((await run("press('+', 4)")) > 1000, "the groups' names are painted");
    await run("press('Home', 1)");
    assert.deepEqual(await run('parts'), [], 'nothing is laid out until it is asked for');
  });

  test('typing lists matches by name from every group, the best first', options, async () => {
    const listed = await run("type('needle')");
    assert.equal(listed.length, 1);
    assert.match(listed[0], /^Needle in the stack · /);
    const many = await run("type('thing 12')");
    assert.equal(many.length, 8, 'at most eight are listed');
    assert.match(many[0], /^Thing 12 · /, 'the whole name first');
    assert.deepEqual(await run("type('')"), []);
  });

  test('choosing a match lays out only its group, and flies the view to the thing', options, async () => {
    const { match, view, said } = await run('flyToNeedle()');
    const parts = await run('parts');
    assert.equal(parts.length, 1, 'one group is laid out');
    assert.ok(parts[0].includes('t1234'), 'the one the thing is in');
    assert.ok(parts[0].length < 3000, 'never the whole graph');
    assert.match(said, /^Needle in the stack, in .+/, 'where it went is said aloud');
    assert.equal(match.key, 't1234');
    // the thing's name is now painted in the middle of the view, big enough to read
    assert.ok(view.scale > 0.05, `zoomed in: ${view.scale}`);
    assert.ok((await run('wordsInMiddle()')) > 50, 'its name is in the middle');
    await run('flyToNeedle()');
    assert.equal((await run('parts')).length, 1, 'a group opened once is not laid out again');
  });
});
