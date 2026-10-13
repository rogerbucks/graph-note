// What looks like a credential (editor spec §19, never_credential): found by common patterns, wherever its name is in a
// longer one written with underscores, and named by kind, never quoted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialsIn } from '../src/ai-ceiling.ts';

// each value made here, so no line of this file has the shape of a secret
const value = ['v', 'a', 'l', 'u', 'e'].join('').repeat(2);
const named = (name) => `(server:Host {${name}: '${value}'})`;

test('a secret’s name inside a longer snake_case one is still found', () => {
  for (const name of ['user_password', 'db_secret', 'service_api_key', 'admin_passcode'])
    assert.deepEqual(credentialsIn(named(name)), ['a password or secret'], name);
});

test('token, pin, passcode and key are names of secrets too', () => {
  for (const name of ['token', 'pin', 'passcode', 'signing_key', 'card_pin', 'session_token'])
    assert.deepEqual(credentialsIn(named(name)), ['a password or secret'], name);
});

test('a secret’s name at the end of a camelCase one is found too', () => {
  for (const name of ['smtpPassword', 'dbSecret', 'apiKey', 'authToken', 'cardPin'])
    assert.deepEqual(credentialsIn(named(name)), ['a password or secret'], name);
});

test('a bare key is a word, not a secret: only a name ending in _key or Key is one', () => {
  assert.deepEqual(credentialsIn("(t:Table {key: 'primary'})"), []);
  assert.deepEqual(credentialsIn("(t:Table {Key: 'primary'})"), []);
  for (const name of ['api_key', 'private_key', 'API_KEY', 'apiKey', 'privateKey'])
    assert.deepEqual(credentialsIn(named(name)), ['a password or secret'], name);
  // a real key under a bare key is still found, by the shape of its value
  const real = `${['s', 'k'].join('')}-${'Q'.repeat(24)}`;
  assert.deepEqual(credentialsIn(`(t:Service {key: '${real}'})`), ['an API key']);
});

test('a card number is found by its checksum, alone or among words, and a number that fails it is not', () => {
  // the test number every card network publishes, made here so no line of this file has its shape
  const card = ['4111', '1111', '1111', '1111'];
  assert.deepEqual(credentialsIn(`(c:Card {number: '${card.join(' ')}'})`), ['a card number']);
  assert.deepEqual(credentialsIn(card.join('-')), ['a card number']);
  assert.deepEqual(credentialsIn(`paid with ${card.join('')}, thanks`), ['a card number']);
  assert.deepEqual(credentialsIn(`(c:Card {number: '${[...card.slice(0, 3), '1112'].join(' ')}'})`), []);
  assert.deepEqual(credentialsIn(`v${card.join('')}`), []);
});

test('a name that only holds such a word inside another word is not one', () => {
  for (const name of ['keynote', 'monkey', 'pinboard', 'tokenised', 'password_hint_shown'])
    assert.deepEqual(credentialsIn(named(name)), [], name);
});
