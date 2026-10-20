// The plug-in interface (editor spec §43, plugin_interface): one typed, versioned way in, which the built-in data
// exports and storage use too. A plug-in's own export, storage or command is offered through it beside them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSION_POINTS, PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS, DATA_FORMATS, dataText } from '../src/export-data.ts';
import { CORE_STORAGE, memoryStorage } from '../src/note-storage.ts';

const DATA = { graph: 'g', things: [['a', ['Thing'], { id: 'a', name: 'A' }]], links: [] };
const INFO = { note: 'A.md', date: '2026-10-17' };

/** A plug-in that adds one export, a list of names. */
const NAMES = {
  id: 'acme.names',
  version: '0.1.0',
  api: PLUGIN_API,
  uses: ['exports'],
  register: (points) =>
    points.exports.add({
      format: 'names',
      title: 'Names',
      extension: 'txt',
      mime: 'text/plain',
      write: (data) => data.things.map(([, , p]) => p.name).join('\n'),
    }),
};

describe('the plug-in interface', () => {
  test('it is versioned, and its extension points are the data exports, the theme, storage and commands', () => {
    assert.equal(PLUGIN_API, '1');
    assert.deepEqual(EXTENSION_POINTS, ['exports', 'theme', 'storage', 'commands']);
  });

  test('the built-in storage is added through it, and opens an empty store each time', async () => {
    const registry = pluginRegistry();
    registry.register(CORE_STORAGE);
    assert.deepEqual(registry.plugins(), ['thoughtknot.storage']);
    assert.deepEqual(
      registry.storages().map((b) => [b.name, b.title]),
      [['memory', 'In memory']],
    );
    const opened = registry.openStorage('memory');
    assert.equal(opened.ok, true);
    await opened.value.write('a.md', 'A', { expected: null });
    assert.deepEqual(await registry.openStorage('memory').value.list(), [], 'a fresh store, not the last one');
  });

  test('a plug-in’s storage and commands are offered beside the built-ins and reached through the registry', async () => {
    const registry = pluginRegistry();
    const ran = [];
    registry.register(CORE_STORAGE);
    registry.register({
      id: 'acme.drive',
      version: '1.0.0',
      api: PLUGIN_API,
      uses: ['storage', 'commands'],
      register: (points) => {
        points.storage.add({ name: 'drive', title: 'Acme Drive', open: () => memoryStorage({ 'a.md': 'A' }) });
        points.commands.add({ id: 'acme.drive.sync', title: 'Sync with Acme Drive', run: () => ran.push('sync') });
      },
    });
    assert.deepEqual(
      registry.storages().map((b) => b.name),
      ['memory', 'drive'],
    );
    assert.deepEqual(await registry.openStorage('drive').value.list(), ['a.md']);
    assert.deepEqual(
      registry.commands().map((c) => c.id),
      ['acme.drive.sync'],
    );
    assert.deepEqual(registry.runCommand('acme.drive.sync'), { ok: true, value: undefined });
    assert.deepEqual(ran, ['sync']);
  });

  test('the built-in data exports are added through it, as any plug-in’s are', () => {
    const registry = pluginRegistry();
    registry.register(CORE_EXPORTS);
    assert.deepEqual(registry.plugins(), ['thoughtknot.data-exports']);
    assert.deepEqual(
      registry.exporters().map((e) => e.format),
      [...DATA_FORMATS],
    );
    for (const format of DATA_FORMATS)
      assert.deepEqual(registry.writeData(format, DATA, INFO), { ok: true, value: dataText(DATA, format, INFO) });
  });

  test('a plug-in’s export is offered beside the built-ins and written through the registry', () => {
    const registry = pluginRegistry();
    registry.register(CORE_EXPORTS);
    registry.register(NAMES);
    assert.deepEqual(registry.plugins(), ['thoughtknot.data-exports', 'acme.names']);
    assert.equal(registry.exporter('names').title, 'Names');
    assert.deepEqual(registry.writeData('names', DATA, INFO), { ok: true, value: 'A' });
  });

  test('a format, storage or command nothing adds is said so, never reached', () => {
    const r = pluginRegistry().writeData('names', DATA, INFO);
    assert.equal(r.ok, false);
    assert.match(r.message, /No plug-in adds the format "names"/);
    assert.match(pluginRegistry().openStorage('drive').message, /No plug-in adds the storage "drive"/);
    assert.match(pluginRegistry().runCommand('acme.go').message, /No plug-in adds the command "acme.go"/);
  });

  test('what the registry hands out cannot change what it holds', () => {
    const registry = pluginRegistry();
    registry.register(NAMES);
    registry.exporters().pop();
    registry.plugins().pop();
    assert.equal(registry.exporters().length, 1);
    assert.deepEqual(registry.plugins(), ['acme.names']);
  });
});
