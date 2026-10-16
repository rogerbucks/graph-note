// The send dialog and the matrix note (editor spec §19, model_ceiling): the note is read each time what will be sent is
// shown; a note that cannot be read refuses plainly and leaves nothing ready to send; and a read that finishes after the
// user has changed the model or the question never makes what was shown ready. The rule itself is tested in
// packages/core/test/ai-matrix.test.js.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Reader.md';
const GRAPH = "// graph: reader\n(question:Question {name: 'Which device?'}),\n(alice:Person {name: 'Alice'})";
const NOTE = `---\n${'classification'}: Public\n---\n# Reader\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
const MATRIX = '| | Public | Internal |\n|---|---|---|\n| Local row | ✅ | ❌ |\n| Other row | ✅ | ❌ |\n';
const model = (name, matrixRow) => ({
  name,
  purpose: 'Proposing changes',
  ceiling: 'Public',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  matrixRow,
});
const SETTINGS = {
  aiUse: 'on',
  aiMatrixNote: 'Matrix.md',
  aiModels: [model('Local', 'Local row'), model('Other', 'Other row')],
};

async function open() {
  const env = await load({ files: { [PATH]: NOTE, 'Matrix.md': MATRIX }, data: { settings: SETTINGS } });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  await env.state.commands.find((c) => c.id === 'ask-ai-model').callback();
  return { env, m: env.state.modals.at(-1) };
}

const row = (m, name) =>
  m.contentEl
    .querySelectorAll('.setting-item')
    .find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const shownBody = (m) => m.contentEl.querySelector('.graph-note-ai-body')?.textContent ?? null;
const refused = (m) => m.contentEl.querySelector('.graph-note-ai-refused')?.textContent ?? null;

function choose(m, name, value) {
  const sel = row(m, name).querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

describe('the send dialog and the matrix note', () => {
  test('the note is read as the dialog shows what will be sent, and a model held to its row is sent to', async () => {
    const { env, m } = await open();
    try {
      choose(m, 'Model', 'Local');
      button(m, 'Show what will be sent').click();
      await until(() => shownBody(m) !== null);
      assert.equal(button(m, 'Send').disabled, false);
    } finally {
      env.uninstall();
    }
  });

  test('a note that cannot be read refuses plainly and leaves nothing ready to send', async () => {
    const { env, m } = await open();
    try {
      choose(m, 'Model', 'Local');
      button(m, 'Show what will be sent').click();
      await until(() => shownBody(m) !== null);
      // shown once, then the note stops being readable: the next Show must take the yes away
      env.app.vault.read = async () => {
        throw new Error('disk gone');
      };
      button(m, 'Show what will be sent').click();
      await until(() => refused(m) !== null);
      assert.match(refused(m), /matrix note could not be read/);
      assert.equal(shownBody(m), null);
      assert.ok(button(m, 'Send').disabled);
      assert.deepEqual(env.state.requests, []);
    } finally {
      env.uninstall();
    }
  });

  test('a read that finishes after the model or the question changed makes nothing ready', async () => {
    const { env, m } = await open();
    try {
      let finish;
      env.app.vault.read = () => new Promise((resolve) => (finish = resolve));
      choose(m, 'Model', 'Local');
      button(m, 'Show what will be sent').click();
      choose(m, 'Model', 'Other');
      finish(MATRIX);
      // the read has finished and its work has run: nothing shown, nothing ready
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(shownBody(m), null);
      assert.ok(button(m, 'Send').disabled);
      const field = row(m, 'Your question').querySelector('textarea');
      button(m, 'Show what will be sent').click();
      field.value = 'Something else?';
      field.dispatch('input');
      finish(MATRIX);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(shownBody(m), null);
      assert.ok(button(m, 'Send').disabled);
    } finally {
      env.uninstall();
    }
  });
});
