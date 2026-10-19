#!/usr/bin/env node
// The wiki's Plan versus actual page (spec §41, plan_vs_actual). It sets each wave's planned dates beside what really
// happened, so later plans are estimated from real data, not hope.
//
// - A test's written day is the first commit on main whose requirements file gives it status 'written'.
// - A requirement's proved day is the latest written day of the tests it names. It is the first day all of them were
//   written.
// - Main's history is read merge by merge (git log --first-parent), so a day is when the work reached main.
// - The requirements file moved from .gql to .md, a graph note holding the same graph. Both names are read.
//
// scripts/wiki.mjs makes the page each time it makes the wiki. Run alone, it prints the page:
//   node scripts/plan-actuals.mjs [--releases FILE] [--date YYYY-MM-DD]
// --releases is `gh release list --json tagName,name,publishedAt` saved to a file. Without it the release column is
// empty: nothing here reaches the network.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The names the requirements file has had, oldest first. */
export const REQUIREMENTS_FILES = ['requirements/editor-requirements.gql', 'requirements/editor-requirements.md'];

const DAY_MS = 86_400_000;
const RATE_DAYS = 7;

/** The days from one ISO date to another: negative when `to` comes first. */
export const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** An ISO date moved on by a number of days. */
const plus = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);

// A test record of the requirements graph, on a line of its own, with its status. Read by pattern, not by the graph
// reader, so every past form of the file is read the same way.
const TEST_RECORD = /^\((test_[a-z0-9_]+):Test \{.*?status: '(\w+)'/gm;

/** The day each test first became written: a Map of test id to ISO day. `revisions` are [{day, text}], oldest first. */
export function testDays(revisions) {
  const days = new Map();
  for (const { day, text } of revisions)
    for (const [, id, status] of text.matchAll(TEST_RECORD))
      if (status === 'written' && !days.has(id)) days.set(id, day);
  return days;
}

/**
 * The day each proved requirement became proved: a Map of requirement id to ISO day. `requirements` are the slice
 * board's (readBoard). A requirement not proved today, or with a test whose day is unknown, has no day.
 */
export function requirementDays(requirements, days) {
  const out = new Map();
  for (const r of requirements) {
    if (r.status !== 'proved') continue;
    const of = r.tests.map((t) => days.get(t.id));
    if (of.every(Boolean)) out.set(r.id, of.sort().at(-1));
  }
  return out;
}

/**
 * Every revision of the requirements file on the first-parent line of `ref`, oldest first: [{sha, day, text}]. The
 * day is the commit's date in UTC. A shallow clone has no history to read, so it is refused.
 */
export function readHistory(root = ROOT, ref = 'HEAD') {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, TZ: 'UTC' } });
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true')
    throw new Error('the clone is shallow, so main’s history cannot be read: run git fetch --unshallow');
  const commits = git(
    'log',
    '--first-parent',
    '--reverse',
    '--format=%H %cd',
    '--date=format-local:%Y-%m-%d',
    ref,
    '--',
    ...REQUIREMENTS_FILES,
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' '));
  const revisions = [];
  for (const [sha, day] of commits) {
    const files = git('ls-tree', '--name-only', sha, '--', ...REQUIREMENTS_FILES)
      .split('\n')
      .filter(Boolean);
    const file = REQUIREMENTS_FILES.findLast((f) => files.includes(f));
    if (file) revisions.push({ sha, day, text: git('show', `${sha}:${file}`) });
  }
  return revisions;
}

/**
 * Stable published releases oldest first, as {tag, day}. A tag with a hyphen is a pre-release, such as a nightly. A
 * draft has no real publish date, so it is left out.
 */
const stable = (releases) =>
  releases
    .filter((r) => !r.tagName.includes('-') && r.publishedAt && !r.publishedAt.startsWith('0001'))
    .map((r) => ({ tag: r.tagName, day: r.publishedAt.slice(0, 10) }))
    .sort((a, b) => a.day.localeCompare(b.day));

/**
 * The facts of the page. `days` is requirementDays's Map, `releases` GitHub's list (or empty), `today` an ISO date.
 * - waves: each wave's plan, its proved count, and its first and last proved days. Then the first stable release on
 *   or after the last day, and its slip in days. A wave not finished has no last day; past its end, its slip is so far.
 * - perDay: the requirements proved each day, with the running total.
 * - rate: requirements proved a day over the seven days up to today.
 * - forecasts: each unfinished wave in order, with what is left and the day it would finish at that rate.
 * - since: the day the history starts, when given. Work proved before then counts as proved on that day.
 */
export function planActuals({ waves, workstreams, requirements, days, releases, today, since = null }) {
  const released = stable(releases);
  const proved = new Set(requirements.filter((r) => r.status === 'proved').map((r) => r.id));
  const rows = waves.map((w) => {
    const ids = [...new Set(w.workstreams.flatMap((k) => workstreams[k]?.requirements ?? []))];
    const known = ids.filter((id) => requirements.some((r) => r.id === id));
    const dated = known
      .map((id) => days.get(id))
      .filter(Boolean)
      .sort();
    const done = known.length > 0 && known.every((id) => proved.has(id));
    const last = done ? (dated.at(-1) ?? null) : null;
    const release = last ? released.find((r) => r.day >= last) : undefined;
    const slip = last ? daysBetween(w.end, last) : today > w.end && known.length ? daysBetween(w.end, today) : null;
    return {
      title: w.title,
      start: w.start,
      end: w.end,
      proved: known.filter((id) => proved.has(id)).length,
      total: known.length,
      first: dated[0] ?? null,
      last,
      release: release?.tag ?? null,
      releaseDay: release?.day ?? null,
      slip,
      done,
    };
  });

  const counts = new Map();
  for (const day of days.values()) counts.set(day, (counts.get(day) ?? 0) + 1);
  let total = 0;
  const perDay = [...counts.keys()]
    .sort()
    .map((day) => ({ day, proved: counts.get(day), total: (total += counts.get(day)) }));

  const from = plus(today, 1 - RATE_DAYS);
  const rate = perDay.filter((d) => d.day >= from && d.day <= today).reduce((n, d) => n + d.proved, 0) / RATE_DAYS;

  let left = 0;
  const forecasts = rows
    .filter((w) => w.total && !w.done)
    .map((w) => {
      left += w.total - w.proved;
      return { title: w.title, remaining: w.total - w.proved, day: rate ? plus(today, Math.ceil(left / rate)) : null };
    });
  return { waves: rows, perDay, rate, forecasts, since };
}

