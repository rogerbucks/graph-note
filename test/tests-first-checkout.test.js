// The tests-first replay's checkout of a commit. Its own workspace packages are linked by the names its manifests give.
// So a commit from before a package scope was renamed still finds its own code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkout } from '../scripts/tests-first-checkout.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository whose one workspace package was named `@old/core`, then renamed to `@new/core`, with modules installed. */
function renamedRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'tests-first-checkout-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  const write = (path, text) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  write('.gitignore', 'node_modules\n');
  write('packages/core/package.json', JSON.stringify({ name: '@old/core' }));
  write('packages/core/index.js', 'old\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'old scope');
  const before = git(repo, 'rev-parse', 'HEAD');
  write('packages/core/package.json', JSON.stringify({ name: '@new/core' }));
  write('packages/core/index.js', 'new\n');
  git(repo, 'commit', '-q', '-am', 'new scope');
  mkdirSync(join(repo, 'node_modules', '@new'), { recursive: true });
  symlinkSync(join(repo, 'packages', 'core'), join(repo, 'node_modules', '@new', 'core'));
  mkdirSync(join(repo, 'node_modules', 'dep'));
  return { repo, before };
}

describe('a checkout for the tests-first replay', () => {
  test('links a commit’s own packages under the scope its manifests give, and the installed others', () => {
    const { repo, before } = renamedRepo();
    const { dir, done } = checkout(repo, before);
    try {
      const old = join(dir, 'node_modules', '@old', 'core');
      assert.ok(existsSync(old), 'the old scope is linked');
      assert.equal(realpathSync(old), realpathSync(join(dir, 'packages', 'core')));
      assert.equal(readFileSync(join(old, 'index.js'), 'utf8'), 'old\n');
      assert.ok(existsSync(join(dir, 'node_modules', 'dep')), 'an installed package is linked');
      assert.ok(!existsSync(join(dir, 'node_modules', '@new', 'core')), 'the newer scope’s code is not');
    } finally {
      done();
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
