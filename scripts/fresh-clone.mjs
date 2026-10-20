// A stranger's fresh clone, set up from the README's own steps (spec §13, Delivery). It holds the steps, and runs them
// in a clone of the repository. It also says which changed files can change what they do. So a pull request runs the
// clone only when needed.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (root, args) => execFileSync('git', args, { cwd: root, maxBuffer: 2 ** 31 });

/** The shell steps of the README's Developing section: each fenced sh block, as the text of its commands. */
export function readmeSteps(text) {
  const section = text.split(/^## /m).find((s) => s.startsWith('Developing')) ?? '';
  return [...section.matchAll(/^```sh\n([\s\S]*?)^```/gm)].map((m) => m[1].trim());
}

/**
 * What the README's steps read that CI's other jobs do not. Those jobs set up from their own fresh checkout, with
 * `npm ci` and `uv sync --locked`. So a lock file or a Python project file is theirs to check. The rest is the steps themselves, the npm scripts they run, the hook they set, and what decides a clone's files.
 */
const SETUP_INPUTS = [
  /^README\.md$/,
  /(^|\/)package\.json$/,
  /^\.npmrc$/,
  /^\.githooks\//,
  /^\.git(ignore|attributes)$/,
  /^scripts\/(public-readiness|fresh-clone)\.mjs$/,
];

/** Whether a change to the file at `path` (from the repository's root) can change what a fresh clone's setup does. */
export const isSetupInput = (path) => SETUP_INPUTS.some((re) => re.test(path));

/** The fields of a package.json the other jobs check by installing: a version and what it depends on. */
const INSTALLED = [
  'version',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
];

/** A package.json without the fields the other jobs check; null when it cannot be read. */
const setupPart = (text) => {
  try {
    const pkg = JSON.parse(text);
    for (const field of INSTALLED) delete pkg[field];
    return JSON.stringify(pkg);
  } catch {
    return null;
  }
};

/**
 * Whether a change to the file at `path` changes what a fresh clone's setup does. `before` and `after` are its text,
 * or null where it does not exist. The README counts only when its steps change; a package.json only when something
 * other than its version and dependencies changes, such as its scripts. A file added, removed or unreadable counts.
 */
export function changesSetup(path, before, after) {
  if (!isSetupInput(path)) return false;
  if (before === null || after === null) return true;
  if (path === 'README.md') return JSON.stringify(readmeSteps(before)) !== JSON.stringify(readmeSteps(after));
  if (/(^|\/)package\.json$/.test(path)) {
    const [was, now] = [setupPart(before), setupPart(after)];
    return was === null || now === null || was !== now;
  }
  return true;
}

/** The text of `path` at commit `ref`, or null where it does not exist there. */
const textAt = (root, ref, path) => {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    return null;
  }
};

/** The setup inputs HEAD changed since its merge base with `base`, so a change the base gained later is not counted. */
export function setupInputsChangedSince(root, base) {
  const from = git(root, ['merge-base', base, 'HEAD']).toString().trim();
  return git(root, ['diff', '--name-only', from, 'HEAD'])
    .toString()
    .split('\n')
    .filter((path) => isSetupInput(path) && changesSetup(path, textAt(root, from, path), textAt(root, 'HEAD', path)));
}

/**
 * Runs the README's steps in a fresh clone of the repository, as a newcomer would, with the clone's origin set to the
 * repository's own. Returns the problems: each step that failed, with the end of what it printed.
 */
export function freshCloneProblems(root = ROOT, { log = () => {} } = {}) {
  const steps = readmeSteps(readFileSync(join(root, 'README.md'), 'utf8'));
  if (!steps.length) return [{ where: 'README.md', rule: 'no-setup-steps' }];
  const clone = mkdtempSync(join(tmpdir(), 'fresh-clone-'));
  try {
    execFileSync('git', ['clone', '--quiet', root, clone]);
    git(clone, ['remote', 'set-url', 'origin', git(root, ['remote', 'get-url', 'origin']).toString().trim()]);
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    return steps.flatMap((step, i) => {
      log(`README step ${i + 1} of ${steps.length} in a fresh clone:\n${step}`);
      const opts = { cwd: clone, input: step, env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 1 << 28 };
      const r = spawnSync('sh', ['-e'], opts);
      if (r.status === 0) return [];
      const detail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-30).join('\n');
      return [{ where: `README.md step ${i + 1}`, rule: 'setup-step-failed', detail }];
    });
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}
