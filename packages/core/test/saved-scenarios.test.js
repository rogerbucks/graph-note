// Saved scenarios (editor spec §35, saved_scenarios): records the user manages, never rerun on their own, never faded
// and never enforced. A debug run nobody saved is thrown away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessViews } from '../src/process-core.ts';
import { replayScenario, scenarioText, scenariosOf } from '../src/scenarios.ts';
import { TestRun } from '../src/test-runs.ts';
import { REFUND, graphOf, liveGraph } from './test-runs-fixtures.js';

const STRICT = REFUND.replace("'amount <= 100'", "'amount <= 10'").replace("'amount > 100'", "'amount > 10'");

/** The refund process with one scenario saved from a run of 50. */
function saved() {
  const g = graphOf(REFUND);
  const run = new TestRun(() => g, { inputs: { amount: 50 } });
  run.step();
  run.step();
  return `${REFUND},\n${scenarioText(run, 'small_refund')}`;
}

test('a saved scenario is not rerun when the process changes and never fades, and an ad hoc run is discarded', (t) => {
  const text = saved();
  const [scenario] = scenariosOf(graphOf(text));
  assert.deepEqual(scenario, {
    id: 'small_refund',
    process: 'refund',
    inputs: { amount: 50 },
    took: ['transition:asked->checked', 'pay'],
  });
  const stepped = t.mock.method(TestRun.prototype, 'step');
  const views = new ProcessViews(graphOf(text));
  views.update(graphOf(`${STRICT},\n${text.split('\n').at(-1)}`));
  assert.equal(stepped.mock.callCount(), 0, 'nothing reran it');
  assert.deepEqual(views.intents.breaks, [], 'nor holds it against the change');
  stepped.mock.restore();
  // a year on it is as saved: nothing about it ages
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-10-24') });
  assert.deepEqual(scenariosOf(graphOf(text)), [scenario]);

  const adhoc = new TestRun(() => graphOf(REFUND), { inputs: { amount: 50 } });
  adhoc.step();
  adhoc.discard();
  assert.deepEqual(adhoc.log(), []);
  assert.throws(() => adhoc.record(), /thrown away/);
});

test("replaying a scenario is the user's choice, and a replay that differs is said, never refused", () => {
  const text = saved();
  const [scenario] = scenariosOf(graphOf(text));
  const note = liveGraph(text);
  assert.deepEqual(replayScenario(note.read, scenario), { took: scenario.took, same: true, differsAt: null });
  note.set(`${STRICT},\n${text.split('\n').at(-1)}`);
  const replay = replayScenario(note.read, scenario);
  assert.equal(replay.same, false);
  assert.equal(replay.differsAt, 2);
  assert.deepEqual(replay.took, ['transition:asked->checked', 'deny']);
});
