// A slice is done only when every one of its requirements is proved by a written test (spec §12, done_means_proved).
// The requirements tooling says so. `sliceDone` in scripts/check-requirements.mjs, run as `--done <slice>`, says
// whether a slice is done. It lists each requirement still to prove, with why. The slice board says the same on its
// overview.
//
// Each case is seen on a tampered copy of the real file, so the check is proved against the file it guards. First every
// test is marked written and every file is there, which makes a slice done. Then one thing at a time is taken away.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as requirements from '../scripts/check-requirements.mjs';
import { readBoard, renderBoard } from '../scripts/slice-board.mjs';
import { exists, read, path } from './repository/repo.js';

const { REQUIREMENTS } = requirements;
const sliceDone = (...args) => {
  assert.equal(typeof requirements.sliceDone, 'function', 'check-requirements.mjs says whether a slice is done');
  return requirements.sliceDone(...args);
};
const real = () => read(REQUIREMENTS);
const replaced = (text, from, to) => {
  assert.ok(text.includes(from), `the copy holds ${from}`);
  return text.replace(from, to);
};
/** The real copy with every test marked written: with every file there, each slice that names its tests is done. */
const allWritten = () => real().replaceAll("status: 'planned'", "status: 'written'");
const everyFile = () => true;
const ids = (r) => r.missing.map((m) => m.id);
const ofSlice = (text, slice) => readBoard(text).requirements.filter((r) => r.slice === slice);
const ZOOM_FIT = "file: 'packages/core/test/zoom-fit.test.js', where: 'repo', status: 'written'";

