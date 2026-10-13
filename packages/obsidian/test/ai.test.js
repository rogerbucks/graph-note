// Asking an AI model from Obsidian (spec §19): off until turned on; the dialog where the user chooses what to send and a
// model, sees exactly what will be sent, and sends it; the key from the app's secret store; the answer written into the
// note as a change set beside the graph; every send recorded in the plugin's data. Obsidian's request function is the
// fake host's, which never reaches the network.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

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
const NOTE = `# Reader\n\nProse that is never sent.\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
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
  keyName: 'graph-note-remote',
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

const command = (env) => env.state.commands.find((c) => c.id === 'ask-ai-model');
const dialog = (env) => env.state.modals.at(-1);
const row = (m, name) =>
  m.contentEl
    .querySelectorAll('.setting-item')
    .find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const shownBody = (m) => m.contentEl.querySelector('.graph-note-ai-body')?.textContent ?? null;
const said = (m) => m.contentEl.querySelector('.graph-note-ai-shown')?.textContent ?? '';

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
      assert.equal(record.sent, body);
      assert.equal(record.model, 'Local');
      assert.equal(record.outcome, 'answered');
      assert.match(env.state.notices.at(-1), /Local proposed 1 change/);
      assert.equal(env.state.modals.length, 0, 'the dialog closes');
    } finally {
      env.uninstall();
    }
  });

  test('the key is taken from the app’s secret store as it is sent, and written nowhere', async () => {
    const env = await open(ON, NOTE.replace('# Reader', '---\nclassification: Public\n---\n# Reader'));
    try {
      env.state.secrets.set('graph-note-remote', KEY);
      env.state.reply = reply([{ op: 'remove-thing', thing: 'alice' }]);
      const m = await shown(env, 'Remote');
      assert.ok(!said(m).includes(KEY));
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
    const env = await open(ON, NOTE.replace('# Reader', '---\nclassification: Internal\n---\n# Reader'));
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
