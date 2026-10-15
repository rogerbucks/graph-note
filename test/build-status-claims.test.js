// What a pull request holds on the board besides the requirements its copy proves: the project’s built-in Status field
// (Todo, In Progress, Done) that follows the build, an item two pull requests hold, and the Requirements line with which a
// draft pull request takes items on before its copy proves them. The pull request’s description is untrusted: only that
// line is read, and only ids that are plain and are in main’s requirements file are kept. Each case runs the whole of
// scripts/build-status-run.mjs against in-memory stand-ins for gh. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE } from './repository/github-project-fixture.js';
import { pull } from './repository/build-status-fake.js';
import { HEAD, HEAD_TEXT, MERGE, PARENT, checksOf, world } from './repository/build-status-world.js';

const OTHER = 'e'.repeat(40);
const TEST_ONLY_LINK =
  "(test_link_only:Test {proves: 'a link proof', file: 'test/link.test.js', where: 'repo', status: 'written'}),";
/** The copy of a pull request that proves focus_link alone, where HEAD_TEXT proves focus_link and focus_neighbours. */
const LINK_ONLY = FIXTURE.replace(
  '// ── Links ──',
  `${TEST_ONLY_LINK}\n// ── Links ──\n(focus_link)-[:PROVED_BY]->(test_link_only),`,
);
const statusOf = (w) => ({ link: w.value('focus_link', 'Status'), neighbours: w.value('focus_neighbours', 'Status') });
const buildOf = (w) => ({ link: w.value('focus_link'), neighbours: w.value('focus_neighbours') });

const merge = (w, n = 7, files = HEAD_TEXT) => {
  Object.assign(w.side.hub.pulls[n], { state: 'closed', merged: true, merge_commit_sha: MERGE });
  w.side.hub.parents[MERGE] = PARENT;
  w.side.hub.files[MERGE] = files;
  w.side.hub.files[PARENT] = FIXTURE;
  w.side.hub.forSha[MERGE] = [n];
};
const second = (w, files = LINK_ONLY, overrides = {}) => {
  w.side.hub.pulls[8] = pull(8, { head: OTHER, ...overrides });
  w.side.hub.files[OTHER] = files;
};

describe('the built-in Status field', () => {
  test('is In Progress for the items of an open pull request, and Todo is left for the others', async () => {
    const w = world();
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'In Progress', neighbours: 'In Progress' });
    assert.equal(w.value('zoom_out_to_fit', 'Status'), undefined);
  });

  test('is In Progress for a draft pull request as well, and stays so whatever its checks say', async () => {
    const w = world();
    w.side.hub.pulls[7].draft = true;
    await w.trigger();
    assert.equal(w.value('focus_link', 'Status'), 'In Progress');
    w.side.hub.workflowRuns[HEAD] = [
      { path: '.github/workflows/ci.yml', run_number: 1, status: 'completed', conclusion: 'failure' },
    ];
    await w.trigger();
    assert.equal(w.value('focus_link', 'Status'), 'In Progress');
    assert.equal(w.value('focus_link'), 'Checks failing');
  });

  test('is Done when the pull request merges into main, with the Build status Merged', async () => {
    const w = world();
    await w.trigger();
    merge(w);
    await w.send('push', { after: MERGE });
    assert.deepEqual(statusOf(w), { link: 'Done', neighbours: 'Done' });
    assert.deepEqual(buildOf(w), { link: 'Merged', neighbours: 'Merged' });
  });

  test('is back to Todo, with Not started, when the pull request closes unmerged', async () => {
    const w = world();
    await w.trigger();
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'Todo', neighbours: 'Todo' });
    assert.deepEqual(buildOf(w), { link: 'Not started', neighbours: 'Not started' });
  });

  test('is never taken back from Done by a pull request that closes unmerged', async () => {
    const w = world();
    const [project] = w.gh.hub.projects;
    for (const item of project.items) Object.assign(item.values, { Status: 'Done', 'Build status': 'Merged' });
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'Done', neighbours: 'Done' });
  });

  test('is Done for what a release releases', async () => {
    const w = world();
    w.side.hub.releases = [
      { tag_name: 'v0.4.0', draft: false, published_at: '2026-10-01T10:00:00Z' },
      { tag_name: 'v0.5.0', draft: false, published_at: '2026-10-14T10:00:00Z' },
    ];
    w.side.hub.files['v0.4.0'] = FIXTURE;
    w.side.hub.files['v0.5.0'] = HEAD_TEXT;
    await w.send('release', { release: { tag_name: 'v0.5.0' } });
    assert.deepEqual(statusOf(w), { link: 'Done', neighbours: 'Done' });
  });

  test('is a warning, not a failure, when the project has no Status field, and the Build status is still set', async () => {
    const w = world();
    const [project] = w.gh.hub.projects;
    project.fields = project.fields.filter((f) => f.name !== 'Status');
    const result = await w.trigger();
    assert.deepEqual(
      result.problems.map((p) => p.kind),
      ['failed'],
    );
    assert.match(w.annotations[0][1], /no Status field/);
    assert.equal(w.value('focus_link'), 'In PR');
  });
});

