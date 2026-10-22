// The saved-layout cache (editor spec §53, scale_layout_cache): layout-cache.ts. A layout is saved by a digest of what
// was laid out. It is read back through the marks check, and kept in memory up to a size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_CACHE_VERSION, LayoutCache, layoutKey, readSaved } from '../src/layout-cache.ts';
import { sha256 } from '../src/ai-digest.ts';

/** A layout of one box with its label, in a space of 100 by 50. */
const LAID = {
  space: { width: 100, height: 50 },
  marks: [
    { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 10, y: 10, width: 80, height: 30 },
    { id: 'l:t:a', kind: 'label', style: 'thing.text', x: 50, y: 25, text: 'A thing', size: 14, anchor: 'middle' },
  ],
};

/** A host store in memory, counting what is asked of it. */
function memoryStore() {
  const saved = new Map();
  return {
    saved,
    gets: 0,
    async get(key) {
      this.gets++;
      return saved.get(key);
    },
    async set(key, text) {
      saved.set(key, text);
    },
  };
}

test('the key is a digest of what is laid out and the version, so a change to either is a new key', async () => {
  const key = await layoutKey('digraph { a -> b }');
  assert.match(key, new RegExp(`^layout:${LAYOUT_CACHE_VERSION}:[0-9a-f]{64}$`));
  assert.equal(await layoutKey('digraph { a -> b }'), key);
  assert.notEqual(await layoutKey('digraph { a -> c }'), key);
  // a host's own SHA-256 gives the same key as the core's, so a key is the same wherever it was made
  const { createHash } = await import('node:crypto');
  const host = async (text) => createHash('sha256').update(text, 'utf8').digest('hex');
  assert.equal(await layoutKey('digraph { a -> b → c }', host), await layoutKey('digraph { a -> b → c }'));
  assert.equal(key, `layout:${LAYOUT_CACHE_VERSION}:${sha256('digraph { a -> b }')}`);
});

test('a layout seen before is given back without laying out again', async () => {
  const cache = new LayoutCache();
  let laid = 0;
  const lay = async () => (laid++, LAID);
  assert.deepEqual(await cache.layout('k', lay), LAID);
  assert.deepEqual(await cache.layout('k', lay), LAID);
  assert.equal(laid, 1);
  assert.deepEqual(cache.counts, { hits: 1, misses: 1 });
});

test('the host store keeps layouts between sessions', async () => {
  const store = memoryStore();
  await new LayoutCache(store).set('k', LAID);
  const next = new LayoutCache(store);
  assert.deepEqual(await next.get('k'), LAID);
  // once read, it is kept in memory too
  await next.get('k');
  assert.equal(store.gets, 1);
});

test('a saved layout that was changed or broken is a miss, never a broken drawing', async () => {
  const store = memoryStore();
  const cache = new LayoutCache(store);
  for (const bad of [
    'not json',
    'null',
    JSON.stringify({ space: { width: -1, height: 5 }, marks: [] }),
    JSON.stringify({ ...LAID, marks: [{ ...LAID.marks[0], kind: 'script' }] }),
    JSON.stringify({ ...LAID, marks: [{ ...LAID.marks[0], style: 'fill:red' }] }),
  ]) {
    store.saved.set('k', bad);
    assert.equal(await cache.get('k'), null, bad);
  }
  assert.equal(readSaved(JSON.stringify(LAID))?.marks.length, 2);
});

test('a store that fails costs only a layout', async () => {
  const failing = {
    get: async () => {
      throw new Error('storage is full');
    },
    set: async () => {
      throw new Error('storage is full');
    },
  };
  const cache = new LayoutCache(failing);
  assert.deepEqual(await cache.layout('k', async () => LAID), LAID);
  // still kept in memory
  assert.deepEqual(await cache.get('k'), LAID);
});

test('memory keeps the newest layouts up to its size, and lets the oldest go', async () => {
  const one = JSON.stringify(LAID).length;
  const cache = new LayoutCache(undefined, one * 2);
  await cache.set('a', LAID);
  await cache.set('b', LAID);
  await cache.get('a'); // a is now the newest
  await cache.set('c', LAID);
  assert.equal(await cache.get('b'), null);
  assert.deepEqual(await cache.get('a'), LAID);
  assert.deepEqual(await cache.get('c'), LAID);
  cache.clear();
  assert.equal(await cache.get('a'), null);
});
