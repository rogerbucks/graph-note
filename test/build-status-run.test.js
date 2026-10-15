// The build status of each requirement, event by event: a pull request opened, its checks failing and passing, its merge,
// a release, and every way the project token can be missing or refused. Each case runs the whole of scripts/build-status-
// run.mjs against in-memory stand-ins for gh, so no network is touched and no code of a pull request is run. Editor spec
// §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleEvent, runFromEnv } from '../scripts/build-status-run.mjs';
import { FIXTURE } from './repository/github-project-fixture.js';
import { fakeRepoSide, mirroredProject, pull } from './repository/build-status-fake.js';

const REPO = 'rogerbucks/graph-note';
const RUN = 'https://github.com/rogerbucks/graph-note/actions/runs/99';
const HEAD = 'a'.repeat(40);
const MERGE = 'c'.repeat(40);
const PARENT = 'd'.repeat(40);
const TOKEN = `ghp_FakeTokenForTest1234`;
const PLANNED =
  "(test_later:Test {proves: 'a planned proof', file: 'test/later.test.js', where: 'repo', status: 'planned'})";
const HEAD_TEXT = FIXTURE.replace(PLANNED, PLANNED.replace("'planned'", "'written'"));
const MOVED = ['focus_link', 'focus_neighbours'];
const noSleep = () => {};

/** A repository with pull request 7 open, main as FIXTURE, the pull request’s head writing one more test, the project mirrored. */
function world({ token = TOKEN } = {}) {
  const side = fakeRepoSide();
  const gh = mirroredProject();
  side.hub.pulls[7] = pull(7, { head: HEAD });
  side.hub.files.main = FIXTURE;
  side.hub.files[HEAD] = HEAD_TEXT;
  side.hub.runs[HEAD] = [{ name: 'test', status: 'in_progress', conclusion: null }];
  const annotations = [];
  const deps = {
    github: side.run,
    project: token ? gh.run : null,
    projectToken: token,
    annotate: (level, text) => annotations.push([level, text]),
    write: () => {},
    sleep: noSleep,
  };
  const send = (eventName, payload) => handleEvent({ eventName, payload, repo: REPO, runUrl: RUN }, deps);
  const trigger = () =>
    send('workflow_run', { workflow_run: { event: 'pull_request', head_sha: HEAD, pull_requests: [{ number: 7 }] } });
  const value = (id) => {
    const [project] = gh.hub.projects;
    const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
    return project.items.find((i) => i.number === issue.number).values['Build status'];
  };
  const values = () =>
    Object.fromEntries(['focus_link', 'focus_neighbours', 'zoom_out_to_fit', 'stray_new'].map((id) => [id, value(id)]));
  const comments = () => side.hub.comments[7] ?? [];
  return { side, gh, deps, annotations, send, trigger, value, values, comments };
}

