// A transient GitHub failure (a network timeout, a reset connection, a 502, 503 or 504, "Bad Gateway", "something went
// wrong") is tried again, after 5, 15 and 45 seconds, rather than stopping the run. Reads are always tried again; a
// mutation is tried again only where that cannot do it twice: an issue, label or project create first re-reads what
// GitHub holds and does not repeat a create that went through. Run against the in-memory stand-in for gh with an
// injected sleep, so no time passes and no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { BANNER_START, desiredState, idOfBody, markerOf } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, readRemote } from '../scripts/github-project-gh.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
const REPO = 'rogerbucks/graph-note';
const DELAYS = [5000, 15000, 45000];
const BAD_GATEWAY = 'gh label create failed: non-200 OK status code: 502 Bad Gateway';
const TIMEOUT = 'gh failed: Post "https://api.github.com/graphql": dial tcp 140.82.113.6:443: i/o timeout';

/** A runner that fails the first `times` calls for which `when(args)` is true, with `message`; `after` says it still went through. */
const flaky = (gh, when, times, message, { after = false } = {}) => {
  let left = times;
  const state = { failed: 0, calls: 0 };
  const run = (args, input) => {
    if (!when(args) || left <= 0) return gh.run(args, input);
    state.calls += 1;
    left -= 1;
    state.failed += 1;
    if (after) gh.run(args, input);
    throw new Error(message);
  };
  return { run, state };
};
const is = (group, verb) => (args) => args[0] === group && args[1] === verb;

/** A whole apply with the retry delays recorded apart from the pauses between calls. */
const apply = (gh, run = gh.run) => {
  const sleeps = [];
  const plan = buildPlan(desired, readRemote(run, REPO));
  executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) });
  return sleeps.filter((ms) => ms !== 1000);
};

describe('a 502 from GitHub', () => {
  test('is waited out 5 seconds on a mutation, and the call tried again, so the run finishes', () => {
    const gh = fakeGithub();
    const { run, state } = flaky(gh, is('label', 'create'), 1, BAD_GATEWAY);
    assert.deepEqual(apply(gh, run), [5000]);
    assert.equal(state.failed, 1);
    assert.equal(gh.hub.labels.length, 8, 'every label was made');
    assert.equal(gh.hub.issues.length, 5);
  });

  test('is waited out on a read too, so a check or apply is not stopped by it', () => {
    const gh = fakeGithub();
    const sleeps = [];
    const { run } = flaky(gh, is('issue', 'list'), 1, 'gh issue list failed: HTTP 502: Bad Gateway');
    let out = '';
    mirror(
      { desired, mode: 'check' },
      { run, originRepo: REPO, write: (t) => (out += t), sleep: (ms) => sleeps.push(ms) },
    );
    assert.deepEqual(sleeps, [5000]);
    assert.match(out, /target repository/);
  });

  test('503, 504, "something went wrong" and a reset connection are tried again as well', () => {
    for (const message of [
      'gh failed: HTTP 503 Service Unavailable',
      'gh failed: HTTP 504 Gateway Timeout',
      'gh failed: Something went wrong while executing your query',
      'gh failed: read tcp 10.0.0.2:51234->140.82.113.6:443: read: connection reset by peer',
    ]) {
      const gh = fakeGithub();
      const { run } = flaky(gh, is('label', 'create'), 1, message);
      assert.deepEqual(apply(gh, run), [5000], message);
    }
  });
});

describe('a network timeout', () => {
  test('is waited out, and the call tried again', () => {
    const gh = fakeGithub();
    apply(gh);
    const [first] = gh.hub.issues;
    first.state = 'OPEN';
    const next = structuredClone(desired);
    next.issues.find((i) => idOfBody(i.body) === idOfBody(first.body)).state = 'closed';
    const { run } = flaky(gh, is('issue', 'close'), 1, TIMEOUT);
    const sleeps = [];
    executePlan(run, REPO, buildPlan(next, readRemote(run, REPO)), { sleep: (ms) => sleeps.push(ms) });
    assert.deepEqual(
      sleeps.filter((ms) => ms !== 1000),
      [5000],
    );
    assert.equal(first.state, 'CLOSED');
  });
});

