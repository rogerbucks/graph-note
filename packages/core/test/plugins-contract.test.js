// The contract suite of each extension point (editor spec §43, plugin_contract_suites): the data exports, storage and
// commands. Every built-in passes its point's suite. What breaks a promise fails the check that holds it, saying what
// was wanted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { commandContract, exporterContract, sampleExports, storageBackendContract } from '../src/plugins-contract.ts';
import { pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS } from '../src/export-data.ts';
import { CORE_STORAGE, memoryStorage } from '../src/note-storage.ts';

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
