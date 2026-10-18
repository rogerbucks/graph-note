// The plug-in interface (editor spec §43, plugin_interface): one typed, versioned way in, which the built-in data exports
// use too, and through which a plug-in's own export is offered and written beside them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSION_POINTS, PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS, DATA_FORMATS, dataText } from '../src/export-data.ts';

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
  test('it is versioned, and its first extension point is the data exports', () => {
    assert.equal(PLUGIN_API, '1');
    assert.deepEqual(EXTENSION_POINTS, ['exports', 'theme'], 'the data exports first, then the theme tokens');
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

  test('a format nothing adds is said so, never written', () => {
    const r = pluginRegistry().writeData('names', DATA, INFO);
    assert.equal(r.ok, false);
    assert.match(r.message, /No plug-in adds the format "names"/);
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
