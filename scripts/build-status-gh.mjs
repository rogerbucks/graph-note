// The thin layer between the build status and GitHub (spec §12, requirements_checked_in_ci): it reads a pull request, the
// requirements file at a ref, CI's run for a commit and the releases, and leaves the pull request's one comment. All the
// thinking is in build-status.mjs; this layer only asks and tells, through runners handed in — run(args, input) gives
// gh's output — so a test can hand in stand-ins and no network is touched. Two runners, each with its own token: the
// workflow's own token for the repository (reads and the comment), and PROJECT_TOKEN for the project board alone (the
// board is build-status-board.mjs). A pull request is only ever read as data through the API: no file of it is checked
// out and none of its code is run.
import { spawnSync } from 'node:child_process';
import { REQUIREMENTS } from './check-requirements.mjs';
import { COMMENT_MARKER, requestedIds } from './build-status.mjs';
import { dayOf } from './github-project-fields.mjs';
import { ghRunner } from './github-project-gh.mjs';
import { retrying } from './github-project-retry.mjs';

/** The workflow whose run is the check that counts: the other workflows of a pull request are not the build's. */
export const CI_WORKFLOW = '.github/workflows/ci.yml';
/** The job of the workflow that only wakes the build status; it is not a check of the change. */
export const TRIGGER_JOB = 'build-status-trigger';
/** The most bytes of a requirements file it will read; the file is a few hundred thousand. */
export const MAX_FILE_BYTES = 3_000_000;

const PAGE = 100;
const MAX_OPEN = 50;
const MAX_PAGES = 10;
const SHA = /^[0-9a-f]{40}$/;
const REF = /^[\w][\w.+/-]{0,199}$/;
const NOT_FOUND = /HTTP 404|Not Found/;
const COMMENTER = 'github-actions[bot]';

/** A requirements file the reader cannot read, or one too large to read, or a merge commit not known: a warning, not a failure. */
export class Unreadable extends Error {}

const wholeNumber = (n) => {
  if (!Number.isInteger(n) || n < 1) throw new Error(`${n} is not a pull request number`);
  return n;
};
const commit = (sha) => {
  if (!SHA.test(String(sha))) throw new Error(`${sha} is not a commit sha`);
  return sha;
};
const words = (e) => (typeof e.stderr === 'string' ? e.stderr : String(e.message));
const json = (run, repo, path, extra = []) => JSON.parse(run(['api', `repos/${repo}/${path}`, ...extra]));

/**
 * A pull request as {number, state ('open' or 'closed'), merged, draft, mergeSha, headSha, baseRef, headRepo, baseRepo,
 * requested, createdAt}. The repositories are `owner/name`, headRepo null where the head's fork has gone; `requested` is
 * the ids its description names in the Requirements line (requestedIds), and the description is kept no further than
 * that; `createdAt` is the day it was opened (YYYY-MM-DD, UTC), or null where GitHub gives none. Throws for a
 * number that is not a whole number, and for a head commit or base branch the API gives in a form git would not use.
 */
export function readPullRequest(run, repo, number) {
  const data = json(run, repo, `pulls/${wholeNumber(number)}`);
  if (!SHA.test(String(data.head?.sha))) throw new Error(`pull request ${number} has no valid head commit`);
  if (!REF.test(String(data.base?.ref))) throw new Error(`pull request ${number} has no valid base branch`);
  const mergeSha = SHA.test(String(data.merge_commit_sha)) ? data.merge_commit_sha : null;
  return {
    number,
    state: data.state === 'closed' ? 'closed' : 'open',
    merged: data.merged === true,
    draft: data.draft === true,
    mergeSha,
    headSha: data.head.sha,
    baseRef: data.base.ref,
    headRepo: data.head.repo?.full_name ?? null,
    baseRepo: data.base.repo?.full_name ?? null,
    requested: requestedIds(data.body),
    createdAt: dayOf(data.created_at),
  };
}

const ownPull = (p, repo) => p.head?.repo?.full_name === repo && p.base?.repo?.full_name === repo;

/**
 * Pages through a list of pull requests (newest first, a hundred to the page, at most MAX_PAGES), keeping those of this
 * repository, whose head and base are both it, that `keep` accepts. The forks' are left out before anything is counted, so
 * no crowd of them can hide one of ours. Stops once `limit` are kept. Gives {found, cut}: cut is true when the pages ran out
 * before the list did.
 */
function ownPulls(run, repo, path, keep, limit) {
  const found = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const list = json(run, repo, `${path}&page=${page}`);
    found.push(...list.filter((p) => ownPull(p, repo) && keep(p)));
    if (list.length < PAGE || found.length >= limit) return { found, cut: false };
  }
  return { found, cut: true };
}

/** The numbers of the open pull requests of this repository (a fork's are left out first), sorted, at most fifty. */
export function openPullNumbers(run, repo) {
  const { found } = ownPulls(run, repo, `pulls?state=open&per_page=${PAGE}`, () => true, MAX_OPEN);
  return found
    .map((p) => p.number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b)
    .slice(0, MAX_OPEN);
}