describe('a pull request that is opened', () => {
  test('puts the requirements it newly proves In PR on the board, and no others', async () => {
    const w = world();
    const result = await w.trigger();
    assert.deepEqual(w.values(), {
      focus_link: 'In PR',
      focus_neighbours: 'In PR',
      zoom_out_to_fit: 'Not started',
      stray_new: 'Not started',
    });
    assert.deepEqual(
      result.pulls.map((p) => [p.number, p.stage, p.ids]),
      [[7, 'In PR', MOVED]],
    );
    assert.deepEqual(w.annotations, []);
  });

  test('leaves one short comment with a link to each item’s issue, the board and the run', async () => {
    const w = world();
    await w.trigger();
    assert.equal(w.comments().length, 1);
    const [{ body }] = w.comments();
    assert.ok(body.startsWith('<!-- build-status -->'));
    assert.match(body, /Build status: In PR/);
    for (const id of MOVED)
      assert.match(body, new RegExp(`\`${id}\` \\(\\[#\\d+\\]\\(https://github\\.com/${REPO}/issues/\\d+\\)\\)`));
    assert.match(body, /\[Board\]\(https:\/\/github\.com\/users\/rogerbucks\/projects\/1\)/);
    assert.ok(body.includes(`[Run](${RUN})`));
    assert.ok(body.split('\n').length <= 10);
  });

  test('compares the head of the pull request with its base branch, both read through the API', async () => {
    const w = world();
    await w.trigger();
    const refs = w.side.hub.calls
      .filter((c) => c.args[1].includes('/contents/'))
      .map((c) => c.args[c.args.indexOf('-f') + 1]);
    assert.deepEqual(refs.sort(), [`ref=${HEAD}`, 'ref=main']);
  });

  test('moves with the checks: failing, then passing, each time in the one comment', async () => {
    const w = world();
    await w.trigger();
    w.side.hub.runs[HEAD] = [{ name: 'test', status: 'completed', conclusion: 'failure' }];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks failing');
    assert.match(w.comments()[0].body, /Build status: Checks failing/);
    w.side.hub.runs[HEAD] = [{ name: 'test', status: 'completed', conclusion: 'success' }];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks passing');
    assert.equal(w.comments().length, 1, 'one comment, updated, never piled up');
    assert.match(w.comments()[0].body, /Build status: Checks passing/);
  });

  test('changes nothing, and writes nothing, when an event says what the board already says', async () => {
    const w = world();
    await w.trigger();
    w.gh.hub.mutations.length = 0;
    w.side.hub.mutations.length = 0;
    await w.trigger();
    assert.deepEqual(w.gh.hub.mutations, []);
    assert.deepEqual(w.side.hub.mutations, []);
  });

  test('finds its pull request from the head commit when the event names none', async () => {
    const w = world();
    w.side.hub.forSha[HEAD] = [7];
    await w.send('workflow_run', { workflow_run: { event: 'pull_request', head_sha: HEAD, pull_requests: [] } });
    assert.equal(w.value('focus_link'), 'In PR');
  });

  test('says nothing of the pull request’s own words: its title and description never reach the comment', async () => {
    const w = world();
    Object.assign(w.side.hub.pulls[7], {
      title: 'hello @everyone ${{ secrets.X }}',
      body: 'ping @someone',
      user: { login: 'evil' },
    });
    await w.trigger();
    assert.doesNotMatch(w.comments()[0].body, /everyone|someone|secrets|evil/);
  });

  test('leaves no comment when it moves no requirement, and corrects one it left before', async () => {
    const w = world();
    w.side.hub.files[HEAD] = FIXTURE;
    await w.trigger();
    assert.deepEqual(w.comments(), []);
    w.side.hub.files[HEAD] = HEAD_TEXT;
    await w.trigger();
    w.side.hub.files[HEAD] = FIXTURE;
    await w.trigger();
    assert.equal(w.comments().length, 1);
    assert.match(w.comments()[0].body, /No requirement moves with this pull request/);
  });

  test('names a requirement that has no item on the board yet, and goes on with the others', async () => {
    const w = world();
    const newer = "(brand_new:Requirement {section: '3', slice: 3, level: 'must', rule: 'Something new.'}),";
    const proof = '(brand_new)-[:PROVED_BY]->(test_later),';
    w.side.hub.files[HEAD] = HEAD_TEXT.replace('// ── Tests ──', `${newer}\n// ── Tests ──`).replace(
      '// ── Links ──',
      `// ── Links ──\n${proof}`,
    );
    await w.trigger();
    assert.match(w.comments()[0].body, /`brand_new` \(not on the board yet\)/);
    assert.equal(w.value('focus_link'), 'In PR');
  });

  test('says in the comment when the requirements file of the pull request cannot be read, and moves nothing', async () => {
    const w = world();
    w.side.hub.files[HEAD] = 'this is not a graph (((';
    await w.trigger();
    assert.deepEqual(w.values(), {
      focus_link: 'Not started',
      focus_neighbours: 'Not started',
      zoom_out_to_fit: 'Not started',
      stray_new: 'Not started',
    });
    assert.match(w.comments()[0].body, /could not be read/);
    assert.equal(w.annotations.length, 1);
    assert.equal(w.annotations[0][0], 'warning');
  });
});

