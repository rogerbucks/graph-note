// The project board for the build status (spec §12, requirements_checked_in_ci): reading each requirement's item with its
// Build status and its built-in Status, and setting either. The issues are read with the workflow's token and only the
// project with the project token (PROJECT_TOKEN), so that token is used for nothing but the board. It finds the project,
// its fields and the mirror's issues as the mirror does (github-project-gh.mjs), by the project's title and the issues
// the mirror made; the mirror is run by the owner of the repository, so an issue is the mirror's when the owner wrote it.
// The mirror never sets either field after giving a new item its first Build status; the build status workflow does.
import { BUILD_STATUS_FIELD, PROJECT_TITLE, adoptedId } from './github-project-desired.mjs';
import { findProject, readIssues, readProject } from './github-project-gh.mjs';
import { retrying } from './github-project-retry.mjs';

/** The project's built-in single-choice field: Todo, In Progress and Done. */
export const PROGRESS_FIELD = 'Status';

/** A trouble with the board that is not GitHub refusing a call: the project, its field or an option is not there yet. */
export class BoardProblem extends Error {}

/**
 * The project as {items, issues, field, progressField, projectId, projectNumber, owner}: `items` maps a requirement id to
 * {itemId, current (its Build status, or null), progress (its built-in Status, or null), number and url (its issue's)},
 * `issues` maps an id to its issue {number, url} whether or not it is an item, `field` is the Build status field {id,
 * options} and `progressField` the built-in Status field, or null where the project has none. `github` is the runner of
 * the workflow's token (for the issues) and `project` that of the project token (for the project alone). Throws
 * BoardProblem when the project or the Build status field is not there yet.
 */
export function readBuildBoard(github, project, repo, opts = {}) {
  const owner = repo.split('/')[0];
  const found = findProject(retrying(project, opts), owner);
  if (!found) throw new BoardProblem(`the project "${PROJECT_TITLE}" was not found`);
  const issues = new Map();
  for (const issue of [...readIssues(retrying(github, opts), repo)].sort((a, b) => a.number - b.number)) {
    const id = adoptedId(issue, owner);
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
        ...issues.get(i.id),
      },
    ]),
  );
  const progressField = read.fields[PROGRESS_FIELD] ?? null;
  return { items, issues, field, progressField, projectId: read.id, projectNumber: read.number, owner };
}

function setValue(run, board, id, { name, field, key }, value, opts) {
  const item = board.items.get(id);
  if (!item) throw new BoardProblem(`${id} is not an item of the project`);
  if (!field) throw new BoardProblem(`the project has no ${name} field`);
  const option = field.options.find((o) => o.name === value);
  if (!option) throw new BoardProblem(`the ${name} field has no option ${value}`);
  const args = ['project', 'item-edit', '--id', item.itemId, '--project-id', board.projectId];
  retrying(run, opts)([...args, '--field-id', field.id, '--single-select-option-id', option.id]);
  item[key] = value;
}

/** Sets the Build status of a requirement's item to `value` (one of the field's options), and notes it on the item. */
export function setBuildStatus(run, board, id, value, opts = {}) {
  setValue(run, board, id, { name: BUILD_STATUS_FIELD, field: board.field, key: 'current' }, value, opts);
}

/** Sets the built-in Status of a requirement's item to `value` (Todo, In Progress or Done), and notes it on the item. */
export function setProgress(run, board, id, value, opts = {}) {
  setValue(run, board, id, { name: PROGRESS_FIELD, field: board.progressField, key: 'progress' }, value, opts);
}
