// The layout engine kept apart from the interface (spec §9, layout_contained): Graphviz runs in a worker the core talks to
// through a port it is given, with a time limit and a size limit, so a huge or hostile graph never freezes the page. Here
// the port is a fake, an in-thread one, or a real thread (worker_threads), each standing in for the browser's Worker.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readNote } from '../src/drawing.ts';
import { loadEngine, draw } from '../src/render.ts';
import { drawingSource } from '../src/layout.ts';
import { LAYOUT_LIMITS, PAGE_LIMITS, tooLarge } from '../src/layout-limits.ts';
import { LayoutRunner, TIMEOUTS_BEFORE_STOPPING, inThreadPort, serveLayouts } from '../src/layout-worker.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READER = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}), (small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(q), (small)-[:ANSWERS]->(q)`;
const drawingOf = (block, graph = 'reader') => readNote([block]).graphs.get(graph);
const drawingSourceOf = (d) =>
  ['LR', 'TB'].map((r) => drawingSource(d, r)).reduce((a, b) => (Buffer.byteLength(a) >= Buffer.byteLength(b) ? a : b));

/** A drawing of `things` boxes and `links` links, made directly: big enough to refuse, never laid out. */
const huge = (things, links) => ({
  graph: 'g',
  boxes: Array.from({ length: things }, (_, i) => ({ key: `n${i}`, kind: 'Thing', text: `Thing ${i}` })),
  links: Array.from({ length: links }, (_, i) => ({ from: 'n0', type: 'LINKS', reading: 'links', to: `n${i % 2}` })),
  estimates: [],
});

/** Ports into the engine run in this thread, counting how many are made; `load` may stand in for the engine's start. */
function served(load = loadEngine) {
  const made = [];
  const spawn = () => {
    const port = inThreadPort((scope) => serveLayouts(scope, load));
    made.push(port);
    return port;
  };
  return { made, spawn };
}

/** A fake worker: says it is ready (or fails before, with `fail`), then takes each request and never answers. */
function silent({ fail } = {}) {
  const port = { onerror: null, posted: [], terminated: false };
  let handler = null;
  Object.defineProperty(port, 'onmessage', {
    get: () => handler,
    set: (f) => {
      handler = f;
      setTimeout(() => (fail ? port.onerror?.(new Error(fail)) : handler?.({ data: { ready: true } })), 0);
    },
  });
  port.postMessage = (m) => port.posted.push(m);
  port.terminate = () => (port.terminated = true);
  return port;
}

/** A runner over these workers, one after another, then `rest`; the page's port counted, and what it was told. */
function runner(workers, { rest, limits, page = served() } = {}) {
  const told = [];
  const r = new LayoutRunner({
    worker: () => workers.shift() ?? rest(),
    page: page.spawn,
    clock: CLOCK,
    limits: limits && (() => ({ ...LAYOUT_LIMITS, ...limits })),
    told: (what) => told.push(what),
  });
  return { r, told, page };
}

/** A real thread, as a browser's Worker is: it runs `body` with a `scope` to serve layouts on. */
function thread(body) {
  const core = new URL('../src/', import.meta.url).href;
  const w = new Worker(
    `const { parentPort } = require('node:worker_threads');
     const early = [];
     const scope = { onmessage: null, postMessage: (m) => parentPort.postMessage(m) };
     parentPort.on('message', (data) => (scope.onmessage ? scope.onmessage({ data }) : early.push(data)));
     const core = ${JSON.stringify(core)};
     (async () => { ${body} })().then(() => { for (const data of early.splice(0)) scope.onmessage?.({ data }); });`,
    { eval: true },
  );
  const port = { onmessage: null, onerror: null, terminated: false };
  w.on('message', (data) => port.onmessage?.({ data }));
  w.on('error', (e) => port.onerror?.(e));
  port.postMessage = (m) => w.postMessage(m);
  port.terminate = () => {
    port.terminated = true;
    void w.terminate();
  };
  return port;
}
const SERVING = `const { serveLayouts } = await import(core + 'layout-worker.ts');
  const { loadEngine } = await import(core + 'render.ts');
  serveLayouts(scope, loadEngine);`;
const BUSY_FOREVER = `scope.postMessage({ ready: true }); scope.onmessage = () => { for (;;); };`;

