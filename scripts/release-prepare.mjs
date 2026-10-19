#!/usr/bin/env node
// The version bump for a stable release, in one step (RELEASING.md, "Cutting a release"; risk OPS-3). It writes the new
// version into every file that carries it, so none is missed:
// - manifest.json, and a new line in versions.json with the manifest's minimum Obsidian version;
// - every package.json, and the version each package asks for of its siblings;
// - the Claude Code mod's plugin.json and the Python library's pyproject.toml;
// - both lockfiles, edited in place, so no package is fetched.
// It checks the version first and writes nothing if it is refused.
//
// Usage:
//   npm run release:prepare -- 0.8.0
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;
const PACKAGES = [
  'package.json',
  ...['claude-code', 'core', 'graph-spec', 'obsidian'].map((p) => `packages/${p}/package.json`),
];
const MOD = 'packages/claude-code/mod/.claude-plugin/plugin.json';
const PYPROJECT = 'python/graph_spec/pyproject.toml';
const UV_LOCK = 'python/graph_spec/uv.lock';

/** Every file the bump writes, relative to the repository. */
export const VERSION_FILES = [
  'manifest.json',
  'versions.json',
  ...PACKAGES,
  MOD,
  PYPROJECT,
  'package-lock.json',
  UV_LOCK,
];

/** Whether release version a comes after b. */
function after(a, b) {
  const [x, y] = [RELEASE.exec(a).slice(1).map(Number), RELEASE.exec(b).slice(1).map(Number)];
  const i = x.findIndex((n, k) => n !== y[k]);
  return i !== -1 && x[i] > y[i];
}

/** A JSON file as npm and Prettier write it: two spaces, and a line end at the end. */
const asJSON = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** The version each sibling is asked for, moved to `version`. */
function siblings(deps, version) {
  for (const key of ['dependencies', 'devDependencies'])
    for (const dep of Object.keys(deps?.[key] ?? {})) if (dep.startsWith('@thoughtknot/')) deps[key][dep] = version;
}

/** One text edit that must match once; the bump stops rather than guess. */
function replaceOnce(file, text, pattern, by) {
  const found = text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)) ?? [];
  if (found.length !== 1)
    throw new Error(`refused: ${file} has ${found.length} version lines where one was looked for`);
  return text.replace(pattern, by);
}

/** Writes `version` into every file of the repository at `root` that carries it. Throws, writing nothing, if refused. */
export function prepare(root, version) {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const manifest = JSON.parse(read('manifest.json'));
  if (!RELEASE.test(String(version)))
    throw new Error(`refused: ${version} is not a release version (major.minor.patch)`);
  if (!after(version, manifest.version))
    throw new Error(`refused: ${version} does not come after the current version, ${manifest.version}`);

  // every change is made in memory first, so a refusal part way through writes nothing
  const out = new Map();
  out.set('manifest.json', asJSON({ ...manifest, version }));
  out.set('versions.json', asJSON({ ...JSON.parse(read('versions.json')), [version]: manifest.minAppVersion }));
  for (const f of PACKAGES) {
    const pkg = JSON.parse(read(f));
    pkg.version = version;
    siblings(pkg, version);
    out.set(f, asJSON(pkg));
  }
  out.set(MOD, asJSON({ ...JSON.parse(read(MOD)), version }));
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = version;
  for (const f of PACKAGES) {
    const at = lock.packages[f === 'package.json' ? '' : f.replace(/\/package\.json$/, '')];
    if (!at) throw new Error(`refused: package-lock.json has no entry for ${f}`);
    at.version = version;
    siblings(at, version);
  }
  out.set('package-lock.json', asJSON(lock));
  out.set(PYPROJECT, replaceOnce(PYPROJECT, read(PYPROJECT), /^version = "[^"]*"$/m, `version = "${version}"`));
  out.set(UV_LOCK, replaceOnce(UV_LOCK, read(UV_LOCK), /(\nname = "graph-spec"\nversion = )"[^"]*"/, `$1"${version}"`));
  for (const [f, body] of out) writeFileSync(join(root, f), body);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [version] = process.argv.slice(2);
  try {
    prepare(ROOT, version);
    console.log(
      `Every version file now carries ${version}. Next: run "Release check (dry run)" on main (RELEASING.md).`,
    );
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
