// What keeps the GitHub mirror from reaching the wrong place or going too fast: every call names the repository or the
// owner, the repository gh points at is checked against this checkout's origin before anything is read or done, mutating
// calls are paced and retried once on a secondary rate limit, and a list that hit its cap is refused rather than taken
// for the whole. Run against the in-memory stand-in for gh (test/repository/github-project-fake.js). Editor spec §12,
// requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import {
  ISSUE_CAP,
  LABEL_CAP,
  PAUSE_MS,
  PROJECT_CAP,
  RETRY_MS,
  executePlan,
  pinRepo,
  readRemote,
  repoOfRemote,
} from '../scripts/github-project-gh.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
const REPO = 'rogerbucks/graph-note';

/** A whole apply, recording the pauses it asks for. */
const apply = (gh, run = gh.run) => {
  const sleeps = [];
  const plan = buildPlan(desired, readRemote(run, REPO));
  executePlan(run, REPO, plan, { sleep: (ms) => sleeps.push(ms) });
  return sleeps;
};

describe('every call names where it goes', () => {
  const gh = fakeGithub();
  apply(gh);
  apply(gh);
  const calls = gh.hub.calls.map((c) => c.args);

  test('an issue or label call carries --repo with the pinned repository', () => {
    const these = calls.filter(([group]) => group === 'issue' || group === 'label');
    assert.ok(these.length > 15, `${these.length}`);
    for (const args of these) assert.equal(args[args.indexOf('--repo') + 1], REPO, args.join(' '));
  });

  test('a project call that finds, makes or fills a project carries --owner, the repository’s owner', () => {
    const these = calls.filter(([group, verb]) => group === 'project' && ['list', 'create', 'item-add'].includes(verb));
    assert.ok(these.length >= 3);
    for (const args of these) assert.equal(args[args.indexOf('--owner') + 1], 'rogerbucks', args.join(' '));
  });

  test('every other call is a lookup of the login, GraphQL, or an edit by global id', () => {
    const rest = calls.filter(
      ([group, verb]) => !['issue', 'label'].includes(group) && !(group === 'project' && verb !== 'item-edit'),
    );
    assert.ok(rest.length > 0);
    for (const [group, verb] of rest)
      assert.ok(
        (group === 'api' && ['user', 'graphql'].includes(verb)) || (group === 'project' && verb === 'item-edit'),
        `${group} ${verb}`,
      );
  });

  test('the stand-in refuses a call that names the wrong repository, or none, as gh would reach the wrong place', () => {
    const wrong = fakeGithub();
    assert.throws(() => wrong.run(['issue', 'list', '--repo', 'someone/else']), /wrong one/);
    assert.throws(() => wrong.run(['label', 'list']), /wrong one/);
    assert.throws(() => wrong.run(['project', 'list', '--owner', 'someone']), /wrong one/);
  });
});

describe('the repository gh points at', () => {
  test('is read and must be this checkout’s origin, whatever the case', () => {
    assert.equal(pinRepo(fakeGithub().run, 'rogerbucks/graph-note'), 'rogerbucks/graph-note');
    assert.equal(pinRepo(fakeGithub().run, 'RogerBucks/Graph-Note'), 'rogerbucks/graph-note');
  });

  test('is refused when it is another, naming both, before anything else is asked', () => {
    const gh = fakeGithub({ name: 'other' });
    assert.throws(
      () => pinRepo(gh.run, 'rogerbucks/graph-note'),
      /gh points at rogerbucks\/other.*origin is rogerbucks\/graph-note/s,
    );
    assert.equal(gh.hub.calls.length, 1, 'only the look at the repository was made');
  });

  test('is derived from the origin remote, in each of the ways a remote is written', () => {
    for (const url of [
      'https://github.com/rogerbucks/graph-note.git',
      'https://github.com/rogerbucks/graph-note',
      'https://GitHub.com/rogerbucks/graph-note.git\n',
      'https://github.com:443/rogerbucks/graph-note.git',
    ])
      assert.deepEqual(repoOfRemote(url), { host: 'github.com', repo: 'rogerbucks/graph-note' }, url);
  });

  test('gives the host too, and takes another only when one is handed in', () => {
    const only = { hosts: ['example.com'] };
    for (const url of [
      'https://example.com/rogerbucks/graph-note.git\n',
      'git@example.com:rogerbucks/graph-note.git',
      'ssh://git@example.com/rogerbucks/graph-note.git',
    ])
      assert.deepEqual(repoOfRemote(url, only), { host: 'example.com', repo: 'rogerbucks/graph-note' }, url);
  });

  test('is refused when the host is not github.com, naming the host', () => {
    for (const url of [
      'https://example.com/rogerbucks/graph-note.git',
      'git@example.com:rogerbucks/graph-note.git',
      'ssh://git@example.com/rogerbucks/graph-note.git',
      'https://github.com.example.net/rogerbucks/graph-note.git',
    ])
      assert.throws(() => repoOfRemote(url), /host.*not github\.com/s, url);
    assert.throws(() => repoOfRemote('https://github.com/rogerbucks/graph-note', { hosts: ['example.com'] }), /host/);
  });

  test('is not guessed from a remote that names no repository', () => {
    for (const url of ['', 'not a url', 'https://github.com/only-owner', '/local/path/repo.git'])
      assert.throws(() => repoOfRemote(url), /origin/, url);
  });

  test('is never echoed with its login or token: userinfo shows as ***', () => {
    const userinfo = 'zebra-quokka-17';
    for (const url of [
      `https://someone:${userinfo}@example.com/rogerbucks/graph-note.git`,
      `https://${userinfo}@example.com/rogerbucks/graph-note.git`,
      `ssh://git:${userinfo}@example.com/only-owner`,
      `https://someone:${userinfo}@example.com/`,
      `bad ${userinfo}@example.com`,
    ]) {
      let message = '';
      try {
        repoOfRemote(url);
      } catch (e) {
        message = e.message;
      }
      assert.ok(message, `refused: ${url}`);
      assert.ok(!message.includes(userinfo), message);
      assert.match(message, /\*\*\*@/, message);
    }
    assert.throws(() => repoOfRemote(`https://u:${userinfo}@example.com/o/n.git`), /https:\/\/\*\*\*@example\.com/);
  });
});