/** The numbers of the pull requests a commit is in, sorted. */
export function pullNumbersForSha(run, repo, sha) {
  const found = json(run, repo, `commits/${commit(sha)}/pulls`);
  return found
    .map((p) => p.number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/** The first parent of a commit: for a merge commit, where the base branch stood before the merge. */
export function parentOf(run, repo, sha) {
  return commit(json(run, repo, `commits/${commit(sha)}`).parents?.[0]?.sha);
}

/**
 * The text of the requirements file at a ref (a branch, a tag or a commit), read through the API as data, or null when
 * there is no such file or ref. Its size is asked for first and the file is only downloaded if it is no larger than
 * MAX_FILE_BYTES. Throws Unreadable for a file over that, and the failure itself for any other.
 */
export function readRequirementsAt(run, repo, ref) {
  if (!REF.test(String(ref))) throw new Error(`${ref} is not a ref`);
  const args = ['api', `repos/${repo}/contents/${REQUIREMENTS}`, '--method', 'GET', '-f', `ref=${ref}`];
  const tooLarge = (bytes) =>
    new Unreadable(`${REQUIREMENTS} at ${ref.slice(0, 12)} is too large to read (${bytes} bytes)`);
  let text;
  try {
    const size = JSON.parse(run(args)).size;
    if (size > MAX_FILE_BYTES) throw tooLarge(size);
    text = run([...args, '-H', 'Accept: application/vnd.github.raw+json']);
  } catch (e) {
    if (e instanceof Unreadable) throw e;
    if (NOT_FOUND.test(words(e))) return null;
    throw e;
  }
  if (text.length > MAX_FILE_BYTES) throw tooLarge(text.length);
  return text;
}

/**
 * CI's own run for a commit as a status check rollup, the shape the slice board counts: [{status, conclusion}], upper
 * case, one entry for the newest run of the workflow at CI_WORKFLOW (it is known by its path, which a pull request cannot
 * choose by naming a workflow), or none while CI has not started. The other workflows of a pull request (code scanning,
 * the dependency review, the lock, the trigger) are not the build's checks. Throws when the list is as long as the page
 * asked for, since it may be only a part.
 */
export function checkRollup(run, repo, sha) {
  const found = json(run, repo, `actions/runs?head_sha=${commit(sha)}&event=pull_request&per_page=${PAGE}`);
  if (found.workflow_runs.length >= PAGE)
    throw new Error(`GitHub returned as many workflow runs as one page holds, so there may be more than ${PAGE}`);
  const [newest] = found.workflow_runs
    .filter((r) => String(r.path).split('@')[0] === CI_WORKFLOW)
    .sort((a, b) => b.run_number - a.run_number);
  if (!newest) return [];
  return [{ status: String(newest.status).toUpperCase(), conclusion: String(newest.conclusion ?? '').toUpperCase() }];
}

/**
 * The release published just before `tag`, drafts left out, as {tag, publishedAt}, or null when there is none. A tag the
 * list does not hold yet (a release that has only just been published) has the newest release before it.
 */
export function releaseBefore(run, repo, tag) {
  const published = publishedReleases(run, repo);
  const at = published.findIndex((r) => r.tag === tag);
  return (at === -1 ? published.at(-1) : published[at - 1]) ?? null;
}

/**
 * The published releases, oldest first, as [{tag, publishedAt}]. A draft is not one: it has not been published, so it is
 * not in the list, and its tag is never read.
 */
export function publishedReleases(run, repo) {
  return json(run, repo, `releases?per_page=${PAGE}`)
    .filter((r) => !r.draft && r.published_at)
    .map((r) => ({ tag: r.tag_name, publishedAt: r.published_at }))
    .sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt)));
}

const timeOf = (text) => {
  if (text === null || text === undefined) return null;
  const at = Date.parse(String(text));
  if (Number.isNaN(at)) throw new Error(`${text} is not a time`);
  return at;
};

/**
 * The numbers of the pull requests of this repository (a fork's are left out first) merged into main after the time
 * `since` and up to the time `until` (either may be null, for no bound), as {numbers (sorted, the most recent fifty at
 * most), truncated}: truncated is true when there were more than that, or the pages ran out before the list did, so some
 * may be missing. Throws for a time that is not a time.
 */
