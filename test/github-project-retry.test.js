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
import { executePlan, ghRunner, readRemote } from '../scripts/github-project-gh.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
const REPO = 'rogerbucks/thoughtknot';
const DELAYS = [5000, 15000, 45000];
const BAD_GATEWAY = 'gh label create failed: non-200 OK status code: 502 Bad Gateway';
const TIMEOUT = 'gh failed: Post "https://api.github.com/graphql": dial tcp 140.82.113.6:443: i/o timeout';

/** A runner that fails the first `times` calls for which `when(args)` is true, with `message`; `after` says it still went through. */
const flaky = (gh, when, times, message, { after = false, stderr } = {}) => {
  let left = times;
  const state = { failed: 0, calls: 0 };
  const run = (args, input) => {
    if (!when(args, input) || left <= 0) return gh.run(args, input);
    state.calls += 1;
    left -= 1;
    state.failed += 1;
    if (after) gh.run(args, input);
    // like ghRunner's error: gh's own words are kept apart from the command in the message
    throw Object.assign(new Error(message), stderr === undefined ? {} : { stderr });
  };
  return { run, state };
};
const is = (group, verb) => (args) => args[0] === group && args[1] === verb;
/** The list of the issues, read through the REST endpoint. */
const isIssueList = (args) => args[0] === 'api' && /\/issues\?/.test(args[1]);

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
    const { run } = flaky(gh, isIssueList, 1, 'gh api failed: HTTP 502: Bad Gateway');
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
    const makesProject = (args, input) => args[1] === 'graphql' && /createProjectV2\(/.test(input);
    const b = flaky({ run: a.run }, makesProject, 1, TIMEOUT, { after: true });
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

  test('a new project field, which a second try could make twice, stops the run', () => {
    const gh = fakeGithub();
    const { run, state } = flaky(gh, (_, input) => /createProjectV2Field/.test(input ?? ''), 1, TIMEOUT);
    const sleeps = [];
    const plan = buildPlan(desired, readRemote(run, REPO));
    assert.throws(() => executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /i\/o timeout/);
    assert.equal(state.calls, 1, 'tried once');
    assert.ok(!sleeps.some((ms) => DELAYS.includes(ms)));
  });
});

describe('only gh’s own words say a failure is transient', () => {
  test('a call that names 503 in its arguments but fails with a 404 is not tried again', () => {
    const gh = fakeGithub();
    apply(gh);
    const next = structuredClone(desired);
    next.issues[0].state = next.issues[0].state === 'closed' ? 'open' : 'closed';
    const stderr = 'GraphQL: Could not resolve to an Issue with that number. (HTTP 404)';
    const { run, state } = flaky(
      gh,
      (a) => a[0] === 'issue' && ['close', 'reopen'].includes(a[1]),
      1,
      `gh issue close 503 --reason completed failed: ${stderr}`,
      { stderr },
    );
    const sleeps = [];
    const plan = buildPlan(next, readRemote(run, REPO));
    assert.equal(plan.issues.close.length + plan.issues.reopen.length, 1, 'one issue to close or reopen');
    assert.throws(() => executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /HTTP 404/);
    assert.equal(state.calls, 1);
    assert.ok(!sleeps.some((ms) => DELAYS.includes(ms)));
  });

  test('the real runner keeps gh’s stderr apart on its error', () => {
    const run = ghRunner(() => ({ status: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway\n' }));
    assert.throws(
      () => run(['issue', 'close', '7']),
      (e) => e.stderr === 'HTTP 502: Bad Gateway' && /gh issue close 7 failed/.test(e.message),
    );
  });

  test('a title with “timeout” in it does not make a refusal transient', () => {
    const gh = fakeGithub();
    const stderr = 'HTTP 422: Validation Failed';
    const { run, state } = flaky(
      gh,
      is('issue', 'create'),
      1,
      `gh issue create --title Viewing · timeout failed: ${stderr}`,
      { stderr },
    );
    const sleeps = [];
    const plan = buildPlan(desired, readRemote(run, REPO));
    assert.throws(() => executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /HTTP 422/);
    assert.equal(state.calls, 1);
    assert.ok(!sleeps.some((ms) => DELAYS.includes(ms)));
  });

  test('“context deadline exceeded” and “timed out waiting” are transient', () => {
    for (const stderr of [
      'Get "https://api.github.com/user": context deadline exceeded',
      'timed out waiting for the server',
    ]) {
      const gh = fakeGithub();
      const { run } = flaky(gh, is('label', 'create'), 1, `gh label create failed: ${stderr}`, { stderr });
      assert.deepEqual(apply(gh, run), [5000], stderr);
    }
  });
});

describe('looking again before a create is tried again', () => {
  const planted = (gh, login) => {
    let done = false;
    return (args, input) => {
      if (is('issue', 'create')(args) && !done) {
        done = true;
        gh.hub.issues.push({
          number: gh.hub.issues.length + 1,
          title: args[args.indexOf('--title') + 1],
          body: input,
          state: 'OPEN',
          labels: [],
          author: { login },
          url: `https://github.com/o/r/issues/${gh.hub.issues.length + 1}`,
        });
        throw Object.assign(new Error(`gh issue create failed: ${TIMEOUT}`), { stderr: TIMEOUT });
      }
      return gh.run(args, input);
    };
  };

  test('never takes up somebody else’s issue with the same title and body', () => {
    const gh = fakeGithub();
    apply(gh, planted(gh, 'stranger'));
    const first = gh.hub.issues[0];
    const same = gh.hub.issues.filter((i) => idOfBody(i.body) === idOfBody(first.body));
    assert.equal(same.length, 2, 'the stranger’s issue stays, and our own is made');
    assert.deepEqual(same.map((i) => i.author.login).sort(), ['rogerbucks', 'stranger']);
  });

  test('does take up an issue of the signed-in login', () => {
    const gh = fakeGithub();
    apply(gh, planted(gh, 'rogerbucks'));
    assert.equal(gh.hub.issues.length, 5);
  });

  test('stops, and never creates again, when the look itself keeps failing', () => {
    const gh = fakeGithub();
    let armed = false;
    let creates = 0;
    const run = (args, input) => {
      if (is('issue', 'create')(args)) {
        creates += 1;
        if (!armed) {
          armed = true;
          gh.run(args, input);
          throw Object.assign(new Error(`gh issue create failed: ${TIMEOUT}`), { stderr: TIMEOUT });
        }
      }
      if (armed && isIssueList(args)) throw Object.assign(new Error(`gh api failed: ${TIMEOUT}`), { stderr: TIMEOUT });
      return gh.run(args, input);
    };
    const plan = buildPlan(desired, readRemote(run, REPO));
    assert.throws(() => executePlan(run, REPO, plan, { sleep: () => {} }), /i\/o timeout/);
    assert.equal(creates, 1, 'the create was not made again');
    assert.equal(gh.hub.issues.length, 1);
  });
});
