#!/usr/bin/env node
// Writes the project's GitHub wiki from the repository (spec §41, wiki_generated and user_guide_wiki). It writes where
// the work stands, the roadmap, the plan set beside what happened, the decisions and open questions, the quality figures and the releases. Each page is
// made from the file that holds it. So the wiki never drifts from the code and nobody keeps it by hand.
//
// The pages a person writes, the user guide among them, live in wiki/. They are copied, with each <!-- wiki:NAME -->
// marker filled. The guide's settings come from the editor's own list of options, and its pictures from
// scripts/wiki-screens.mjs's SHOTS. .github/workflows/wiki.yml runs it on every push to main and every release, and
// pushes the pages to the wiki.
//
// Usage:
//   node scripts/wiki.mjs --out DIR [--sha SHA] [--date YYYY-MM-DD] [--releases FILE] [--released FILE]
//     [--labels FILE].
// --releases is `gh release list --json tagName,name,publishedAt` saved to a file. Without it the versions come from
// versions.json alone. --released is requirements/editor-requirements.gql as it stood at the latest stable release. So
// the developer pages tell what is released from what is only in the nightly build. --labels is the labels.json
// scripts/wiki-screens.mjs writes. Each label of the card's buttons the guide does not name is printed as a GitHub
// warning.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requirementsGraph } from './check-requirements.mjs';
import { ethosPage, readEthos } from './ethos.mjs';
import { readBoard } from './slice-board.mjs';
import { planActualsPage, repositoryFacts } from './plan-actuals.mjs';
import { developerFacts, developerFills, referencePage, requirementStates } from './wiki-developers.mjs';
import { roadmapPage } from './wiki-roadmap.mjs';
import { SHOTS } from './wiki-screens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/rogerbucks/thoughtknot';
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

/** The pages this script makes from the repository's files, beside the ones it copies from wiki/. */
export const MADE_PAGES = [
  'Roadmap.md',
  'Plan-vs-actual.md',
  'Status.md',
  'Decisions.md',
  'Open-questions.md',
  'Quality.md',
  'Releases.md',
  'Ethos.md',
  'Developer-reference.md',
  '_Sidebar.md',
];

