// The layout kept apart from the interface (spec §9, layout_contained), as the built plugin does it: Graphviz runs in a
// Web Worker built from main.js itself, one reused for every block; a graph over a size limit, or one whose layout takes
// too long, is shown as its text with a banner saying which limit and the numbers; and every other block still draws.
// Where Workers cannot run, the layout runs on the page's own thread, the size limit still applied. A note too large to
// read is never read: its text is shown with the banner, in a card and in the pane.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show, svgOf } from './host/view-notes.js';
import { open, READER, type } from './host/pane-notes.js';
import { installWorkers } from './host/workers.js';

before(() => build());

const HOSTILE = `// graph: hostile
(h:Thing {name: 'Hostile'}), (i:Thing {name: 'Innocent'}), (h)-[:LINKS]->(i)`;
const isHostile = (m) => m.drawing.boxes.some((b) => b.text === 'Hostile');

/** The banner in `el`, its words, and whether it carries an icon beside them. */
function bannerOf(el) {
  const b = el.querySelector('.graph-note-banner');
  return (
    b && {
      text: b.textContent,
      icon: b.querySelector('[data-icon]')?.getAttribute('data-icon'),
      role: b.getAttribute('role'),
    }
  );
}

/** Runs `fn` with the plugin loaded, Workers as `workers` installs them (none when null), and its limits changed. */
async function withPlugin(workers, limits, fn) {
  const installed = workers && installWorkers(workers);
  const env = await load();
  Object.assign(env.plugin.layoutLimits, limits);
  try {
    await fn(env, installed);
  } finally {
    env.plugin.onunload();
    installed?.uninstall();
    env.uninstall();
  }
}

describe('a graph over a size limit is shown as its text, with a banner saying which limit and the numbers', () => {
  test('too many things: the text, and a banner with an icon and the counts; never a blank drawing', async () => {
    await withPlugin(null, { things: 3 }, async (env) => {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      const b = bannerOf(el);
      assert.ok(b, 'a banner');
      assert.match(b.text, /too large/i);
      assert.match(b.text, /4 things/);
      assert.match(b.text, /at most 3/);
      assert.ok(b.icon, 'an icon beside the words, never colour alone');
      assert.equal(b.role, 'alert');
      assert.match(el.querySelector('code').textContent, /Large reader/);
    });
  });

  test('too many links: the same, counting links', async () => {
    await withPlugin(null, { links: 3 }, async (env) => {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      assert.match(bannerOf(el).text, /4 links/);
      assert.match(bannerOf(el).text, /at most 3/);
      assert.match(el.querySelector('code').textContent, /Large reader/);
    });
  });

  test('too many drawing instructions: the same, in bytes, in words a person reads', async () => {
    await withPlugin(null, { sourceBytes: 100 }, async (env) => {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      assert.match(bannerOf(el).text, /drawing instructions/);
      assert.doesNotMatch(bannerOf(el).text, /layout source/);
      assert.match(bannerOf(el).text, /at most 100 bytes/);
    });
  });

  test('a block too large to read — 5 MB, each line broken — is its text and a banner at once, never read', async () => {
    await withPlugin(null, {}, async (env) => {
      const body = Array.from({ length: 100_000 }, (_, i) => `(n${i}:Thing {name: 'Thing number ${i} of many'},`);
      const t = performance.now();
      const { el } = await show(env, fence(`// graph: g\n${body.join('\n')}`));
      const ms = performance.now() - t;
      assert.ok(ms < 3000, `${ms.toFixed(0)} ms`);
      assert.equal(svgOf(el), null);
      assert.match(bannerOf(el).text, /too large to read/i);
      assert.match(bannerOf(el).text, /at most 512 kB/);
      assert.ok(bannerOf(el).icon, 'an icon beside the words');
      assert.match(el.querySelector('code').textContent, /Thing number 99999 of many/, 'the text, whole');
    });
  });
});

