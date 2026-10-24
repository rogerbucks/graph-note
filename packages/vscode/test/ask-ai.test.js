// Ask AI about this note, in VS Code (spec §19, host_ai_first; §41, vscode_plugin). VS Code's own language models are
// offered first, through its language model API, so ThoughtKnot holds no key. The extension is built as it ships and
// loaded against a stand-in for VS Code over a real folder (fake-vscode.js). The person's answers are scripted in turn.
// Every rule the core keeps still holds:
// - nothing is sent while AI is off, or to a model the note's classification is above;
// - the exact request is shown, and only Send on it sends it, once, and not if the classification changed meanwhile;
// - the answer goes into the note as a proposal, and each send is recorded, the last ones only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanUpVscode, emptyFolder, vscodeOn } from './vscode-window.js';
import { fakeModel } from './fake-vscode.js';

after(cleanUpVscode);

const NOTE =
  "---\nclassification: Public\n---\n# Reader\n\n```gql\n// graph: reader\n(q:Question {name: 'Which device?'})\n```\n";
const ANSWER = JSON.stringify({
  changes: [{ op: 'add-thing', name: 'tablet', kind: 'Option', properties: { name: 'Tablet' } }],
});
const ON = { 'thoughtknot.ai.use': 'on', 'thoughtknot.ai.ceiling': 'Internal' };

/** The answer that picks the item labelled `label`. */
const pick = (label) => (asked) => asked.items.find((i) => (i.label ?? i) === label);
/** The answer that types `text`. */
const type = (text) => () => text;

/** A folder holding `text` as Reader.md, in a stand-in VS Code with `settings` and one model, Copilot. */
async function ready(text = NOTE, settings = ON) {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Reader.md'), text);
  const model = fakeModel('Copilot', ANSWER);
  const vs = await vscodeOn(folder, 'Reader.md', { settings, models: [model] });
  return { vs, model, file: () => readFileSync(join(folder, 'Reader.md'), 'utf8'), folder };
}

test('while AI is off nothing is asked or sent, and the message offers the settings', async () => {
  const { vs, model } = await ready(NOTE, {});
  vs.answers.push(pick('Open the settings'));
  await vs.ask();
  assert.match(vs.said[0], /AI is off/);
  assert.deepEqual(vs.ran, [['workbench.action.openSettings', 'thoughtknot.ai']]);
  assert.equal(model.sent.length, 0);
});

test('with no language model in VS Code, it says how to get one', async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Reader.md'), NOTE);
  const vs = await vscodeOn(folder, 'Reader.md', { settings: ON, models: [] });
  await vs.ask();
  assert.match(vs.said[0], /VS Code offers no language model yet/);
});

test('the chosen model gets exactly the request shown, once Send is chosen, and its answer is a proposal', async () => {
  const { vs, model, file } = await ready();
  vs.answers.push(pick('Copilot'), pick('The whole graph'), type('What is missing?'), pick('Send'));
  await vs.ask();
  assert.equal(model.sent.length, 1, vs.said.join('\n'));
  const shown = vs.shown[0].content;
  for (const m of model.sent[0].messages) assert.ok(shown.includes(JSON.stringify(m.content).slice(1, -1)));
  assert.match(model.sent[0].messages.at(-1).content, /What is missing\?/);
  assert.match(model.sent[0].options.justification, /ThoughtKnot sends the graph you chose/);
  assert.equal(vs.shown[0].beside.viewColumn, -2);
  assert.match(file(), /tablet/);
  const sends = vs.context.globalState.get('thoughtknot.aiSends');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].outcome, 'answered');
  assert.ok(!JSON.stringify(sends).includes('What is missing'), 'the record never holds the text sent');
});

test('a note above the ceiling for VS Code’s models is refused before anything is shown or sent', async () => {
  const { vs, model, file } = await ready(NOTE.replace('Public', 'Confidential'));
  vs.answers.push(pick('Copilot'), pick('The whole graph'), type('What is missing?'), pick('Send'));
  await vs.ask();
  assert.equal(model.sent.length, 0);
  assert.equal(vs.shown.length, 0);
  assert.equal(file(), NOTE.replace('Public', 'Confidential'));
});

test('a ceiling that is not one of the classifications, such as a typo, sends nothing', async () => {
  const { vs, model } = await ready(NOTE, { ...ON, 'thoughtknot.ai.ceiling': 'Intrnal' });
  vs.answers.push(pick('Copilot'), pick('The whole graph'), type('What is missing?'), pick('Send'));
  await vs.ask();
  assert.equal(model.sent.length, 0);
  assert.equal(vs.shown.length, 0);
  assert.match(vs.said.at(-1), /Intrnal/);
});

test('turning away from the request shown sends nothing and leaves the note as it was', async () => {
  const { vs, model, file } = await ready();
  vs.answers.push(pick('Copilot'), pick('The whole graph'), type('What is missing?'));
  await vs.ask();
  assert.equal(vs.shown.length, 1);
  assert.equal(model.sent.length, 0);
  assert.equal(file(), NOTE);
});

test('a classification raised while the request is shown takes it away: nothing is sent', async () => {
  const { vs, model, folder } = await ready();
  const raise = () => writeFileSync(join(folder, 'Reader.md'), NOTE.replace('Public', 'Internal'));
  vs.answers.push(pick('Copilot'), pick('The whole graph'), type('What is missing?'), (a) => (raise(), 'Send'));
  await vs.ask();
  assert.equal(model.sent.length, 0);
  assert.match(vs.said.at(-1), /Public/);
});

test('the record keeps the last 200 sends only', async () => {
  const { vs } = await ready();
  await vs.context.globalState.update(
    'thoughtknot.aiSends',
    Array.from({ length: 200 }, (_, i) => ({ old: i })),
  );
  vs.answers.push(pick('Copilot'), pick('The whole graph'), type('What is missing?'), pick('Send'));
  await vs.ask();
  const sends = vs.context.globalState.get('thoughtknot.aiSends');
  assert.equal(sends.length, 200);
  assert.equal(sends[0].old, 1);
  assert.equal(sends.at(-1).outcome, 'answered');
});
