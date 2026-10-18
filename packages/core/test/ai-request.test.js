// A model's answer read back as changes (editor spec §19, answers_are_proposals). Only the JSON asked for is read. Each
// change is one of the five kinds with one-word names. The whole answer is refused when one change cannot be read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changesIn, readReply } from '../src/ai-request.ts';

test('an answer’s JSON is read whether or not it is fenced, each change as a proposal takes it', () => {
  const json = JSON.stringify({
    changes: [
      { op: 'add-thing', name: 'small', kind: 'Option', properties: { name: 'Small', price: 2, cheap: true } },
      { op: 'add-link', from: 'small', type: 'ANSWERS', to: 'question', reason: 'it  answers\nit' },
      { op: 'set', thing: 'large', key: 'name', value: "Large's" },
      { op: 'remove-thing', thing: 'alice' },
      { op: 'remove-link', from: 'alice', type: 'ASKED', to: 'question' },
    ],
  });
  const changes = changesIn('Here you are:\n```json\n' + json + '\n```');
  assert.deepEqual(changes, [
    { op: 'add', gql: "(small:Option {name: 'Small', price: 2, cheap: true})" },
    { op: 'add', gql: '(small)-[:ANSWERS]->(question)', reason: 'it answers it' },
    { op: 'set', thing: 'large', key: 'name', value: "'Large\\'s'" },
    { op: 'remove-thing', thing: 'alice' },
    { op: 'remove-link', from: 'alice', type: 'ASKED', to: 'question' },
  ]);
});

test('one change that cannot be read refuses the whole answer, saying which and why', () => {
  const said = (changes) => changesIn(JSON.stringify({ changes })).unread;
  assert.match(said([{ op: 'add-thing', name: 'two words', kind: 'Option' }]), /change 1 lacks a one-word name/);
  assert.match(said([{ op: 'add-thing', name: 'a', kind: 'K', properties: { 'x y': 1 } }]), /one-word name/);
  assert.match(said([{ op: 'set', thing: 'a', key: 'k', value: { nested: 1 } }]), /a value that is a text/);
  assert.match(said([{ op: 'rename', thing: 'a' }]), /not one of the changes asked for/);
  assert.match(said([]), /proposed no changes/);
  assert.match(changesIn('no json here').unread, /holds no JSON/);
});

test('a model’s reason is plain text: no Markdown in it can become an image, a link or HTML when notes are rendered', () => {
  const reason = '![](https://example.com/x.png) see [here](https://example.com) <img src=x> **now** `code` # head';
  const [change] = changesIn(JSON.stringify({ changes: [{ op: 'remove-thing', thing: 'alice', reason }] }));
  assert.doesNotMatch(change.reason, /(?<!\\)!\[|(?<!\\)\[[^\]]*(?<!\\)\]\(|(?<!\\)<[a-z]|(?<!\\)\*\*|(?<!\\)`/);
  // read as Markdown, every mark is a literal character again: the words are all still there
  assert.equal(change.reason.replace(/\\(.)/g, '$1'), reason);
});

test('a reply refused by its status says the status and the service’s own message, cut short', () => {
  assert.deepEqual(readReply(429, JSON.stringify({ error: { message: 'slow down' } })), {
    refused: 'HTTP 429: slow down',
  });
  assert.equal(readReply(500, 'x'.repeat(300)).refused.length, 'HTTP 500: '.length + 201);
  assert.deepEqual(readReply(200, JSON.stringify({ choices: [] })), { unread: 'its reply holds no message' });
});