describe('where Workers run', () => {
  test('the layout runs in one, built from main.js, reused for every block', async () => {
    const warned = [];
    const real = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      await withPlugin({}, {}, async (env, workers) => {
        const first = await show(env, fence(GRAPH));
        const second = await show(env, fence(GRAPH));
        assert.ok(svgOf(first.el), 'drawn');
        assert.equal(first.el.querySelectorAll('g.node').length, 4);
        assert.ok(svgOf(second.el), 'drawn again');
        assert.equal(workers.made.length, 1, 'one worker');
        assert.match(workers.made[0].url, /^blob:/, 'from a Blob URL: nothing is fetched');
      });
    } finally {
      console.warn = real;
    }
    assert.deepEqual(warned, [], 'nothing said of the main thread: the worker did the work');
  });

  test('the worker’s code stands alone: every helper it calls is its own, never one of main.js’s, such as __name', async () => {
    await withPlugin({}, {}, async (env, workers) => {
      await show(env, fence(GRAPH));
      const code = await resolveObjectURL(workers.made[0].url).text();
      // esbuild's own runtime helpers, by name: each the bundle calls must be one it declares, not main.js's
      const helper =
        /(?<![.\w"'$])(__(?:name|require|esm|commonJS|export|copyProps|reExport|toESM|toCommonJS|toBinary|publicField|private[A-Z]\w*|async|await|defProps?|defNormalProp|getOwnProp\w*|getProtoOf|hasOwnProp|propIsEnum|spread\w+|objRest|decorate\w+|using|callDispose|create|knownSymbol|typeError|accessCheck)\d*)\b/g;
      const used = new Set([...code.matchAll(helper)].map((m) => m[1]));
      const own = new Set(
        [...code.matchAll(/(?:\bvar|\blet|\bconst|\bfunction|\bclass|,)\s*(__[a-z]\w*)\s*[=(]/g)].map((m) => m[1]),
      );
      assert.ok(used.size > 0, 'the bundle has helpers of its own to check');
      assert.deepEqual(
        [...used].filter((n) => !own.has(n)),
        [],
      );
    });
  });

  test('a layout that takes too long is stopped: the text, and a banner saying it took too long', async () => {
    await withPlugin({ swallow: () => true }, { ms: 200 }, async (env, workers) => {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      const b = bannerOf(el);
      assert.match(b.text, /took too long/i);
      assert.match(b.text, /0\.2 seconds/);
      assert.ok(b.icon, 'an icon beside the words');
      assert.match(el.querySelector('code').textContent, /Large reader/);
      assert.equal(workers.made[0].terminated, true, 'the stuck worker was stopped');
    });
  });

  test('the interface stays usable: while one block is stuck, the others still draw, on a fresh worker', async () => {
    await withPlugin({ swallow: isHostile }, { ms: 1500 }, async (env, workers) => {
      const note = [fence(HOSTILE), fence(GRAPH)].join('\n');
      const [stuck, other] = await Promise.all([show(env, note, 0), show(env, note, 1)]);
      assert.match(bannerOf(stuck.el).text, /took too long/i);
      assert.ok(svgOf(other.el), 'the other block was drawn');
      assert.equal(workers.made.length, 2, 'the stuck worker was replaced');
      assert.ok(svgOf((await show(env, fence(GRAPH))).el), 'and the next block draws too');
    });
  });

  test('after 3 layouts in a row take too long, no worker is started again: the rest say so, with their text', async () => {
    const warned = [];
    const real = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      await withPlugin({ swallow: () => true }, { ms: 100 }, async (env, workers) => {
        for (let i = 0; i < 3; i++) assert.match(bannerOf((await show(env, fence(GRAPH))).el).text, /took too long/i);
        const { el } = await show(env, fence(GRAPH));
        assert.match(bannerOf(el).text, /paused/i);
        assert.ok(bannerOf(el).icon);
        assert.match(el.querySelector('code').textContent, /Large reader/);
        await show(env, fence(GRAPH));
        assert.equal(workers.made.length, 3, 'no fourth worker');
      });
    } finally {
      console.warn = real;
    }
    assert.equal(warned.filter((w) => /paused/.test(w)).length, 1, warned.join('\n'));
  });

  test('on unload, a layout still waiting is dropped quietly, and none is started after', async () => {
    await withPlugin({ swallow: () => true }, {}, async (env, workers) => {
      const pending = show(env, fence(GRAPH));
      await new Promise((r) => setTimeout(r, 50));
      env.plugin.onunload();
      const { el } = await pending;
      assert.equal(bannerOf(el), null, 'no banner: the engine did not fail, it was put away');
      const after = await show(env, fence(GRAPH));
      assert.equal(bannerOf(after.el), null);
      assert.equal(workers.made.length, 1, 'no worker started after unload');
    });
  });
});

describe('in the pane', () => {
  test('a block typed or pasted past the size to read shows the banner in the drawing’s place, never read', async () => {
    const env = await open();
    try {
      await until(() => env.el.querySelectorAll('g.node').length === 3);
      type(env.el, `${READER},\n${'(a:Thing),\n'.repeat(10_000)}(b:Thing)`);
      await until(() => /too large to read/i.test(env.el.querySelector('.graph-note-banner')?.textContent ?? ''));
      assert.equal(env.el.querySelectorAll('g.node').length, 0, 'the old drawing is gone');
      assert.match(env.el.querySelector('.graph-note-banner').textContent, /at most 10,000/);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });
});

describe('where Workers cannot run', () => {
  test('the layout runs on the page’s thread, the size limit still applied, and the console says so once', async () => {
    const warned = [];
    const real = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      await withPlugin(null, {}, async (env) => {
        assert.ok(svgOf((await show(env, fence(GRAPH))).el));
        assert.ok(svgOf((await show(env, fence(GRAPH))).el));
        env.plugin.layoutLimits.things = 3;
        assert.match(bannerOf((await show(env, fence(GRAPH))).el).text, /4 things/);
      });
    } finally {
      console.warn = real;
    }
    assert.equal(warned.filter((w) => /main thread/.test(w)).length, 1, warned.join('\n'));
  });
});
