// The project board for the build status (spec §12, requirements_checked_in_ci). It reads each requirement's item with
// its Build status and its built-in Status, and sets either. The issues are read with the workflow's token. Only the
// project is read with the project token (PROJECT_TOKEN), so that token is used for nothing but the board. It finds
// the project, its fields and the mirror's issues as the mirror does (github-project-gh.mjs). It goes by the project's
// title and the issues the mirror made. The mirror is run by the owner of the repository or, on main, by the
// workflows' bot. So an issue is the mirror's when one of those two wrote it.
// The mirror never sets either field after giving a new item its first Build status; the build status workflow does.
import { BUILD_STATUS_FIELD, PROGRESS_FIELD, PROJECT_TITLE, adoptedId } from './github-project-desired.mjs';
import { STARTED_FIELD, itemValueMutation } from './github-project-fields.mjs';
import { adoptersOf, findProject, readAdoptable, readProject } from './github-project-gh.mjs';
import { graphql } from './github-project-read.mjs';
import { retrying } from './github-project-retry.mjs';

/** A trouble with the board that is not GitHub refusing a call: the project, its field or an option is not there yet. */
export class BoardProblem extends Error {}

/**
 * The project as {items, issues, field, progressField, startedField, projectId, projectNumber, owner}.
 * - `items` maps a requirement id to {itemId, current, progress, started, number, url}. current is its Build status,
 *   progress its built-in Status, and started its Started on, each or null. number and url are its issue's.
 * - `issues` maps an id to its issue {number, url}, whether or not it is an item.
 * - `field` is the Build status field {id, options}.
 * - `progressField` is the built-in Status field, or null where the project has none.
 * - `startedField` is the Started on date field, or null until the mirror makes it.
 * `github` is the runner of the workflow's token (for the issues). `project` is that of the project token (for the
 * project alone). Throws BoardProblem when the project or the Build status field is not there yet.
 */
export function readBuildBoard(github, project, repo, opts = {}) {
  const owner = repo.split('/')[0];
  const found = findProject(retrying(project, opts), owner);
  if (!found) throw new BoardProblem(`the project "${PROJECT_TITLE}" was not found`);
  const issues = new Map();
  const adopters = adoptersOf(repo);
  for (const issue of readAdoptable(retrying(github, opts), repo, adopters)) {
    const id = adoptedId(issue, adopters);
    if (id && !issues.has(id)) issues.set(id, { number: issue.number, url: issue.url });
  }
  const idByNumber = new Map([...issues].map(([id, issue]) => [issue.number, id]));
  const read = readProject(retrying(project, opts), owner, found.number, idByNumber);
  const field = read.fields[BUILD_STATUS_FIELD];
  if (!field)
    throw new BoardProblem(
      `the project has no ${BUILD_STATUS_FIELD} field yet; run scripts/github-project.mjs --apply to make it`,
    );
  const items = new Map(
    read.items.map((i) => [
      i.id,
      {
        itemId: i.itemId,
        current: i.values[BUILD_STATUS_FIELD] ?? null,
        progress: i.values[PROGRESS_FIELD] ?? null,
        started: i.values[STARTED_FIELD] ?? null,
        ...issues.get(i.id),
      },
    ]),
  );
  const progressField = read.fields[PROGRESS_FIELD] ?? null;
  const started = read.typed?.[STARTED_FIELD];
  const startedField = started?.type === 'DATE' ? started : null;
  return { items, issues, field, progressField, startedField, projectId: read.id, projectNumber: read.number, owner };
}

function setValue(run, board, id, { name, field, key }, value, opts) {
  const item = board.items.get(id);
  if (!item) throw new BoardProblem(`${id} is not an item of the project`);
  if (!field) throw new BoardProblem(`the project has no ${name} field`);
  const option = field.options.find((o) => o.name === value);
  if (!option) throw new BoardProblem(`the ${name} field has no option ${value}`);
  const { query, variables } = itemValueMutation(board.projectId, item.itemId, name, field, value);
  graphql(retrying(run, opts), query, variables);
  item[key] = value;
}

/** Sets the Build status of a requirement's item to `value` (one of the field's options), and notes it on the item. */
export function setBuildStatus(run, board, id, value, opts = {}) {
  setValue(run, board, id, { name: BUILD_STATUS_FIELD, field: board.field, key: 'current' }, value, opts);
}

/** Sets the Started on of a requirement's item to `day` (YYYY-MM-DD), or clears it for null, and notes it on the item. */
export function setStartedOn(run, board, id, day, opts = {}) {
  const item = board.items.get(id);
  if (!item) throw new BoardProblem(`${id} is not an item of the project`);
  if (!board.startedField) throw new BoardProblem(`the project has no ${STARTED_FIELD} field`);
  const { query, variables } = itemValueMutation(board.projectId, item.itemId, STARTED_FIELD, board.startedField, day);
  graphql(retrying(run, opts), query, variables);
  item.started = day;
}

/** Sets the built-in Status of a requirement's item to `value` (Todo, In Progress or Done), and notes it on the item. */
export function setProgress(run, board, id, value, opts = {}) {
  setValue(run, board, id, { name: PROGRESS_FIELD, field: board.progressField, key: 'progress' }, value, opts);
}
