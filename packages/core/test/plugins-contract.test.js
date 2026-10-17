// The contract suite of the data exports (editor spec §43, plugin_contract_suites): every built-in export passes it, and
// an export that breaks a promise fails the check that holds it, saying what was wanted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exporterContract, sampleExports } from '../src/plugins-contract.ts';
import { pluginRegistry } from '../src/plugins.ts';
import { CORE_EXPORTS } from '../src/export-data.ts';

const registry = pluginRegistry();
registry.register(CORE_EXPORTS);

/** The names of the checks `e` fails, with their messages. */
const failures = (e) =>
  exporterContract(e).flatMap((c) => {
    try {
      c.run();
      return [];
    } catch (err) {
      return [`${c.name}: ${err.message}`];
    }
  });

describe('the data export contract', () => {
  for (const e of registry.exporters())
    test(`the built-in ${e.title} export passes every check`, () => {
      assert.deepEqual(failures(e), []);
    });

  test('it tries each export on none, a graph with notes, and a view with its faded context', () => {
    assert.deepEqual(Object.keys(sampleExports()), ['empty', 'small', 'faded']);
  });

  const base = { format: 'x', title: 'X', extension: 'txt', mime: 'text/plain' };
  let n = 0;
  for (const [broken, e, check] of [
    ['an export that gives no text', { ...base, write: () => undefined }, 'it writes text'],
    ['an export that writes differently each time', { ...base, write: () => String(n++) }, 'it writes the same bytes'],
    [
      'an export that changes what it is given',
      { ...base, write: (d) => (d.things.push(['z', [], {}]), '') },
      'it leaves the export',
    ],
    ['an export with no media type', { ...base, mime: '', write: () => '' }, 'it is offered under a title'],
  ])
    test(`${broken} fails the check that holds it`, () => {
      const failed = failures(e).filter((f) => f.startsWith(check));
      assert.equal(failed.length, 1, failures(e).join('\n'));
      assert.match(failed[0], /wanted .+, got /);
    });
});
