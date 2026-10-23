// Graph sources and graph steps a plug-in adds (editor spec §43, plugin_interface; §54, trust_source_joined). What
// they give back is held as a joined graph:
// - it carries where it came from, each place named with its plug-in;
// - a source's graph starts untrusted, and a step's keeps the lowest trust of what went in;
// - an unlabelled graph counts as the strictest class, and a step's keeps the strictest class of what went in;
// - one past the read limits is refused, never read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { READ_LIMITS } from '../src/layout-limits.ts';

const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const GRAPH = `// graph: trip
(paris:City {name: 'Paris'}),
(rome:City {name: 'Rome'}),
(paris)-[:TO]->(rome)`;

const plugin = (over = {}) => ({
  id: 'acme.db',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['sources', 'steps'],
  register: (points) => {
    points.sources.add({ scheme: 'acme', title: 'Acme', read: (target) => ({ text: GRAPH, classification: target }) });
    points.steps.add({ id: 'acme.db.same', title: 'Same', run: (inputs) => inputs[0] });
  },
  ...over,
});
const installed = (over) => {
  const registry = pluginRegistry();
  registry.register(plugin(over));
  return registry;
};
const read = async (registry, target) => {
  const r = await registry.readGraph('acme', target, LEVELS);
  assert.ok(r.ok, r.message);
  return r.value;
};

describe('a graph from a plug-in source is a joined graph (trust_source_joined)', () => {
  test('it carries its source, starts untrusted and is read', async () => {
    const g = await read(installed(), 'Internal');
    assert.deepEqual(g.origins, [{ plugin: 'acme.db', place: 'acme:Internal' }]);
    assert.equal(g.trust, 'untrusted');
    assert.equal(g.level, 'Internal');
    assert.ok(g.reading.graphs.has('trip'));
    assert.ok(Object.isFrozen(g) && Object.isFrozen(g.origins), 'and nothing can change it after');
  });

  test('an unlabelled graph, or one of a class not set, counts as the strictest class', async () => {
    const registry = installed({
      register: (points) => {
        points.sources.add({
          scheme: 'acme',
          title: 'Acme',
          read: (t) => (t === 'none' ? { text: GRAPH } : { text: GRAPH, classification: 'Top secret' }),
        });
      },
    });
    assert.equal((await read(registry, 'none')).level, 'Restricted');
    assert.equal((await read(registry, 'odd')).level, 'Restricted');
  });

  test('a graph past the read limits is refused, naming the limit, and not read', async () => {
    const big = `${GRAPH}\n// ${'x'.repeat(READ_LIMITS.bytes)}`;
    const registry = installed({
      register: (points) => points.sources.add({ scheme: 'acme', title: 'Acme', read: () => ({ text: big }) }),
    });
    const r = await registry.readGraph('acme', 'x', LEVELS);
    assert.equal(r.ok, false);
    assert.match(
      r.message,
      new RegExp(`Acme of acme\\.db was refused: it is \\d+ bytes, over the ${READ_LIMITS.bytes} a graph may be`),
    );
  });

  test('a source that gives no text, or fails, is named and nothing is held', async () => {
    for (const read of [() => 'just text', () => Promise.reject(new Error('no line'))]) {
      const registry = installed({
        register: (points) => points.sources.add({ scheme: 'acme', title: 'Acme', read }),
      });
      const r = await registry.readGraph('acme', 'x', LEVELS);
      assert.equal(r.ok, false);
      assert.equal(r.plugin, 'acme.db');
      assert.match(r.message, /The source Acme of acme\.db (gave no graph text|failed: no line)/);
    }
  });

  test('a source that takes too long is stopped, as any call is', async () => {
    let t = 0;
    const registry = pluginRegistry({ now: () => t });
    registry.register(
      plugin({
        register: (points) =>
          points.sources.add({
            scheme: 'acme',
            title: 'Acme',
            read: async () => {
              t += 5000;
              return { text: GRAPH };
            },
          }),
      }),
    );
    const r = await registry.readGraph('acme', 'x', LEVELS);
    assert.match(r.message, /ran too long/);
    assert.deepEqual(
      registry.stopped().map((s) => s.plugin),
      ['acme.db'],
    );
  });
});

