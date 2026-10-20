// The wiki's Plan versus actual page (spec §41, plan_vs_actual, plan_rebaselined). Each requirement's proved day is
// read from the history of the requirements file on main, and each wave's plan is set beside what happened. Small
// made-up histories and waves, plus one real git history in a temporary folder, so the page's sums are checked by hand.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  daysBetween,
  planActuals,
  planActualsPage,
  readHistory,
  requirementDays,
  testDays,
} from '../scripts/plan-actuals.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { renderWiki } from '../scripts/wiki.mjs';
import { read } from './repository/repo.js';

const testLine = (id, status) => `(${id}:Test {proves: 'it holds', file: 'test/${id}.test.js', status: '${status}'}),`;
const copy = (statuses) =>
  Object.entries(statuses)
    .map(([id, s]) => testLine(id, s))
    .join('\n');
const req = (id, ...tests) => ({
  id,
  tests: tests.map(([tid, status]) => ({ id: tid, status })),
  status: tests.length && tests.every(([, s]) => s === 'written') ? 'proved' : 'open',
});

describe('the day each requirement became proved', () => {
  test('a test is written from the first revision that says so, and stays written', () => {
    const days = testDays([
      { day: '2026-10-01', text: copy({ test_a: 'planned', test_b: 'planned' }) },
      { day: '2026-10-03', text: copy({ test_a: 'written', test_b: 'partial' }) },
      { day: '2026-10-05', text: copy({ test_a: 'written', test_b: 'written' }) },
    ]);
    assert.deepEqual(Object.fromEntries(days), { test_a: '2026-10-03', test_b: '2026-10-05' });
  });

  test('a requirement is proved on the day its last test became written, and has no day while one is not', () => {
    const days = new Map([
      ['test_a', '2026-10-03'],
      ['test_b', '2026-10-05'],
    ]);
    const got = requirementDays(
      [
        req('both', ['test_a', 'written'], ['test_b', 'written']),
        req('one', ['test_a', 'written']),
        req('waiting', ['test_a', 'written'], ['test_c', 'planned']),
        req('untested'),
      ],
      days,
    );
    assert.deepEqual(Object.fromEntries(got), { both: '2026-10-05', one: '2026-10-03' });
  });

  test('reads main’s own history, merge by merge, through the move from .gql to .md', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'plan-actuals-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const git = (args, date) => {
      const env = { ...process.env, GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` };
      const run = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], {
        cwd: dir,
        env,
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stderr);
    };
    const write = (rel, text, date, message) => {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
      git(['add', '-A'], date);
      git(['commit', '-q', '-m', message], date);
    };
    git(['init', '-q', '-b', 'main'], '2026-10-01');
    write('placeholder', 'x', '2026-10-01', 'start');
    git(['rm', '-q', 'placeholder'], '2026-10-01');
    write('requirements/editor-requirements.gql', copy({ test_a: 'planned' }), '2026-10-01', 'plan');
    git(['checkout', '-q', '-b', 'side'], '2026-10-02');
    // written on a branch on the 2nd, but main only holds it from the merge on the 4th
    write('requirements/editor-requirements.gql', copy({ test_a: 'written' }), '2026-10-02', 'prove a');
    git(['checkout', '-q', 'main'], '2026-10-04');
    git(['merge', '-q', '--no-ff', '-m', 'merge side', 'side'], '2026-10-04');
    git(['rm', '-q', 'requirements/editor-requirements.gql'], '2026-10-06');
    const md = '# Requirements\n\n```gql\n' + copy({ test_a: 'written', test_b: 'written' }) + '\n```\n';
    write('requirements/editor-requirements.md', md, '2026-10-06', 'move to a graph note');

    const history = readHistory(dir);
    assert.deepEqual(
      history.map((r) => r.day),
      ['2026-10-01', '2026-10-04', '2026-10-06'],
    );
    assert.deepEqual(Object.fromEntries(testDays(history)), { test_a: '2026-10-04', test_b: '2026-10-06' });
  });
});

const WAVES = [
  { title: 'Wave 1', start: '2026-10-01', end: '2026-10-05', workstreams: ['A'] },
  {
    title: 'Wave 2',
    start: '2026-10-06',
    end: '2026-10-10',
    workstreams: ['B'],
    earlier_plan: { start: '2026-10-06', end: '2026-10-08', replaced: '2026-10-05', why: 'the measured rate' },
  },
  { title: 'Wave 3', start: '2026-10-11', end: '2026-10-20', workstreams: ['C'] },
  { title: 'Wave 4', start: '2026-10-21', end: '2026-10-30', workstreams: [] },
];
const WORKSTREAMS = {
  A: { size: 'S', requirements: ['a1', 'a2'] },
  B: { size: 'M', requirements: ['b1', 'b2'] },
  C: { requirements: ['c1'] },
};
const CAPACITY = { weeks: [{ week_ending: '2026-10-11', usage_percent: 60, note: 'a short week' }] };
const BOARD = [
  req('a1', ['t1', 'written']),
  req('a2', ['t2', 'written']),
  req('b1', ['t3', 'written']),
  req('b2', ['t4', 'planned']),
  req('c1', ['t5', 'planned']),
];
const DAYS = new Map([
  ['a1', '2026-10-02'],
  ['a2', '2026-10-07'],
  ['b1', '2026-10-09'],
]);
const RELEASES = [
  { tagName: 'v0.3.0', publishedAt: '2026-10-08T10:00:00Z' },
  { tagName: 'v0.3.1-nightly.1', publishedAt: '2026-10-07T23:00:00Z' },
  { tagName: 'v0.2.0', publishedAt: '2026-10-03T10:00:00Z' },
];
const facts = (over = {}) =>
  planActuals({
    waves: WAVES,
    workstreams: WORKSTREAMS,
    requirements: BOARD,
    days: DAYS,
    releases: RELEASES,
    today: '2026-10-12',
    ...over,
  });

describe('each wave’s plan beside what happened', () => {
  test('counts the days from one date to another', () => {
    assert.equal(daysBetween('2026-10-05', '2026-10-07'), 2);
    assert.equal(daysBetween('2026-10-07', '2026-10-05'), -2);
  });

  test('a finished wave has its first and last proved days, the first stable release after, and its slip', () => {
    const [one] = facts().waves;
    assert.deepEqual(
      { ...one },
      {
        title: 'Wave 1',
        start: '2026-10-01',
        end: '2026-10-05',
        firstEnd: '2026-10-05',
        sizes: ['S'],
        proved: 2,
        total: 2,
        first: '2026-10-02',
        last: '2026-10-07',
        release: 'v0.3.0',
        releaseDay: '2026-10-08',
        slip: 2,
        firstSlip: 2,
        done: true,
      },
    );
  });

  test('a wave planned again keeps its first planned end and the slip from it, beside the current plan', () => {
    const [one, two] = facts().waves;
    assert.equal(one.firstEnd, one.end, 'never planned again: the first plan is the plan');
    assert.equal(two.firstEnd, '2026-10-08');
    assert.equal(two.slip, 2, 'two days past the current end, today being the 12th');
    assert.equal(two.firstSlip, 4, 'four days past the first planned end');
  });

  test('the capacity file’s weeks are set beside what each week proved, or left out without the file', () => {
    assert.equal(facts().capacity, null);
    assert.deepEqual(facts({ capacity: CAPACITY }).capacity, [
      { weekEnding: '2026-10-11', usage: 60, proved: 2, note: 'a short week' },
    ]);
    const blank = { weeks: [{ week_ending: '2026-10-04' }] };
    assert.deepEqual(facts({ capacity: blank }).capacity, [
      { weekEnding: '2026-10-04', usage: null, proved: 1, note: '' },
    ]);
  });

  test('an unfinished wave has no last day or release, and a wave past its end counts its slip so far', () => {
    const [, two, three, four] = facts().waves;
    assert.equal(two.done, false);
    assert.equal(two.first, '2026-10-09');
    assert.equal(two.last, null);
    assert.equal(two.release, null);
    assert.equal(two.slip, 2, 'two days past its planned end, today being the 12th');
    assert.equal(three.slip, null, 'not yet at its planned end');
    assert.equal(three.first, null);
    assert.equal(four.total, 0);
  });

  test('without the releases, the release column is left empty, and a draft with no publish day is no release', () => {
    assert.equal(facts({ releases: [] }).waves[0].release, null);
    const draft = { tagName: 'v0.2.9', publishedAt: null };
    assert.equal(facts({ releases: [draft, ...RELEASES] }).waves[0].release, 'v0.3.0');
  });
});

describe('the rate and the forecast', () => {
  test('lists the requirements proved each day, with the running total', () => {
    assert.deepEqual(facts().perDay, [
      { day: '2026-10-02', proved: 1, total: 1 },
      { day: '2026-10-07', proved: 1, total: 2 },
      { day: '2026-10-09', proved: 1, total: 3 },
    ]);
  });

  test('the rate is the requirements proved in the seven days up to today, a day', () => {
    assert.equal(facts().rate, 2 / 7, 'the 7th and the 9th fall in the 6th to the 12th; the 2nd does not');
  });

  test('forecasts each remaining wave in order at that rate, each after the work of the waves before it', () => {
    const { forecasts } = facts();
    assert.deepEqual(
      forecasts.map((f) => [f.title, f.remaining, f.day]),
      [
        ['Wave 2', 1, '2026-10-16'],
        ['Wave 3', 1, '2026-10-19'],
      ],
    );
  });

  test('with nothing proved in the last seven days there is no forecast day', () => {
    const { rate, forecasts } = facts({ today: '2026-11-30' });
    assert.equal(rate, 0);
    assert.ok(forecasts.every((f) => f.day === null));
  });
});

describe('the page', () => {
  const helpers = {
    day: (iso) => iso,
    footer: (sources) => `\n---\n_Made from ${sources}._\n`,
  };
  const page = (over = {}) => planActualsPage({ ...facts(over), today: '2026-10-12' }, helpers);

  test('shows each wave’s plan, proved days, release and slip in one table', () => {
    const text = page();
    assert.match(text, /^# Plan versus actual/m);
    assert.match(
      text,
      /\| Wave 1 \| 2026-10-01 to 2026-10-05 \| 2 \/ 2 \| 2026-10-02 \| 2026-10-07 \| v0\.3\.0 \(2026-10-08\) \| 2 days late \|/,
    );
    assert.match(
      text,
      /\| Wave 2 \| 2026-10-06 to 2026-10-10 \(first plan to 2026-10-08\) \| 1 \/ 2 \| 2026-10-09 \| — \| — \| 2 days late so far; 4 days late so far from the first plan \|/,
    );
    assert.match(text, /\| Wave 3 \| .* \| 0 \/ 1 \| — \| — \| — \| — \|/);
  });

  test('lists the days, the rate and each forecast, and says where it came from', () => {
    const text = page();
    assert.match(text, /\| 2026-10-09 \| 1 \| 3 \|/);
    assert.match(text, /0\.29 a day/);
    assert.match(text, /\| Wave 2 \| 1 \| 2026-10-16 \| 1 M \|/, 'each forecast counts the sizes of its workstreams');
    assert.match(text, /\| Wave 3 \| 1 \| 2026-10-19 \| — \|/, 'a workstream without a size shows none');
    assert.match(text, /_Made from .*requirements.*waves\.json/);
    assert.doesNotMatch(text, /## Capacity|capacity\.json/);
  });

  test('shows the capacity weeks when the file is there, and names it as a source', () => {
    const text = page({ capacity: CAPACITY });
    assert.match(text, /## Capacity each week/);
    assert.match(text, /\| 2026-10-11 \| 60% \| 2 \| a short week \|/);
    assert.match(text, /_Made from .*waves\.json.*capacity\.json/);
  });

  test('says the day the history starts, as work proved before it counts from then', () => {
    assert.match(page({ since: '2026-10-01' }), /history on main starts on 2026-10-01/);
    assert.doesNotMatch(page(), /history on main starts/);
  });

  test('says so when there is no rate to forecast from', () => {
    assert.match(page({ today: '2026-11-30' }), /No forecast: nothing was proved in the last seven days/);
  });
});

describe('the page in the wiki', () => {
  const wiki = (over) =>
    renderWiki({
      requirementsText: read(REQUIREMENTS),
      waves: WAVES,
      workstreams: WORKSTREAMS,
      baseline: JSON.parse(read('quality/baseline.json')),
      versions: JSON.parse(read('versions.json')),
      releases: [],
      options: [],
      pages: {},
      sha: '0123456789abcdef',
      today: '2026-10-12',
      ...over,
    });

  test('is made with the other pages, named in the sidebar, saying where it came from and at which commit', () => {
    const pages = wiki({ planActual: facts() });
    assert.match(pages['Plan-vs-actual.md'], /^# Plan versus actual/);
    assert.match(
      pages['Plan-vs-actual.md'],
      /_Made from the history of the requirements file on main .* at \[`0123456`\]/,
    );
    assert.match(pages['_Sidebar.md'], /\[Plan versus actual\]\(Plan-vs-actual\)/);
  });

  test('is left out when no history was read', () => {
    const pages = wiki({});
    assert.equal(pages['Plan-vs-actual.md'], undefined);
    assert.doesNotMatch(pages['_Sidebar.md'], /Plan-vs-actual/);
  });
});
