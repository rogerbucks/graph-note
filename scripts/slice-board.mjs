#!/usr/bin/env node
// Prints a self-contained HTML progress board for the slice being built (spec §12, requirements_checked_in_ci), read
// from the generated requirements copy with the repo's own graph-spec reader. A requirement is proved when it names a
// test and every one is written, part when some are, open otherwise. The page is CSS only: no script, font, image or
// request, so it opens offline, and it switches between three altitudes (Overview, Working, Full) with radio inputs.
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
import { CURRENT_SLICE, REQUIREMENTS, filesOf } from './check-requirements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

const STATUSES = ['proved', 'part', 'open'];
const ALTITUDES = [
  ['overview', 'Overview'],
  ['working', 'Working'],
  ['full', 'Full'],
];
const DEFAULT_ALTITUDE = 'working';
const MEANINGS = {
  proved: 'every test it names is written',
  part: 'some of its tests are written',
  open: 'none is written, or it names no test',
};

/** The status of a requirement from its tests: proved, part or open. */
export function statusOf(tests) {
  const written = tests.filter((t) => t.status === 'written').length;
  if (!written) return 'open';
  return written === tests.length ? 'proved' : 'part';
}

/**
 * Reads the requirements copy: {sections: [{num, title}], requirements: [{id, section, slice, level, rule, tests,
 * status}]}, each test {id, proves, files, where, status}. Throws what the reader throws for a text it cannot read.
 */
