// The desired state of the GitHub mirror of the requirements (spec §12, requirements_checked_in_ci): for each
// requirement of the chosen slices, the issue that should exist — its title, body, labels and whether it is open — and
// the options of the project fields it fills. Pure: it reads the board that slice-board.mjs reads from the requirements
// copy, and the workstreams file, and gives values; scripts/github-project-plan.mjs compares them with what GitHub
// holds, and scripts/github-project-gh.mjs does the difference. The requirements file stays the only source; every
// issue and project item made from it is a derivative, regenerated and never edited by hand.
import { REQUIREMENTS } from './check-requirements.mjs';

/** The command that makes the mirror, named in each issue so a reader knows where it came from. */
export const SCRIPT = 'scripts/github-project.mjs';
/** The workstream of a requirement that no workstream lists: the slice-end one. */
export const CATCH_ALL = 'S3';
/** The title of the project the issues are collected in. */
export const PROJECT_TITLE = 'graph-note requirements';
/** The label of an issue whose requirement is no longer in the requirements file. */
export const REMOVED_LABEL = 'requirement:removed';
/** The project's single-choice fields, in order. */
export const FIELD_NAMES = ['Slice', 'Workstream', 'Status'];
/** The statuses a requirement can have, as the slice board gives them. */
export const STATUSES = ['open', 'part', 'proved'];

const MAX_CLAUSE = 80;
const MANAGED_LABEL = /^(slice-\d+|workstream:.+|status:(open|part|proved)|requirement:removed)$/;
// A clause ends at a comma, semicolon, colon or full stop that ends a word, or at a dash with spaces round it.
const CLAUSE_END = /[;:,](?=\s|$)|\s[—–]\s|\.(?=\s|$)/;
const MARKER = /<!-- requirement:([\w.-]+) -->/g;

/**
 * Reads the workstreams file: a map from a workstream id to {title, requirements: [ids]}. Throws, naming the
 * workstream, for any other shape, or for a requirement listed in two workstreams. An id the requirements copy does not
 * hold yet is fine: it waits for a later copy.
 */
export function readWorkstreams(text) {
  let map;
  try {
    map = JSON.parse(text);
  } catch (e) {
    throw new Error(`the workstreams file is not JSON: ${e.message}`);
  }
  if (map === null || typeof map !== 'object' || Array.isArray(map))
    throw new Error('the workstreams file must be a JSON object from a workstream id to its title and requirements');
  const owner = new Map();
  for (const [id, w] of Object.entries(map)) {
    if (w === null || typeof w !== 'object' || typeof w.title !== 'string' || !w.title)
      throw new Error(`workstream ${id} needs a title, as text`);
    if (!Array.isArray(w.requirements)) throw new Error(`workstream ${id}: requirements must be a list of ids`);
    for (const req of w.requirements) {
      if (typeof req !== 'string') throw new Error(`workstream ${id}: every requirement id must be text`);
      if (owner.has(req))
        throw new Error(`requirement ${req} is listed in two workstreams, ${owner.get(req)} and ${id}`);
      owner.set(req, id);
    }
  }
  return map;
}

/**
 * The workstream id of each requirement, as a Map from the requirement's id: the workstream that lists it, or the
 * slice-end workstream when none does. Throws when a requirement needs the slice-end workstream and the file has none.
 */
export function assignWorkstreams(requirements, workstreams) {
  const owner = new Map();
  for (const [id, w] of Object.entries(workstreams)) for (const req of w.requirements) owner.set(req, id);
  const placed = new Map();
  for (const r of requirements) {
    if (!owner.has(r.id) && !Object.hasOwn(workstreams, CATCH_ALL))
      throw new Error(
        `requirement ${r.id} is in no workstream, and the workstreams file has no ${CATCH_ALL} to hold it`,
      );
    placed.set(r.id, owner.get(r.id) ?? CATCH_ALL);
  }
  return placed;
}

/**
 * The first clause of a rule, for an issue's title: the text up to the first comma, semicolon, colon, dash or full stop,
 * on one line. Never over `max` characters: a longer clause is cut at a word and ends with an ellipsis.
 */
