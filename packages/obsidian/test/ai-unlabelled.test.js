// A note with no classification in Obsidian (spec §19, unclassified_strictest; Roger, 14 Oct 2026):
// - The setting Unlabelled notes count as on the page, the most sensitive until chosen.
// - The send dialog uses it. Send is kept off for an unlabelled note by default.
// - The note's classification is read from its text and the metadata cache, and the higher is taken.
//   It is read again each time what will be sent is shown. The core's rule is tested in
// packages/core/test/ai-unlabelled.test.js.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const GRAPH = "// graph: reader\n(question:Question {name: 'Which device?'}),\n(alice:Person {name: 'Alice'})";
const BODY = `# Reader\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
const OFFICE = {
  name: 'Office',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'm',
};
const ON = { aiUse: 'on', aiModels: [OFFICE] };
const front = (level) => `---\n${'classification'}: ${level}\n---\n`;

describe('in Obsidian', () => {
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

  /** Shows what will be sent in the dialog open now, for the model chosen first: the body, what is said, Send. */
  function showAgain(e) {
    const m = e.state.modals.at(-1);
    const button = (label) =>
      m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
    button('Show what will be sent').click();
    return {
      body: m.contentEl.querySelector('.thoughtknot-ai-body')?.textContent ?? null,
      said: m.contentEl.querySelector('.thoughtknot-ai-shown')?.textContent ?? '',
      sendOff: button('Send').disabled,
    };
  }

  /** Opens the send dialog through the command and shows what will be sent. */
  async function shown(e) {
    await e.state.commands.find((c) => c.id === 'ask-ai-model').callback();
    assert.ok(e.state.modals.at(-1), e.state.notices.join(' | '));
    return showAgain(e);
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
    assert.ok(refused.sendOff, 'Send stays off for an unlabelled note');
    const sent = await shown(await open({ ...ON, aiUnlabelled: 'Internal' }, BODY));
    assert.ok(sent.body, sent.said);
    assert.equal(sent.sendOff, false);
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

  test('a classification that changes between Show and Send sends nothing, and asks for it to be shown again', async () => {
    // the cache says Old, the lowest classification for now, and the text Public: the note is Public, and may go
    const levels = ['Old', 'Public', 'Internal', 'Confidential', 'Restricted'];
    const e = await open({ ...ON, classifications: levels }, `${front('Public')}${BODY}`);
    e.app.metadataCache.getFileCache = () => ({ frontmatter: { classification: 'Old' } });
    const first = await shown(e);
    assert.ok(first.body, first.said);
    // Old stops being a classification before Send is pressed: the cache's Old now counts above every level
    await e.plugin.saveSettings({ ...e.plugin.settings, classifications: levels.slice(1) });
    e.state.reply = async () => ({ status: 200, text: '{}' });
    const m = e.state.modals.at(-1);
    m.contentEl
      .querySelectorAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Send')
      .click();
    await until(() => /changed since/.test(m.contentEl.querySelector('.thoughtknot-ai-shown')?.textContent ?? ''));
    const said = m.contentEl.querySelector('.thoughtknot-ai-shown').textContent;
    assert.match(said, /Nothing was sent/);
    assert.match(said, /Show what will be sent again/);
    assert.deepEqual(e.state.requests, []);
    assert.equal(m.contentEl.querySelector('.thoughtknot-ai-body'), null, 'what was shown is taken away');
    assert.equal((e.state.data?.aiSends ?? []).length, 0, 'no send recorded');
  });

  test('the classification is read again each time what will be sent is shown, against the classifications as they are then', async () => {
    // the text says Restricted; a stale cache still says Old, which is not a classification when the dialog opens
    const e = await open(ON, `${front('Restricted')}${BODY}`);
    e.app.metadataCache.getFileCache = () => ({ frontmatter: { classification: 'Old' } });
    assert.match((await shown(e)).said, /classified "Old", which is not one of the classifications set/);
    // Old is then made the lowest classification: the note is Restricted, the higher reading, and goes nowhere
    const s = e.plugin.settings;
    await e.plugin.saveSettings({ ...s, classifications: ['Old', ...s.classifications] });
    const again = showAgain(e);
    assert.equal(again.body, null, 'never sent as Old');
    assert.match(again.said, /classified Restricted, the highest classification set/);
    assert.doesNotMatch(again.said, /"Old"/);
  });
});