export function readBoard(text) {
  const store = read([text]);
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
  for (const [from, type, to] of graph.edges)
    if (type === 'PROVED_BY' && tests.has(to)) proving.set(from, [...(proving.get(from) ?? []), tests.get(to)]);
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

/** A pull request's CI rollup as {passed, failed, running}, from check runs and from commit statuses. */
export function summariseChecks(rollup) {
  const counts = { passed: 0, failed: 0, running: 0 };
  for (const c of rollup ?? []) {
    const done = c.status === undefined ? !/^(PENDING|EXPECTED)$/.test(c.state) : c.status === 'COMPLETED';
    if (!done) counts.running += 1;
    else if (/^(SUCCESS|NEUTRAL|SKIPPED)$/.test(c.conclusion || c.state)) counts.passed += 1;
    else counts.failed += 1;
  }
  return counts;
}

const LIGHT = `--bg: #f4f6f9; --surface: #ffffff; --surface-2: #e8ecf2; --text: #1a2030; --muted: #566074;
  --border: #d0d7e2; --link: #1f56c4; --focus: #1f56c4;
  --proved: #1b7f4d; --proved-bg: #d9f2e4; --proved-text: #0f4c2d;
  --part: #b36a00; --part-bg: #fdecc8; --part-text: #6b3f00;
  --open: #b4234a; --open-bg: #fbdbe3; --open-text: #7a1030;
  color-scheme: light;`;
const DARK = `--bg: #10141b; --surface: #181d26; --surface-2: #232b38; --text: #e4e8f0; --muted: #9ba5b8;
    --border: #2e3748; --link: #8cb4ff; --focus: #8cb4ff;
    --proved: #3fbf82; --proved-bg: #14382a; --proved-text: #a6e9c8;
    --part: #e0a43a; --part-bg: #3d2d0e; --part-text: #f6d58f;
    --open: #ef6b8d; --open-bg: #411a27; --open-text: #f8b4c6;
    color-scheme: dark;`;

const altitudeCss = ALTITUDES.map(
  ([id]) => `#alt-${id}:checked ~ .view-${id} { display: block; }
#alt-${id}:checked ~ .switch label[for="alt-${id}"] { background: var(--text); color: var(--bg); }
#alt-${id}:focus-visible ~ .switch label[for="alt-${id}"] { outline: 3px solid var(--focus); outline-offset: 2px; }`,
).join('\n');

const CSS = `:root {
  ${LIGHT}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    ${DARK}
  }
}
:root[data-theme="dark"] {
  ${DARK.replace(/\n {2}/g, '\n')}
}
body { margin: 0; padding: 16px 0 48px; background: var(--bg); color: var(--text); line-height: 1.5;
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
.banner, .board { max-width: 72rem; margin: 0 auto; padding: 0 16px; box-sizing: border-box; }
.banner { margin-bottom: 16px; color: var(--muted); font-size: 0.85rem; overflow-wrap: anywhere; }
.alt { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
.switch label { min-height: 44px; box-sizing: border-box; padding: 10px 18px; border: 2px solid var(--text);
  border-radius: 8px; font-weight: 600; cursor: pointer; }
${altitudeCss}
h2 { margin: 0 0 12px; font-size: 1.25rem; }
h3 { margin: 24px 0 8px; font-size: 1rem; color: var(--muted); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0 0 20px; padding: 0; list-style: none;
  font-size: 0.85rem; color: var(--muted); }
.view { display: none; }
.prs { display: none; margin: 0 0 24px; padding: 16px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface); }
#alt-overview:checked ~ .prs, #alt-working:checked ~ .prs { display: block; }
.prs ul { margin: 0; padding: 0; list-style: none; }
.pr { padding: 8px 0; border-top: 1px solid var(--border); overflow-wrap: anywhere; }
.pr:first-child { border-top: 0; }
.pr a { color: var(--link); font-weight: 600; }
.pr .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 0.85rem; color: var(--muted); }
.ci-passed { color: var(--proved-text); } .ci-failed { color: var(--open-text); } .ci-running { color: var(--part-text); }
.big { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.counts, .section-counts { font-variant-numeric: tabular-nums; color: var(--muted); }
svg.bar { display: block; width: 100%; max-width: 100%; height: 14px; border-radius: 7px; background: var(--surface-2); }
.slice-bar svg.bar { height: 28px; border-radius: 14px; }
.seg-proved { fill: var(--proved); } .seg-part { fill: var(--part); } .seg-open { fill: var(--open); }
.section-rows { margin: 24px 0 0; padding: 0; list-style: none; }
.section-row { display: grid; grid-template-columns: minmax(0, 18rem) minmax(0, 1fr) minmax(0, 14rem); gap: 4px 16px;
  align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
.chip { display: inline-block; padding: 0 8px; border: 1px solid currentColor; border-radius: 999px;
  font-size: 0.78rem; font-weight: 700; line-height: 1.6; }
.chip-proved, .chip-written { background: var(--proved-bg); color: var(--proved-text); }
.chip-part { background: var(--part-bg); color: var(--part-text); }
.chip-open, .chip-planned { background: var(--open-bg); color: var(--open-text); }
.req { margin: 0 0 12px; padding: 12px 14px; border: 1px solid var(--border); border-left-width: 6px;
  border-radius: 8px; background: var(--surface); }
.req-proved { border-left-color: var(--proved); } .req-part { border-left-color: var(--part); }
.req-open { border-left-color: var(--open); }
.req-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.id { font-weight: 700; overflow-wrap: anywhere; }
.level { font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.rule { margin: 6px 0; }
.tests { margin: 8px 0 0; padding: 0; list-style: none; font-size: 0.9rem; }
.test { padding: 6px 0; border-top: 1px dashed var(--border); }
.scroll { overflow-x: auto; max-width: 100%; }
.files code { margin-right: 10px; white-space: nowrap; font-size: 0.82rem; }
.where, .no-test { color: var(--muted); font-size: 0.85rem; }
@media (max-width: 40rem) {
  .section-row { grid-template-columns: minmax(0, 1fr); }
}`;

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
  return `<li class="test"><span class="chip chip-${t.status === 'written' ? 'written' : 'planned'}">${esc(t.status)}</span>
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

const overviewView = (board, slice) => {
  const total = summarise(board.requirements, slice);
  const rows = summariseBySection(board.requirements, board.sections, slice).map(
    (s) => `<li class="section-row"><span class="section-name">${sectionLabel(s.num, s.title)}</span>${bar(s)}
<span class="section-counts">${tally(s)} · ${s.part} part · ${s.open} open</span></li>`,
  );
  return `<section class="view view-overview">
<h2>Slice ${slice}: <span class="big">${tally(total)}</span></h2>
<div class="slice-bar">${bar(total)}</div>
<p class="counts">${total.proved} proved · ${total.part} part · ${total.open} open</p>
<ul class="section-rows">${rows.join('\n')}</ul>
</section>`;
};

const workingView = (board, slice) => {
  const left = board.requirements.filter((r) => r.status !== 'proved');
  const body = left.some((r) => r.slice === slice)
    ? grouped(left, board.sections, slice)
    : `<p>Nothing left: every requirement of slice ${slice} is proved.</p>`;
  return `<section class="view view-working">\n<h2>Still to prove</h2>\n${body}\n</section>`;
};

const fullView = (board, slice) =>
  `<section class="view view-full">\n<h2>Every requirement of slice ${slice}</h2>\n${grouped(board.requirements, board.sections, slice)}\n</section>`;

const MERGE_CHIP = { mergeable: 'proved', conflicting: 'open' };

const prItem = (pr) => {
  const ci = summariseChecks(pr.statusCheckRollup);
  const mergeable = String(pr.mergeable ?? 'unknown').toLowerCase();
  const heading = `#${esc(pr.number)} ${esc(pr.title)}`;
  const link = /^https?:\/\//i.test(String(pr.url)) ? `<a href="${esc(pr.url)}">${heading}</a>` : heading;
  return `<li class="pr">${link}
<div class="meta"><span>${esc(pr.headRefName)}</span><span class="chip chip-${MERGE_CHIP[mergeable] ?? 'part'}">${esc(mergeable)}</span>
<span class="ci-passed">${ci.passed} passed</span><span class="ci-failed">${ci.failed} failed</span><span class="ci-running">${ci.running} running</span></div></li>`;
};

const prsPanel = (prs) => `<section class="prs">
<h2>Open pull requests</h2>
${prs.length ? `<ul>${prs.map(prItem).join('\n')}</ul>` : '<p>No pull requests are open.</p>'}
</section>`;

/**
 * The page for one slice: {sections, requirements} as readBoard gives them, the slice number, the date shown in the
 * banner, the pull requests gh prints (omit for no panel) and whether to wrap it as a whole document.
 */
export function renderBoard({ sections, requirements, slice, date, prs, standalone = false }) {
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
<nav class="switch" aria-label="Altitude">
${labels}
</nav>
<ul class="legend" aria-label="Legend">
${legend}
</ul>
${prs ? prsPanel(prs) : ''}
${overviewView(board, slice)}
${workingView(board, slice)}
${fullView(board, slice)}
</div>
`;
  const title = `<title>graph-note slice ${esc(slice)}</title>`;
  const style = `<style>\n${CSS}\n</style>`;
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
    const board = readBoard(readFileSync(join(ROOT, REQUIREMENTS), 'utf8'));
    const prs = options.prs ? readPrs(options.prs) : undefined;
    process.stdout.write(renderBoard({ ...board, ...options, prs }));
    return 0;
  } catch (e) {
    console.error(`slice-board: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
