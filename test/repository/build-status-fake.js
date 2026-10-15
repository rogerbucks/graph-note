// A stand-in for the gh command on the repository side of the build status: pull requests, the files at a ref, commits,
// CI runs, releases, issues and a pull request's comments and lock, held in memory. It answers the calls
// scripts/build-status-gh.mjs makes the way GitHub does, records every call, and says which of them changed something.
// The project side is test/repository/github-project-fake.js. Test code only — nothing here ships, and nothing here
// touches the network.
import { readBoard } from '../../scripts/slice-board.mjs';
import { desiredState } from '../../scripts/github-project-desired.mjs';
import { buildPlan } from '../../scripts/github-project-plan.mjs';
import { executePlan, readRemote } from '../../scripts/github-project-gh.mjs';
import { fakeGithub } from './github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './github-project-fixture.js';

const flag = (args, name) => args[args.indexOf(name) + 1];
const json = (value) => `${JSON.stringify(value)}\n`;
const failure = (words) => Object.assign(new Error(`gh api failed: ${words}`), { stderr: words });
const notFound = () => failure('gh: Not Found (HTTP 404)');
const LOCKED = 'HTTP 403: Unable to create comment because issue is locked.';
const page = (list, n) => list.sort((a, b) => b.number - a.number).slice((Number(n) - 1) * 100, Number(n) * 100);

/**
 * A GitHub repository `repo`. `hub` holds what a test sets up and reads back: `pulls` (number to the pull request as the
 * API gives it), `files` (ref to the text of the requirements file at it), `parents` (sha to its first parent's sha),
 * `forSha` (sha to the numbers of the pull requests the commit is in), `workflowRuns` (sha to its workflow runs),
 * `releases`, `comments` (pull request number to its comments), `locked` (the numbers of the locked conversations, which
 * refuse a comment as GitHub does), `failComments`, `failUnlock` and `failLock` (the words every such call fails with),
 * `failAfterUnlock` (the words a comment fails with once its conversation has been unlocked), and `afterList` (a function run once, after the next listing of comments, as another run would write in between).
 * `issues()` gives the issues `gh issue list` prints.
 */
