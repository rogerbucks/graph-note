// The plan of the GitHub mirror of the requirements (spec §12, requirements_checked_in_ci). It says what must be done
// to make GitHub hold the desired issues and project. It is found by comparing the desired state
// (github-project-desired.mjs) with what GitHub holds now (read by github-project-gh.mjs). Pure — two values in, a
// third out, no network — so the dry run can print it and a test can prove it. A plan changes only what differs and
// never deletes:
// - an issue whose requirement went is labelled and closed;
// - an issue outside the chosen slices is left alone;
// - a label somebody else added stays.
import {
  BUILD_STATUSES,
  BUILD_STATUS_FIELD,
  DEFAULT_PROGRESS,
  FIELD_NAMES,
  FIXED_FIELDS,
  PROGRESS_FIELD,
  PROGRESS_STATUSES,
  PROJECT_TITLE,
  REMOVED_LABEL,
  adoptedId,
  idOfBody,
  isManagedLabel,
} from './github-project-desired.mjs';
import { STARTED_FIELD, planTyped, typedDiffers, wantedTyped, withClosedOn } from './github-project-fields.mjs';

/** An apply stopped because the seed was made despite warnings, so some of its values may be wrong. */
export class SeedWarnings extends Error {}

/** The most issues a plan may remove (label and close) unless the person allows more. */
export const MAX_REMOVALS = 10;

const FIELD_KEYS = {
  Slice: 'slice',
  Workstream: 'workstream',
  Proof: 'status',
  [BUILD_STATUS_FIELD]: 'buildStatus',
  [PROGRESS_FIELD]: 'progress',
};

