// AI providers a plug-in adds (editor spec §43, plugin_interface; §54, trust_ai_provider_bounded). A provider only
// shapes the request and reads the reply:
// - it is given the model's id, the instructions and the asked text, never the key, the notes or a way to send;
// - the core keeps the gate, the ceiling, the fence and the credential check, and the person sees the exact text shaped;
// - the host puts the key where the provider names, and sends;
// - the answer it reads is checked as any answer is.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { settingsFrom } from '../src/settings.ts';

const GRAPH = "// graph: reader\n(question:Question {name: 'Which device?'})";
const BODY = `# Reader\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
const KEY = 'the echo key, kept by the host';

const echo = {
  name: 'echo',
  title: 'Echo',
  key: { header: 'x-api-key' },
  shape: ({ model, instructions, asked }) => JSON.stringify({ model, system: instructions, input: asked }),
  read: ({ status, text }) => (status === 200 ? { content: JSON.parse(text).output } : { refused: `HTTP ${status}` }),
};
const registered = (provider = echo) => {
  const registry = pluginRegistry();
  registry.register({
    id: 'acme.echo',
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['ai'],
    register: (points) => points.ai.add(provider),
  });
  return registry;
};
const settings = (over = {}) =>
  settingsFrom({
    aiUse: 'on',
    aiModels: [
      {
        name: 'Echo',
        purpose: 'Proposing changes',
        ceiling: 'Internal',
        endpoint: 'https://echo.example.com/v1',
        model: 'e1',
        keyName: 'echo-key',
        provider: 'echo',
        ...over,
      },
    ],
  });
const ask = (registry, over = {}) => ({
  settings: settings(),
  model: 'Echo',
  note: BODY,
  notePath: 'Reader.md',
  level: 'Public',
  choice: { graph: 'reader', what: 'graph' },
  question: 'What is missing?',
  provider: registry.aiProvider('echo'),
  ...over,
});
const ANSWER = JSON.stringify({ changes: [{ op: 'add-thing', name: 'kindle', kind: 'Option', properties: {} }] });

describe('an AI provider only shapes the request and reads the reply (trust_ai_provider_bounded)', () => {
  test('it is given only the model, the instructions and the asked text, and the person sees exactly what it shaped', () => {
    let given;
    const registry = registered({ ...echo, shape: (r) => ((given = r), echo.shape(r)) });
    const p = prepareSend(ask(registry));
    assert.ok(!('refused' in p), p.refused);
    assert.deepEqual(Object.keys(given).sort(), ['asked', 'instructions', 'model']);
    assert.ok(Object.isFrozen(given));
    assert.match(given.asked, /graph-data/, 'the note’s graph comes fenced, as for any model');
    assert.equal(p.body, echo.shape(given), 'the body shown is the text it shaped');
    assert.equal(p.headersShown['x-api-key'], '(the key named echo-key in the app’s secret store)');
  });

  test('the host adds the key where the provider names, and the provider never sees it', async () => {
    const registry = registered();
    const p = prepareSend(ask(registry));
    let sent;
    const r = await sendPrepared(p, confirmSend(p), {
      key: KEY,
      transport: async (req) => ((sent = req), { status: 200, text: JSON.stringify({ output: ANSWER }) }),
    });
    assert.equal(sent.headers['x-api-key'], KEY);
    assert.equal(sent.headers.Authorization, undefined);
    assert.equal(sent.body, p.body);
    assert.ok('proposal' in r, r.failed);
  });

  test('the gate and the ceiling still hold: a note above the model’s ceiling is refused before the provider is called', () => {
    let called = false;
    const registry = registered({ ...echo, shape: (r) => ((called = true), echo.shape(r)) });
    const p = prepareSend(ask(registry, { level: 'Confidential' }));
    assert.ok('refused' in p);
    assert.equal(called, false);
  });

  test('a body it shapes holding a credential is refused, so nothing is sent', () => {
    const registry = registered({ ...echo, shape: () => `{"token": "${KEY}"}` });
    const p = prepareSend(ask(registry, { secrets: [KEY] }));
    assert.match(p.refused, /holds what looks like/);
  });

  test('a provider that throws, or gives no text, is named and nothing is sent', () => {
    for (const shape of [
      () => {
        throw new Error('no shape');
      },
      () => 42,
    ]) {
      const registry = registered({ ...echo, shape });
      const p = prepareSend(ask(registry));
      assert.match(p.refused, /The AI provider Echo of acme\.echo (failed: no shape|gave no request text)/);
    }
  });

  test('the answer it reads is checked as any answer is', async () => {
    const registry = registered();
    const p = prepareSend(ask(registry));
    const bad = JSON.stringify({ output: '{"changes":[{"op":"add-thing","name":"x","kind":"Person"}]}' });
    const r = await sendPrepared(p, confirmSend(p), { key: KEY, transport: async () => ({ status: 200, text: bad }) });
    assert.match(r.failed, /cannot add a Person/);
  });

  test('a reply it reads wrongly is named, and the key is never in what is said', async () => {
    const registry = registered({ ...echo, read: ({ text }) => ({ content: 7, text }) });
    const p = prepareSend(ask(registry));
    const r = await sendPrepared(p, confirmSend(p), {
      key: KEY,
      transport: async () => ({ status: 200, text: `oops ${KEY}` }),
    });
    assert.match(r.failed, /read no answer from the reply/);
    assert.ok(!r.failed.includes(KEY));
  });

  test('a model naming a provider that is not given is refused', () => {
    const p = prepareSend(ask(registered(), { provider: undefined }));
    assert.match(p.refused, /Echo is sent through the AI provider echo, which no plug-in adds/);
  });
});

describe('what an AI provider must be to be added', () => {
  for (const [what, provider, why] of [
    [
      'one not named by a lower-case word',
      { ...echo, name: 'Echo' },
      /the AI provider "Echo" is not named by a lower-case word/,
    ],
    ['one with no shaper', { ...echo, shape: undefined }, /the AI provider "echo" shapes no request/],
    ['one with no reader', { ...echo, read: undefined }, /the AI provider "echo" reads no reply/],
    [
      'one putting the key in a header it may not',
      { ...echo, key: { header: 'Host' } },
      /cannot put the key in the header "Host"/,
    ],
    [
      'one whose key format has no {key}',
      { ...echo, key: { header: 'x-api-key', format: 'Key' } },
      /writes the key with \{key\}/,
    ],
  ])
    test(`${what} is refused, and nothing is installed`, () => {
      assert.throws(() => registered(provider), why);
    });

  test('the registry lists the providers added, and none for a name no plug-in adds', () => {
    const registry = registered();
    assert.deepEqual(
      registry.aiProviders().map((p) => p.name),
      ['echo'],
    );
    assert.equal(registry.aiProvider('none'), undefined);
  });
});