describe('failures that keep coming', () => {
  test('stop a mutation after three waits of 5, 15 and 45 seconds, on the fourth failure', () => {
    const gh = fakeGithub();
    const sleeps = [];
    const { run, state } = flaky(gh, is('label', 'create'), 99, BAD_GATEWAY);
    const plan = buildPlan(desired, readRemote(run, REPO));
    assert.throws(() => executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /502 Bad Gateway/);
    assert.deepEqual(sleeps, DELAYS);
    assert.equal(state.calls, 4, 'the call and three more tries, no more');
  });

  test('stop a read the same way', () => {
    const gh = fakeGithub();
    const sleeps = [];
    const { run, state } = flaky(gh, is('label', 'list'), 99, TIMEOUT);
    assert.throws(
      () =>
        mirror({ desired, mode: 'check' }, { run, originRepo: REPO, write: () => {}, sleep: (ms) => sleeps.push(ms) }),
      /i\/o timeout/,
    );
    assert.deepEqual(sleeps, DELAYS);
    assert.equal(state.calls, 4);
  });

  test('are counted for each call: a later call has its own three tries', () => {
    const gh = fakeGithub();
    const { run, state } = flaky(gh, is('label', 'create'), 3, BAD_GATEWAY);
    assert.deepEqual(apply(gh, run), DELAYS);
    assert.equal(state.failed, 3);
  });
});

describe('a create that timed out but went through', () => {
  test('is not made twice: the issue is found again and used', () => {
    const gh = fakeGithub();
    const { run, state } = flaky(gh, is('issue', 'create'), 1, TIMEOUT, { after: true });
    apply(gh, run);
    assert.equal(state.failed, 1);
    assert.equal(gh.hub.issues.length, 5, 'five requirements, five issues');
    const ids = gh.hub.issues.map((i) => idOfBody(i.body));
    assert.equal(new Set(ids).size, 5);
    assert.equal(gh.hub.projects[0].items.length, 5, 'and all five are in the project');
  });

  test('is made again when it did not go through', () => {
    const gh = fakeGithub();
    const { run } = flaky(gh, is('issue', 'create'), 1, BAD_GATEWAY);
    apply(gh, run);
    assert.equal(gh.hub.issues.length, 5);
    assert.equal(gh.hub.mutations.filter((m) => m.startsWith('issue create')).length, 5);
  });

  test('is the same for a label and a project: neither is made twice', () => {
    const gh = fakeGithub();
    const a = flaky(gh, is('label', 'create'), 1, TIMEOUT, { after: true });
    const b = flaky({ run: a.run }, is('project', 'create'), 1, TIMEOUT, { after: true });
    apply(gh, b.run);
    assert.equal(gh.hub.labels.length, 8);
    assert.equal(gh.hub.projects.length, 1);
    assert.equal(gh.hub.projects[0].items.length, 5);
  });

  test('then a second apply finds nothing left to do', () => {
    const gh = fakeGithub();
    const { run } = flaky(gh, is('issue', 'create'), 1, TIMEOUT, { after: true });
    apply(gh, run);
    gh.hub.mutations.length = 0;
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
  });
});

describe('what is not tried again', () => {
  test('a comment, which a second try could post twice, stops the run as before', () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.issues.push({
      number: 70,
      title: 'Viewing · old one',
      body: `an old rule\n\n${BANNER_START} old.\n\n${markerOf('old_one')}\n`,
      state: 'OPEN',
      labels: [],
      author: { login: 'rogerbucks' },
      url: 'https://github.com/o/r/issues/70',
    });
    const { run, state } = flaky(gh, is('issue', 'comment'), 1, TIMEOUT, { after: true });
    const sleeps = [];
    const plan = buildPlan(desired, readRemote(run, REPO));
    assert.equal(plan.issues.removed.length, 1);
    assert.throws(() => executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /i\/o timeout/);
    assert.equal(state.failed, 1);
    assert.equal(gh.hub.issues.find((i) => i.number === 70).comments.length, 1);
  });

  test('a failure that is not transient still stops at once', () => {
    const gh = fakeGithub();
    const { run, state } = flaky(gh, is('label', 'create'), 1, 'gh label create failed: HTTP 403: forbidden');
    const sleeps = [];
    const plan = buildPlan(desired, readRemote(run, REPO));
    assert.throws(() => executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /HTTP 403/);
    assert.equal(state.calls, 1);
    assert.ok(!sleeps.some((ms) => DELAYS.includes(ms)));
  });
});
