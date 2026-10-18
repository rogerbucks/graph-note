// The AI models of §19, host-free: requests go only where and when the user says, within each model's ceiling, and come
// back as proposals. Every send here goes through a fake transport handed in, so no test reaches the network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { aiReady, confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { AI_PURPOSES, endpointProblem, modelChoices } from '../src/ai-choice.ts';
import { DEFAULT_SETTINGS, settingsFrom } from '../src/settings.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { gqlBlocks } from '../src/blocks.ts';

const fence = (text) => '```gql\n' + text + '\n```';
const GRAPH = [
  '// graph: reader',
  "(question:Question {name: 'Which device?'}),",
  "(large_reader:Option {name: 'Large reader', price: 3}),",
  "(alice:Person {name: 'Alice'}),",
  '(large_reader)-[:ANSWERS]->(question),',
  '(alice)-[:ASKED]->(question)',
].join('\n');
const OTHER = "// graph: other\n(plan:Plan {name: 'Never sent'})";
const VIEW = "// graph: reader · QUERY view picked_two\nMATCH (n) WHERE n.id IN ['question', 'large_reader'] RETURN n";
const NOTE = `# Reader\n\nProse that is never sent.\n\n${fence(GRAPH)}\n\n${fence(OTHER)}\n\n${fence(VIEW)}\n`;

const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Confidential',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const REMOTE = {
  name: 'Remote',
  purpose: 'Research questions',
  ceiling: 'Internal',
  endpoint: 'https://api.example.com/v1/chat/completions',
  model: 'big-1',
  keyName: 'thoughtknot-remote',
};
const ON = settingsFrom({ aiUse: 'on', aiModels: [LOCAL, REMOTE] });
// a key made here, so no line of this file has the shape of one
const KEY = ['k', 'q'.repeat(24)].join('-');
const CLOCK = () => new Date('2026-10-13T09:30:00Z');

const ask = (over = {}) => ({
  settings: ON,
  model: 'Local',
  note: NOTE,
  notePath: 'Reader.md',
  level: 'Internal',
  choice: { graph: 'reader', what: 'graph' },
  question: 'Which options are missing?',
  ...over,
});

/** A transport that records each request and gives back `reply` (or what `reply` makes of the request). */
function fake(
  reply = answer([{ op: 'add-thing', name: 'small_reader', kind: 'Option', properties: { name: 'Small' } }]),
) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return typeof reply === 'function' ? reply(req) : reply;
  };
  return { transport, calls };
}

/** A reply as an OpenAI-compatible endpoint gives it, holding these changes. */
function answer(changes) {
  const content = JSON.stringify({ changes });
  return { status: 200, text: JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }) };
}

function prepared(over) {
  const p = prepareSend(ask(over));
  assert.ok(!('refused' in p), p.refused);
  return p;
}

async function sent(over, reply, key = null) {
  const p = prepared(over);
  const t = fake(reply);
  const result = await sendPrepared(p, confirmSend(p), { transport: t.transport, key, now: CLOCK });
  return { p, ...t, result };
}

describe('AI is off until the user turns it on and sets up where requests go (ai_off_until_chosen)', () => {
  test('off by default, off with models but not turned on, off when on with no model, ready with both', () => {
    assert.equal(DEFAULT_SETTINGS.aiUse, 'off');
    assert.ok('off' in aiReady(settingsFrom(null)));
    assert.match(aiReady(settingsFrom({ aiModels: [LOCAL] })).off, /turn on/i);
    assert.match(aiReady(settingsFrom({ aiUse: 'on' })).off, /set (one )?up/i);
    assert.deepEqual(
      aiReady(ON).ready.map((m) => m.name),
      ['Local', 'Remote'],
    );
  });

  test('while it is off nothing can be prepared, so nothing can be sent, and no model is offered', () => {
    const off = settingsFrom({ aiModels: [LOCAL, REMOTE] });
    assert.match(prepareSend(ask({ settings: off })).refused, /turn on/i);
    assert.deepEqual(modelChoices(off, 'Proposing changes', { name: 'Host' }), []);
  });
});

describe('the host’s own AI comes first (host_ai_first)', () => {
  test('a host with an AI of its own has it offered first, before any model set up here', () => {
    const choices = modelChoices(ON, 'Proposing changes', { name: 'Host assistant' });
    assert.equal(choices[0].source, 'host');
    assert.equal(choices[0].name, 'Host assistant');
    assert.deepEqual(
      choices.slice(1).map((c) => c.name),
      ['Local', 'Remote'],
    );
  });

  test('a host with none offers only the models set up here', () => {
    assert.ok(modelChoices(ON, 'Proposing changes', null).every((c) => c.source === 'settings'));
  });
});

