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
import { installHost } from './packages/core/src/display/host.ts';
import { massiveView } from './packages/core/src/display/graph-view/massive-view.ts';
import { PALETTES } from './packages/core/src/palette.ts';
import { PaneDrawing } from './packages/core/src/display/editor/pane-drawing.ts';
import { readNote } from './packages/core/src/drawing.ts';
import { DEFAULT_SETTINGS } from './packages/core/src/settings.ts';
installDomHelpers(window);
installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
// a clock that moves 16 ms a frame. A glide or a flight then takes the same number of frames on a busy machine. The
// frames are counted, never the time
let clock = performance.now();
const nextFrame = window.requestAnimationFrame.bind(window);
performance.now = () => clock;
window.requestAnimationFrame = (run) => nextFrame(() => run((clock += 16)));
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
// every third thing is done, the rest open
const props = (key) => ({ status: Number(key.slice(1)) % 3 ? 'open' : 'done' });
// each filter chosen, as the host is told it to save
window.chose = [];
const chose = (keep) => window.chose.push(keep);
window.view = massiveView(card, drawing, { graph: 'Big', palette: PALETTES.light, layout, props, chose });
// a second card, which starts with a saved filter: what it is named and which values are ticked
window.saved = () => {
  const again = document.body.appendChild(document.createElement('div'));
  again.style.width = '600px';
  massiveView(again, drawing, { graph: 'Big', palette: PALETTES.light, layout, props, chosen: { status: ['done'] } });
  const ticked = [...again.querySelectorAll('.thoughtknot-massive-facet input:checked')];
  const label = again.querySelector('.thoughtknot-massive-stage').getAttribute('aria-label');
  again.remove();
  return { label, ticked: ticked.map((b) => b.nextSibling.textContent) };
};
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
// the filter lists as shown: each facet's name, and each value with its count
window.filters = () =>
  [...card.querySelectorAll('.thoughtknot-massive-facet')].map((f) => ({
    name: f.querySelector('legend').textContent,
    values: [...f.querySelectorAll('label')].map((l) => l.textContent),
  }));
