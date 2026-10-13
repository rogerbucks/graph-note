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
  for (const name of ['token', 'pin', 'passcode', 'key', 'card_pin', 'session_token'])
    assert.deepEqual(credentialsIn(named(name)), ['a password or secret'], name);
});

test('a name that only holds such a word inside another word is not one', () => {
  for (const name of ['keynote', 'monkey', 'pinboard', 'tokenised', 'password_hint_shown'])
    assert.deepEqual(credentialsIn(named(name)), [], name);
});
