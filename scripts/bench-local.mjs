#!/usr/bin/env node
// The instruction-count benchmarks on a developer's own machine (spec §12, quality_ratchet): Valgrind does not run on
// Apple-silicon macOS, so this runs scripts/instruction-counts.mjs in a Linux container with Node 24 and Valgrind
// (docker/benchmarks.Dockerfile), building the image first when it is not there. For counts before and after a change
// on one machine: its counts are never compared with the baseline CI counts, as on a Mac they are ARM Linux's.
//
// The repository is mounted, never copied; node_modules is the container's own volume, installed with `npm ci` when the
// lockfile has changed since, so the host's node_modules is never touched.
//
// Usage: npm run bench:local -- [the arguments of scripts/instruction-counts.mjs, such as --only naming or --runs 3]
// Needs Docker running (Docker Desktop on a Mac); it says so in one line when it is not.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The image's Dockerfile, from the repository's root. */
export const DOCKERFILE = 'docker/benchmarks.Dockerfile';
/**
 * The volume the container's node_modules is kept in, apart from the host's: one for each checkout, named for a short
 * digest of its root, so two worktrees on different lockfiles never install over each other.
 */
export function modulesVolume(root = ROOT) {
  return `graph-note-benchmarks-node-modules-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;
}

/** The image's tag: named for what it is, and for its Dockerfile's content, so a changed Dockerfile builds afresh. */
export function imageTag(root = ROOT) {
  const text = readFileSync(join(root, DOCKERFILE));
  return `graph-note-benchmarks:${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
}

/**
 * What runs in the container: `npm ci` into the volume when the lockfile differs from the one last installed there, then
 * the counts, with `args`. As a shell command and its arguments, the arguments passed through untouched.
 */
export const INSIDE = [
  'sh',
  '-c',
  'if ! cmp -s package-lock.json node_modules/.bench-lock; then npm ci && cp package-lock.json node_modules/.bench-lock; fi' +
    ' && node scripts/instruction-counts.mjs "$@"',
  'bench-local',
];

/** The `docker run` arguments: the repository mounted at /repo, node_modules the container's own volume. */
export function runArgs(tag, args, root = ROOT) {
  return [
    'run',
    '--rm',
    '--mount',
    `type=bind,source=${root},target=/repo`,
    '--mount',
    `type=volume,source=${modulesVolume(root)},target=/repo/node_modules`,
    '--workdir',
    '/repo',
    tag,
    ...INSIDE,
    ...args,
  ];
}

function main(args) {
  const docker = process.env.DOCKER ?? 'docker';
  const said = (r) => (r.stderr ?? '').toString().trim().split('\n').at(-1);
  const up = spawnSync(docker, ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
  if (up.status !== 0) {
    console.error(`bench:local: Docker is not running here (${up.error?.message ?? said(up)}); start Docker Desktop`);
    return 1;
  }
  const tag = imageTag();
  if (spawnSync(docker, ['image', 'inspect', tag], { stdio: 'ignore' }).status !== 0) {
    const built = spawnSync(docker, ['build', '--file', join(ROOT, DOCKERFILE), '--tag', tag, join(ROOT, 'docker')], {
      stdio: 'inherit',
    });
    if (built.status !== 0) return built.status ?? 1;
  }
  return spawnSync(docker, runArgs(tag, args), { stdio: 'inherit' }).status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
