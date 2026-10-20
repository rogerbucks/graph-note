#!/usr/bin/env node
// The security alerts a release waits on (spec §50, security_release_gate). GitHub keeps three lists of open alerts:
// code scanning (CodeQL), Dependabot and secret scanning. This script reads them inside GitHub Actions, where a token
// may see them. Nothing ships with an open alert that the risk register has not accepted.
//
// A list the token may not read is said so, never taken as empty. For the dependencies there is a second source that
// needs no token: npm audit reads the JavaScript lock file, and OSV reads the Python one. Both use the same advisories.
//
// Usage:
//   node scripts/security-alerts.mjs --release            a stable release may go: no open alert of any severity,
//                                                         unless the register accepts it. Exits 1 and names each one.
//   node scripts/security-alerts.mjs --nightly            a nightly may go: no open high or critical alert.
//   node scripts/security-alerts.mjs --plan [--out FILE]  every open alert as a page for the daily `security` issue.
//                                                         A register risk that names an alert marks it planned.
//   node scripts/security-alerts.mjs --details --out FILE every open alert in full, as JSON, for the fix job alone.
//
// The repository is public, so its logs and issues are too. What this script prints names each alert by its key,
// severity and link alone: the link opens only for the maintainer. What is wrong, and where, stays in the Security tab
// and in the --details file, which is never uploaded.
//
// Tokens, read from the environment:
//   SECURITY_ALERTS_TOKEN  optional, read only. Reads Dependabot and secret scanning, which GITHUB_TOKEN may not.
//   GITHUB_TOKEN           the workflow's own token, with `security-events: read`. Reads code scanning.
//   GITHUB_REPOSITORY      owner/name, which Actions sets.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = 'quality/risks.json';
const UV_LOCK = 'python/graph_spec/uv.lock';
const API = 'https://api.github.com';
const OSV = 'https://api.osv.dev/v1';

/** Severities from worst to least. */
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
/** The worst severity each gate lets through: a stable release none, a nightly medium and below. */
export const GATES = { release: [], nightly: ['medium', 'low'] };

/** A severity in our four words, from what each source calls it. Unknown counts as high, so it is never let through. */
export function severityOf(word) {
  const w = String(word ?? '').toLowerCase();
  if (w === 'moderate' || w === 'warning') return 'medium';
  if (w === 'error') return 'high';
  if (w === 'note') return 'low';
  return SEVERITIES.includes(w) ? w : 'high';
}

/** One alert, the same shape whichever list it came from. */
const alert = (key, severity, title, url, where) => ({ key, severity: severityOf(severity), title, url, where });

/**
 * A code scanning alert, or null for one that is not about security. CodeQL gives a security severity to its security
 * rules alone. The others, such as an unused variable, are code quality, which the ruleset already holds at merge.
 */
export const fromCodeScanning = (a) =>
  a.rule?.security_severity_level == null && !(a.rule?.tags ?? []).includes('security')
    ? null
    : alert(
        `code-scanning/${a.number}`,
        a.rule?.security_severity_level ?? a.rule?.severity,
        a.rule?.description ?? a.rule?.id ?? 'code scanning alert',
        a.html_url,
        a.most_recent_instance?.location?.path ?? '',
      );

/** A Dependabot alert: one vulnerable package in one lock file. */
export const fromDependabot = (a) =>
  alert(
    `dependabot/${a.number}`,
    a.security_advisory?.severity,
    `${a.dependency?.package?.name ?? 'a package'}: ${a.security_advisory?.summary ?? 'known vulnerability'}`,
    a.html_url,
    a.dependency?.manifest_path ?? '',
  );

/** A secret scanning alert. A leaked secret is always critical: anyone can use it until it is revoked. */
export const fromSecretScanning = (a) =>
  alert(
    `secret-scanning/${a.number}`,
    'critical',
    `A ${a.secret_type_display_name ?? a.secret_type ?? 'secret'} is in the repository`,
    a.html_url,
    '',
  );

/** The advisories npm audit reports, one alert for each, from its JSON. */
export function fromNpmAudit(report) {
  const found = new Map();
  for (const [name, v] of Object.entries(report?.vulnerabilities ?? {}))
    for (const via of v.via ?? [])
      if (typeof via === 'object' && via.url) {
        const id = via.url.split('/').pop();
        found.set(id, alert(`npm/${id}`, via.severity, `${name}: ${via.title}`, via.url, 'package-lock.json'));
      }
  return [...found.values()];
}