/** The open questions and decisions of the requirements: [{num, slice, text, answer, answered}], by number. */
export function readQuestions(text) {
  const store = read([requirementsGraph(text)]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  return [...graph.nodes.values()]
    .filter((n) => n.labels.has('Question'))
    .map((n) => ({
      num: String(n.props.num ?? ''),
      slice: n.props.slice,
      text: String(n.props.text ?? ''),
      answer: n.props.answer === undefined ? '' : String(n.props.answer),
      answered: n.props.answered === undefined ? '' : String(n.props.answered),
    }))
    .sort((a, b) => a.num.localeCompare(b.num, 'en', { numeric: true }));
}

/** A bar of ten blocks for a share from 0 to 1, with its percentage. */
export function bar(done, total) {
  const share = total ? done / total : 0;
  const filled = Math.round(share * 10);
  return `${'▓'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.round(share * 100)}%`;
}

/** The counts {proved, total} of a list of requirement ids, read from the requirements. */
function counted(ids, requirements) {
  const of = requirements.filter((r) => ids.includes(r.id));
  return { proved: of.filter((r) => r.status === 'proved').length, total: of.length };
}

/** Each wave with its counts and its state: done (every requirement proved), now (today falls in it) or later. */
export function waveStates(waves, workstreams, requirements, today) {
  return waves.map((w) => {
    const ids = w.workstreams.flatMap((k) => workstreams[k]?.requirements ?? []);
    const { proved, total } = counted(ids, requirements);
    const state =
      total && proved === total
        ? 'done'
        : today >= w.start && today <= w.end
          ? 'now'
          : today > w.end
            ? 'late'
            : 'later';
    return { ...w, proved, total, state };
  });
}

const STATE_MARK = { done: '✅ Done', now: '🟡 Now', late: '🔴 Behind', later: '⏳ Later' };
const day = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** The line each generated page ends with: where it came from, and that it is not edited here. */
const footer = (sources, sha, date) =>
  `\n---\n_Made from ${sources} at [\`${sha.slice(0, 7)}\`](${REPO}/commit/${sha}) on ${day(date)}. ` +
  `This page is generated: change the repository, not this page, as edits here are overwritten._\n`;

/** The status of every slice: proved out of all, with a bar. */
function slicesTable(requirements) {
  const slices = [...new Set(requirements.map((r) => r.slice))].sort((a, b) => a - b);
  const rows = slices.map((s) => {
    const of = requirements.filter((r) => r.slice === s);
    const proved = of.filter((r) => r.status === 'proved').length;
    return `| ${s} | ${proved} / ${of.length} | ${bar(proved, of.length)} |`;
  });
  return ['| Slice | Proved | Progress |', '|---|---|---|', ...rows].join('\n');
}

/** Text as it reads in a cell of a Markdown table: a backslash and a bar each escaped, so neither ends the cell. */
export const cell = (text) => String(text).replace(/[\\|]/g, '\\$&');

/** The settings of the editor, one table for each part of the settings page, in plain words. */
export function settingsTables(options) {
  const sections = [...new Set(options.map((o) => o.section))];
  return sections
    .map((section) => {
      const rows = options
        .filter((o) => o.section === section)
        .map((o) => {
          const choices = (o.choices ?? []).map((c) => cell(c.name)).join(', ');
          return `| **${cell(o.name)}** | ${cell(o.sentence)} | ${choices || '—'} |`;
        });
      return [`### ${section}`, '', '| Setting | What it does | Choices |', '|---|---|---|', ...rows].join('\n');
    })
    .join('\n\n');
}

/** A hand-written page with its markers filled: settings, a picture by name, the current wave and the slices. */
export function fillMarkers(text, fills) {
  return text.replace(/<!-- wiki:([a-z-]+)(?: ([a-z0-9-]+))? -->/g, (marker, name, arg) => {
    if (name === 'shot') {
      const shot = SHOTS.find((s) => s.name === arg);
      if (!shot) throw new Error(`${marker}: no such screenshot in scripts/wiki-screens.mjs`);
      return `![${shot.alt}](images/${shot.name}.png)`;
    }
    if (!(name in fills)) throw new Error(`${marker}: nothing fills this marker`);
    return typeof fills[name] === 'function' ? fills[name](arg) : fills[name];
  });
}

/** The pictures a page asks for, by name. */
export const shotsOf = (text) => [...text.matchAll(/<!-- wiki:shot ([a-z-]+) -->/g)].map((m) => m[1]);

/** The labels of the card's buttons the guide never names (a count of problems is the one button it names as such). */
export function unexplained(labels, guide) {
  const words = guide.toLowerCase();
  return labels.filter((l) => !/\bproblems?\b/i.test(l) && !words.includes(l.toLowerCase()));
}

/**
 * Every page of the wiki, as {file name: Markdown}. `pages` are the hand-written pages of wiki/ ({name: text}),
 * `options` the editor's settings, `releases` GitHub's list (or empty), `today` an ISO date. `ethosText`, the
 * project's ethos graph, adds the Ethos page when given. `developer` is the architecture graph and the facts read from
 * the code (wiki-developers.mjs). It fills the developer pages' markers and adds the Developer reference.
 * `releasedText` is the requirements as they stood at the latest stable release. It tells what is released from what
 * is only on main. `planActual`, the facts of scripts/plan-actuals.mjs, adds the Plan versus actual page when given.
 */
export function renderWiki({
  requirementsText,
  ethosText,
  developer,
  releasedText,
  planActual,
  waves,
  workstreams,
  baseline,
  versions,
  releases,
  options,
  pages,
  sha,
  today,
}) {
  const board = readBoard(requirementsText);
  const { requirements } = board;
  const latest = releases.find((r) => !/-/.test(r.tagName))?.tagName;
  const states = requirementStates(requirements, releasedText ? readBoard(releasedText).requirements : null);
  const questions = readQuestions(requirementsText);
  const waveList = waveStates(waves, workstreams, requirements, today);
  const current =
    waveList.find((w) => w.state === 'now' || w.state === 'late') ?? waveList.find((w) => w.state === 'later');
  const version = Object.keys(versions).at(-1);
  const proved = requirements.filter((r) => r.status === 'proved').length;
  const open = questions.filter((q) => !q.answer);
  const fills = {
    settings: settingsTables(options),
    slices: slicesTable(requirements),
    now: [
      `- **Version:** ${version}`,
      `- **Now:** ${current ? `${current.title} (${day(current.start)} to ${day(current.end)})` : 'every wave is done'}`,
      `- **Requirements proved:** ${proved} of ${requirements.length} ${bar(proved, requirements.length)}`,
      `- **Questions waiting for an answer:** ${open.length} ([Open questions](Open-questions))`,
    ].join('\n'),
    ...(developer && developerFills(developer, board, states, latest)),
  };
  const out = {};
  for (const [name, text] of Object.entries(pages)) out[name] = fillMarkers(text, fills);

  out['Roadmap.md'] = roadmapPage(
    { states: waveList, workstreams, requirements, releases, sha, today },
    { counted, day, footer, STATE_MARK },
  );

  if (planActual) out['Plan-vs-actual.md'] = planActualsPage({ ...planActual, today }, { day, footer, sha });

  out['Status.md'] =
    `# Status\n\n${fills.now}\n\n## By slice\n\n${fills.slices}\n\n` +
    `A requirement is **proved** when every test it names is written and passing in CI. Each requirement, with its ` +
    `build status, is tracked on the [requirements project](${REPO}/projects).\n` +
    footer('`requirements/editor-requirements.gql`', sha, today);

  const answered = questions.filter((q) => q.answer).sort((a, b) => b.answered.localeCompare(a.answered));
  out['Decisions.md'] =
    `# Decisions\n\nEvery question the project has answered, newest first.\n\n| | Question | Decision | Date |\n|---|---|---|---|\n` +
    answered.map((q) => `| ${q.num} | ${cell(q.text)} | ${cell(q.answer)} | ${day(q.answered)} |`).join('\n') +
    '\n' +
    footer('`requirements/editor-requirements.gql`', sha, today);

  const slicesOpen = [...new Set(open.map((q) => q.slice))].sort((a, b) => a - b);
  out['Open-questions.md'] =
    `# Open questions\n\nQuestions still waiting for an answer, by the slice that needs them first.\n\n` +
    (slicesOpen.length
      ? slicesOpen
          .map(
            (s) =>
              `## Slice ${s}\n\n` +
              open
                .filter((q) => q.slice === s)
                .map((q) => `- **${q.num}** ${q.text}`)
                .join('\n'),
          )
          .join('\n\n')
      : 'None: every question has an answer.') +
    '\n' +
    footer('`requirements/editor-requirements.gql`', sha, today);

  const m = baseline.metrics;
  const audit = m.audit_critical + m.audit_high + m.audit_moderate + m.audit_low;
  out['Quality.md'] =
    `# Quality\n\nThe figures every release is held to. A release that does worse on any of them fails, unless the ` +
    `reason is written down in [\`quality/accepted.json\`](${REPO}/blob/main/quality/accepted.json).\n\n` +
    `| Measure | Figure | What it means |\n|---|---|---|\n` +
    `| Tests covering the code | ${m.coverage_percent}% | How much of the code the tests run |\n` +
    `| Flaky tests | ${m.flaky_tests} | Tests that pass and fail without a change |\n` +
    `| Known vulnerabilities in dependencies | ${audit} | From \`npm audit\` |\n` +
    `| Secrets found in the code | ${m.secrets_found} | Passwords, keys or tokens left in the code |\n` +
    `| Plugin size | ${(m.bundle_bytes / 1e6).toFixed(1)} MB | What a user downloads |\n` +
    `| Largest source file | ${m.max_source_lines} lines | Kept under 400 so code stays readable |\n` +
    `| Test suite time | ${m.suite_seconds} s | How long every test takes to run |\n\n` +
    `Measured on ${day(baseline.measured)}.\n` +
    footer('`quality/baseline.json`', sha, today);

  const rows = releases.length
    ? releases.map(
        (r) =>
          `| [${r.tagName}](${REPO}/releases/tag/${r.tagName}) | ${r.name || r.tagName} | ${day(r.publishedAt.slice(0, 10))} |`,
      )
    : Object.keys(versions)
        .reverse()
        .map((v) => `| [${v}](${REPO}/releases/tag/${v}) | Obsidian ${versions[v]} or later | — |`);
  out['Releases.md'] =
    `# Releases\n\nEach release carries the plugin, both libraries and a \`SHA256SUMS\` file to check them by.\n\n` +
    `| Version | Name | Published |\n|---|---|---|\n${rows.join('\n')}\n` +
    footer(releases.length ? 'GitHub releases' : '`versions.json`', sha, today);

  if (ethosText !== undefined)
    out['Ethos.md'] = ethosPage(readEthos(ethosText), requirements) + footer('`requirements/ethos.gql`', sha, today);

  if (developer)
    out['Developer-reference.md'] =
      referencePage(developer, latest) +
      footer('`packages/graph-spec/src/reader/problem-codes.json`, the core and its contracts', sha, today);

  out['_Sidebar.md'] = [
    '**[Home](Home)**',
    '',
    '**Using it**',
    '- [How to use ThoughtKnot](How-to-use-ThoughtKnot)',
    '',
    '**The project**',
    ...(ethosText === undefined ? [] : ['- [Ethos](Ethos)']),
    '- [Status](Status)',
    '- [Roadmap](Roadmap)',
    ...(planActual ? ['- [Plan versus actual](Plan-vs-actual)'] : []),
    '- [Decisions](Decisions)',
    '- [Open questions](Open-questions)',
    '- [Quality](Quality)',
    '- [Releases](Releases)',
    '',
    '**Building it**',
    '- [For developers](For-developers)',
    '- [Architecture](Architecture)',
    '- [Writing a plug-in](Writing-a-plug-in)',
    '- [Adding a host](Adding-a-host)',
    ...(developer ? ['- [Developer reference](Developer-reference)'] : []),
    '',
    '**Designs**',
    ...Object.keys(pages)
      .filter((f) => f.endsWith('-design.md') || f === 'Design-review.md')
      .sort()
      .map((f) => `- [${f.slice(0, -3).replace(/-/g, ' ')}](${f.slice(0, -3)})`),
    '',
  ].join('\n');
  return out;
}

/** The value of a flag, or undefined. */
const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = flag(args, '--out');
  if (!out) throw new Error('give the folder for the pages: --out DIR');
  const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  const { OPTIONS } = await import('../packages/core/src/settings.ts');
  const wikiDir = join(ROOT, 'wiki');
  const pages = Object.fromEntries(
    readdirSync(wikiDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => [f, readFileSync(join(wikiDir, f), 'utf8')]),
  );
  const releasesFile = flag(args, '--releases');
  const releasedFile = flag(args, '--released');
  const releases = releasesFile ? JSON.parse(readFileSync(releasesFile, 'utf8')) : [];
  const today = flag(args, '--date') ?? new Date().toISOString().slice(0, 10);
  const made = renderWiki({
    developer: await developerFacts(),
    releasedText: releasedFile && existsSync(releasedFile) ? readFileSync(releasedFile, 'utf8') : undefined,
    planActual: await repositoryFacts({ releases, today }),
    requirementsText: readFileSync(join(ROOT, 'requirements/editor-requirements.gql'), 'utf8'),
    ethosText: readFileSync(join(ROOT, 'requirements/ethos.gql'), 'utf8'),
    waves: json('requirements/waves.json').waves,
    workstreams: json('requirements/workstreams.json'),
    baseline: json('quality/baseline.json'),
    versions: json('versions.json'),
    releases,
    options: OPTIONS,
    pages,
    sha: flag(args, '--sha') ?? 'main',
    today,
  });
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(made)) writeFileSync(join(out, name), text);
  const labelsFile = flag(args, '--labels');
  if (labelsFile && existsSync(labelsFile))
    for (const label of unexplained(JSON.parse(readFileSync(labelsFile, 'utf8')), pages['How-to-use-ThoughtKnot.md']))
      console.log(`::warning::The user guide (wiki/How-to-use-ThoughtKnot.md) does not explain the "${label}" button`);
  console.log(`wrote ${Object.keys(made).length} pages to ${out}`);
}