describe('models of the user’s own, each by its address (user_models)', () => {
  test('a local model by http, a remote one by https; anything else is refused with why', () => {
    assert.equal(endpointProblem('http://localhost:11434/v1/chat/completions'), null);
    assert.equal(endpointProblem('http://127.0.0.1:1234/v1/chat/completions'), null);
    assert.equal(endpointProblem('https://api.example.com/v1/chat/completions'), null);
    assert.match(endpointProblem('http://api.example.com/v1/chat/completions'), /https/);
    assert.match(endpointProblem(''), /no address/i);
    assert.match(endpointProblem('not an address'), /not an address/i);
    assert.match(endpointProblem('ftp://example.com/x'), /https/);
    assert.match(endpointProblem('https://user:pw@example.com/x'), /secret store/);
  });

  test('a send goes to the model’s own address, naming its own model', () => {
    const p = prepared({ model: 'Local' });
    assert.equal(p.to, LOCAL.endpoint);
    assert.equal(JSON.parse(p.body).model, 'llama3');
  });

  test('a model whose address cannot be used is never offered or sent to', () => {
    const plain = { ...REMOTE, name: 'Plain', endpoint: 'http://api.example.com/v1/chat/completions' };
    const s = settingsFrom({ aiUse: 'on', aiModels: [LOCAL, plain] });
    assert.ok(!modelChoices(s, 'Proposing changes', null).some((c) => c.name === 'Plain'));
    assert.match(prepareSend(ask({ settings: s, model: 'Plain' })).refused, /https/);
  });
});

describe('several models, each for its purpose (models_by_purpose)', () => {
  test('the model set up for a purpose is offered first for it, and said to be for it', () => {
    const research = modelChoices(ON, 'Research questions', null);
    assert.equal(research[0].name, 'Remote');
    assert.equal(research[0].forPurpose, true);
    assert.equal(research[1].forPurpose, false);
    assert.equal(modelChoices(ON, 'proposing changes', null)[0].name, 'Local');
  });

  test('the purposes suggested are the spec’s', () => {
    for (const p of ['Research questions', 'Proposing changes', 'Restricted processing'])
      assert.ok(AI_PURPOSES.includes(p));
  });
});

describe('a key is kept secret (keys_kept_secret)', () => {
  test('the key is put in the request only as it is sent: never in what is shown, recorded or said', async () => {
    const { p, calls, result } = await sent({ model: 'Remote' }, undefined, KEY);
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.ok(!JSON.stringify(p).includes(KEY), 'not in what is shown');
    assert.match(p.headersShown.Authorization, /thoughtknot-remote/);
    assert.ok(!JSON.stringify(result).includes(KEY), 'not in the record or the proposal');
  });

  test('a refusal that repeats the key never says it', async () => {
    const said = { status: 401, text: JSON.stringify({ error: { message: `bad key ${KEY}` } }) };
    const { result } = await sent({ model: 'Remote' }, said, KEY);
    assert.ok(result.failed);
    assert.ok(!JSON.stringify(result).includes(KEY));
    assert.match(result.failed, /the key/);
  });

  test('the key is taken out of a reply before it is cut short, so no part of it is said', async () => {
    const said = { status: 401, text: `${'x'.repeat(190)} ${KEY}` };
    const { result } = await sent({ model: 'Remote' }, said, KEY);
    assert.ok(!result.failed.includes(KEY.slice(0, 8)), result.failed);
    const thrown = await sent(
      { model: 'Remote' },
      () => {
        throw new Error(`refused with ${KEY}`);
      },
      KEY,
    );
    assert.ok(!JSON.stringify(thrown.result).includes(KEY.slice(0, 8)));
  });

  test('a model whose key is not in the secret store is not sent to, and nothing is asked of the network', async () => {
    const p = prepared({ model: 'Remote' });
    const t = fake();
    const result = await sendPrepared(p, confirmSend(p), { transport: t.transport, key: null, now: CLOCK });
    assert.match(result.refused, /thoughtknot-remote/);
    assert.equal(t.calls.length, 0);
  });

  test('a model with no key named sends no key', async () => {
    const { calls } = await sent({ model: 'Local' });
    assert.equal(calls[0].headers.Authorization, undefined);
  });
});

