// The digest a send is recorded by (editor spec §19, record_every_send): SHA-256 of the text sent, as UTF-8, in
// hexadecimal, so the record can show what was sent was this text without keeping the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, utf8Size } from '../src/ai-digest.ts';

const node = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

test('the digest is SHA-256 of the text as UTF-8, across the lengths where its padding changes', () => {
  const texts = ['', 'abc', 'é and 😀', ...[55, 56, 63, 64, 65, 119, 120, 1000].map((n) => 'x'.repeat(n))];
  for (const t of texts) assert.equal(sha256(t), node(t), `${t.length} characters`);
});

test('a lone surrogate is taken as U+FFFD, as a UTF-8 encoder sends it', () => {
  for (const t of ['a\uD800b', '\uDC00', 'end \uD83D']) assert.equal(sha256(t), node(t), JSON.stringify(t));
  assert.equal(utf8Size('a\uD800b'), Buffer.byteLength('a\uD800b', 'utf8'));
});

test('the size is the bytes sent, as UTF-8', () => {
  assert.equal(utf8Size('abc'), 3);
  assert.equal(utf8Size('é'), 2);
  assert.equal(utf8Size('😀'), 4);
});
