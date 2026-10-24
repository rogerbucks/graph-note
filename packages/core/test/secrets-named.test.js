// A graph holds secrets only by name (editor spec §38, secrets_named_only). A write holding a password is refused by
// pattern. A named reference finds its value from the environment or the secret store when a run needs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSecretWrite, resolveSecret, secretRefs } from '../src/secrets.ts';
import { graphOf } from './export-code-fixtures.js';

// each value made here, so no line of this file has the shape of a secret
const value = ['h', 'u', 'n', 't', 'e', 'r'].join('').repeat(2);
const key = `${['s', 'k'].join('')}-${'Q'.repeat(24)}`;

test('a write holding a password is refused by pattern, and a named reference resolves from the secret store at run time', () => {
  assert.deepEqual(checkSecretWrite(`(smtp:Host {password: '${value}'})`), {
    ok: false,
    why: 'password',
    kinds: ['a password or secret'],
  });
  const refs = secretRefs(graphOf());
  assert.deepEqual(refs, [{ id: 'smtp', name: 'SMTP_PASSWORD', from: 'env' }]);
  assert.equal(checkSecretWrite("(smtp:SecretRef {name: 'SMTP_PASSWORD', from: 'env'})").ok, true);
  assert.equal(resolveSecret(refs[0], { env: { SMTP_PASSWORD: value } }), value);
  const stored = { ...refs[0], from: 'store' };
  assert.equal(resolveSecret(stored, { store: new Map([['SMTP_PASSWORD', value]]) }), value);
  assert.equal(resolveSecret(refs[0], { env: {} }), null);
});

test('restricted documentation may hold one key, flagged, but never a password and never two', () => {
  assert.deepEqual(checkSecretWrite(`(api:Service {key: '${key}'})`), {
    ok: false,
    why: 'secret',
    kinds: ['an API key'],
  });
  assert.deepEqual(checkSecretWrite(`(api:Service {key: '${key}'})`, { restricted: true }), {
    ok: true,
    flagged: ['an API key'],
  });
  assert.equal(
    checkSecretWrite(`(a:Service {key: '${key}'}),\n(b:Service {key: '${key}'})`, { restricted: true }).why,
    'more-than-one',
  );
  assert.equal(checkSecretWrite(`(h:Host {password: '${value}'})`, { restricted: true }).why, 'password');
});