/** The packages a uv lock file pins from PyPI, as { name, version }. Local and virtual packages are left out. */
export function uvPackages(text) {
  return text
    .split(/^\[\[package\]\]$/m)
    .slice(1)
    .map((block) => ({
      name: /^name = "([^"]+)"/m.exec(block)?.[1],
      version: /^version = "([^"]+)"/m.exec(block)?.[1],
      registry: /^source = \{ registry = /m.test(block),
    }))
    .filter((p) => p.name && p.version && p.registry)
    .map(({ name, version }) => ({ name, version }));
}

/** An OSV advisory as an alert. GitHub's own advisories carry a severity word; others count as high. */
export const fromOsv = (pkg, v) =>
  alert(
    `osv/${v.id}`,
    v.database_specific?.severity,
    `${pkg.name} ${pkg.version}: ${v.summary ?? v.id}`,
    `https://osv.dev/vulnerability/${v.id}`,
    UV_LOCK,
  );

/** GET every page of a GitHub list. Returns { alerts } or, when the token may not read it, { unread: reason }. */
export async function githubList(path, token, { fetch: get = fetch } = {}) {
  if (!token) return { unread: 'no token' };
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const res = await get(`${API}${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { unread: `${res.status}${body ? `: ${body.slice(0, 160)}` : ''}` };
    }
    const batch = await res.json();
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return { alerts: items };
}

/** npm audit over the lock file, read only: no install, no change. Returns { alerts } or { unread }. */
export function npmAudit({ run = execFileSync } = {}) {
  let out;
  try {
    out = run('npm', ['audit', '--json', '--package-lock-only'], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    // npm audit exits 1 when it finds something, with the report on stdout
    out = e.stdout;
    if (!out) return { unread: `npm audit failed: ${String(e.message).slice(0, 160)}` };
  }
  try {
    return { alerts: fromNpmAudit(JSON.parse(out)) };
  } catch {
    return { unread: 'npm audit gave no report' };
  }
}

/** OSV over the Python lock file. Returns { alerts } or { unread }. */
export async function osvAudit({ fetch: get = fetch, lock = readFileSync(join(ROOT, UV_LOCK), 'utf8') } = {}) {
  const pkgs = uvPackages(lock);
  try {
    const res = await get(`${OSV}/querybatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: pkgs.map((p) => ({ package: { name: p.name, ecosystem: 'PyPI' }, version: p.version })),
      }),
    });
    if (!res.ok) return { unread: `OSV ${res.status}` };
    const { results = [] } = await res.json();
    const alerts = [];
    for (const [i, r] of results.entries())
      for (const { id } of r.vulns ?? []) {
        const one = await get(`${OSV}/vulns/${encodeURIComponent(id)}`);
        alerts.push(fromOsv(pkgs[i], one.ok ? await one.json() : { id }));
      }
    return { alerts };
  } catch (e) {
    return { unread: `OSV: ${String(e.message).slice(0, 160)}` };
  }
}

/**
 * Every open alert, from every source this run may read. Returns { alerts, read, unread }: `read` names the sources
 * read, and `unread` maps each one not read to why. Dependabot is read from GitHub when the token allows. The lock-file
 * audits run as well, so a token that cannot read Dependabot still leaves the dependencies checked.
 */
export async function collect({
  repo = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  alertsToken = process.env.SECURITY_ALERTS_TOKEN,
  fetch: get = fetch,
  npm = () => npmAudit(),
  osv = () => osvAudit({ fetch: get }),
} = {}) {
  const wide = alertsToken || token;
  const sources = {
    'code scanning': [
      () => githubList(`/repos/${repo}/code-scanning/alerts?state=open`, token, { fetch: get }),
      fromCodeScanning,
    ],
    dependabot: [() => githubList(`/repos/${repo}/dependabot/alerts?state=open`, wide, { fetch: get }), fromDependabot],
    'secret scanning': [
      () => githubList(`/repos/${repo}/secret-scanning/alerts?state=open`, wide, { fetch: get }),
      fromSecretScanning,
    ],
    'npm audit': [npm, (a) => a],
    'OSV (Python)': [osv, (a) => a],
  };
  const alerts = [];
  const read = [];
  const unread = {};
  for (const [name, [load, shape]] of Object.entries(sources)) {
    const got = repo || !name.match(/scanning|dependabot/) ? await load() : { unread: 'no repository named' };
    if (got.unread) unread[name] = got.unread;
    else {
      read.push(name);
      alerts.push(...got.alerts.map(shape).filter(Boolean));
    }
  }
  return { alerts, read, unread };
}

/** The alert keys each register risk names, and which risks accept theirs. */
export function planned(register) {
  const by = new Map();
  for (const r of register?.risks ?? []) for (const key of r.alerts ?? []) by.set(key, r);
  return by;
}

/**
 * What stops the gate, if anything. `gate` is release or nightly. An alert a register risk accepts is let through,
 * with its risk named in a warning. A source not read stops a stable release when it is code scanning, which the
 * workflow's own token always may read. A source not read is only a warning otherwise.
 */
