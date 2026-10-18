// A note with no classification (editor spec §19, unclassified_strictest; Roger, 14 Oct 2026). It counts as the most
// sensitive level, so it goes only to a model cleared for everything. That holds unless the user sets another default
// for unlabelled notes. Nothing at the highest level goes to any model (never_credential). So by default an unlabelled
// note goes to none, and the editor says why and what to change. The setting on Obsidian's page and its use there are
// tested in packages/obsidian/test/ai-unlabelled.test.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSend } from '../src/ai.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';

const GRAPH = "// graph: reader\n(question:Question {name: 'Which device?'}),\n(alice:Person {name: 'Alice'})";
const BODY = `# Reader\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
const model = (name, ceiling, endpoint = 'http://localhost:11434/v1/chat/completions') => ({
  name,
  purpose: 'Proposing changes',
  ceiling,
  endpoint,
  model: 'm',
});
const MODELS = [
  model('Open', 'Public', 'https://api.example.com/v1/chat/completions'),
  model('Office', 'Internal'),
  model('Vault', 'Confidential'),
  model('Everything', 'Restricted'),
];
const ask = (settings, name) => ({
  settings,
  model: name,
  note: BODY,
  notePath: 'Reader.md',
  level: null,
  choice: { graph: 'reader', what: 'graph' },
  question: 'What is missing?',
});

describe('by default an unlabelled note counts as the most sensitive level, so it goes to no model', () => {
  test('the default for unlabelled notes is the most sensitive classification, and an option on the page', () => {
    assert.equal(DEFAULT_SETTINGS.aiUnlabelled, DEFAULT_SETTINGS.classifications.at(-1));
    const o = OPTIONS.find((x) => x.key === 'aiUnlabelled');
    assert.equal(o.section, 'AI models');
    assert.match(o.sentence, /no classification/);
  });

  test('it is refused for every model, even one cleared for everything, saying why and what to change', () => {
    const s = settingsFrom({ aiUse: 'on', aiModels: MODELS });
    for (const m of MODELS) {
      const r = prepareSend(ask(s, m.name));
      assert.ok(r.refused, m.name);
      assert.match(r.refused, /no classification, so it counts as Restricted/, m.name);
      assert.match(r.refused, /nothing at it is ever sent to any model/, m.name);
      assert.match(r.refused, /give the note a classification/i, m.name);
      assert.match(r.refused, /Unlabelled notes count as/, m.name);
      assert.deepEqual(r.cleared, [], m.name);
    }
  });

  test('a default that is not one of the classifications set is read back as the most sensitive', () => {
    assert.equal(settingsFrom({ aiUnlabelled: 'Nonesuch' }).aiUnlabelled, 'Restricted');
    assert.equal(
      settingsFrom({ classifications: ['Open', 'Closed'], aiUnlabelled: 'Internal' }).aiUnlabelled,
      'Closed',
    );
    assert.equal(settingsFrom({ aiUnlabelled: 'Internal' }).aiUnlabelled, 'Internal');
  });
});

describe('with a lower default set, an unlabelled note counts as that level', () => {
  const s = settingsFrom({ aiUse: 'on', aiModels: MODELS, aiUnlabelled: 'Internal' });

  test('it goes to the models cleared for that level, and is said to count as it', () => {
    for (const name of ['Office', 'Vault']) {
      const p = prepareSend(ask(s, name));
      assert.ok(!('refused' in p), `${name}: ${p.refused}`);
      assert.match(p.summary.join('\n'), /no classification, so it counts as Internal/);
    }
  });

  test('and to none cleared only for a lower one, which is told why and offered the models cleared for it', () => {
    const r = prepareSend(ask(s, 'Open'));
    assert.match(r.refused, /no classification, so it counts as Internal, above Open’s ceiling, Public/);
    assert.deepEqual(r.cleared, ['Office', 'Vault', 'Everything']);
  });
});
