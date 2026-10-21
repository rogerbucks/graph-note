// The sample plug-in outside the packages (examples/sample-plugin, API-10), run as a host runs one it did not ship:
// - from its file's text alone, in a real thread as a browser's Worker is, sealed before the file runs;
// - installed through the registry, with the version of each point it names checked;
// - each thing it adds held to its point's contract (packages/core/src/plugins-contract.ts), over the port.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { pluginRegistry } from '../packages/core/src/plugins.ts';
import { outsidePlugin } from '../packages/core/src/plugin-outside.ts';
import {
  commandContract,
  diagramContract,
  sourceContract,
  themeTokenContract,
} from '../packages/core/src/plugins-contract.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
const SAMPLE = new URL('../examples/sample-plugin/plugin.js', import.meta.url);
const OUTSIDE_PATH = fileURLToPath(new URL('../packages/core/src/plugin-outside.ts', import.meta.url));

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

describe('the sample plug-in, run as a host runs one it did not ship (API-10)', () => {
  test('loads in a worker, and each thing it adds passes its point’s contract', async () => {
    const iso = await outsidePlugin(readFileSync(SAMPLE, 'utf8'), outsideThread, { clock: CLOCK });
    const registry = pluginRegistry();
    registry.register(iso.plugin);
    assert.deepEqual(registry.plugins(), ['example.sample']);
    const [source] = registry.graphSources();
    const [command] = registry.commands();
    const [token] = registry.themeTokens();
    const [diagram] = registry.diagramTypes();
    const checks = [
      ...sourceContract(source, 'trip'),
      ...diagramContract(diagram, 'example.sample'),
      ...commandContract(command, 'example.sample'),
      ...themeTokenContract(token, 'example.sample'),
    ];
    for (const check of checks) await check.run();
    const drawn = await registry.drawDiagram(
      'example.sample.row',
      {
        things: [{ key: 'a', text: '<b>A</b>', kinds: [] }],
        links: [],
      },
      { width: 300, height: 100 },
    );
    assert.match(drawn.value, /&lt;b&gt;A&lt;\/b&gt;/);
    iso.stop();
  });

  test('its manifest names the version of each point it uses', async () => {
    const { default: plugin } = await import(SAMPLE.href);
    for (const use of plugin.uses) assert.match(use, /^[a-z]+@\d+\.\d+$/, use);
  });
});