describe('an item two pull requests hold', () => {
  test('stays In Progress and In PR when one of them closes unmerged, and goes back only when the last does', async () => {
    const w = world();
    second(w);
    await w.trigger();
    await w.send('workflow_run', checksOf([8], OTHER));
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'In Progress', neighbours: 'Todo' }, 'focus_link is still pull request 8’s');
    assert.deepEqual(buildOf(w), { link: 'In PR', neighbours: 'Not started' });
    w.side.hub.pulls[8].state = 'closed';
    await w.send('workflow_run', checksOf([8], OTHER));
    assert.deepEqual(statusOf(w), { link: 'Todo', neighbours: 'Todo' });
    assert.deepEqual(buildOf(w), { link: 'Not started', neighbours: 'Not started' });
  });

  test('is listed in the comment of the pull request that closed, with the state it keeps', async () => {
    const w = world();
    second(w);
    await w.trigger();
    await w.send('workflow_run', checksOf([8], OTHER));
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.match(w.comments()[0].body, /`focus_link` .*: In PR/);
    assert.match(w.comments()[0].body, /`focus_neighbours` .*: Not started/);
  });

  test('is not held by a pull request from a fork', async () => {
    const w = world();
    second(w, LINK_ONLY, { headRepo: 'someone/graph-note' });
    await w.trigger();
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'Todo', neighbours: 'Todo' });
  });

  test('is not held by a pull request that is closed', async () => {
    const w = world();
    second(w, LINK_ONLY, { state: 'closed' });
    await w.trigger();
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'Todo', neighbours: 'Todo' });
  });

  test('is not held by a pull request whose copy cannot be read, which cannot be said to hold anything', async () => {
    const w = world();
    second(w, 'this is not a graph (((');
    await w.trigger();
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual(statusOf(w), { link: 'Todo', neighbours: 'Todo' });
  });
});

