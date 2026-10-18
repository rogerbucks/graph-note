// The pure part of the build status of each requirement (spec §12, requirements_checked_in_ci). It holds:
// - which items of the GitHub Project a pull request moves, found with no hand-linking from the tests it newly marks
//   written;
// - the stage an event puts them in;
// - which value may replace which;
// - and the words of the pull request's one comment and of the annotations.
//
// Pure — values in, values out, no network and no file — so a test can prove it. The calls to GitHub are
// build-status-gh.mjs, and the events are build-status-run.mjs. The stages are BUILD_STATUSES, the options of the
// project's Build status field, which github-project.mjs makes. A stage comes from GitHub's events alone, never from
// what a person wrote: nothing here reads a pull request's title, description or comments.
import { BUILD_STATUSES } from './github-project-desired.mjs';
import { summariseChecks } from './slice-board.mjs';

/** The hidden first line of the comment, by which the next event finds it again. */
export const COMMENT_MARKER = '<!-- build-status -->';

/** The most requirements handled for one pull request or release; the rest are left, with a warning. */
export const MAX_IDS = 200;
/** The branch a pull request must be merged into for its requirements to be Merged. */
export const DEFAULT_BRANCH = 'main';

const SAFE_ID = /^[A-Za-z0-9_.-]{1,100}$/;
const SAFE_LINK = /^https:\/\/github\.com\/[\w./-]+$/;
const TOKEN_SHAPE = /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{6,}/g;
const MAX_LISTED = 20;
const MAX_WORDS = 200;
const LEVELS = ['notice', 'warning', 'error'];
// How far a build has got. A pull request's three stages share a rank, as checks move between failing and passing.
const RANK = { 'Not started': 0, 'In PR': 1, 'Checks failing': 1, 'Checks passing': 1, Merged: 2, Released: 3 };

/** True for a requirement id that is safe to print and to put in a link: letters, digits, underscore, dot and hyphen. */
export const isSafeId = (id) => typeof id === 'string' && SAFE_ID.test(id);

const writtenIds = (board) =>
  new Set(
    board.requirements
      .flatMap((r) => r.tests)
      .filter((t) => t.status === 'written')
      .map((t) => t.id),
  );

/**
 * The ids of the requirements a change moves, from the boards (as readBoard gives them) of the requirements file before
 * and after it. The tests are those the later file marks written and the earlier one did not (or did not hold). The ids
 * are every requirement that names such a test. Sorted, once each; an id that is not plain is left out.
 */
export function movedRequirements(before, after) {
  const was = writtenIds(before);
  const fresh = new Set(
    after.requirements
      .flatMap((r) => r.tests)
      .filter((t) => t.status === 'written' && !was.has(t.id))
      .map((t) => t.id),
  );
  const moved = after.requirements.filter((r) => r.tests.some((t) => fresh.has(t.id))).map((r) => r.id);
  return [...new Set(moved.filter(isSafeId))].sort();
}

/**
 * The stage of an open pull request from its checks (as a status check rollup, in the shape summariseChecks reads):
 * Checks failing as soon as one has failed, In PR while any runs or none has reported, else Checks passing.
 */
export function checksStage(rollup) {
  const counts = summariseChecks(rollup);
  if (counts.failed) return 'Checks failing';
  if (counts.running || counts.passed === 0) return 'In PR';
  return 'Checks passing';
}

/**
 * The stage a pull request ({state, merged}) puts its requirements in: Merged once it merged, Not started if it was
 * closed without merging, else the stage of its checks.
 */
export function stageOf(pr, rollup) {
  if (pr.merged) return 'Merged';
  if (pr.state === 'closed') return 'Not started';
  return checksStage(rollup);
}

/**
 * The value to set an item to, or null to leave it. `current` is its value (none counts as Not started) and `wanted` the
 * stage an event gives.
 * - Forward through the stages, and between Checks failing and Checks passing, either way.
 * - Never back from Merged or Released, since a late event of a pull request must not undo its merge or a release.
 * - Back to Not started only from a pull request's own stage, when the pull request is closed unmerged.
 *
 * Throws for a value that is not one of BUILD_STATUSES.
 */
export function nextStatus(current, wanted) {
  const have = current ?? BUILD_STATUSES[0];
  for (const value of [have, wanted])
    if (!Object.hasOwn(RANK, value)) throw new Error(`${value} is not a build status`);
  if (have === wanted) return null;
  if (RANK[have] >= RANK.Merged && RANK[wanted] < RANK[have]) return null;
  return wanted;
}

/** The options of the project's built-in Status field, in order. */
export const PROGRESS = ['Todo', 'In Progress', 'Done'];
const PROGRESS_OF = {
  'Not started': 'Todo',
  'In PR': 'In Progress',
  'Checks failing': 'In Progress',
  'Checks passing': 'In Progress',
  Merged: 'Done',
  Released: 'Done',
};

/** The built-in Status an item takes with a build stage: In Progress while a pull request holds it, Done once merged. */
export function progressOf(stage) {
  if (!Object.hasOwn(PROGRESS_OF, stage)) throw new Error(`${stage} is not a build status`);
  return PROGRESS_OF[stage];
}

