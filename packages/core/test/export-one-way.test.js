// Export is one way (editor spec §38, export_one_way). What the code side sends back is a run log, or changes proposed
// with low certainty for review. Code that does not match its snapshot adds to the gap list and blocks nothing. Drift
// is found and resolved either way, and the export lens lists what has been exported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backToExport,
  checkGenerated,
  confirmExport,
  driftOf,
  exportsLens,
  fromCode,
  planExport,
} from '../src/export-code.ts';
import { CONFIRM, MAILER, graphOf } from './export-code-fixtures.js';

const exported = () => {
  const g = graphOf();
  return confirmExport(planExport('mailer', g), g, CONFIRM);
};

test('changes from the code side return as proposals for review, mismatches join the gap list, and the export lens lists what was exported', () => {
  const record = exported();
  const back = fromCode(record, {
    kind: 'changes',
    id: 'from-code-1',
    by: { name: 'mailer_app', kind: 'step' },
    at: '2026-10-24T10:00:00Z',
    changes: [{ op: 'set', thing: 'welcome', key: 'to', value: "'every member'" }],
  });
  assert.equal(back.kind, 'proposal');
  assert.equal(back.likelihood, 'unlikely');
  assert.equal(back.proposal.provenance.basis, record.snapshot.slice(0, 16));
  assert.deepEqual(back.proposal.provenance.read, [record.id]);

  const checked = checkGenerated(record, {
    welcome: { name: 'Send the welcome email', action: 'send email', to: 'everyone' },
    check: { name: 'Check the address' },
    budget: {},
    retry: { name: 'Retry' },
  });
  assert.deepEqual(checked.gaps.slice(record.gaps.length), [
    { kind: 'differs-in-code', thing: 'welcome', key: 'to' },
    { kind: 'missing-in-code', thing: 'smtp' },
    { kind: 'extra-in-code', thing: 'retry' },
  ]);
  assert.equal(checked.snapshot, record.snapshot, 'the snapshot is unchanged');

  const later = { ...checked, id: 'export:mailer@v2#0000000000000000', version: 'v2', at: '2026-10-25T09:00:00Z' };
  assert.deepEqual(
    exportsLens([checked, later]).map((r) => [r.version, r.things, r.gaps]),
    [
      ['v2', 4, 5],
      ['v1', 4, 5],
    ],
  );
});

test('a run log comes back as a log, never as a change', () => {
  const back = fromCode(exported(), { kind: 'run-log', at: '2026-10-24T11:00:00Z', lines: ['sent 3 emails'] });
  assert.deepEqual(back, {
    kind: 'run-log',
    export: exported().id,
    at: '2026-10-24T11:00:00Z',
    lines: ['sent 3 emails'],
  });
});

test('drift is found by id and resolved toward the export as a proposal, or toward the graph as a new export', () => {
  const record = exported();
  const live = graphOf(
    MAILER.replace("to: 'new member'", "to: 'every member'").replace(
      "(budget:Rule {name: 'Monthly budget', status: 'contested'}),\n",
      '',
    ) + ",\n(retry:Step {name: 'Retry'})",
  );
  const drift = driftOf(record, live);
  assert.deepEqual(drift, [
    { kind: 'changed', thing: 'welcome', keys: ['to'] },
    { kind: 'removed', thing: 'budget', keys: [] },
    { kind: 'added', thing: 'retry', keys: [] },
  ]);
  assert.deepEqual(backToExport(record, drift), [{ op: 'set', thing: 'welcome', key: 'to', value: "'new member'" }]);
  const again = planExport('mailer', live);
  assert.notEqual(again.snapshot, record.snapshot, 'toward the graph is a new snapshot');
});