describe('a graph from a plug-in step keeps the lowest trust and strictest class of its inputs', () => {
  test('a step gets the inputs’ text and class, and its graph adds its own place to theirs', async () => {
    let given;
    const registry = installed({
      register: (points) => {
        points.sources.add({ scheme: 'acme', title: 'Acme', read: (t) => ({ text: GRAPH, classification: t }) });
        points.steps.add({
          id: 'acme.db.merge',
          title: 'Merge',
          run: (inputs) => {
            given = inputs;
            return { text: GRAPH, classification: 'Public' };
          },
        });
      },
    });
    const a = await read(registry, 'Public');
    const b = await read(registry, 'Confidential');
    const r = await registry.runStep('acme.db.merge', [a, b], LEVELS);
    assert.ok(r.ok, r.message);
    assert.deepEqual(given, [
      { text: GRAPH, classification: 'Public' },
      { text: GRAPH, classification: 'Confidential' },
    ]);
    assert.ok(Object.isFrozen(given), 'and cannot change them');
    assert.equal(r.value.level, 'Confidential', 'a lower label does not lower the class');
    assert.equal(r.value.trust, 'untrusted');
    assert.deepEqual(r.value.origins, [
      { plugin: 'acme.db', place: 'acme:Public' },
      { plugin: 'acme.db', place: 'acme:Confidential' },
      { plugin: 'acme.db', place: 'step acme.db.merge' },
    ]);
  });

  test('a step never raises trust: it keeps the lowest of its inputs', async () => {
    const registry = installed();
    const own = { ...(await read(registry, 'Public')), trust: 'own' };
    const trusted = { ...own, trust: 'trusted' };
    const r = await registry.runStep('acme.db.same', [own, trusted], LEVELS);
    assert.equal(r.value.trust, 'trusted');
    const none = await registry.runStep('acme.db.same', [own], LEVELS);
    assert.equal(none.value.trust, 'own');
  });

  test('an unlabelled step graph keeps the strictest class of its inputs, and with none counts as the strictest', async () => {
    const registry = installed({
      register: (points) => {
        points.sources.add({ scheme: 'acme', title: 'Acme', read: (t) => ({ text: GRAPH, classification: t }) });
        points.steps.add({ id: 'acme.db.bare', title: 'Bare', run: () => ({ text: GRAPH }) });
      },
    });
    const a = await read(registry, 'Internal');
    assert.equal((await registry.runStep('acme.db.bare', [a], LEVELS)).value.level, 'Internal');
    assert.equal((await registry.runStep('acme.db.bare', [], LEVELS)).value.level, 'Restricted');
  });

  test('a step graph past the read limits is refused', async () => {
    const big = `${GRAPH}\n${'// x\n'.repeat(READ_LIMITS.lines)}`;
    const registry = installed({
      register: (points) => points.steps.add({ id: 'acme.db.grow', title: 'Grow', run: () => ({ text: big }) }),
    });
    const r = await registry.runStep('acme.db.grow', [], LEVELS);
    assert.equal(r.ok, false);
    assert.match(
      r.message,
      new RegExp(
        `The step Grow of acme\\.db was refused: it is \\d+ lines, over the ${READ_LIMITS.lines} a graph may be`,
      ),
    );
  });
});

describe('what a source or step must be to be added', () => {
  for (const [what, add, why] of [
    [
      'a source not named by a lower-case word',
      (p) => p.sources.add({ scheme: 'Acme', title: 'A', read: () => {} }),
      /the source "Acme" is not named by a lower-case word/,
    ],
    [
      'a source with no reader',
      (p) => p.sources.add({ scheme: 'acme', title: 'A' }),
      /the source "acme" reads nothing/,
    ],
    [
      'a step not under its plug-in’s id',
      (p) => p.steps.add({ id: 'other.x', title: 'X', run: () => {} }),
      /the step "other.x" is not named acme\.db\.<word>/,
    ],
    [
      'a step that does nothing',
      (p) => p.steps.add({ id: 'acme.db.x', title: 'X' }),
      /the step "acme.db.x" does nothing/,
    ],
  ])
    test(`${what} is refused, and nothing is installed`, () => {
      const registry = pluginRegistry();
      assert.throws(() => registry.register(plugin({ register: add })), why);
      assert.deepEqual(registry.graphSources(), []);
      assert.deepEqual(registry.graphSteps(), []);
    });

  test('a scheme or step taken by another plug-in is refused', () => {
    const registry = installed();
    assert.throws(
      () =>
        registry.register(
          plugin({
            id: 'acme.two',
            uses: ['sources'],
            register: (p) => p.sources.add({ scheme: 'acme', title: 'A', read: () => {} }),
          }),
        ),
      /the source "acme" is already added by acme\.db/,
    );
  });

  test('asking for a source or step no plug-in adds says so', async () => {
    const registry = pluginRegistry();
    assert.match((await registry.readGraph('none', 'x', LEVELS)).message, /No plug-in adds the source "none"/);
    assert.match((await registry.runStep('none', [], LEVELS)).message, /No plug-in adds the step "none"/);
  });
});
