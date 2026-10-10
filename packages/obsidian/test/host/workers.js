// A stand-in for the browser's Worker, for the tests of the layout kept apart from the interface (spec §9): each worker
// the plugin starts runs the very code main.js hands it, from its Blob URL, in a real thread (worker_threads), with the
// `self` a Web Worker would have. A test may have it swallow some requests, as a worker stuck in a hostile graph does.
import { resolveObjectURL } from 'node:buffer';
import { Worker as Thread } from 'node:worker_threads';

const SELF = `const { parentPort } = require('node:worker_threads');
const self = { onmessage: null, postMessage: (m) => parentPort.postMessage(m) };
parentPort.on('message', (data) => self.onmessage && self.onmessage({ data }));
`;

/**
 * Puts a Worker on the global object, as a browser has; returns the workers made and how to take it away again. A
 * request `swallow` is true of is taken and never answered.
 */
export function installWorkers({ swallow = () => false } = {}) {
  const made = [];
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  class StandIn {
    constructor(url) {
      this.url = url;
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
      const blob = resolveObjectURL(url);
      if (!blob) throw new Error(`no Blob at ${url}`);
      this.thread = blob.text().then((code) => {
        const t = new Thread(SELF + code, { eval: true });
        t.on('message', (data) => this.onmessage?.({ data }));
        t.on('error', (e) => this.onerror?.(e));
        if (this.terminated) void t.terminate();
        return t;
      });
      made.push(this);
    }
    postMessage(m) {
      if (swallow(m)) return;
      void this.thread.then((t) => t.postMessage(m));
    }
    terminate() {
      this.terminated = true;
      void this.thread.then((t) => t.terminate());
    }
  }
  Object.defineProperty(globalThis, 'Worker', { value: StandIn, configurable: true, writable: true });
  return {
    made,
    uninstall: () => {
      for (const w of made) w.terminate();
      if (saved) Object.defineProperty(globalThis, 'Worker', saved);
      else delete globalThis.Worker;
    },
  };
}
