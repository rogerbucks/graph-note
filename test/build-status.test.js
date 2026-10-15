// The pure part of the build status of each requirement (editor spec §12, requirements_checked_in_ci): which board items
// a pull request moves, found from the tests it newly marks written; which stage an event puts them in; which value may
// replace which; and the words of the comment and the annotations. Hand-made small graphs stand in for the real file;
// nothing here touches the network.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { BUILD_STATUSES } from '../scripts/github-project-desired.mjs';
import {
  COMMENT_MARKER,
  DEFAULT_BRANCH,
  MAX_IDS,
  annotation,
  checksStage,
  commentBody,
  describeProblem,
  isSafeId,
  movedRequirements,
  nextStatus,
  redactSecrets,
  stageOf,
} from '../scripts/build-status.mjs';
import { FIXTURE } from './repository/github-project-fixture.js';

const base = readBoard(FIXTURE);
const PLANNED =
  "(test_later:Test {proves: 'a planned proof', file: 'test/later.test.js', where: 'repo', status: 'planned'})";
const WRITTEN = PLANNED.replace("'planned'", "'written'");
const written = (text) => readBoard(text);

describe('the requirements a pull request moves', () => {
  test('are those of the tests it newly marks written, found by comparing its file with main’s', () => {
    assert.ok(FIXTURE.includes(PLANNED));
    const head = written(FIXTURE.replace(PLANNED, WRITTEN));
    assert.deepEqual(movedRequirements(base, head), ['focus_link', 'focus_neighbours']);
  });

  test('are none when the pull request marks nothing newly written, even where tests are already written', () => {
    assert.deepEqual(movedRequirements(base, base), []);
  });

  test('leave out a requirement whose tests were written before, and one whose test is still planned', () => {
    const head = written(FIXTURE.replace(PLANNED, WRITTEN));
    const moved = movedRequirements(base, head);
    assert.ok(!moved.includes('zoom_out_to_fit'));
    assert.ok(!moved.includes('old_thing'));
  });

  test('count a new test of a requirement already proved, and a test that is shared, once for each requirement', () => {
    const extra =
      "(test_extra:Test {proves: 'one more', file: 'test/extra.test.js', where: 'repo', status: 'written'}),";
    const link = '(zoom_out_to_fit)-[:PROVED_BY]->(test_extra),\n(done_means_proved)-[:PROVED_BY]->(test_extra),';
    const text = FIXTURE.replace('// ── Links ──', `${extra}\n// ── Links ──\n${link}`);
    assert.deepEqual(movedRequirements(base, written(text)), ['done_means_proved', 'zoom_out_to_fit']);
  });

  test('are all the written tests’ when main has no file to compare with', () => {
    const none = { sections: [], requirements: [], questions: [] };
    assert.deepEqual(movedRequirements(none, base), ['focus_neighbours', 'old_thing', 'zoom_out_to_fit']);
  });

  test('leave out an id that is not plain letters, digits, underscores, dots and hyphens', () => {
    const odd = { requirements: [{ id: 'a](http://x)', tests: [{ id: 't', status: 'written' }] }] };
    const fine = { requirements: [{ id: 'fine-1.x_y', tests: [{ id: 't', status: 'written' }] }] };
    assert.deepEqual(movedRequirements({ requirements: [] }, odd), []);
    assert.deepEqual(movedRequirements({ requirements: [] }, fine), ['fine-1.x_y']);
    assert.equal(isSafeId('x'.repeat(101)), false);
    assert.equal(isSafeId(''), false);
    assert.equal(isSafeId(42), false);
  });
});

describe('the limits', () => {
  test('are 200 requirements for a pull request, and main as the branch a merge must be into', () => {
    assert.equal(MAX_IDS, 200);
    assert.equal(DEFAULT_BRANCH, 'main');
  });
});

