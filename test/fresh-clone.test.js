// When a pull request runs the fresh clone of scripts/fresh-clone.mjs. It runs only when a change can alter what the
// README's steps do (spec §13, Delivery). Main and the release always run it.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changesSetup, isSetupInput, setupInputsChangedSince } from '../scripts/fresh-clone.mjs';

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A repository of one commit, and a way to commit a file to it. */
function repository() {
  const dir = mkdtempSync(join(tmpdir(), 'fresh-clone-'));
  made.push(dir);
  const g = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.name', 'Some One']);
  g(['config', 'user.email', '1234+someone@users.noreply.github.com']);
  const commit = (file, text) => {
    writeFileSync(join(dir, file), text);
    g(['add', '.']);
    g(['commit', '-q', '-m', `Change ${file}`]);
  };
  commit('README.md', '# Thing\n');
  return { dir, commit };
}

describe('fresh-clone: the setup inputs', () => {
  test('a setup input is what the README steps run that no other CI job does: the steps, the hook, what a clone keeps', () => {
    for (const f of [
      'README.md',
      'package.json',
      'packages/core/package.json',
      '.npmrc',
      '.githooks/pre-commit',
      '.gitignore',
      '.gitattributes',
      'scripts/public-readiness.mjs',
      'scripts/fresh-clone.mjs',
    ])
      assert.ok(isSetupInput(f), f);
    // the other jobs install these from their own fresh checkout, with npm ci and uv sync --locked
    for (const f of [
      'package-lock.json',
      'python/graph_spec/pyproject.toml',
      'python/graph_spec/uv.lock',
      'python/graph_spec/.python-version',
      'packages/core/src/zoom.ts',
      'test/zoom.test.js',
      'CONTRIBUTING.md',
      'docs/README.md.txt',
    ])
      assert.equal(isSetupInput(f), false, f);
  });

  test('a README edit is a setup input only when the steps of its Developing section change', () => {
    const readme = (steps, words = 'Some words.') =>
      `# Thing\n\n${words}\n\n## Developing\n\n\`\`\`sh\n${steps}\n\`\`\`\n\n## Other\n`;
    const before = readme('npm ci\nnpm test');
    assert.equal(changesSetup('README.md', before, readme('npm ci\nnpm test', 'Other words.')), false);
    assert.equal(changesSetup('README.md', before, readme('npm ci\nnpm test\nnpm run build')), true);
    assert.equal(changesSetup('README.md', null, before), true, 'a README added');
    assert.equal(changesSetup('README.md', before, null), true, 'a README removed');
  });

  test('a package.json edit is a setup input unless it changes only versions and dependencies', () => {
    const pkg = (fields) =>
      JSON.stringify({ name: 'thing', version: '1.0.0', scripts: { test: 'node --test' }, ...fields });
    const before = pkg({ devDependencies: { a: '^1.0.0' } });
    // a dependency bump: the lock file says what is installed, and every other job installs it
    assert.equal(changesSetup('package.json', before, pkg({ devDependencies: { a: '^1.1.0' } })), false);
    assert.equal(
      changesSetup('package.json', before, pkg({ version: '1.0.1', devDependencies: { a: '^1.0.0' } })),
      false,
    );
    // what the README's npm steps run, or how npm sets the clone up
    assert.equal(changesSetup('package.json', before, pkg({ scripts: { test: 'node --test x' } })), true);
    assert.equal(
      changesSetup('package.json', before, pkg({ devDependencies: { a: '^1.0.0' }, engines: { node: '>=24' } })),
      true,
    );
    assert.equal(changesSetup('package.json', before, '{ not json'), true, 'unreadable: the clone runs');
    assert.equal(changesSetup('package.json', null, before), true, 'a package added');
  });

  test('the hook, the git settings and the setup scripts are setup inputs whatever changed in them', () => {
    for (const f of ['.npmrc', '.githooks/pre-commit', '.gitignore', 'scripts/fresh-clone.mjs'])
      assert.equal(changesSetup(f, 'a\n', 'b\n'), true, f);
    assert.equal(changesSetup('packages/core/src/zoom.ts', 'a', 'b'), false);
  });

  test('the setup inputs changed since a base are read from where the branch left it, not from its tip', () => {
    const { dir, commit } = repository();
    const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    const base = g('rev-parse', 'HEAD');
    commit('zoom.ts', 'export {};\n');
    assert.deepEqual(setupInputsChangedSince(dir, base), []);
    commit('package.json', '{}\n');
    assert.deepEqual(setupInputsChangedSince(dir, base), ['package.json']);
    // a dependency bump alone does not run the clone
    commit('package.json', '{"dependencies":{"a":"1"}}\n');
    commit('package.json', '{"dependencies":{"a":"2"}}\n');
    assert.deepEqual(setupInputsChangedSince(dir, g('rev-parse', 'HEAD~1')), []);
    // nor do words in the README outside its steps
    commit('README.md', '# Thing\n\nMore words.\n');
    assert.deepEqual(setupInputsChangedSince(dir, g('rev-parse', 'HEAD~1')), []);
    // the base moving on after the branch point is not the branch's change
    g('checkout', '-q', '-b', 'later', base);
    commit('README.md', '# Thing, later\n\n## Developing\n\n```sh\nnpm ci\n```\n');
    const later = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'main');
    assert.deepEqual(setupInputsChangedSince(dir, later), ['package.json']);
  });
});
