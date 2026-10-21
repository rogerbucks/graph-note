// A plug-in run apart from the host, in a worker (editor spec §54, TRUST-14). The host is handed the port to a worker
// that serves one plug-in. Here the worker is a real thread (worker_threads), as a browser's Worker is, or one on this
// thread for the quick checks. What is held:
// - what the plug-in adds is installed as any other, and each call goes over the port as data;
// - a call that loops or never answers is stopped by the host's clock, and the plug-in is named and stopped for good;
// - the worker has no network, and reaches only the host abilities its manifest names.
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { Worker } from 'node:worker_threads';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { isolatedPlugin } from '../src/plugin-isolated.ts';
import { ISOLATED_POINTS, LOCKED_AWAY, lockDown, servePlugin } from '../src/plugin-serve.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
const GRAPH = "// graph: trip\n(paris:City {name: 'Paris'})";
const SHAPE = { things: [{ key: 'paris', text: 'Paris', kinds: ['City'] }], links: [] };

/** A real thread serving the plug-in `source` makes, after taking the network away; the host's port to it. */
function thread(source) {
  const core = new URL('../src/', import.meta.url).href;
  const w = new Worker(
    `const { parentPort } = require('node:worker_threads');
     const scope = { onmessage: null, postMessage: (m) => parentPort.postMessage(m) };
     parentPort.on('message', (data) => scope.onmessage?.({ data }));
     (async () => {
       const { lockDown, servePlugin } = await import(${JSON.stringify(core)} + 'plugin-serve.ts');
       const kept = lockDown(globalThis);
       const plugin = ${source};
       plugin.register = plugin.register ?? (() => {});
       if (kept.length) plugin.register = () => { throw new Error('kept ' + kept.join(', ')); };
       servePlugin(scope, plugin);
     })();`,
    { eval: true },
  );
  const port = { onmessage: null, onerror: null, ended: false };
  w.on('message', (data) => port.onmessage?.({ data }));
  w.on('error', (e) => port.onerror?.(e));
  port.postMessage = (m) => w.postMessage(m);
  port.terminate = () => {
    port.ended = true;
    void w.terminate();
  };
  return port;
}

/** A worker on this thread serving `plugin`, every message copied as a real one is. */
function inThread(plugin) {
  const later = (run) => void Promise.resolve().then(run);
  const copied = (m, to) => {
    const data = structuredClone(m);
    later(() => to()?.({ data }));
  };
  const scope = { onmessage: null, postMessage: (m) => copied(m, () => port.onmessage) };
  const port = {
    onmessage: null,
    onerror: null,
    ended: false,
    postMessage: (m) => copied(m, () => scope.onmessage),
    terminate: () => (port.ended = true),
  };
  later(() => servePlugin(scope, plugin));
  return { port, scope };
}

const manifest = (uses, more = {}) => ({ id: 'acme.iso', version: '1.0.0', api: PLUGIN_API, uses, ...more });
const installed = async (port, options = {}, host) => {
  const iso = await isolatedPlugin(port, { clock: CLOCK, ...options });
  const registry = pluginRegistry({ host });
  registry.register(iso.plugin);
  return { iso, registry };
};

