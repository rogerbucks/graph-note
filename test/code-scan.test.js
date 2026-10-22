// The code scan on every change (#849). scripts/code-scan.mjs reads the scan's results. It fails on any security
// problem, and names only the kind and the count. The CI job that runs it is checked here too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { securityFindings, tally } from '../scripts/code-scan.mjs';
import { jobs, read, runCommands, usesRefs } from './repository/repo.js';

const sarif = (results, rules) => ({
  runs: [{ tool: { driver: { rules: [] }, extensions: [{ rules }] }, results }],
});
const RULES = [
  { id: 'js/polynomial-redos', properties: { 'security-severity': '7.5' } },
  { id: 'js/unused-local-variable', properties: {} },
];

describe('the code scan on every change', () => {
  test('counts each result whose rule has a security severity, and no other', () => {
    const found = securityFindings(
      sarif(
        [{ ruleId: 'js/polynomial-redos' }, { ruleId: 'js/polynomial-redos' }, { ruleId: 'js/unused-local-variable' }],
        RULES,
      ),
    );
    assert.deepEqual(tally(found), [['js/polynomial-redos', 2]]);
    assert.deepEqual(securityFindings({}), []);
  });

  test('a result suppressed in the code itself is not counted', () => {
    const found = securityFindings(
      sarif([{ ruleId: 'js/polynomial-redos', suppressions: [{ kind: 'inSource' }] }], RULES),
    );
    assert.deepEqual(found, []);
  });

  test('CI runs it on every change, with GitHub’s own scan, sending nothing', () => {
    const job = (jobs(read('.github/workflows/ci.yml'))['code-scan'] ?? []).join('\n');
    assert.deepEqual(
      usesRefs(job).map((r) => r.split('@')[0]),
      ['actions/checkout', 'actions/setup-node', 'github/codeql-action/init', 'github/codeql-action/analyze'],
    );
    assert.match(job, /upload: never/);
    assert.match(job, /output: code-scan\n/);
    assert.doesNotMatch(job, /queries:|config-file:|paths-ignore/, 'the default queries, on all the code');
    assert.deepEqual(runCommands(job), ['node scripts/code-scan.mjs code-scan']);
  });

  test('the log names no file or line, as the repository is public', () => {
    const script = read('scripts/code-scan.mjs');
    assert.doesNotMatch(script, /physicalLocation|artifactLocation|startLine|message\.text/);
  });
});
