// The completeness report behind the problems badge (spec §8): for each completeness rule the graph declares (§25 of the
// graph spec), what is covered, what is deferred — and overdue — and what is missing, with a fix for each gap, in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { completenessReport } from '../src/completeness.ts';

const GRAPH = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(tablet:Option {name: 'Tablet'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(large),
(every_option_answers:Cardinality {kind: 'Option', relationship: 'ANSWERS', direction: 'out', min: 1, says: 'every option answers the question'}),
(later:Deferred {what: 'say what the small reader answers', why: 'waiting for the trial', rule: 'every_option_answers', revisit_by: DATE '2026-10-01'}),
(later)-[:DEFERS]->(small)`;

test('each rule says how much is covered, what is deferred or overdue, and what is missing with its fix', () => {
  const report = completenessReport(readNote([GRAPH]), 'reader', '2026-10-07');
  assert.deepEqual(report, {
    rules: [
      {
        rule: 'every_option_answers',
        says: 'every option answers the question',
        summary: '1 of 3 covered, 1 overdue, 1 missing',
        covered: 1,
        counted: 3,
        deferred: [],
        overdue: ['Small reader'],
        missing: [
          {
            at: 'Tablet',
            fix: 'add a ANSWERS link (out): it has 0, needs at least 1; or park it with a Deferred whose rule is every_option_answers',
          },
        ],
        malformed: '',
      },
    ],
    gaps: 1,
  });
});

test('a deferral not yet due is deferred, not overdue', () => {
  const report = completenessReport(
    readNote([GRAPH.replace("DATE '2026-10-01'", "DATE '2026-12-01'")]),
    'reader',
    '2026-10-07',
  );
  assert.deepEqual([report.rules[0].deferred, report.rules[0].overdue], [['Small reader'], []]);
  assert.equal(report.rules[0].summary, '1 of 3 covered, 1 deferred, 1 missing');
});

test('a graph that declares no completeness rules has an empty report', () => {
  assert.deepEqual(completenessReport(readNote(['// graph: g\n(a:T)']), 'g', '2026-10-07'), { rules: [], gaps: 0 });
});

test('a rule that cannot be read says what it lacks', () => {
  const r = completenessReport(
    readNote(["// graph: g\n(a:T),\n(bad:Cardinality {kind: 'T', says: 'x'})"]),
    'g',
    '2026-10-07',
  );
  assert.match(r.rules[0].malformed, /must carry relationship, direction, min or max/);
});