describe('a plug-in run apart from the host (TRUST-14)', () => {
  afterEach(() => setLanguage(SOURCE_LANGUAGE));

  test('what it adds is installed as any other, and its calls go over the port as data', async () => {
    const { port } = inThread({
      ...manifest(['sources', 'steps', 'diagrams', 'commands', 'theme']),
      register(p) {
        p.sources.add({ scheme: 'acme', title: 'Acme', read: (t) => ({ text: GRAPH, classification: 'Public', t }) });
        p.steps.add({ id: 'acme.iso.same', title: 'Same', run: (inputs) => inputs[0] });
        p.diagrams.add({ type: 'acme.iso.row', title: 'Row', draw: () => [{ kind: 'text', x: 1, y: 2, text: 'hi' }] });
        p.commands.add({ id: 'acme.iso.go', title: 'Go', run: () => {} });
        p.theme.add({ name: '--gn-plugin-acme-iso-mark', light: '#1a1a1a', dark: '#f0f0f0' });
      },
    });
    const { registry } = await installed(port);
    assert.deepEqual(registry.plugins(), ['acme.iso']);
    const read = await registry.readGraph('acme', 'trip', ['Public']);
    assert.equal(read.ok, true);
    assert.equal(read.value.text, GRAPH);
    assert.equal((await registry.runStep('acme.iso.same', [read.value], ['Public'])).value.text, GRAPH);
    assert.match((await registry.drawDiagram('acme.iso.row', SHAPE, { width: 10, height: 10 })).value, />hi<\/text>/);
    assert.deepEqual(registry.runCommand('acme.iso.go'), { ok: true, value: undefined });
    assert.deepEqual(
      registry.themeTokens().map((t) => t.name),
      ['--gn-plugin-acme-iso-mark'],
    );
  });

  test('a store it adds is opened in the worker, and each store’s calls go to that store', async () => {
    const { port } = inThread({
      ...manifest(['storage']),
      register(p) {
        p.storage.add({
          name: 'memo',
          title: 'Memo',
          open: () => {
            const notes = new Map();
            return {
              list: async () => [...notes.keys()],
              read: async (path) => (notes.has(path) ? { text: notes.get(path), version: '1' } : null),
              write: async (path, text) => (notes.set(path, text), { ok: true, version: '1' }),
              remove: async (path) => (notes.delete(path), { ok: true, version: null }),
            };
          },
        });
      },
    });
    const { registry } = await installed(port);
    const a = registry.openStorage('memo').value,
      b = registry.openStorage('memo').value;
    await a.write('One.md', 'one');
    assert.deepEqual(await a.list(), ['One.md']);
    assert.deepEqual(await b.list(), []);
    assert.equal((await a.read('One.md')).text, 'one');
  });

  test('a call that loops forever is stopped by the host’s clock, and its plug-in named and stopped for good', async () => {
    const port = thread(`({ id: 'acme.iso', version: '1.0.0', api: '${PLUGIN_API}', uses: ['sources'],
      register: (p) => p.sources.add({ scheme: 'loop', title: 'Loop', read: () => { for (;;); } }) })`);
    const { iso, registry } = await installed(port, { timeLimit: 300 });
    const r = await registry.readGraph('loop', 'x', ['Public']);
    assert.equal(r.ok, false);
    assert.equal(r.plugin, 'acme.iso');
    assert.match(
      r.message,
      /^The source Loop of acme\.iso failed: the plug-in was stopped, as a call ran over the 300 ms allowed$/,
    );
    assert.equal(port.ended, true);
    assert.match(iso.stopped(), /ran over the 300 ms allowed/);
    assert.match((await registry.readGraph('loop', 'x', ['Public'])).message, /the plug-in was stopped/);
  });

  // proves: words_catalogue
  test('why a plug-in run apart was stopped is said in the person’s language, by every call after it', async () => {
    setLanguage('en-XA');
    const { port } = inThread({
      ...manifest(['diagrams']),
      register: (p) => p.diagrams.add({ type: 'acme.iso.wait', title: 'Wait', draw: () => new Promise(() => {}) }),
    });
    const { iso, registry } = await installed(port, { timeLimit: 50 });
    const first = await registry.drawDiagram('acme.iso.wait', SHAPE, { width: 10, height: 10 });
    const again = await registry.drawDiagram('acme.iso.wait', SHAPE, { width: 10, height: 10 });
    iso.stop();
    for (const words of [first.message, again.message, iso.stopped()]) assert.ok(isPseudoWord(words), words);
  });

  test('a call whose answer never comes is stopped too', async () => {
    const { port } = inThread({
      ...manifest(['diagrams']),
      register: (p) => p.diagrams.add({ type: 'acme.iso.wait', title: 'Wait', draw: () => new Promise(() => {}) }),
    });
    const { iso, registry } = await installed(port, { timeLimit: 50 });
    const r = await registry.drawDiagram('acme.iso.wait', SHAPE, { width: 10, height: 10 });
    assert.match(r.message, /^The diagram type Wait of acme\.iso failed: the plug-in was stopped, as a call ran over/);
    assert.equal(port.ended, true);
    assert.notEqual(iso.stopped(), null);
  });

  test('the worker has no network: each way out is taken away before the plug-in’s code runs', async () => {
    const port = thread(`({ id: 'acme.iso', version: '1.0.0', api: '${PLUGIN_API}', uses: ['sources'],
      register: (p) => p.sources.add({ scheme: 'net', title: 'Net', read: async () => {
        const left = ${JSON.stringify(LOCKED_AWAY)}.filter((n) => n in globalThis);
        if (left.length) return { text: 'left: ' + left.join(', ') };
        return fetch('https://example.com/');
      } }) })`);
    const { registry } = await installed(port);
    const r = await registry.readGraph('net', 'x', ['Public']);
    assert.equal(r.ok, false);
    assert.match(r.message, /^The source Net of acme\.iso failed: fetch is not defined$/);
    port.terminate();
  });

  test('lockDown takes a way out from the scope and the objects it inherits from, and says what it could not', () => {
    const proto = { fetch: () => 'net' };
    const scope = Object.create(proto);
    scope.WebSocket = class {};
    Object.defineProperty(scope, 'indexedDB', { value: {}, configurable: false });
    assert.deepEqual(lockDown(scope), ['indexedDB']);
    assert.equal('fetch' in scope, false);
    assert.equal('WebSocket' in scope, false);
  });

  test('it reaches only the host abilities its manifest names, each through the registry’s own checks', async () => {
    const asked = [];
    const { port } = inThread({
      ...manifest(['sources'], { abilities: ['secrets'] }),
      register(p) {
        p.sources.add({
          scheme: 'key',
          title: 'Key',
          read: async () => {
            asked.push(await p.host.secrets.get('acme.iso.token'), await p.host.secrets.get('openai-key'));
            return { text: GRAPH, classification: 'Public', files: typeof p.host.files };
          },
        });
      },
    });
    const store = { 'acme.iso.token': 'mine', 'openai-key': 'not yours' };
    const { registry } = await installed(port, {}, { secrets: { get: (n) => store[n] ?? null } });
    assert.equal((await registry.readGraph('key', 'x', ['Public'])).ok, true);
    assert.deepEqual(asked, ['mine', null]);
  });

  test('an ask for an ability it was not given is refused, whatever the worker sends', async () => {
    const { port, scope } = inThread({ ...manifest(['commands']), register: () => {} });
    await installed(port, {}, { secrets: { get: () => 'leaked' } });
    const answers = [];
    scope.onmessage = ({ data }) => answers.push(data);
    scope.postMessage({ ask: 7, ability: 'secrets', method: 'get', args: ['acme.iso.token'] });
    scope.postMessage({ ask: 8, ability: 'files', method: 'constructor', args: [] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(answers, [
      { answered: 7, error: 'the host ability secrets was not given' },
      { answered: 8, error: 'the host ability files was not given' },
    ]);
  });

  test('a point that needs the page or an answer at once cannot be used apart yet, and says so', async () => {
    assert.deepEqual([...ISOLATED_POINTS], ['theme', 'storage', 'commands', 'sources', 'steps', 'diagrams']);
    for (const point of ['exports', 'ai', 'panels']) {
      const { port } = inThread({ ...manifest([point]), register: () => {} });
      await assert.rejects(
        isolatedPlugin(port, { clock: CLOCK }),
        new RegExp(`could not register: a plug-in run apart cannot add to ${point} yet`),
      );
      assert.equal(port.ended, true);
    }
  });

  test('an answer that is not data is refused and named, and a worker that never starts is stopped', async () => {
    const { port } = inThread({
      ...manifest(['sources']),
      register: (p) => p.sources.add({ scheme: 'fn', title: 'Fn', read: () => ({ text: () => 'code' }) }),
    });
    const { registry } = await installed(port);
    const r = await registry.readGraph('fn', 'x', ['Public']);
    assert.equal(r.ok, false);
    assert.match(r.message, /^The source Fn of acme\.iso failed: its answer could not be sent as data: /);
    const silent = {
      onmessage: null,
      onerror: null,
      ended: false,
      postMessage: () => {},
      terminate: () => (silent.ended = true),
    };
    await assert.rejects(isolatedPlugin(silent, { clock: CLOCK, startLimit: 20 }), /did not start within the 20 ms/);
    assert.equal(silent.ended, true);
  });
});
