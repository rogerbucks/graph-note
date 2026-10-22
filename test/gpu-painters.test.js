// The painters on the graphics chip, in a real browser (editor spec §53, scale_gpu_painters).
// - WebGL 2: the overview of a few hundred groups is painted by it and by the 2D canvas painter, and the pictures are
//   compared. Each part of the picture, 20 by 20 pixels, must be the same colour within a little. Lines are smoothed a
//   little differently.
// - WebGPU: its shaders must build with no error, and a frame of every kind of mark must paint with no error. Its
//   picture is not compared here: in software, Chrome reads a WebGPU canvas back blank until another page has painted.
//   It was compared by hand on 22 Oct 2026, and matched as WebGL 2 does.
//
// Chrome paints in software here (SwiftShader), so the pictures are checked, never the speed. Chrome is the one
// THOUGHTKNOT_CHROME names, or the first on the PATH. Where none is found the cases skip, except in CI. A Chrome that
// gives no WebGPU adapter, or drops its WebGPU while the check waits, skips only the WebGPU case, saying so.
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

/** The page's script: paints an overview with the painter named and gives back its picture as numbers. */
const PAGE = `
import { overviewOf } from './packages/core/src/overview.ts';
import { MarkIndex } from './packages/core/src/mark-index.ts';
import { canvasPainter, paintsOf, pickPainter } from './packages/core/src/display/graph-view/mark-painter.ts';
import { webgl2Painter } from './packages/core/src/display/graph-view/gl-painter.ts';
import { webgpuPainter } from './packages/core/src/display/graph-view/gpu-painter.ts';
import { PALETTES } from './packages/core/src/palette.ts';
const MAKERS = [['canvas', canvasPainter], ['webgl2', webgl2Painter]];
// WebGPU's device and shaders, caught as the painter makes them, so their errors can be read
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
window.checkWebgpu = async () => {
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const painter = await webgpuPainter(canvas);
  if (!painter) return null;
  const device = made.devices.at(-1);
  const messages = (await made.shaders.at(-1).getCompilationInfo()).messages.filter((m) => m.type === 'error');
  device.pushErrorScope('validation');
  painter.resize(200, 100, 2);
  painter.paint(MARKS_OF_EVERY_KIND, { x: 0, y: 0, scale: 1.5 }, paintsOf(PALETTES.light));
  const error = await device.popErrorScope();
  painter.destroy();
  return { kind: painter.kind, shaderErrors: messages.map((m) => m.message), paintError: error?.message ?? null };
};
const MARKS_OF_EVERY_KIND = [
  { id: 'g', kind: 'group', style: 'group', x: 2, y: 2, width: 120, height: 60 },
  { id: 'r', kind: 'box', style: 'thing', x: 10, y: 10, width: 30, height: 20 },
  { id: 'e', kind: 'box', style: 'thing', x: 50, y: 10, width: 30, height: 20, shape: 'ellipse' },
  { id: 'd', kind: 'box', style: 'thing', x: 90, y: 10, width: 30, height: 20, shape: 'diamond' },
  { id: 'l', kind: 'link', style: 'link', points: [[25, 30], [65, 50]] },
  { id: 'c', kind: 'link', style: 'link', points: [[65, 30], [70, 40], [90, 40], [105, 30]], curve: true },
  { id: 'a', kind: 'arrowhead', style: 'link', x: 105, y: 30, angle: -30, size: 6 },
];
window.paintAll = async (count) => {
  const groups = Array.from({ length: count }, (_, i) => ({
    id: 'group:g' + i, label: 'Group ' + i, by: 'links',
    keys: Array.from({ length: 50 + ((i * 37) % 450) }, (_, k) => 'g' + i + '_' + k),
  }));
  const between = groups.slice(1).map((_, i) => ({ from: i, to: i + 1, links: 3 }));
  const laid = overviewOf({ by: 'links', groups, between });
  const W = 400, H = 300, scale = Math.min(W / laid.space.width, H / laid.space.height);
  const marks = new MarkIndex(laid)
    .visible({ x: 0, y: 0, width: W / scale, height: H / scale }, scale)
    .filter((m) => m.kind !== 'label');
  const camera = { x: 0, y: 0, scale }, paints = paintsOf(PALETTES.light), out = {};
  // each painter in turn, read back in the task it painted in
  for (const [name, make] of MAKERS) {
    const canvas = document.body.appendChild(document.createElement('canvas'));
    const painter = await pickPainter(canvas, [make]);
    if (!painter) continue;
    painter.resize(W, H, 1);
    for (let frame = 0; frame < 10; frame++) painter.paint(marks, camera, paints);
    const img = new Image();
    await new Promise((done) => ((img.onload = done), (img.src = canvas.toDataURL())));
    const copy = document.createElement('canvas');
    copy.width = W;
    copy.height = H;
    const ctx = copy.getContext('2d');
    ctx.drawImage(img, 0, 0);
    out[name] = { kind: painter.kind, width: W, height: H, pixels: Array.from(ctx.getImageData(0, 0, W, H).data) };
  }
  return out;
};
`;

/** The mean colour of each 20 by 20 part of a picture, as [r, g, b, a] lists. */
function parts({ width, height, pixels }) {
  const out = [];
  for (let y = 0; y < height; y += 20)
    for (let x = 0; x < width; x += 20) {
      const sum = [0, 0, 0, 0];
      for (let dy = 0; dy < 20; dy++)
        for (let dx = 0; dx < 20; dx++)
          for (let k = 0; k < 4; k++) sum[k] += pixels[((y + dy) * width + x + dx) * 4 + k];
      out.push(sum.map((s) => s / 400));
    }
  return out;
}

/** The parts of `b` whose mean colour is more than `most` from `a`'s, in any channel. */
function differing(a, b, most = 40) {
  const pa = parts(a),
    pb = parts(b);
  return pa.filter((p, i) => p.some((v, k) => Math.abs(v - pb[i][k]) > most)).length;
}

describe('the painters on the graphics chip, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the painters are checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the painters, and found no Chrome');
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
    folder = mkdtempSync(join(tmpdir(), 'gpu-painters-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    writeFileSync(join(folder, 'page.html'), '<!doctype html><title>Painters</title><script src="page.js"></script>');
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  const pictures = new Map();
  const paintAll = async (count) => {
    if (!pictures.has(count))
      pictures.set(count, JSON.parse(await browser.run(`paintAll(${count}).then(JSON.stringify)`)));
    return pictures.get(count);
  };
  /** How many parts of a picture are painted at all. */
  const painted = (picture) => parts(picture).filter((p) => p[3] > 0).length;

  test('WebGL 2 paints the overview as the 2D canvas does', options, async () => {
    for (const count of [20, 300]) {
      const { canvas, webgl2 } = await paintAll(count);
      assert.equal(webgl2?.kind, 'webgl2');
      assert.ok(painted(canvas) > 100, 'the canvas painted the overview');
      assert.equal(differing(canvas, webgl2), 0, `${count} groups`);
    }
  });

  test('WebGPU builds its shaders and paints every kind of mark with no error', options, async (t) => {
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
