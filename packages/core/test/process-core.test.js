// One process core under every process view (editor spec §34, one_process_core). One process opened as a pipeline and
// as a state machine reads the same core, and an edit in one shows in the other.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { graphOf, processCoreOf, ProcessViews } from '../src/process-core.ts';
import { planEdit, saveEdit } from '../src/edits-from-views.ts';

const ORDER = graphOf(
  [
    ['take', ['Step'], { name: 'Take the order', x: 10, y: 20 }],
    ['pack', ['Step'], { name: 'Pack it' }],
    ['ship', ['Step'], { name: 'Ship it' }],
  ],
  [
    ['take', 'TRANSITION', 'pack'],
    ['pack', 'TRANSITION', 'ship'],
  ],
);

describe('one_process_core', () => {
  test('a pipeline and a state machine read the same core', () => {
    const views = new ProcessViews(ORDER);
    const pipeline = views.open('pipeline'),
      machine = views.open('state-machine');
    assert.equal(pipeline.core, machine.core);
    assert.deepEqual(pipeline.links, machine.links);
    assert.deepEqual(
      pipeline.nodes.map((n) => n.id),
      machine.nodes.map((n) => n.id),
    );
  });

  test('an edit made in the pipeline shows in the state machine', () => {
    const views = new ProcessViews(ORDER);
    const plan = planEdit(views, 'pipeline', { add: [{ id: 'bill', kind: 'Step' }], link: [['ship', 'bill']] });
    assert.equal(saveEdit(views, plan), true);
    const machine = views.open('state-machine');
    assert.ok(machine.nodes.some((n) => n.id === 'bill'));
    assert.ok(machine.links.some(([a, b]) => a === 'ship' && b === 'bill'));
  });

  test('the core keeps no view settings: where a thing sits is kept apart', () => {
    const core = processCoreOf(ORDER);
    assert.equal(core.graph.p('take').x, undefined);
    assert.deepEqual(core.view.take, { x: 10, y: 20 });
  });
});
