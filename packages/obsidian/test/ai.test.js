// Asking an AI model from Obsidian (spec §19):
// - It is off until turned on.
// - In the dialog the user chooses what to send and a model, sees exactly what will be sent, and sends it.
// - The key comes from the app's secret store.
// - The answer is written into the note as a change set beside the graph.
// - Every send is recorded in the plugin's data, by digest. Obsidian's request
// function is the fake host's, which never reaches the network.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Reader.md';
const GRAPH = [
  '// graph: reader',
  "(question:Question {name: 'Which device?'}),",
  "(large_reader:Option {name: 'Large reader', price: 3}),",
  "(alice:Person {name: 'Alice'}),",
  '(large_reader)-[:ANSWERS]->(question),',
  '(alice)-[:ASKED]->(question)',
].join('\n');
const BODY = `# Reader\n\nProse that is never sent.\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
/** The note with front matter giving it a classification; none for no front matter. */
const noteAt = (level) => (level ? `---\n${'classification'}: ${level}\n---\n${BODY}` : BODY);
const NOTE = noteAt('Public');
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const REMOTE = {
  name: 'Remote',
  purpose: 'Research questions',
  ceiling: 'Public',
  endpoint: 'https://api.example.com/v1/chat/completions',
  model: 'big-1',
  keyName: 'thoughtknot-remote',
};
const ON = { data: { settings: { aiUse: 'on', aiModels: [LOCAL, REMOTE] } } };
// a key made here, so no line of this file has the shape of one
const KEY = ['k', 'z'.repeat(24)].join('-');

const reply = (changes) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ changes }) } }] }),
});

/** The plugin loaded with `note` open in front, in Live Preview. */
async function open(options = {}, note = NOTE) {
  const env = await load({ files: { [PATH]: note }, ...options });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), note, 'source');
  return env;
}

const command = (env, id = 'ask-ai-model') => env.state.commands.find((c) => c.id === id);
const dialog = (env) => env.state.modals.at(-1);
const row = (m, name) =>
  m.contentEl
    .querySelectorAll('.setting-item')
    .find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const shownBody = (m) => m.contentEl.querySelector('.thoughtknot-ai-body')?.textContent ?? null;
const said = (m) => m.contentEl.querySelector('.thoughtknot-ai-shown')?.textContent ?? '';

function choose(m, name, value) {
  const sel = row(m, name).querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

/** Opens the dialog through the command, chooses the model, and shows what will be sent. */
async function shown(env, model = 'Local') {
  await command(env).callback();
  const m = dialog(env);
  assert.ok(m, `the dialog is open, not: ${env.state.notices.join(' | ')}`);
  choose(m, 'Model', model);
  button(m, 'Show what will be sent').click();
  return m;
}

describe('asking an AI model to propose changes (§19)', () => {
  test('the command opens nothing, and sends nothing, until AI is turned on and a model set up', async () => {
    const env = await open();
    try {
      await command(env).callback();
      assert.equal(env.state.modals.length, 0);
      assert.match(env.state.notices.at(-1), /AI is off/);
      assert.deepEqual(env.state.requests, []);
    } finally {
      env.uninstall();
    }
  });

  test('the dialog shows exactly what will be sent, and to which model, and Send waits until it is shown', async () => {
    const env = await open(ON);
    try {
      await command(env).callback();
      const m = dialog(env);
      assert.ok(button(m, 'Send').disabled, 'nothing to send before it is shown');
      choose(m, 'Model', 'Local');
      button(m, 'Show what will be sent').click();
      const body = shownBody(m);
      assert.ok(body && JSON.parse(body).model === 'llama3');
      assert.match(said(m), /To Local \(llama3\), at http:\/\/localhost:11434/);
      assert.ok(!body.includes('Prose that is never sent'));
      assert.equal(button(m, 'Send').disabled, false);
      // a change to what is asked takes the yes away until it is shown again
      const field = row(m, 'Your question').querySelector('textarea');
      field.value = 'Something else?';
      field.dispatch('input');
      assert.ok(button(m, 'Send').disabled);
      assert.equal(shownBody(m), null);
      assert.deepEqual(env.state.requests, []);
    } finally {
      env.uninstall();
    }
  });

  test('Send sends exactly what was shown, once; the answer is a change set beside the graph; the send is recorded', async () => {
    const env = await open(ON);
    try {
      env.state.reply = reply([
        { op: 'add-thing', name: 'small_reader', kind: 'Option', properties: { name: 'Small' } },
      ]);
      const m = await shown(env);
      const body = shownBody(m);
      button(m, 'Send').click();
      await until(() => env.state.files.get(PATH).includes('CHANGE SET'));
      assert.equal(env.state.requests.length, 1);
      assert.equal(env.state.requests[0].body, body);
      assert.equal(env.state.requests[0].url, LOCAL.endpoint);
      const note = env.state.files.get(PATH);
      assert.ok(note.startsWith(NOTE), 'the graph and everything before the change set are as they were');
      assert.match(note, /\(small_reader:Option \{name: 'Small'\}\)/);
      const [record] = env.state.data.aiSends;
      assert.equal(record.digest, createHash('sha256').update(body, 'utf8').digest('hex'));
      assert.equal(record.model, 'Local');
      assert.equal(record.outcome, 'answered');
      assert.match(env.state.notices.at(-1), /Local proposed 1 change/);
      assert.equal(env.state.modals.length, 0, 'the dialog closes');
    } finally {
      env.uninstall();
    }
  });

  test('the key is taken from the app’s secret store as it is sent, and written nowhere', async () => {
    const env = await open(ON);
    try {
      env.state.secrets.set('thoughtknot-remote', KEY);
      env.state.reply = reply([{ op: 'remove-thing', thing: 'alice' }]);
      const m = await shown(env, 'Remote');
      assert.ok(!said(m).includes(KEY));
      assert.match(said(m), /key named thoughtknot-remote/);
      button(m, 'Send').click();
      await until(() => env.state.files.get(PATH).includes('CHANGE SET'));
      assert.equal(env.state.requests[0].headers.Authorization, `Bearer ${KEY}`);
      assert.ok(!JSON.stringify(env.state.data).includes(KEY), 'not in the plugin’s data');
      assert.ok(!env.state.files.get(PATH).includes(KEY), 'not in the note');
      assert.ok(!env.state.notices.join('\n').includes(KEY), 'not in a notice');
    } finally {
      env.uninstall();
    }
  });

  test('the key of any model set up is never sent, even to a model that has no key', async () => {
    const env = await open(ON, NOTE.replace("'Alice'", `'${KEY}'`));
    try {
      env.state.secrets.set('thoughtknot-remote', KEY);
      const m = await shown(env, 'Local');
      assert.equal(shownBody(m), null);
      assert.match(said(m), /the key of a model set up here/);
      assert.ok(!said(m).includes(KEY));
    } finally {
      env.uninstall();
    }
  });

  test('a model that cannot be reached is said plainly, the note is left as it was, and the send is recorded', async () => {
    const env = await open(ON);
    try {
      const m = await shown(env);
      button(m, 'Send').click();
      await until(() => env.state.data?.aiSends?.length === 1);
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.match(env.state.notices.at(-1), /^Local could not be reached at .*Nothing was changed\.$/);
      assert.equal(env.state.data.aiSends[0].outcome, 'failed');
    } finally {
      env.uninstall();
    }
  });

  test('a note above the model’s ceiling is not sent: the dialog says why and names the model cleared for it', async () => {
    const env = await open(ON, noteAt('Internal'));
    try {
      const m = await shown(env, 'Remote');
      assert.equal(shownBody(m), null);
      assert.match(said(m), /above Remote’s ceiling, Public/);
      assert.match(said(m), /Local is cleared for Internal/);
      assert.ok(button(m, 'Send').disabled);
    } finally {
      env.uninstall();
    }
  });

  // a note with no classification, and the setting for it: packages/core/test/ai-unlabelled.test.js

  test('the classification is read from the note as it is sent too, and the higher taken when the cache is behind', async () => {
    const env = await open(ON, noteAt('Internal'));
    try {
      // the metadata cache has not caught up with the note, and still says Public
      env.app.metadataCache.getFileCache = () => ({ frontmatter: { classification: 'Public' } });
      const m = await shown(env, 'Remote');
      assert.equal(shownBody(m), null);
      assert.match(said(m), /classified Internal, above Remote’s ceiling, Public/);
    } finally {
      env.uninstall();
    }
  });

  test('the record keeps no text sent, only the last 200 sends, and can be cleared', async () => {
    const old = Array.from({ length: 200 }, (_, i) => ({ id: `ai-old-${i}`, outcome: 'failed' }));
    const env = await open({ data: { ...ON.data, aiSends: old } });
    try {
      const m = await shown(env);
      const body = shownBody(m);
      button(m, 'Send').click();
      await until(() => env.state.data.aiSends.at(-1)?.id !== 'ai-old-199');
      const sends = env.state.data.aiSends;
      assert.equal(sends.length, 200);
      assert.equal(sends[0].id, 'ai-old-1', 'the oldest is let go');
      assert.equal(sends.at(-1).size, Buffer.byteLength(body, 'utf8'));
      assert.ok(!JSON.stringify(sends.at(-1)).includes('Which device?'), 'nothing of the note is kept');
      await command(env, 'clear-ai-sends').callback();
      assert.deepEqual(env.state.data.aiSends, []);
      assert.match(env.state.notices.at(-1), /200 sends/);
    } finally {
      env.uninstall();
    }
  });

  test('a model’s reason is kept escaped in the note, and shown on the card as the plain text it gave', async () => {
    const reason = '![](https://example.com/x.png) see **this** <b>now</b> & more';
    const env = await open(ON);
    let note;
    try {
      env.state.reply = reply([{ op: 'remove-thing', thing: 'alice', reason }]);
      const m = await shown(env);
      button(m, 'Send').click();
      await until(() => env.state.files.get(PATH).includes('CHANGE SET'));
      note = env.state.files.get(PATH);
    } finally {
      env.uninstall();
    }
    // the first reason is the editor's own, on the declaration of the model; the model's is the one after it
    const line = note
      .split('\n')
      .filter((l) => l.startsWith('//@ reason: '))
      .at(-1);
    assert.ok(line && !line.includes('![') && !line.includes('<b>'), `escaped in the note: ${line}`);
    const viewer = await load({ files: { 'Some note.md': note } });
    try {
      const card = await show(viewer, note, 1);
      await until(() => !!card.el.querySelector('.thoughtknot-proposal-reason'));
      assert.equal(card.el.querySelectorAll('.thoughtknot-proposal-reason').at(-1).textContent, ` — ${reason}`);
    } finally {
      viewer.uninstall();
    }
  });

  test('only the things ticked are sent', async () => {
    const env = await open(ON);
    try {
      await command(env).callback();
      const m = dialog(env);
      choose(m, 'What to send', 'things');
      const tick = (name) => {
        const t = row(m, name).querySelector('input');
        t.checked = true;
        t.dispatch('change');
      };
      tick('Alice');
      tick('Which device?');
      button(m, 'Show what will be sent').click();
      const asked = JSON.parse(shownBody(m)).messages.at(-1).content;
      assert.ok(asked.includes('alice') && asked.includes(':ASKED'));
      assert.ok(!asked.includes('large_reader'));
    } finally {
      env.uninstall();
    }
  });
});
