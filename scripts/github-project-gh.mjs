// The thin layer between the GitHub mirror's plan and the gh command (spec §12, requirements_checked_in_ci): it reads
// what GitHub holds, and does a plan with `gh issue`, `gh label`, `gh project` and `gh api graphql`. All the thinking is
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
import {
  BUILD_STATUS_FIELD,
  PROJECT_TITLE,
  REMOVED_LABEL,
  adoptedId,
  idOfBody,
  labelStyle,
} from './github-project-desired.mjs';
import { planProject } from './github-project-plan.mjs';
import { RETRY_DELAYS_MS, paced, retrying, waitFor } from './github-project-retry.mjs';

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

/** The most labels, issues and projects a list is asked for; a list that comes back this long may be cut short. */
export const LABEL_CAP = 1000;
export const ISSUE_CAP = 5000;
export const PROJECT_CAP = 200;
/** The pause before each call that changes something but the first, and the wait before a retry, in milliseconds. */
export const PAUSE_MS = 1000;
export const RETRY_MS = 60000;

const PROJECT_FRAGMENT = `fragment P on ProjectV2 {
  id number title
  fields(first: 50) { nodes { ... on ProjectV2SingleSelectField { id name options { id name color description } } } }
  items(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      content { ... on Issue { number } }
      fieldValues(first: 20) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } } } }
    }
  }
}`;
const READ_PROJECT = `query($owner: String!, $number: Int!, $after: String) {
  repositoryOwner(login: $owner) {
    ... on User { projectV2(number: $number) { ...P } }
    ... on Organization { projectV2(number: $number) { ...P } }
  }
}
${PROJECT_FRAGMENT}`;
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
function graphql(run, query, variables) {
  const answer = JSON.parse(run(['api', 'graphql', '--input', '-'], JSON.stringify({ query, variables })));
  if (answer.errors?.length) throw new Error(`GitHub refused: ${answer.errors.map((e) => e.message).join('; ')}`);
  return answer.data;
}

/**
 * The project in the shape planProject reads: {id, number, fields: {name: {id, options}}, items: [{itemId, id, values}]}.
 * `idByNumber` maps an issue number to its requirement's id; an item that is not one of those issues is left out.
 */
export function readProject(run, owner, number, idByNumber) {
  let project;
  const items = [];
  let after = null;
  do {
    const page = graphql(run, READ_PROJECT, { owner, number, after }).repositoryOwner.projectV2;
    if (!page) throw new Error(`project ${number} of ${owner} could not be read`);
    project ??= page;
    for (const node of page.items.nodes) {
      const id = idByNumber.get(node.content?.number);
      if (id === undefined) continue;
      const values = {};
      for (const v of node.fieldValues.nodes) if (v.name && v.field?.name) values[v.field.name] = v.name;
      items.push({ itemId: node.id, id, values });
    }
    after = page.items.pageInfo.hasNextPage ? page.items.pageInfo.endCursor : null;
  } while (after !== null);
  const fields = {};
  for (const f of project.fields.nodes) if (f.name && f.options) fields[f.name] = { id: f.id, options: f.options };
  return { id: project.id, number: project.number, fields, items };
}

/** A list read from GitHub, refused when it is as long as the cap it was asked for and so may be only a part. */
function whole(list, cap, what) {
  if (list.length >= cap)
    throw new Error(
      `GitHub returned ${list.length} ${what}, as many as the ${cap} asked for, so the list may be only part of them`,
    );
  return list;
}

/** The three lists the mirror reads, each refused when it hit its cap; readRemote and the look before a retried create share them. */
const readLabels = (run, repo) =>
  whole(
    JSON.parse(run(inRepo(repo, ['label', 'list', '--limit', String(LABEL_CAP), '--json', 'name']))),
    LABEL_CAP,
    'labels',
  ).map((l) => l.name);
/**
 * The issues of a repository, only those `author` wrote where one is given: the mirror adopts only an issue its own login
 * wrote, so asking for those alone keeps issues anybody else files from reaching the cap of the list.
 */
export const readIssues = (run, repo, author) =>
  whole(
    JSON.parse(
      run(
        inRepo(repo, [
          ...['issue', 'list', '--state', 'all', '--limit', String(ISSUE_CAP)],
          ...(author ? ['--author', author] : []),
          ...['--json', 'number,title,body,state,labels,author,url'],
        ]),
      ),
    ),
    ISSUE_CAP,
    'issues',
  ).map((i) => ({ ...i, labels: i.labels.map((l) => l.name), author: i.author?.login }));
const readProjects = (run, owner) =>
  whole(
    JSON.parse(run(['project', 'list', '--owner', owner, '--format', 'json', '--limit', String(PROJECT_CAP)])).projects,
    PROJECT_CAP,
    'projects',
  );
export const findProject = (run, owner) => readProjects(run, owner).find((p) => p.title === PROJECT_TITLE);

