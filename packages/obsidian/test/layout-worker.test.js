// The layout kept apart from the interface (spec §9, layout_contained), as the built plugin does it: Graphviz runs in a
// Web Worker built from main.js itself, one reused for every block; a graph over a size limit, or one whose layout takes
// too long, is shown as its text with a banner saying which limit and the numbers; and every other block still draws.
// Where Workers cannot run, the layout runs on the page's own thread, the size limit still applied.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show, svgOf } from './host/view-notes.js';
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

  test('too much layout source: the same, in bytes', async () => {
    await withPlugin(null, { sourceBytes: 100 }, async (env) => {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      assert.match(bannerOf(el).text, /layout source/);
      assert.match(bannerOf(el).text, /at most 100 bytes/);
    });
  });
});

describe('where Workers run', () => {
  test('the layout runs in one, built from main.js, reused for every block', async () => {
    await withPlugin({}, {}, async (env, workers) => {
      const first = await show(env, fence(GRAPH));
      const second = await show(env, fence(GRAPH));
      assert.ok(svgOf(first.el), 'drawn');
      assert.equal(first.el.querySelectorAll('g.node').length, 4);
      assert.ok(svgOf(second.el), 'drawn again');
      assert.equal(workers.made.length, 1, 'one worker');
      assert.match(workers.made[0].url, /^blob:/, 'from a Blob URL: nothing is fetched');
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