export function fakeRepoSide({ repo = 'rogerbucks/graph-note', pageSize = 100, issues = () => [] } = {}) {
  const hub = {
    repo,
    pulls: {},
    files: {},
    parents: {},
    forSha: {},
    workflowRuns: {},
    releases: [],
    comments: {},
    locked: new Set(),
    failComments: null,
    failUnlock: null,
    failLock: null,
    failAfterUnlock: null,
    afterList: null,
    calls: [],
    mutations: [],
    ids: 0,
  };

  const comment = (args, input) => {
    const method = flag(args, '--method');
    const body = JSON.parse(input).body;
    if (hub.failComments) throw failure(hub.failComments);
    const number = Number(/issues\/(\d+)\/comments$/.exec(args[1])?.[1]);
    if (method === 'POST' && hub.locked.has(number)) throw failure(LOCKED);
    if (method === 'POST') {
      hub.mutations.push(`${method} ${args[1]}`);
      const made = { id: (hub.ids += 1), body, user: { login: 'github-actions[bot]', type: 'Bot' } };
      (hub.comments[number] ??= []).push(made);
      return json(made);
    }
    const id = Number(/comments\/(\d+)$/.exec(args[1])[1]);
    const owner = Object.entries(hub.comments).find(([, list]) => list.some((c) => c.id === id));
    if (hub.locked.has(Number(owner[0]))) throw failure(LOCKED);
    hub.mutations.push(`${method} ${args[1]}`);
    const found = owner[1].find((c) => c.id === id);
    found.body = body;
    return json(found);
  };

  const lock = (args) => {
    const method = flag(args, '--method');
    const number = Number(/issues\/(\d+)\/lock$/.exec(args[1])[1]);
    if (method === 'DELETE' && hub.failUnlock) throw failure(hub.failUnlock);
    if (method === 'PUT' && hub.failLock) throw failure(hub.failLock);
    hub.mutations.push(`${method} ${args[1]}`);
    if (method === 'PUT') hub.locked.add(number);
    else {
      hub.locked.delete(number);
      if (hub.failAfterUnlock) hub.failComments = hub.failAfterUnlock;
    }
    return '';
  };

  const listComments = (number) => {
    const all = hub.comments[number] ?? [];
    const pages = [];
    for (let i = 0; i < all.length || pages.length === 0; i += pageSize) pages.push(all.slice(i, i + pageSize));
    const answer = json(pages);
    const after = hub.afterList;
    hub.afterList = null;
    after?.();
    return answer;
  };

  const run = (args, input) => {
    hub.calls.push({ args, input });
    if (args[0] === 'issue' && args[1] === 'list') {
      if (flag(args, '--repo') !== repo) throw new Error('gh issue list: names no repository, or the wrong one');
      // only the issues one author (or one GitHub App, app/<name> as gh gives it) wrote when asked for, as GitHub gives
      // them, so others’ never count against the cap
      const author = args.includes('--app') ? `app/${flag(args, '--app')}` : flag(args, '--author');
      const asked = args.includes('--author') || args.includes('--app');
      return json(issues().filter((i) => !asked || i.author?.login === author));
    }
    if (args[0] !== 'api') throw new Error(`fake repository gh does not know: ${args.join(' ')}`);
    const path = args[1];
    const prefix = `repos/${repo}/`;
    if (!path.startsWith(prefix)) throw new Error(`gh api ${path}: names no repository, or the wrong one`);
    const rest = path.slice(prefix.length);
    const method = flag(args, '--method');
    let m;
    if (method === 'POST' || method === 'PATCH') return comment(args, input);
    if ((method === 'PUT' || method === 'DELETE') && /^issues\/\d+\/lock$/.test(rest)) return lock(args);
    if ((m = /^pulls\/(\d+)$/.exec(rest))) {
      if (!hub.pulls[m[1]]) throw notFound();
      return json({ ...hub.pulls[m[1]], locked: hub.locked.has(Number(m[1])) });
    }
    // lists come newest first, a hundred to the page, as GitHub gives them
    if ((m = /^pulls\?state=open&per_page=100&page=(\d+)$/.exec(rest)))
      return json(
        page(
          Object.values(hub.pulls).filter((p) => p.state === 'open'),
          m[1],
        ),
      );
    if ((m = /^pulls\?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=(\d+)$/.exec(rest)))
      return json(
        page(
          Object.values(hub.pulls).filter((p) => p.state === 'closed' && p.merged_at && p.base.ref === 'main'),
          m[1],
        ),
      );
    if ((m = /^commits\/([0-9a-f]{40})\/pulls$/.exec(rest)))
      return json((hub.forSha[m[1]] ?? []).map((n) => hub.pulls[n]));
    if ((m = /^actions\/runs\?head_sha=([0-9a-f]{40})&event=pull_request&per_page=100$/.exec(rest)))
      return json({ total_count: (hub.workflowRuns[m[1]] ?? []).length, workflow_runs: hub.workflowRuns[m[1]] ?? [] });
    if ((m = /^commits\/([0-9a-f]{40})$/.exec(rest))) {
      if (!(m[1] in hub.parents)) throw notFound();
      return json({ sha: m[1], parents: [{ sha: hub.parents[m[1]] }] });
    }
    if (rest.startsWith('contents/')) {
      const ref = flag(args, '-f').replace(/^ref=/, '');
      if (!(ref in hub.files)) throw notFound();
      // without the raw media type GitHub describes the file; with it, gives the file
      return args.includes('-H') ? hub.files[ref] : json({ type: 'file', size: Buffer.byteLength(hub.files[ref]) });
    }
    if (rest === 'releases?per_page=100') return json(hub.releases);
    if ((m = /^issues\/(\d+)\/comments\?per_page=100$/.exec(rest))) return listComments(m[1]);
    throw new Error(`fake repository gh does not know: ${args.join(' ')}`);
  };

  return { hub, run };
}

/** A pull request as the API gives it, with what a test needs of it. */
export function pull(
  number,
  {
    state = 'open',
    merged = false,
    head = 'a'.repeat(40),
    base = 'main',
    mergeSha = null,
    headRepo = 'rogerbucks/graph-note',
    baseRepo = 'rogerbucks/graph-note',
    body = null,
    draft = false,
    mergedAt = null,
  } = {},
) {
  return {
    number,
    state,
    merged,
    merged_at: mergedAt,
    merge_commit_sha: mergeSha,
    draft,
    body,
    head: { sha: head, repo: headRepo && { full_name: headRepo } },
    base: { ref: base, repo: baseRepo && { full_name: baseRepo } },
    html_url: `https://github.com/rogerbucks/graph-note/pull/${number}`,
  };
}

/** The in-memory project (github-project-fake.js) with the fixture’s requirements mirrored into it, as the mirror leaves it. */
export function mirroredProject() {
  const gh = fakeGithub();
  const repo = 'rogerbucks/graph-note';
  const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
  executePlan(gh.run, repo, buildPlan(desired, readRemote(gh.run, repo)), { sleep: () => {} });
  gh.hub.mutations.length = 0;
  return gh;
}