describe('a pull request that is closed or merged', () => {
  test('is Merged on the board after a push to main, read from the merge commit and the commit before it', async () => {
    const w = world();
    await w.trigger();
    Object.assign(w.side.hub.pulls[7], { state: 'closed', merged: true, merge_commit_sha: MERGE });
    w.side.hub.files[MERGE] = HEAD_TEXT;
    w.side.hub.files[PARENT] = FIXTURE;
    w.side.hub.parents[MERGE] = PARENT;
    w.side.hub.forSha[MERGE] = [7];
    await w.send('push', { after: MERGE });
    assert.deepEqual(w.values(), {
      focus_link: 'Merged',
      focus_neighbours: 'Merged',
      zoom_out_to_fit: 'Not started',
      stray_new: 'Not started',
    });
    assert.match(w.comments()[0].body, /Build status: Merged/);
    assert.equal(w.comments().length, 1);
  });

  test('stays Merged when a late event of the checks arrives afterwards', async () => {
    const w = world();
    Object.assign(w.side.hub.pulls[7], { state: 'closed', merged: true, merge_commit_sha: MERGE });
    Object.assign(w.side.hub, { parents: { [MERGE]: PARENT } });
    w.side.hub.files[MERGE] = HEAD_TEXT;
    w.side.hub.files[PARENT] = FIXTURE;
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Merged');
    w.side.hub.runs[HEAD] = [{ name: 'test', status: 'completed', conclusion: 'failure' }];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Merged');
  });

  test('never takes a Released item back to Merged', async () => {
    const w = world();
    Object.assign(w.side.hub.pulls[7], { state: 'closed', merged: true, merge_commit_sha: MERGE });
    w.side.hub.parents[MERGE] = PARENT;
    w.side.hub.files[MERGE] = HEAD_TEXT;
    w.side.hub.files[PARENT] = FIXTURE;
    await w.trigger();
    const [project] = w.gh.hub.projects;
    for (const item of project.items) item.values['Build status'] = 'Released';
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Released');
  });

  test('puts back to Not started the items of a pull request closed without merging', async () => {
    const w = world();
    await w.trigger();
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Not started');
    assert.match(w.comments()[0].body, /Build status: Not started/);
  });

  test('leaves an item another change already merged when a pull request closes unmerged', async () => {
    const w = world();
    const [project] = w.gh.hub.projects;
    for (const item of project.items) item.values['Build status'] = 'Merged';
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Merged');
  });

  test('is ignored when it is the check of a push, not of a pull request', async () => {
    const w = world();
    const result = await w.send('workflow_run', { workflow_run: { event: 'push', head_sha: HEAD, pull_requests: [] } });
    assert.deepEqual(result.pulls, []);
    assert.equal(w.side.hub.calls.length, 0);
  });
});

