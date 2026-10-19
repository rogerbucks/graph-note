#!/usr/bin/env node
// The register of known risks (spec §50, risk_register). quality/risks.json holds each risk an expert panel raised,
// with the owner's decision: fix now, fix later in a named wave, or accept. The release waits on it. Nothing ships
// with a risk no one has decided on, or an overdue one. Nor with one whose code moved and that no one has looked at
// for STALE_DAYS. One that moved more recently is named as a warning, so the look happens before it blocks.
//
// Usage:
//   node scripts/risk-register.mjs --check             the register is well formed (CI, through its test).
//   node scripts/risk-register.mjs --release           the release may go: no open fix-now risk, none overdue, none
//                                                      long stale. Exits 1 and names each one that stops it.
//   node scripts/risk-register.mjs --stale [--json]    the risks whose paths changed since they were last reviewed.
//                                                      Also the roles whose areas changed since the last stable tag.
//   node scripts/risk-register.mjs --reviewed ID...    stamp these risks as reviewed at HEAD, today.
//   node scripts/risk-register.mjs --full-panel        record that every role looked at the whole project, at HEAD,
//                                                      today, for the version in manifest.json.
//   node scripts/risk-register.mjs --write-report      write RISKS.md from the register; --report prints it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTER = 'quality/risks.json';
export const REPORT = 'RISKS.md';
const WAVES = 'requirements/waves.json';
const MANIFEST = 'manifest.json';

/** The values each field of a risk may take. */
export const CHOICES = {
  likelihood: ['low', 'medium', 'high'],
  impact: ['low', 'medium', 'high'],
  decision: ['fix-now', 'fix-later', 'accept'],
  status: ['open', 'done', 'accepted'],
  effort: ['hours', 'days', 'weeks'],
};
/** The fields every risk has. */
export const FIELDS = [
  'id',
  'role',
  'area',
  'title',
  'risk',
  'evidence',
  'likelihood',
  'impact',
  'decision',
  'fix',
  'check',
  'paths',
  'effort',
  'raised',
  'reviewed',
  'status',
];
/** How long an open risk may stay unlooked at after its files moved, before it stops a release. */
export const STALE_DAYS = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{7,40}$/;

const readJSON = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const today = () => new Date().toISOString().slice(0, 10);

/** The register as committed. */
export const readRegister = () => readJSON(REGISTER);

/** A glob as a regular expression: `**` crosses folders, `*` stays inside one. */
export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*');
  return new RegExp(`^${body}$`);
}

/** True when `file` is under any of the globs. */
export const underPaths = (file, paths) => paths.some((p) => globToRegExp(p).test(file));

/** What is wrong with the register's shape, if anything: each line names the risk and the field. */
export function registerProblems(register, waves = readJSON(WAVES)) {
  const found = [];
  const risks = register?.risks;
  if (!Array.isArray(risks)) return [`${REGISTER}: "risks" must be an array`];
  const full = register.panel?.last_full;
  if (!DATE.test(full?.date ?? '') || !SHA.test(full?.commit ?? '') || !/^\d+\.\d+\.\d+$/.test(full?.version ?? ''))
    found.push(`${REGISTER}: panel.last_full must hold the date, commit and version of the last full panel`);
  const seen = new Set();
  const waveTitles = new Set((waves.waves ?? []).map((w) => w.title));
  for (const r of risks) {
    const at = `${r?.id ?? '(no id)'}`;
    const miss = FIELDS.filter((f) => !(f in (r ?? {})));
    if (miss.length) found.push(`${at}: missing ${miss.join(', ')}`);
    if (!/^[A-Z]+-\d+$/.test(r?.id ?? '')) found.push(`${at}: id must be like SEC-1`);
    if (seen.has(r?.id)) found.push(`${at}: id used twice`);
    seen.add(r?.id);
    for (const [field, allowed] of Object.entries(CHOICES))
      if (!allowed.includes(r?.[field])) found.push(`${at}: ${field} must be one of ${allowed.join(', ')}`);
    for (const field of ['title', 'risk', 'fix', 'check', 'role', 'area'])
      if (typeof r?.[field] !== 'string' || !r[field].trim()) found.push(`${at}: ${field} must be text`);
    for (const field of ['evidence', 'paths'])
      if (!Array.isArray(r?.[field]) || !r[field].length || r[field].some((e) => typeof e !== 'string'))
        found.push(`${at}: ${field} must be a list of text`);
    if (!DATE.test(r?.raised ?? '')) found.push(`${at}: raised must be YYYY-MM-DD`);
    if (!DATE.test(r?.reviewed?.date ?? '') || !SHA.test(r?.reviewed?.commit ?? ''))
      found.push(`${at}: reviewed must hold a date and a commit`);
    if (r?.decision === 'fix-later' && !waveTitles.has(r?.wave))
      found.push(`${at}: a fix-later risk names a wave of ${WAVES}`);
    if (r?.decision === 'accept' && !(r?.accepted_by && r?.accepted_reason))
      found.push(`${at}: an accepted risk says who accepted it (accepted_by) and why (accepted_reason)`);
    if (r?.status === 'accepted' && r?.decision !== 'accept')
      found.push(`${at}: status accepted needs decision accept`);
    if (r?.status === 'done' && !r?.done_in) found.push(`${at}: a done risk names the pull request (done_in)`);
    if (r?.status === 'open' && r?.decision === 'accept') found.push(`${at}: an accepted decision closes the risk`);
  }
  return found;
}

