// The desktop app's installers are signed only where every key is there (spec §41, app_signed). Checked here:
// - No keys: built unsigned, with no warning, as before.
// - All keys for a system: signed, with each key passed on, and no key of another system.
// - Some keys: built unsigned, with a warning naming the missing ones.
// - The Linux GPG signature is made, and checks out against its key.
// - The workflow hands the keys over only off pull requests.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KEYS, gpgSign, signingPlan } from '../scripts/desktop-build.mjs';
import { jobs, read } from './repository/repo.js';

const all = (kind) => Object.fromEntries(KEYS[kind].map((k) => [k, `${k.toLowerCase()}-value`]));

describe('what the desktop build signs', () => {
  test('with no keys, nothing is signed, nothing is added, and nothing warns', () => {
    for (const os of ['macOS', 'Windows', 'Linux']) {
      const plan = signingPlan(os, { PATH: '/bin' });
      assert.deepEqual(plan.env, { PATH: '/bin' });
      assert.deepEqual(plan.warnings, []);
      assert.ok(
        Object.values(plan.signed).every((s) => s === false),
        os,
      );
    }
  });

  test('empty keys count as missing, as GitHub gives an unset secret as an empty text', () => {
    const empty = Object.fromEntries(
      Object.values(KEYS)
        .flat()
        .map((k) => [k, '']),
    );
    const plan = signingPlan('macOS', { ...empty, PATH: '/bin' });
    assert.deepEqual(plan.env, { PATH: '/bin' }, 'no empty key reaches Tauri, which would try to use it');
    assert.deepEqual(plan.warnings, []);
  });

  test('on macOS, the certificate signs and the App Store Connect API key notarises', () => {
    const plan = signingPlan('macOS', { ...all('macOS'), ...all('notarise'), ...all('Linux') });
    assert.deepEqual(plan.signed, { macOS: true, notarise: true, Linux: false });
    assert.deepEqual(
      Object.keys(plan.env).sort(),
      [...KEYS.macOS, 'APPLE_API_ISSUER', 'APPLE_API_KEY'].sort(),
      'no Linux key, and the private API key only as the file Tauri reads',
    );
    assert.equal(plan.apiKey, 'apple_api_private_key-value');
  });

  test('notarising uses an API key, never an Apple ID and password (Roger, 23 Oct 2026; LEGAL-4)', () => {
    const plan = signingPlan('macOS', { ...all('macOS'), APPLE_ID: 'a', APPLE_PASSWORD: 'b', APPLE_TEAM_ID: 'c' });
    assert.equal(plan.signed.notarise, false);
    assert.equal(plan.apiKey, null);
    assert.ok(
      !Object.values(KEYS)
        .flat()
        .some((k) => /^APPLE_(ID|PASSWORD)$/.test(k)),
    );
  });

  test('notarising without a signed app is skipped, with a warning', () => {
    const plan = signingPlan('macOS', all('notarise'));
    assert.equal(plan.signed.notarise, false);
    assert.deepEqual(plan.env, {});
    assert.equal(plan.apiKey, null);
    assert.match(plan.warnings.join(), /notarise skipped/);
  });

  test('a half-set key builds unsigned and names what is missing', () => {
    const plan = signingPlan('macOS', { APPLE_CERTIFICATE: 'x' });
    assert.equal(plan.signed.macOS, false);
    assert.deepEqual(plan.env, {});
    assert.deepEqual(plan.warnings, ['macOS not signed: missing APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY']);
  });

  test('Windows is not signed, whatever keys are set (Roger, 23 Oct 2026)', () => {
    const plan = signingPlan('Windows', { ...all('macOS'), AZURE_CLIENT_SECRET: 'x' });
    assert.deepEqual(plan.signed, { macOS: false, notarise: false, Linux: false });
    assert.deepEqual(plan.env, { AZURE_CLIENT_SECRET: 'x' }, 'only signing keys are taken out');
  });

  test('the Linux GPG key never reaches the build, only the signing after it', () => {
    const plan = signingPlan('Linux', all('Linux'));
    assert.equal(plan.signed.Linux, true);
    assert.deepEqual(plan.env, {});
  });
});

test('a .deb gets a GPG signature that checks out against the key', { skip: !hasGpg() && 'no gpg' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-gpg-test-'));
  try {
    const home = join(dir, 'maker');
    const gpg = (args, input) =>
      spawnSync('gpg', ['--homedir', home, '--batch', '--pinentry-mode', 'loopback', ...args], {
        input,
        encoding: 'utf8',
      });
    spawnSync('mkdir', ['-m', '700', home]);
    assert.equal(gpg(['--passphrase', 'pw', '--quick-gen-key', 'Test <t@example.org>', 'ed25519', 'sign']).status, 0);
    const key = gpg(['--passphrase', 'pw', '--armor', '--export-secret-keys']).stdout;
    const deb = join(dir, 'app.deb');
    writeFileSync(deb, 'pretend package');
    assert.deepEqual(gpgSign([deb], key, 'pw'), [`${deb}.asc`]);
    assert.match(readFileSync(`${deb}.asc`, 'utf8'), /BEGIN PGP SIGNATURE/);
    assert.equal(gpg(['--verify', `${deb}.asc`, deb]).status, 0, 'the signature checks out');
    assert.throws(() => gpgSign([deb], key, 'wrong'), /gpg/, 'a wrong passphrase fails loudly');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the workflow hands signing keys to the build only off pull requests', () => {
  const build = jobs(read('.github/workflows/desktop-app.yml')).build.join('\n');
  const steps = build.split(/\n {6}- /);
  const unsigned = steps.find((s) => /github\.event_name == 'pull_request'/.test(s));
  const signed = steps.find((s) => /github\.event_name != 'pull_request'/.test(s));
  assert.match(unsigned, /run: node scripts\/desktop-build\.mjs\b/);
  assert.doesNotMatch(unsigned, /secrets\./, 'a pull request build gets no key');
  assert.match(signed, /run: node scripts\/desktop-build\.mjs\b/);
  const named = [...signed.matchAll(/^\s+([A-Z_]+): \$\{\{ secrets\.([A-Z_]+) \}\}$/gm)];
  assert.deepEqual(named.map(([, a]) => a).sort(), [...KEYS.macOS, ...KEYS.notarise, ...KEYS.Linux].sort());
  for (const [, a, b] of named) assert.equal(a, b, 'each key under its own name');
  assert.equal([...build.matchAll(/secrets\./g)].length, named.length, 'no key anywhere else in the job');
});

function hasGpg() {
  return spawnSync('gpg', ['--version']).status === 0;
}
