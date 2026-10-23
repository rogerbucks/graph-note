// The host's own AI (editor spec §19, host_ai_first), host-free. A host such as VS Code offers its own models: they
// are sent through the host, with no address and no key here. Every rule the core keeps for a model still holds:
// - AI stays off until turned on;
// - the note is held to the model's ceiling, and a credential is never sent;
// - the answer comes back as a proposal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { hostAiModel } from '../src/ai-host.ts';
import { settingsFrom } from '../src/settings.ts';

const NOTE = "# Reader\n\n```gql\n// graph: reader\n(q:Question {name: 'Which device?'})\n```\n";
const HOST = { name: 'VS Code: GPT', model: 'gpt-x', address: 'VS Code’s language models', ceiling: 'Internal' };
const ask = (over = {}) => ({
  settings: settingsFrom({ aiUse: 'on' }),
  model: HOST.name,
  host: HOST,
  note: NOTE,
  notePath: 'Reader.md',
  level: 'Internal',
  choice: { graph: 'reader', what: 'graph' },
  question: 'What is missing?',
  ...over,
});

test('the host’s own model is a model with no key and no purpose, its ceiling one of the classifications', () => {
  const m = hostAiModel(HOST, ['Public', 'Internal']);
  assert.deepEqual(m, {
    name: 'VS Code: GPT',
    purpose: '',
    ceiling: 'Internal',
    endpoint: 'VS Code’s language models',
    model: 'gpt-x',
    keyName: '',
  });
});

test('it is offered with no model set up here, once AI is turned on, and never while AI is off', () => {
  const p = prepareSend(ask());
  assert.ok(!('refused' in p), JSON.stringify(p));
  assert.equal(p.to, 'VS Code’s language models');
  assert.match(p.summary[0], /VS Code: GPT/);
  assert.match(prepareSend(ask({ settings: settingsFrom({}) })).refused, /AI is off/);
});

test('a note above its ceiling, or holding a credential, is never sent to it', () => {
  assert.ok('refused' in prepareSend(ask({ level: 'Confidential' })));
  const secret = ['k', 'q'.repeat(24)].join('-');
  const leaky = NOTE.replace("'Which device?'", `'${secret}'`);
  assert.ok('refused' in prepareSend(ask({ note: leaky, secrets: [secret] })));
});

test('a model by another name is not the host’s: it must be set up here as before', () => {
  assert.match(prepareSend(ask({ model: 'Other' })).refused, /No AI model is set up yet/);
});

test('it is sent through the transport the host hands in, and its answer is a proposal', async () => {
  const p = prepareSend(ask());
  const sent = [];
  const answer = { changes: [{ op: 'add-thing', name: 'tablet', kind: 'Option', properties: { name: 'Tablet' } }] };
  const transport = async (request) => {
    sent.push(request);
    return { status: 200, text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }) };
  };
  const result = await sendPrepared(p, confirmSend(p), { transport, key: null });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'VS Code’s language models');
  assert.equal(sent[0].body, p.body);
  assert.equal(result.record.outcome, 'answered', JSON.stringify(result));
  assert.equal(result.proposal.changes.length, 1);
});