/**
 * The Status to set an item to, or null to leave it. It goes Todo to In Progress to Done, never back from Done. It goes
 * back to Todo from In Progress when the pull request that held it is let go. None counts as Todo. Throws for a value
 * that is not one of PROGRESS.
 */
export function nextProgress(current, wanted) {
  const have = current ?? PROGRESS[0];
  for (const value of [have, wanted]) if (!PROGRESS.includes(value)) throw new Error(`${value} is not a Status`);
  if (have === wanted || have === 'Done') return null;
  return wanted;
}

const REQUIREMENTS_LINE = 'Requirements:';
const MAX_LINE_LENGTH = 20_000;

/**
 * The requirement ids a pull request's description names in its fixed line, `Requirements: id1, id2`. That is the first
 * line that opens with exactly `Requirements:`. It is split at commas, each id kept only if it isSafeId, once each, at
 * most MAX_IDS. The description is untrusted: no other line is read, and nothing of it is kept but those ids. Not
 * text, or no such line, gives none.
 */
export function requestedIds(body) {
  if (typeof body !== 'string') return [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(REQUIREMENTS_LINE)) continue;
    const named = line.slice(REQUIREMENTS_LINE.length, MAX_LINE_LENGTH).split(',');
    return [...new Set(named.map((s) => s.trim()).filter(isSafeId))].slice(0, MAX_IDS);
  }
  return [];
}

/** A GitHub Actions annotation of a level, with its text on one line and `%` and line ends encoded as the runner needs. */
export function annotation(level, text) {
  if (!LEVELS.includes(level)) throw new Error(`${level} is not an annotation level`);
  const encoded = String(text).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  return `::${level}::${encoded}`;
}

/** A text with each of the `secrets` given, and anything shaped like a GitHub token, shown as `***`. */
export function redactSecrets(text, secrets = []) {
  let out = String(text);
  for (const secret of secrets)
    if (typeof secret === 'string' && secret.trim().length >= 4) out = out.replaceAll(secret.trim(), '***');
  return out.replace(TOKEN_SHAPE, '***');
}

// gh's own words in a failure: the stderr ghRunner keeps on its error, else the message without its leading arguments.
const wordsOf = (e) =>
  typeof e?.stderr === 'string' ? e.stderr : String(e?.message ?? e).replace(/^gh .*? failed: /s, '');

/**
 * What to say of a failed or missing use of the project token, as {kind, text}. kind is one of these:
 * - `missing` for no token;
 * - `rejected` for GitHub's 401 or Bad credentials (an expired token);
 * - `failed` for anything else, with GitHub's words cut short and every token left out.
 *
 * `token` is the PROJECT_TOKEN as given; `error` is what the call threw.
 */
export function describeProblem(error, token) {
  if (!String(token ?? '').trim())
    return { kind: 'missing', text: 'PROJECT_TOKEN is not set, so the board was not updated.' };
  const words = wordsOf(error).replace(/\s+/g, ' ').trim();
  if (/\b401\b|bad credentials/i.test(words))
    return {
      kind: 'rejected',
      text: 'PROJECT_TOKEN was rejected by GitHub (expired or revoked?), so the board was not updated.',
    };
  const clean = redactSecrets(words, [token]);
  return {
    kind: 'failed',
    text: `The board was not updated: ${clean.length > MAX_WORDS ? `${clean.slice(0, MAX_WORDS)}…` : clean}`,
  };
}

const link = (url) => (typeof url === 'string' && SAFE_LINK.test(url) ? url : null);

const itemLine = (repo, item) => {
  const issue =
    Number.isInteger(item.number) && item.number > 0
      ? `([#${item.number}](https://github.com/${repo}/issues/${item.number}))`
      : null;
  if (item.unknown) return `- \`${item.id}\``;
  if (!issue) return `- \`${item.id}\` (not on the board yet)`;
  return `- \`${item.id}\` ${issue}: ${item.status ?? 'not on the board yet'}`;
};

/**
 * The text of the pull request's one comment. It holds the hidden marker and the stage. It holds each requirement it
 * moves (twenty at most, the rest counted) with its issue linked. It holds any problem in a line of its own, and links
 * to the board and the run. Only ids that isSafeId, numbers and github.com links go in, so nothing a pull request wrote
 * can reach it. `items` are {id, number (the issue's, or null), status (its value, or null)}; `problems` are texts;
 * `repo` is `owner/name`.
 */
export function commentBody({ stage, items, problems, repo, runUrl, boardUrl }) {
  if (!BUILD_STATUSES.includes(stage)) throw new Error(`${stage} is not a build status`);
  const shown = items.slice(0, MAX_LISTED);
  const listed = items.length
    ? shown.map((item) => itemLine(repo, item))
    : ['No requirement moves with this pull request.'];
  const rest = items.length > shown.length ? [`…and ${items.length - shown.length} more`] : [];
  const links = [
    ['Board', link(boardUrl)],
    ['Run', link(runUrl)],
  ]
    .filter(([, url]) => url)
    .map(([name, url]) => `[${name}](${url})`);
  const lines = [COMMENT_MARKER, `**Build status: ${stage}**`, '', ...listed, ...rest];
  if (problems.length) lines.push('', ...problems.map((p) => `> ${String(p).replace(/\s+/g, ' ')}`));
  if (links.length) lines.push('', links.join(' · '));
  return `${lines.join('\n')}\n`;
}
