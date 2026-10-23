// Every job of every workflow has a time limit (spec §13 ci_jobs_time_limited, risk OPS-4). Without one, a hung step
// holds a runner for GitHub's six hours. Read as text, by indentation, as policy.test.js reads the workflows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { jobs, read, stripComment, workflowFiles } from './repository/repo.js';

describe('GitHub Actions', () => {
  // Risk OPS-4: a hung step holds a runner for GitHub's six hours, and a stuck nightly holds its concurrency group.
  // A job that calls another workflow can set none: GitHub takes the called workflow's jobs' limits, checked here too.
  test('every job of every workflow has a time limit', () => {
    for (const f of workflowFiles()) {
      for (const [name, lines] of Object.entries(jobs(read(f)))) {
        const called = lines.map(stripComment).find((l) => /^ {4}uses: \.\/\.github\/workflows\/\S+\.yml$/.test(l));
        if (called) {
          assert.ok(
            workflowFiles().some((w) => called.trim().endsWith(w.replace(/^.*\.github/, '.github'))),
            `${f}: ${name}`,
          );
          continue;
        }
        const limit = lines.map(stripComment).find((l) => /^ {4}timeout-minutes:/.test(l));
        assert.ok(limit, `${f}: job ${name} sets timeout-minutes`);
        assert.match(limit, /^ {4}timeout-minutes: [1-9]\d*\s*$/, `${f}: job ${name} sets a whole number of minutes`);
      }
    }
  });
});
