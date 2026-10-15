// The thin layer between the GitHub mirror's plan and the gh command (spec §12, requirements_checked_in_ci): it reads
// what GitHub holds, and does a plan with `gh issue`, `gh label` and `gh api graphql`. All the thinking is
// in github-project-plan.mjs; this layer only asks and tells, through a runner handed in — run(args, input) gives gh's
// output — so a test can hand in a stand-in and no network is touched. It never deletes anything. It is careful where it
// goes (gh runs in this repository's folder, with no repository or host from the environment; the repository gh points
// at must be the origin's; every issue and label call names the repository, and every project call the owner) and how
// fast (a pause between calls that change something, one retry on a secondary rate limit, and a refusal of any list that
// hit its cap and so may be only part of what GitHub holds).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIREMENTS } from './check-requirements.mjs';
import { itemValueMutation, typedMutation, withClosedOn } from './github-project-fields.mjs';
import {
  BUILD_STATUS_FIELD,
  PROJECT_TITLE,
  REMOVED_LABEL,
  adoptedId,
  idOfBody,
  labelStyle,
} from './github-project-desired.mjs';
import { ISSUE_CAP, adoptersOf, authorOf, createGuard, readAdoptable, readIssues } from './github-project-issues.mjs';
import { planProject } from './github-project-plan.mjs';
import {
  PROJECT_CAP,
  findProject,
  graphql,
  issueNodeId,
  ownerId,
  readProject,
  readProjects,
  whole,
} from './github-project-read.mjs';
import { RETRY_DELAYS_MS, paced, retrying, waitFor } from './github-project-retry.mjs';

// the project is read by github-project-read.mjs, the issues by github-project-issues.mjs; these stay importable from here
export { ISSUE_CAP, PROJECT_CAP, adoptersOf, authorOf, findProject, readAdoptable, readIssues, readProject };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OPTION_COLOURS = {
  Proof: { open: 'ORANGE', part: 'YELLOW', proved: 'GREEN' },
  [BUILD_STATUS_FIELD]: {
    'In PR': 'BLUE',
    'Checks failing': 'RED',
    'Checks passing': 'YELLOW',
    Merged: 'PURPLE',
    Released: 'GREEN',
  },
};

/** The most labels a list is asked for; a list that comes back this long may be cut short (issues: ISSUE_CAP). */
export const LABEL_CAP = 1000;
/** The pause before each call that changes something but the first, and the wait before a retry, in milliseconds. */
export const PAUSE_MS = 1000;
export const RETRY_MS = 60000;

// the project is made and filled through GraphQL, not `gh project create` and `gh project item-add`, which ask gh to resolve
// the owner's type first (see github-project-read.mjs)
const CREATE_PROJECT = `mutation($owner: ID!, $title: String!) {
  createProjectV2(input: {ownerId: $owner, title: $title}) { projectV2 { id number title } }
}`;
const ADD_ITEM = `mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id } }
}`;
const CREATE_FIELD = `mutation($project: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
  createProjectV2Field(input: {projectId: $project, dataType: SINGLE_SELECT, name: $name, singleSelectOptions: $options}) {
    projectV2Field { ... on ProjectV2SingleSelectField { id name } }
  }
}`;
const UPDATE_FIELD = `mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
  updateProjectV2Field(input: {fieldId: $field, singleSelectOptions: $options}) {
    projectV2Field { ... on ProjectV2SingleSelectField { id name } }
  }
}`;

/**
 * The real runner: run(args, input) runs `gh` with the arguments, giving it the input on its standard input, and gives
 * its output. Throws with gh's own words when gh fails or cannot be started. `spawn` is spawnSync, or a stand-in.
 * `options.env` is the environment gh starts from (the process's own by default) and `options.set` names variables to
 * add to it, or, given as undefined, to take out, so that a runner can hold its own token and see no other.
 */