// ticks or unticks a value of a facet, and gives what was said
window.tick = (facet, value) => {
  const f = [...card.querySelectorAll('.thoughtknot-massive-facet')].find((x) => x.querySelector('legend').textContent === facet);
  const label = [...f.querySelectorAll('label')].find((l) => l.querySelector('span').textContent === value);
  const box = label.querySelector('input');
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change'));
  return card.querySelector('.thoughtknot-massive-said').textContent;
};
// the scales the view takes, a frame at a time, until it has held still for three frames
window.scales = async () => {
  const seen = [view.view().scale];
  for (let still = 0; still < 3 && seen.length < 200; ) {
    await new Promise((r) => requestAnimationFrame(r));
    const scale = view.view().scale;
    still = scale === seen.at(-1) ? still + 1 : 0;
    if (!still) seen.push(scale);
  }
  return seen;
};
// waits until the view has held still for three frames: a flight or a glide is over
window.settled = async () => {
  let last = JSON.stringify(view.view());
  for (let still = 0, frames = 0; still < 3 && frames < 400; frames++) {
    await new Promise((r) => requestAnimationFrame(r));
    const now = JSON.stringify(view.view());
    still = now === last ? still + 1 : 0;
    last = now;
  }
};
// presses a button of the grow bar by its name, and gives what was said once the view has flown
window.grow = async (name) => {
  const button = card.querySelector('.thoughtknot-massive-grow [aria-label="' + name + '"]');
  button.click();
  for (let i = 0; i < 100 && view.view() === window.lastView; i++) await new Promise((r) => setTimeout(r, 20));
  await window.settled();
  window.lastView = view.view();
  return card.querySelector('.thoughtknot-massive-said').textContent;
};
// presses Back or Forward, and gives what the overview shows then: what was said, the view and the values ticked
window.trail = async (name) => {
  card.querySelector('.thoughtknot-massive-tools [aria-label="' + name + '"]').click();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const at = (n) => card.querySelector('.thoughtknot-massive-tools [aria-label="' + n + '"]').disabled;
  return {
    said: card.querySelector('.thoughtknot-massive-said').textContent,
    view: view.view(),
    ticked: [...card.querySelectorAll('.thoughtknot-massive-facet input:checked')].map((b) => b.nextSibling.textContent),
    label: card.querySelector('.thoughtknot-massive-stage').getAttribute('aria-label'),
    back: !at('Back'),
    forward: !at('Forward'),
  };
};
// the edit pane's drawing of pets, which its host will not lay out: the banner, then the overview, saved filter and all.
// Then the dogs are ticked too, and what the host was asked to save is given
window.pane = async () => {
  const lines = ['// graph: pets'];
  for (let i = 0; i < 30; i++) lines.push('(p' + i + ':' + (i % 2 ? 'Cat' : 'Dog') + " {name: 'Pet " + i + "'}),");
  lines.push('(p0)-[:KNOWS]->(p1)');
  const texts = [lines.join('\\n'), "// graph: pets_style · STYLE pets\\n(filter_1:Filter {keep: 'Kind: Cat'})"];
  const saved = [];
  const host = {
    settings: () => DEFAULT_SETTINGS,
    layout: () => Promise.resolve({ reason: 'too-large', limit: 'text-lines', count: 32, most: 10 }),
    palette: PALETTES.light,
    saveFilter: (graph, keep) => saved.push([graph, keep]),
  };
  const el = document.body.appendChild(document.createElement('div'));
  el.style.width = '600px';
  const on = { edit() {}, select() {}, replace: () => false };
  new PaneDrawing(host).redraw(el, readNote(texts), { graph: 'pets', text: texts[0] }, () => false, on);
  for (let i = 0; i < 50 && !el.querySelector('.thoughtknot-massive'); i++) await new Promise((r) => setTimeout(r, 20));
  const stage = el.querySelector('.thoughtknot-massive-stage');
  const boxes = [...el.querySelectorAll('.thoughtknot-massive-facet input')];
  const shown = {
    banner: !!el.querySelector('.thoughtknot-banner'),
    label: stage && stage.getAttribute('aria-label'),
    ticked: boxes.filter((b) => b.checked).map((b) => b.nextSibling.textContent),
  };
  const dog = boxes.find((b) => b.nextSibling.textContent === 'Dog');
  dog.checked = true;
  dog.dispatchEvent(new Event('change'));
  el.remove();
  return { ...shown, saved };
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

  test(
    'from the thing flown to, the picture grows one ring of neighbours at a time, and steps back',
    options,
    async () => {
      // in its chain of 20, t1234 links to t1233 and t1235 only
      assert.equal(await run("grow('Show neighbours')"), 'Needle in the stack and the 2 things near it');
      const parts = await run('parts');
      assert.deepEqual(
        [...parts.at(-1)].sort(),
        ['t1233', 't1234', 't1235'],
        'only it and its neighbours are laid out',
      );
      assert.equal(await run("grow('Show neighbours')"), 'Needle in the stack and the 4 things near it');
      assert.deepEqual([...(await run('parts')).at(-1)].sort(), ['t1232', 't1233', 't1234', 't1235', 't1236']);
      assert.equal(await run("grow('One step back')"), 'Needle in the stack and the 2 things near it');
      assert.ok((await run('wordsInMiddle()')) > 50, 'the grown picture is painted where the view looks');
    },
  );
  test(
    'filters list each value with its count; ticking one keeps only those things, which glide to their places',
    options,
    async () => {
      const shown = await run('filters()');
      assert.deepEqual(
        shown.map((f) => f.name),
        ['Kind', 'status'],
      );
      assert.deepEqual(shown[1].values, ['open2,000', 'done1,000']);
      assert.equal(await run("tick('status', 'done')"), '1,000 things kept');
      assert.deepEqual(await run('chose'), [{ status: ['done'] }], 'the host is told the filter, to save it');
      const glided = await run('scales()');
      assert.ok(glided.length > 2, 'the groups glide through frames between, never jumping');
      assert.ok(glided.at(-1) > glided[0], 'the view follows them in, as fewer things leave a smaller overview');
      assert.ok((await run("press('+', 4)")) > 1000, 'the groups kept are painted where they end');
      await run("press('Home', 1)");
      assert.match((await run('stage()')).label, /^Overview of Big: 1,000 things in \d+ groups\./);
      assert.deepEqual(await run("view.find('needle')"), [], 'the needle is open, so it is filtered out');
      assert.deepEqual((await run('filters()'))[0].values, ['Thing1,000'], 'the kinds count what the status keeps');
      assert.equal(await run("tick('status', 'done')"), '3,000 things kept', 'unticked, every thing is back');
      assert.equal((await run("view.find('needle')")).length, 1);
    },
  );
  test('back and forward return to each earlier picture, and a new step drops the steps ahead', options, async () => {
    const flown = await run('flyToNeedle()');
    const grown = await run("grow('Show neighbours').then((said) => ({ said, view: view.view() }))");
    assert.equal(await run("tick('status', 'open')"), '2,000 things kept');
    await run('scales()');
    const back = await run("trail('Back')");
    assert.equal(back.said, grown.said, 'back to the grown picture');
    assert.deepEqual(back.view, grown.view);
    assert.deepEqual(back.ticked, [], 'and to its filters: none');
    assert.match(back.label, /^Overview of Big: 3,000 things/);
    assert.equal(back.forward, true);
    assert.deepEqual((await run('chose')).at(-1), { status: ['open'] }, 'going back is not a filter chosen');
    const flownAgain = await run("trail('Back')");
    assert.equal(flownAgain.said, flown.said);
    assert.deepEqual(flownAgain.view, flown.view);
    const ahead = await run("trail('Forward').then(() => trail('Forward'))");
    assert.equal(ahead.said, '2,000 things kept', 'forward to the filter again');
    assert.deepEqual(ahead.ticked, ['open']);
    assert.match(ahead.label, /^Overview of Big: 2,000 things/);
    assert.equal(ahead.forward, false);
    await run("trail('Back')");
    await run('flyToNeedle()');
    const after = await run("trail('Back').then(() => trail('Forward'))");
    assert.equal(after.forward, false, 'the new step dropped the filter ahead of it');
    assert.deepEqual(after.ticked, []);
  });
  // proves: scale_massive_card
  test(
    'the edit pane shows a graph too large to lay out as its overview, and saves the filter chosen',
    options,
    async () => {
      const { banner, label, ticked, saved } = await run('pane()');
      assert.ok(banner, 'the banner still says why it is not drawn');
      assert.match(label, /^Overview of pets: 15 things in \d+ groups\./, 'it starts with the saved filter');
      assert.deepEqual(ticked, ['Cat']);
      assert.deepEqual(saved, [['pets', { Kind: ['Cat', 'Dog'] }]], 'the host is asked to save the new one');
    },
  );
  // proves: scale_filter_live
  test('a card drawn with a saved filter starts with it ticked, keeping only its things', options, async () => {
    const { label, ticked } = await run('saved()');
    assert.match(label, /^Overview of Big: 1,000 things in \d+ groups\./);
    assert.deepEqual(ticked, ['done']);
  });
});