export function gateProblems({ alerts, unread }, gate, register = { risks: [] }) {
  const letThrough = GATES[gate];
  const plan = planned(register);
  const problems = [];
  const warnings = [];
  for (const a of alerts) {
    const risk = plan.get(a.key);
    const line = `${a.key} (${a.severity}) ${a.url ?? ''}`.trim();
    if (risk?.decision === 'accept' && risk.status === 'accepted') warnings.push(`${line}, accepted in ${risk.id}`);
    else if (letThrough.includes(a.severity)) warnings.push(`${line}${risk ? `, planned in ${risk.id}` : ''}`);
    else problems.push(`${line}${risk ? `, planned in ${risk.id}` : ', not yet in the risk register'}`);
  }
  for (const [name, why] of Object.entries(unread)) {
    const line = `${name} was not read (${why})`;
    if (gate === 'release' && name === 'code scanning') problems.push(`${line}: give the job security-events: read`);
    else warnings.push(line);
  }
  return { problems, warnings };
}

/** The open alerts no register risk names yet: the work the fix job takes on. */
export const unplanned = ({ alerts }, register = { risks: [] }) => {
  const plan = planned(register);
  return alerts.filter((a) => !plan.has(a.key));
};

/** The page the daily issue shows: what is open, worst first, and what was not read. Empty when nothing is open. */
export function planPage({ alerts, read, unread }, register = { risks: [] }) {
  if (!alerts.length && !Object.keys(unread).length) return '';
  const plan = planned(register);
  const sorted = [...alerts].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    '# Open security alerts',
    '',
    'Made each day by the Security workflow from `node scripts/security-alerts.mjs --plan`. Do not edit by hand.',
    '',
    'A stable release stops while any alert below is open. A nightly stops on high and critical ones.',
    '',
  ];
  if (sorted.length) {
    lines.push(
      `## Open (${sorted.length})`,
      '',
      '| Alert | Severity | Planned in |',
      '| --- | --- | --- |',
      ...sorted.map((a) => `| [${a.key}](${a.url}) | ${a.severity} | ${plan.get(a.key)?.id ?? '**not yet**'} |`),
      '',
      'Each alert not yet planned goes in `quality/risks.json` as a fix-now risk, with the alert in its `alerts` list.',
      'Its fix adds a test and a rule that stops the same kind of problem coming back, named in `prevented_by`.',
      '',
    );
  } else lines.push('No open alerts in the sources read.', '');
  if (Object.keys(unread).length)
    lines.push(
      '## Not read',
      '',
      ...Object.entries(unread).map(([name, why]) => `- ${name}: ${cell(why)}`),
      '',
      'Dependabot and secret scanning need the secret `SECURITY_ALERTS_TOKEN` (see SECURITY.md). The lock files are',
      'still checked by npm audit and OSV.',
      '',
    );
  lines.push(`Sources read: ${read.join(', ') || 'none'}.`, '');
  return lines.join('\n');
}

async function main(args) {
  const flag = (f) => args.includes(f);
  const register = existsSync(join(ROOT, REGISTER)) ? JSON.parse(readFileSync(join(ROOT, REGISTER), 'utf8')) : {};
  const found = await collect();
  const out = flag('--out') ? args[args.indexOf('--out') + 1] : undefined;
  if (flag('--details')) {
    if (!out) return (console.error('--details needs --out FILE: it is never printed'), 2);
    mkdirSync(dirname(out), { recursive: true });
    const plan = planned(register);
    writeFileSync(
      out,
      `${JSON.stringify(
        found.alerts.map((a) => ({ ...a, planned: plan.get(a.key)?.id ?? null })),
        null,
        2,
      )}\n`,
    );
    console.log(`${unplanned(found, register).length} open alert(s) not yet planned`);
    return 0;
  }
  if (flag('--plan')) {
    const page = planPage(found, register);
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, page);
    } else process.stdout.write(page);
    console.error(`${found.alerts.length} open alert(s); read: ${found.read.join(', ')}`);
    return 0;
  }
  const gate = flag('--release') ? 'release' : flag('--nightly') ? 'nightly' : null;
  if (!gate) {
    console.error('usage: see the comment at the top of scripts/security-alerts.mjs');
    return 2;
  }
  const { problems, warnings } = gateProblems(found, gate, register);
  for (const w of warnings) console.error(`warning: ${w}`);
  for (const p of problems) console.error(p);
  console.log(
    problems.length
      ? `${problems.length} security alert(s) stop the ${gate}`
      : `no open security alert stops the ${gate} (read: ${found.read.join(', ')})`,
  );
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2)).then((code) => process.exit(code));
