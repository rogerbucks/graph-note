// A stable release's version bump, made in one command (risk OPS-3, spec §13 release_steps_written).
// `npm run release:prepare -- <version>` moves every file that carries the version together, lockfiles included, so a
// bump never misses one. Checked on a copy of the repository's own version files, in a folder of its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJSON } from './repository/repo.js';
import { VERSION_FILES, prepare } from '../scripts/release-prepare.mjs';

const ROOT = join(import.meta.dirname, '..');

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'release-prepare-'));
  for (const f of VERSION_FILES) cpSync(join(ROOT, f), join(dir, f));
  return dir;
}
const json = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const text = (dir, f) => readFileSync(join(dir, f), 'utf8');

describe('release:prepare', () => {
  test('is an npm script', () => {
    assert.equal(readJSON('package.json').scripts['release:prepare'], 'node scripts/release-prepare.mjs');
  });

  test('moves every file that carries the version, the lockfiles and the siblings each package asks for included', () => {
    const dir = copy();
    try {
      const { minAppVersion } = readJSON('manifest.json');
      prepare(dir, '98.7.6');
      assert.equal(json(dir, 'manifest.json').version, '98.7.6');
      assert.equal(json(dir, 'versions.json')['98.7.6'], minAppVersion);
      assert.equal(json(dir, 'packages/claude-code/mod/.claude-plugin/plugin.json').version, '98.7.6');
      const lock = json(dir, 'package-lock.json');
      assert.equal(lock.version, '98.7.6');
      for (const f of VERSION_FILES.filter((f) => f.endsWith('package.json'))) {
        const pkg = json(dir, f);
        const at = f === 'package.json' ? '' : f.replace(/\/package\.json$/, '');
        assert.equal(pkg.version, '98.7.6', f);
        assert.equal(lock.packages[at].version, '98.7.6', `the lockfile's ${at || 'root'}`);
        for (const deps of [pkg, lock.packages[at]])
          for (const [dep, wanted] of Object.entries({ ...deps.dependencies, ...deps.devDependencies }))
            if (dep.startsWith('@thoughtknot/')) assert.equal(wanted, '98.7.6', `${f} asks for ${dep}`);
      }
      assert.match(text(dir, 'python/graph_spec/pyproject.toml'), /^version = "98\.7\.6"$/m);
      assert.match(text(dir, 'python/graph_spec/uv.lock'), /\nname = "graph-spec"\nversion = "98\.7\.6"\n/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('refuses a version that is not major.minor.patch, or not after the current one, and changes nothing', () => {
    const dir = copy();
    try {
      const before = VERSION_FILES.map((f) => text(dir, f));
      const { version } = readJSON('manifest.json');
      for (const bad of ['1.2', 'v9.0.0', '9.0.0-rc.1', version, '0.0.1'])
        assert.throws(() => prepare(dir, bad), /refused/, bad);
      assert.deepEqual(
        VERSION_FILES.map((f) => text(dir, f)),
        before,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