describe('each model carries a ceiling (model_ceiling, never_above_ceiling)', () => {
  test('a note at or below the model’s ceiling may be sent to it', () => {
    assert.ok(!('refused' in prepareSend(ask({ model: 'Remote', level: 'Internal' }))));
    assert.ok(!('refused' in prepareSend(ask({ model: 'Remote', level: 'Public' }))));
  });

  test('a note above it is never sent to it: why is said, and a model cleared for it offered', () => {
    const r = prepareSend(ask({ model: 'Remote', level: 'Confidential' }));
    assert.match(r.refused, /Confidential/);
    assert.match(r.refused, /Remote’s ceiling, Internal/);
    assert.deepEqual(r.cleared, ['Local']);
    assert.match(r.refused, /Local is cleared for Confidential/);
  });

  test('with no model cleared for it, that is said', () => {
    const s = settingsFrom({ aiUse: 'on', aiModels: [REMOTE] });
    const r = prepareSend(ask({ settings: s, model: 'Remote', level: 'Confidential' }));
    assert.deepEqual(r.cleared, []);
    assert.match(r.refused, /No model set up is cleared for Confidential/);
  });

  test('a classification that is not one of those set counts as above every ceiling', () => {
    assert.match(prepareSend(ask({ level: 'Secretish' })).refused, /not one of the classifications/);
  });

  test('a ceiling no longer among the classifications sends nothing until it is chosen again', () => {
    const s = settingsFrom({ aiUse: 'on', aiModels: [{ ...LOCAL, ceiling: 'Old' }] });
    assert.match(prepareSend(ask({ settings: s, level: 'Public' })).refused, /choose it again/);
  });
  // a note with no classification: packages/core/test/ai-unlabelled.test.js (unclassified_strictest)
});

describe('nothing credential-like is ever sent (never_credential)', () => {
  test('nothing at the highest classification set goes to any model, whatever its ceiling', () => {
    const s = settingsFrom({ aiUse: 'on', aiModels: [{ ...LOCAL, ceiling: 'Restricted' }] });
    const r = prepareSend(ask({ settings: s, level: 'Restricted' }));
    assert.match(r.refused, /highest classification/);
    assert.deepEqual(r.cleared, []);
  });

  test('what looks like a password is not sent, and is named by kind, never quoted', () => {
    // made here, so no line of this file has the shape of one
    const typed = ['hunter', '2'].join('').repeat(2);
    const graph = GRAPH.replace('price: 3}', `price: 3, pass${'word'}: '${typed}'}`);
    const r = prepareSend(ask({ note: `${fence(graph)}\n` }));
    assert.match(r.refused, /password/);
    assert.ok(!r.refused.includes(typed));
  });

  test('nor the key of a model set up here, wherever it is written', () => {
    const graph = GRAPH.replace("'Alice'", `'${KEY}'`);
    const r = prepareSend(ask({ note: `${fence(graph)}\n`, secrets: [KEY] }));
    assert.match(r.refused, /key/);
    assert.ok(!r.refused.includes(KEY));
  });

  test('nor to an address that carries a credential in it', () => {
    const odd = {
      ...REMOTE,
      name: 'Odd',
      endpoint: `https://api.example.com/${['s', 'k'].join('')}-${'Q'.repeat(24)}/v1`,
    };
    const s = settingsFrom({ aiUse: 'on', aiModels: [odd] });
    assert.match(prepareSend(ask({ settings: s, model: 'Odd', level: 'Public' })).refused, /API key/);
  });

  test('nor a credential typed into the question', () => {
    const r = prepareSend(ask({ question: `Is ${['A', 'KIA'].join('')}${'Q'.repeat(16)} still in use?` }));
    assert.match(r.refused, /access key/);
  });
});

