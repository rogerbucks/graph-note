// The contract suite of each extension point (editor spec §43, plugin_contract_suites): the data exports, storage and
// commands. Every built-in passes its point's suite. What breaks a promise fails the check that holds it, saying what
// was wanted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { commandContract, exporterContract, sampleExports, storageBackendContract } from '../src/plugins-contract.ts';
import { SAMPLE_GRAPH, providerContract, sourceContract, stepContract } from '../src/plugins-contract.ts';
import { pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS } from '../src/export-data.ts';
import { memoryStorage } from '../src/note-storage.ts';
import { CORE_STORAGE } from '../src/core-storage.ts';

const registry = pluginRegistry();
registry.register(CORE_EXPORTS);
registry.register(CORE_STORAGE);

/** The names of the checks `e` fails, with their messages. */
const failures = (e) =>
  exporterContract(e).flatMap((c) => {
    try {
      c.run();
      return [];
    } catch (err) {
      return [`${c.name}: ${err.message}`];
    }
  });

describe('the data export contract', () => {
  for (const e of registry.exporters())
    test(`the built-in ${e.title} export passes every check`, () => {
      assert.deepEqual(failures(e), []);
    });

  test('it tries each export on none, a graph with notes, and a view with its faded context', () => {
    assert.deepEqual(Object.keys(sampleExports()), ['empty', 'small', 'faded']);
  });

  const base = { format: 'x', title: 'X', extension: 'txt', mime: 'text/plain' };
  let n = 0;
  for (const [broken, e, check] of [
    ['an export that gives no text', { ...base, write: () => undefined }, 'it writes text'],
    ['an export that writes differently each time', { ...base, write: () => String(n++) }, 'it writes the same bytes'],
    [
      'an export that changes what it is given',
      { ...base, write: (d) => (d.things.push(['z', [], {}]), '') },
      'it leaves the export',
    ],
    ['an export with no media type', { ...base, mime: '', write: () => '' }, 'it is offered under a title'],
  ])
    test(`${broken} fails the check that holds it`, () => {
      const failed = failures(e).filter((f) => f.startsWith(check));
      assert.equal(failed.length, 1, failures(e).join('\n'));
      assert.match(failed[0], /wanted .+, got /);
    });

  for (const b of registry.storages())
    test(`the built-in ${b.title} storage passes every check of the note storage contract`, async () => {
      for (const check of storageBackendContract(b)) await check.run();
    });

  test('a storage that keeps notes from one opening to the next fails the check that wants an empty store', async () => {
    const kept = memoryStorage({ 'old.md': 'left over' });
    const [empty] = storageBackendContract({ name: 'kept', title: 'Kept', open: () => kept });
    await assert.rejects(empty.run(), /wanted /);
  });

  test('a command passes its checks, and one with no id of its plug-in, a title of two lines or no run fails', () => {
    const go = { id: 'acme.tags.count', title: 'Count the tags', run: () => {} };
    const fails = (c) =>
      commandContract(c, 'acme.tags').flatMap((check) => {
        try {
          check.run();
          return [];
        } catch (err) {
          return [check.name];
        }
      });
    assert.deepEqual(fails(go), []);
    assert.deepEqual(fails({ ...go, id: 'count' }), [
      'it is named under its plug-in’s own id, and offered under a title on one line',
    ]);
    assert.deepEqual(fails({ ...go, title: 'Count\nthe tags' }), [
      'it is named under its plug-in’s own id, and offered under a title on one line',
    ]);
    assert.deepEqual(fails({ ...go, run: undefined }), ['it can be run']);
  });
});

/** The names of the checks `checks` fail. */
const failing = async (checks) => {
  const out = [];
  for (const c of checks)
    try {
      await c.run();
    } catch {
      out.push(c.name);
    }
  return out;
};

describe('the graph source and step contracts', () => {
  const source = { scheme: 'acme', title: 'Acme', read: async () => SAMPLE_GRAPH };
  const step = { id: 'acme.db.same', title: 'Same', run: (inputs) => inputs[0] };

  test('a source and a step that keep their promises pass every check', async () => {
    assert.deepEqual(await failing(sourceContract(source, 'orders')), []);
    assert.deepEqual(await failing(stepContract(step, 'acme.db')), []);
  });

  test('a source that gives no graph text, or one past the read limits, fails the check that holds it', async () => {
    const wanted = ['it gives back a graph’s text for a place, within the read limits'];
    assert.deepEqual(await failing(sourceContract({ ...source, read: () => 'text' }, 'x')), wanted);
    const big = { text: 'x\n'.repeat(20_000) };
    assert.deepEqual(await failing(sourceContract({ ...source, read: () => big }, 'x')), wanted);
  });

  test('a step not under its plug-in’s id, or one that gives a different graph each time, fails', async () => {
    let n = 0;
    const changing = { ...step, run: () => ({ text: `// graph: g${n++}` }) };
    assert.deepEqual(await failing(stepContract(changing, 'acme.db')), [
      'it gives back the same graph each time for the same graphs',
    ]);
    assert.deepEqual(await failing(stepContract({ ...step, id: 'other.same' }, 'acme.db')), [
      'it is named under its plug-in’s own id, and offered under a title on one line',
    ]);
  });
});

describe('the AI provider contract', () => {
  const echo = {
    name: 'echo',
    title: 'Echo',
    shape: (r) => JSON.stringify(r),
    read: ({ status, text }) => {
      if (status !== 200) return { refused: `HTTP ${status}` };
      try {
        return { content: JSON.parse(text).output ?? '' };
      } catch {
        return { unread: 'not JSON' };
      }
    },
  };
  const names = (p) =>
    providerContract(p).flatMap((c) => {
      try {
        c.run();
        return [];
      } catch {
        return [c.name];
      }
    });

  test('a provider that keeps its promises passes every check', () => {
    assert.deepEqual(names(echo), []);
  });

  test('one that drops the asked text, or throws on a reply, fails the check that holds it', () => {
    assert.deepEqual(names({ ...echo, shape: () => '{}' }), [
      'it shapes a request as text, the same each time, holding what it was asked',
    ]);
    assert.deepEqual(names({ ...echo, read: ({ text }) => ({ content: JSON.parse(text).output }) }), [
      'it reads an answer, a refusal or nothing from any reply, and never throws',
    ]);
  });
});
