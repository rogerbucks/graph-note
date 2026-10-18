// The desired state of the GitHub mirror of the requirements (spec §12, requirements_checked_in_ci). It covers each
// requirement and each open question of the chosen slices. For each it gives the issue that should exist: its title,
// body, labels and whether it is open. It also gives the options of the project fields it fills.
//
// A question's issue is labelled kind:question, stays open and lists the requirements it blocks. It carries the same
// marker as a requirement's, so it is adopted, kept and removed in the same way.
//
// Pure: it reads the board that slice-board.mjs reads from the requirements copy, and the workstreams file, and gives
// values. scripts/github-project-plan.mjs compares them with what GitHub holds, and scripts/github-project-gh.mjs does
// the difference. The requirements file stays the only source. Every issue and project item made from it is a
// derivative, regenerated and never edited by hand.
import { REQUIREMENTS } from './check-requirements.mjs';
import { iterationsOf, wavesOf } from './github-project-waves.mjs';

/** The command that makes the mirror, named in each issue so a reader knows where it came from. */
export const SCRIPT = 'scripts/github-project.mjs';
/** The workstream of a requirement that no workstream lists: the slice-end one. */
export const CATCH_ALL = 'S3';
/** The workstream of an open question that no workstream lists. */
export const QUESTIONS_WORKSTREAM = 'Q';
/**
 * The label every open question's issue carries. Namespaced, as GitHub's own `question` label is somebody's own and a
 * managed label is taken off an issue that should not carry it.
 */
export const QUESTION_LABEL = 'kind:question';
/** The title of the project the issues are collected in. */
export const PROJECT_TITLE = 'graph-note requirements';
/** The label of an issue whose requirement is no longer in the requirements file. */
export const REMOVED_LABEL = 'requirement:removed';
/**
 * The project's single-choice fields, in order. The built-in Status field of a GitHub Project is never used. Its
 * options are Todo, In Progress and Done, and a person may use it. So the requirement's status goes in the Proof field
 * instead.
 */
export const FIELD_NAMES = ['Slice', 'Workstream', 'Proof', 'Build status'];
/** The project field that says how far a requirement's build is. Its values come from GitHub's events alone. */
export const BUILD_STATUS_FIELD = 'Build status';
/**
 * The stages of a requirement's build, in the order they happen (scripts/build-status.mjs sets them from the events of
 * GitHub). An item starts at the first. This script makes the field and its options, and gives a new item the first
 * stage. It never sets any other, and never replaces the options, which would clear every value.
 */
export const BUILD_STATUSES = ['Not started', 'In PR', 'Checks failing', 'Checks passing', 'Merged', 'Released'];
/** The project's built-in single-choice field: Todo, In Progress, Done. The mirror never makes it or changes its options. */
export const PROGRESS_FIELD = 'Status';
/** The options of the built-in Status, in order. */
export const PROGRESS_STATUSES = ['Todo', 'In Progress', 'Done'];
/** The value of the built-in Status an item with none is given when nothing says more. */
export const DEFAULT_PROGRESS = PROGRESS_STATUSES[0];
/** The Status of a requirement that is part proved (status:part) and that no seed says more about. */
export const IN_PROGRESS = PROGRESS_STATUSES[1];
/** The fields whose options never change, so the script never replaces them: one that lacks an option is refused. */
export const FIXED_FIELDS = ['Proof', BUILD_STATUS_FIELD];
/** The statuses a requirement can have, as the slice board gives them. */
export const STATUSES = ['open', 'part', 'proved'];
/** The start of the banner line every generated issue carries; an issue without it is not one of ours. */
export const BANNER_START = '> **Generated — do not edit.**';

const MAX_TITLE = 100;
const TITLE_SEPARATOR = ' · ';
const QUESTION_TITLE = 'Open question';
const MANAGED_LABEL = /^(slice-\d+|workstream:.+|status:(open|part|proved)|requirement:removed|kind:question)$/;
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
 * Open questions are placed the same way with `{catchAll: QUESTIONS_WORKSTREAM, kind: 'question'}`.
 */
export function assignWorkstreams(requirements, workstreams, { catchAll = CATCH_ALL, kind = 'requirement' } = {}) {
  const owner = new Map();
  for (const [id, w] of Object.entries(workstreams)) for (const req of w.requirements) owner.set(req, id);
  const placed = new Map();
  for (const r of requirements) {
    if (!owner.has(r.id) && !Object.hasOwn(workstreams, catchAll))
      throw new Error(`${kind} ${r.id} is in no workstream, and the workstreams file has no ${catchAll} to hold it`);
    placed.set(r.id, owner.get(r.id) ?? catchAll);
  }
  return placed;
}