describe('a release', () => {
  const release = (w) => {
    w.side.hub.releases = [
      { tag_name: 'v0.4.0', draft: false, published_at: '2026-10-01T10:00:00Z' },
      { tag_name: 'v0.5.0', draft: false, published_at: '2026-10-14T10:00:00Z' },
    ];
    w.side.hub.files['v0.4.0'] = FIXTURE;
    w.side.hub.files['v0.5.0'] = HEAD_TEXT;
  };

  test('puts Released on the requirements whose tests were newly written since the release before it', async () => {
    const w = world();
    release(w);
    const result = await w.send('release', { release: { tag_name: 'v0.5.0' } });
    assert.equal(w.value('focus_link'), 'Released');
    assert.equal(w.value('focus_neighbours'), 'Released');
    assert.equal(w.value('zoom_out_to_fit'), 'Not started');
    assert.deepEqual(result.release, { tag: 'v0.5.0', since: 'v0.4.0', ids: MOVED });
  });

  test('writes no comment, as a release has no pull request', async () => {
    const w = world();
    release(w);
    await w.send('release', { release: { tag_name: 'v0.5.0' } });
    assert.deepEqual(w.side.hub.mutations, []);
  });

  test('takes every proved requirement for the first release, which has none before it', async () => {
    const w = world();
    release(w);
    w.side.hub.releases = [{ tag_name: 'v0.5.0', draft: false, published_at: '2026-10-14T10:00:00Z' }];
    const result = await w.send('release', { release: { tag_name: 'v0.5.0' } });
    assert.equal(result.release.since, null);
    assert.equal(w.value('zoom_out_to_fit'), 'Released');
  });

  test('refuses a tag name that is not plainly a tag', async () => {
    const w = world();
    await assert.rejects(() => w.send('release', { release: { tag_name: 'v1; echo hi' } }), /tag/);
  });
});

describe('the project token', () => {
  test('missing: warns in the run and in the comment, updates no board, and does not fail', async () => {
    const w = world({ token: '' });
    const callsBefore = w.gh.hub.calls.length;
    const result = await w.trigger();
    assert.equal(w.annotations.length, 1);
    assert.equal(w.annotations[0][0], 'warning');
    assert.match(w.annotations[0][1], /PROJECT_TOKEN is not set/);
    assert.match(w.comments()[0].body, /PROJECT_TOKEN is not set/);
    assert.equal(w.gh.hub.calls.length, callsBefore, 'the project is not called at all');
    assert.equal(w.value('focus_link'), 'Not started');
    assert.deepEqual(
      result.problems.map((p) => p.kind),
      ['missing'],
    );
  });

  test('missing: still says which requirements the pull request moves, and warns once for two pull requests', async () => {
    const w = world({ token: '' });
    w.side.hub.pulls[8] = pull(8, { head: 'e'.repeat(40) });
    w.side.hub.files['e'.repeat(40)] = HEAD_TEXT;
    w.side.hub.runs['e'.repeat(40)] = [];
    await w.send('workflow_run', {
      workflow_run: { event: 'pull_request', head_sha: HEAD, pull_requests: [{ number: 7 }, { number: 8 }] },
    });
    assert.equal(w.annotations.length, 1);
    for (const n of [7, 8]) assert.match(w.side.hub.comments[n][0].body, /`focus_link`/);
  });

  describe('expired or rejected, answered 401', () => {
    const rejecting = (w) => {
      const real = w.gh.run;
      w.deps.project = (args, input) => {
        w.rejected = (w.rejected ?? 0) + 1;
        throw Object.assign(new Error(`gh ${args.join(' ')} failed: gh: Bad credentials (HTTP 401) ${TOKEN}`), {
          stderr: `gh: Bad credentials (HTTP 401) ${TOKEN}`,
        });
      };
      return real;
    };

    test('warns that it was rejected, in the run and in the comment, and does not fail', async () => {
      const w = world();
      rejecting(w);
      const result = await w.trigger();
      assert.equal(w.annotations.length, 1);
      assert.equal(w.annotations[0][0], 'warning');
      assert.match(w.annotations[0][1], /PROJECT_TOKEN was rejected/);
      assert.match(w.annotations[0][1], /expired/);
      assert.match(w.comments()[0].body, /PROJECT_TOKEN was rejected/);
      assert.deepEqual(
        result.problems.map((p) => p.kind),
        ['rejected'],
      );
      assert.equal(w.value('focus_link'), 'Not started');
    });

    test('never repeats the token in the run, the comment or the result', async () => {
      const w = world();
      rejecting(w);
      const result = await w.trigger();
      const everything = JSON.stringify([w.annotations, w.comments(), result]);
      assert.ok(!everything.includes(TOKEN));
      assert.doesNotMatch(everything, /ghp_/);
    });

    test('is the same when the first calls go through and a later one is refused', async () => {
      const w = world();
      let writes = 0;
      const real = w.gh.run;
      w.deps.project = (args, input) => {
        if (args[0] === 'project' && args[1] === 'item-edit' && (writes += 1))
          throw Object.assign(new Error('failed: HTTP 401'), { stderr: 'HTTP 401: Bad credentials' });
        return real(args, input);
      };
      const result = await w.trigger();
      assert.equal(writes, 1, 'it stops writing at the first refusal');
      assert.deepEqual(
        result.problems.map((p) => p.kind),
        ['rejected'],
      );
      assert.match(w.comments()[0].body, /PROJECT_TOKEN was rejected/);
    });
  });

  test('refused for another reason, such as a missing scope: warns with GitHub’s words, and does not fail', async () => {
    const w = world();
    w.deps.project = () => {
      throw Object.assign(new Error('failed'), { stderr: 'Resource not accessible by personal access token' });
    };
    const result = await w.trigger();
    assert.deepEqual(
      result.problems.map((p) => p.kind),
      ['failed'],
    );
    assert.match(w.annotations[0][1], /Resource not accessible/);
  });

  test('is not asked for when a pull request moves nothing', async () => {
    const w = world({ token: '' });
    w.side.hub.files[HEAD] = FIXTURE;
    const result = await w.trigger();
    assert.deepEqual(w.annotations, []);
    assert.deepEqual(result.problems, []);
  });
});

