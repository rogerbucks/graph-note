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
/**
 * The project's single-choice fields, in order. The built-in Status field of a GitHub Project is never used: its options
 * are Todo, In Progress and Done, and a person may use it, so the requirement's status goes in the Proof field instead.
 */
export const FIELD_NAMES = ['Slice', 'Workstream', 'Proof'];
/** The fields whose options never change, so the script never replaces them: one that lacks an option is refused. */
export const FIXED_FIELDS = ['Proof'];
/** The statuses a requirement can have, as the slice board gives them. */
export const STATUSES = ['open', 'part', 'proved'];
/** The start of the banner line every generated issue carries; an issue without it is not one of ours. */
export const BANNER_START = '> **Generated — do not edit.**';

const MAX_TITLE = 100;
const TITLE_SEPARATOR = ' · ';
const MANAGED_LABEL = /^(slice-\d+|workstream:.+|status:(open|part|proved)|requirement:removed)$/;
const MARKER = /<!-- requirement:([\w.-]+) -->/g;
// An @name or @org/team, or a #number, that is not already inside a code span or a longer word.
const MENTION = /(?<![\w`])(@[A-Za-z0-9][\w-]*(?:\/[\w-]+)?|#\d+)/g;

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

const cutAtWord = (text, max) => {
  const head = text.slice(0, max);
  const space = head.lastIndexOf(' ');
  return (text[max] === ' ' || space < 1 ? head : head.slice(0, space)).trimEnd();
};

/**
 * The title of an issue: the title of the requirement's section, a dot, and the requirement's id with its underscores as
 * spaces. Never over 100 characters: a long section title gives way, cut at a word with an ellipsis, so the id's words
 * always stay; with no section title the title is the id's words alone.
 */
export function titleOf(sectionTitle, id) {
  const words = id.replaceAll('_', ' ');
  const room = MAX_TITLE - TITLE_SEPARATOR.length - words.length;
  if (!sectionTitle || room < 2) return words.length <= MAX_TITLE ? words : `${words.slice(0, MAX_TITLE - 1)}…`;
  const section = sectionTitle.length <= room ? sectionTitle : `${cutAtWord(sectionTitle, room - 1)}…`;
  return `${section}${TITLE_SEPARATOR}${words}`;
}

/**
 * Wraps each @name, @org/team and #number of a text in backticks, so that GitHub neither notifies a person nor links an
 * issue from a generated body. Text already inside backticks is left as it is.
 */
export function neutralise(text) {
  return String(text ?? '')
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(MENTION, '`$1`')))
    .join('');
}

/** The hidden comment that ties an issue to its requirement. */
export const markerOf = (id) => `<!-- requirement:${id} -->`;

/** The requirement id an issue's body names in its marker, or null. The last marker counts. */
export function idOfBody(body) {
  const found = [...String(body ?? '').matchAll(MARKER)];
  return found.length ? found.at(-1)[1] : null;
}

/**
 * The requirement id of a body this generator made: one with the generated banner and its marker as the last thing in it.
 * Anything else, such as a body that only quotes a marker, is null.
 */
export function generatedIdOf(body) {
  const text = String(body ?? '')
    .replaceAll('\r\n', '\n')
    .trimEnd();
  const id = idOfBody(text);
  if (id === null || !text.endsWith(markerOf(id))) return null;
  return text.split('\n').some((line) => line.startsWith(BANNER_START)) ? id : null;
}

/**
 * The requirement id of an issue this generator may adopt, or null: it was written by the signed-in login, and its body
 * is one this generator made. A marker alone proves nothing, since anybody can write one.
 */
export function adoptedId(issue, login) {
  if (!login || !issue.author || issue.author.toLowerCase() !== login.toLowerCase()) return null;
  return generatedIdOf(issue.body);
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
  return `- \`${t.id}\` (${t.status}): ${neutralise(oneLine(t.proves))} — ${place}`;
};

// The whole rule is the first line, as the title no longer holds it; the banner comes next.
const bodyOf = (r, workstream) =>
  [
    neutralise(oneLine(r.rule)),
    '',
    `${BANNER_START} Made by \`${SCRIPT}\` from \`${REQUIREMENTS}\`, the only source. Change the requirement there; an edit here is overwritten.`,
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
      title: titleOf(board.sections.find((s) => s.num === r.section)?.title, r.id),
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
      Proof: [...STATUSES],
    },
    known: board.requirements.map((r) => r.id),
  };
}
