// What CI runs for a change: scripts/ci-plan.mjs. A pull request runs only what its change reaches; main, everything.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SHARDS, ciPlan, docReaders, labelsFrom, summary } from '../scripts/ci-plan.mjs';
import { read } from './repository/repo.js';

const tracked = [
  'packages/core/src/zoom.ts',
  'packages/core/test/zoom.test.js',
  'packages/core/test/links.test.js',
  'python/graph_spec/src/graph_spec/zoom.py',
  'python/graph_spec/tests/test_zoom.py',
  'scripts/plain-docs.mjs',
  'test/plain-docs.test.js',
  'test/conventions.test.js',
  'wiki/Home.md',
  'CONTRIBUTING.md',
  'package.json',
];
const texts = { 'packages/core/test/links.test.js': "read('wiki/Home.md')" };
const pr = (changed, more = {}) =>
  ciPlan({
    event: 'pull_request',
    changed,
    tracked,
    reach: () => [],
    read: (f) => texts[f] ?? '',
    ...more,
  });

describe('ci-plan', () => {
  test('a push, a release and a pull request labelled ci:full run everything', () => {
    for (const [event, labels] of [
      ['push', []],
      ['release', []],
      ['pull_request', ['agent:claude', 'ci:full']],
    ]) {
      const plan = pr(['packages/core/src/zoom.ts'], { event, labels });
      assert.equal(plan.tier, 'full', `${event} ${labels}`);
      assert.equal(plan.shards, SHARDS);
      assert.equal(plan.python, true);
    }
  });

  test('a pull request ready for review runs only what its change reaches too', () => {
    for (const isDraft of [false, undefined]) {
      const plan = pr(['packages/core/src/zoom.ts'], { draft: isDraft, labels: ['agent:claude'] });
      assert.equal(plan.tier, 'subset', `draft=${isDraft}`);
      assert.deepEqual(plan.files, ['packages/core/test/zoom.test.js']);
    }
  });

  test('a pull request runs only the tests its change reaches, on as few machines as they need', () => {
    const plan = pr(['packages/core/src/zoom.ts']);
    assert.equal(plan.tier, 'subset');
    assert.deepEqual(plan.files, ['packages/core/test/zoom.test.js']);
    assert.equal(plan.shards, 1);
  });

  test('a pull request that changes something shared runs everything, and says which file made it so', () => {
    const plan = pr(['packages/core/src/zoom.ts', 'package.json']);
    assert.equal(plan.tier, 'full');
    assert.match(plan.reason, /package\.json is shared/);
  });

  test('a doc runs the repository tests and every test that names it or its folder, not the whole suite', () => {
    const plan = pr(['wiki/Home.md']);
    assert.equal(plan.tier, 'subset');
    assert.deepEqual(plan.files, [
      'packages/core/test/links.test.js',
      'test/conventions.test.js',
      'test/plain-docs.test.js',
    ]);
    assert.equal(plan.python, false, 'nothing the Python tests read changed');
  });

  test('a doc that is gone, or a pull request with no change found, runs everything', () => {
    assert.equal(pr(['docs/Gone.md']).tier, 'full');
    assert.equal(pr([]).tier, 'full');
  });

  test('the Python jobs run for a change to the Python library, the packages or the scripts', () => {
    assert.equal(pr(['python/graph_spec/src/graph_spec/zoom.py']).python, true);
    assert.equal(pr(['packages/core/src/zoom.ts']).python, true);
    assert.equal(pr(['scripts/plain-docs.mjs']).python, true);
  });

  test('a subset with only Python tests needs none of the suite machines', () => {
    const plan = pr(['python/graph_spec/src/graph_spec/zoom.py']);
    assert.equal(plan.tier, 'subset');
    assert.deepEqual(plan.files, []);
    assert.equal(plan.shards, 0);
  });

  test('a big subset is spread over at most the six machines of the whole suite', () => {
    const many = Array.from({ length: 400 }, (_, i) => `packages/core/test/t${i}.test.js`);
    const plan = ciPlan({
      event: 'pull_request',
      changed: many,
      tracked: many,
      reach: () => [],
      read: () => '',
    });
    assert.equal(plan.files.length, 400);
    assert.equal(plan.shards, SHARDS);
  });

  test('a test file whose name the shell would read as more than a name runs everything', () => {
    const odd = ['packages/core/test/a b.test.js', 'packages/core/test/$(x).test.js', 'packages/core/test/*.test.js'];
    for (const f of odd) {
      const plan = ciPlan({
        event: 'pull_request',
        changed: [f],
        tracked: [f],
        reach: () => [],
        read: () => '',
      });
      assert.equal(plan.tier, 'full', f);
    }
  });

  test('the labels come from a JSON list, and anything else is no label', () => {
    assert.deepEqual(labelsFrom('["agent:claude","ci:full"]'), ['agent:claude', 'ci:full']);
    for (const text of [undefined, '', 'null', '{}', 'ci:full']) assert.deepEqual(labelsFrom(text), [], String(text));
  });

  test('docReaders finds the tests by name, and every repository test', () => {
    assert.deepEqual(
      docReaders('wiki/Home.md', tracked, (f) => texts[f] ?? ''),
      ['packages/core/test/links.test.js', 'test/plain-docs.test.js', 'test/conventions.test.js'],
    );
  });

  test('the summary says when a run is partial, and how to get the full one', () => {
    assert.match(summary(pr(['wiki/Home.md'])), /partial run[\s\S]*ci:full[\s\S]*main runs everything/);
    assert.match(summary(pr([])), /everything runs/);
  });

  test('CI runs the plan first, and every job that can skip runs when the plan fails', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /types: \[opened, synchronize, reopened, ready_for_review\]/);
    assert.match(ci, /\n {2}plan:\n/);
    for (const job of ['suite', 'python', 'python-no-engine']) {
      const body = ci.split(`\n  ${job}:\n`)[1].split(/\n {2}[\w-]+:\n/)[0];
      assert.match(body, /needs: plan/, job);
      assert.match(body, /!cancelled\(\)/, `${job} still runs when the plan failed`);
    }
    // a file list is data: it reaches the shell through the environment, never spliced into the command
    assert.doesNotMatch(ci, /run:.*\$\{\{\s*needs\.plan\.outputs\.tests/);
    // the jobs that keep the repository safe never wait on the plan
    for (const job of ['lint', 'tests-first', 'public-readiness']) {
      const body = ci.split(`\n  ${job}:\n`)[1].split(/\n {2}[\w-]+:\n/)[0];
      assert.doesNotMatch(body, /needs:/, job);
    }
  });
});