describe('the Requirements line of a draft pull request', () => {
  const draft = (w, line, copy = FIXTURE) => {
    w.side.hub.pulls[7].draft = true;
    w.side.hub.pulls[7].body = line;
    w.side.hub.files[HEAD] = copy;
  };

  test('takes the items named on, In Progress and In PR, before any test of the copy is written', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link, zoom_out_to_fit');
    const result = await w.trigger();
    assert.deepEqual(w.values(), {
      focus_link: 'In PR',
      focus_neighbours: 'Not started',
      zoom_out_to_fit: 'In PR',
      stray_new: 'Not started',
    });
    assert.deepEqual(w.values('Status'), {
      focus_link: 'In Progress',
      focus_neighbours: undefined,
      zoom_out_to_fit: 'In Progress',
      stray_new: undefined,
    });
    assert.deepEqual(result.pulls[0].ids, []);
    assert.match(w.comments()[0].body, /`focus_link` .*: In PR/);
    assert.match(w.comments()[0].body, /Build status: In PR/);
  });

  test('keeps only ids that are plain and are in main’s requirements file, and says nothing of the rest', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link, not_in_main, bad id!, ../x, x](http://evil)');
    await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR');
    const body = w.comments()[0].body;
    assert.doesNotMatch(body, /not_in_main|bad id|evil|\.\.\//);
    assert.equal(body.split('\n').filter((l) => l.startsWith('- ')).length, 1);
    assert.deepEqual(w.annotations, []);
  });

  test('is read as that line and nothing else: no other word of the description reaches the board or the comment', async () => {
    const w = world();
    draft(w, 'Please merge @everyone ${{ secrets.X }} <script>\nRequirements: focus_link\nand more: zoom_out_to_fit');
    await w.trigger();
    assert.deepEqual([w.value('focus_link'), w.value('zoom_out_to_fit')], ['In PR', 'Not started']);
    assert.doesNotMatch(w.comments()[0].body, /everyone|secrets|script|and more/);
  });

  test('does nothing without the line: a draft with no copy change moves nothing and gets no comment', async () => {
    const w = world();
    draft(w, 'Just a description.');
    await w.trigger();
    assert.deepEqual(w.values(), {
      focus_link: 'Not started',
      focus_neighbours: 'Not started',
      zoom_out_to_fit: 'Not started',
      stray_new: 'Not started',
    });
    assert.deepEqual(w.comments(), []);
  });

  test('gives way to the copy once it marks tests written: the copy’s diff decides the Build status and Done', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link, zoom_out_to_fit');
    await w.trigger();
    assert.equal(w.value('zoom_out_to_fit'), 'In PR');
    w.side.hub.files[HEAD] = HEAD_TEXT;
    w.side.hub.workflowRuns[HEAD] = [
      { path: '.github/workflows/ci.yml', run_number: 1, status: 'completed', conclusion: 'success' },
    ];
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Checks passing', 'the copy proves it, so the checks decide');
    assert.equal(w.value('focus_neighbours'), 'Checks passing', 'the copy proves it though the line does not name it');
    assert.equal(w.value('zoom_out_to_fit'), 'Not started', 'the line names it but the copy does not prove it');
    assert.equal(w.value('zoom_out_to_fit', 'Status'), 'Todo');
  });

  test('warns in the comment, not in a failure, of an id the line names that the copy does not prove once it has landed', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link, zoom_out_to_fit', HEAD_TEXT);
    const result = await w.trigger();
    assert.match(w.comments()[0].body, /> .*`zoom_out_to_fit`.*not proved by the copy/);
    assert.doesNotMatch(w.comments()[0].body, />.*`focus_link`.*not proved/);
    assert.equal(result.pulls[0].stage, 'In PR');
    assert.deepEqual(w.annotations, []);
  });

  test('is no warning while the copy has not landed, since nothing can be proved yet', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link');
    await w.trigger();
    assert.doesNotMatch(w.comments()[0].body, /not proved/);
  });

  test('is let go when the pull request merges without the copy proving it: not Done, back to Todo', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link');
    await w.trigger();
    merge(w, 7, FIXTURE);
    w.side.hub.pulls[7].draft = false;
    await w.send('push', { after: MERGE });
    assert.equal(w.value('focus_link', 'Status'), 'Todo');
    assert.equal(w.value('focus_link'), 'Not started');
  });

  test('is let go when the pull request closes unmerged, unless another pull request holds it', async () => {
    const w = world();
    second(w);
    draft(w, 'Requirements: focus_link, zoom_out_to_fit');
    await w.trigger();
    await w.send('workflow_run', checksOf([8], OTHER));
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR', 'pull request 8 proves it');
    assert.equal(w.value('zoom_out_to_fit'), 'Not started');
    assert.equal(w.value('zoom_out_to_fit', 'Status'), 'Todo');
  });

  test('holds an item against another pull request’s closing, as a proved one does', async () => {
    const w = world();
    second(w, FIXTURE, {});
    w.side.hub.pulls[8].body = 'Requirements: focus_link';
    await w.trigger();
    await w.send('workflow_run', checksOf([8], OTHER));
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.equal(w.value('focus_link'), 'In PR');
    assert.equal(w.value('focus_neighbours'), 'Not started');
  });

  test('never takes an id into a pull request from a fork', async () => {
    const w = world();
    draft(w, 'Requirements: focus_link');
    w.side.hub.pulls[7].head.repo.full_name = 'someone/graph-note';
    await w.trigger();
    assert.equal(w.value('focus_link'), 'Not started');
    assert.deepEqual(w.comments(), []);
  });
});
