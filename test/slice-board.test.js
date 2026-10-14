// The slice board: a self-contained HTML page of how far the slice under way is proved, read from the generated
// requirements copy with the repo's own reader. Hand-made small graphs stand in for the real file, so each rule is seen
// on a case that shows it; one case runs the real command. Spec §12, requirements_checked_in_ci.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURRENT_SLICE } from '../scripts/check-requirements.mjs';
import {
  readBoard,
  renderBoard,
  statusOf,
  summarise,
  summariseBySection,
  summariseChecks,
} from '../scripts/slice-board.mjs';
import { BOARD_CSS } from '../scripts/slice-board-style.mjs';
import { path } from './repository/repo.js';

const FIXTURE = `// graph: editor_requirements · SOURCE
// Generated from the editor's requirements graph by graph-note-requirements-export.py — do not hand-edit; regenerate.
// ── Sections ──
(section_10:Section {num: '10', title: 'Hosts'}),
(section_3:Section {num: '3', title: 'Viewing <the default>'}),
(section_4:Section {num: '4', title: 'Edit pane'}),
// ── Requirements ──
(host_one:Requirement {section: '10', slice: 2, level: 'should', rule: 'A host rule.'}),
(view_proved:Requirement {section: '3', slice: 2, level: 'must', rule: 'Proved rule with <b>markup</b> & "quotes".'}),
(view_part:Requirement {section: '3', slice: 2, level: 'must', rule: 'Part rule.'}),
(view_open:Requirement {section: '3', slice: 2, level: 'must', rule: 'Open rule, test planned.'}),
(view_bare:Requirement {section: '3', slice: 2, level: 'may', rule: 'Bare rule, no test.'}),
(view_old:Requirement {section: '3', slice: 1, level: 'must', rule: 'Old slice rule.'}),
(view_later:Requirement {section: '4', slice: 3, level: 'must', rule: 'Later slice rule.'}),
// ── Tests ──
(test_done:Test {proves: 'a written proof <i>one</i>', file: 'test/one.test.js, test/two.test.js', where: 'repo', status: 'written'}),
(test_done_too:Test {proves: 'another written proof', file: 'test/three.test.js', where: 'repo', status: 'written'}),
(test_later:Test {proves: 'a planned proof', file: 'test/four.test.js', where: 'repo', status: 'planned'}),
(test_away:Test {proves: 'a written proof kept elsewhere', where: 'outside the repo', status: 'written'}),
(test_old:Test {proves: 'old proof', file: 'test/old.test.js', where: 'repo', status: 'written'}),
// ── Links ──
(host_one)-[:PROVED_BY]->(test_away),
(view_proved)-[:PROVED_BY]->(test_done),
(view_proved)-[:PROVED_BY]->(test_done_too),
(view_part)-[:PROVED_BY]->(test_done),
(view_part)-[:PROVED_BY]->(test_later),
(view_open)-[:PROVED_BY]->(test_later),
(view_old)-[:PROVED_BY]->(test_old)
`;

const board = readBoard(FIXTURE);
const DATE = '2026-10-11';
const page = (extra = {}) => renderBoard({ ...board, slice: 2, date: DATE, ...extra });
/** One altitude's section of the page. */
const view = (html, name) => {
  const m = new RegExp(`<section class="view view-${name}"[\\s\\S]*?</section>`).exec(html);
  assert.ok(m, `the page holds a ${name} view`);
  return m[0];
};
const PRS = [
  {
    number: 71,
    title: 'Add the <b>board</b> & more',
    url: 'https://github.com/rogerbucks/graph-note/pull/71',
    headRefName: 'slice-board',
    mergeable: 'MERGEABLE',
    statusCheckRollup: [
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
    ],
  },
  {
    number: 72,
    title: 'A page of no link',
    url: 'javascript:alert(1)',
    headRefName: 'other',
    mergeable: 'CONFLICTING',
    statusCheckRollup: [],
  },
];

describe('the status of a requirement', () => {
  test('proved when it names a test and every one is written', () => {
    assert.equal(statusOf([{ status: 'written' }]), 'proved');
    assert.equal(statusOf([{ status: 'written' }, { status: 'written' }]), 'proved');
  });

  test('part when some of its tests are written and some are not', () => {
    assert.equal(statusOf([{ status: 'written' }, { status: 'planned' }]), 'part');
  });

  test('open when none is written, and when it names no test at all', () => {
    assert.equal(statusOf([{ status: 'planned' }]), 'open');
    assert.equal(statusOf([]), 'open');
  });
});