describe('the limits, checked before any layout', () => {
  test('the defaults: 2,000 things, 5,000 links, 1 MB of drawing instructions, 5 seconds to lay out, 30 to start', () => {
    assert.deepEqual(LAYOUT_LIMITS, {
      things: 2000,
      links: 5000,
      sourceBytes: 1_000_000,
      word: 1_000_000,
      ms: 5000,
      startMs: 30_000,
    });
  });

  test('over the things limit, the result is "too large", naming the limit and the numbers, and no worker is started', async () => {
    const { r, page } = runner([]);
    assert.deepEqual(await r.draw(huge(2001, 0)), { reason: 'too-large', limit: 'things', count: 2001, most: 2000 });
    assert.equal(page.made.length, 0, 'no layout was attempted');
  });

  test('over the links limit, the same, for links', async () => {
    const { r } = runner([]);
    assert.deepEqual(await r.draw(huge(2, 5001)), { reason: 'too-large', limit: 'links', count: 5001, most: 5000 });
  });

  test('over the source limit by its texts alone — few things, one written at great length — refused unwritten', async () => {
    const d = drawingOf(READER);
    // words, but very many: writing their source would itself hold the page
    const long = { ...d, boxes: d.boxes.map((b, i) => (i ? b : { ...b, text: 'é '.repeat(600_000) })) };
    const t = performance.now();
    const r = await runner([]).r.draw(long);
    assert.ok(performance.now() - t < 200, 'refused at once');
    assert.equal(r.limit, 'source');
    assert.ok(r.count > 1_200_000, `${r.count} bytes: each é is two, and the spaces are not counted`);
    assert.equal(r.atLeast, true, 'the source would be longer still');
    assert.equal(r.most, 1_000_000);
  });

  test('over the source limit as written, measured exactly in the worker before Graphviz runs', async () => {
    const d = drawingOf(READER);
    let rendered = 0;
    const engine = async () => ({ version: '0', render: () => (rendered++, '<svg/>') });
    const { r } = runner([], { rest: served(engine).spawn, limits: { sourceBytes: 500 } });
    const out = await r.draw(d);
    assert.equal(out.limit, 'source');
    assert.equal(out.atLeast, undefined, 'measured, not estimated');
    assert.equal(out.count, Buffer.byteLength(drawingSourceOf(d)), 'the bytes of the longer direction’s source');
    assert.equal(rendered, 0, 'Graphviz never ran');
  });

  test('at the limits exactly, nothing is refused', () => {
    assert.equal(tooLarge(huge(2000, 5000), LAYOUT_LIMITS), null);
  });

  test('the limits are the runner’s to change, as a setting will', async () => {
    const { r } = runner([], { rest: served().spawn, limits: { things: 2 } });
    assert.deepEqual(await r.draw(drawingOf(READER)), { reason: 'too-large', limit: 'things', count: 3, most: 2 });
  });
});

