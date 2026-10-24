// A corporate setting's boundary rules apply to every export by themselves (editor spec §38, boundary_rules_on_export).
// Redacted things are left out and listed in the gap summary, AI-assisted content is labelled, and nothing is blocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backToExport, confirmExport, driftOf, planExport } from '../src/export-code.ts';
import { CONFIRM, graphOf } from './export-code-fixtures.js';

const WORK = `// graph: work
(plan:Doc {name: 'Plan', tags: 'internal, roadmap'}),
(salary:Doc {name: 'Salaries', tags: 'hr', owner_phone: 'kept private'}),
(draft:Doc {name: 'Draft', ai_assisted: TRUE, owner_phone: 'kept private'}),
(memo:Memo {name: 'Board memo'}),
(plan)-[:CITES]->(salary),
(plan)-[:CITES]->(draft)`;

const SETTING = { redact: [{ tag: 'hr' }, { label: 'Memo' }, { key: 'owner_phone' }], aiLabel: 'AI-assisted' };

test('a corporate export lists redacted items in the gap summary and labels AI-assisted content', () => {
  const g = graphOf(WORK);
  const plan = planExport('work', g, SETTING);
  assert.deepEqual(plan.gaps, [
    { kind: 'redacted', thing: 'salary' },
    { kind: 'redacted', thing: 'draft', key: 'owner_phone' },
    { kind: 'redacted', thing: 'memo' },
  ]);
  const record = confirmExport(plan, g, CONFIRM, SETTING);
  assert.ok(record, 'nothing is blocked');
  assert.deepEqual(Object.keys(record.things), ['plan', 'draft']);
  assert.equal('owner_phone' in record.things.draft.props, false);
  assert.equal(record.things.draft.props.ai_label, 'AI-assisted');
  assert.deepEqual(record.aiAssisted, ['draft']);
  assert.deepEqual(record.links, [['plan', 'CITES', 'draft']], 'a redacted thing goes with its links');
  assert.deepEqual(record.gaps, plan.gaps);
});

test('with no corporate setting nothing is redacted or labelled', () => {
  const g = graphOf(WORK);
  const record = confirmExport(planExport('work', g), g, CONFIRM);
  assert.deepEqual(Object.keys(record.things), ['plan', 'salary', 'draft', 'memo']);
  assert.deepEqual(record.aiAssisted, []);
});

test('an export made under a corporate setting shows no drift from its own redactions and labels', () => {
  const g = graphOf(WORK);
  const record = confirmExport(planExport('work', g, SETTING), g, CONFIRM, SETTING);
  assert.deepEqual(driftOf(record, g), []);
  assert.deepEqual(backToExport(record, driftOf(record, g)), []);
});