describe('reading the requirements', () => {
  test('gives each requirement its id, section, slice, level, rule, tests and status', () => {
    const part = board.requirements.find((r) => r.id === 'view_part');
    assert.equal(part.section, '3');
    assert.equal(part.slice, 2);
    assert.equal(part.level, 'must');
    assert.equal(part.rule, 'Part rule.');
    assert.equal(part.status, 'part');
    assert.deepEqual(
      part.tests.map((t) => [t.id, t.status]),
      [
        ['test_done', 'written'],
        ['test_later', 'planned'],
      ],
    );
  });

  test('gives each test what it proves, the repository paths of its file and where it is kept', () => {
    const [t] = board.requirements.find((r) => r.id === 'view_proved').tests;
    assert.equal(t.proves, 'a written proof <i>one</i>');
    assert.deepEqual(t.files, ['test/one.test.js', 'test/two.test.js']);
    assert.equal(t.where, 'repo');
  });

  test('a requirement that names no test has none, and is open', () => {
    const bare = board.requirements.find((r) => r.id === 'view_bare');
    assert.deepEqual(bare.tests, []);
    assert.equal(bare.status, 'open');
  });

  test('the sections are read with their number and title', () => {
    assert.deepEqual(
      board.sections.map((s) => [s.num, s.title]),
      [
        ['10', 'Hosts'],
        ['3', 'Viewing <the default>'],
        ['4', 'Edit pane'],
      ],
    );
  });

  test('a copy with no open question gives an empty list of questions', () => {
    assert.deepEqual(board.questions, []);
  });

  test('gives each open question its id, number, slice, text and the requirements it blocks', () => {
    const asked = readBoard(
      `${FIXTURE.trimEnd()},
(q_01_ai_interface:Question {num: 'Q-01', slice: 2, text: 'Which interface do external AI tools use?'}),
(q_02_free:Question {num: 'Q-02', slice: 3, text: 'A question blocking nothing.'}),
(q_01_ai_interface)-[:BLOCKS]->(view_part),
(q_01_ai_interface)-[:BLOCKS]->(view_open)
`,
    );
    assert.deepEqual(asked.questions, [
      {
        id: 'q_01_ai_interface',
        num: 'Q-01',
        slice: 2,
        text: 'Which interface do external AI tools use?',
        blocks: ['view_part', 'view_open'],
      },
      { id: 'q_02_free', num: 'Q-02', slice: 3, text: 'A question blocking nothing.', blocks: [] },
    ]);
    assert.equal(asked.requirements.length, board.requirements.length, 'a question is not a requirement');
    assert.equal(renderBoard({ ...asked, slice: 2, date: DATE }), page(), 'the board ignores the questions');
  });

  test('a text the reader cannot read is refused, never drawn as empty', () => {
    assert.throws(() => readBoard('(broken:Requirement {section'), /./);
  });
});

describe('the counts', () => {
  test('per slice: only that slice’s requirements, split proved, part and open', () => {
    assert.deepEqual(summarise(board.requirements, 2), { proved: 2, part: 1, open: 2, total: 5 });
    assert.deepEqual(summarise(board.requirements, 1), { proved: 1, part: 0, open: 0, total: 1 });
    assert.deepEqual(summarise(board.requirements, 9), { proved: 0, part: 0, open: 0, total: 0 });
  });

  test('per section: in section order by number, leaving out a section with nothing in the slice', () => {
    assert.deepEqual(summariseBySection(board.requirements, board.sections, 2), [
      { num: '3', title: 'Viewing <the default>', proved: 1, part: 1, open: 2, total: 4 },
      { num: '10', title: 'Hosts', proved: 1, part: 0, open: 0, total: 1 },
    ]);
  });

  test('a CI rollup is counted as passed, failed and running, from check runs and from statuses', () => {
    assert.deepEqual(summariseChecks(PRS[0].statusCheckRollup), { passed: 2, failed: 1, running: 1 });
    assert.deepEqual(
      summariseChecks([
        { __typename: 'StatusContext', state: 'SUCCESS' },
        { __typename: 'StatusContext', state: 'PENDING' },
        { __typename: 'StatusContext', state: 'ERROR' },
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' },
        { __typename: 'CheckRun', status: 'QUEUED', conclusion: '' },
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'CANCELLED' },
      ]),
      { passed: 2, failed: 2, running: 2 },
    );
    assert.deepEqual(summariseChecks(undefined), { passed: 0, failed: 0, running: 0 });
  });

  test('an entry that is not an object is skipped, and one with neither status nor state is running', () => {
    assert.deepEqual(summariseChecks([null, 'x', 4, undefined]), { passed: 0, failed: 0, running: 0 });
    assert.deepEqual(summariseChecks([null, {}, { status: 'COMPLETED', conclusion: 'SUCCESS' }]), {
      passed: 1,
      failed: 0,
      running: 1,
    });
  });

  test('a rollup that is not a list is taken as empty', () => {
    for (const rollup of [null, 'SUCCESS', 7, { status: 'COMPLETED', conclusion: 'SUCCESS' }])
      assert.deepEqual(summariseChecks(rollup), { passed: 0, failed: 0, running: 0 });
  });
});

