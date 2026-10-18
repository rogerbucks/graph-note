// The build status run whole, from the environment a workflow gives: the event read from its file, the two tokens each
// going to its own runner, and the exit code whatever happens to the board. A stand-in `spawn` answers gh as the
// repository or as the project by the token it is started with, so no network is touched. Editor spec §12,
// requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runFromEnv } from '../scripts/build-status-run.mjs';
import { FIXTURE } from './repository/github-project-fixture.js';
import { HEAD, REPO, TOKEN, checksOf, world } from './repository/build-status-world.js';

const WORKFLOW_TOKEN = 'the-workflow-token';

/** A `spawn` that answers gh as the repository or as the project, by the token it is given, and says what it was asked. */
const spawnFor =
  (w, seen = []) =>
  (_cmd, args, options) => {
    const token = options.env.GH_TOKEN;
    seen.push(token);
    const run = token === WORKFLOW_TOKEN ? w.side.run : w.gh.run;
    try {
      return { status: 0, stdout: run(args, options.input), stderr: '' };
    } catch (e) {
      return { status: 1, stdout: '', stderr: e.stderr ?? e.message };
    }
  };
const env = (more = {}) => ({
  GITHUB_EVENT_NAME: 'workflow_run',
  GITHUB_EVENT_PATH: '/event.json',
  GITHUB_REPOSITORY: REPO,
  GITHUB_RUN_ID: '99',
  GH_TOKEN: WORKFLOW_TOKEN,
  PROJECT_TOKEN: TOKEN,
  ...more,
});
const io = (w, out, seen) => ({
  spawn: spawnFor(w, seen),
  read: () => JSON.stringify(checksOf([7], HEAD)),
  write: (t) => out.push(t),
});

describe('the whole run, from the environment a workflow gives', () => {
  test('reads the event from its file, updates the board with the project token and the comment with the workflow’s', async () => {
    const w = world();
    const out = [];
    const seen = [];
    assert.equal(await runFromEnv(env(), io(w, out, seen)), 0);
    assert.equal(w.value('focus_link'), 'In PR');
    assert.ok(w.comments()[0].body.includes('[Run](https://github.com/rogerbucks/thoughtknot/actions/runs/99)'));
    assert.ok(seen.includes(WORKFLOW_TOKEN) && seen.includes(TOKEN));
    assert.equal(
      w.side.hub.calls.filter((c) => c.args.includes('project') || /ProjectV2/i.test(String(c.input))).length,
      0,
      'the repository side never sees the project',
    );
  });

  test('without PROJECT_TOKEN, exits 0 having printed a warning annotation, and the comment says so', async () => {
    const w = world();
    const out = [];
    assert.equal(await runFromEnv(env({ PROJECT_TOKEN: undefined }), io(w, out, [])), 0);
    const warning = out.find((line) => line.startsWith('::warning::'));
    assert.match(warning, /PROJECT_TOKEN is not set/);
    assert.match(w.comments()[0].body, /PROJECT_TOKEN is not set/);
  });

  test('with a token GitHub refuses with 401, exits 0 having printed a warning annotation, and never prints the token', async () => {
    const w = world();
    const out = [];
    const refused = spawnFor(w);
    const spawn = (cmd, args, options) =>
      options.env.GH_TOKEN === TOKEN
        ? { status: 1, stdout: '', stderr: `gh: Bad credentials (HTTP 401) ${TOKEN}` }
        : refused(cmd, args, options);
    assert.equal(await runFromEnv(env(), { ...io(w, out, []), spawn }), 0);
    assert.match(
      out.find((line) => line.startsWith('::warning::')),
      /PROJECT_TOKEN was rejected/,
    );
    assert.ok(!out.join('').includes(TOKEN));
    assert.match(w.comments()[0].body, /PROJECT_TOKEN was rejected/);
  });

  test('reads the issues with the workflow’s token: the project token is only ever used on the project', async () => {
    const w = world();
    const used = [];
    const spawn = (cmd, args, options) => {
      if (options.env.GH_TOKEN === TOKEN) used.push(args.slice(0, 2).join(' '));
      return spawnFor(w)(cmd, args, options);
    };
    assert.equal(await runFromEnv(env(), { ...io(w, [], []), spawn }), 0);
    assert.ok(used.length > 0);
    assert.ok(
      used.every((u) => /^(project |api graphql)/.test(u)),
      used.join(' | '),
    );
  });

  test('exits 1 with an error annotation when the workflow gave no token of its own, or GitHub cannot be read', async () => {
    const w = world();
    const out = [];
    assert.equal(await runFromEnv(env({ GH_TOKEN: '' }), io(w, out, [])), 1);
    assert.match(out.join(''), /^::error::build-status: GH_TOKEN/m);
    delete w.side.hub.pulls[7];
    out.length = 0;
    assert.equal(await runFromEnv(env(), io(w, out, [])), 1);
    assert.match(out.join(''), /^::error::.*Not Found/m);
  });

  test('does nothing for an event it was not made for, and for a repository name that is not owner/name', async () => {
    const w = world();
    const out = [];
    assert.equal(await runFromEnv(env({ GITHUB_EVENT_NAME: 'issues' }), io(w, out, [])), 0);
    assert.equal(w.side.hub.calls.length, 0);
    assert.equal(await runFromEnv(env({ GITHUB_REPOSITORY: 'a b; c' }), io(w, out, [])), 1);
  });

  test('leaves the run address out of the comment when the run id is not a number', async () => {
    const w = world();
    await runFromEnv(env({ GITHUB_RUN_ID: '1; echo' }), io(w, [], []));
    assert.doesNotMatch(w.comments()[0].body, /\[Run\]/);
  });

  test('exits 0 with a warning, not 1, for a requirements file too large to read', async () => {
    const w = world();
    const out = [];
    w.side.hub.files[HEAD] = `${FIXTURE}${'// padding\n'.repeat(400_000)}`;
    assert.equal(await runFromEnv(env(), io(w, out, [])), 0);
    assert.match(out.find((line) => line.startsWith('::warning::')) ?? '', /too large/);
  });
});