export function firstClause(rule, max = MAX_CLAUSE) {
  const text = String(rule ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const end = CLAUSE_END.exec(text);
  const clause = (end ? text.slice(0, end.index).trim() : text) || text;
  if (clause.length <= max) return clause;
  const head = clause.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(clause[max - 1] === ' ' || space < 1 ? head : head.slice(0, space)).trimEnd()}…`;
}

/** The hidden comment that ties an issue to its requirement. */
export const markerOf = (id) => `<!-- requirement:${id} -->`;

/** The requirement id an issue's body names in its marker, or null. The last marker counts. */
export function idOfBody(body) {
  const found = [...String(body ?? '').matchAll(MARKER)];
  return found.length ? found.at(-1)[1] : null;
}

/** True for a label this generator owns, which it may add and take off; any other label is somebody's own. */
export const isManagedLabel = (name) => MANAGED_LABEL.test(name);

/** The colour (hex, no hash) and description a label made new gets. */
export function labelStyle(name) {
  const generated = 'generated from the requirements file';
  if (name.startsWith('slice-'))
    return { color: '5319E7', description: `Slice of the editor requirements, ${generated}` };
  if (name.startsWith('workstream:'))
    return { color: '1D76DB', description: `Workstream of a requirement, ${generated}` };
  if (name === REMOVED_LABEL)
    return { color: '6A737D', description: 'The requirement is no longer in the requirements file' };
  const colours = { open: 'D93F0B', part: 'FBCA04', proved: '0E8A16' };
  return {
    color: colours[name.slice('status:'.length)] ?? 'EDEDED',
    description: `Status of a requirement, ${generated}`,
  };
}

const oneLine = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const testLine = (t) => {
  const where = t.where && t.where !== 'repo' ? t.where : '';
  const files = t.files.map((f) => `\`${f}\``).join(', ');
  const place = [files, where && (files ? `(${where})` : where)].filter(Boolean).join(' ') || 'no file yet';
  return `- \`${t.id}\` (${t.status}): ${oneLine(t.proves)} — ${place}`;
};

const bodyOf = (r, workstream) =>
  [
    `> **Generated — do not edit.** Made by \`${SCRIPT}\` from \`${REQUIREMENTS}\`, the only source. Change the requirement there; an edit here is overwritten.`,
    '',
    `**Rule:** ${oneLine(r.rule)}`,
    '',
    `- **Strength:** ${r.level}`,
    `- **Slice:** ${r.slice}`,
    `- **Workstream:** ${workstream}`,
    `- **Status:** ${r.status}`,
    '',
    '**Proved by:**',
    '',
    ...(r.tests.length ? r.tests.map(testLine) : ['_No test is named._']),
    '',
    markerOf(r.id),
    '',
  ].join('\n');

/**
 * The desired state for the chosen slices, from a board as readBoard gives it and the workstreams: {issues, fields,
 * known}. Each issue is {id, title, body, labels (sorted), state ('open' or 'closed'), slice, workstream, status}, the
 * last three being the options its project item takes. `fields` maps each project field to its options. `known` lists
 * every requirement id the copy holds, in any slice, so that an issue whose requirement is only outside the chosen
 * slices is told from one whose requirement went.
 */
export function desiredState(board, workstreams, slices) {
  const chosen = [...new Set(slices)].sort((a, b) => a - b);
  const requirements = board.requirements.filter((r) => chosen.includes(r.slice));
  const placed = assignWorkstreams(requirements, workstreams);
  const option = (id) => `${id}: ${workstreams[id].title}`;
  const issues = requirements.map((r) => {
    const workstream = placed.get(r.id);
    return {
      id: r.id,
      title: `${r.id}: ${firstClause(r.rule)}`,
      body: bodyOf(r, option(workstream)),
      labels: [`slice-${r.slice}`, `status:${r.status}`, `workstream:${workstream}`].sort(),
      state: r.status === 'proved' ? 'closed' : 'open',
      slice: `Slice ${r.slice}`,
      workstream: option(workstream),
      status: r.status,
    };
  });
  return {
    issues,
    fields: {
      Slice: chosen.map((s) => `Slice ${s}`),
      Workstream: Object.keys(workstreams).map(option),
      Status: [...STATUSES],
    },
    known: board.requirements.map((r) => r.id),
  };
}