describe('whether a slice is done', () => {
  // proves: done_means_proved
  test('a slice is done when every one of its requirements is proved by a written test, each counted', () => {
    const r = sliceDone(allWritten(), 3, { exists: everyFile });
    assert.equal(r.done, true, JSON.stringify(r.missing.slice(0, 3)));
    assert.deepEqual(r.missing, []);
    assert.equal(r.slice, 3);
    assert.equal(r.total, ofSlice(allWritten(), 3).length);
    assert.ok(r.total > 50, 'every requirement of slice 3');
  });

  // proves: done_means_proved
  test('one test still planned: not done, and each requirement it proves is listed with that test', () => {
    const text = replaced(allWritten(), ZOOM_FIT, ZOOM_FIT.replace("'written'", "'planned'"));
    const r = sliceDone(text, 3, { exists: everyFile });
    assert.equal(r.done, false);
    assert.deepEqual(ids(r).sort(), ['zoom_fit_recomputed', 'zoom_out_to_fit']);
    for (const m of r.missing) assert.match(m.why, /test_zoom_fit is planned, not written/);
  });

  // proves: done_means_proved
  test('a requirement proved by two tests, one of them not written, is not proved: only that test is named', () => {
    // found by its id, whatever files the copy lists for it
    const saved = allWritten()
      .split('\n')
      .find((line) => line.startsWith('(test_untangle_saved:Test {'));
    assert.ok(saved?.includes("status: 'written'"), 'the copy holds test_untangle_saved');
    const text = replaced(allWritten(), saved, saved.replace("status: 'written'", "status: 'planned'"));
    const r = sliceDone(text, 3, { exists: everyFile });
    assert.deepEqual(ids(r), ['untangle_legend']);
    assert.match(r.missing[0].why, /test_untangle_saved is planned/);
    assert.doesNotMatch(r.missing[0].why, /test_untangle\b/);
  });

  // proves: done_means_proved
  test('a requirement that names no test is not proved', () => {
    const text = replaced(allWritten(), '(done_means_proved)-[:PROVED_BY]->(test_slice_done),\n', '');
    const r = sliceDone(text, 3, { exists: everyFile });
    assert.deepEqual(ids(r), ['done_means_proved']);
    assert.match(r.missing[0].why, /names no test/);
  });

  // proves: done_means_proved
  test('a test marked written whose file the repository does not hold proves nothing', () => {
    const r = sliceDone(allWritten(), 3, { exists: (rel) => rel !== 'test/slice-done.test.js' });
    assert.deepEqual(ids(r), ['done_means_proved']);
    assert.match(r.missing[0].why, /test_slice_done is written, but the repository has no test\/slice-done\.test\.js/);
  });

  // proves: done_means_proved
  test('only the slice’s own requirements count: a later slice’s, unproved, leaves it done and that slice not', () => {
    const later = `(not_yet_proved:Requirement {section: '1', slice: 90, level: 'must', rule: 'A requirement of a later slice.'}),\n`;
    const text = replaced(allWritten(), '// ── Tests ──\n', `${later}// ── Tests ──\n`);
    assert.equal(sliceDone(text, 3, { exists: everyFile }).done, true);
    const ninety = sliceDone(text, 90, { exists: everyFile });
    assert.deepEqual([ninety.done, ninety.total, ids(ninety)], [false, 1, ['not_yet_proved']]);
  });

  // proves: done_means_proved
  test('a slice with no requirements is never done: there is nothing to have proved', () => {
    const r = sliceDone(allWritten(), 99, { exists: everyFile });
    assert.deepEqual([r.done, r.total, r.missing], [false, 0, []]);
    assert.match(r.said, /slice 99 has no requirements/);
  });

  // proves: done_means_proved
  test('a copy whose banner was edited is never done: only the source as it opens is checked', () => {
    const text = replaced(allWritten(), 'edit it here, in a pull request.', 'edited by hand.');
    const r = sliceDone(text, 3, { exists: everyFile });
    assert.equal(r.done, false);
    assert.deepEqual(r.missing, [], 'every requirement proved');
    assert.deepEqual(
      r.faults.map((f) => f.id),
      ['line 2'],
    );
    assert.match(r.faults[0].why, /not the banner the requirements open on/);
    assert.match(r.said, /slice 3 is not done: 0 of \d+ requirements are still to prove, and the copy has 1 fault/);
  });

  // proves: done_means_proved
  test('a test whose where the check does not know proves nothing: a changed where never skips its file', () => {
    const elsewhere = replaced(allWritten(), ZOOM_FIT, ZOOM_FIT.replace("where: 'repo'", "where: 'elsewhere'"));
    const r = sliceDone(elsewhere, 3, { exists: everyFile });
    assert.deepEqual(ids(r).sort(), ['zoom_fit_recomputed', 'zoom_out_to_fit']);
    assert.match(
      r.missing[0].why,
      /test_zoom_fit says where: 'elsewhere', which is not repo, both or outside the repo/,
    );
    // a test kept outside the repository, as the trace is, names no file here, and is not looked for
    const outside = replaced(allWritten(), ZOOM_FIT, ZOOM_FIT.replace("where: 'repo'", "where: 'outside the repo'"));
    const noFile = (rel) => rel !== 'packages/core/test/zoom-fit.test.js';
    assert.equal(sliceDone(outside, 3, { exists: noFile }).done, true);
    assert.equal(
      sliceDone(allWritten(), 3, { exists: noFile }).done,
      false,
      'in the repository, its file is looked for',
    );
  });

  // proves: done_means_proved
  test('a requirement whose slice is not a whole number is a fault, never left out of its slice', () => {
    const from = "(zoom_out_to_fit:Requirement {section: '25', slice: 3,";
    const text = replaced(allWritten(), from, from.replace('slice: 3', "slice: '3'"));
    const r = sliceDone(text, 3, { exists: everyFile });
    assert.equal(r.done, false);
    assert.deepEqual(
      r.faults.map((f) => f.id),
      ['zoom_out_to_fit'],
    );
    assert.match(r.faults[0].why, /requirement zoom_out_to_fit has slice '3', which is not a whole number/);
    assert.equal(sliceDone(text, 2, { exists: everyFile }).done, false, 'nor can any slice be done while it is so');
  });

  // proves: done_means_proved
  test('every slice before the one under way is done, as committed', () => {
    for (let s = 1; s < requirements.CURRENT_SLICE; s++) {
      const r = sliceDone(real(), s, { exists });
      assert.equal(r.done, true, `${r.said}: ${JSON.stringify(r.missing.slice(0, 3))}`);
    }
  });

  // proves: done_means_proved
  test('as committed, what is still to prove is every requirement the board does not count as proved', () => {
    const r = sliceDone(real(), 3, { exists });
    const open = ofSlice(real(), 3).filter((q) => q.status !== 'proved');
    for (const id of open.map((q) => q.id)) assert.ok(ids(r).includes(id), `${id} is still to prove`);
    assert.equal(r.done, r.missing.length === 0 && r.total > 0);
  });
});