describe('the user chooses what is sent (user_chooses_what)', () => {
  const content = (p) => JSON.parse(p.body).messages.at(-1).content;

  test('the whole graph: every thing and link of it, and nothing else of the note', () => {
    const sentText = content(prepared({ choice: { graph: 'reader', what: 'graph' } }));
    for (const w of ['question', 'large_reader', 'alice', ':ANSWERS', ':ASKED', 'Which options are missing?'])
      assert.ok(sentText.includes(w), w);
    for (const w of ['Prose', 'Never sent', 'plan', 'MATCH']) assert.ok(!sentText.includes(w), w);
  });

  test('a view: only the things it picks out, and the links between them', () => {
    const sentText = content(prepared({ choice: { graph: 'reader', what: 'view', view: 'picked_two' } }));
    assert.ok(sentText.includes('large_reader') && sentText.includes(':ANSWERS'));
    assert.ok(!sentText.includes('alice') && !sentText.includes(':ASKED'));
  });

  test('the things selected: only those, and the links between them', () => {
    const sentText = content(prepared({ choice: { graph: 'reader', what: 'things', things: ['alice', 'question'] } }));
    assert.ok(sentText.includes('alice') && sentText.includes(':ASKED'));
    assert.ok(!sentText.includes('large_reader') && !sentText.includes(':ANSWERS'));
  });

  test('a thing, view or graph that is not there is refused, as is choosing nothing', () => {
    assert.match(prepareSend(ask({ choice: { graph: 'reader', what: 'things', things: ['bob'] } })).refused, /bob/);
    assert.match(prepareSend(ask({ choice: { graph: 'reader', what: 'things', things: [] } })).refused, /at least one/);
    assert.match(prepareSend(ask({ choice: { graph: 'reader', what: 'view', view: 'none' } })).refused, /none/);
    assert.match(prepareSend(ask({ choice: { graph: 'nowhere', what: 'graph' } })).refused, /nowhere/);
  });
});

describe('the user sees exactly what is sent, and to which model, first (seen_before_sent)', () => {
  test('what the transport is given is exactly what was shown, to the model and address shown', async () => {
    const { p, calls } = await sent();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body, p.body);
    assert.equal(calls[0].url, p.to);
    assert.match(p.summary.join('\n'), /Local/);
    assert.ok(p.summary.join('\n').includes(LOCAL.endpoint));
  });

  test('what is shown stays as it was shown, whatever the settings do after, and names the key by its name', async () => {
    const models = [{ ...LOCAL }, { ...REMOTE }];
    const s = settingsFrom({ aiUse: 'on', aiModels: models });
    const p = prepared({ settings: s, model: 'Remote' });
    s.aiModels[1].endpoint = 'https://elsewhere.example.com/v1';
    s.aiModels[1].keyName = 'another-key';
    assert.equal(p.model.endpoint, REMOTE.endpoint);
    assert.equal(p.model.keyName, 'thoughtknot-remote');
    assert.match(p.summary.join('\n'), /key named thoughtknot-remote/);
    const t = fake();
    await sendPrepared(p, confirmSend(p), { transport: t.transport, key: KEY, now: CLOCK });
    assert.equal(t.calls[0].url, REMOTE.endpoint);
  });

  test('nothing is sent without the user’s yes to exactly that', async () => {
    const p = prepared(),
      other = prepared({ question: 'Something else?' });
    const t = fake();
    const deps = { transport: t.transport, key: null, now: CLOCK };
    assert.ok((await sendPrepared(p, undefined, deps)).refused);
    assert.ok((await sendPrepared(p, confirmSend(other), deps)).refused);
    const yes = confirmSend(p);
    assert.ok((await sendPrepared({ ...p, body: `${p.body} ` }, yes, deps)).refused, 'changed after the yes');
    assert.equal(t.calls.length, 0);
  });
});

describe('nothing is sent in the background (never_in_background)', () => {
  test('one yes, one send: a yes is never used again', async () => {
    const p = prepared();
    const t = fake();
    const deps = { transport: t.transport, key: null, now: CLOCK };
    const yes = confirmSend(p);
    assert.ok('proposal' in (await sendPrepared(p, yes, deps)));
    assert.match((await sendPrepared(p, yes, deps)).refused, /again/);
    assert.equal(t.calls.length, 1);
  });

  test('a yes that confirmSend did not give is refused', async () => {
    const p = prepared();
    const t = fake();
    const forged = { of: p.body };
    assert.ok((await sendPrepared(p, forged, { transport: t.transport, key: null, now: CLOCK })).refused);
    assert.equal(t.calls.length, 0);
  });
});