export function ghRunner(spawn = spawnSync, { env: from = process.env, set = {} } = {}) {
  // GH_REPO and GH_HOST would send gh somewhere the checkout does not say, so gh never sees them.
  const { GH_REPO: _repo, GH_HOST: _host, ...rest } = from;
  const env = { ...rest, ...set };
  for (const name of Object.keys(env)) if (env[name] === undefined) delete env[name];
  return (args, input) => {
    const result = spawn('gh', args, { input, encoding: 'utf8', maxBuffer: 1 << 28, cwd: ROOT, env });
    if (result.error)
      throw new Error(`gh could not be run (${result.error.message}); is the GitHub CLI installed and on the path?`);
    if (result.status !== 0) {
      const stderr = String(result.stderr).trim();
      // gh's own words are kept apart, so a retry judges them and not the arguments of the call
      throw Object.assign(new Error(`gh ${args.join(' ')} failed: ${stderr}`), { stderr });
    }
    return result.stdout;
  };
}

/** Remote text with any login or token before an `@` shown as `***@`, so no error repeats a credential. */
export const redactRemote = (text) => String(text).replace(/[^\s/@]+@/g, '***@');

/**
 * The host and `owner/name` an origin remote url names, as {host, repo}, in any of the ways a remote is written. Throws
 * for any other, and for a host that is not github.com; `hosts` replaces the allowed hosts (for a test). The remote is
 * never echoed with its userinfo.
 */