const oneLine = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const cutAtWord = (text, max) => {
  const head = text.slice(0, max);
  const space = head.lastIndexOf(' ');
  return (text[max] === ' ' || space < 1 ? head : head.slice(0, space)).trimEnd();
};

/**
 * The title of an issue: the title of the requirement's section, a dot, and the requirement's id with its underscores as
 * spaces. Never over 100 characters. A long section title gives way, cut at a word with an ellipsis, so the id's words
 * always stay. With no section title the title is the id's words alone.
 */
export function titleOf(sectionTitle, id) {
  const words = id.replaceAll('_', ' ');
  const room = MAX_TITLE - TITLE_SEPARATOR.length - words.length;
  if (!sectionTitle || room < 2) return words.length <= MAX_TITLE ? words : `${words.slice(0, MAX_TITLE - 1)}…`;
  const section = sectionTitle.length <= room ? sectionTitle : `${cutAtWord(sectionTitle, room - 1)}…`;
  return `${section}${TITLE_SEPARATOR}${words}`;
}

/**
 * The title of an open question's issue: Open question, a dot, the question's number and its first words. Never over
 * 100 characters: a long question is cut at a word with an ellipsis, as a long section title is.
 */
export function questionTitleOf(num, text) {
  const head = `${QUESTION_TITLE}${TITLE_SEPARATOR}${num}`;
  const words = oneLine(text);
  const room = MAX_TITLE - head.length - 1;
  if (!words) return head.length <= MAX_TITLE ? head : `${head.slice(0, MAX_TITLE - 1)}…`;
  if (room < 2) return `${head} ${words}`.slice(0, MAX_TITLE - 1) + '…';
  return `${head} ${words.length <= room ? words : `${cutAtWord(words, room - 1)}…`}`;
}

/**
 * Wraps each @name, @org/team and #number of a text in backticks. So GitHub neither notifies a person nor links an
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

/** The login of the workflows' own bot, as the mirror gives an issue's author: it makes the issues when the mirror runs on main. */
export const BOT_LOGIN = 'github-actions[bot]';

/**
 * The requirement id of an issue this generator may adopt, or null. It was written by one of `adopters`, and its body
 * is one this generator made. `adopters` is a login, or a list of them; the mirror's are the repository's owner and
 * BOT_LOGIN. A marker alone proves nothing, since anybody can write one.
 */
export function adoptedId(issue, adopters) {
  const logins = (Array.isArray(adopters) ? adopters : [adopters]).filter(Boolean).map((l) => l.toLowerCase());
  if (!issue.author || !logins.includes(issue.author.toLowerCase())) return null;
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
  if (name === QUESTION_LABEL) return { color: 'D876E3', description: `An open question, ${generated}` };
  const colours = { open: 'D93F0B', part: 'FBCA04', proved: '0E8A16' };
  return {
    color: colours[name.slice('status:'.length)] ?? 'EDEDED',
    description: `Status of a requirement, ${generated}`,
  };
}

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

const blocksLines = (q) => (q.blocks.length ? q.blocks.map((id) => `- \`${id}\``) : ['_Blocks nothing named._']);

// An open question's body: the question first, then the banner, and the requirements it blocks.
const questionBodyOf = (q, workstream) =>
  [
    neutralise(oneLine(q.text)),
    '',
    `${BANNER_START} Made by \`${SCRIPT}\` from \`${REQUIREMENTS}\`, the only source. Change the question there; an edit here is overwritten.`,
    '',
    '- **Kind:** open question',
    `- **Slice:** ${q.slice}`,
    `- **Workstream:** ${workstream}`,
    '',
    '**Blocks:**',
    '',
    ...blocksLines(q),
    '',
    markerOf(q.id),
    '',
  ].join('\n');