describe('an answer comes back as a proposal (answers_are_proposals)', () => {
  const CHANGES = [
    { op: 'add-thing', name: 'small_reader', kind: 'Option', properties: { name: 'Small reader' }, reason: 'cheaper' },
    { op: 'add-link', from: 'small_reader', type: 'ANSWERS', to: 'question' },
    { op: 'set', thing: 'large_reader', key: 'price', value: 4 },
  ];

  test('it is a proposal from the model, made against the graph as it was sent', async () => {
    const { result } = await sent({}, answer(CHANGES));
    const { proposal } = result;
    assert.equal(proposal.graph, 'reader');
    assert.deepEqual(proposal.provenance.by, { name: 'Local', kind: 'model' });
    assert.equal(proposal.provenance.basis, basisOf(NOTE, 'reader'));
    assert.deepEqual(
      proposal.changes.map((c) => c.op),
      ['add', 'add', 'set'],
    );
    assert.equal(proposal.changes[0].reason, 'cheaper');
  });

  test('written into the note it is a change set beside the graph, which it leaves as it was until a person accepts', async () => {
    const { result } = await sent({}, answer(CHANGES));
    const note = noteWithProposal(NOTE, result.proposal);
    assert.equal(typeof note, 'string', 'the model is declared by the editor, in the proposal');
    assert.equal(basisOf(note, 'reader'), basisOf(NOTE, 'reader'));
    const block = gqlBlocks(note)
      .map((b) => b.text)
      .find((t) => t.includes('CHANGE SET'));
    const review = ProposalReview.fromChangeSet(block);
    assert.deepEqual(
      review.pending().slice(1),
      result.proposal.changes.map((c) => c.id),
    );
    assert.equal(review.pending().length, 4, 'the three changes, and the declaration of the model before them');
    assert.ok(note.startsWith(NOTE.slice(0, NOTE.indexOf('```gql\n// graph: other'))));
  });
});

describe('every send is recorded (record_every_send)', () => {
  test('a digest of what was sent, its size and scope, to which model and address, and when, and never the text', async () => {
    const { p, result } = await sent();
    const r = result.record;
    assert.equal(r.at, '2026-10-13T09:30:00Z');
    assert.equal(r.model, 'Local');
    assert.equal(r.to, LOCAL.endpoint);
    assert.equal(r.digest, createHash('sha256').update(p.body, 'utf8').digest('hex'));
    assert.equal(r.size, Buffer.byteLength(p.body, 'utf8'));
    assert.deepEqual(r.scope, { kind: 'whole', things: 3, links: 2 });
    assert.ok(!JSON.stringify(r).includes('Which device?'), 'nothing of the note is kept');
    assert.deepEqual(Object.keys(r).sort(), ['at', 'digest', 'id', 'model', 'outcome', 'scope', 'size', 'to']);
    assert.equal(r.outcome, 'answered');
    assert.equal(result.proposal.id, r.id);
    assert.ok(
      result.proposal.provenance.read.some((x) => x.includes(r.id)),
      'the proposal leads back to the record',
    );
  });

  test('a send that fails is recorded too, with why', async () => {
    const { p, result } = await sent({}, () => {
      throw new Error('connect refused');
    });
    assert.equal(result.record.outcome, 'failed');
    assert.equal(result.record.size, Buffer.byteLength(p.body, 'utf8'));
    assert.match(result.record.why, /could not be reached/);
  });

  test('the scope of a view or of ticked things is kept as its kind and counts, never their names', async () => {
    const view = await sent({ choice: { graph: 'reader', what: 'view', view: 'picked_two' } });
    assert.deepEqual(view.result.record.scope, { kind: 'view', things: 2, links: 1 });
    const ticked = await sent({ choice: { graph: 'reader', what: 'things', things: ['alice', 'question'] } });
    assert.deepEqual(ticked.result.record.scope, { kind: 'ticked', things: 2, links: 1 });
    assert.ok(!JSON.stringify(ticked.result.record).includes('alice'));
  });
});

describe('a model that cannot be reached, or refuses, is said plainly and changes nothing (ai_unreachable)', () => {
  test('unreachable', async () => {
    const { result } = await sent({}, () => {
      throw new Error('connect refused');
    });
    assert.match(result.failed, /^Local could not be reached at http:\/\/localhost:11434/);
    assert.match(result.failed, /Nothing was changed\.$/);
    assert.equal(result.proposal, undefined);
  });

  test('refused by the model', async () => {
    const { result } = await sent({}, { status: 503, text: 'busy' });
    assert.match(result.failed, /^Local refused the request \(HTTP 503: busy\)/);
    assert.match(result.failed, /Nothing was changed\.$/);
  });

  test('an answer that is not changes', async () => {
    const { result } = await sent({}, { status: 200, text: 'not json at all' });
    assert.match(result.failed, /^Local answered, but not with changes this editor can read/);
    assert.match(result.failed, /Nothing was changed\.$/);
  });
});
