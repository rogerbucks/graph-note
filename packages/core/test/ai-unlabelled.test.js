// A note with no classification (editor spec §19, unclassified_strictest; Roger, 14 Oct 2026): it counts as the most
// sensitive level, so it goes only to a model cleared for everything, unless the user sets another default for
// unlabelled notes. Nothing at the highest level goes to any model (never_credential), so by default an unlabelled note
// goes to none, and the editor says why and what to change. The last part loads the built plugin, as the Obsidian
// package's tests do, to see the setting on the page and used by the send.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSend } from '../src/ai.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';
import { build, load, until } from '../../obsidian/test/host/load-plugin.js';

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

describe('in Obsidian', () => {
  before(() => build());
  const ON = { aiUse: 'on', aiModels: [model('Office', 'Internal')] };
  const front = (level) => `---\n${'classification'}: ${level}\n---\n`;
  let env = null;
  after(() => env?.uninstall());

  async function open(settings, note) {
    env?.uninstall();
    env = await load({ files: { 'Reader.md': note }, data: { settings } });
    env.state.activeView = new env.obsidian.MarkdownView(
      env.app.vault.getAbstractFileByPath('Reader.md'),
      note,
      'source',
    );
    return env;
  }

  /** What the send dialog shows after Show what will be sent, for the model chosen first. */
  async function shown(e) {
    await e.state.commands.find((c) => c.id === 'ask-ai-model').callback();
    const m = e.state.modals.at(-1);
    assert.ok(m, e.state.notices.join(' | '));
    m.contentEl
      .querySelectorAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Show what will be sent')
      .click();
    return {
      body: m.contentEl.querySelector('.graph-note-ai-body')?.textContent ?? null,
      said: m.contentEl.querySelector('.graph-note-ai-shown')?.textContent ?? '',
    };
  }

  test('the setting is on the page, the most sensitive level until chosen, and is saved when chosen', async () => {
    const e = await open(ON, BODY);
    const tab = e.state.settingTabs[0];
    tab.display();
    const row = tab.containerEl
      .querySelectorAll('.setting-item')
      .find((r) => r.querySelector('.setting-item-name')?.textContent === 'Unlabelled notes count as');
    assert.ok(row, 'the setting is on the page');
    const select = row.querySelector('select');
    assert.equal(select.value, 'Restricted');
    select.value = 'Internal';
    select.dispatch('change');
    await until(() => e.state.data?.settings?.aiUnlabelled === 'Internal');
  });

  test('the setting is used: an unlabelled note goes to a model cleared for the level chosen, and to none by default', async () => {
    const refused = await shown(await open(ON, BODY));
    assert.equal(refused.body, null);
    assert.match(refused.said, /counts as Restricted/);
    const sent = await shown(await open({ ...ON, aiUnlabelled: 'Internal' }, BODY));
    assert.ok(sent.body, sent.said);
  });

  test('when the metadata cache is behind the note, the higher reading is taken, an unlabelled one counting as its default', async () => {
    // the cache still says Public, but the note's own text no longer has a classification
    const e = await open(ON, BODY);
    e.app.metadataCache.getFileCache = () => ({ frontmatter: { classification: 'Public' } });
    assert.match((await shown(e)).said, /no classification, so it counts as Restricted/);
    // the cache has not seen a classification the text now has: the text's Confidential is taken over the cache's none
    const later = await open({ ...ON, aiUnlabelled: 'Public' }, `${front('Confidential')}${BODY}`);
    later.app.metadataCache.getFileCache = () => ({ frontmatter: {} });
    assert.match((await shown(later)).said, /classified Confidential, above Office’s ceiling, Internal/);
  });
});
