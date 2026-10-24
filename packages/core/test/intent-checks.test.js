// Intent checks (editor spec §35, intent_checks) are conditions held in the core. They are checked on their own
// whenever the process changes. Each break is reported, so the user fixes the change or updates the intent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessViews } from '../src/process-core.ts';
import { IntentWatch, checkIntents, processFacts } from '../src/intent-checks.ts';
import { REFUND, graphOf, refundWith } from './test-runs-fixtures.js';

const INTENTS = [
  "(reach:Intent {says: 'Every state can be reached', test: 'unreachable == 0'})",
  "(guarded:Intent {says: 'Every side effect is guarded', test: 'unguarded_side_effects == 0'})",
];

test('a change that breaks an intent check is reported at once, with no step by the user', () => {
  const reported = [];
  const views = new ProcessViews(refundWith(...INTENTS));
  views.intents.onBreaks = (breaks) => reported.push(breaks.map((b) => b.id));
  assert.deepEqual(views.intents.breaks, []);
  // the edit adds a state nothing reaches: the host only hands the graph over, as it does for every edit
  views.update(refundWith(...INTENTS, "(lost:State {name: 'Lost'})"));
  assert.deepEqual(reported, [['reach']]);
  assert.equal(views.intents.breaks[0].says, 'Every state can be reached');
});

test('the facts a test reads are counted from the process', () => {
  assert.deepEqual(processFacts(graphOf(REFUND)), {
    states: 4,
    transitions: 3,
    initial: 1,
    final: 2,
    unreachable: 0,
    dead_ends: 0,
    guards: 2,
    side_effects: 1,
    unguarded_side_effects: 0,
  });
});

test('a graph that did not change is not checked again', () => {
  const watch = new IntentWatch(refundWith(...INTENTS));
  watch.update(refundWith(...INTENTS));
  assert.equal(watch.checks, 1);
});

test('a test that cannot be read is a break saying why, never a pass', () => {
  const [b] = checkIntents(refundWith("(odd:Intent {says: 'Odd', test: 'states +'})"));
  assert.equal(b.why, 'refused');
  assert.match(b.detail, /refused/);
});

test('a process intent check is read as an intent with a test and still reports each break', () => {
  const g = refundWith(
    "(other:Process {name: 'Other'})",
    "(reach:Intent {says: 'Every state can be reached', test: 'unreachable == 0'})",
    "(hope:Intent {says: 'Refunds feel fair'})",
    '(reach)-[:CHECKS]->(refund)',
    "(lost:State {name: 'Lost'})",
  );
  assert.deepEqual(
    checkIntents(g, 'refund').map((b) => [b.id, b.why]),
    [['reach', 'fails']],
    'the intent with a test is checked, the one without is not',
  );
  assert.deepEqual(checkIntents(g, 'other'), [], 'an intent checks only the process it is attached to');
});
