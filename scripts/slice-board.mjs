#!/usr/bin/env node
// Prints a self-contained HTML progress board for the slice being built (spec §12, requirements_checked_in_ci), read
// from the generated requirements copy with the repo's own graph-spec reader. A requirement is proved when it names a
// test and every one is written, part when some are, open otherwise. The board counts the requirements whose slice
// equals N exactly, unlike check-requirements.mjs, which holds every slice up to the current one (<=). Its overview says
// whether the slice is done (done_means_proved), as check-requirements.mjs's `sliceDone` says it. The page is CSS
// only (its stylesheet is slice-board-style.mjs): no script, font, image or request, so it opens offline, and it
// switches between three altitudes (Overview, Working, Full) with radio inputs. readBoard also reads the copy's open
// questions, which the GitHub mirror uses; the board itself does not show them.
//
// Usage:
//   node scripts/slice-board.mjs [--slice N] [--prs FILE] [--date YYYY-MM-DD] [--standalone] > board.html
//
// --prs reads the JSON that `gh pr list --state open --json number,title,url,headRefName,mergeable,statusCheckRollup`
// prints. --standalone wraps the page in a whole document; without it the page is a fragment (title, style, content)
// for a host that adds the skeleton. The page is generated: never edited by hand.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_SLICE, REQUIREMENTS, filesOf, requirementsGraph, sliceDone } from './check-requirements.mjs';
import { ALTITUDES, BOARD_CSS } from './slice-board-style.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

const STATUSES = ['proved', 'part', 'open'];
const DEFAULT_ALTITUDE = 'working';
const MEANINGS = {
  proved: 'every test it names is written',
  part: 'some of its tests are written, or one is partial',
  open: 'none is written, or it names no test',
};

/**
 * The status of a requirement from its tests: proved, part or open. Only written tests prove: a partial test (its file
 * is there but does not yet prove every rule) makes the requirement part, in progress, and never proved.
 */
export function statusOf(tests) {
  const written = tests.filter((t) => t.status === 'written').length;
  if (written === tests.length && written) return 'proved';
  return written || tests.some((t) => t.status === 'partial') ? 'part' : 'open';
}

/**
 * Reads the requirements copy: {sections: [{num, title}], requirements: [{id, section, slice, level, rule, tests,
 * status}], questions: [{id, num, slice, text, blocks}]}, each test {id, proves, files, where, status}. A question's
 * `blocks` lists the ids of the requirements it has a BLOCKS link to; a copy with no question gives an empty list.
 * Throws what the reader throws for a text it cannot read.
 */
