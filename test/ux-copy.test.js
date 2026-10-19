// The plain-language check of every message the user reads (editor spec §41, ux_copy_auto). Every view of every host
// gives up its messages. These are the same views test/wcag.test.js checks. A message is its words, and the names,
// hints and titles on its controls, with the notices and menu items the host shows. The person's own words (the
// drawing, the text being edited) are left out. Each message must:
// - read at grade 9 or lower;
// - keep its sentences to 25 words;
// - use none of the listed jargon. "GQL" is allowed where the graph's own text is the subject: the edit pane, the
//   export form and the settings.
// A message that misses for a reason is recorded in quality/copy.json with its scores. It may get better, never worse,
// without the record raised. The check itself is tried first. Scoring: scripts/plain-english.mjs.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from '../packages/obsidian/test/host/load-plugin.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { openEditorPage } from './repository/wcag-page.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';
import { messagesOf } from './repository/copy-harvest.js';
import { LIMITS, covers, jargonIn, missesOf, readingGrade, scoreOf } from '../scripts/plain-english.mjs';

const RECORD = JSON.parse(readFileSync(new URL('../quality/copy.json', import.meta.url), 'utf8'));
const CODES = JSON.parse(
  readFileSync(new URL('../packages/graph-spec/src/reader/problem-codes.json', import.meta.url), 'utf8'),
);
/** The views whose subject is the graph's own text, where its language may be named. */
const developer = (view) => /edit pane|export form|settings page/.test(view);

/** One line for each message of `view` that misses a limit with no recorded reason covering it. */
function problemsOf(view, messages) {
  const out = [];
  for (const { text, where } of messages) {
    const score = scoreOf(text, { developer: developer(view) });
    const misses = missesOf(score);
    if (!misses.length) continue;
    const recorded = RECORD.accepted.find((r) => r.text === text);
    if (recorded && covers(recorded, score)) continue;
    out.push(
      `${view} · ${where}: “${text}” ${misses.join('; ')}` +
        (recorded ? ' (worse than recorded: raise the record, with a reason, or fix it)' : ''),
    );
  }
  return out;
}

/** Every message seen, so a record no message needs any more is found. */
const seen = new Set();

describe('the check itself', () => {
  test('reads plain words as easy and long, abstract ones as hard', () => {
    assert.ok(readingGrade('The cat sat on the mat. It was warm.') < 3);
    const hard =
      'Notwithstanding the aforementioned considerations, the configuration necessitates comprehensive reconsideration.';
    assert.ok(readingGrade(hard) > LIMITS.grade, String(readingGrade(hard)));
  });

  test('finds a sentence that runs on, and jargon, saying what to write instead', () => {
    const long = `${'word '.repeat(LIMITS.sentenceWords + 1).trim()}.`;
    assert.match(missesOf(scoreOf(long)).join(), /a sentence of 26 words, over 25/);
    assert.match(missesOf(scoreOf('The payload could not be parsed.')).join('; '), /“payload”: say “what is sent”/);
    assert.deepEqual(jargonIn('Data as a GQL block'), ['GQL']);
    assert.deepEqual(jargonIn('Data as a GQL block', { developer: true }), []);
    assert.deepEqual(jargonIn('A node of knowledge, its edges'), ['node', 'edges']);
    assert.deepEqual(jargonIn('Nodes are things; nobody minds'), ['nodes']);
  });

  test('refuses a reference to a section of a spec, and the word profile, saying what to write instead', () => {
    assert.deepEqual(jargonIn('keep to the document profile (§3)', { developer: true }), ['profile', '§']);
    assert.match(missesOf(scoreOf('a DELETE names one target (§24)')).join('; '), /“§”: say “what to type”/);
  });

  test('a short label has no reading grade to miss; a plain message misses nothing', () => {
    assert.equal(scoreOf('Zoom in').grade, null);
    assert.deepEqual(missesOf(scoreOf('Add a comma at the end of the line.')), []);
  });

  test('a record covers a message that scores no worse, never one that got worse', () => {
    const recorded = { text: 't', grade: 11, longest: 30, jargon: ['GQL'] };
    assert.ok(covers(recorded, { grade: 10, longest: 30, jargon: [] }));
    assert.ok(!covers(recorded, { grade: 12, longest: 30, jargon: [] }), 'a higher grade');
    assert.ok(!covers(recorded, { grade: 10, longest: 31, jargon: [] }), 'a longer sentence');
    assert.ok(!covers(recorded, { grade: 10, longest: 20, jargon: ['node'] }), 'new jargon');
  });

  test('each record gives its scores, a reason and a day', () => {
    for (const r of RECORD.accepted) {
      assert.equal(typeof r.text, 'string', JSON.stringify(r));
      assert.ok(typeof r.longest === 'number' && Array.isArray(r.jargon), JSON.stringify(r));
      assert.ok(typeof r.reason === 'string' && r.reason.trim(), `no reason: ${r.text}`);
      assert.match(String(r.date), /^\d{4}-\d{2}-\d{2}$/, r.text);
    }
  });
});

describe('the Obsidian host: every view’s messages in plain English', () => {
  before(() => build());

  for (const [name, open] of Object.entries(OBSIDIAN))
    test(`${name}: every message reads plainly`, async () => {
      const { env, el } = await open();
      try {
        const messages = [
          ...messagesOf(el),
          ...(env.state.notices ?? []).map((text) => ({ text, where: 'notice' })),
          ...(env.state.menus ?? []).flatMap((m) => m.items.map((i) => ({ text: i.title, where: 'menu item' }))),
        ];
        messages.forEach((m) => seen.add(m.text));
        assert.ok(messages.length > 0, 'it found the view’s messages');
        assert.deepEqual(problemsOf(name, messages), []);
      } finally {
        env.uninstall();
      }
    });
});

describe('the browser editor’s page: every state’s messages in plain English', () => {
  let dir;
  const opened = [];
  before(async () => {
    ({ dir } = await built());
  });
  after(async () => {
    await Promise.all(opened.map((o) => o.stop()));
    await cleanUp();
  });

  const open = (hash, note, draft) => {
    const page = openEditorPage(dir, hash, note, draft);
    opened.push(page);
    return page;
  };
  const STATES = pageStates(open);

  for (const [name, state] of Object.entries(STATES))
    test(`${name}: every message reads plainly`, async () => {
      const page = await state();
      try {
        const messages = messagesOf(page.window.document.body);
        messages.forEach((m) => seen.add(m.text));
        assert.ok(messages.length > 0, 'it found the page’s messages');
        assert.deepEqual(problemsOf(name, messages), []);
      } finally {
        page.window.close();
      }
    });
});

// NEURO-4 (problem_says_what_to_type): the reader's problems are not in a view until a block is broken. So every one
// in the table of problem codes is checked here, as the edit pane shows it, each {name} filled with a short word.
describe('every problem the reader can raise, as the edit pane shows it', () => {
  const filled = (text) => text.replace(/\{[a-z_]+\}/g, 'x');
  test('its message and fix say what to type, plainly, and cite no section of a spec', () => {
    const messages = CODES.codes.flatMap((c) => [
      { text: filled(c.message), where: `${c.code} message` },
      { text: filled(c.fix), where: `${c.code} fix` },
    ]);
    messages.forEach((m) => seen.add(m.text));
    assert.deepEqual(problemsOf('edit pane', messages), []);
  });
});

test('the record holds only messages still shown: one no view says any more is taken out', () => {
  assert.deepEqual(
    RECORD.accepted.filter((r) => !seen.has(r.text)).map((r) => r.text),
    [],
  );
});