/** The end date of the wave a risk is due in, or null when it names none. */
export function dueDate(risk, waves = readJSON(WAVES)) {
  const wave = (waves.waves ?? []).find((w) => w.title === risk.wave);
  return wave?.end ?? null;
}

/** The files changed between a commit and HEAD, or null when the commit is not in this history. */
export function changedSince(commit) {
  try {
    return git('diff', '--name-only', `${commit}..HEAD`).split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/** The risks still open whose paths moved since they were reviewed, each with the files that moved. */
export function staleRisks(register, changed = changedSince) {
  return register.risks
    .filter((r) => r.status === 'open')
    .map((r) => {
      const files = changed(r.reviewed.commit);
      if (files === null) return { risk: r, files: null };
      return { risk: r, files: files.filter((f) => underPaths(f, r.paths)) };
    })
    .filter((s) => s.files === null || s.files.length);
}

/** The roles whose paths saw a change since `ref`, from every risk's paths, open or not. */
export function rolesTouched(register, ref, changed = changedSince) {
  const files = changed(ref) ?? [];
  const roles = new Map();
  for (const r of register.risks) {
    const hit = files.filter((f) => underPaths(f, r.paths));
    if (hit.length) roles.set(r.role, [...new Set([...(roles.get(r.role) ?? []), ...hit])]);
  }
  return roles;
}

/** The part of a version a new release of which is a major step before 1.0: its first two numbers. */
const line = (version) => String(version).split('.').slice(0, 2).join('.');

/** True when `version` starts a new minor line since `since`, which pre-1.0 is a major step (public-api.mjs). */
export const newLine = (version, since) => line(version) !== line(since);

/** The day `days` after a YYYY-MM-DD date, as YYYY-MM-DD. */
const daysAfter = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * What stops a release, if anything. That is an open fix-now risk, an overdue one, a long stale one, or a version
 * line the full panel has not seen. Returns { problems, warnings }. A fresher stale risk warns.
 */
export function releaseProblems(
  register,
  { waves = readJSON(WAVES), date = today(), changed = changedSince, version = readJSON(MANIFEST).version } = {},
) {
  const found = registerProblems(register, waves);
  const warnings = [];
  const full = register.panel?.last_full;
  if (full && newLine(version, full.version))
    found.push(
      `${version} starts a new line since ${full.version}, which the full panel last looked at on ${full.date}. ` +
        'Run the Risk panel workflow with every role, decide its findings, then: node scripts/risk-register.mjs --full-panel',
    );
  for (const r of register.risks.filter((x) => x.status === 'open')) {
    if (r.decision === 'fix-now') found.push(`${r.id}: fix now, still open: ${r.title}`);
    const due = r.decision === 'fix-later' ? dueDate(r, waves) : null;
    if (due && due < date) found.push(`${r.id}: due by ${due} (${r.wave}), still open: ${r.title}`);
  }
  for (const { risk, files } of staleRisks(register, changed)) {
    if (files === null) {
      found.push(`${risk.id}: reviewed at ${risk.reviewed.commit}, which this history does not hold`);
      continue;
    }
    const by = daysAfter(risk.reviewed.date, STALE_DAYS);
    const line =
      `${risk.id}: stale, its code moved since ${risk.reviewed.date}: ${files.slice(0, 5).join(', ')}` +
      (files.length > 5 ? ` and ${files.length - 5} more` : '') +
      `. Look again, then: node scripts/risk-register.mjs --reviewed ${risk.id}`;
    if (by < date) found.push(`${line} (unlooked at since ${by})`);
    else warnings.push(`${line} (stops the release from ${by})`);
  }
  return { problems: found, warnings };
}

/** The last stable tag, or the first commit when there is none. */
export function lastStableTag() {
  const tags = git('tag', '--list', '[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname').split('\n').filter(Boolean);
  return tags.find((t) => /^\d+\.\d+\.\d+$/.test(t)) ?? git('rev-list', '--max-parents=0', 'HEAD').split('\n')[0];
}

const mark = { high: '●●●', medium: '●●○', low: '●○○' };
/** Text safe in one table cell: a backslash and a pipe are escaped, and a line break becomes a space. */
const cell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The register as a page: one table of the open risks, then the done and accepted ones. */
export function report(register) {
  const open = register.risks.filter((r) => r.status === 'open');
  const closed = register.risks.filter((r) => r.status !== 'open');
  const row = (r) =>
    `| ${r.id} | ${cell(r.title)} | ${mark[r.likelihood]} | ${mark[r.impact]} | ${r.decision}${r.wave ? ` (${cell(r.wave)})` : ''} | ${r.effort} |`;
  const lines = [
    '# Known risks',
    '',
    'What the expert panel found, and what was decided. The release waits on this list: see RELEASING.md.',
    `Made by \`node scripts/risk-register.mjs --write-report\` from \`${REGISTER}\`. Do not edit by hand.`,
    '',
    `Dots show likelihood and impact: ${mark.high} high, ${mark.medium} medium, ${mark.low} low.`,
    '',
    `## Open (${open.length})`,
    '',
    '| Id | Risk | Likely | Impact | Decision | Effort |',
    '| --- | --- | --- | --- | --- | --- |',
    ...open.map(row),
    '',
    '## Each open risk',
    '',
    ...open.flatMap((r) => [
      `### ${r.id} ${cell(r.title)}`,
      '',
      `**Who found it:** ${r.role}. **Where:** ${r.paths.map((p) => `\`${p}\``).join(', ')}.`,
      '',
      `**Risk:** ${r.risk}`,
      '',
      `**Fix:** ${r.fix}`,
      '',
      `**Check:** ${r.check}`,
      '',
    ]),
    `## Done or accepted (${closed.length})`,
    '',
    '| Id | Risk | Decision | Closed by |',
    '| --- | --- | --- | --- |',
    ...closed.map(
      (r) =>
        `| ${r.id} | ${cell(r.title)} | ${r.status} | ${cell(r.done_in ?? `${r.accepted_by}: ${r.accepted_reason}`)} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

/** Stamp the named risks as reviewed at HEAD, today, and write the register back. */
export function stampReviewed(ids, { date = today(), commit = git('rev-parse', 'HEAD') } = {}) {
  const register = readRegister();
  const missing = ids.filter((id) => !register.risks.some((r) => r.id === id));
  if (missing.length) throw new Error(`no such risk: ${missing.join(', ')}`);
  for (const r of register.risks) if (ids.includes(r.id)) r.reviewed = { date, commit };
  writeFileSync(join(ROOT, REGISTER), `${JSON.stringify(register, null, 2)}\n`);
  return register;
}

/** Record that every role looked at the whole project at HEAD, today, for the version in manifest.json. */
export function stampFullPanel({
  date = today(),
  commit = git('rev-parse', 'HEAD'),
  version = readJSON(MANIFEST).version,
} = {}) {
  const register = readRegister();
  register.panel = { ...register.panel, last_full: { date, commit, version } };
  writeFileSync(join(ROOT, REGISTER), `${JSON.stringify(register, null, 2)}\n`);
  return register;
}

function main(args) {
  const flag = (f) => args.includes(f);
  const register = readRegister();
  if (flag('--check')) {
    const problems = registerProblems(register);
    for (const p of problems) console.error(p);
    return problems.length ? 1 : 0;
  }
  if (flag('--release')) {
    const { problems, warnings } = releaseProblems(register);
    for (const w of warnings) console.error(`warning: ${w}`);
    for (const p of problems) console.error(p);
    console.log(
      problems.length ? `${problems.length} risk(s) stop the release` : 'the risk register lets the release go',
    );
    return problems.length ? 1 : 0;
  }
  if (flag('--stale')) {
    const since = args[args.indexOf('--since') + 1];
    const ref = flag('--since') && since ? since : lastStableTag();
    const stale = staleRisks(register).map(({ risk, files }) => ({ id: risk.id, role: risk.role, files }));
    const roles = Object.fromEntries(rolesTouched(register, ref));
    if (flag('--json')) console.log(JSON.stringify({ since: ref, stale, roles }, null, 2));
    else {
      console.log(`Since ${ref}:`);
      for (const s of stale)
        console.log(`  stale ${s.id} (${s.role}): ${s.files?.join(', ') ?? 'commit not in history'}`);
      for (const [role, files] of Object.entries(roles)) console.log(`  ${role}: ${files.length} file(s) changed`);
      if (!stale.length && !Object.keys(roles).length) console.log('  nothing the panel watches has changed');
    }
    return 0;
  }
  if (flag('--reviewed')) {
    const ids = args.slice(args.indexOf('--reviewed') + 1).filter((a) => !a.startsWith('--'));
    stampReviewed(ids);
    console.log(`reviewed today: ${ids.join(', ')}`);
    return 0;
  }
  if (flag('--full-panel')) {
    const { panel } = stampFullPanel();
    console.log(`full panel recorded: ${panel.last_full.version} at ${panel.last_full.commit.slice(0, 7)}`);
    return 0;
  }
  if (flag('--report') || flag('--write-report')) {
    const text = report(register);
    if (flag('--write-report')) writeFileSync(join(ROOT, REPORT), text);
    else process.stdout.write(text);
    return 0;
  }
  console.error('usage: see the comment at the top of scripts/risk-register.mjs');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