/**
 * What GitHub holds now: {login, labelNames, issues, project}. `repo` is `owner/name`. The login is the one signed in,
 * whose issues alone may be adopted. Each issue is {number, title, body, state, labels (names), author (login), url};
 * the project is null when none has the title, else as readProject gives it, with the items of adopted issues only.
 * Throws for a list that hit its cap.
 */
export function readRemote(run, repo) {
  const login = JSON.parse(run(['api', 'user'])).login;
  const labelNames = readLabels(run, repo);
  const issues = readIssues(run, repo, login);
  const found = findProject(run, ownerOf(repo));
  if (!found) return { login, labelNames, issues, project: null };
  const idByNumber = new Map(issues.flatMap((i) => (adoptedId(i, login) ? [[i.number, adoptedId(i, login)]] : [])));
  return { login, labelNames, issues, project: readProject(run, ownerOf(repo), found.number, idByNumber) };
}

/**
 * For a call that changes something, how to find out after a transient failure whether it already went through (see
 * paced): a function that re-reads what GitHub holds and gives {value}, what the call would have given, or undefined.
 * A create has one. An issue is taken up only as readRemote would adopt it: by the requirement id in its marker, and
 * only when the signed-in login wrote it, so somebody else's issue with the same title and body is never taken. A call
 * that changes only to a state it is given (an edit, a close, a reopen, adding to a project, setting a value, replacing
 * a field's options) has one that always says undefined, so it is simply tried again. A call a second try could repeat
 * (a comment, a new field) gives null and is not tried again.
 */
function lookup(args, input, read) {
  const [group, verb] = args;
  const flag = (name) => args[args.indexOf(name) + 1];
  if (group === 'issue' && verb === 'create')
    return () => {
      const login = JSON.parse(read(['api', 'user'])).login;
      const id = idOfBody(input);
      const made = readIssues(read, flag('--repo'), login).find((i) => id && adoptedId(i, login) === id);
      return made && { value: `${made.url}\n` };
    };
  if (group === 'label' && verb === 'create')
    return () => (readLabels(read, flag('--repo')).includes(args[2]) ? { value: '' } : undefined);
  if (group === 'project' && verb === 'create')
    return () => {
      const made = readProjects(read, flag('--owner')).find((p) => p.title === flag('--title'));
      return made && { value: JSON.stringify({ id: made.id, number: made.number }) };
    };
  const once = (group === 'issue' && verb === 'comment') || (group === 'api' && /createProjectV2Field/.test(input));
  return once ? null : () => undefined;
}

const flags = (flag, values) => values.flatMap((v) => [flag, v]);

function doIssues(act, repo, plan) {
  const made = {};
  const issue = (...args) => inRepo(repo, ['issue', ...args]);
  for (const d of plan.issues.create) {
    const url = act(
      issue('create', '--title', d.title, '--body-file', '-', ...flags('--label', d.labels)),
      d.body,
    ).trim();
    made[d.id] = { number: Number(url.split('/').at(-1)), url };
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
  const settings = { sleep: waitFor, pauseMs: PAUSE_MS, retryMs: RETRY_MS, delays: RETRY_DELAYS_MS, lookup, ...opts };
  const act = paced(run, settings);
  const read = retrying(run, settings);
  const owner = ownerOf(repo);
  for (const name of plan.labels) {
    const { color, description } = labelStyle(name);
    act(inRepo(repo, ['label', 'create', name, '--color', color, '--description', description]));
  }
  const made = doIssues(act, repo, plan);
  const known = { ...plan.issues.held, ...made };
  const idByNumber = new Map(Object.entries(known).map(([id, i]) => [i.number, id]));

  let ref = plan.projectRef;
  if (!ref) {
    const created = JSON.parse(
      act(['project', 'create', '--owner', owner, '--title', PROJECT_TITLE, '--format', 'json']),
    );
    ref = { id: created.id, number: created.number };
  }
  const { issues, fields } = plan.desired;
  let remote = readProject(read, owner, ref.number, idByNumber);
  let todo = planProject(issues, fields, remote);
  if (todo.fields.length) {
    doFields(act, ref, remote, todo.fields);
    remote = readProject(read, owner, ref.number, idByNumber);
    todo = planProject(issues, fields, remote);
  }
  const itemIds = new Map(remote.items.map((i) => [i.id, i.itemId]));
  for (const id of todo.itemsAdd) {
    if (!known[id]) throw new Error(`requirement ${id} has no issue to add to the project`);
    const added = JSON.parse(
      act(['project', 'item-add', String(ref.number), '--owner', owner, '--url', known[id].url, '--format', 'json']),
    );
    itemIds.set(id, added.id);
  }
  for (const set of todo.sets) {
    const field = remote.fields[set.field];
    act([
      'project',
      'item-edit',
      '--id',
      itemIds.get(set.id),
      '--project-id',
      ref.id,
      '--field-id',
      field.id,
      '--single-select-option-id',
      field.options.find((o) => o.name === set.to).id,
    ]);
  }
}
