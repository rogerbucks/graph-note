// A stand-in for the gh command on the repository side of the build status: pull requests, the files at a ref, commits,
// checks, releases and a pull request's comments, held in memory. It answers the calls scripts/build-status-gh.mjs makes
// the way GitHub does, records every call, and says which of them changed something. The project side is
// test/repository/github-project-fake.js. Test code only — nothing here ships, and nothing here touches the network.
import { readBoard } from '../../scripts/slice-board.mjs';
import { desiredState } from '../../scripts/github-project-desired.mjs';
import { buildPlan } from '../../scripts/github-project-plan.mjs';
import { executePlan, readRemote } from '../../scripts/github-project-gh.mjs';
import { fakeGithub } from './github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './github-project-fixture.js';

const flag = (args, name) => args[args.indexOf(name) + 1];
const json = (value) => `${JSON.stringify(value)}\n`;
const notFound = () =>
  Object.assign(new Error('gh api failed: gh: Not Found (HTTP 404)'), { stderr: 'gh: Not Found (HTTP 404)' });

/**
 * A GitHub repository `repo`. `hub` holds what a test sets up and reads back: `pulls` (number to the pull request as the
 * API gives it), `files` (ref to the text of the requirements file at it), `parents` (sha to its first parent's sha),
 * `forSha` (sha to the numbers of the pull requests the commit is in), `runs` and `statuses` (sha to its check runs and
 * commit statuses), `releases`, `comments` (pull request number to its comments) and `failComments` (a message that
 * every write of a comment fails with).
 */
export function fakeRepoSide({ repo = 'rogerbucks/graph-note', pageSize = 100 } = {}) {
  const hub = {
    repo,
    pulls: {},
    files: {},
    parents: {},
    forSha: {},
    runs: {},
    statuses: {},
    releases: [],
    comments: {},
    failComments: null,
    calls: [],
    mutations: [],
    ids: 0,
  };

  const comment = (args, input) => {
    const method = flag(args, '--method');
    const body = JSON.parse(input).body;
    if (hub.failComments) throw new Error(`gh api failed: ${hub.failComments}`);
    hub.mutations.push(`${method} ${args[1]}`);
    if (method === 'POST') {
      const number = Number(/issues\/(\d+)\/comments$/.exec(args[1])[1]);
      const made = { id: (hub.ids += 1), body, user: { login: 'github-actions[bot]', type: 'Bot' } };
      (hub.comments[number] ??= []).push(made);
      return json(made);
    }
    const id = Number(/comments\/(\d+)$/.exec(args[1])[1]);
    const found = Object.values(hub.comments)
      .flat()
      .find((c) => c.id === id);
    found.body = body;
    return json(found);
  };

  const run = (args, input) => {
    hub.calls.push({ args, input });
    if (args[0] !== 'api') throw new Error(`fake repository gh does not know: ${args.join(' ')}`);
    const path = args[1];
    const prefix = `repos/${repo}/`;
    if (!path.startsWith(prefix)) throw new Error(`gh api ${path}: names no repository, or the wrong one`);
    const rest = path.slice(prefix.length);
    let m;
    if (flag(args, '--method') === 'POST' || flag(args, '--method') === 'PATCH') return comment(args, input);
    if ((m = /^pulls\/(\d+)$/.exec(rest))) {
      if (!hub.pulls[m[1]]) throw notFound();
      return json(hub.pulls[m[1]]);
    }
    if ((m = /^commits\/([0-9a-f]{40})\/pulls$/.exec(rest)))
      return json((hub.forSha[m[1]] ?? []).map((n) => hub.pulls[n]));
    if ((m = /^commits\/([0-9a-f]{40})\/check-runs\?per_page=100$/.exec(rest))) {
      const runs = hub.runs[m[1]] ?? [];
      return json({ total_count: runs.length, check_runs: runs });
    }
    if ((m = /^commits\/([0-9a-f]{40})\/status\?per_page=100$/.exec(rest)))
      return json({ state: 'pending', statuses: hub.statuses[m[1]] ?? [] });
    if ((m = /^commits\/([0-9a-f]{40})$/.exec(rest))) {
      if (!(m[1] in hub.parents)) throw notFound();
      return json({ sha: m[1], parents: [{ sha: hub.parents[m[1]] }] });
    }
    if (rest.startsWith('contents/')) {
      const ref = flag(args, '-f').replace(/^ref=/, '');
      if (!(ref in hub.files)) throw notFound();
      return hub.files[ref];
    }
    if (rest === 'releases?per_page=100') return json(hub.releases);
    if ((m = /^issues\/(\d+)\/comments\?per_page=100$/.exec(rest))) {
      const all = hub.comments[m[1]] ?? [];
      const pages = [];
      for (let i = 0; i < all.length || pages.length === 0; i += pageSize) pages.push(all.slice(i, i + pageSize));
      return json(pages);
    }
    throw new Error(`fake repository gh does not know: ${args.join(' ')}`);
  };

  return { hub, run };
}

/** A pull request as the API gives it, with what a test needs of it. */
export function pull(
  number,
  { state = 'open', merged = false, head = 'a'.repeat(40), base = 'main', mergeSha = null } = {},
) {
  return {
    number,
    state,
    merged,
    merge_commit_sha: mergeSha,
    head: { sha: head },
    base: { ref: base },
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
