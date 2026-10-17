// What a plug-in is held to (editor spec §43, plugin_manifest_limits): its manifest is checked before anything it adds,
// it is given only the extension points its manifest names, a plug-in refused leaves nothing behind, and an export that
// throws or gives no text is caught and named, never let through.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';

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
});
