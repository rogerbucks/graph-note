// A plug-in a host did not ship, loaded from its file (editor spec §54, plugin_outside_file; API-10). The worker's script
// is the host's start and then the file. The start takes the network and every way to make code away, so the file
// cannot load more code from anywhere. Each run here is a real thread, as a browser's Worker is.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { pluginRegistry } from '../src/plugins.ts';
import { OUTSIDE_CHARACTERS, outsidePlugin, outsideProblem } from '../src/plugin-outside.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
const OUTSIDE_PATH = fileURLToPath(new URL('../src/plugin-outside.ts', import.meta.url));
const SAMPLE = readFileSync(new URL('../../../examples/sample-plugin/plugin.js', import.meta.url), 'utf8');

/**
 * A real thread whose script is a host's start, then the plug-in's body, as a browser's Worker from a Blob would be.
 * Its start seals the whole global scope; the host's port to it.
 */
function outsideThread(body) {
  const w = new Worker(
    `const { parentPort } = require('node:worker_threads');
     globalThis.postMessage = (m) => parentPort.postMessage(m);
     parentPort.on('message', (data) => globalThis.onmessage?.({ data }));
     const thoughtknotServe = require(${JSON.stringify(OUTSIDE_PATH)}).sealOutside(globalThis);
     ${body}`,
    { eval: true },
  );
  const port = { onmessage: null, onerror: null };
  w.on('message', (data) => port.onmessage?.({ data }));
  w.on('error', (e) => port.onerror?.(e));
  port.postMessage = (m) => w.postMessage(m);
  port.terminate = () => void w.terminate();
  return port;
}

/** A plug-in file whose `register` runs `body` first. */
const pluginFile = (body, top = '') => `${top}
export default {
  id: 'example.probe', version: '1.0.0', api: '1.1', uses: ['commands@1.0'],
  register(points) {
    ${body}
    points.commands.add({ id: 'example.probe.go', title: 'Go', run: () => {} });
  },
};`;

describe('a plug-in file from outside (plugin_outside_file)', () => {
  test('is refused before any worker starts when it imports, has no default export or is too big', () => {
    assert.match(outsideProblem(`import x from 'https://e.com/x.js';\n${pluginFile('')}`), /imports other code/);
    assert.match(outsideProblem(pluginFile("await import('https://e.com/x.js');")), /imports other code/);
    assert.match(outsideProblem(pluginFile('void import.meta.url;')), /imports other code/);
    assert.match(outsideProblem('const plugin = {};'), /no default export/);
    assert.match(outsideProblem(pluginFile('', `// ${'x'.repeat(OUTSIDE_CHARACTERS)}`)), /over the/);
    assert.equal(outsideProblem(SAMPLE), null);
    let started = false;
    const start = (body) => ((started = true), outsideThread(body));
    return assert
      .rejects(outsidePlugin(`import 'x';\n${pluginFile('')}`, start, { clock: CLOCK }), /imports other code/)
      .then(() => assert.equal(started, false));
  });

  test('the sample loads from its text alone, and its things install', async () => {
    const iso = await outsidePlugin(SAMPLE, outsideThread, { clock: CLOCK });
    const registry = pluginRegistry();
    registry.register(iso.plugin);
    assert.deepEqual(registry.plugins(), ['example.sample']);
    assert.equal(registry.commands()[0].id, 'example.sample.hello');
    iso.stop();
  });

  for (const [what, body, why] of [
    ['the network', "fetch('https://e.com');", /could not register: fetch is not defined/],
    ['eval', "eval('1');", /could not register: eval is not defined/],
    ['the Function maker', "new Function('return 1')();", /could not register: Function is not defined/],
    ['a function’s own maker', "(() => {}).constructor('return 1')();", /may not make code from text/],
    ['an async function’s maker', "(async () => {}).constructor('return 1');", /may not make code from text/],
    ['a timer given code as text', "setTimeout('1', 0);", /may not make code from text/],
  ])
    test(`cannot reach ${what}, so it cannot make code that imports`, () =>
      assert.rejects(outsidePlugin(pluginFile(body), outsideThread, { clock: CLOCK }), why));

  test('cannot reach them in its file’s own top-level code either, which runs after the worker is sealed', () =>
    assert.rejects(
      outsidePlugin(pluginFile('', "new Function('return 1')();"), outsideThread, { clock: CLOCK }),
      /worker failed: Function is not defined/,
    ));

  test('is refused when it exports anything but its default, or writes that default mid-line', () => {
    assert.match(outsideProblem(`export const x = 1;\n${pluginFile('')}`), /exports more than its default/);
    assert.match(outsideProblem('const p = 1; export default p;'), /no default export at the start of a line/);
  });
});