describe('the whole run, from the environment a workflow gives', () => {
  /** A `spawn` that answers gh as the repository or as the project, by the token it is given, and says what it was asked. */
  const spawnFor =
    (w, seen = []) =>
    (_cmd, args, options) => {
      const token = options.env.GH_TOKEN;
      seen.push(token);
      const run = token === 'the-workflow-token' ? w.side.run : w.gh.run;
      try {
        return { status: 0, stdout: run(args, options.input), stderr: '' };
      } catch (e) {
        return { status: 1, stdout: '', stderr: e.stderr ?? e.message };
      }
    };
  const event = { workflow_run: { event: 'pull_request', head_sha: HEAD, pull_requests: [{ number: 7 }] } };
  const env = (more = {}) => ({
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_EVENT_PATH: '/event.json',
    GITHUB_REPOSITORY: REPO,
    GITHUB_RUN_ID: '99',
    GH_TOKEN: 'the-workflow-token',
    PROJECT_TOKEN: TOKEN,
    ...more,
  });
  const io = (w, out, seen) => ({
    spawn: spawnFor(w, seen),
    read: () => JSON.stringify(event),
    write: (t) => out.push(t),
  });

  test('reads the event from its file, updates the board with the project token and the comment with the workflow’s', async () => {
    const w = world();
    const out = [];
    const seen = [];
    assert.equal(await runFromEnv(env(), io(w, out, seen)), 0);
    assert.equal(w.value('focus_link'), 'In PR');
    assert.ok(w.comments()[0].body.includes(`[Run](${RUN})`));
    assert.ok(seen.includes('the-workflow-token') && seen.includes(TOKEN));
    assert.equal(
      w.side.hub.calls.filter((c) => c.args.includes('item-edit')).length,
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
});

describe('the workflow’s own token', () => {
  test('failing to leave the comment, as on a conversation that is locked, warns and still updates the board', async () => {
    const w = world();
    w.side.hub.failComments = 'HTTP 403: Unable to create comment because issue is locked.';
    const result = await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR');
    assert.equal(w.annotations.length, 1);
    assert.match(w.annotations[0][1], /comment on #7/);
    assert.match(w.annotations[0][1], /locked/);
    assert.deepEqual(
      result.pulls.map((p) => p.comment),
      ['failed'],
    );
  });

  test('failing to read the pull request is an error, so a mistake in the workflow is seen', async () => {
    const w = world();
    delete w.side.hub.pulls[7];
    await assert.rejects(() => w.trigger(), /Not Found/);
  });
});
