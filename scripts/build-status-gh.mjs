// The thin layer between the build status and GitHub (spec §12, requirements_checked_in_ci): it reads a pull request, the
// requirements file at a ref, a commit's checks and the releases, leaves the pull request's one comment, and reads and
// writes the project's Build status field. All the thinking is in build-status.mjs; this layer only asks and tells,
// through runners handed in — run(args, input) gives gh's output — so a test can hand in stand-ins and no network is
// touched. Two runners, each with its own token: the workflow's own token for the repository (reads and the comment),
// and PROJECT_TOKEN for the project board alone. A pull request is only ever read as data through the API: no file of
// it is checked out and none of its code is run.
import { spawnSync } from 'node:child_process';
import { REQUIREMENTS } from './check-requirements.mjs';
import { COMMENT_MARKER } from './build-status.mjs';
import { BUILD_STATUS_FIELD, PROJECT_TITLE, adoptedId } from './github-project-desired.mjs';
import { ghRunner, readRemote } from './github-project-gh.mjs';
import { retrying } from './github-project-retry.mjs';

/** The checks that are not of the change itself: the job that only wakes the build status. */
export const IGNORED_CHECKS = ['build-status-trigger'];
/** The most bytes of a requirements file it will read; the file is a few hundred thousand. */
export const MAX_FILE_BYTES = 3_000_000;

const PAGE = 100;
const SHA = /^[0-9a-f]{40}$/;
const REF = /^[\w][\w.+/-]{0,199}$/;
const NOT_FOUND = /HTTP 404|Not Found/;
const COMMENTER = 'github-actions[bot]';

/** A trouble with the board that is not GitHub refusing a call: the project or its field is not there yet. */
export class BoardProblem extends Error {}

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
 * A pull request as {number, state ('open' or 'closed'), merged, mergeSha, headSha, baseRef}. Throws for a number that is
 * not a whole number, and for a head commit or base branch the API gives in a form git would not use.
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
    mergeSha,
    headSha: data.head.sha,
    baseRef: data.base.ref,
  };
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
 * there is no such file or ref. Throws for any other failure, and for a file over MAX_FILE_BYTES.
 */
export function readRequirementsAt(run, repo, ref) {
  if (!REF.test(String(ref))) throw new Error(`${ref} is not a ref`);
  const args = ['api', `repos/${repo}/contents/${REQUIREMENTS}`, '--method', 'GET', '-f', `ref=${ref}`];
  let text;
  try {
    text = run([...args, '-H', 'Accept: application/vnd.github.raw+json']);
  } catch (e) {
    if (NOT_FOUND.test(words(e))) return null;
    throw e;
  }
  if (text.length > MAX_FILE_BYTES) throw new Error(`${REQUIREMENTS} at ${ref} is too large (${text.length} bytes)`);
  return text;
}

/**
 * The checks of a commit as a status check rollup, the shape the slice board counts: a check run as {status,
 * conclusion} and a commit status as {state}, upper case. The job that only wakes the build status is left out. Throws
 * when a list is as long as the page asked for, since it may be only a part.
 */
export function checkRollup(run, repo, sha) {
  const runs = json(run, repo, `commits/${commit(sha)}/check-runs?per_page=${PAGE}`);
  const statuses = json(run, repo, `commits/${sha}/status?per_page=${PAGE}`).statuses ?? [];
  if (runs.check_runs.length >= PAGE || statuses.length >= PAGE)
    throw new Error(`GitHub returned as many checks as one page holds, so there may be more than ${PAGE}`);
  return [
    ...runs.check_runs
      .filter((r) => !IGNORED_CHECKS.includes(r.name))
      .map((r) => ({ status: String(r.status).toUpperCase(), conclusion: String(r.conclusion ?? '').toUpperCase() })),
    ...statuses.map((s) => ({ state: String(s.state).toUpperCase() })),
  ];
}

/**
 * The tag of the release published just before `tag`, drafts left out, or null when there is none. A tag the list does
 * not hold yet (a release that has only just been published) has the newest release before it.
 */
export function releaseBefore(run, repo, tag) {
  const published = json(run, repo, `releases?per_page=${PAGE}`)
    .filter((r) => !r.draft && r.published_at)
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
  const at = published.findIndex((r) => r.tag_name === tag);
  const before = at === -1 ? published.at(-1) : published[at - 1];
  return before?.tag_name ?? null;
}

const sameText = (a, b) =>
  String(a).replaceAll('\r\n', '\n').trimEnd() === String(b).replaceAll('\r\n', '\n').trimEnd();

