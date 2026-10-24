// An export shows its gaps and goes ahead once they are confirmed (editor spec §38, export_gap_summary). The gap list
// is kept with the export, and each export is a frozen snapshot, named by its version, that traces back into the graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmExport, driftOf, planExport } from '../src/export-code.ts';
import { CONFIRM, MAILER, graphOf } from './export-code-fixtures.js';

test('an export with gaps shows the summary, proceeds on confirmation, and stores the gap list with its traceable snapshot', () => {
  const g = graphOf();
  const plan = planExport('mailer', g);
  assert.equal(plan.confirm, true);
  assert.deepEqual(plan.gaps, [
    { kind: 'doubtful', thing: 'check' },
    { kind: 'contested', thing: 'budget' },
  ]);
  const record = confirmExport(plan, g, CONFIRM);
  assert.ok(record, 'an export is always allowed once its gaps are confirmed');
  assert.deepEqual(record.gaps, plan.gaps);
  assert.match(record.id, /^export:mailer@v1#[0-9a-f]{16}$/);
  assert.equal(record.snapshot, plan.snapshot);
  // every thing keeps its id, so the export traces back into the live graph: nothing has drifted
  assert.deepEqual(Object.keys(record.things), ['welcome', 'check', 'budget', 'smtp']);
  assert.deepEqual(driftOf(record, g), []);
});

test('an export is immutable', () => {
  const g = graphOf();
  const record = confirmExport(planExport('mailer', g), g, CONFIRM);
  assert.ok(Object.isFrozen(record) && Object.isFrozen(record.gaps) && Object.isFrozen(record.things.welcome.props));
  assert.throws(() => {
    'use strict';
    record.things.welcome.props.name = 'changed';
  }, TypeError);
});

test('an export with no gaps needs no confirmation, and a graph changed since its plan is not exported blind', () => {
  const clean = graphOf("// graph: tidy\n(a:Step {name: 'One step'})");
  assert.equal(planExport('tidy', clean).confirm, false);
  const plan = planExport('mailer', graphOf());
  const moved = graphOf(MAILER.replace("'Check the address'", "'Check it twice'"));
  assert.equal(confirmExport(plan, moved, CONFIRM), null);
});
