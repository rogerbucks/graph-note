// The thin layer between the GitHub mirror's plan and the gh command (spec §12, requirements_checked_in_ci): it reads
// what GitHub holds, and does a plan with `gh issue`, `gh label`, `gh project` and `gh api graphql`. All the thinking is
// in github-project-plan.mjs; this layer only asks and tells, through a runner handed in — run(args, input) gives gh's
// output — so a test can hand in a stand-in and no network is touched. It never deletes anything.
import { spawnSync } from 'node:child_process';
import { REQUIREMENTS } from './check-requirements.mjs';
import { PROJECT_TITLE, REMOVED_LABEL, idOfBody, labelStyle } from './github-project-desired.mjs';
import { planProject } from './github-project-plan.mjs';

const STATUS_COLOURS = { open: 'ORANGE', part: 'YELLOW', proved: 'GREEN' };

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
 */
export function ghRunner(spawn = spawnSync) {
  return (args, input) => {
    const result = spawn('gh', args, { input, encoding: 'utf8', maxBuffer: 1 << 28 });
    if (result.error)
      throw new Error(`gh could not be run (${result.error.message}); is the GitHub CLI installed and on the path?`);
    if (result.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${String(result.stderr).trim()}`);
    return result.stdout;
  };
}

/** The login of the owner of the repository gh is in. */
export const repoOwner = (run) => JSON.parse(run(['repo', 'view', '--json', 'owner'])).owner.login;

function graphql(run, query, variables) {
  const answer = JSON.parse(run(['api', 'graphql', '--input', '-'], JSON.stringify({ query, variables })));
  if (answer.errors?.length) throw new Error(`GitHub refused: ${answer.errors.map((e) => e.message).join('; ')}`);
  return answer.data;
}

/**
 * The project in the shape planProject reads: {id, number, fields: {name: {id, options}}, items: [{itemId, id, values}]}.
 * `idByNumber` maps an issue number to its requirement's id; an item that is not one of those issues is left out.
 */
function readProject(run, owner, number, idByNumber) {
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

const findProject = (run, owner) =>
  JSON.parse(run(['project', 'list', '--owner', owner, '--format', 'json', '--limit', '200'])).projects.find(
    (p) => p.title === PROJECT_TITLE,
  );

/**
 * What GitHub holds now: {labelNames, issues, project}. Each issue is {number, title, body, state, labels (names), url};
 * the project is null when none has the title, else as readProject gives it.
 */
export function readRemote(run, owner) {
  const labelNames = JSON.parse(run(['label', 'list', '--limit', '1000', '--json', 'name'])).map((l) => l.name);
  const issues = JSON.parse(
    run(['issue', 'list', '--state', 'all', '--limit', '5000', '--json', 'number,title,body,state,labels,url']),
  ).map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const found = findProject(run, owner);
  if (!found) return { labelNames, issues, project: null };
  const idByNumber = new Map(issues.flatMap((i) => (idOfBody(i.body) ? [[i.number, idOfBody(i.body)]] : [])));
  return { labelNames, issues, project: readProject(run, owner, found.number, idByNumber) };
}

const flags = (flag, values) => values.flatMap((v) => [flag, v]);

function doIssues(run, plan) {
  const made = {};
  for (const d of plan.issues.create) {
    const url = run(
      ['issue', 'create', '--title', d.title, '--body-file', '-', ...flags('--label', d.labels)],
      d.body,
    ).trim();
    made[d.id] = { number: Number(url.split('/').at(-1)), url };
    if (d.state === 'closed') run(['issue', 'close', String(made[d.id].number), '--reason', 'completed']);
  }
  for (const u of plan.issues.update) {
    const args = ['issue', 'edit', String(u.number)];
    if (u.title) args.push('--title', u.issue.title);
    if (u.body) args.push('--body-file', '-');
    run(
      [...args, ...flags('--add-label', u.addLabels), ...flags('--remove-label', u.removeLabels)],
      u.body ? u.issue.body : undefined,
    );
  }
  for (const i of plan.issues.close) run(['issue', 'close', String(i.number), '--reason', 'completed']);
  for (const i of plan.issues.reopen) run(['issue', 'reopen', String(i.number)]);
  for (const r of plan.issues.removed) {
    const number = String(r.number);
    if (r.label) run(['issue', 'edit', number, '--add-label', REMOVED_LABEL]);
    if (r.comment)
      run(
        ['issue', 'comment', number, '--body-file', '-'],
        `Requirement \`${r.id}\` is no longer in \`${REQUIREMENTS}\`, so this issue is closed and labelled \`${REMOVED_LABEL}\`. It is kept, not deleted. Generated: do not edit.\n`,
      );
    if (r.close) run(['issue', 'close', number, '--reason', 'not planned']);
  }
  return made;
}

const optionInput = (name, field, old) => ({
  name,
  color: old?.color ?? (field === 'Status' ? (STATUS_COLOURS[name] ?? 'GRAY') : 'GRAY'),
  description: old?.description ?? '',
});

function doFields(run, project, remote, fieldPlans) {
  for (const f of fieldPlans) {
    if (f.create) {
      graphql(run, CREATE_FIELD, {
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
    graphql(run, UPDATE_FIELD, { field: have.id, options });
  }
}

/**
 * Does a plan from buildPlan, in order: labels, issues, then the project. The project is read again after its fields
 * change, because replacing a field's options gives them new ids and clears the values set from them, and its items and
 * values are planned afresh from that — so a run stopped half way is finished by the next, which changes only what is
 * still different. Throws, with gh's words, at the first call that fails.
 */
export function executePlan(run, owner, plan) {
  for (const name of plan.labels) {
    const { color, description } = labelStyle(name);
    run(['label', 'create', name, '--color', color, '--description', description]);
  }
  const made = doIssues(run, plan);
  const known = { ...plan.issues.held, ...made };
  const idByNumber = new Map(Object.entries(known).map(([id, i]) => [i.number, id]));

  let ref = plan.projectRef;
  if (!ref) {
    const created = JSON.parse(
      run(['project', 'create', '--owner', owner, '--title', PROJECT_TITLE, '--format', 'json']),
    );
    ref = { id: created.id, number: created.number };
  }
  const { issues, fields } = plan.desired;
  let remote = readProject(run, owner, ref.number, idByNumber);
  let todo = planProject(issues, fields, remote);
  if (todo.fields.length) {
    doFields(run, ref, remote, todo.fields);
    remote = readProject(run, owner, ref.number, idByNumber);
    todo = planProject(issues, fields, remote);
  }
  const itemIds = new Map(remote.items.map((i) => [i.id, i.itemId]));
  for (const id of todo.itemsAdd) {
    if (!known[id]) throw new Error(`requirement ${id} has no issue to add to the project`);
    const added = JSON.parse(
      run(['project', 'item-add', String(ref.number), '--owner', owner, '--url', known[id].url, '--format', 'json']),
    );
    itemIds.set(id, added.id);
  }
  for (const set of todo.sets) {
    const field = remote.fields[set.field];
    run([
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
