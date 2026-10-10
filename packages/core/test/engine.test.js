// Starting the Graphviz engine (spec §1, §3): Graphviz compiled to WebAssembly and bundled, so it starts with no network.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';

describe('drawing', () => {
  test('the engine starts offline and names its Graphviz version', async () => {
    const engine = await loadEngine();
    assert.match(engine.version, /^\d+\.\d+\.\d+$/);
  });
});
