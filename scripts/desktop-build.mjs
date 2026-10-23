#!/usr/bin/env node
// Builds the desktop app's installers, signed where the keys are there (spec §41, app_signed). The desktop app
// workflow runs it. How to get each key, and what it costs, is in docs/app-signing.md.
//
// Each system signs only when every key it needs is set. With none, it builds unsigned, as before. With only some, it
// builds unsigned and warns, naming what is missing. So a half-set key never fails a build, and never signs half.
//
// - macOS: Tauri signs with the Developer ID certificate and, with the Apple ID keys too, sends the app to Apple to be
//   notarised.
// - Windows: not signed, Roger's choice (23 Oct 2026). docs/app-signing.md says how to add it later.
// - Linux: the .deb gets a GPG signature beside it, `<name>.deb.asc`.
// - The updater key (TAURI_SIGNING_PRIVATE_KEY) waits for the in-app updater: Tauri uses it only once the app has one.
//
// Usage: node scripts/desktop-build.mjs   from the repository root, on the system to build for.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI = join(ROOT, 'packages/app/src-tauri');
const DEB = join(TAURI, 'target/release/bundle/deb');

/** The keys each kind of signing needs, by the name of the secret or variable that holds it. */
export const KEYS = {
  macOS: ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY'],
  notarise: ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'],
  Linux: ['LINUX_GPG_PRIVATE_KEY', 'LINUX_GPG_PASSPHRASE'],
};

const ALL = Object.values(KEYS).flat();

/**
 * What to sign on `os` ('macOS', 'Windows' or 'Linux', as GitHub names them), from the keys in `env`.
 * Returns `env` without the signing keys it does not use, and what is signed. Each kind of signing left out for a
 * missing key gets a warning.
 */
export function signingPlan(os, env) {
  const set = (name) => typeof env[name] === 'string' && env[name] !== '';
  const kinds = { macOS: os === 'macOS', notarise: os === 'macOS', Linux: os === 'Linux' };
  const signed = {};
  const warnings = [];
  for (const [kind, wanted] of Object.entries(kinds)) {
    const have = KEYS[kind].filter(set);
    signed[kind] = wanted && have.length === KEYS[kind].length;
    if (wanted && have.length > 0 && !signed[kind])
      warnings.push(`${kind} not signed: missing ${KEYS[kind].filter((k) => !set(k)).join(', ')}`);
  }
  if (signed.notarise && !signed.macOS) {
    signed.notarise = false;
    warnings.push('notarise skipped: the app is not signed, so Apple would refuse it');
  }
  const kept = new Set(Object.keys(signed).flatMap((kind) => (signed[kind] ? KEYS[kind] : [])));
  const out = Object.fromEntries(Object.entries(env).filter(([k]) => !ALL.includes(k) || kept.has(k)));
  // The GPG key is used here, after the build, never by the build itself.
  for (const k of KEYS.Linux) delete out[k];
  return { env: out, signed, warnings };
}

/**
 * Writes `<file>.asc` beside each file, a GPG signature made with the armoured private `key` and its `passphrase`.
 * The key goes into a keyring of its own, deleted afterwards. Returns the signatures written.
 */
export function gpgSign(files, key, passphrase) {
  const home = mkdtempSync(join(tmpdir(), 'thoughtknot-gpg-'));
  const gpg = (args, input) => {
    const run = spawnSync('gpg', ['--homedir', home, '--batch', '--yes', ...args], { input, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`gpg ${args[0]} failed: ${run.stderr.trim()}`);
  };
  try {
    gpg(['--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--import'], `${passphrase}\n${key}`);
    return files.map((file) => {
      gpg(['--pinentry-mode', 'loopback', '--passphrase-fd', '0', '--armor', '--detach-sign', file], `${passphrase}\n`);
      return `${file}.asc`;
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function run(command, args, options) {
  const done = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (done.status !== 0) process.exit(done.status ?? 1);
}

function main() {
  const os = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform];
  const plan = signingPlan(os, process.env);
  for (const w of plan.warnings) console.log(`::warning::${w}`);
  run('cargo', ['tauri', 'build', '--ci'], { cwd: TAURI, env: plan.env });
  if (os === 'Linux' && plan.signed.Linux) {
    const debs = readdirSync(DEB)
      .filter((f) => f.endsWith('.deb'))
      .map((f) => join(DEB, f));
    gpgSign(debs, process.env.LINUX_GPG_PRIVATE_KEY, process.env.LINUX_GPG_PASSPHRASE);
  }
  const said = Object.entries(plan.signed)
    .filter(([kind]) => kind === os || (os === 'macOS' && kind === 'notarise'))
    .map(([kind, yes]) => `${kind}: ${yes ? 'yes' : 'no'}`)
    .join(', ');
  console.log(`::notice::${os} installer signed? ${said}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Signed on ${os}: ${said}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
