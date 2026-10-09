// The layout engine kept apart from the interface (spec §9, layout_contained): Graphviz runs in a worker the core talks to
// through a port it is given, with a time limit and a size limit, so a huge or hostile graph never freezes the page. Here
// the port is a fake, an in-thread one, or a real thread (worker_threads), each standing in for the browser's Worker.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readNote } from '../src/drawing.ts';
import { loadEngine, draw } from '../src/render.ts';
import { drawingSource } from '../src/layout.ts';
import { LAYOUT_LIMITS, LayoutRunner, inThreadPort, serveLayouts, tooLarge } from '../src/layout-worker.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
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

/** A port into the engine run in this thread, counting how often one is made. */
function counted() {
  const made = [];
  const spawn = () => {
    const port = inThreadPort((scope) => serveLayouts(scope, loadEngine));
    made.push(port);
    return port;
  };
  return { made, spawn };
}

/** A port that takes each request and never answers, as a worker stuck in a hostile graph does. */
function silent() {
  const port = { onmessage: null, onerror: null, posted: [], terminated: false };
  port.postMessage = (m) => port.posted.push(m);
  port.terminate = () => (port.terminated = true);
  return port;
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
const BUSY_FOREVER = `scope.onmessage = () => { for (;;); };`;

describe('the limits, checked before any layout', () => {
  test('the defaults: 2,000 things, 5,000 links, 1 MB of layout source, and 5 seconds', () => {
    assert.deepEqual(LAYOUT_LIMITS, { things: 2000, links: 5000, sourceBytes: 1_000_000, ms: 5000 });
  });

  test('over the things limit, the result is "too large", naming the limit and the numbers, and no worker is started', async () => {
    const { made, spawn } = counted();
    const runner = new LayoutRunner(spawn, CLOCK);
    const r = await runner.draw(huge(2001, 0));
    assert.deepEqual(r, { reason: 'too-large', limit: 'things', count: 2001, most: 2000 });
    assert.equal(made.length, 0, 'no layout was attempted');
  });

  test('over the links limit, the same, for links', async () => {
    const { made, spawn } = counted();
    const r = await new LayoutRunner(spawn, CLOCK).draw(huge(2, 5001));
    assert.deepEqual(r, { reason: 'too-large', limit: 'links', count: 5001, most: 5000 });
    assert.equal(made.length, 0);
  });

  test('over the source limit by its texts alone — few things, one written at great length — refused unwritten', async () => {
    const d = drawingOf(READER);
    // one word, with no space to wrap at: writing its source would itself hold the page for minutes
    const long = { ...d, boxes: d.boxes.map((b, i) => (i ? b : { ...b, text: 'é'.repeat(600_000) })) };
    const { made, spawn } = counted();
    const t = performance.now();
    const r = await new LayoutRunner(spawn, CLOCK).draw(long);
    assert.ok(performance.now() - t < 200, 'refused at once');
    assert.equal(r.reason, 'too-large');
    assert.equal(r.limit, 'source');
    assert.ok(r.count > 1_200_000, `${r.count} bytes: each é is two`);
    assert.equal(r.atLeast, true, 'the source would be longer still');
    assert.equal(r.most, 1_000_000);
    assert.equal(made.length, 0);
  });

  test('over the source limit as written, measured exactly in the worker before Graphviz runs', async () => {
    const d = drawingOf(READER);
    let rendered = 0;
    const runner = new LayoutRunner(
      () =>
        inThreadPort((s) =>
          serveLayouts(s, async () => ({
            version: '0',
            render: () => (rendered++, '<svg/>'),
          })),
        ),
      CLOCK,
      () => ({ ...LAYOUT_LIMITS, sourceBytes: 500 }),
    );
    const r = await runner.draw(d);
    assert.equal(r.limit, 'source');
    assert.equal(r.atLeast, undefined, 'measured, not estimated');
    assert.equal(r.count, Buffer.byteLength(drawingSourceOf(d)), 'the bytes of the longer direction’s source');
    assert.equal(rendered, 0, 'Graphviz never ran');
  });

  test('at the limits exactly, nothing is refused', () => {
    assert.equal(tooLarge(huge(2000, 5000), LAYOUT_LIMITS), null);
  });

  test('the limits are the runner’s to change, as a setting will', async () => {
    const { spawn } = counted();
    const runner = new LayoutRunner(spawn, CLOCK, () => ({ ...LAYOUT_LIMITS, things: 2 }));
    assert.deepEqual(await runner.draw(drawingOf(READER)), { reason: 'too-large', limit: 'things', count: 3, most: 2 });
  });
});

describe('the time limit', () => {
  test('a layout that never answers is stopped at the limit, "timed out", and the next works on a fresh worker', async () => {
    const stuck = silent();
    const { made, spawn } = counted();
    const ports = [stuck];
    const runner = new LayoutRunner(
      () => ports.shift() ?? spawn(),
      CLOCK,
      () => ({ ...LAYOUT_LIMITS, ms: 50 }),
    );
    const d = drawingOf(READER);
    assert.deepEqual(await runner.draw(d), { reason: 'timed-out', ms: 50 });
    assert.equal(stuck.terminated, true, 'the stuck worker was terminated');
    const next = await runner.draw(d);
    assert.equal(made.length, 1, 'a fresh worker was started');
    assert.deepEqual(next, draw(d, await loadEngine()));
  });

  test('a real thread busy for ever is terminated, and the page’s own thread was never held', async () => {
    let busy;
    const runner = new LayoutRunner(
      () => (busy = thread(BUSY_FOREVER)),
      CLOCK,
      () => ({ ...LAYOUT_LIMITS, ms: 300 }),
    );
    let ticks = 0;
    const tick = setInterval(() => ticks++, 20);
    try {
      assert.deepEqual(await runner.draw(drawingOf(READER)), { reason: 'timed-out', ms: 300 });
    } finally {
      clearInterval(tick);
    }
    assert.equal(busy.terminated, true);
    assert.ok(ticks >= 5, `this thread kept running while the worker was stuck: ${ticks} ticks`);
  });

  test('a layout waiting behind a stuck one is not charged for its wait: it is laid out on the fresh worker', async () => {
    const stuck = silent();
    const { spawn } = counted();
    const ports = [stuck];
    const runner = new LayoutRunner(
      () => ports.shift() ?? spawn(),
      CLOCK,
      () => ({ ...LAYOUT_LIMITS, ms: 50 }),
    );
    const d = drawingOf(READER);
    const [first, second] = await Promise.all([runner.draw(d), runner.draw(d)]);
    assert.deepEqual(first, { reason: 'timed-out', ms: 50 });
    assert.equal(second.reason, undefined, 'the second was drawn');
    assert.match(second.svg, /^<svg/);
  });
});

describe('a normal graph', () => {
  const runner = new LayoutRunner(() => thread(SERVING), CLOCK);
  after(() => runner.close());

  test('is drawn in a real thread exactly as on the page’s own thread: the same SVG, byte for byte', async () => {
    const engine = await loadEngine();
    for (const block of [READER, `// graph: g\n(a:A {name: 'Ä ünïcode'}), (b:B {name: 'b'}), (a)-[:R]->(b)`]) {
      const d = readNote([block]).graphs.values().next().value;
      assert.deepEqual(await runner.draw(d), draw(d, engine));
    }
  });

  test('one worker is reused for every layout', async () => {
    let spawned = 0;
    const counting = new LayoutRunner(() => (spawned++, inThreadPort((s) => serveLayouts(s, loadEngine))), CLOCK);
    const d = drawingOf(READER);
    await Promise.all([counting.draw(d), counting.draw(d), counting.draw(d)]);
    await counting.draw(d);
    assert.equal(spawned, 1);
  });

  test('a graph of 50 things is drawn through the worker in under half a second (spec §11)', async () => {
    const nodes = Array.from({ length: 50 }, (_, i) => `(n${i}:Thing {name: 'Thing ${i}, a few words long'})`);
    const links = Array.from({ length: 70 }, (_, i) => `(n${i % 50})-[:LINKS]->(n${(i * 7 + 3) % 50})`);
    const d = drawingOf(`// graph: g\n${[...nodes, ...links].join(',\n')}`, 'g');
    await runner.draw(d); // warm: the worker's engine starts on its first layout
    const t = performance.now();
    const drawn = await runner.draw(d);
    const ms = performance.now() - t;
    assert.match(drawn.svg, /^<svg/);
    assert.ok(ms < 500, `${ms.toFixed(0)} ms`);
  });
});

describe('when the engine fails', () => {
  test('the failure is said, not swallowed, so the page can show its loud fallback', async () => {
    const runner = new LayoutRunner(
      () =>
        inThreadPort((s) =>
          serveLayouts(s, async () => {
            throw new Error('no WebAssembly here');
          }),
        ),
      CLOCK,
    );
    await assert.rejects(runner.draw(drawingOf(READER)), /no WebAssembly here/);
  });

  test('a worker that cannot start at all hands over to the fallback, which is told why, once', async () => {
    const told = [];
    const broken = silent();
    const runner = new LayoutRunner(() => broken, CLOCK, undefined, {
      spawn: () => inThreadPort((s) => serveLayouts(s, loadEngine)),
      told: (why) => told.push(why),
    });
    const drawn = runner.draw(drawingOf(READER));
    broken.onerror?.(new Error('blocked'));
    assert.match((await drawn).svg, /^<svg/);
    await runner.draw(drawingOf(READER));
    assert.equal(told.length, 1);
    assert.equal(broken.terminated, true);
  });
});