const lower = (name) => String(name).toLowerCase();
const hasLabel = (labels, name) => labels.some((l) => lower(l) === lower(name));
const isClosed = (issue) => lower(issue.state) === 'closed';
// GitHub may return a body with other line ends or trailing spaces than the one sent.
const plain = (text) =>
  String(text ?? '')
    .replaceAll('\r\n', '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();

/**
 * What to do to the issues. `remote` is the issues GitHub holds. Each is {number, title, body, state ('OPEN' or
 * 'CLOSED'), labels (names), author (login), url}. `known` is every requirement id the copy holds. `login` is the
 * signed-in login.
 *
 * Gives {create, update, close, reopen, removed, unchanged, outside, warnings, held}:
 * - the desired issues to make;
 * - for an existing issue, what to change (`title`, `body`, labels to add and take off);
 * - the ones to close and to reopen;
 * - the issues of requirements that went, with which of label, comment and close each still needs;
 * - the ids with nothing to do;
 * - the ids of issues left alone because their requirement is only outside the chosen slices;
 * - any warning;
 * - and the number and url of each issue held, by id.
 *
 * Only an issue this generator may adopt counts. It is one written by `login`, with the generated banner and its
 * marker at the end. Any other is somebody's own, ignored, and warned of when it carries a marker. Of two adopted with
 * one marker the lowest number counts.
 */
export function planIssues(desired, remote, known, login) {
  const plan = { create: [], update: [], close: [], reopen: [], removed: [], unchanged: [], outside: [], warnings: [] };
  const held = new Map();
  const writers = [login].flat().filter(Boolean).join(' or ') || 'the signed-in login';
  for (const issue of [...remote].sort((a, b) => a.number - b.number)) {
    const id = adoptedId(issue, login);
    if (id === null) {
      const marked = idOfBody(issue.body);
      if (marked !== null)
        plan.warnings.push(
          `issue #${issue.number} carries the marker of ${marked} but is not adopted: it was not written by ${writers}, or it lacks the generated banner or the marker at its end`,
        );
      continue;
    }
    if (held.has(id))
      plan.warnings.push(
        `requirement ${id} has two issues, #${held.get(id).number} and #${issue.number}; #${issue.number} is left alone`,
      );
    else held.set(id, issue);
  }
  const wanted = new Set(desired.map((d) => d.id));
  for (const d of desired) {
    const have = held.get(d.id);
    if (!have) {
      plan.create.push(d);
      continue;
    }
    const entry = {
      id: d.id,
      number: have.number,
      title: have.title !== d.title,
      body: plain(have.body) !== plain(d.body),
      addLabels: d.labels.filter((l) => !hasLabel(have.labels, l)),
      removeLabels: have.labels.filter((l) => isManagedLabel(l) && !hasLabel(d.labels, l)),
      issue: d,
    };
    const changed = entry.title || entry.body || entry.addLabels.length || entry.removeLabels.length;
    if (changed) plan.update.push(entry);
    const closing = d.state === 'closed';
    if (closing && !isClosed(have)) plan.close.push({ id: d.id, number: have.number });
    else if (!closing && isClosed(have)) plan.reopen.push({ id: d.id, number: have.number });
    else if (!changed) plan.unchanged.push(d.id);
  }
  for (const [id, issue] of held) {
    if (wanted.has(id)) continue;
    if (known.has(id)) {
      plan.outside.push(id);
      continue;
    }
    const labelled = hasLabel(issue.labels, REMOVED_LABEL);
    if (!(labelled && isClosed(issue)))
      plan.removed.push({ id, number: issue.number, label: !labelled, comment: !labelled, close: !isClosed(issue) });
  }
  plan.held = Object.fromEntries([...held].map(([id, i]) => [id, { number: i.number, url: i.url }]));
  return plan;
}

/** The labels of `wanted` that GitHub does not hold yet (names are not case-sensitive there), once each, sorted. */
export function planLabels(wanted, existing) {
  const have = new Set(existing.map(lower));
  return [...new Set(wanted)].filter((name) => !have.has(lower(name))).sort();
}

/**
 * What to do to the project. `remote` is the project GitHub holds, {id, number, fields: {name: {id, options}}, typed:
 * {name: {id, type, iterations}}, items: [{itemId, id (the requirement's), values: {field: value}}]}, or null for none.
 * Gives {create, fields, typed, itemsAdd, sets}:
 * - whether to make the project;
 * - for each single-choice field that is missing or lacks options, {name, create, add: options to add};
 * - the other fields to make, or the Wave field whose iterations to set (planTyped);
 * - the requirements to add as items;
 * - and each field value to set, {id, field, from, to}, `to` null to clear it.
 *
 * Options already there are kept, and an item no longer wanted is left in the project.
 * `iterations` are the waves of the plan, or null without one, when Wave and Order are not made.
 */
export function planProject(desired, wantedFields, remote, iterations = null) {
  const fields = [];
  for (const name of FIELD_NAMES) {
    const have = remote?.fields?.[name];
    const add = have ? wantedFields[name].filter((o) => !have.options.some((x) => x.name === o)) : wantedFields[name];
    if (have && add.length && FIXED_FIELDS.includes(name))
      throw new Error(
        `field ${name} lacks the option ${add.join(', ')}; the script never replaces the options of ${name}, so add it by hand`,
      );
    if (!have || add.length) fields.push({ name, create: !have, add });
  }
  const items = new Map((remote?.items ?? []).map((i) => [i.id, i]));
  const itemsAdd = desired.filter((d) => !items.has(d.id)).map((d) => d.id);
  refuseMissingSeeds(desired, remote);
  const sets = [];
  for (const d of desired) {
    // an item whose requirement is not proved (its issue is open) must not stay Done, whatever its Proof reads now.
    // That repairs one stuck by a run cut short, or whose values an options rebuild cleared. Its Status is set first.
    const downgraded = d.status !== 'proved';
    for (const field of downgraded ? [PROGRESS_FIELD, ...FIELD_NAMES] : [...FIELD_NAMES, PROGRESS_FIELD]) {
      const from = items.get(d.id)?.values?.[field] ?? null;
      const to = d[FIELD_KEYS[field]];
      if (differs(field, from, to) || (downgraded && field === PROGRESS_FIELD && from === 'Done' && to !== 'Done'))
        sets.push({ id: d.id, field, from, to });
    }
  }
  const wanted = wantedTyped(iterations);
  for (const d of desired)
    for (const { name, key } of wanted) {
      const values = items.get(d.id)?.values;
      const from = values?.[name] ?? null;
      // Started on is cleared only for an item Not started: one whose build has gone further keeps it
      const building = (values?.[BUILD_STATUS_FIELD] ?? BUILD_STATUSES[0]) !== BUILD_STATUSES[0];
      if (name === STARTED_FIELD && d[key] === null && building) continue;
      if (typedDiffers(name, from, d[key])) sets.push({ id: d.id, field: name, from, to: d[key] });
    }
  // a single-choice field of a typed field's name is of the wrong type too
  const kinds = { ...remote?.typed };
  for (const name of Object.keys(remote?.fields ?? {})) kinds[name] = { type: 'SINGLE_SELECT' };
  return { create: remote === null, fields, typed: planTyped(kinds, iterations), itemsAdd, sets };
}

/** The plan of a project that is not read, as when no token may read it: nothing is done to it. */
const UNREAD = { create: false, fields: [], typed: [], itemsAdd: [], sets: [], unread: true };

/**
 * Whether a field's value on an item is to be set. Slice, Workstream and Proof follow the requirement, so any difference.
 * Build status is set by events (scripts/build-status-run.mjs), so here only a missing value is seeded. The built-in Status
 * is the board's own. A missing value is seeded. Todo, which is its default and no choice, may be replaced by a seed
 * that says more. In Progress and Done are never overwritten. The exception is Done on an item whose requirement is not
 * proved (planProject), which goes to the Status the requirement has.
 */
function differs(field, from, to) {
  if (field === BUILD_STATUS_FIELD) return from === null;
  if (field === PROGRESS_FIELD) return from === null || (from === DEFAULT_PROGRESS && to !== DEFAULT_PROGRESS);
  return from !== to;
}

/** Throws when the project's Status field lacks an option a seed would set: the script never changes the board's own options. */
function refuseMissingSeeds(desired, remote) {
  const have = remote?.fields?.[PROGRESS_FIELD];
  if (!have) return;
  const lacking = [...new Set(desired.map((d) => d.progress))].filter((o) => !have.options.some((x) => x.name === o));
  if (lacking.length)
    throw new Error(
      `field ${PROGRESS_FIELD} lacks the option ${lacking.join(', ')}; the script never changes the options of ${PROGRESS_FIELD}, so add it by hand`,
    );
}

/**
 * The whole plan for a desired state (as desiredState gives it) and what GitHub holds ({login, adopters, labelNames,
 * issues, project}). It holds:
 * - the plan of the issues;
 * - the labels to make;
 * - the plan of the project;
 * - the warnings;
 * - the logins whose issues are adopted;
 * - the milestone each issue GitHub holds is under now, by number (`milestoneOf`);
 * - and what the executor needs of the project that exists.
 *
 * Closed on is derived here from the issues GitHub holds (withClosedOn). A project that is undefined was not read, and
 * nothing is planned for it.
 */
export function buildPlan(desired, remote) {
  const adopters = remote.adopters ?? remote.login;
  const issues = planIssues(desired.issues, remote.issues, new Set(desired.known), adopters);
  const needed = desired.issues.flatMap((i) => i.labels);
  if (issues.removed.some((r) => r.label)) needed.push(REMOVED_LABEL);
  const dated = withClosedOn(desired.issues, remote.issues, adopters);
  return {
    desired,
    labels: planLabels(needed, remote.labelNames),
    issues,
    project:
      remote.project === undefined
        ? UNREAD
        : planProject(dated, desired.fields, remote.project, desired.iterations ?? null),
    projectRef: remote.project ? { id: remote.project.id, number: remote.project.number } : null,
    adopters,
    creator: remote.login,
    dated,
    milestoneOf: new Map(remote.issues.map((i) => [i.number, i.milestone ?? null])),
    warnings: [...issues.warnings, ...(remote.warnings ?? [])],
  };
}

/**
 * Why a plan should not be done without the person saying so, or null. One reason is that the requirements file holds
 * no requirements, so every issue would be removed, as when the file was read wrongly. The other is that the plan
 * removes more than MAX_REMOVALS issues.
 */
export function guardProblem(plan) {
  if (plan.desired.known.length === 0)
    return 'the requirements file holds no requirements, so every issue would be removed; pass --allow-removals if that is meant';
  const removing = plan.issues.removed.length;
  if (removing > MAX_REMOVALS)
    return `the plan removes ${removing} issues, more than ${MAX_REMOVALS}; pass --allow-removals if that is meant`;
  return null;
}

/** The counts of a plan, for its summary. */
export function summarise(plan) {
  const { issues, project } = plan;
  return {
    requirements: plan.desired.issues.length,
    labelsCreate: plan.labels.length,
    create: issues.create.length,
    createdClosed: issues.create.filter((i) => i.state === 'closed').length,
    update: issues.update.length,
    close: issues.close.length,
    reopen: issues.reopen.length,
    removed: issues.removed.length,
    unchanged: issues.unchanged.length,
    projectCreate: project.create ? 1 : 0,
    fieldsCreate: [...project.fields, ...project.typed].filter((f) => f.create).length,
    optionsAdd: project.fields.reduce((n, f) => n + f.add.length, 0),
    itemsAdd: project.itemsAdd.length,
    valuesSet: project.sets.length,
  };
}

const updateWhat = (u) =>
  [
    u.title && 'title',
    u.body && 'body',
    (u.addLabels.length || u.removeLabels.length) &&
      `labels ${[...u.addLabels.map((l) => `+${l}`), ...u.removeLabels.map((l) => `-${l}`)].join(' ')}`,
  ]
    .filter(Boolean)
    .join(', ');

/** One line of how many items a field would be seeded with each of its options, in the field's order, or none. */
function seedTally(label, field, options, sets) {
  const mine = sets.filter((s) => s.field === field);
  const counts = options.map((o) => [o, mine.filter((s) => s.to === o).length]).filter(([, n]) => n > 0);
  return `seeded ${label}: ${counts.length ? counts.map(([o, n]) => `${o} ${n}`).join(' · ') : 'none'}`;
}

/** The line of a field that is not a single choice: made, with its type, or the Wave field given the plan's iterations. */
const typedLine = (f) => {
  const waves = f.iterations ? `: ${f.iterations.map((i) => `${i.title} from ${i.startDate}`).join(', ')}` : '';
  return f.create
    ? `create field ${f.name} (${f.type.toLowerCase()}${waves})`
    : `set the iterations of ${f.name}${waves}`;
};

/** The plan as text: its counts first, then the tally of the values it would seed, then a line for each change. */
export function formatPlan(plan) {
  const c = summarise(plan);
  const { issues, project } = plan;
  const added = new Set(project.itemsAdd);
  const issueOf = (id) => plan.desired.issues.find((i) => i.id === id);
  const lines = [
    `labels: create ${c.labelsCreate}`,
    `issues: create ${c.create} (${c.createdClosed} closed at once) · update ${c.update} · close ${c.close} · reopen ${c.reopen} · mark removed ${c.removed} · unchanged ${c.unchanged}`,
    `project: create ${c.projectCreate} · fields create ${c.fieldsCreate} · options add ${c.optionsAdd} · items add ${c.itemsAdd} · values set ${c.valuesSet}`,
    seedTally('Build status', BUILD_STATUS_FIELD, BUILD_STATUSES, project.sets),
    seedTally('Status', PROGRESS_FIELD, PROGRESS_STATUSES, project.sets),
    '',
    ...plan.labels.map((name) => `create label ${name}`),
    ...issues.create.map((i) => `create issue ${i.id} "${i.title}" (${i.state}; ${i.labels.join(', ')})`),
    ...issues.update.map((u) => `update issue #${u.number} ${u.id}: ${updateWhat(u)}`),
    ...issues.close.map((i) => `close issue #${i.number} ${i.id}`),
    ...issues.reopen.map((i) => `reopen issue #${i.number} ${i.id}`),
    ...issues.removed.map(
      (r) =>
        `mark removed issue #${r.number} ${r.id}: ${[r.label && 'label', r.comment && 'comment', r.close && 'close'].filter(Boolean).join(', ')}`,
    ),
    ...(issues.outside.length ? [`left alone, outside the chosen slices: ${issues.outside.join(', ')}`] : []),
    ...(project.create ? [`create project "${PROJECT_TITLE}"`] : []),
    ...(project.unread ? ['project: not read, so nothing is done to it'] : []),
    ...project.fields.map((f) =>
      f.create ? `create field ${f.name} (${f.add.join(', ')})` : `add options to field ${f.name}: ${f.add.join(', ')}`,
    ),
    ...project.typed.map((f) => typedLine(f)),
    ...project.itemsAdd.map((id) => {
      const i = issueOf(id);
      return `add to project ${id} (${i.slice} · ${i.workstream} · ${i.status})`;
    }),
    ...project.sets
      .filter((s) => !added.has(s.id))
      .map((s) => `set ${s.id} ${s.field}: ${s.from === null ? '' : `${s.from} → `}${s.to ?? 'cleared'}`),
    ...plan.warnings.map((w) => `warning: ${w}`),
  ];
  return `${lines.join('\n')}\n`;
}