export function readBoard(text) {
  const store = read([requirementsGraph(text)]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  const ofLabel = (label) => [...graph.nodes].filter(([, n]) => n.labels.has(label));
  const tests = new Map(
    ofLabel('Test').map(([key, n]) => [
      key,
      {
        id: n.props.id,
        proves: String(n.props.proves ?? ''),
        files: filesOf(n.props.file),
        where: String(n.props.where ?? ''),
        status: n.props.status,
      },
    ]),
  );
  const proving = new Map();
  const blocking = new Map();
  for (const [from, type, to] of graph.edges) {
    if (type === 'PROVED_BY' && tests.has(to)) proving.set(from, [...(proving.get(from) ?? []), tests.get(to)]);
    const blocked = graph.nodes.get(to);
    if (type === 'BLOCKS' && blocked?.labels.has('Requirement'))
      blocking.set(from, [...(blocking.get(from) ?? []), blocked.props.id]);
  }
  return {
    sections: ofLabel('Section').map(([, n]) => ({ num: String(n.props.num), title: String(n.props.title ?? '') })),
    requirements: ofLabel('Requirement').map(([key, n]) => {
      const named = proving.get(key) ?? [];
      return {
        id: n.props.id,
        section: String(n.props.section),
        slice: n.props.slice,
        level: String(n.props.level ?? ''),
        rule: String(n.props.rule ?? ''),
        tests: named,
        status: statusOf(named),
      };
    }),
    questions: ofLabel('Question').map(([key, n]) => ({
      id: n.props.id,
      num: String(n.props.num ?? ''),
      slice: n.props.slice,
      text: String(n.props.text ?? ''),
      blocks: blocking.get(key) ?? [],
    })),
  };
}

const count = (requirements) => {
  const counts = { proved: 0, part: 0, open: 0, total: requirements.length };
  for (const r of requirements) counts[r.status] += 1;
  return counts;
};

/** The counts {proved, part, open, total} of the requirements of one slice. */
export function summarise(requirements, slice) {
  return count(requirements.filter((r) => r.slice === slice));
}

/** The counts of each section of a slice, in section order; a section with nothing in the slice is left out. */
export function summariseBySection(requirements, sections, slice) {
  const nums = [...new Set(requirements.filter((r) => r.slice === slice).map((r) => r.section))];
  nums.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return nums.map((num) => ({
    num,
    title: sections.find((s) => s.num === num)?.title ?? '',
    ...count(requirements.filter((r) => r.slice === slice && r.section === num)),
  }));
}

/**
 * A pull request's CI rollup as {passed, failed, running}, from check runs and from commit statuses. A rollup that is
 * not a list counts nothing, an entry that is not an object is skipped, and one with neither status nor state is running.
 */
export function summariseChecks(rollup) {
  const counts = { passed: 0, failed: 0, running: 0 };
  if (!Array.isArray(rollup)) return counts;
  for (const c of rollup) {
    if (c === null || typeof c !== 'object') continue;
    if (c.status === undefined && c.state === undefined) {
      counts.running += 1;
      continue;
    }
    const done = c.status === undefined ? !/^(PENDING|EXPECTED)$/.test(c.state) : c.status === 'COMPLETED';
    if (!done) counts.running += 1;
    else if (/^(SUCCESS|NEUTRAL|SKIPPED)$/.test(c.conclusion || c.state)) counts.passed += 1;
    else counts.failed += 1;
  }
  return counts;
}

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const bar = (c) => {
  let x = 0;
  const segments = STATUSES.map((status) => {
    const width = c.total ? (100 * c[status]) / c.total : 0;
    const rect = `<rect class="seg-${status}" x="${x.toFixed(3)}" width="${width.toFixed(3)}" height="10"/>`;
    x += width;
    return rect;
  }).join('');
  const label = `${c.proved} proved, ${c.part} part, ${c.open} open of ${c.total}`;
  return `<svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${label}">${segments}</svg>`;
};

const tally = (c) => `${c.proved} of ${c.total} proved`;
const sectionLabel = (num, title) => `§${esc(num)}${title ? ` ${esc(title)}` : ''}`;

const testItem = (t) => {
  const files = t.files.map((f) => `<code>${esc(f)}</code>`).join('');
  const where = t.where && t.where !== 'repo' ? t.where : t.files.length ? '' : 'no file yet';
  return `<li class="test"><span class="chip chip-${['written', 'partial'].includes(t.status) ? t.status : 'planned'}">${esc(t.status)}</span>
<span class="proves">${esc(t.proves)}</span>
<div class="scroll files">${files}${where ? `<span class="where">${esc(where)}</span>` : ''}</div></li>`;
};

const card = (r) => `<article class="req req-${r.status}">
<div class="req-head"><code class="id">${esc(r.id)}</code><span class="level">${esc(r.level)}</span><span class="chip chip-${r.status}">${r.status}</span></div>
<p class="rule">${esc(r.rule)}</p>
${r.tests.length ? `<ul class="tests">${r.tests.map(testItem).join('\n')}</ul>` : '<p class="no-test">This requirement names no test.</p>'}
</article>`;

const grouped = (requirements, sections, slice) =>
  summariseBySection(requirements, sections, slice)
    .map(
      (s) => `<div class="group"><h3>${sectionLabel(s.num, s.title)}</h3>
${requirements
  .filter((r) => r.slice === slice && r.section === s.num)
  .map(card)
  .join('\n')}</div>`,
    )
    .join('\n');

const emptySlice = (board, slice) => !board.requirements.some((r) => r.slice === slice);
const noRequirements = (slice) => `<p class="none">Slice ${slice} has no requirements.</p>`;

/** How many faults the copy has, said after what is still to prove; nothing when it has none. */
const faulty = (done) => {
  const n = done.faults?.length ?? 0;
  return n ? `, and the copy has ${n} fault${n === 1 ? '' : 's'}` : '';
};

/** Whether the slice is done (done_means_proved), as check-requirements.mjs's `sliceDone` says: nothing when not given. */
const doneLine = (done) => {
  if (!done?.total) return '';
  const words = done.done
    ? `Slice ${esc(done.slice)} is done: every one of its ${done.total} requirements is proved by a written test.`
    : `Slice ${esc(done.slice)} is not done: ${done.missing.length} of ${done.total} requirements are still to prove${faulty(done)}.`;
  const chip = done.done
    ? '<span class="chip chip-proved">done</span>'
    : '<span class="chip chip-open">not done</span>';
  return `<p class="done">${chip} ${words}</p>\n`;
};

const overviewView = (board, slice, done) => {
  if (emptySlice(board, slice))
    return `<section class="view view-overview">\n<h2>Slice ${slice}</h2>\n${noRequirements(slice)}\n</section>`;
  const total = summarise(board.requirements, slice);
  const rows = summariseBySection(board.requirements, board.sections, slice).map(
    (s) => `<li class="section-row"><span class="section-name">${sectionLabel(s.num, s.title)}</span>${bar(s)}
<span class="section-counts">${tally(s)} · ${s.part} part · ${s.open} open</span></li>`,
  );
  return `<section class="view view-overview">
<h2>Slice ${slice}: <span class="big">${tally(total)}</span></h2>
<div class="slice-bar">${bar(total)}</div>
<p class="counts">${total.proved} proved · ${total.part} part · ${total.open} open</p>
${doneLine(done)}<ul class="section-rows">${rows.join('\n')}</ul>
</section>`;
};

const workingView = (board, slice) => {
  const left = board.requirements.filter((r) => r.status !== 'proved');
  let body = noRequirements(slice);
  if (!emptySlice(board, slice))
    body = left.some((r) => r.slice === slice)
      ? grouped(left, board.sections, slice)
      : `<p>Nothing left: every requirement of slice ${slice} is proved.</p>`;
  return `<section class="view view-working">\n<h2>Still to prove</h2>\n${body}\n</section>`;
};

const fullView = (board, slice) => {
  const body = emptySlice(board, slice) ? noRequirements(slice) : grouped(board.requirements, board.sections, slice);
  return `<section class="view view-full">\n<h2>Every requirement of slice ${slice}</h2>\n${body}\n</section>`;
};

const MERGE_CHIP = { mergeable: 'proved', conflicting: 'open' };

const prItem = (pr) => {
  const ci = summariseChecks(pr.statusCheckRollup);
  const mergeable = String(pr.mergeable ?? 'unknown').toLowerCase();
  const heading = `#${esc(pr.number)} ${esc(pr.title)}`;
  const link = /^https?:\/\//i.test(String(pr.url)) ? `<a href="${esc(pr.url)}">${heading}</a>` : heading;
  const chip = Object.hasOwn(MERGE_CHIP, mergeable) ? MERGE_CHIP[mergeable] : 'part';
  const checks =
    ci.passed + ci.failed + ci.running
      ? `<span class="ci-passed">${ci.passed} passed</span><span class="ci-failed">${ci.failed} failed</span><span class="ci-running">${ci.running} running</span>`
      : '<span class="ci-none">no checks yet</span>';
  return `<li class="pr">${link}
<div class="meta"><span>${esc(pr.headRefName)}</span><span class="chip chip-${chip}">${esc(mergeable)}</span>
${checks}</div></li>`;
};

const prsPanel = (prs) => `<section class="prs">
<h2>Open pull requests</h2>
${prs.length ? `<ul>${prs.map(prItem).join('\n')}</ul>` : '<p>No pull requests are open.</p>'}
</section>`;

/**
 * The page for one slice: {sections, requirements} as readBoard gives them, the slice number, the date shown in the
 * banner, the pull requests gh prints (omit for no panel), whether to wrap it as a whole document, and whether the slice
 * is done, as check-requirements.mjs's `sliceDone` gives it (omit to say nothing of it).
 */
export function renderBoard({ sections, requirements, slice, date, prs, standalone = false, done }) {
  const board = { sections, requirements };
  const banner = `Generated by scripts/slice-board.mjs from ${REQUIREMENTS} — do not hand-edit; regenerate. Generated ${esc(date)}.`;
  const radios = ALTITUDES.map(
    ([id]) =>
      `<input class="alt" type="radio" name="altitude" id="alt-${id}"${id === DEFAULT_ALTITUDE ? ' checked' : ''}>`,
  ).join('\n');
  const labels = ALTITUDES.map(([id, name]) => `<label for="alt-${id}">${name}</label>`).join('\n');
  const legend = STATUSES.map((s) => `<li><span class="chip chip-${s}">${s}</span> ${MEANINGS[s]}</li>`).join('\n');
  const content = `<p class="banner">${banner}</p>
<div class="board">
${radios}
<div class="switch" role="group" aria-label="Altitude">
${labels}
</div>
<ul class="legend" aria-label="Legend">
${legend}
</ul>
${prs ? prsPanel(prs) : ''}
${overviewView(board, slice, done)}
${workingView(board, slice)}
${fullView(board, slice)}
</div>
`;
  const title = `<title>graph-note slice ${esc(slice)}</title>`;
  const style = `<style>\n${BOARD_CSS}\n</style>`;
  if (!standalone) return `${title}\n${style}\n${content}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title}
${style}
</head>
<body>
${content}</body>
</html>
`;
}

const VALUE_OPTIONS = { '--slice': 'slice', '--prs': 'prs', '--date': 'date' };

function parseOptions(args) {
  const options = { slice: CURRENT_SLICE, date: new Date().toISOString().slice(0, 10), standalone: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--standalone') options.standalone = true;
    else if (VALUE_OPTIONS[args[i]]) {
      if (args[i + 1] === undefined) throw new Error(`${args[i]} needs a value`);
      options[VALUE_OPTIONS[args[i]]] = args[(i += 1)];
    } else throw new Error(`unknown option ${args[i]}`);
  }
  options.slice = Number(options.slice);
  if (!Number.isInteger(options.slice) || options.slice < 1) throw new Error('--slice needs a whole number, from 1');
  return options;
}

function readPrs(file) {
  const prs = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(prs)) throw new Error(`${file} is not a list of pull requests, as gh pr list --json prints`);
  return prs;
}

function main(args) {
  try {
    const options = parseOptions(args);
    const text = readFileSync(join(ROOT, REQUIREMENTS), 'utf8');
    const board = readBoard(text);
    const prs = options.prs ? readPrs(options.prs) : undefined;
    const done = sliceDone(text, options.slice);
    process.stdout.write(renderBoard({ ...board, ...options, prs, done }));
    return 0;
  } catch (e) {
    console.error(`slice-board: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