export function mergedPullNumbers(run, repo, since, until) {
  const [from, to] = [timeOf(since), timeOf(until)];
  const inSpan = (p) =>
    p.merged_at && (from === null || Date.parse(p.merged_at) > from) && (to === null || Date.parse(p.merged_at) <= to);
  const path = `pulls?state=closed&base=main&sort=updated&direction=desc&per_page=${PAGE}`;
  const { found, cut } = ownPulls(run, repo, path, inSpan, MAX_OPEN + 1);
  const numbers = found
    .map((p) => p.number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  return { numbers: numbers.slice(-MAX_OPEN), truncated: numbers.length > MAX_OPEN || cut };
}

const sameText = (a, b) =>
  String(a).replaceAll('\r\n', '\n').trimEnd() === String(b).replaceAll('\r\n', '\n').trimEnd();

const commentOf = (run, repo, number) =>
  JSON.parse(run(['api', `repos/${repo}/issues/${number}/comments?per_page=${PAGE}`, '--paginate', '--slurp']))
    .flat()
    .find((c) => c.user?.login === COMMENTER && c.user?.type === 'Bot' && String(c.body).startsWith(COMMENT_MARKER));

/**
 * Leaves the pull request's one comment: found by its marker among the comments the workflow's bot wrote (a person who
 * writes the marker in their own is not it), then updated, or made when there is none, unless `create` is false. It is
 * looked for again just before it is made, since another run of the workflow may have made it meanwhile. Gives
 * 'created', 'updated', 'unchanged' (the text is the same, so nothing is written) or 'absent' (none, and none made). The
 * text goes on the input, never in the arguments.
 */
export function upsertComment(run, repo, number, body, { create = true } = {}) {
  wholeNumber(number);
  const input = JSON.stringify({ body });
  const rewrite = (mine) => {
    if (sameText(mine.body, body)) return 'unchanged';
    run(['api', `repos/${repo}/issues/comments/${mine.id}`, '--method', 'PATCH', '--input', '-'], input);
    return 'updated';
  };
  const first = commentOf(run, repo, number);
  if (first) return rewrite(first);
  if (!create) return 'absent';
  const meanwhile = commentOf(run, repo, number);
  if (meanwhile) return rewrite(meanwhile);
  run(['api', `repos/${repo}/issues/${number}/comments`, '--method', 'POST', '--input', '-'], input);
  return 'created';
}

const lockOf = (run, repo, number, method) => run(['api', `repos/${repo}/issues/${number}/lock`, '--method', method]);

/** Whether a pull request's conversation is locked, by the `locked` field of the pull request itself. */
const isLocked = (run, repo, number) => json(run, repo, `pulls/${wholeNumber(number)}`).locked === true;

/**
 * Leaves the pull request's one comment as upsertComment does, even where the conversation is locked, as a closed pull
 * request's is (the lock workflow locks each as it opens). The comment is tried first; only if it fails and the pull
 * request's own `locked` field, read from the API, is true (a word in GitHub's refusal is never taken for it) is the
 * conversation unlocked, the comment left and the conversation locked again, in the one step. The lock is taken up again
 * even if the comment then fails, and with the repository's retry for a short failure of GitHub (`opts.sleep` may give
 * another wait). Gives {outcome (upsertComment's, or 'failed'), unlocked, relockFailed (GitHub's words, or null), failure
 * (GitHub's words, or null)}. It throws nothing for a failure of GitHub: the caller says so in a warning. An unlock that is
 * refused leaves the comment unmade and nothing to lock again.
 */
export function leaveComment(run, repo, number, body, opts = {}) {
  const done = { outcome: 'failed', unlocked: false, relockFailed: null, failure: null };
  try {
    return { ...done, outcome: upsertComment(run, repo, number, body, opts) };
  } catch (e) {
    let locked = false;
    try {
      locked = isLocked(run, repo, number);
    } catch {
      // not knowing whether it is locked, the first failure is the one to give
    }
    if (!locked) return { ...done, failure: words(e) };
  }
  try {
    lockOf(run, repo, number, 'DELETE');
  } catch (e) {
    return { ...done, failure: `could not unlock the locked conversation: ${words(e)}` };
  }
  const left = { ...done, unlocked: true };
  try {
    left.outcome = upsertComment(run, repo, number, body, opts);
  } catch (e) {
    left.failure = words(e);
  }
  try {
    lockOf(retrying(run, opts.sleep ? { sleep: opts.sleep } : {}), repo, number, 'PUT');
  } catch (e) {
    left.relockFailed = words(e);
  }
  return left;
}

/**
 * The two runners: {github, project}. `github` holds the workflow's own token (GH_TOKEN) and is for the repository:
 * reading, the issues and the comment. `project` holds PROJECT_TOKEN and is for the project board alone; it is null when
 * that is not set or is only blanks. Neither sees the other's token, nor GITHUB_TOKEN. Throws when GH_TOKEN is missing,
 * which is a mistake in the workflow.
 */
export function runnersFrom(env, spawn = spawnSync) {
  const workflow = String(env.GH_TOKEN ?? '').trim();
  if (!workflow) throw new Error('GH_TOKEN, the workflow’s own token, is not set; the workflow must pass it');
  const without = { PROJECT_TOKEN: undefined, GITHUB_TOKEN: undefined, GH_ENTERPRISE_TOKEN: undefined };
  const runner = (token) => ghRunner(spawn, { env, set: { ...without, GH_TOKEN: token } });
  const project = String(env.PROJECT_TOKEN ?? '').trim();
  return { github: runner(workflow), project: project ? runner(project) : null };
}
