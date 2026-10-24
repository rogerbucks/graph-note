// Edits made in any process view go into the one core (editor spec §34, edits_from_any_view). An edit in a view that
// cannot show it updates the core, warns what is hidden and lists the affected views first. It keeps dangling links
// and keeps view-only edits out.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { graphOf, ProcessViews } from '../src/process-core.ts';
import { planEdit, saveEdit } from '../src/edits-from-views.ts';

const LOOPED = () =>
  graphOf(
    [
      ['draft', ['Step'], {}],
      ['check', ['Step'], {}],
      ['fix', ['Step'], {}],
      ['press', ['Resource'], { name: 'The press' }],
      ['print', ['Step'], {}],
    ],
    [
      ['draft', 'TRANSITION', 'check'],
      ['check', 'TRANSITION', 'fix'],
      ['fix', 'TRANSITION', 'check'],
      ['check', 'TRANSITION', 'print'],
      ['print', 'USES', 'press'],
    ],
  );

describe('edits_from_any_view', () => {
  test('an edit inside a loop the pipeline folds updates the core and warns what is hidden', () => {
    const views = new ProcessViews(LOOPED());
    const plan = planEdit(views, 'pipeline', {
      add: [{ id: 'recheck', kind: 'Step' }],
      link: [
        ['fix', 'recheck'],
        ['recheck', 'check'],
      ],
    });
    assert.equal(plan.coreChanged, true);
    assert.deepEqual(plan.hidden, [
      ['check', 'loop-hidden'],
      ['fix', 'loop-hidden'],
      ['recheck', 'loop-hidden'],
    ]);
    assert.equal(saveEdit(views, plan), true);
    assert.ok(views.open('state-machine').nodes.some((n) => n.id === 'recheck'));
  });

  test('the affected views are listed before anything is saved', () => {
    const views = new ProcessViews(LOOPED());
    const before = views.core.hash;
    const plan = planEdit(views, 'workflow', { set: [{ id: 'print', props: { duration: 'PT1H' } }] });
    assert.deepEqual(plan.affected, ['state-machine', 'event-flow', 'decision-table', 'petri-net', 'actor-model']);
    assert.equal(views.core.hash, before, 'planning saved nothing');
  });

  test('an incomplete edit is saved, and its gaps are shown', () => {
    const views = new ProcessViews(LOOPED());
    const plan = planEdit(views, 'workflow', { add: [{ id: 'bind', kind: 'Step' }], link: [['print', 'ghost']] });
    assert.deepEqual(plan.gaps, [
      ['unlinked', 'bind'],
      ['missing', 'ghost'],
    ]);
    assert.equal(saveEdit(views, plan), true);
    assert.ok(views.core.graph.nodes.has('bind'));
  });

  test('removing a thing keeps its links to a resource, listed as dangling', () => {
    const views = new ProcessViews(LOOPED());
    const plan = planEdit(views, 'workflow', { remove: ['press'] });
    assert.deepEqual(plan.dangling, [['print', 'USES', 'press']]);
    assert.ok(plan.graph.edges.some((e) => e[1] === 'USES'));
    assert.equal(plan.graph.nodes.has('press'), false);
  });

  test('a view-only edit stays in the view settings and leaves the core as it was', () => {
    const views = new ProcessViews(LOOPED());
    const plan = planEdit(views, 'workflow', { set: [{ id: 'draft', props: { x: 40, y: 80 } }] });
    assert.equal(plan.coreChanged, false);
    assert.deepEqual(plan.affected, []);
    assert.deepEqual(plan.viewOnly, [
      ['draft', 'x'],
      ['draft', 'y'],
    ]);
    assert.equal(saveEdit(views, plan), false);
    assert.deepEqual(views.core.view.draft, { x: 40, y: 80 });
    assert.equal(views.core.graph.p('draft').x, undefined);
  });
});