/**
 * The desired state for the chosen slices, from a board as readBoard gives it and the workstreams: {issues, fields,
 * known}.
 *
 * Each issue is {id, title, body, labels (sorted), state ('open' or 'closed'), slice, workstream, status, buildStatus,
 * progress}. The last five are the options its project item takes. The Build status, and the built-in Status as
 * `progress`, are only the seed of an item that has none, or has Todo (see withSeed). The requirements' issues come
 * first. Then comes one for each open question of the chosen slices, always open, its Proof `open`.
 *
 * `fields` maps each project field to its options. `known` lists every requirement and question id the copy holds, in
 * any slice. So an issue whose requirement or question is only outside the chosen slices is told from one whose
 * requirement or question went.
 */
export function desiredState(board, workstreams, slices, plan = null) {
  const chosen = [...new Set(slices)].sort((a, b) => a - b);
  const requirements = board.requirements.filter((r) => chosen.includes(r.slice));
  const placed = assignWorkstreams(requirements, workstreams);
  const option = (id) => `${id}: ${workstreams[id].title}`;
  const inWaves = plan ? wavesOf(requirements, placed, workstreams, plan) : null;
  // without a plan, Wave and Order are left as they are; with one, a requirement in no wave has neither
  const planned = (id) => (plan ? { wave: null, order: null, ...inWaves.get(id) } : {});
  const issues = requirements.map((r) => {
    const workstream = placed.get(r.id);
    return {
      ...planned(r.id),
      id: r.id,
      title: titleOf(board.sections.find((s) => s.num === r.section)?.title, r.id),
      body: bodyOf(r, option(workstream)),
      labels: [`slice-${r.slice}`, `status:${r.status}`, `workstream:${workstream}`].sort(),
      state: r.status === 'proved' ? 'closed' : 'open',
      slice: `Slice ${r.slice}`,
      workstream: option(workstream),
      status: r.status,
      buildStatus: BUILD_STATUSES[0],
      // a requirement some of whose tests are written, or one is partial, is under way even with no pull request open
      progress: r.status === 'part' ? IN_PROGRESS : DEFAULT_PROGRESS,
    };
  });
  const questions = (board.questions ?? []).filter((q) => chosen.includes(q.slice));
  const askedIn = assignWorkstreams(questions, workstreams, { catchAll: QUESTIONS_WORKSTREAM, kind: 'question' });
  for (const q of questions) {
    const workstream = askedIn.get(q.id);
    issues.push({
      ...(plan ? { wave: null, order: null } : {}),
      id: q.id,
      title: questionTitleOf(q.num, q.text),
      body: questionBodyOf(q, option(workstream)),
      blocks: q.blocks,
      labels: [QUESTION_LABEL, `slice-${q.slice}`, `workstream:${workstream}`].sort(),
      state: 'open',
      slice: `Slice ${q.slice}`,
      workstream: option(workstream),
      status: 'open',
      buildStatus: BUILD_STATUSES[0],
      progress: DEFAULT_PROGRESS,
    });
  }
  return {
    issues,
    fields: {
      Slice: chosen.map((s) => `Slice ${s}`),
      Workstream: Object.keys(workstreams).map(option),
      Proof: [...STATUSES],
      [BUILD_STATUS_FIELD]: [...BUILD_STATUSES],
    },
    known: [...board.requirements, ...(board.questions ?? [])].map((r) => r.id),
    iterations: plan ? iterationsOf(plan) : null,
    waves: plan ? { ...plan, requirements: requirements.map((r) => r.id) } : null,
  };
}

/**
 * A desired state whose issues take the seed's Build status and built-in Status, for the ids it names. They stand in
 * place of the first stage and Todo. `seed` maps a requirement id to {buildStatus, progress}.
 * scripts/build-status-seed.mjs works that out from where the requirement stands on GitHub. An id it does not name
 * keeps the defaults.
 *
 * With `started`, each issue also takes its Started on from the seed. That is the day a pull request holding it was
 * opened, kept (undefined) for one proved. An issue the seed does not name is one no pull request holds. Its Started on
 * is cleared (null) only while no test of it is written (it is open), and else kept. Even then the plan clears it only
 * for an item whose Build status is not past Not started. The state given is not changed.
 */
export function withSeed(desired, seed, { started = false } = {}) {
  const issues = desired.issues.map((issue) => {
    const given = seed.get(issue.id);
    const unheld = issue.status === 'open' ? null : undefined;
    const startedOn = started ? (given ? given.startedOn : unheld) : undefined;
    const dated = startedOn === undefined ? issue : { ...issue, startedOn };
    return given ? { ...dated, buildStatus: given.buildStatus, progress: given.progress } : dated;
  });
  return { ...desired, issues };
}
