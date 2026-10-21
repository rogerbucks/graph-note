// The sample plug-in outside the packages (examples/sample-plugin, API-10), run as a host runs one it did not ship:
// - in a real thread, as a browser's Worker is, with the network taken away first;
// - installed through the registry, with the version of each point it names checked;
// - each thing it adds held to its point's contract (packages/core/src/plugins-contract.ts), over the port.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { pluginRegistry } from '../packages/core/src/plugins.ts';
import { isolatedPlugin } from '../packages/core/src/plugin-isolated.ts';
import {
  commandContract,
  diagramContract,
  sourceContract,
  themeTokenContract,
} from '../packages/core/src/plugins-contract.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
const SAMPLE = new URL('../examples/sample-plugin/plugin.js', import.meta.url).href;
const SERVE = new URL('../packages/core/src/plugin-serve.ts', import.meta.url).href;

/** A real thread that loads the sample, takes the network away, and serves it; the host's port to it. */
function sampleThread() {
  const w = new Worker(
    `const { parentPort } = require('node:worker_threads');
     const scope = { onmessage: null, postMessage: (m) => parentPort.postMessage(m) };
     parentPort.on('message', (data) => scope.onmessage?.({ data }));
     (async () => {
       const { lockDown, servePlugin } = await import(${JSON.stringify(SERVE)});
       const { default: plugin } = await import(${JSON.stringify(SAMPLE)});
       const kept = lockDown(globalThis);
       if (kept.length) throw new Error('the network was kept: ' + kept.join(', '));
       servePlugin(scope, plugin);
     })().catch((e) => parentPort.postMessage({ failed: e.message }));`,
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
    const iso = await isolatedPlugin(sampleThread(), { clock: CLOCK });
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
    const { default: plugin } = await import(SAMPLE);
    for (const use of plugin.uses) assert.match(use, /^[a-z]+@\d+\.\d+$/, use);
  });
});