/**
 * Leaves the pull request's one comment: found by its marker among the comments the workflow's bot wrote (a person who
 * writes the marker in their own is not it), then updated, or made when there is none, unless `create` is false. Gives
 * 'created', 'updated', 'unchanged' (the text is the same, so nothing is written) or 'absent' (none, and none made). The
 * text goes on the input, never in the arguments.
 */
export function upsertComment(run, repo, number, body, { create = true } = {}) {
  const pages = JSON.parse(
    run(['api', `repos/${repo}/issues/${wholeNumber(number)}/comments?per_page=${PAGE}`, '--paginate', '--slurp']),
  );
  const mine = pages
    .flat()
    .find((c) => c.user?.login === COMMENTER && c.user?.type === 'Bot' && String(c.body).startsWith(COMMENT_MARKER));
  if (mine && sameText(mine.body, body)) return 'unchanged';
  const input = JSON.stringify({ body });
  if (mine) {
    run(['api', `repos/${repo}/issues/comments/${mine.id}`, '--method', 'PATCH', '--input', '-'], input);
    return 'updated';
  }
  if (!create) return 'absent';
  run(['api', `repos/${repo}/issues/${number}/comments`, '--method', 'POST', '--input', '-'], input);
  return 'created';
}

/**
 * The project's Build status field as {items, issues, field, projectId, projectNumber, owner}: `items` maps a
 * requirement id to {itemId, current (its Build status, or null), number and url (its issue's)}, `issues` maps an id to
 * its issue {number, url} whether or not it is an item, and `field` is {id, options}. Found as the mirror finds it, by
 * the project's title and the issues it made. Throws BoardProblem when the project or the field is not there yet.
 */
export function readBuildBoard(run, repo, opts = {}) {
  const remote = readRemote(retrying(run, opts), repo);
  if (!remote.project) throw new BoardProblem(`the project "${PROJECT_TITLE}" was not found`);
  const field = remote.project.fields[BUILD_STATUS_FIELD];
  if (!field)
    throw new BoardProblem(
      `the project has no ${BUILD_STATUS_FIELD} field yet; run scripts/github-project.mjs --apply to make it`,
    );
  const issues = new Map();
  for (const issue of [...remote.issues].sort((a, b) => a.number - b.number)) {
    const id = adoptedId(issue, remote.login);
    if (id && !issues.has(id)) issues.set(id, { number: issue.number, url: issue.url });
  }
  const items = new Map(
    remote.project.items.map((i) => [
      i.id,
      { itemId: i.itemId, current: i.values[BUILD_STATUS_FIELD] ?? null, ...issues.get(i.id) },
    ]),
  );
  return {
    items,
    issues,
    field,
    projectId: remote.project.id,
    projectNumber: remote.project.number,
    owner: repo.split('/')[0],
  };
}

/** Sets the Build status of a requirement's item to `value` (one of the field's options), and notes it on the item. */
export function setBuildStatus(run, board, id, value, opts = {}) {
  const item = board.items.get(id);
  if (!item) throw new BoardProblem(`${id} is not an item of the project`);
  const option = board.field.options.find((o) => o.name === value);
  if (!option) throw new BoardProblem(`the ${BUILD_STATUS_FIELD} field has no option ${value}`);
  const args = ['project', 'item-edit', '--id', item.itemId, '--project-id', board.projectId];
  retrying(run, opts)([...args, '--field-id', board.field.id, '--single-select-option-id', option.id]);
  item.current = value;
}

/**
 * The two runners: {github, project}. `github` holds the workflow's own token (GH_TOKEN) and is for the repository:
 * reading and the comment. `project` holds PROJECT_TOKEN and is for the project board alone; it is null when that is not
 * set or is only blanks. Neither sees the other's token, nor GITHUB_TOKEN. Throws when GH_TOKEN is missing, which is a
 * mistake in the workflow.
 */
export function runnersFrom(env, spawn = spawnSync) {
  const workflow = String(env.GH_TOKEN ?? '').trim();
  if (!workflow) throw new Error('GH_TOKEN, the workflow’s own token, is not set; the workflow must pass it');
  const without = { PROJECT_TOKEN: undefined, GITHUB_TOKEN: undefined, GH_ENTERPRISE_TOKEN: undefined };
  const runner = (token) => ghRunner(spawn, { env, set: { ...without, GH_TOKEN: token } });
  const project = String(env.PROJECT_TOKEN ?? '').trim();
  return { github: runner(workflow), project: project ? runner(project) : null };
}
