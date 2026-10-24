// The process debugger (editor spec §35, process_debugger). Debug steps a test run of a process one transition at a
// time. A breakpoint is a thing in the graph, on a transition, guard, step or event. Each stop shows the state and
// each guard tried with its reason. It shows the artefacts and resources involved and any certainty change. The
// drawing highlights the current step and each failed guard.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { PROCESS, WITH_BREAKPOINT, handTimer, nodeOf, noteOf, panel } from './host/process-notes.js';

before(() => build());

const PATH = 'Refunds.md';

async function debugging(block) {
  const env = await load({ files: { [PATH]: noteOf(block) } });
  const timer = handTimer(env);
  const { el } = await show(env, env.state.files.get(PATH));
  labelled(el, 'Debug Refund').click();
  return { env, timer, el };
}

test('a run stopped at a breakpoint on a guard shows state, guard results with reasons, artefacts, resources and certainty changes, and the drawing highlights the step and failed guard', async () => {
  const { env, timer, el } = await debugging(WITH_BREAKPOINT);
  try {
    assert.equal(panel(el)[0], 'Start: in Asked');
    labelled(el, 'Play').click();
    timer.tick();
    assert.equal(panel(el)[0], 'Step 1: in Checked');
    timer.tick();
    assert.deepEqual(timer.pending, [], 'the breakpoint paused it');
    assert.deepEqual(panel(el), [
      'Step 2: in Refused',
      'Stopped at breakpoint On small',
      '✓ amount > 100 holds',
      '✗ amount <= 100 does not hold',
      'Artefacts: Letter',
      'Resources: Desk',
      'Owed would go from even-chance to unlikely (not applied: a test run leaves certainty as it is)',
      'This is a test run: it is thrown away when it stops.',
    ]);
    assert.ok(nodeOf(el, 'refused').classList.contains('thoughtknot-step-current'));
    assert.ok(!nodeOf(el, 'checked').classList.contains('thoughtknot-step-current'));
    assert.ok(nodeOf(el, 'small').classList.contains('thoughtknot-guard-failed'));
    assert.ok(nodeOf(el, 'pay').classList.contains('thoughtknot-guard-failed'), 'with the transition it guards');
    assert.ok(!nodeOf(el, 'big').classList.contains('thoughtknot-guard-failed'));
  } finally {
    env.uninstall();
  }
});

test('stepping by hand goes one transition at a time, and Stop throws the run away and clears the drawing', async () => {
  const { env, el } = await debugging(PROCESS);
  try {
    labelled(el, 'Step forward').click();
    assert.equal(panel(el)[0], 'Step 1: in Checked');
    labelled(el, 'Step forward').click();
    assert.equal(panel(el)[0], 'Step 2: in Refused');
    labelled(el, 'Step forward').click();
    assert.ok(panel(el).includes('The run has ended: no transition can be taken.'));
    assert.equal(labelled(el, 'Step forward').disabled, true);
    labelled(el, 'Stop debugging').click();
    assert.ok(!el.querySelectorAll('g.node').some((n) => n.classList.contains('thoughtknot-step-current')));
    assert.ok(!el.querySelector('.thoughtknot-debug'));
    assert.ok(labelled(el, 'Debug Refund'), 'Debug is offered again');
    assert.ok(!env.state.files.get(PATH).includes('Run'), 'nothing of the run was written');
  } finally {
    env.uninstall();
  }
});
