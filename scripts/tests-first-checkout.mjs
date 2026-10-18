// A detached checkout of a commit for the tests-first replay (scripts/tests-first.mjs), wired to the repository's
// installed packages.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

/** A detached checkout of a commit, wired to the repository's installed packages, with its own workspace links. */
export function checkout(repo, commit) {
  const dir = mkdtempSync(join(tmpdir(), 'tests-first-wt-'));
  rmSync(dir, { recursive: true, force: true });
  git(repo, 'worktree', 'add', '-q', '--detach', dir, commit);
  const modules = join(repo, 'node_modules');
  if (existsSync(modules)) {
    // the installed packages, but this checkout's own workspace packages, so its code is what runs
    mkdirSync(join(dir, 'node_modules'));
    for (const name of readdirSync(modules))
      if (name !== '@thoughtknot') symlinkSync(join(modules, name), join(dir, 'node_modules', name));
    mkdirSync(join(dir, 'node_modules', '@thoughtknot'));
    const packages = join(dir, 'packages');
    for (const p of existsSync(packages) ? readdirSync(packages) : []) {
      const manifest = join(packages, p, 'package.json');
      if (!existsSync(manifest)) continue;
      const name = JSON.parse(readFileSync(manifest, 'utf8')).name ?? '';
      if (name.startsWith('@thoughtknot/')) symlinkSync(join(packages, p), join(dir, 'node_modules', name));
      const own = join(repo, 'packages', p, 'node_modules');
      if (existsSync(own)) symlinkSync(own, join(packages, p, 'node_modules'));
    }
  }
  return { dir, done: () => git(repo, 'worktree', 'remove', '--force', dir) };
}
