// The graph never acts on the world (editor spec §38, export_only_way_out). It drives a real application only through
// an export, and reading, checking or exporting a graph whose steps say to send an email sends nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { confirmExport, planExport } from '../src/export-code.ts';
import { CONFIRM, MAILER, graphOf } from './export-code-fixtures.js';

/** Every way out a script has, each replaced by one that records it was called. */
function trapWaysOut() {
  const called = [];
  const names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
  const before = Object.fromEntries(names.map((n) => [n, globalThis[n]]));
  for (const n of names)
    globalThis[n] = function trapped() {
      called.push(n);
    };
  return { called, restore: () => names.forEach((n) => (globalThis[n] = before[n])) };
}

test('no process run sends an email or makes an external call', () => {
  const trap = trapWaysOut();
  try {
    const world = gs.worldFromStore(gs.read([MAILER]));
    gs.check(world, 'mailer');
    const g = graphOf();
    const record = confirmExport(planExport('mailer', g), g, CONFIRM);
    assert.equal(record.things.welcome.props.action, 'send email', 'the step is carried to the code, as data');
  } finally {
    trap.restore();
  }
  assert.deepEqual(trap.called, []);
});