describe('the time limit', () => {
  test('a layout that never answers is stopped at the limit, "timed out", and the next works on a fresh worker', async () => {
    const stuck = silent();
    const fresh = served();
    const { r } = runner([stuck], { rest: fresh.spawn, limits: { ms: 50 } });
    const d = drawingOf(READER);
    assert.deepEqual(await r.draw(d), { reason: 'timed-out', ms: 50 });
    assert.equal(stuck.terminated, true, 'the stuck worker was terminated');
    const next = await r.draw(d);
    assert.equal(fresh.made.length, 1, 'a fresh worker was started');
    assert.deepEqual(next, draw(d, await loadEngine()));
  });

  test('a real thread busy for ever is terminated, and the page’s own thread was never held', async () => {
    let busy;
    const { r } = runner([], { rest: () => (busy = thread(BUSY_FOREVER)), limits: { ms: 300 } });
    let ticks = 0;
    const tick = setInterval(() => ticks++, 20);
    try {
      assert.deepEqual(await r.draw(drawingOf(READER)), { reason: 'timed-out', ms: 300 });
    } finally {
      clearInterval(tick);
    }
    assert.equal(busy.terminated, true);
    assert.ok(ticks >= 5, `this thread kept running while the worker was stuck: ${ticks} ticks`);
  });

  test('a layout waiting behind a stuck one is not charged for its wait: it is laid out on the fresh worker', async () => {
    const { r } = runner([silent()], { rest: served().spawn, limits: { ms: 50 } });
    const d = drawingOf(READER);
    const [first, second] = await Promise.all([r.draw(d), r.draw(d)]);
    assert.deepEqual(first, { reason: 'timed-out', ms: 50 });
    assert.match(second.svg, /^<svg/, 'the second was drawn');
  });

  test('a cold start is not charged to the layout: its time starts when the worker says its engine is ready', async () => {
    const slow = served(async () => (await sleep(300), loadEngine()));
    const { r } = runner([], { rest: slow.spawn, limits: { ms: 100 } });
    const drawn = await r.draw(drawingOf(READER));
    assert.match(drawn.svg, /^<svg/, 'drawn, though the engine took three times the layout’s limit to start');
  });

  test(`after ${TIMEOUTS_BEFORE_STOPPING} timeouts in a row no worker is started again: the rest are "stopped", told once`, async () => {
    const workers = [];
    const { r, told } = runner([], {
      rest: () => {
        const w = silent();
        workers.push(w);
        return w;
      },
      limits: { ms: 30 },
    });
    const d = drawingOf(READER);
    for (let i = 0; i < TIMEOUTS_BEFORE_STOPPING; i++) assert.equal((await r.draw(d)).reason, 'timed-out');
    assert.deepEqual(await r.draw(d), { reason: 'stopped', failures: TIMEOUTS_BEFORE_STOPPING });
    assert.deepEqual(await r.draw(d), { reason: 'stopped', failures: TIMEOUTS_BEFORE_STOPPING });
    assert.equal(workers.length, TIMEOUTS_BEFORE_STOPPING, 'no fourth worker');
    assert.deepEqual(told, ['stopped']);
  });
});

describe('the page’s own thread, only when the first worker cannot start', () => {
  test('a worker that cannot start at all hands over to the fallback, which is told why, once', async () => {
    const { r, told, page } = runner([silent({ fail: 'blocked' })]);
    assert.match((await r.draw(drawingOf(READER))).svg, /^<svg/);
    await r.draw(drawingOf(READER));
    assert.deepEqual(told, ['on-the-page']);
    assert.equal(page.made.length, 1, 'one port on the page, reused');
  });

  test('the engine failing in the first worker sends layouts to the page, told once', async () => {
    const broken = served(async () => {
      throw new Error('no WebAssembly in this worker');
    });
    const { r, told, page } = runner([broken.spawn()]);
    assert.match((await r.draw(drawingOf(READER))).svg, /^<svg/);
    assert.match((await r.draw(drawingOf(READER))).svg, /^<svg/);
    assert.deepEqual(told, ['on-the-page']);
    assert.equal(page.made.length, 1);
  });

  test('a replacement worker that fails to start never sends layouts to the page', async () => {
    const { r, told, page } = runner([silent(), silent({ fail: 'out of memory' })], {
      rest: served().spawn,
      limits: { ms: 50 },
    });
    const d = drawingOf(READER);
    assert.equal((await r.draw(d)).reason, 'timed-out');
    await assert.rejects(r.draw(d), /could not start: .*out of memory/);
    assert.match((await r.draw(d)).svg, /^<svg/, 'the next worker draws');
    assert.equal(page.made.length, 0);
    assert.deepEqual(told, []);
  });

  test('a layout handed to a worker is never retried on the page: timed out stays timed out, failed stays failed', async () => {
    const crashing = silent();
    const { r, page } = runner([silent(), crashing], { rest: served().spawn, limits: { ms: 50 } });
    const d = drawingOf(READER);
    assert.equal((await r.draw(d)).reason, 'timed-out');
    const second = r.draw(d);
    await sleep(20);
    assert.equal(crashing.posted.length, 1, 'handed to the second worker');
    crashing.onerror(new Error('crashed on a hostile graph'));
    await assert.rejects(second, /the layout worker failed/);
    assert.equal(page.made.length, 0, 'the page never saw either');
  });

  test('on the page, the tighter limits apply: a graph under the worker’s limits but over the page’s is refused there', async () => {
    const r = new LayoutRunner({ page: served().spawn, clock: CLOCK });
    const d = huge(301, 0);
    assert.equal(tooLarge(d, LAYOUT_LIMITS), null);
    assert.deepEqual(await r.draw(d), { reason: 'too-large', limit: 'things', count: 301, most: 300, page: true });
    const word = { ...drawingOf(READER) };
    word.boxes = word.boxes.map((b, i) => (i ? b : { ...b, text: 'x'.repeat(PAGE_LIMITS.word + 1) }));
    assert.equal((await r.draw(word)).limit, 'word');
  });
});

