// The build status of each requirement, event by event: a pull request opened, its checks failing and passing, its merge,
// a release, the pull requests it leaves alone, and every way the project token can be missing or refused. Each case runs
// the whole of scripts/build-status-run.mjs against in-memory stand-ins for gh, so no network is touched and no code of a
// pull request is run. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE } from './repository/github-project-fixture.js';
import { pull } from './repository/build-status-fake.js';
import { HEAD, HEAD_TEXT, MERGE, MOVED, PARENT, TOKEN, checksOf, ci, world } from './repository/build-status-world.js';

const NOTHING = {
  focus_link: 'Not started',
  focus_neighbours: 'Not started',
  zoom_out_to_fit: 'Not started',
  stray_new: 'Not started',
};
const other = (status, conclusion = null) => ({
  name: 'CodeQL',
  path: '.github/workflows/codeql.yml',
  run_number: 4,
  status,
  conclusion,
});

describe('a pull request that is opened', () => {
  test('puts the requirements it newly proves In PR on the board, and no others', async () => {
    const w = world();
    const result = await w.trigger();
    assert.deepEqual(w.values(), { ...NOTHING, focus_link: 'In PR', focus_neighbours: 'In PR' });
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
      assert.match(body, new RegExp(`\`${id}\` \\(\\[#\\d+\\]\\(https://github\\.com/[\\w/.-]+/issues/\\d+\\)\\)`));
    assert.match(body, /\[Board\]\(https:\/\/github\.com\/users\/rogerbucks\/projects\/1\)/);
    assert.match(body, /\[Run\]\(https:\/\/github\.com\/rogerbucks\/graph-note\/actions\/runs\/99\)/);
    assert.ok(body.split('\n').length <= 10);
  });

  test('compares the head of the pull request with its base branch, both read through the API', async () => {
    const w = world();
    await w.trigger();
    const refs = w.side.hub.calls
      .filter((c) => c.args[1].includes('/contents/') && c.args.includes('-H'))
      .map((c) => c.args[c.args.indexOf('-f') + 1]);
    assert.deepEqual(refs.sort(), [`ref=${HEAD}`, 'ref=main']);
  });

  test('moves with the checks of CI: failing, then passing, each time in the one comment', async () => {
    const w = world();
    await w.trigger();
    w.side.hub.workflowRuns[HEAD] = [ci('completed', 'failure')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks failing');
    assert.match(w.comments()[0].body, /Build status: Checks failing/);
    w.side.hub.workflowRuns[HEAD] = [ci('completed', 'success')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks passing');
    assert.equal(w.comments().length, 1, 'one comment, updated, never piled up');
    assert.match(w.comments()[0].body, /Build status: Checks passing/);
  });

  test('counts CI alone: a late check of another workflow does not hold the item at In PR', async () => {
    const w = world();
    w.side.hub.workflowRuns[HEAD] = [ci('completed', 'success'), other('in_progress')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks passing');
  });

  test('counts CI alone: a failing check of another workflow neither fails nor passes the item', async () => {
    const w = world();
    w.side.hub.workflowRuns[HEAD] = [ci('completed', 'success'), other('completed', 'failure')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks passing', 'the rule is: CI is the check that counts');
    w.side.hub.workflowRuns[HEAD] = [ci('in_progress'), other('completed', 'failure')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR');
  });

  test('takes the newest run of CI when it was run again, and In PR while CI has not started', async () => {
    const w = world();
    w.side.hub.workflowRuns[HEAD] = [
      ci('completed', 'failure', { run_number: 1 }),
      ci('completed', 'success', { run_number: 2 }),
    ];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks passing');
    w.side.hub.workflowRuns[HEAD] = [other('completed', 'success')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR');
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
    await w.send('workflow_run', checksOf([]));
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
    assert.deepEqual(w.values(), NOTHING);
    assert.match(w.comments()[0].body, /could not be read/);
    assert.equal(w.annotations.length, 1);
    assert.equal(w.annotations[0][0], 'warning');
  });

  test('says in the comment, as a warning and not a failure, when the requirements file is too large to read', async () => {
    const w = world();
    w.side.hub.files[HEAD] = `${FIXTURE}${'// padding\n'.repeat(400_000)}`;
    const result = await w.trigger();
    assert.deepEqual(w.values(), NOTHING);
    assert.match(w.comments()[0].body, /too large/);
    assert.equal(w.annotations[0][0], 'warning');
    assert.match(w.annotations[0][1], /too large/);
    assert.equal(result.pulls.length, 1);
    const downloads = w.side.hub.calls.filter((c) => c.args.includes('-H') && c.args.includes(`ref=${HEAD}`));
    assert.equal(downloads.length, 0, 'its size is asked for before it is downloaded');
  });
});

describe('the pull requests it leaves alone', () => {
  const left = async (w, change) => {
    change(w.side.hub.pulls[7]);
    const result = await w.trigger();
    assert.deepEqual(w.values(), NOTHING);
    assert.deepEqual(w.comments(), []);
    assert.deepEqual(w.annotations, []);
    return result.pulls[0];
  };

  test('one from a fork moves nothing and gets no comment', async () => {
    const w = world();
    const skipped = await left(w, (p) => (p.head.repo.full_name = 'someone/thoughtknot'));
    assert.deepEqual([skipped.number, skipped.skipped], [7, 'fork']);
  });

  test('one whose head repository has gone is a fork too', async () => {
    const w = world();
    const skipped = await left(w, (p) => (p.head.repo = null));
    assert.equal(skipped.skipped, 'fork');
  });

  test('one whose base is another repository is left alone', async () => {
    const w = world();
    const skipped = await left(w, (p) => (p.base.repo.full_name = 'someone/thoughtknot'));
    assert.equal(skipped.skipped, 'fork');
  });

  test('one that the event names but whose head is no longer the commit the checks ran on is stale, and left to its own event', async () => {
    const w = world();
    const result = await w.send('workflow_run', checksOf([7], 'e'.repeat(40)));
    assert.deepEqual(w.values(), NOTHING);
    assert.deepEqual(w.comments(), []);
    assert.equal(result.pulls[0].skipped, 'stale');
  });

  test('one that merged into a branch other than main does not become Merged', async () => {
    const w = world();
    Object.assign(w.side.hub.pulls[7], { state: 'closed', merged: true, merge_commit_sha: MERGE });
    w.side.hub.pulls[7].base.ref = 'feature';
    const skipped = await left(w, () => {});
    assert.equal(skipped.skipped, 'not into main');
  });

  test('a push to main sets Merged only for a pull request that merged into main', async () => {
    const w = world();
    Object.assign(w.side.hub.pulls[7], { state: 'open' });
    w.side.hub.forSha[MERGE] = [7];
    const result = await w.send('push', { after: MERGE });
    assert.deepEqual(w.values(), NOTHING);
    assert.equal(result.pulls[0].skipped, 'not merged');
  });
});

describe('a pull request that moves very many requirements', () => {
  const many = (count) => {
    const lines = Array.from(
      { length: count },
      (_, i) => `(many_${i}:Requirement {section: '3', slice: 3, level: 'must', rule: 'R ${i}.'}),`,
    );
    const proofs = Array.from({ length: count }, (_, i) => `(many_${i})-[:PROVED_BY]->(test_later),`);
    return HEAD_TEXT.replace('// ── Tests ──', `${lines.join('\n')}\n// ── Tests ──`).replace(
      '// ── Links ──',
      `// ── Links ──\n${proofs.join('\n')}`,
    );
  };

  test('is handled up to 200 of them, and warns, in the run and the comment, that the rest were not', async () => {
    const w = world();
    w.side.hub.files[HEAD] = many(250);
    const result = await w.trigger();
    assert.equal(result.pulls[0].ids.length, 200);
    assert.match(w.comments()[0].body, /only the first 200/);
    assert.match(w.annotations[0][1], /only the first 200/);
  });

  test('is handled whole at 200', async () => {
    const w = world();
    w.side.hub.files[HEAD] = many(198);
    const result = await w.trigger();
    assert.equal(result.pulls[0].ids.length, 200);
    assert.deepEqual(w.annotations, []);
  });
});

describe('a pull request that is closed or merged', () => {
  const merge = (w) => {
    Object.assign(w.side.hub.pulls[7], { state: 'closed', merged: true, merge_commit_sha: MERGE });
    w.side.hub.parents[MERGE] = PARENT;
    w.side.hub.files[MERGE] = HEAD_TEXT;
    w.side.hub.files[PARENT] = FIXTURE;
    w.side.hub.forSha[MERGE] = [7];
  };

  test('is Merged on the board after a push to main, read from the merge commit and the commit before it', async () => {
    const w = world();
    await w.trigger();
    merge(w);
    await w.send('push', { after: MERGE });
    assert.deepEqual(w.values(), { ...NOTHING, focus_link: 'Merged', focus_neighbours: 'Merged' });
    assert.match(w.comments()[0].body, /Build status: Merged/);
    assert.equal(w.comments().length, 1);
  });

  test('stays Merged when a late event of the checks arrives afterwards', async () => {
    const w = world();
    merge(w);
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Merged');
    w.side.hub.workflowRuns[HEAD] = [ci('completed', 'failure')];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Merged');
  });

  test('never takes a Released item back to Merged', async () => {
    const w = world();
    merge(w);
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

describe('the one comment, when two runs would make it', () => {
  test('is not made twice: it is looked for again just before it is written', async () => {
    const w = world();
    const first = '<!-- build-status -->\n**Build status: Merged**\n';
    w.side.hub.afterList = () => {
      w.side.hub.comments[7] = [{ id: 90, body: first, user: { login: 'github-actions[bot]', type: 'Bot' } }];
    };
    await w.trigger();
    assert.equal(w.comments().length, 1);
    assert.match(w.comments()[0].body, /Build status: In PR/);
    assert.deepEqual(
      w.side.hub.mutations.filter((m) => m.startsWith('POST')),
      [],
    );
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
    assert.deepEqual(result.release, { tag: 'v0.5.0', since: 'v0.4.0', ids: MOVED, pulls: [] });
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
    w.side.hub.pulls[8] = pull(8, { head: HEAD });
    await w.send('workflow_run', checksOf([7, 8]));
    assert.equal(w.annotations.length, 1);
    for (const n of [7, 8]) assert.match(w.side.hub.comments[n][0].body, /`focus_link`/);
  });

  describe('expired or rejected, answered 401', () => {
    const rejecting = (w) => {
      w.deps.project = (args) => {
        throw Object.assign(new Error(`gh ${args.join(' ')} failed: gh: Bad credentials (HTTP 401) ${TOKEN}`), {
          stderr: `gh: Bad credentials (HTTP 401) ${TOKEN}`,
        });
      };
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
        if (/updateProjectV2ItemFieldValue/.test(String(input)) && (writes += 1))
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

describe('the workflow’s own token', () => {
  test('failing to leave the comment, for a reason other than a lock, warns and still updates the board', async () => {
    const w = world();
    w.side.hub.failComments = 'HTTP 500: the comment could not be made';
    const result = await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR');
    assert.equal(w.annotations.length, 1);
    assert.match(w.annotations[0][1], /comment on #7/);
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
