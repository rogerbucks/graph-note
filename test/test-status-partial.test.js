// A test has three statuses: planned (no file yet), partial (the file is there but does not yet prove every rule its
// record covers, as when several workstreams add cases to one shared file over time) and written (it proves them all).
// A partial test needs its file like a written one, never leaves a requirement proved, may be flipped to only from
// planned and to written, and counts on the slice board as in progress. Small graphs stand in for the real copy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { auditRequirements, sliceDone } from '../scripts/check-requirements.mjs';
import { refusedChanges } from '../scripts/check-requirements-flips.mjs';
import { movedRequirements } from '../scripts/build-status.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import { readBoard, renderBoard, statusOf, summarise } from '../scripts/slice-board.mjs';

const BANNER = `// graph: editor_requirements · SOURCE
// The editor's requirements graph, the one source: edit it here, in a pull request. A test only moves forward.
`;
/** A copy of one slice-1 requirement proved by one test with the given status. */
const copy = (status, file = "file: 'test/shared.test.js', ") =>
  `${BANNER}// ── Sections ──
(section_1:Section {num: '1', title: 'Rules'}),
// ── Requirements ──
(rule_one:Requirement {section: '1', slice: 1, level: 'must', rule: 'The one rule.'}),
// ── Tests ──
(test_shared:Test {proves: 'the one rule', ${file}where: 'repo', status: '${status}'}),
// ── Links ──
(rule_one)-[:PROVED_BY]->(test_shared)
`;
const present = () => true;
const absent = () => false;
const audit = (text, exists) => auditRequirements(text, { exists, slice: 1 });
const kinds = (problems) => problems.map((p) => p.kind);

describe('a partial test in the audit', () => {
  test('is accepted when its file is there', () => {
    assert.deepEqual(audit(copy('partial'), present), []);
  });

  test('is refused when its file is not there, as a written one is', () => {
    const problems = audit(copy('partial'), absent);
    assert.deepEqual(kinds(problems), ['missing-file']);
    assert.match(problems[0].message, /test_shared is partial, but the repository has no test\/shared\.test\.js/);
  });

  test('is refused when it names no file at all', () => {
    assert.deepEqual(kinds(audit(copy('partial', ''), present)), ['missing-file']);
  });

  test('is not asked to be written, unlike a planned test whose file is there', () => {
    assert.deepEqual(kinds(audit(copy('planned'), present)), ['status']);
    assert.deepEqual(audit(copy('partial'), present), []);
  });
});

describe('a requirement proved only by a partial test', () => {
  test('is unproved in --done, and the reason says it is partial', () => {
    const r = sliceDone(copy('partial'), 1, { exists: present });
    assert.equal(r.done, false);
    assert.deepEqual(
      r.missing.map((m) => m.id),
      ['rule_one'],
    );
    assert.match(r.missing[0].why, /test_shared is partial: its file does not yet prove every rule/);
  });

  test('is proved when the same test is written', () => {
    assert.equal(sliceDone(copy('written'), 1, { exists: present }).done, true);
  });

  test('stays unproved when a second, written test proves it beside the partial one', () => {
    const text = copy('partial')
      .replace(
        '// ── Links ──',
        "(test_other:Test {proves: 'x', file: 'test/o.test.js', where: 'repo', status: 'written'}),\n// ── Links ──",
      )
      .replace(
        '(rule_one)-[:PROVED_BY]->(test_shared)',
        '(rule_one)-[:PROVED_BY]->(test_shared),\n(rule_one)-[:PROVED_BY]->(test_other)',
      );
    assert.equal(sliceDone(text, 1, { exists: present }).done, false);
  });
});

describe('a flip of a test status by hand', () => {
  const flip = (from, to, exists = present) => refusedChanges(copy(from), copy(to), { exists });

  for (const [from, to] of [
    ['planned', 'partial'],
    ['partial', 'written'],
    ['planned', 'written'],
  ])
    test(`${from} to ${to} is accepted`, () => {
      assert.deepEqual(flip(from, to), []);
    });

  for (const [from, to] of [
    ['written', 'partial'],
    ['partial', 'planned'],
    ['written', 'planned'],
  ])
    test(`${from} to ${to} is refused as a flip back`, () => {
      const problems = flip(from, to);
      assert.deepEqual(kinds(problems), ['flip-back']);
      assert.match(problems[0].message, new RegExp(`test_shared.*${from} to ${to}`));
    });

  test('planned to partial is refused when the file is not there', () => {
    const problems = flip('planned', 'partial', absent);
    assert.deepEqual(kinds(problems), ['missing-file']);
    assert.match(problems[0].message, /test_shared: flipped to partial, but the repository has no/);
  });

  test('partial to written is refused when the file is not there', () => {
    assert.deepEqual(kinds(flip('partial', 'written', absent)), ['missing-file']);
  });
});

describe('a partial test on the slice board', () => {
  const board = (status) => readBoard(copy(status));

  test('leaves its requirement part, never proved', () => {
    assert.equal(statusOf([{ status: 'partial' }]), 'part');
    assert.equal(board('partial').requirements[0].status, 'part');
    assert.equal(statusOf([{ status: 'partial' }, { status: 'written' }]), 'part');
    assert.equal(statusOf([{ status: 'planned' }, { status: 'planned' }]), 'open');
  });

  test('counts as part in the slice tally, with none proved', () => {
    const c = summarise(board('partial').requirements, 1);
    assert.deepEqual([c.proved, c.part, c.open], [0, 1, 0]);
  });

  test('is shown with its own chip, not the written one', () => {
    const html = renderBoard({ ...board('partial'), slice: 1, date: '2026-10-16' });
    assert.match(html, /chip chip-partial">partial</);
    assert.doesNotMatch(html, /chip chip-written">partial</);
  });

  test('moves no requirement when a pull request flips a test to partial: nothing is proved or merged by it', () => {
    assert.deepEqual(movedRequirements(board('planned'), board('partial')), []);
    assert.deepEqual(movedRequirements(board('partial'), board('written')), ['rule_one']);
  });
});

describe('a test status that is not one of the three', () => {
  for (const bad of ['Partial', 'writen', '']) {
    test(`'${bad}' is a status problem in the audit`, () => {
      const problems = audit(copy(bad), present);
      assert.deepEqual(kinds(problems), ['status']);
      assert.match(problems[0].message, /test_shared has a status that is not planned, partial or written/);
    });

    test(`a flip to '${bad}' is refused in the flip check`, () => {
      assert.deepEqual(kinds(refusedChanges(copy('planned'), copy(bad), { exists: present })), ['field']);
    });
  }

  test('a flip from planned to written is refused when the file is not there', () => {
    const problems = refusedChanges(copy('planned'), copy('written'), { exists: absent });
    assert.deepEqual(kinds(problems), ['missing-file']);
    assert.match(problems[0].message, /test_shared: flipped to written, but the repository has no/);
  });
});

describe('a requirement with only a partial test in the GitHub mirror', () => {
  test('stays open, labelled status:part', () => {
    const issue = desiredState(readBoard(copy('partial')), { S3: { title: 'Slice end', requirements: [] } }, [1])
      .issues[0];
    assert.equal(issue.state, 'open');
    assert.equal(issue.status, 'part');
    assert.ok(issue.labels.includes('status:part'));
  });
});
