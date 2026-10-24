// The 3D view's painters, in a real browser (editor spec §53, scale_space_view).
// - WebGL 2 paints the overview as a city with no error. Its blocks cover the same parts of the picture as the 2D
//   canvas painter's do: their shading differs, so only where they paint is compared.
// - The drawing on screen is read as marks (svg-marks.ts): boxes, groups and links, with the theme's colours. A
//   thing's label is its name, the largest words in its box, not the kind written small above it.
// - Things laid out in space as balls (space-spread.ts) are painted the same way, by both painters.
// - WebGPU builds its shaders with no error, and a frame paints with no error, of blocks and of balls. Its picture is not read back here, as
//   in gpu-painters.test.js: in software, Chrome reads a WebGPU canvas back blank.
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

/** Chrome's switches to paint with WebGL 2 and WebGPU in software. */
const SOFTWARE = [
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPU',
  '--use-webgpu-adapter=swiftshader',
];

/** The page's script: lifts an overview into a city and paints it with the painter named. */
const PAGE = `
import { overviewOf } from './packages/core/src/overview.ts';
import { orbitFit, spaceMatrix, spaceOf } from './packages/core/src/space-view.ts';
import { paintsOf, pickPainter } from './packages/core/src/display/graph-view/mark-painter.ts';
import { webgl2SpacePainter } from './packages/core/src/display/graph-view/space-painter.ts';
import { canvasSpacePainter } from './packages/core/src/display/graph-view/space-canvas-painter.ts';
import { webgpuSpacePainter } from './packages/core/src/display/graph-view/space-gpu-painter.ts';
import { marksOfSvg } from './packages/core/src/display/graph-view/svg-marks.ts';
import { spreadSpace } from './packages/core/src/space-spread.ts';
import { PALETTES } from './packages/core/src/palette.ts';
const made = { devices: [], shaders: [] };
if (window.GPUAdapter) {
  const request = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await request.apply(this, args);
    made.devices.push(device);
    const shader = device.createShaderModule.bind(device);
    device.createShaderModule = (d) => {
      const m = shader(d);
      made.shaders.push(m);
      return m;
    };
    return device;
  };
}
// things laid out in space as balls (space-spread.ts): a ring, each thing linked to the next and to one across
function balls(count) {
  const marks = [];
  for (let i = 0; i < count; i++) marks.push({ id: 't' + i, kind: 'box', style: 'kind.' + (i % 4), of: 'k' + i, x: 0, y: 0, width: 1, height: 1 });
  for (let i = 0; i < count; i++) {
    marks.push({ id: 'e' + i, kind: 'link', style: 'link', points: [[0, 0], [1, 1]], from: 'k' + i, to: 'k' + ((i + 1) % count) });
    marks.push({ id: 'x' + i, kind: 'link', style: 'link', points: [[0, 0], [1, 1]], from: 'k' + i, to: 'k' + ((i * 7 + 3) % count) });
  }
  return spreadSpace(marks).space;
}
function city(count) {
  if (count < 0) return balls(-count);
  const groups = Array.from({ length: count }, (_, i) => ({
    id: 'group:g' + i, label: 'Group ' + i, by: 'links',
    keys: Array.from({ length: 50 + ((i * 37) % 450) }, (_, k) => 'g' + i + '_' + k),
  }));
  const between = groups.slice(1).map((_, i) => ({ from: i, to: i + 1, links: 3 }));
  const laid = overviewOf({ by: 'links', groups, between });
  return spaceOf(laid.marks, { by: 'size', sizes: new Map(groups.map((g) => [g.id, g.keys.length])) });
}
const W = 400, H = 300;
window.paintCity = async (count) => {
  const space = city(count), orbit = orbitFit(space, W / H), paints = paintsOf(PALETTES.light), out = {};
  const matrix = spaceMatrix(orbit, W / H, orbit.distance);
  for (const [name, make] of [['canvas', canvasSpacePainter], ['webgl2', webgl2SpacePainter]]) {
    const canvas = document.body.appendChild(document.createElement('canvas'));
    const painter = await pickPainter(canvas, [make]);
    if (!painter) continue;
    painter.resize(W, H, 1);
    for (let frame = 0; frame < 5; frame++) painter.paint(space, matrix, paints);
    const error = name === 'webgl2' ? canvas.getContext('webgl2').getError() : 0;
    const img = new Image();
    await new Promise((done) => ((img.onload = done), (img.src = canvas.toDataURL())));
    const copy = document.createElement('canvas');
    copy.width = W;
    copy.height = H;
    const ctx = copy.getContext('2d');
    ctx.drawImage(img, 0, 0);
    out[name] = { kind: painter.kind, error, width: W, height: H, pixels: Array.from(ctx.getImageData(0, 0, W, H).data) };
  }
  return out;
};
// a drawing as Graphviz writes it: a group holding one of two things, and a link between them
window.readSvg = () => {
  const holder = document.body.appendChild(document.createElement('div'));
  holder.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><g class="graph">
    <g class="cluster" id="clust1"><title>cluster_team</title><polygon fill="rgb(220, 230, 250)" stroke="rgb(40, 60, 120)" points="10,10 150,10 150,120 10,120"/></g>
    <g class="node" id="node1"><title>ada</title><polygon fill="rgb(200, 240, 200)" stroke="rgb(0, 100, 0)" points="20,20 120,20 120,60 20,60"/><text x="70" y="45" font-size="14" fill="rgb(10, 10, 10)">Ada</text></g>
    <g class="node" id="node2"><title>bob</title><ellipse fill="rgb(200, 240, 200)" stroke="rgb(0, 100, 0)" cx="230" cy="150" rx="40" ry="20"/><text x="230" y="140" font-size="9" fill="rgb(10, 10, 10)">PERSON</text><text x="230" y="155" font-size="14" fill="rgb(10, 10, 10)">Bob</text></g>
    <g class="edge" id="edge1"><title>ada&#45;&gt;bob</title><path fill="none" stroke="rgb(90, 90, 90)" d="M70,60 C100,100 160,140 190,150"/><polygon points="186,144 196,151 185,154"/><text x="130" y="110" font-size="10">KNOWS</text></g>
    <g class="edge" id="edge4"><title>cy&#45;&gt;ada</title><path fill="none" stroke="rgb(90, 90, 90)" d="M255,40 C200,40 150,40 120,40"/><polygon points="252,36 262,40 252,44"/></g>
    <g class="edge" id="edge2"><title>bob:w&#45;&gt;ada</title><path fill="none" stroke="rgb(90, 90, 90)" d="M190,150 C160,140 100,100 70,60"/></g>
    <g class="node" id="node3" data-key="cy" aria-label="Person: Cy"><polygon fill="rgb(200, 240, 200)" stroke="rgb(0, 100, 0)" points="250,20 290,20 290,50 250,50"/><text x="270" y="40" font-size="14" fill="rgb(10, 10, 10)">Cy</text></g>
    <g class="edge" id="edge3" data-link="2"><path fill="none" stroke="rgb(90, 90, 90)" d="M232,131 C240,100 260,80 268,52"/></g>
  </g></svg>\`;
  const { marks, paints } = marksOfSvg(holder.querySelector('svg'));
  holder.remove();
  return marks.map((m) => ({ ...m, paint: paints(m.style) }));
};
window.checkWebgpu = async () => {
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const painter = await webgpuSpacePainter(canvas);
  if (!painter) return null;
  const device = made.devices.at(-1);
  const messages = (await made.shaders.at(-1).getCompilationInfo()).messages.filter((m) => m.type === 'error');
  device.pushErrorScope('validation');
  painter.resize(200, 100, 2);
  for (const space of [city(30), balls(30)]) {
    const orbit = orbitFit(space, 2);
    painter.paint(space, spaceMatrix(orbit, 2, orbit.distance), paintsOf(PALETTES.light));
  }
  const error = await device.popErrorScope();
  painter.destroy();
  return { kind: painter.kind, shaderErrors: messages.map((m) => m.message), paintError: error?.message ?? null };
};
`;

