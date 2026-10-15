// The project's fields that are not a single choice (spec §12, requirements_checked_in_ci), each derived and never
// authored: Wave (an iteration field, one iteration for each wave of requirements/waves.json, with its dates), Order (a
// number: wave, then workstream, then requirement position), Closed on (the day the requirement's issue was closed, from
// its closedAt) and Started on (the day a pull request first took the requirement on). Pure: what to make, what differs
// and the arguments of the gh call that sets a value. github-project-plan.mjs plans with it and github-project-gh.mjs
// does the plan.
import { adoptedId } from './github-project-desired.mjs';

export const WAVE_FIELD = 'Wave';
export const ORDER_FIELD = 'Order';
export const CLOSED_FIELD = 'Closed on';
export const STARTED_FIELD = 'Started on';
/**
 * The fields, each with its GitHub data type and the key of a desired issue that holds its value. An issue's value is
 * undefined where the mirror leaves the field as it is, null where the field is to be cleared, else the value: a wave's
 * title, a number, or a day as YYYY-MM-DD.
 */
export const TYPED_FIELDS = [
  { name: WAVE_FIELD, type: 'ITERATION', key: 'wave' },
  { name: ORDER_FIELD, type: 'NUMBER', key: 'order' },
  { name: CLOSED_FIELD, type: 'DATE', key: 'closedOn' },
  { name: STARTED_FIELD, type: 'DATE', key: 'startedOn' },
];
/** The fields that need a waves plan: without one they are not made. */
const PLANNED = [WAVE_FIELD, ORDER_FIELD];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** The day, YYYY-MM-DD in UTC, of a time GitHub gives, or null for none or a time that is not one. */
export function dayOf(time) {
  if (typeof time !== 'string' || !ISO_DAY.test(time)) return null;
  const at = Date.parse(time);
  return Number.isNaN(at) ? null : new Date(at).toISOString().slice(0, 10);
}

/** The fields the desired state needs: Wave and Order only when it has a plan (`iterations`), the dates always. */
export const wantedTyped = (iterations) => TYPED_FIELDS.filter((f) => iterations || !PLANNED.includes(f.name));

const sameIterations = (have, want) =>
  have.length === want.length &&
  want.every((w, i) => ['title', 'startDate', 'duration'].every((k) => have[i][k] === w[k]));

/**
 * The configuration of the Wave field for `iterations` ({title, startDate, duration} in order), the existing ones (`have`)
 * kept by their ids where a title matches, so their values stay on the items. Each iteration holds only the four keys
 * the schema's ProjectV2Iteration input takes: id, title, startDate and duration. An item whose iteration is made new
 * loses its Wave, and the apply reads the project again and gives it its Wave again (executePlan).
 */
export function iterationConfig(iterations, have = []) {
  const [first] = iterations;
  return {
    startDate: first.startDate,
    duration: first.duration,
    iterations: iterations.map((i) => {
      const id = have.find((h) => h.title === i.title)?.id;
      return { ...(id ? { id } : {}), title: i.title, startDate: i.startDate, duration: i.duration };
    }),
  };
}

/**
 * What to do to the fields that are not a single choice: [{name, type, create, iterations}] for each that is missing, and
 * for the Wave field whose iterations are not the plan's (`iterations`, null without a plan). `remote` is the project's
 * such fields by name, {id, type, iterations}. Throws when a field of one of these names has another type.
 */
export function planTyped(remote, iterations) {
  const plans = [];
  for (const { name, type } of wantedTyped(iterations)) {
    const have = remote?.[name];
    if (have && have.type !== type)
      throw new Error(`field ${name} is a ${have.type} field, not ${type}; the script never changes a field's type`);
    const wave = name === WAVE_FIELD ? { iterations } : {};
    if (!have) plans.push({ name, type, create: true, ...wave });
    else if (name === WAVE_FIELD && !sameIterations(have.iterations, iterations))
      plans.push({ name, type, create: false, ...wave });
  }
  return plans;
}

const CREATE_FIELD = `mutation($project: ID!, $name: String!, $type: ProjectV2CustomFieldType!, $iterations: ProjectV2IterationFieldConfigurationInput) {
  createProjectV2Field(input: {projectId: $project, dataType: $type, name: $name, iterationConfiguration: $iterations}) {
    projectV2Field { ... on ProjectV2FieldCommon { id name } }
  }
}`;
const SET_ITERATIONS = `mutation($field: ID!, $iterations: ProjectV2IterationFieldConfigurationInput!) {
  updateProjectV2Field(input: {fieldId: $field, iterationConfiguration: $iterations}) {
    projectV2Field { ... on ProjectV2IterationField { id name } }
  }
}`;

/**
 * The GraphQL mutation, {query, variables}, that does one plan of planTyped in the project `projectId`: makes the field,
 * or sets the iterations of the Wave field (`remote` is the project's fields of these types, as planTyped reads them).
 */
export function typedMutation(projectId, plan, remote) {
  if (plan.create) {
    const iterations = plan.iterations ? iterationConfig(plan.iterations) : null;
    return { query: CREATE_FIELD, variables: { project: projectId, name: plan.name, type: plan.type, iterations } };
  }
  const have = remote[plan.name];
  return {
    query: SET_ITERATIONS,
    variables: { field: have.id, iterations: iterationConfig(plan.iterations, have.iterations) },
  };
}

/**
 * Whether a field's value on an item is to be changed from `from` to `to`. Undefined leaves it. Started on is only set
 * where there is none, as the first pull request to take the requirement on gives it; any other is set to what differs,
 * and null clears it.
 */
export function typedDiffers(name, from, to) {
  if (to === undefined) return false;
  const have = from ?? null;
  if (to === null) return have !== null;
  if (name === STARTED_FIELD) return have === null;
  if (name === ORDER_FIELD) return have === null || Number(have) !== to;
  return have !== to;
}

/** The arguments of `gh project item-edit` that give a field (`field`, {type, iterations}) the value `to`, or clear it. */
export function valueArgs(name, field, to) {
  if (to === null) return ['--clear'];
  if (field.type === 'DATE') return ['--date', to];
  if (field.type === 'NUMBER') return ['--number', String(to)];
  const iteration = field.iterations.find((i) => i.title === to);
  if (!iteration) throw new Error(`field ${name} has no iteration ${to}`);
  return ['--iteration-id', iteration.id];
}

/**
 * The desired issues with Closed on derived from the issues GitHub holds: the day an adopted issue was closed, for one
 * that is closed and stays closed; null (cleared) for one that is or will be open; undefined (left) for one this run
 * will close or make, whose day is known only once it is done. `adopters` are the logins whose issues are the mirror's.
 */
export function withClosedOn(issues, remote, adopters) {
  const held = new Map();
  for (const issue of [...remote].sort((a, b) => a.number - b.number)) {
    const id = adoptedId(issue, adopters);
    if (id !== null && !held.has(id)) held.set(id, issue);
  }
  return issues.map((d) => {
    const have = held.get(d.id);
    const closed = String(have?.state).toLowerCase() === 'closed';
    if (d.state !== 'closed') return { ...d, closedOn: null };
    return { ...d, closedOn: closed ? (dayOf(have.closedAt) ?? undefined) : undefined };
  });
}
