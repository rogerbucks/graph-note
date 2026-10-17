// The project wiki (spec §41, wiki_generated): every page made from the repository's own files, each saying where it
// came from, with the figures the requirements and the waves give. Pure: the real files are read, nothing is fetched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { bar, fillMarkers, readQuestions, renderWiki, waveStates } from '../scripts/wiki.mjs';
import { read } from './repository/repo.js';

const requirementsText = read('requirements/editor-requirements.gql');
const json = (rel) => JSON.parse(read(rel));
const PAGES = {
  'Home.md': '# Home\n\n<!-- wiki:now -->\n',
  'Guide.md': '<!-- wiki:shot card -->\n<!-- wiki:settings -->\n',
};
const OPTIONS = [{ key: 'indent', section: 'Formatting', name: 'Indent', sentence: 'How lines are indented.' }];
const made = (over = {}) =>
  renderWiki({
    requirementsText,
    waves: json('requirements/waves.json').waves,
    workstreams: json('requirements/workstreams.json'),
    baseline: json('quality/baseline.json'),
    versions: json('versions.json'),
    releases: [],
    options: OPTIONS,
    pages: PAGES,
    sha: '0123456789abcdef',
    today: '2026-10-17',
    ...over,
  });
const GENERATED = ['Roadmap.md', 'Status.md', 'Decisions.md', 'Open-questions.md', 'Quality.md', 'Releases.md'];

describe('the wiki', () => {
  test('makes every page, the hand-written ones filled, and a sidebar naming each', () => {
    const pages = made();
    assert.deepEqual(Object.keys(pages).sort(), [...Object.keys(PAGES), ...GENERATED, '_Sidebar.md'].sort());
    assert.doesNotMatch(pages['Home.md'], /<!-- wiki:/);
    assert.match(pages['Guide.md'], /!\[[^\]]+\]\(images\/card\.png\)/);
    assert.match(pages['Guide.md'], /\| \*\*Indent\*\* \| How lines are indented\. \|/);
    for (const name of [...GENERATED, 'How-to-use-Graph-Note'])
      assert.match(pages['_Sidebar.md'], new RegExp(`\\(${name.replace('.md', '')}\\)`));
  });

  test('ends each generated page saying where it came from, at which commit, and not to edit it there', () => {
    const pages = made();
    for (const name of GENERATED) {
      assert.match(
        pages[name],
        /_Made from .+ at \[`0123456`\]\(https:\/\/github\.com\/rogerbucks\/graph-note\/commit\/0123456789abcdef\)/,
      );
      assert.match(pages[name], /change the repository, not this page/);
    }
  });

  test('counts the proved requirements as the slice board does', () => {
    const { requirements } = readBoard(requirementsText);
    const proved = requirements.filter((r) => r.status === 'proved').length;
    assert.ok(made()['Status.md'].includes(`**Requirements proved:** ${proved} of ${requirements.length}`));
  });

  test('lists every answered question as a decision, and every other as open', () => {
    const pages = made();
    const questions = readQuestions(requirementsText);
    assert.ok(questions.length > 0);
    for (const q of questions) {
      assert.equal(pages['Decisions.md'].includes(`| ${q.num} |`), Boolean(q.answer), q.num);
      assert.equal(pages['Open-questions.md'].includes(`**${q.num}**`), !q.answer, q.num);
    }
  });

  test('draws the roadmap as a chart whose task names hold no character the chart reads as syntax', () => {
    const chart = made()['Roadmap.md'].match(/```mermaid\n([\s\S]*?)```/)[1];
    for (const line of chart.split('\n').filter((l) => /\d{4}-\d{2}-\d{2}, \d{4}/.test(l)))
      assert.doesNotMatch(line.slice(0, line.lastIndexOf(' :')), /[:#;,]/, line);
  });

  test('lists the releases GitHub gives, or the versions file without them', () => {
    assert.match(
      made()['Releases.md'],
      /\| \[0\.5\.0\]\(https:\/\/github\.com\/rogerbucks\/graph-note\/releases\/tag\/0\.5\.0\)/,
    );
    const releases = [{ tagName: '9.9.9', name: 'Big', publishedAt: '2026-10-01T10:00:00Z', url: 'https://x/9.9.9' }];
    assert.match(made({ releases })['Releases.md'], /\| \[9\.9\.9\]\(https:\/\/x\/9\.9\.9\) \| Big \| 1 Oct 2026 \|/);
  });
});

describe('the waves', () => {
  const workstreams = { A: { requirements: ['a'] }, B: { requirements: ['b'] } };
  const requirements = [
    { id: 'a', status: 'proved' },
    { id: 'b', status: 'open' },
  ];
  const wave = (start, end, ws) => ({ title: start, start, end, workstreams: ws });
  test('are done when all is proved, now while today is in them, behind after their end, and later before', () => {
    const states = waveStates(
      [
        wave('2026-01-01', '2026-01-10', ['A']),
        wave('2026-01-11', '2026-01-20', ['B']),
        wave('2026-01-01', '2026-01-05', ['B']),
        wave('2026-02-01', '2026-02-10', ['B']),
      ],
      workstreams,
      requirements,
      '2026-01-15',
    );
    assert.deepEqual(
      states.map((w) => [w.state, w.proved, w.total]),
      [
        ['done', 1, 1],
        ['now', 0, 1],
        ['late', 0, 1],
        ['later', 0, 1],
      ],
    );
  });
});

describe('the markers and bars', () => {
  test('refuse a marker nothing fills and a picture that is not taken', () => {
    assert.throws(() => fillMarkers('<!-- wiki:nothing -->', {}), /nothing fills this marker/);
    assert.throws(() => fillMarkers('<!-- wiki:shot nowhere -->', {}), /no such screenshot/);
  });
  test('draw ten blocks and the percentage, and an empty bar for nothing', () => {
    assert.equal(bar(3, 4), '▓▓▓▓▓▓▓▓░░ 75%');
    assert.equal(bar(0, 0), '░░░░░░░░░░ 0%');
  });
});