/** Whether each 20 by 20 part of a picture is mostly painted. */
function coverage({ width, height, pixels }) {
  const out = [];
  for (let y = 0; y < height; y += 20)
    for (let x = 0; x < width; x += 20) {
      let filled = 0;
      for (let dy = 0; dy < 20; dy++)
        for (let dx = 0; dx < 20; dx++) if (pixels[((y + dy) * width + x + dx) * 4 + 3] > 0) filled++;
      out.push(filled > 200);
    }
  return out;
}

describe("the 3D view's painters, in a real browser", () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the 3D painters are checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the 3D painters, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let browser, folder;
  before(async () => {
    if (why) return;
    const bundle = await build({
      stdin: { contents: PAGE, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
    });
    browser = await startChrome({ chrome, width: 500, height: 400, scale: 1, flags: SOFTWARE });
    // a page of its own, as WebGPU is only given to a secure page, and about:blank is not one
    folder = mkdtempSync(join(tmpdir(), 'space-painters-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    writeFileSync(
      join(folder, 'page.html'),
      '<!doctype html><title>3D painters</title><script src="page.js"></script>',
    );
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  test('WebGL 2 paints the city with no error, where the 2D canvas paints it', options, async () => {
    // a city of 20 and of 300 groups, and 40 and 400 things laid out in space as balls
    for (const count of [20, 300, -40, -400]) {
      const { canvas, webgl2 } = JSON.parse(await browser.run(`paintCity(${count}).then(JSON.stringify)`));
      assert.equal(webgl2?.kind, 'webgl2');
      assert.equal(webgl2.error, 0, 'no WebGL error');
      const a = coverage(canvas),
        b = coverage(webgl2);
      const painted = a.filter(Boolean).length;
      // balls leave space between them, so they cover less of the picture than a city does
      assert.ok(painted > (count > 0 ? 40 : 4), `the canvas painted ${count}: ${painted} parts`);
      const differ = a.filter((v, i) => v !== b[i]).length;
      assert.ok(differ <= a.length * 0.05, `${count} groups: ${differ} of ${a.length} parts differ`);
    }
  });

  test("the drawing on screen is read as marks, with each one's colours from the theme", options, async () => {
    const marks = JSON.parse(await browser.run('JSON.stringify(readSvg())'));
    const byId = new Map(marks.map((m) => [m.id, m]));
    const ada = byId.get('t:ada'),
      bob = byId.get('t:bob'),
      team = byId.get('g:cluster_team'),
      link = marks.find((m) => m.kind === 'link');
    assert.deepEqual([ada.x, ada.y, ada.width, ada.height], [20, 20, 100, 40]);
    assert.equal(ada.group, team.id, 'a thing inside a group is in it');
    assert.equal(bob.group, undefined);
    assert.deepEqual([link.from, link.to], ['ada', 'bob'], 'the link names its ends by its title');
    const port = byId.get('e:edge2');
    assert.deepEqual([port.from, port.to], ['bob', 'ada'], 'a port after a colon is left off its end');
    assert.ok(link.points.length > 2);
    assert.equal(link.name, 'KNOWS', "a link's words are read with it");
    // a link drawn backwards (dir=back) has its arrowhead at its first point: it points from its last
    const back = byId.get('e:edge4');
    assert.deepEqual([back.from, back.to], ['ada', 'cy'], 'the arrowhead shows the way it points');
    assert.deepEqual(back.points[0], [120, 40]);
    assert.deepEqual(ada.paint, { fill: 'rgb(200, 240, 200)', line: 'rgb(0, 100, 0)', text: 'rgb(10, 10, 10)' });
    assert.equal(byId.get('l:ada').text, 'Ada');
    // a thing drawn with its kind above its name, in smaller letters, is labelled by its name (Roger, 23 Oct 2026)
    assert.equal(byId.get('l:bob').text, 'Bob');
    assert.equal(byId.get('l:bob').size, 14);
    // the plugin's own drawing names a thing by data-key, not by a title, and its links have no title
    assert.equal(byId.get('t:cy')?.name, 'Person: Cy', 'a thing is said aloud as its card says it');
    const untitled = byId.get('e:edge3');
    assert.deepEqual(
      [untitled.from, untitled.to],
      ['bob', 'cy'],
      'a link with no title is joined to the things at its ends',
    );
  });

  test('WebGPU builds its shaders and paints the city with no error', options, async (t) => {
    const checked = JSON.parse(
      await browser.run(`checkWebgpu().then(JSON.stringify, (e) => JSON.stringify({ dropped: String(e) }))`),
    );
    if (!checked) return t.skip('this Chrome gives no WebGPU adapter');
    // software WebGPU may drop its instance while a check waits; that is this Chrome's fault, never the painter's
    if (/Instance (dropped|reference)/.test(checked.dropped ?? ''))
      return t.skip(`this Chrome's WebGPU: ${checked.dropped}`);
    assert.deepEqual(checked, { kind: 'webgpu', shaderErrors: [], paintError: null });
  });
});
