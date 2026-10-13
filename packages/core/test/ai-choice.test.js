// A model's address (editor spec §19, user_models): plain http only to this device, by its exact name, and nothing in the
// address that could send a request somewhere else than it says, or carry a secret in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointProblem } from '../src/ai-choice.ts';

test('plain http only to this device, named exactly: localhost, 127.x.x.x or [::1]', () => {
  for (const ok of [
    'http://localhost:11434/v1/chat/completions',
    'http://127.0.0.1:1234/v1/chat/completions',
    'http://127.10.20.30/v1',
    'http://[::1]:8080/v1/chat/completions',
  ])
    assert.equal(endpointProblem(ok), null, ok);
  for (const far of [
    'http://evil.localhost/v1',
    'http://localhost.example.com/v1',
    'http://127.0.0.1.example.com/v1',
    'http://example.com/v1',
  ])
    assert.match(endpointProblem(far) ?? '', /https only/, far);
});

test('an address whose host is not what it seems is refused: a backslash, or any character an address name has not', () => {
  for (const hidden of [
    'http://example.com\\.localhost/v1',
    'https://example.com\\@localhost/v1',
    'https://exa mple.com/v1',
    'https://ex%61mple.com/v1',
    'https://example.com\t/v1',
    'https://éxample.com/v1',
  ])
    assert.match(endpointProblem(hidden) ?? '', /cannot be told apart|not an address/, hidden);
});

test('an address with a query string is refused, as a key or anything else could ride in it', () => {
  assert.match(endpointProblem('https://api.example.com/v1/chat/completions?key=abc') ?? '', /query/);
  assert.match(endpointProblem('https://api.example.com/v1/chat/completions?') ?? '', /query/);
  assert.match(endpointProblem('https://api.example.com/v1#part') ?? '', /query|fragment/);
});