describe('run on its own', () => {
  // within a time limit: a check left waiting for its input fails here, never hangs the run
  const run = (input, ...args) =>
    spawnSync(process.execPath, [path('scripts/check-requirements.mjs'), '--stdin', ...args], {
      input,
      encoding: 'utf8',
      timeout: 30_000,
    });

  // proves: done_means_proved
  test('--done says a slice is done, and exits 0', () => {
    const allThere = allWritten();
    const r = run(allThere, '--done', '1');
    assert.ok(!r.error, String(r.error));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^slice 1 is done: all \d+ of its requirements are proved by written tests/m);
  });

  // proves: done_means_proved
  test('--done lists what is missing for a slice that is not done, one requirement to a line, and exits 1', () => {
    const r = run(replaced(allWritten(), ZOOM_FIT, ZOOM_FIT.replace("'written'", "'planned'")), '--done', '3');
    assert.ok(!r.error, String(r.error));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    // the files are the repository's own here, so a test the copy marks written before its file is there is listed too
    assert.match(r.stdout, /^slice 3 is not done: \d+ of \d+ requirements are still to prove$/m);
    assert.match(r.stdout, /^ {2}zoom_out_to_fit: test test_zoom_fit is planned, not written$/m);
    assert.match(r.stdout, /^ {2}zoom_fit_recomputed: /m);
  });

  // proves: done_means_proved
  test('--done needs a whole number', () => {
    const r = run(real(), '--done', 'three');
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /--done needs a slice number/);
  });
});

describe('the slice board', () => {
  const board = (text, slice, done) =>
    renderBoard({ ...readBoard(text), slice, date: '2026-10-15', done: sliceDone(text, slice, done) });

  // proves: done_means_proved
  test('says on its overview whether the slice is done, and how many requirements are still to prove', () => {
    const done = board(allWritten(), 3, { exists: everyFile });
    assert.match(
      done,
      /<p class="done"><span class="chip chip-proved">done<\/span> Slice 3 is done: every one of its \d+ requirements is proved by a written test\.<\/p>/,
    );
    const text = replaced(allWritten(), ZOOM_FIT, ZOOM_FIT.replace("'written'", "'planned'"));
    const notDone = board(text, 3, { exists: everyFile });
    assert.match(
      notDone,
      /<span class="chip chip-open">not done<\/span> Slice 3 is not done: 2 of \d+ requirements are still to prove\./,
    );
    assert.doesNotMatch(notDone, /Slice 3 is done/);
    const edited = replaced(allWritten(), 'edit it here, in a pull request.', 'edited by hand.');
    assert.match(
      board(edited, 3, { exists: everyFile }),
      /Slice 3 is not done: 0 of \d+ .*, and the copy has 1 fault\./,
    );
  });

  // proves: done_means_proved
  test('printed from the real file, it says what the check says', () => {
    const r = spawnSync(process.execPath, [path('scripts/slice-board.mjs'), '--date', '2026-10-15'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(r.status, 0, r.stderr);
    const done = sliceDone(real(), 3, { exists }).done;
    assert.match(r.stdout, done ? /Slice 3 is done/ : /Slice 3 is not done/);
  });
});