/** A slip in words: late, early or on time, with "so far" while the wave is not finished. */
function slipWords(w) {
  if (w.slip === null) return '—';
  const n = Math.abs(w.slip);
  const words = w.slip === 0 ? 'on time' : `${n} ${n === 1 ? 'day' : 'days'} ${w.slip > 0 ? 'late' : 'early'}`;
  return w.done ? words : `${words} so far`;
}

/**
 * The page's Markdown. `facts` are planActuals's, with `today`. `day` and `footer` are the helpers of wiki.mjs, so
 * every page dates things and says where it came from the same way. `sha` is the commit it was made at.
 */
export function planActualsPage({ waves, perDay, rate, forecasts, since, today }, { day, footer, sha = 'main' }) {
  const or = (iso) => (iso ? day(iso) : '—');
  const finished = waves.filter((w) => w.done && w.slip !== null);
  const meanSlip = finished.length ? finished.reduce((n, w) => n + w.slip, 0) / finished.length : null;
  const summary = [
    `- **Waves finished:** ${finished.length} of ${waves.filter((w) => w.total).length} with requirements`,
    `- **Average slip of a finished wave:** ${meanSlip === null ? '—' : `${meanSlip.toFixed(1)} days`}`,
    `- **Rate now:** ${rate.toFixed(2)} a day, over the last seven days`,
  ];
  const wavesTable = [
    '| Wave | Planned | Proved | First proved | Last proved | First release after | Slip |',
    '|---|---|---|---|---|---|---|',
    ...waves.map(
      (w) =>
        `| ${w.title} | ${day(w.start)} to ${day(w.end)} | ${w.total ? `${w.proved} / ${w.total}` : '—'} | ` +
        `${or(w.first)} | ${or(w.last)} | ${w.release ? `${w.release} (${day(w.releaseDay)})` : '—'} | ${slipWords(w)} |`,
    ),
  ].join('\n');
  const daysTable = [
    '| Day | Proved that day | Proved in all |',
    '|---|---|---|',
    ...perDay.map((d) => `| ${day(d.day)} | ${d.proved} | ${d.total} |`),
  ].join('\n');
  const forecastPart = rate
    ? [
        '| Wave | Left to prove | Forecast finish |',
        '|---|---|---|',
        ...forecasts.map((f) => `| ${f.title} | ${f.remaining} | ${or(f.day)} |`),
      ].join('\n')
    : 'No forecast: nothing was proved in the last seven days.';
  return (
    `# Plan versus actual\n\nWhen each wave was planned to finish, and when it did. The real dates make later plans ` +
    `better. A requirement counts as proved on the first day main held every test it names as written.` +
    (since ? ` The history on main starts on ${day(since)}, so work proved before then counts from that day.` : '') +
    `\n\n` +
    `${summary.join('\n')}\n\n## Waves\n\n${wavesTable}\n\n` +
    `A release is the first stable one published on or after the wave's last proved day. Slip is the days from the ` +
    `planned end to the last proved day.\n\n## Forecast\n\n` +
    `Each remaining wave, in plan order, at the rate of the last seven days. Each forecast counts the work of ` +
    `the waves before it.\n\n${forecastPart}\n\n## Proved each day\n\n${daysTable}\n` +
    footer(`the history of the requirements file on main and \`requirements/waves.json\``, sha, today)
  );
}

/** The value of a flag, or undefined. */
const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

/** The facts for this repository: its history, its current requirements, its waves and the given releases. */
export async function repositoryFacts({ releases = [], today, ref = 'HEAD', root = ROOT } = {}) {
  const { readBoard } = await import('./slice-board.mjs');
  const file = REQUIREMENTS_FILES.findLast((f) => existsSync(join(root, f)));
  const { requirements } = readBoard(readFileSync(join(root, file), 'utf8'));
  const json = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
  const history = readHistory(root, ref);
  const days = requirementDays(requirements, testDays(history));
  return planActuals({
    waves: json('requirements/waves.json').waves,
    workstreams: json('requirements/workstreams.json'),
    requirements,
    days,
    releases,
    today,
    since: history[0]?.day ?? null,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const releasesFile = flag(args, '--releases');
  const today = flag(args, '--date') ?? new Date().toISOString().slice(0, 10);
  const facts = await repositoryFacts({
    releases: releasesFile ? JSON.parse(readFileSync(releasesFile, 'utf8')) : [],
    today,
  });
  process.stdout.write(
    planActualsPage(
      { ...facts, today },
      { day: (iso) => iso, footer: (sources) => `\n---\n_Made from ${sources}._\n` },
    ),
  );
}