export function repoOfRemote(url, { hosts = ['github.com'] } = {}) {
  const text = redactRemote(String(url ?? '').trim());
  const raw = String(url ?? '').trim();
  const m =
    /^[a-z][\w+.-]*:\/\/([^/]+)\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(raw) ??
    /^[^@\s/]+@([^:\s/]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(raw);
  if (!m) throw new Error(`the origin remote (${text || 'none'}) does not name a repository as owner/name`);
  const host = m[1].replace(/^.*@/, '').replace(/:\d*$/, '').toLowerCase();
  if (!hosts.includes(host))
    throw new Error(
      `the origin remote (${text}) is on the host ${host}, which is not ${hosts.join(' or ')}; nothing was read or changed`,
    );
  return { host, repo: `${m[2]}/${m[3]}` };
}

/**
 * The repository gh points at, as `owner/name`, which must be `expected` (the checkout's origin; case does not matter).
 * Throws, having asked nothing else, when it is another.
 */
export function pinRepo(run, expected) {
  const actual = JSON.parse(run(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  if (actual.toLowerCase() !== expected.toLowerCase())
    throw new Error(`gh points at ${actual}, but this checkout's origin is ${expected}; nothing was read or changed`);
  return actual;
}

const ownerOf = (repo) => repo.split('/')[0];
/** A call's arguments with the repository named, as every issue and label call must. */
const inRepo = (repo, args) => [...args, '--repo', repo];
/** The three lists the mirror reads, each refused when it hit its cap; readRemote and the look before a retried create share them. */
const readLabels = (run, repo) =>
  whole(
    JSON.parse(run(inRepo(repo, ['label', 'list', '--limit', String(LABEL_CAP), '--json', 'name']))),
    LABEL_CAP,
    'labels',
  ).map((l) => l.name);

/**
 * What GitHub holds now: {login, adopters, labelNames, issues, project}. `repo` is `owner/name`. The login is the one
 * that makes issues: `creator` where it is given (the workflow's bot, whose token may not ask who it is), else the one
 * signed in. Only the issues of the adopters (the owner and the bot) may be adopted, and only theirs are read. Each issue
 * is {number, title, body, state, labels (names), author (login), url, closedAt}; the project is null when none has the
 * title, undefined when `project` is false (it is not read), else as readProject gives it, with the items of adopted
 * issues only. Throws for a list that hit its cap.
 */
export function readRemote(run, repo, { creator, project = true } = {}) {
  const login = creator ?? JSON.parse(run(['api', 'user'])).login;
  const adopters = adoptersOf(repo);
  const labelNames = readLabels(run, repo);
  const issues = readAdoptable(run, repo, adopters);
  const base = { login, adopters, labelNames, issues };
  if (!project) return { ...base, project: undefined };
  const found = findProject(run, ownerOf(repo));
  if (!found) return { ...base, project: null };
  const idByNumber = new Map(
    issues.flatMap((i) => (adoptedId(i, adopters) ? [[i.number, adoptedId(i, adopters)]] : [])),
  );
  return { ...base, project: readProject(run, ownerOf(repo), found.number, idByNumber) };
}

/**
 * For a call that changes something, how to find out after a transient failure whether it already went through (see
 * paced): a function that re-reads what GitHub holds and gives {value}, what the call would have given, or undefined.
 * A create has one. An issue is taken up only as readRemote would adopt it: by the requirement id in its marker, and
 * only when one of the adopters wrote it, so somebody else's issue with the same title and body is never taken. A call
 * that changes only to a state it is given (an edit, a close, a reopen, adding to a project, setting a value, replacing
 * a field's options) has one that always says undefined, so it is simply tried again. A call a second try could repeat
 * (a comment, a new field) gives null and is not tried again.
 */
function lookup(args, input, read, owner, adopters) {
  const [group, verb] = args;
  const flag = (name) => args[args.indexOf(name) + 1];
  if (group === 'issue' && verb === 'create')
    return () => {
      const id = idOfBody(input);
      const made = readAdoptable(read, flag('--repo'), adopters).find((i) => id && adoptedId(i, adopters) === id);
      return made && { value: `${made.url}\n` };
    };
  if (group === 'label' && verb === 'create')
    return () => (readLabels(read, flag('--repo')).includes(args[2]) ? { value: '' } : undefined);
  if (group === 'api' && /createProjectV2\(/.test(input))
    return () => {
      const title = JSON.parse(input).variables.title;
      const made = readProjects(read, owner).find((p) => p.title === title);
      return made && { value: JSON.stringify({ data: { createProjectV2: { projectV2: made } } }) };
    };
  const once = (group === 'issue' && verb === 'comment') || (group === 'api' && /createProjectV2Field/.test(input));
  return once ? null : () => undefined;
}

const flags = (flag, values) => values.flatMap((v) => [flag, v]);

function doIssues(act, repo, plan, guard) {
  const made = {};
  const issue = (...args) => inRepo(repo, ['issue', ...args]);
  if (plan.issues.create.length) guard.before();
  for (const d of plan.issues.create) {
    const url = act(
      issue('create', '--title', d.title, '--body-file', '-', ...flags('--label', d.labels)),
      d.body,
    ).trim();
    made[d.id] = { number: Number(url.split('/').at(-1)), url };
    // the first one made must be in the list by creator, or every run would make it again
    if (Object.keys(made).length === 1) guard.after(made[d.id].number);
    if (d.state === 'closed') act(issue('close', String(made[d.id].number), '--reason', 'completed'));
  }
  for (const u of plan.issues.update) {
    const args = ['edit', String(u.number)];
    if (u.title) args.push('--title', u.issue.title);
    if (u.body) args.push('--body-file', '-');
    act(
      issue(...args, ...flags('--add-label', u.addLabels), ...flags('--remove-label', u.removeLabels)),
      u.body ? u.issue.body : undefined,
    );
  }
  for (const i of plan.issues.close) act(issue('close', String(i.number), '--reason', 'completed'));
  for (const i of plan.issues.reopen) act(issue('reopen', String(i.number)));
  for (const r of plan.issues.removed) {
    const number = String(r.number);
    if (r.label) act(issue('edit', number, '--add-label', REMOVED_LABEL));
    if (r.comment)
      act(
        issue('comment', number, '--body-file', '-'),
        `Requirement \`${r.id}\` is no longer in \`${REQUIREMENTS}\`, so this issue is closed and labelled \`${REMOVED_LABEL}\`. It is kept, not deleted. Generated: do not edit.\n`,
      );
    if (r.close) act(issue('close', number, '--reason', 'not planned'));
  }
  return made;
}

const optionInput = (name, field, old) => ({
  name,
  color: old?.color ?? OPTION_COLOURS[field]?.[name] ?? 'GRAY',
  description: old?.description ?? '',
});

function doFields(act, project, remote, fieldPlans) {
  for (const f of fieldPlans) {
    if (f.create) {
      graphql(act, CREATE_FIELD, {
        project: project.id,
        name: f.name,
        options: f.add.map((o) => optionInput(o, f.name)),
      });
      continue;
    }
    const have = remote.fields[f.name];
    const options = [
      ...have.options.map((o) => optionInput(o.name, f.name, o)),
      ...f.add.map((o) => optionInput(o, f.name)),
    ];
    graphql(act, UPDATE_FIELD, { field: have.id, options });
  }
}

/**
 * Does a plan from buildPlan in `repo` (`owner/name`), in order: labels, issues, then the project. The project is read
 * again after its fields change, because replacing a field's options gives them new ids and clears the values set from
 * them, and its items and values are planned afresh from that — so a run stopped half way is finished by the next, which
 * changes only what is still different. Each call that changes something goes through a pause, and a retry once on a
 * secondary rate limit; a call that fails in a transient way (a timeout, a reset connection, a 502, 503 or 504, "Bad
 * Gateway", "something went wrong") is tried again up to three times after `delays`, and a create that may have half
 * happened is looked for first, so it is never made twice. `opts` may give another `sleep` (milliseconds, blocking),
 * `pauseMs`, `retryMs` and `delays`. Throws, with gh's words, at the first call that fails for good.
 */
export function executePlan(run, repo, plan, opts = {}) {
  const owner = ownerOf(repo);
  const lookingFor = (args, input, read) => lookup(args, input, read, owner, plan.adopters ?? adoptersOf(repo));
  const settings = {
    sleep: waitFor,
    pauseMs: PAUSE_MS,
    retryMs: RETRY_MS,
    delays: RETRY_DELAYS_MS,
    lookup: lookingFor,
    ...opts,
  };
  const act = paced(run, settings);
  const read = retrying(run, settings);
  for (const name of plan.labels) {
    const { color, description } = labelStyle(name);
    act(inRepo(repo, ['label', 'create', name, '--color', color, '--description', description]));
  }
  const made = doIssues(act, repo, plan, createGuard(read, repo, plan));
  if (plan.project.unread) return;
  const known = { ...plan.issues.held, ...made };
  const idByNumber = new Map(Object.entries(known).map(([id, i]) => [i.number, id]));
  // an issue closed, reopened or made just now has its Closed on only once GitHub holds it
  const { create, close, reopen } = plan.issues;
  const issues =
    create.length || close.length || reopen.length
      ? withClosedOn(plan.desired.issues, readAdoptable(read, repo, plan.adopters), plan.adopters)
      : plan.dated;

  let ref = plan.projectRef;
  if (!ref) {
    const created = graphql(act, CREATE_PROJECT, { owner: ownerId(read, owner), title: PROJECT_TITLE }).createProjectV2;
    ref = { id: created.projectV2.id, number: created.projectV2.number };
  }
  const { fields, iterations = null } = plan.desired;
  const replan = (project) => planProject(issues, fields, project, iterations);
  let remote = readProject(read, owner, ref.number, idByNumber);
  let todo = replan(remote);
  if (todo.fields.length || todo.typed.length) {
    doFields(act, ref, remote, todo.fields);
    for (const typed of todo.typed) {
      const { query, variables } = typedMutation(ref.id, typed, remote.typed);
      graphql(act, query, variables);
    }
    remote = readProject(read, owner, ref.number, idByNumber);
    todo = replan(remote);
  }
  const itemIds = new Map(remote.items.map((i) => [i.id, i.itemId]));
  for (const id of todo.itemsAdd) {
    if (!known[id]) throw new Error(`requirement ${id} has no issue to add to the project`);
    const content = issueNodeId(read, repo, known[id].number);
    const added = graphql(act, ADD_ITEM, { project: ref.id, content }).addProjectV2ItemById.item;
    itemIds.set(id, added.id);
  }
  for (const set of todo.sets) {
    const field = remote.fields[set.field] ?? remote.typed[set.field];
    const { query, variables } = itemValueMutation(ref.id, itemIds.get(set.id), set.field, field, set.to);
    graphql(act, query, variables);
  }
}