describe('the pace of the calls that change something', () => {
  test('is a pause of about a second between them, and none before the first or around reads', () => {
    const gh = fakeGithub();
    const sleeps = apply(gh);
    assert.equal(PAUSE_MS, 1000);
    assert.ok(gh.hub.mutations.length > 20);
    assert.equal(sleeps.length, gh.hub.mutations.length - 1);
    assert.ok(sleeps.every((ms) => ms === PAUSE_MS));
  });

  test('is no pause at all when there is nothing to change', () => {
    const gh = fakeGithub();
    apply(gh);
    assert.deepEqual(apply(gh), []);
  });
});

describe('a secondary rate limit', () => {
  const limited = (gh, times) => {
    let left = times;
    return (args, input) => {
      if (args[0] === 'issue' && args[1] === 'create' && left > 0) {
        left -= 1;
        throw new Error('gh issue create failed: You have exceeded a secondary rate limit. Please wait a few minutes');
      }
      return gh.run(args, input);
    };
  };

  test('is waited out once, and the call tried again', () => {
    const gh = fakeGithub();
    const sleeps = apply(gh, limited(gh, 1));
    assert.equal(RETRY_MS, 60000);
    assert.equal(sleeps.filter((ms) => ms === RETRY_MS).length, 1);
    assert.equal(gh.hub.issues.length, 5, 'and every issue was made, once');
  });

  test('is not waited out twice: a second refusal of the same call stops the run', () => {
    const gh = fakeGithub();
    assert.throws(() => apply(gh, limited(gh, 2)), /secondary rate limit/);
  });

  test('is the only failure that is tried again', () => {
    const gh = fakeGithub();
    const failing = (args, input) => {
      if (args[0] === 'issue' && args[1] === 'create') throw new Error('gh issue create failed: HTTP 500');
      return gh.run(args, input);
    };
    const sleeps = [];
    const plan = buildPlan(desired, readRemote(failing, REPO));
    assert.throws(() => executePlan(failing, REPO, plan, { sleep: (ms) => sleeps.push(ms) }), /HTTP 500/);
    assert.ok(!sleeps.includes(RETRY_MS));
  });
});

describe('a list that others fill', () => {
  test('does not hit the cap of the issues: only the signed-in login’s own are asked for, so issues others file are not in it', () => {
    const gh = fakeGithub();
    gh.hub.issues = Array.from({ length: ISSUE_CAP }, (_, i) => ({
      number: i + 1,
      title: 'spam',
      body: '',
      state: 'OPEN',
      labels: [],
      author: { login: 'a-stranger' },
      url: 'u',
    }));
    assert.deepEqual(readRemote(gh.run, REPO).issues, []);
  });
});

describe('a list that hit its cap', () => {
  test('is refused for labels, issues and projects, which may be only the first part of what GitHub holds', () => {
    assert.deepEqual([LABEL_CAP, ISSUE_CAP, PROJECT_CAP], [1000, 5000, 200]);
    const labels = fakeGithub();
    labels.hub.labels = Array.from({ length: LABEL_CAP }, (_, i) => ({ name: `l${i}` }));
    assert.throws(() => readRemote(labels.run, REPO), /labels.*1000/);
    const issues = fakeGithub();
    issues.hub.issues = Array.from({ length: ISSUE_CAP }, (_, i) => ({
      number: i + 1,
      title: 't',
      body: '',
      state: 'OPEN',
      labels: [],
      author: { login: issues.hub.login },
      url: 'u',
    }));
    assert.throws(() => readRemote(issues.run, REPO), /issues.*5000/);
    const projects = fakeGithub();
    projects.hub.projects = Array.from({ length: PROJECT_CAP }, (_, i) => ({
      number: i + 1,
      title: `p${i}`,
      id: `P${i}`,
    }));
    assert.throws(() => readRemote(projects.run, REPO), /projects.*200/);
  });

  test('is accepted one short of its cap', () => {
    const labels = fakeGithub();
    labels.hub.labels = Array.from({ length: LABEL_CAP - 1 }, (_, i) => ({ name: `l${i}` }));
    assert.equal(readRemote(labels.run, REPO).labelNames.length, LABEL_CAP - 1);
  });
});
