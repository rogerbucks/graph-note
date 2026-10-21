// The versions of the plug-in interface (editor spec §43, plugin_point_versions; API-10, ARCH-12). The interface and
// each extension point are major.minor. A plug-in built for the same major and a minor no higher loads. A point that
// moves on refuses only the plug-ins that use it, naming that point.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSION_POINTS, PLUGIN_API, POINT_VERSIONS, pluginRegistry } from '../src/plugins.ts';
import { versionFits } from '../src/plugin-versions.ts';

const exporter = { format: 'lines', title: 'Lines', extension: 'txt', mime: 'text/plain', write: () => '' };
const plugin = (over = {}) => ({
  id: 'acme.lines',
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['exports@1.0'],
  register: (p) => p.exports.add(exporter),
  ...over,
});
const installs = (over, options) => {
  const registry = pluginRegistry(options);
  registry.register(plugin(over));
  return registry.plugins();
};

describe('the versions of the plug-in interface (plugin_point_versions)', () => {
  test('the interface and every extension point carry a version, major.minor', () => {
    assert.equal(PLUGIN_API, '1.1');
    assert.deepEqual(Object.keys(POINT_VERSIONS), [...EXTENSION_POINTS]);
    for (const v of Object.values(POINT_VERSIONS)) assert.match(v, /^\d+\.\d+$/);
  });

  test('a plug-in built for the same major and a minor no higher loads; any other is refused', () => {
    for (const api of ['1', '1.0', '1.1']) assert.deepEqual(installs({ api }), ['acme.lines'], api);
    for (const api of ['1.2', '2.0', '0.9', 'one'])
      assert.throws(
        () => installs({ api }),
        new RegExp(`built for version ${api} of the interface, and this host has 1.1`),
      );
  });

  test('a point may be named with the version it was built for, or with none, read as @1.0', () => {
    for (const use of ['exports', 'exports@1', 'exports@1.0'])
      assert.deepEqual(installs({ uses: [use] }), ['acme.lines']);
    assert.throws(() => installs({ uses: ['exports@1.1'] }), /built for exports@1\.1, and this host has exports@1\.0/);
  });

  test('a plug-in built for exports@1 still loads after the theme moves to @2, and one using the theme is refused', () => {
    const moved = { pointVersions: { theme: '2.0' } };
    assert.deepEqual(installs({}, moved), ['acme.lines']);
    const themed = { uses: ['exports@1.0', 'theme@1.0'], register: () => {} };
    assert.throws(() => installs(themed, moved), /built for theme@1\.0, and this host has theme@2\.0\.$/);
    assert.throws(
      () => installs({ ...themed, uses: ['exports', 'theme'] }, moved),
      /theme@1\.0, and this host has theme@2\.0/,
    );
  });

  test('a minor added to a point keeps every plug-in built for an older minor', () => {
    assert.deepEqual(installs({}, { pointVersions: { exports: '1.3' } }), ['acme.lines']);
    assert.equal(versionFits('1.2', '1.3'), true);
    assert.equal(versionFits('1.4', '1.3'), false);
    assert.equal(versionFits('2', '1.3'), false);
    assert.equal(versionFits('1.x', '1.3'), false);
  });
});