describe('the stage of a pull request', () => {
  const run = (status, conclusion) => ({ status, conclusion });
  const passed = run('COMPLETED', 'SUCCESS');
  const failed = run('COMPLETED', 'FAILURE');
  const running = run('IN_PROGRESS', '');

  test('is Checks passing when every check has finished well, skipped and neutral ones counting as well', () => {
    assert.equal(
      checksStage([passed, passed, run('COMPLETED', 'SKIPPED'), run('COMPLETED', 'NEUTRAL')]),
      'Checks passing',
    );
  });

  test('is Checks failing as soon as one check fails, whatever else is still running', () => {
    assert.equal(checksStage([passed, failed, running]), 'Checks failing');
    assert.equal(checksStage([run('COMPLETED', 'CANCELLED')]), 'Checks failing');
  });

  test('is In PR while a check runs, and while none has reported yet', () => {
    assert.equal(checksStage([passed, running]), 'In PR');
    assert.equal(checksStage([]), 'In PR');
    assert.equal(checksStage(undefined), 'In PR');
  });

  test('reads a commit status by its state as well as a check by its conclusion', () => {
    assert.equal(checksStage([{ state: 'SUCCESS' }, passed]), 'Checks passing');
    assert.equal(checksStage([{ state: 'PENDING' }, passed]), 'In PR');
    assert.equal(checksStage([{ state: 'ERROR' }]), 'Checks failing');
  });

  test('is Merged for a merged pull request, whatever its checks say', () => {
    assert.equal(stageOf({ state: 'closed', merged: true }, [failed]), 'Merged');
  });

  test('is Not started for a pull request closed without merging, and the checks for one still open', () => {
    assert.equal(stageOf({ state: 'closed', merged: false }, [passed]), 'Not started');
    assert.equal(stageOf({ state: 'open', merged: false }, [passed]), 'Checks passing');
    assert.equal(stageOf({ state: 'open', merged: false }, [failed]), 'Checks failing');
  });

  test('only ever names a stage the project field offers', () => {
    for (const rollup of [[], [passed], [failed], [running]])
      for (const pr of [{ state: 'open' }, { state: 'closed' }, { state: 'closed', merged: true }])
        assert.ok(BUILD_STATUSES.includes(stageOf(pr, rollup)));
  });
});

describe('which value may replace which', () => {
  test('moves forward through the stages of a pull request, and between failing and passing either way', () => {
    assert.equal(nextStatus('Not started', 'In PR'), 'In PR');
    assert.equal(nextStatus('In PR', 'Checks failing'), 'Checks failing');
    assert.equal(nextStatus('Checks failing', 'Checks passing'), 'Checks passing');
    assert.equal(nextStatus('Checks passing', 'Checks failing'), 'Checks failing');
    assert.equal(nextStatus('Checks failing', 'In PR'), 'In PR');
  });

  test('treats an item with no value as Not started', () => {
    assert.equal(nextStatus(null, 'In PR'), 'In PR');
    assert.equal(nextStatus(undefined, 'Merged'), 'Merged');
    assert.equal(nextStatus(null, 'Not started'), null);
  });

  test('changes nothing when the value is already the one wanted', () => {
    for (const s of BUILD_STATUSES) assert.equal(nextStatus(s, s), null);
  });

  test('goes from a pull request’s stage to Merged, and from Merged to Released, and from anything to Released', () => {
    assert.equal(nextStatus('Checks passing', 'Merged'), 'Merged');
    assert.equal(nextStatus('Merged', 'Released'), 'Released');
    assert.equal(nextStatus('Not started', 'Released'), 'Released');
  });

  test('never moves back from Merged or Released because of a later event of a pull request', () => {
    for (const from of ['Merged', 'Released'])
      for (const to of ['Not started', 'In PR', 'Checks failing', 'Checks passing'])
        assert.equal(nextStatus(from, to), null, `${from} to ${to}`);
    assert.equal(nextStatus('Released', 'Merged'), null);
  });

  test('puts a pull request’s item back to Not started only when the pull request was its stage', () => {
    for (const from of ['In PR', 'Checks failing', 'Checks passing'])
      assert.equal(nextStatus(from, 'Not started'), 'Not started');
    assert.equal(nextStatus('Merged', 'Not started'), null);
  });

  test('refuses a value that is not a stage', () => {
    assert.throws(() => nextStatus('In PR', 'Done'), /Done/);
    assert.throws(() => nextStatus('Whatever', 'Merged'), /Whatever/);
  });
});

describe('an annotation', () => {
  test('is a workflow command with its text on one line, % and line ends encoded', () => {
    assert.equal(annotation('warning', 'one\ntwo\r100%'), '::warning::one%0Atwo%0D100%25');
  });

  test('is a warning, a notice or an error, and nothing else', () => {
    assert.equal(annotation('notice', 'x'), '::notice::x');
    assert.throws(() => annotation('set-output', 'x'), /set-output/);
  });
});

