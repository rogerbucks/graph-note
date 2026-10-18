// A detached checkout of a commit for the tests-first replay (scripts/tests-first.mjs), wired to the repository's
// installed packages.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

/** The workspace packages under a checkout's packages/, by the name each one's manifest gives. */
function workspaces(root) {
  const packages = join(root, 'packages');
  return (existsSync(packages) ? readdirSync(packages) : [])
    .map((p) => join(packages, p))
    .filter((path) => existsSync(join(path, 'package.json')))
    .map((path) => ({ name: JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).name ?? '', path }));
}

/** A detached checkout of a commit, wired to the repository's installed packages, with its own workspace links. */
export function checkout(repo, commit) {
  const dir = mkdtempSync(join(tmpdir(), 'tests-first-wt-'));
  rmSync(dir, { recursive: true, force: true });
  git(repo, 'worktree', 'add', '-q', '--detach', dir, commit);
  const modules = join(repo, 'node_modules');
  if (existsSync(modules)) {
    // the installed packages, but this checkout's own workspace packages, so its code is what runs; the scopes come from
    // the manifests, since a commit from before the rename names its packages under the old scope
    const own = workspaces(dir);
    const scopes = new Set(
      [...own, ...workspaces(repo)].map(({ name }) => name.split('/')[0]).filter((s) => s.startsWith('@')),
    );
    mkdirSync(join(dir, 'node_modules'));
    for (const name of readdirSync(modules))
      if (!scopes.has(name)) symlinkSync(join(modules, name), join(dir, 'node_modules', name));
    for (const scope of scopes) mkdirSync(join(dir, 'node_modules', scope));
    for (const { name, path } of own) if (name.startsWith('@')) symlinkSync(path, join(dir, 'node_modules', name));
    for (const { path } of own) {
      const installed = join(repo, 'packages', basename(path), 'node_modules');
      if (existsSync(installed)) symlinkSync(installed, join(path, 'node_modules'));
    }
  }
  return { dir, done: () => git(repo, 'worktree', 'remove', '--force', dir) };
}
