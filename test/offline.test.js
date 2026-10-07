// The Graphviz engine the plugin bundles makes no network request. Spec §13: the plugin
// makes no network requests at runtime. The engine's Emscripten runtime carries code that
// could fetch a WebAssembly file or a lazy file by URL; this package inlines its WebAssembly,
// so that code must never run. Here every way to reach the network is a trap that records the
// attempt, and the engine is started and asked to draw in every output format.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const attempts = [];
const trap = (kind) =>
  class {
    constructor() {
      attempts.push(kind);
      throw new Error(`${kind} refused`);
    }
  };

test('the Graphviz engine starts and draws without reaching for the network', async () => {
  const saved = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket };
  globalThis.fetch = (url) => {
    attempts.push(`fetch ${url}`);
    return Promise.reject(new Error('fetch refused'));
  };
  globalThis.XMLHttpRequest = trap('XMLHttpRequest');
  globalThis.WebSocket = trap('WebSocket');
  try {
    const { instance } = await import('@viz-js/viz');
    const viz = await instance();
    const svg = viz.renderString('digraph { a -> b [label="answers"]; c -> a; subgraph cluster_x { d; e } }', {
      format: 'svg',
    });
    assert.match(svg, /<svg/);
    for (const format of ['svg', 'dot', 'json', 'plain']) viz.renderString('digraph { x -> y }', { format });
  } finally {
    Object.assign(globalThis, saved);
  }
  assert.deepEqual(attempts, []);
});

test('the trap records an attempt', async () => {
  const before = attempts.length;
  const saved = globalThis.fetch;
  globalThis.fetch = (url) => {
    attempts.push(`fetch ${url}`);
    return Promise.reject(new Error('fetch refused'));
  };
  try {
    await globalThis.fetch('https://example.com/engine.wasm').catch(() => {});
  } finally {
    globalThis.fetch = saved;
  }
  assert.equal(attempts.length, before + 1);
  attempts.length = before;
});
