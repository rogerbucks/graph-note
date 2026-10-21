// A model's address (editor spec §19, user_models): plain http only to this device, by its exact name. Nothing in the
// address could send a request somewhere else than it says, or carry a secret in it. A model's purpose is said in the
// person's language, while the value saved stays the spec's own (§42, words_catalogue).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as choice from '../src/ai-choice.ts';

const { AI_PURPOSES, endpointProblem } = choice;
/** A purpose as the person reads it; the module's own, looked up when called. */
const purposeWords = (purpose) => choice.purposeWords(purpose);
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';

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

test('each of the spec’s purposes is said in the test language; the saved values stay as the spec writes them', () => {
  setLanguage('en-XA');
  try {
    for (const purpose of AI_PURPOSES) {
      const said = purposeWords(purpose);
      assert.ok(isPseudoWord(said), `${purpose}: ${said}`);
      assert.notEqual(said, purpose);
    }
    assert.equal(purposeWords('proposing changes'), purposeWords('Proposing changes'));
    assert.equal(purposeWords('My own purpose'), 'My own purpose');
    assert.deepEqual(AI_PURPOSES, ['Research questions', 'Proposing changes', 'Restricted processing']);
  } finally {
    setLanguage(SOURCE_LANGUAGE);
  }
  assert.deepEqual(AI_PURPOSES.map(purposeWords), AI_PURPOSES);
});