describe('the page', () => {
  test('opens on its title, then one style, then its do-not-hand-edit banner with the date', () => {
    const html = page();
    assert.ok(html.startsWith('<title>graph-note slice 2</title>\n<style>'), html.slice(0, 80));
    assert.equal(html.match(/<style>/g).length, 1);
    const content = html.slice(html.indexOf('</style>') + '</style>'.length).trimStart();
    assert.match(
      content,
      /^<[a-z]+ class="banner">Generated by scripts\/slice-board\.mjs from requirements\/editor-requirements\.gql — do not hand-edit; regenerate\. Generated 2026-10-11\./,
    );
  });

  test('has no script, no event handler, and nothing from outside: it opens offline', () => {
    for (const html of [page(), page({ prs: PRS }), page({ standalone: true })]) {
      assert.doesNotMatch(html, /<script/i);
      assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
      assert.doesNotMatch(html, /<(link|img|iframe|object|embed)\b/i);
      assert.doesNotMatch(html, /@import|url\(|@font-face/);
    }
    assert.doesNotMatch(page(), /https?:\/\//);
  });

  test('has no doctype, html, head or body tag, because the host adds the skeleton', () => {
    assert.doesNotMatch(page(), /<!doctype|<html|<head|<body|<meta/i);
  });

  test('with --standalone, is a whole document with charset and viewport, still holding the same page', () => {
    const html = page({ standalone: true });
    assert.match(html, /^<!doctype html>\n<html lang="en">/i);
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<head>[\s\S]*<title>graph-note slice 2<\/title>[\s\S]*<style>[\s\S]*<\/head>/);
    assert.match(html, /<body>\s*<[a-z]+ class="banner">Generated by/);
    assert.ok(html.trimEnd().endsWith('</html>'));
    assert.equal(html.match(/<title>/g).length, 1);
  });

  test('the title names the slice shown', () => {
    assert.match(page({ slice: 1 }), /^<title>graph-note slice 1<\/title>/);
  });

  test('escapes all text from the graph, in the rule, the section title and the tests', () => {
    const html = page();
    assert.doesNotMatch(html, /<b>markup<\/b>/);
    assert.doesNotMatch(html, /<i>one<\/i>/);
    assert.doesNotMatch(html, /<the default>/);
    assert.match(html, /Proved rule with &lt;b&gt;markup&lt;\/b&gt; &amp; &quot;quotes&quot;\./);
    assert.match(html, /Viewing &lt;the default&gt;/);
    assert.match(html, /a written proof &lt;i&gt;one&lt;\/i&gt;/);
  });

  test('offers three altitudes by radio inputs, Working selected, labelled Overview, Working and Full', () => {
    const html = page();
    const radios = [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    assert.equal(radios.length, 3);
    assert.deepEqual(
      radios.map((r) => /id="alt-(\w+)"/.exec(r)[1]),
      ['overview', 'working', 'full'],
    );
    assert.deepEqual(
      radios.filter((r) => /\bchecked\b/.test(r)).map((r) => /id="alt-(\w+)"/.exec(r)[1]),
      ['working'],
    );
    for (const [id, label] of [
      ['overview', 'Overview'],
      ['working', 'Working'],
      ['full', 'Full'],
    ])
      assert.match(html, new RegExp(`<label for="alt-${id}">${label}</label>`));
  });

  test('carries the board stylesheet, once, and in the same order as the module that holds it', () => {
    const styles = [...page().matchAll(/<style>\n([\s\S]*?)\n<\/style>/g)].map((m) => m[1]);
    assert.deepEqual(styles, [BOARD_CSS]);
  });

  test('Overview: the slice bar says how many of the total are proved, then a row for each section', () => {
    const overview = view(page(), 'overview');
    assert.match(overview, /2 of 5 proved/);
    assert.match(overview, /1 part/);
    assert.match(overview, /2 open/);
    const rows = [...overview.matchAll(/<li class="section-row"[\s\S]*?<\/li>/g)].map((m) => m[0]);
    assert.equal(rows.length, 2, 'the sections with requirements in the slice only');
    assert.match(rows[0], /§3/);
    assert.match(rows[0], /1 of 4 proved/);
    assert.match(rows[1], /§10/);
    assert.match(rows[1], /1 of 1 proved/);
    assert.match(overview, /<svg class="bar"[^>]*aria-label="[^"]*2 proved[^"]*1 part[^"]*2 open/);
  });

  test('Working: only what is not yet proved, grouped by section, with each test and its status', () => {
    const working = view(page(), 'working');
    assert.doesNotMatch(working, /view_proved|Proved rule/);
    assert.doesNotMatch(working, /host_one|A host rule/, 'a section whose requirements are all proved is not listed');
    assert.doesNotMatch(working, /view_old|view_later|Old slice rule|Later slice rule/);
    for (const id of ['view_part', 'view_open', 'view_bare']) assert.match(working, new RegExp(id));
    assert.match(working, /Part rule\./);
    assert.match(working, /class="level">must</);
    assert.match(working, /class="level">may</);
    assert.match(working, /a planned proof/);
    assert.match(working, /test\/four\.test\.js/);
    assert.match(working, /class="chip chip-planned">planned</);
    assert.match(working, /class="chip chip-written">written</);
    assert.match(working, /class="chip chip-part">part</);
    assert.match(working, /class="chip chip-open">open</);
    assert.match(working, /names no test/);
    assert.equal((working.match(/<h3\b/g) ?? []).length, 1, 'one section group: §3');
  });

  test('Working with nothing left says so', () => {
    const done = readBoard(FIXTURE);
    const working = view(renderBoard({ ...done, slice: 1, date: DATE }), 'working');
    assert.match(working, /every requirement of slice 1 is proved/i);
  });

  test('Full: every requirement of the slice with its status chip and tests, and none of another slice', () => {
    const full = view(page(), 'full');
    for (const id of ['host_one', 'view_proved', 'view_part', 'view_open', 'view_bare'])
      assert.match(full, new RegExp(id));
    assert.doesNotMatch(full, /view_old|view_later/);
    assert.match(full, /class="chip chip-proved">proved</);
    assert.match(full, /test\/one\.test\.js/);
    assert.match(full, /test\/two\.test\.js/);
    assert.match(full, /outside the repo/);
  });

  test('a legend names proved, part and open, each as a labelled swatch', () => {
    const html = page();
    const legend = /<ul class="legend"[\s\S]*?<\/ul>/.exec(html)?.[0] ?? '';
    for (const word of ['proved', 'part', 'open']) assert.match(legend, new RegExp(`chip-${word}">${word}<`));
  });

  test('a bar is to scale: the proved, part and open segments start and run in proportion', () => {
    const bar = /<svg class="bar"[^>]*>([\s\S]*?)<\/svg>/.exec(view(page(), 'overview'))[1];
    const rects = [...bar.matchAll(/<rect class="seg-(\w+)" x="([\d.]+)" width="([\d.]+)"/g)].map((m) => m.slice(1));
    assert.deepEqual(rects, [
      ['proved', '0.000', '40.000'],
      ['part', '40.000', '20.000'],
      ['open', '60.000', '40.000'],
    ]);
  });

  test('escapes where a test is kept and the file text, never letting a tag through', () => {
    const text = FIXTURE.replace("where: 'outside the repo'", 'where: \'kept <u>away</u> & "far"\'').replace(
      'test/three.test.js',
      'test/<s>three</s>.test.js',
    );
    const html = renderBoard({ ...readBoard(text), slice: 2, date: DATE });
    assert.doesNotMatch(html, /<u>|<s>/);
    assert.match(html, /kept &lt;u&gt;away&lt;\/u&gt; &amp; &quot;far&quot;/);
  });

  test('the altitude switch is a named group, with its labels for the radios', () => {
    const html = page();
    assert.match(html, /<div class="switch" role="group" aria-label="Altitude">/);
    assert.match(html, /<label for="alt-working">Working<\/label>/);
  });

  test('a slice with no requirements says so on every altitude, and counts nothing as proved', () => {
    const html = page({ slice: 9 });
    for (const name of ['overview', 'working', 'full']) {
      const v = view(html, name);
      assert.match(v, /Slice 9 has no requirements/, name);
      assert.doesNotMatch(v, /is proved|0 of 0 proved/, name);
    }
  });
});

describe('the open pull requests panel', () => {
  test('is absent without --prs', () => {
    assert.doesNotMatch(page(), /class="prs"|Open pull requests/);
  });

  test('lists each with its number, title, branch, mergeable state and CI counts, linking to its url', () => {
    const html = page({ prs: PRS });
    const panel = /<section class="prs"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    assert.match(panel, /Open pull requests/);
    assert.match(panel, /<a href="https:\/\/github\.com\/rogerbucks\/graph-note\/pull\/71"[^>]*>#71/);
    assert.match(panel, /slice-board/);
    assert.match(panel, /mergeable/i);
    assert.match(panel, /2 passed/);
    assert.match(panel, /1 failed/);
    assert.match(panel, /1 running/);
    assert.match(panel, /conflicting/i);
  });

  test('escapes a title, and links only an http or https url', () => {
    const panel = /<section class="prs"[\s\S]*?<\/section>/.exec(page({ prs: PRS }))[0];
    assert.doesNotMatch(panel, /<b>board<\/b>/);
    assert.match(panel, /Add the &lt;b&gt;board&lt;\/b&gt; &amp; more/);
    assert.doesNotMatch(panel, /javascript:/);
    assert.match(panel, /#72/);
  });

  test('a pull request with no checks says "no checks yet", not three zero counts', () => {
    const panel = /<section class="prs"[\s\S]*?<\/section>/.exec(page({ prs: PRS }))[0];
    const second = panel.slice(panel.indexOf('#72'));
    assert.match(second, /no checks yet/);
    assert.doesNotMatch(second, /0 passed|0 failed|0 running/);
    assert.doesNotMatch(panel.slice(0, panel.indexOf('#72')), /no checks yet/);
    const bare = /<section class="prs"[\s\S]*?<\/section>/.exec(page({ prs: [{ number: 9, title: 't' }] }))[0];
    assert.match(bare, /no checks yet/);
  });

  test('escapes an https url holding a quote or a tag, the branch name, and never breaks out of the attribute', () => {
    const hostile = [
      {
        number: 5,
        title: 'plain',
        url: 'https://example.test/a"onmouseover="x<b>',
        headRefName: 'feat/<i>"x"</i>',
        mergeable: 'MERGEABLE',
        statusCheckRollup: [],
      },
    ];
    const panel = /<section class="prs"[\s\S]*?<\/section>/.exec(page({ prs: hostile }))[0];
    assert.match(panel, /<a href="https:\/\/example\.test\/a&quot;onmouseover=&quot;x&lt;b&gt;">/);
    assert.doesNotMatch(panel, /<i>|<b>|"onmouseover/);
    assert.match(panel, /feat\/&lt;i&gt;&quot;x&quot;&lt;\/i&gt;/);
  });

  test('an empty list says there are none open', () => {
    assert.match(page({ prs: [] }), /No pull requests are open/);
  });
});

describe('run on its own', () => {
  const folder = mkdtempSync(join(tmpdir(), 'slice-board-'));
  after(() => rmSync(folder, { recursive: true, force: true }));
  const run = (...args) =>
    spawnSync(process.execPath, [path('scripts/slice-board.mjs'), ...args], { encoding: 'utf8' });

  test('prints the board of the slice under way from the real file, to stdout', () => {
    const r = run('--date', DATE);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.startsWith(`<title>graph-note slice ${CURRENT_SLICE}</title>`));
    assert.match(r.stdout, /\d+ of \d+ proved/);
    assert.match(r.stdout, /Generated 2026-10-11/);
  });

  test('--slice picks another slice, and --standalone wraps the page in a document', () => {
    const r = run('--slice', '1', '--standalone', '--date', DATE);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^<!doctype html>/);
    assert.match(r.stdout, /<title>graph-note slice 1<\/title>/);
  });

  test('--prs reads the JSON gh prints, and a file that is not that is refused with a message', () => {
    const good = join(folder, 'prs.json');
    writeFileSync(good, JSON.stringify(PRS));
    const r = run('--prs', good, '--date', DATE);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /#71/);
    const bad = join(folder, 'bad.json');
    writeFileSync(bad, '{"not": "a list"}');
    const refused = run('--prs', bad);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /pull requests/);
  });

  test('a slice that is not a number is refused', () => {
    const r = run('--slice', 'two');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /slice/);
  });
});