describe('the problem with the project token', () => {
  const rejected = Object.assign(new Error('gh api user failed: gh: Bad credentials (HTTP 401)'), {
    stderr: 'gh: Bad credentials (HTTP 401)',
  });

  test('is “not set” when there is no token or only blanks', () => {
    for (const token of [undefined, null, '', '   ']) {
      const p = describeProblem(null, token);
      assert.equal(p.kind, 'missing');
      assert.match(p.text, /PROJECT_TOKEN is not set/);
      assert.match(p.text, /board was not updated/);
    }
  });

  test('is “rejected” when GitHub answers 401 or Bad credentials, as an expired token is', () => {
    const p = describeProblem(rejected, 'ghp_abc');
    assert.equal(p.kind, 'rejected');
    assert.match(p.text, /PROJECT_TOKEN was rejected/);
    assert.match(p.text, /expired/);
    assert.equal(describeProblem(new Error('HTTP 401: Unauthorized'), 'x').kind, 'rejected');
  });

  test('is “failed”, with GitHub’s own words, for any other trouble reading or writing the board', () => {
    const p = describeProblem(new Error('GitHub refused: Resource not accessible by personal access token'), 'x');
    assert.equal(p.kind, 'failed');
    assert.match(p.text, /Resource not accessible/);
  });

  test('never repeats a token, in any shape, and is cut short', () => {
    const token = `ghp_FakeTokenForTest1234`;
    const p = describeProblem(new Error(`boom ${token} github_pat_11AAAA_bbbbbbbbbb ${'z'.repeat(500)}`), token);
    assert.doesNotMatch(p.text, /ghp_Fake|github_pat_11|bbbbbbbbbb/);
    assert.ok(p.text.length < 400);
    assert.equal(redactSecrets(`a ${token} b`, [token]), 'a *** b');
    assert.equal(redactSecrets('gho_abcdefghijkl and ghs_abcdefghijkl'), '*** and ***');
  });
});

describe('the comment', () => {
  const links = {
    repo: 'rogerbucks/graph-note',
    runUrl: 'https://github.com/rogerbucks/graph-note/actions/runs/77',
    boardUrl: 'https://github.com/users/rogerbucks/projects/2',
  };
  const items = [
    { id: 'focus_link', number: 12, status: 'Checks passing' },
    { id: 'focus_neighbours', number: null, status: null },
  ];

  test('opens with the hidden marker that finds it again, then the stage', () => {
    const text = commentBody({ ...links, stage: 'Checks passing', items, problems: [] });
    assert.ok(text.startsWith(`${COMMENT_MARKER}\n`));
    assert.equal(COMMENT_MARKER, '<!-- build-status -->');
    assert.match(text, /\*\*Build status: Checks passing\*\*/);
  });

  test('lists each item with its issue linked, and says of one with no issue that it is not on the board', () => {
    const text = commentBody({ ...links, stage: 'In PR', items, problems: [] });
    assert.match(
      text,
      /- `focus_link` \(\[#12\]\(https:\/\/github\.com\/rogerbucks\/graph-note\/issues\/12\)\): Checks passing/,
    );
    assert.match(text, /- `focus_neighbours` \(not on the board yet\)/);
  });

  test('lists an id alone, saying nothing of the board, when the board could not be read', () => {
    const text = commentBody({
      ...links,
      stage: 'In PR',
      items: [{ id: 'a', number: null, status: null, unknown: true }],
      problems: [],
    });
    assert.match(text, /^- `a`$/m);
    assert.doesNotMatch(text, /not on the board/);
  });

  test('links the board and the run, and is short', () => {
    const text = commentBody({ ...links, stage: 'In PR', items, problems: [] });
    assert.match(text, /\[Board\]\(https:\/\/github\.com\/users\/rogerbucks\/projects\/2\)/);
    assert.match(text, /\[Run\]\(https:\/\/github\.com\/rogerbucks\/graph-note\/actions\/runs\/77\)/);
    assert.ok(text.split('\n').length <= 10);
  });

  test('says each problem in a line of its own, above the links', () => {
    const text = commentBody({
      ...links,
      stage: 'In PR',
      items,
      problems: ['PROJECT_TOKEN is not set, so the board was not updated.'],
    });
    assert.match(text, /> .*PROJECT_TOKEN is not set/);
    assert.ok(text.indexOf('PROJECT_TOKEN') < text.indexOf('[Board]'));
  });

  test('says so when the pull request moves no requirement', () => {
    const text = commentBody({ ...links, stage: 'In PR', items: [], problems: [] });
    assert.match(text, /No requirement moves with this pull request/);
  });

  test('lists twenty items at most, and counts the rest', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, number: i + 1, status: 'Merged' }));
    const text = commentBody({ ...links, stage: 'Merged', items: many, problems: [] });
    assert.equal(text.split('\n').filter((l) => l.startsWith('- ')).length, 20);
    assert.match(text, /and 5 more/);
  });

  test('links only to github.com, and leaves out a run address that is anything else', () => {
    const text = commentBody({
      ...links,
      runUrl: 'https://evil.example/run',
      boardUrl: 'javascript:alert(1)',
      stage: 'In PR',
      items,
      problems: [],
    });
    assert.doesNotMatch(text, /evil|javascript/);
    assert.doesNotMatch(text, /\[Run\]|\[Board\]/);
  });

  test('puts a number in a link only as a number', () => {
    const text = commentBody({
      ...links,
      stage: 'In PR',
      items: [{ id: 'a', number: '12/../x', status: 'In PR' }],
      problems: [],
    });
    assert.doesNotMatch(text, /\.\.\//);
    assert.match(text, /not on the board yet/);
  });
});
