// A graph holds secrets only by name (editor spec §38, secrets_named_only). A write holding a password is refused by
// pattern. A named reference finds its value from the environment or the secret store when a run needs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSecretWrite, resolveSecret, secretRefs } from '../src/secrets.ts';
import { PaneSession } from '../src/pane.ts';
import { graphOf } from './export-code-fixtures.js';

// each value made here, so no line of this file has the shape of a secret
const value = ['h', 'u', 'n', 't', 'e', 'r'].join('').repeat(2);
const key = `${['s', 'k'].join('')}-${'Q'.repeat(24)}`;
const card = ['4', '1'.repeat(15)].join('');

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

test('restricted documentation refuses one line holding two secrets, a key and a card number', () => {
  assert.deepEqual(checkSecretWrite(`(api:Service {key: '${key}', card: '${card}'})`, { restricted: true }), {
    ok: false,
    why: 'more-than-one',
    kinds: ['an API key', 'a card number'],
  });
});

test('the pane refuses a password typed into a block, keeps what was typed, and leaves the note as it was', () => {
  const block = "// graph: mail\n(smtp:Host {name: 'SMTP'})";
  const note = ['# Mail', '', '```gql', block, '```', ''].join('\n');
  const s = new PaneSession(note, 2);
  const typed = `// graph: mail\n(smtp:Host {name: 'SMTP', password: '${value}'})`;
  s.type(typed);
  const r = s.write(note);
  assert.equal(r.ok, false);
  assert.match(r.reason, /never written into a graph/);
  assert.equal(r.draft, typed);
  assert.equal(r.note, undefined);
  assert.equal(s.text, block);
  // a named reference is written as any other edit
  s.type("// graph: mail\n(smtp:Host {name: 'SMTP'}),\n(pw:SecretRef {name: 'SMTP_PASSWORD', from: 'env'})");
  assert.equal(s.write(note).ok, true);
});
