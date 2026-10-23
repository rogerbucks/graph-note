// The plug-in interface (editor spec §43, plugin_interface): one typed, versioned way in, which the built-in data
// exports and storage use too. A plug-in's own export, storage or command is offered through it beside them.
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { EXTENSION_POINTS, PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS, DATA_FORMATS, dataText } from '../src/export-data.ts';
import { memoryStorage } from '../src/note-storage.ts';
import { CORE_STORAGE } from '../src/core-storage.ts';

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
  test('it is versioned, and its extension points are the data exports, the theme, storage, commands, panels, graph sources and steps, and AI providers', () => {
    assert.equal(PLUGIN_API, '1.1');
    assert.deepEqual(EXTENSION_POINTS, [
      'exports',
      'theme',
      'storage',
      'commands',
      'panels',
      'sources',
      'steps',
      'ai',
      'diagrams',
    ]);
  });

  test('a plug-in’s panel is offered through the registry and drawn into the element the host gives', () => {
    const registry = pluginRegistry();
    registry.register({
      id: 'acme.tags',
      version: '1.0.0',
      api: PLUGIN_API,
      uses: ['panels'],
      register: (points) =>
        points.panels.add({ id: 'acme.tags.list', title: 'Tags', render: (el) => (el.drawn = `tags, ${el.dir}`) }),
    });
    assert.deepEqual(
      registry.panels().map((p) => [p.id, p.title]),
      [['acme.tags.list', 'Tags']],
    );
    const el = { dir: 'rtl' };
    assert.deepEqual(registry.showPanel('acme.tags.list', el), { ok: true, value: undefined });
    assert.equal(el.drawn, 'tags, rtl');
    assert.match(registry.showPanel('acme.none', el).message, /No plug-in adds the panel "acme.none"/);
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

describe('what a plug-in’s call says when it fails, in the person’s language', () => {
  afterEach(() => setLanguage(SOURCE_LANGUAGE));

  /** A plug-in whose export throws, whose command runs too long, and whose source and diagram give back nothing usable. */
  const faulty = (clock) => ({
    id: 'acme.faulty',
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['exports', 'commands', 'sources', 'diagrams'],
    register: (points) => {
      const write = () => {
        throw new Error('out of ink');
      };
      points.exports.add({ format: 'ink', title: 'Ink', extension: 'txt', mime: 'text/plain', write });
      points.commands.add({ id: 'acme.faulty.go', title: 'Go', run: () => void (clock.now += 5000) });
      points.sources.add({ scheme: 'faulty', title: 'Faulty', read: () => ({ text: 'x'.repeat(1_200_000) }) });
      points.diagrams.add({ type: 'acme.faulty.chart', title: 'Chart', draw: () => 'no marks' });
    },
  });

  // proves: words_catalogue
  test('nothing adds it, it failed, ran too long, was not run, or gave back nothing usable: each is said in it', async () => {
    setLanguage('en-XA');
    const clock = { now: 0 };
    const registry = pluginRegistry({ now: () => clock.now });
    registry.register(faulty(clock));
    const shape = { things: [], links: [] };
    const said = [
      registry.writeData('none', DATA, INFO).message,
      registry.writeData('ink', DATA, INFO).message,
      (await registry.readGraph('faulty', 'x', ['Public'])).message,
      (await registry.drawDiagram('acme.faulty.chart', shape, { width: 100, height: 100 })).message,
      (await registry.drawDiagram('acme.faulty.chart', shape, { width: 0, height: 0 })).message,
      registry.runCommand('acme.faulty.go').message,
      registry.runCommand('acme.faulty.go').message,
      registry.stopped()[0].why,
    ];
    for (const words of said) assert.ok(isPseudoWord(words), words);
    assert.throws(() => registry.register(faulty(clock)), /^Error: The plug-in acme\.faulty was not installed/);
  });
});