describe('a normal graph', () => {
  const { r } = runner([], { rest: () => thread(SERVING) });
  after(() => r.close());

  test('is drawn in a real thread exactly as on the page’s own thread: the same SVG, byte for byte', async () => {
    const engine = await loadEngine();
    for (const block of [READER, `// graph: g\n(a:A {name: 'Ä ünïcode'}), (b:B {name: 'b'}), (a)-[:R]->(b)`]) {
      const d = readNote([block]).graphs.values().next().value;
      assert.deepEqual(await r.draw(d), draw(d, engine));
    }
  });

  test('one worker is reused for every layout', async () => {
    const workers = served();
    const { r: counting } = runner([], { rest: workers.spawn });
    const d = drawingOf(READER);
    await Promise.all([counting.draw(d), counting.draw(d), counting.draw(d)]);
    await counting.draw(d);
    assert.equal(workers.made.length, 1);
  });

  test('a graph of 50 things is drawn through the worker in under half a second (spec §11)', async () => {
    const nodes = Array.from({ length: 50 }, (_, i) => `(n${i}:Thing {name: 'Thing ${i}, a few words long'})`);
    const links = Array.from({ length: 70 }, (_, i) => `(n${i % 50})-[:LINKS]->(n${(i * 7 + 3) % 50})`);
    const d = drawingOf(`// graph: g\n${[...nodes, ...links].join(',\n')}`, 'g');
    await r.draw(d); // warm: the worker's engine starts on its first layout
    const t = performance.now();
    const drawn = await r.draw(d);
    const ms = performance.now() - t;
    assert.match(drawn.svg, /^<svg/);
    assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
  });
});

describe('a layout no longer wanted', () => {
  test('20 quick edits to one block give at most two layouts, and other blocks are not starved', async () => {
    let posted = [];
    const counting = served();
    const spawn = () => {
      const port = counting.spawn();
      const send = port.postMessage;
      port.postMessage = (m) => (posted.push(m), send(m));
      return port;
    };
    const { r } = runner([], { rest: spawn });
    const editor = {},
      other = {};
    const d = drawingOf(READER);
    const edits = [];
    for (let i = 0; i < 20; i++) {
      edits.push(r.draw(d, editor));
      if (i === 10) edits.push(r.draw(huge(1, 0), other));
    }
    const results = await Promise.all(edits);
    const forEditor = posted.filter((m) => m.drawing === d);
    assert.ok(forEditor.length <= 2, `${forEditor.length} layouts of the edited block`);
    assert.match(results.at(-1).svg, /^<svg/, 'the last edit is drawn');
    assert.ok(
      posted.some((m) => m.drawing.boxes.length === 1),
      'the other block was laid out',
    );
    assert.equal(results.filter((x) => x === null).length, 20 - forEditor.length, 'the rest were answered: not wanted');
    posted = [];
  });

  test('on close, every layout waiting is answered quietly with null, never an error', async () => {
    const { r } = runner([], { rest: served().spawn });
    const d = drawingOf(READER);
    const waiting = [r.draw(d), r.draw(d), r.draw(d)];
    r.close();
    assert.deepEqual(await Promise.all(waiting), [null, null, null]);
  });

  test('a worker put away before it was ready leaves no timer behind, to hold the page or the process', async () => {
    const pending = new Set();
    const clock = {
      setTimeout: (run, ms) => {
        const t = setTimeout(() => (pending.delete(t), run()), ms);
        pending.add(t);
        return t;
      },
      clearTimeout: (t) => (pending.delete(t), clearTimeout(t)),
    };
    const r = new LayoutRunner({ worker: served().spawn, page: served().spawn, clock });
    const waiting = r.draw(drawingOf(READER));
    r.close();
    assert.equal(await waiting, null);
    assert.equal(pending.size, 0, 'the start limit’s timer went with the worker');
  });
});

describe('when the engine fails', () => {
  test('the failure is said, not swallowed, so the page can show its loud fallback', async () => {
    const failing = served(async () => {
      throw new Error('no WebAssembly here');
    });
    const r = new LayoutRunner({ page: failing.spawn, clock: CLOCK });
    await assert.rejects(r.draw(drawingOf(READER)), /no WebAssembly here/);
  });
});
