// The plugin reaches the network for one thing only. Spec §13 and §19: no network request at runtime, except a send to
// an AI model the user has set up, made only when the user sends it, and only by the plugin's AI send module
// (packages/obsidian/src/ai/send.ts, which test/policy.test.js holds to be the one source that can). Everything else is
// held strictly here: the Graphviz engine the plugin bundles carries Emscripten code that could fetch a WebAssembly file
// or a lazy file by URL, and this package inlines its WebAssembly, so that code must never run; and the core's own AI
// send reaches no network of its own, going only through the transport a host hands it. Here every way to reach the
// network is a trap that records the attempt.
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

/** Runs `work` with every way to the network a trap, and gives back the attempts it made. */
async function trapped(work) {
  const before = attempts.length;
  const saved = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket };
  globalThis.fetch = (url) => {
    attempts.push(`fetch ${url}`);
    return Promise.reject(new Error('fetch refused'));
  };
  globalThis.XMLHttpRequest = trap('XMLHttpRequest');
  globalThis.WebSocket = trap('WebSocket');
  try {
    await work();
  } finally {
    Object.assign(globalThis, saved);
  }
  return attempts.slice(before);
}

test('the Graphviz engine starts and draws without reaching for the network', async () => {
  const made = await trapped(async () => {
    const { instance } = await import('@viz-js/viz');
    const viz = await instance();
    const svg = viz.renderString('digraph { a -> b [label="answers"]; c -> a; subgraph cluster_x { d; e } }', {
      format: 'svg',
    });
    assert.match(svg, /<svg/);
    for (const format of ['svg', 'dot', 'json', 'plain']) viz.renderString('digraph { x -> y }', { format });
  });
  assert.deepEqual(made, []);
});

test('the core’s AI send reaches no network of its own: only the transport it is handed, once, when the user says yes', async () => {
  const sent = [];
  const made = await trapped(async () => {
    const { settingsFrom, prepareSend, confirmSend, sendPrepared } = await import('../packages/core/src/index.ts');
    const model = {
      name: 'Local',
      purpose: 'Proposing changes',
      ceiling: 'Internal',
      endpoint: 'http://localhost:11434/v1/chat/completions',
      model: 'm',
    };
    const p = prepareSend({
      settings: settingsFrom({ aiUse: 'on', aiModels: [model] }),
      model: 'Local',
      note: "```gql\n// graph: g\n(a:Thing {name: 'A'})\n```\n",
      notePath: 'A.md',
      level: 'Public',
      choice: { graph: 'g', what: 'graph' },
      question: 'What is missing?',
    });
    assert.ok(!('refused' in p), p.refused);
    const transport = async (req) => {
      sent.push(req.url);
      return { status: 503, text: 'busy' };
    };
    const result = await sendPrepared(p, confirmSend(p), { transport, key: null });
    assert.match(result.failed, /refused/);
  });
  assert.deepEqual(made, []);
  assert.deepEqual(sent, ['http://localhost:11434/v1/chat/completions']);
});

test('the trap records an attempt', async () => {
  const made = await trapped(() => globalThis.fetch('https://example.com/engine.wasm').catch(() => {}));
  assert.equal(made.length, 1);
});
