// Reading the project for the GitHub mirror and the build status (spec §12, requirements_checked_in_ci): finding the
// project of an owner by its title, and reading its fields and items, all through GraphQL with a runner handed in (see
// github-project-gh.mjs). The project is found by the owner's login, user or organization, and never by `gh project list`,
// which asks gh to resolve the owner's type first and fails ("unknown owner type") for a token with only the project scope.
import { PROJECT_TITLE } from './github-project-desired.mjs';

/** The most projects a list is asked for; a list that comes back this long may be cut short. */
export const PROJECT_CAP = 200;

const ITERATION = 'id title startDate duration';
const PROJECT_FRAGMENT = `fragment P on ProjectV2 {
  id number title
  fields(first: 50) { nodes {
    ... on ProjectV2SingleSelectField { id name options { id name color description } }
    ... on ProjectV2Field { id name dataType }
    ... on ProjectV2IterationField { id name dataType configuration { iterations { ${ITERATION} } completedIterations { ${ITERATION} } } }
  } }
  items(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      content { ... on Issue { number } }
      fieldValues(first: 30) { nodes {
        ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
        ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2Field { name } } }
        ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2Field { name } } }
        ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2IterationField { name } } }
      } }
    }
  }
}`;
/** A field value as the item holds it: an option's name, a day, a number or an iteration's title, or undefined. */
const valueOf = (v) => v.name ?? v.date ?? v.number ?? v.title;
const READ_PROJECT = `query($owner: String!, $number: Int!, $after: String) {
  repositoryOwner(login: $owner) {
    ... on User { projectV2(number: $number) { ...P } }
    ... on Organization { projectV2(number: $number) { ...P } }
  }
}
${PROJECT_FRAGMENT}`;
const LIST_PROJECTS = `query($owner: String!, $after: String) {
  repositoryOwner(login: $owner) {
    ... on User { projectsV2(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id number title } } }
    ... on Organization { projectsV2(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id number title } } }
  }
}`;

const OWNER_ID = `query($owner: String!) { repositoryOwner(login: $owner) { id } }`;
const ISSUE_ID = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { id } }
}`;

const noOwner = (owner) => new Error(`the owner ${owner} could not be found`);

/** The node id of a user or an organization, by its login. Throws, naming the owner, where there is none. */
export function ownerId(run, owner) {
  const found = graphql(run, OWNER_ID, { owner }).repositoryOwner;
  if (!found?.id) throw noOwner(owner);
  return found.id;
}

/** The node id of an issue of `repo` (`owner/name`), by its number. Throws, naming the issue, where there is none. */
export function issueNodeId(run, repo, number) {
  const [owner, name] = repo.split('/');
  const id = graphql(run, ISSUE_ID, { owner, name, number }).repository?.issue?.id;
  if (!id) throw new Error(`issue #${number} of ${repo} could not be found`);
  return id;
}

/** Runs a GraphQL query or mutation through `gh api graphql` and gives its data; throws with GitHub's words when it refuses. */
export function graphql(run, query, variables) {
  const answer = JSON.parse(run(['api', 'graphql', '--input', '-'], JSON.stringify({ query, variables })));
  if (answer.errors?.length) throw new Error(`GitHub refused: ${answer.errors.map((e) => e.message).join('; ')}`);
  return answer.data;
}

/** A list read from GitHub, refused when it is as long as the cap it was asked for and so may be only a part. */
export function whole(list, cap, what) {
  if (list.length >= cap)
    throw new Error(
      `GitHub returned ${list.length} ${what}, as many as the ${cap} asked for, so the list may be only part of them`,
    );
  return list;
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
    const found = graphql(run, READ_PROJECT, { owner, number, after }).repositoryOwner;
    if (!found) throw noOwner(owner);
    const page = found.projectV2;
    if (!page) throw new Error(`project ${number} of ${owner} could not be read`);
    project ??= page;
    for (const node of page.items.nodes) {
      const id = idByNumber.get(node.content?.number);
      if (id === undefined) continue;
      const values = {};
      for (const v of node.fieldValues.nodes)
        if (valueOf(v) !== undefined && valueOf(v) !== null && v.field?.name) values[v.field.name] = valueOf(v);
      items.push({ itemId: node.id, id, values });
    }
    after = page.items.pageInfo.hasNextPage ? page.items.pageInfo.endCursor : null;
  } while (after !== null);
  const fields = {};
  const typed = {};
  for (const f of project.fields.nodes) {
    if (f.name && f.options) fields[f.name] = { id: f.id, options: f.options };
    else if (f.name && f.dataType) typed[f.name] = { id: f.id, type: f.dataType, iterations: iterationsOf(f) };
  }
  return { id: project.id, number: project.number, fields, typed, items };
}

/** The iterations of an iteration field, the completed ones with the rest, by start date; none for another field. */
const iterationsOf = (f) =>
  [...(f.configuration?.iterations ?? []), ...(f.configuration?.completedIterations ?? [])].sort((a, b) =>
    String(a.startDate).localeCompare(String(b.startDate)),
  );

/**
 * The projects of an owner, a user or an organization, as [{id, number, title}], found by the owner's login through
 * GraphQL, a hundred to the page. Refused when the list is as long as its cap, and when there is no such owner or the
 * owner has no list, rather than taken for no projects.
 */
export function readProjects(run, owner) {
  const found = [];
  let after = null;
  do {
    const named = graphql(run, LIST_PROJECTS, { owner, after }).repositoryOwner;
    if (!named) throw noOwner(owner);
    // an answer with no list is not an empty list: planning from it could make the project a second time
    const answer = named.projectsV2;
    if (!answer) throw new Error(`the projects of ${owner} could not be listed`);
    found.push(...answer.nodes);
    after = answer.pageInfo.hasNextPage && found.length < PROJECT_CAP ? answer.pageInfo.endCursor : null;
  } while (after !== null);
  return whole(found, PROJECT_CAP, 'projects');
}

/** The owner's project with the mirror's title, as {id, number, title}, or undefined. */
export const findProject = (run, owner) => readProjects(run, owner).find((p) => p.title === PROJECT_TITLE);
