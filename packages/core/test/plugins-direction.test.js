// Every plug-in works in a right-to-left language (editor spec §43, plugin_rtl). The words it adds, the titles of its
// exports, storage and commands, force no direction of their own. So each reads in the host's direction, and a host
// shows each isolated, so a name keeps its own direction beside it. Each point's contract suite checks it, and the
// built-ins pass.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { commandContract, exporterContract, storageBackendContract } from '../src/plugins-contract.ts';
import { pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS } from '../src/export-data.ts';
import { CORE_STORAGE, memoryStorage } from '../src/note-storage.ts';

const CHECK = 'its title reads in the host’s direction, forcing none of its own';

/** The direction check among `checks`, run: undefined when it passes, else what it said. */
const direction = async (checks) => {
  const check = checks.find((c) => c.name === CHECK);
  assert.ok(check, 'the point’s contract checks the direction of its title');
  try {
    await check.run();
    return undefined;
  } catch (err) {
    return err.message;
  }
};

/** Each point's checks of a thing with the title `title`. */
const POINTS = {
  export: (title) => exporterContract({ format: 'x', title, extension: 'txt', mime: 'text/plain', write: () => '' }),
  storage: (title) => storageBackendContract({ name: 'x', title, open: () => memoryStorage() }),
  command: (title) => commandContract({ id: 'acme.x.go', title, run: () => {} }, 'acme.x'),
};

/** A mark of each kind that forces a direction. */
const FORCING = {
  'a right-to-left mark': 'تصدير‏',
  'a left-to-right embedding': '‪Export‬',
  'a right-to-left override': '‮Export‬',
  'a left-to-right isolate': '⁦Export⁩',
  'an Arabic letter mark': 'تصدير؜',
};

describe('a plug-in in a right-to-left language', () => {
  for (const [point, checks] of Object.entries(POINTS)) {
    test(`a ${point} titled in Arabic, Hebrew or English reads in the host’s direction`, async () => {
      for (const title of ['تصدير الرسم', 'ייצוא הגרף', 'Export the graph', 'CSV · تصدير'])
        assert.equal(await direction(checks(title)), undefined, title);
    });

    for (const [mark, title] of Object.entries(FORCING))
      test(`a ${point} whose title has ${mark} fails, as it forces its own direction`, async () => {
        assert.match(await direction(checks(title)), /wanted a title with no direction marks/);
      });
  }

  test('every built-in’s titles read in the host’s direction', async () => {
    const registry = pluginRegistry();
    registry.register(CORE_EXPORTS);
    registry.register(CORE_STORAGE);
    for (const e of registry.exporters()) assert.equal(await direction(exporterContract(e)), undefined, e.title);
    for (const b of registry.storages()) assert.equal(await direction(storageBackendContract(b)), undefined, b.title);
  });
});
