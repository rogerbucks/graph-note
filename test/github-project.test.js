// The GitHub mirror of the requirements, as a person runs it: the real requirements copy and the real workstreams file,
// and the command line — dry run by default, with no network call. Applying is proved against a stand-in for gh in
// github-project-gh.test.js; nothing here applies anything. Editor spec §12, requirements_checked_in_ci.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { assignWorkstreams, desiredState, readWorkstreams } from '../scripts/github-project-desired.mjs';
import { read, path, readJSON } from './repository/repo.js';

const board = readBoard(read(REQUIREMENTS));
const workstreams = readWorkstreams(read('requirements/workstreams.json'));
const inSlices = (slices) => board.requirements.filter((r) => slices.includes(r.slice));

const emptyPath = mkdtempSync(join(tmpdir(), 'github-project-sync-'));
after(() => rmSync(emptyPath, { recursive: true, force: true }));
/** Runs the command with no gh on the path, so a call to gh could not work, and with any token removed. */
const command = (...args) =>
  spawnSync(process.execPath, [path('scripts/github-project.mjs'), ...args], {
    encoding: 'utf8',
    env: { PATH: emptyPath, HOME: emptyPath },
  });

describe('the workstreams file', () => {
  test('names the workstreams W0 to W15 and the slice-end workstream S3, with the titles agreed', () => {
    assert.deepEqual(Object.keys(workstreams), [...Array.from({ length: 16 }, (_, n) => `W${n}`), 'S3']);
    assert.deepEqual(
      Object.values(workstreams).map((w) => w.title),
      [
        'Slice switch and zoom',
        'Focus, hover and untangle',
        'Details navigation and sheet',
        'Folding, routing and the View menu',
        'Arrows and inline properties',
        'Diagram types',
        'Data export',
        'Links, attachments and rich details',
        'Proposals',
        'AI',
        'Sources, steps and views across notes',
        'Link flow and path play',
        'Animated images',
        'Notes reader parity',
        'Notes in the editor',
        'Viewer aids',
        'Slice end',
      ],
    );
  });

  test('is a plain JSON map, so a person or a model can edit it', () => {
    for (const [id, w] of Object.entries(readJSON('requirements/workstreams.json')))
      assert.deepEqual(Object.keys(w), ['title', 'requirements'], id);
  });

  test('puts every requirement of slices 3 and 4 in exactly one workstream', () => {
    const listed = Object.values(workstreams).flatMap((w) => w.requirements);
    assert.equal(new Set(listed).size, listed.length, 'no requirement is listed twice');
    const placed = assignWorkstreams(inSlices([3, 4]), workstreams);
    assert.equal(placed.size, inSlices([3, 4]).length);
    for (const r of inSlices([3, 4])) assert.ok(Object.hasOwn(workstreams, placed.get(r.id)), r.id);
  });

  test('may name a requirement the current copy does not hold: it is waiting for a later copy', () => {
    const held = new Set(board.requirements.map((r) => r.id));
    const waiting = Object.values(workstreams)
      .flatMap((w) => w.requirements)
      .filter((id) => !held.has(id));
    for (const id of waiting) assert.equal(assignWorkstreams(board.requirements, workstreams).has(id), false, id);
    assert.doesNotThrow(() => desiredState(board, workstreams, [3, 4]));
  });

  test('keeps the slice-end requirement in S3 and puts a requirement nobody listed there too', () => {
    const placed = assignWorkstreams(board.requirements, workstreams);
    assert.equal(placed.get('done_means_proved'), 'S3');
    const unlisted = board.requirements.filter(
      (r) => !Object.values(workstreams).some((w) => w.requirements.includes(r.id)),
    );
    for (const r of unlisted) assert.equal(placed.get(r.id), 'S3', r.id);
  });
});

describe('the desired issues for the real requirements', () => {
  const { issues } = desiredState(board, workstreams, [3, 4]);

  test('are one for each requirement of slices 3 and 4, with a distinct title and marker', () => {
    assert.equal(issues.length, inSlices([3, 4]).length);
    assert.equal(new Set(issues.map((i) => i.title)).size, issues.length);
  });

  test('have titles no longer than the id, a colon and 80 characters', () => {
    for (const i of issues) assert.ok(i.title.length <= i.id.length + 2 + 80, i.title);
  });

  test('are closed exactly when the requirement is proved, by the status the slice board uses', () => {
    for (const issue of issues) {
      const r = board.requirements.find((x) => x.id === issue.id);
      assert.equal(issue.status, r.status, issue.id);
      assert.equal(issue.state, r.status === 'proved' ? 'closed' : 'open', issue.id);
    }
  });
});

describe('the command', () => {
  test('is a dry run by default: it prints the plan, says no network call was made, and exits 0', () => {
    const result = command();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry run/i);
    assert.match(result.stdout, /no network call/i);
    assert.match(result.stdout, new RegExp(`issues: create ${inSlices([3, 4]).length} `));
    assert.match(result.stdout, /create project "graph-note requirements"/);
    assert.equal(result.stderr, '');
  });

  test('says --dry-run the same as saying nothing', () => {
    assert.equal(command('--dry-run').stdout, command().stdout);
  });

  test('plans the slices asked for with --slices', () => {
    const result = command('--slices', '4');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`issues: create ${inSlices([4]).length} `));
    assert.doesNotMatch(result.stdout, /slice-3/);
    assert.equal(command('--slices', '3,4').stdout, command().stdout);
  });

  test('prints the requirement counts of the slices, by status', () => {
    const { stdout } = command();
    const counts = { proved: 0, part: 0, open: 0 };
    for (const r of inSlices([3, 4])) counts[r.status] += 1;
    assert.match(
      stdout,
      new RegExp(
        `requirements: ${inSlices([3, 4]).length} in slices 3, 4 · ${counts.proved} proved · ${counts.part} part · ${counts.open} open`,
      ),
    );
  });

  test('refuses --apply together with --dry-run', () => {
    const result = command('--apply', '--dry-run');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /github-project: .*--apply.*--dry-run/);
  });

  test('refuses an unknown option, a missing value and slices that are not whole numbers', () => {
    for (const args of [['--force'], ['--slices'], ['--slices', 'x'], ['--slices', '0'], ['--slices', '3,,4']]) {
      const result = command(...args);
      assert.equal(result.status, 1, args.join(' '));
      assert.match(result.stderr, /^github-project: /, args.join(' '));
      assert.equal(result.stdout, '');
    }
  });

  test('with --apply and no gh to run, stops with gh’s absence and changes nothing', () => {
    const result = command('--apply');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /github-project: .*gh/);
  });
});
