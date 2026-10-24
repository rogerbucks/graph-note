// Each process view declares what it cannot show (editor spec §34, views_declare_limits). A looped process shown as a
// pipeline folds the loop into one node marked loop hidden, and the core stays valid.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { graphOf, processCoreOf } from '../src/process-core.ts';
import { PROCESS_VIEWS, PROCESS_VIEW_LIMITS, processView, loopsOf } from '../src/process-views.ts';

const REVIEW = graphOf(
  [
    ['draft', ['Step'], { name: 'Draft' }],
    ['check', ['Step'], { name: 'Check', duration: 'P2D' }],
    ['fix', ['Step'], { name: 'Fix' }],
    ['print', ['Step'], { name: 'Print', split: 'parallel' }],
    ['post', ['Step'], {}],
    ['email', ['Step'], {}],
  ],
  [
    ['draft', 'TRANSITION', 'check'],
    ['check', 'TRANSITION', 'fix'],
    ['fix', 'TRANSITION', 'check'],
    ['check', 'TRANSITION', 'print'],
    ['print', 'TRANSITION', 'post', { parallel: true }],
    ['print', 'TRANSITION', 'email', { parallel: true }],
  ],
);

describe('views_declare_limits', () => {
  test('a looped process shown as a pipeline folds the loop into one node marked loop hidden', () => {
    const view = processView(processCoreOf(REVIEW), 'pipeline');
    const fold = view.nodes.find((n) => n.kind === 'Loop');
    assert.deepEqual(fold, { id: 'loop:check', kind: 'Loop', hides: ['check', 'fix'], marks: ['loop-hidden'] });
    assert.deepEqual(view.links, [
      ['draft', 'loop:check'],
      ['loop:check', 'print'],
      ['print', 'email'],
      ['print', 'post'],
    ]);
    assert.equal(view.incomplete, true);
  });

  test('the core stays valid: the view changed nothing, and the core flags nothing', () => {
    const core = processCoreOf(REVIEW);
    const hash = core.hash;
    for (const kind of PROCESS_VIEWS) processView(core, kind);
    assert.equal(processCoreOf(REVIEW).hash, hash);
    assert.deepEqual(gs.coreOfEight(core.graph).flags, []);
  });

  test('a view that shows everything is complete, and every view declares its limits', () => {
    const view = processView(processCoreOf(REVIEW), 'workflow');
    assert.equal(view.incomplete, false);
    assert.equal(view.nodes.length, 6);
    for (const kind of PROCESS_VIEWS) assert.ok(Array.isArray(PROCESS_VIEW_LIMITS[kind]), kind);
  });

  test('parallel steps and timing a view cannot show are marked where they are', () => {
    const table = processView(processCoreOf(REVIEW), 'decision-table');
    const marks = Object.fromEntries(table.nodes.map((n) => [n.id, n.marks]));
    assert.deepEqual(marks.print, ['parallel-hidden']);
    assert.deepEqual(marks.check, undefined, 'check is inside the folded loop');
    assert.deepEqual(table.nodes.find((n) => n.id === 'loop:check')?.marks, ['loop-hidden']);
    const machine = processView(processCoreOf(REVIEW), 'state-machine');
    assert.deepEqual(machine.nodes.find((n) => n.id === 'check')?.marks, ['timing-hidden']);
  });

  test('a step to itself is a loop too', () => {
    assert.deepEqual(
      loopsOf(
        ['a', 'b'],
        [
          ['a', 'a'],
          ['a', 'b'],
        ],
      ),
      [['a']],
    );
  });
});
