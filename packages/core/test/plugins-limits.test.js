// What a plug-in is held to (editor spec §43, plugin_manifest_limits):
// - its manifest is checked before anything it adds;
// - it is given only the extension points its manifest names;
// - a plug-in refused leaves nothing behind;
// - an export that throws or gives no text is caught and named, never let through;
// - a call that runs too long is named, its answer dropped and its plug-in stopped;
// - it is given only the host abilities its manifest names, and one the host does not offer is refused.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_ABILITIES, PLUGIN_API, PLUGIN_TIME_LIMIT, pluginRegistry } from '../src/plugins.ts';
import { memoryStorage } from '../src/note-storage.ts';

const exporter = (format, write = () => 'ok') => ({
  format,
  title: format.toUpperCase(),
  extension: 'txt',
  mime: 'text/plain',
  write,
});
const plugin = (over = {}) => ({
  id: 'acme.one',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['exports'],
  register: (points) => points.exports.add(exporter('one')),
  ...over,
});
const DATA = { graph: 'g', things: [], links: [] };
const INFO = { note: 'A.md', date: '2026-10-17' };

describe('a plug-in’s manifest and limits', () => {
  for (const [what, over, why] of [
    ['an id that is not dotted words', { id: 'Acme' }, /its id must be dotted lower-case words/],
    ['a version that is not major.minor.patch', { version: '1.0' }, /its version "1.0" is not major.minor.patch/],
    ['another version of the interface', { api: '2' }, /built for version 2 of the interface, not 1/],
    ['an extension point that does not exist', { uses: ['exports', 'telepathy'] }, /do not exist: telepathy/],
  ])
    test(`${what} is refused, saying why, and nothing is installed`, () => {
      const registry = pluginRegistry();
      assert.throws(() => registry.register(plugin(over)), why);
      assert.deepEqual(registry.plugins(), []);
      assert.deepEqual(registry.exporters(), []);
    });

  test('a plug-in is given only the extension points its manifest names', () => {
    let given;
    pluginRegistry().register(plugin({ uses: [], register: (points) => (given = points) }));
    assert.deepEqual(Object.keys(given), []);
    assert.ok(Object.isFrozen(given), 'and cannot add one to them');
  });

  test('the same id twice, or a format another plug-in added, is refused', () => {
    const registry = pluginRegistry();
    registry.register(plugin());
    assert.throws(() => registry.register(plugin()), /a plug-in with that id is installed already/);
    assert.throws(
      () => registry.register(plugin({ id: 'acme.two' })),
      /The plug-in acme\.two was not installed: the format "one" is already added by acme\.one/,
    );
  });

  test('a plug-in that fails while registering is refused, and what it added before failing is left out', () => {
    const registry = pluginRegistry();
    const failing = plugin({
      register: (points) => {
        points.exports.add(exporter('half'));
        throw new Error('no disk');
      },
    });
    assert.throws(
      () => registry.register(failing),
      /acme\.one was not installed: it failed while registering: no disk/,
    );
    assert.deepEqual(registry.exporters(), []);
    registry.register(plugin({ register: (points) => points.exports.add(exporter('half')) }));
    assert.equal(registry.exporter('half').title, 'HALF', 'the format is free again');
  });

  test('an export with a bad format, extension, media type or no writer is refused', () => {
    for (const [bad, why] of [
      [{ ...exporter('One') }, /the format "One" is not a lower-case word/],
      [{ ...exporter('one'), extension: '.txt' }, /the extension ".txt"/],
      [{ ...exporter('one'), mime: 'text' }, /the media type "text" is not one/],
      [{ ...exporter('one'), title: ' ' }, /has no title/],
      [{ ...exporter('one'), write: 'yes' }, /has no writer/],
    ])
      assert.throws(() => pluginRegistry().register(plugin({ register: (p) => p.exports.add(bad) })), why);
  });

  test('an export that throws, or gives no text, is caught and named with its plug-in', () => {
    const registry = pluginRegistry();
    registry.register(
      plugin({
        register: (points) => {
          points.exports.add(
            exporter('boom', () => {
              throw new Error('out of ink');
            }),
          );
          points.exports.add(exporter('empty', () => undefined));
        },
      }),
    );
    assert.deepEqual(registry.writeData('boom', DATA, INFO), {
      ok: false,
      plugin: 'acme.one',
      message: 'The export BOOM of acme.one failed: out of ink',
    });
    assert.deepEqual(registry.writeData('empty', DATA, INFO), {
      ok: false,
      plugin: 'acme.one',
      message: 'The export EMPTY of acme.one gave no text.',
    });
  });

  test('a storage or command that is badly named, untitled or does nothing is refused', () => {
    const open = () => memoryStorage();
    const run = () => {};
    for (const [uses, add, why] of [
      ['storage', (p) => p.storage.add({ name: 'My Drive', title: 'D', open }), /"My Drive" is not named by/],
      ['storage', (p) => p.storage.add({ name: 'drive', title: '', open }), /the storage "drive" has no title/],
      ['storage', (p) => p.storage.add({ name: 'drive', title: 'D', open: 1 }), /"drive" cannot be opened/],
      ['commands', (p) => p.commands.add({ id: 'other.go', title: 'Go', run }), /not named acme\.one\.<word>/],
      ['commands', (p) => p.commands.add({ id: 'acme.one.go', title: ' ', run }), /"acme.one.go" has no title/],
      ['commands', (p) => p.commands.add({ id: 'acme.one.go', title: 'Go' }), /"acme.one.go" does nothing/],
    ])
      assert.throws(() => pluginRegistry().register(plugin({ uses: [uses], register: add })), why);
  });

  test('a storage name or command another plug-in added is refused', () => {
    const registry = pluginRegistry();
    const drive = (p) => p.storage.add({ name: 'drive', title: 'Drive', open: () => memoryStorage() });
    registry.register(plugin({ uses: ['storage'], register: drive }));
    assert.throws(
      () => registry.register(plugin({ id: 'acme.two', uses: ['storage'], register: drive })),
      /the storage "drive" is already added by acme\.one/,
    );
  });

  test('a storage that throws as it opens, or a command that throws, is caught and named', () => {
    const registry = pluginRegistry();
    registry.register(
      plugin({
        uses: ['storage', 'commands'],
        register: (p) => {
          p.storage.add({
            name: 'drive',
            title: 'Drive',
            open: () => {
              throw new Error('offline');
            },
          });
          p.commands.add({
            id: 'acme.one.go',
            title: 'Go',
            run: () => {
              throw new Error('no way');
            },
          });
        },
      }),
    );
    assert.deepEqual(registry.openStorage('drive'), {
      ok: false,
      plugin: 'acme.one',
      message: 'The storage Drive of acme.one failed: offline',
    });
    assert.deepEqual(registry.runCommand('acme.one.go'), {
      ok: false,
      plugin: 'acme.one',
      message: 'The command Go of acme.one failed: no way',
    });
  });

  test('a call that runs too long is named, its answer dropped, and its plug-in stopped', () => {
    let clock = 0;
    const registry = pluginRegistry({ now: () => clock });
    let calls = 0;
    registry.register(
      plugin({
        uses: ['exports', 'commands'],
        register: (p) => {
          p.exports.add(exporter('slow', () => ((clock += PLUGIN_TIME_LIMIT + 1), calls++, 'late')));
          p.commands.add({ id: 'acme.one.go', title: 'Go', run: () => calls++ });
        },
      }),
    );
    const late = registry.writeData('slow', DATA, INFO);
    assert.equal(late.ok, false, 'the late answer is dropped');
    assert.equal(late.plugin, 'acme.one');
    assert.match(late.message, /The export SLOW of acme\.one ran too long: .*took 2001 ms, over the 2000 ms allowed/);
    assert.deepEqual(registry.stopped(), [
      { plugin: 'acme.one', why: late.message.split('ran too long: ')[1].slice(0, -1) },
    ]);
    const after = registry.runCommand('acme.one.go');
    assert.equal(after.ok, false);
    assert.match(after.message, /The command Go of acme\.one was not run: the plug-in was stopped/);
    assert.equal(calls, 1, 'nothing of a stopped plug-in is called again');
  });

  test('a call within the limit is answered, and the limit can be set for a host', () => {
    let clock = 0;
    const registry = pluginRegistry({ now: () => clock, timeLimit: 50 });
    registry.register(plugin({ register: (p) => p.exports.add(exporter('quick', () => ((clock += 50), 'on time'))) }));
    assert.deepEqual(registry.writeData('quick', DATA, INFO), { ok: true, value: 'on time' });
    assert.deepEqual(registry.stopped(), []);
  });

  test('the host abilities are a notice, the plug-in’s own settings, the secrets and the notes', () => {
    assert.deepEqual(HOST_ABILITIES, ['notice', 'settings', 'secrets', 'files']);
  });

  test('a plug-in is given only the host abilities its manifest names, with settings kept for it alone', () => {
    const files = memoryStorage();
    const kept = {};
    const host = {
      notice: () => {},
      settingsFor: (id) => ({ load: async () => kept[id], save: async (v) => void (kept[id] = v) }),
      secrets: { get: () => 'shh' },
      files,
    };
    let given;
    const registry = pluginRegistry({ host });
    registry.register(plugin({ uses: [], abilities: ['settings', 'files'], register: (p) => (given = p) }));
    assert.deepEqual(Object.keys(given.host).sort(), ['files', 'settings']);
    assert.equal(given.host.files, files);
    assert.equal(given.host.secrets, undefined, 'no secret it did not ask for');
    assert.ok(Object.isFrozen(given.host));
    return given.host.settings.save({ on: true }).then(() => assert.deepEqual(kept, { 'acme.one': { on: true } }));
  });

  test('a plug-in that names no host ability is given none', () => {
    let given;
    pluginRegistry({ host: { notice: () => {} } }).register(plugin({ uses: [], register: (p) => (given = p) }));
    assert.equal(given.host, undefined);
  });

  for (const [what, abilities, why] of [
    ['an ability that does not exist', ['camera'], /host abilities that do not exist: camera/],
    ['an ability the host does not offer', ['notice', 'secrets'], /this host does not offer: secrets/],
  ])
    test(`a manifest naming ${what} is refused, and nothing is installed`, () => {
      const registry = pluginRegistry({ host: { notice: () => {} } });
      assert.throws(() => registry.register(plugin({ abilities })), why);
      assert.deepEqual(registry.plugins(), []);
    });

  test('a panel that is badly named, untitled or draws nothing is refused, and one that throws is named', () => {
    const render = () => {};
    for (const [panel, why] of [
      [{ id: 'other.list', title: 'L', render }, /the panel "other.list" is not named acme\.one\.<word>/],
      [{ id: 'acme.one.list', title: ' ', render }, /the panel "acme.one.list" has no title/],
      [{ id: 'acme.one.list', title: 'L' }, /the panel "acme.one.list" draws nothing/],
    ])
      assert.throws(
        () => pluginRegistry().register(plugin({ uses: ['panels'], register: (p) => p.panels.add(panel) })),
        why,
      );
    const registry = pluginRegistry();
    const boom = () => {
      throw new Error('no room');
    };
    registry.register(
      plugin({ uses: ['panels'], register: (p) => p.panels.add({ id: 'acme.one.list', title: 'List', render: boom }) }),
    );
    assert.deepEqual(registry.showPanel('acme.one.list', { dir: 'rtl' }), {
      ok: false,
      plugin: 'acme.one',
      message: 'The panel List of acme.one failed: no room',
    });
  });
});
