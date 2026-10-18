#!/usr/bin/env node
// The version a nightly build carries (spec §41, nightly_prerelease). It is the next patch after the manifest's
// version, with a nightly suffix and the day it was built, as `0.6.1-nightly.20261018`. Semantic versioning puts it
// after the release it was built from and before the next one. So a tool that follows pre-releases (BRAT in Obsidian)
// updates to each night's build and then to the stable release that follows. It never matches the release workflow's
// bare tag pattern.
//
// Usage:
//   node scripts/nightly-version.mjs --date YYYYMMDD          print the version.
//   node scripts/nightly-version.mjs --date YYYYMMDD --write  also write it into manifest.json, for the build's assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'manifest.json');
const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;
const DAY = /^\d{8}$/;

/** A nightly's version: the next patch after `release`, then `-nightly.` and `day`. Throws for a malformed input. */
export function nightlyVersion(release, day) {
  const m = RELEASE.exec(String(release));
  if (!m) throw new Error(`${release} is not a release version (major.minor.patch)`);
  if (!DAY.test(String(day))) throw new Error(`${day} is not a day written YYYYMMDD`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}-nightly.${day}`;
}

/** A nightly version, matched in full; the publish job checks the version it is handed against the same shape. */
export const NIGHTLY = /^\d+\.\d+\.\d+-nightly\.\d{8}$/;

function main(args) {
  const at = args.indexOf('--date');
  const day = at === -1 ? undefined : args[at + 1];
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const version = nightlyVersion(manifest.version, day);
  if (args.includes('--write')) writeFileSync(MANIFEST, JSON.stringify({ ...manifest, version }, null, 2) + '\n');
  console.log(version);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
