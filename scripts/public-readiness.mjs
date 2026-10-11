#!/usr/bin/env node
// Fit to be public, and kept so (spec §13, Delivery). Three checks, the same before the repository goes public and
// after: nothing confidential or personal and no secret in any commit of any branch or tag, and every commit from a
// no-reply address (--history); a stranger's fresh clone sets up and builds from the README's own steps, which name
// nothing on the maintainer's machine (--setup); and the repository's settings on GitHub let no one but a collaborator
// contribute (--settings). CI and the release run the first two. The third is read, and set, through the GitHub CLI by
// whoever administers the repository, since CI's own token cannot read a repository's settings.
//
// Usage:
//   node scripts/public-readiness.mjs --history            every blob and commit message, every branch and tag
//   node scripts/public-readiness.mjs --setup              a fresh clone runs the README's steps; the docs name no machine
//   node scripts/public-readiness.mjs --settings           compare the GitHub settings with the wanted ones (admin, gh)
//   node scripts/public-readiness.mjs --settings --apply   set each one that differs
//   node scripts/public-readiness.mjs --make-public --yes  --history first, then make the repository public
//
// Exits 1 and lists each problem by place and kind. What matched is never printed, so a CI log cannot leak it.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProblems } from './check-classification.mjs';
import { findSecrets } from './quality-secrets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (root, args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 2 ** 31 });
const dedupe = (list) => [...new Map(list.map((p) => [JSON.stringify(p), p])).values()];

// ── The history ──

/** A blob larger than this is a problem: a public repository is cloned whole, and the plugin is small. */
export const MAX_BLOB_BYTES = 1_000_000;
// An address that names no one: GitHub's no-reply addresses, or a documentation domain.
const NO_ONE = /(@users\.noreply\.github\.com|^noreply@github\.com|@example\.(com|org|net))$/i;

const problemsIn = (text) => [...findProblems(text), ...findSecrets(text)].map((p) => ({ rule: p.rule, line: p.line }));

/**
 * Every problem in a repository's whole history, each as {where, rule}: a blob that looks confidential, personal or
 * secret, a blob too large, a commit message with the same, or a commit by an address that names a person. The place
 * is a path and line, or a commit; never the text.
 */
export function historyProblems(root = ROOT) {
  const found = [];
  const pathOf = new Map();
  for (const line of git(root, ['rev-list', '--objects', '--all']).toString().split('\n')) {
    const i = line.indexOf(' ');
    if (i > 0 && !pathOf.has(line.slice(0, i))) pathOf.set(line.slice(0, i), line.slice(i + 1));
  }
  const batch = git(root, ['cat-file', '--batch'], [...pathOf.keys()].join('\n') + '\n');
  for (let at = 0; at < batch.length;) {
    const nl = batch.indexOf(10, at);
    const [sha, type, size] = batch.subarray(at, nl).toString().split(' ');
    const body = batch.subarray(nl + 1, nl + 1 + Number(size));
    at = nl + 1 + Number(size) + 1;
    if (type !== 'blob') continue;
    const where = pathOf.get(sha);
    if (body.length > MAX_BLOB_BYTES) found.push({ where, rule: 'large-file' });
    if (body.subarray(0, 8000).includes(0)) continue;
    for (const p of problemsIn(body.toString('utf8'))) found.push({ where: `${where}:${p.line}`, rule: p.rule });
  }
  for (const record of git(root, ['log', '--all', '--format=%H%x00%ae%x00%ce%x00%B%x01']).toString().split('\x01')) {
    const [sha, author, committer, message] = record.trim().split('\x00');
    if (!sha) continue;
    const commit = `commit ${sha.slice(0, 8)}`;
    for (const p of problemsIn(message ?? '')) found.push({ where: `${commit} message:${p.line}`, rule: p.rule });
    for (const email of new Set([author, committer]))
      if (!NO_ONE.test(email))
        found.push({ where: `${commit} by …${email.replace(/^.*@/, '@')}`, rule: 'author-email' });
  }
  return dedupe(found);
}

// ── The setup ──

// Something only one machine has: a home folder, a Homebrew or local prefix, a brew or launchd step.
const MACHINE_RULES = [
  ['home-folder', /[/]Users[/]|[/]home[/][a-z]|(^|[\s"'`(=])~[/]|\$HOME\b/],
  ['local-prefix', /[/]opt[/]homebrew|[/]usr[/]local[/]/],
  ['machine-tool', /\bbrew (install|tap)\b|\blaunchctl\b|\bdefaults write\b/],
];

/** The lines of a document that need one particular machine, each as {line, rule}. */
export function machineSpecific(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const [rule, re] of MACHINE_RULES) if (re.test(line)) found.push({ line: i + 1, rule });
  });
  return found;
}

/** The documents a newcomer sets up from: the README, the contributing guide, the AI guide and every package guide. */
export function setupDocs(root = ROOT) {
  const guides = git(root, ['ls-files', '-z', '*GUIDE.md']).toString().split('\0').filter(Boolean);
  return ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', ...guides];
}

/** The problems in the setup documents: each line that needs one particular machine. */
export function setupProblems(root = ROOT) {
  return setupDocs(root).flatMap((doc) =>
    machineSpecific(readFileSync(join(root, doc), 'utf8')).map((p) => ({ where: `${doc}:${p.line}`, rule: p.rule })),
  );
}

/** The shell steps of the README's Developing section: each fenced sh block, as the text of its commands. */
export function readmeSteps(text) {
  const section = text.split(/^## /m).find((s) => s.startsWith('Developing')) ?? '';
  return [...section.matchAll(/^```sh\n([\s\S]*?)^```/gm)].map((m) => m[1].trim());
}

/**
 * Runs the README's steps in a fresh clone of the repository, as a newcomer would, with the clone's origin set to the
 * repository's own. Returns the problems: each step that failed, with the end of what it printed.
 */
export function freshCloneProblems(root = ROOT, { log = () => {} } = {}) {
  const steps = readmeSteps(readFileSync(join(root, 'README.md'), 'utf8'));
  if (!steps.length) return [{ where: 'README.md', rule: 'no-setup-steps' }];
  const clone = mkdtempSync(join(tmpdir(), 'fresh-clone-'));
  try {
    execFileSync('git', ['clone', '--quiet', root, clone]);
    git(clone, ['remote', 'set-url', 'origin', git(root, ['remote', 'get-url', 'origin']).toString().trim()]);
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    return steps.flatMap((step, i) => {
      log(`README step ${i + 1} of ${steps.length} in a fresh clone:\n${step}`);
      const opts = { cwd: clone, input: step, env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 1 << 28 };
      const r = spawnSync('sh', ['-e'], opts);
      if (r.status === 0) return [];
      const detail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-30).join('\n');
      return [{ where: `README.md step ${i + 1}`, rule: 'setup-step-failed', detail }];
    });
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}

// ── The settings on GitHub ──

/** The repository on GitHub, as owner/name, from the origin remote. */
export function repoOf(root = ROOT) {
  const url = git(root, ['remote', 'get-url', 'origin']).toString().trim();
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/.exec(url);
  if (!m) throw new Error(`origin is not on GitHub: ${url}`);
  return `${m[1]}/${m[2]}`;
}

const gh = (args, body) => {
  const input = body === undefined ? undefined : JSON.stringify(body);
  const out = execFileSync('gh', ['api', ...args, ...(input ? ['--input', '-'] : [])], { input, encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : null;
};
const quiet = (fn) => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
const repoCache = new Map();
const repoJSON = (repo, fresh = false) => {
  if (fresh || !repoCache.has(repo)) repoCache.set(repo, gh([`repos/${repo}`]));
  return repoCache.get(repo);
};

const repoField = (field, want) => ({
  name: field,
  phase: 'always',
  want,
  read: (repo, fresh) => repoJSON(repo, fresh)[field],
  write: (repo) => gh(['-X', 'PATCH', `repos/${repo}`], { [field]: want }),
});
const security = (feature) => ({
  name: `security: ${feature}`,
  phase: 'public',
  want: 'enabled',
  read: (repo, fresh) => repoJSON(repo, fresh).security_and_analysis?.[feature]?.status ?? 'disabled',
  write: (repo) =>
    gh(['-X', 'PATCH', `repos/${repo}`], { security_and_analysis: { [feature]: { status: 'enabled' } } }),
});
const endpoint = (name, phase, path, want, keys) => ({
  name,
  phase,
  want,
  read: (repo) => pick(gh([`repos/${repo}/${path}`]), keys),
  write: (repo) => gh(['-X', 'PUT', `repos/${repo}/${path}`], want),
});

/** The checks a change to the default branch must pass: CI's jobs, this script's among them, and the dependency review. */
export const REQUIRED_CHECKS = ['dependency-review', 'lint', 'public-readiness', 'python', 'test', 'tests-first'];

// the list gives each ruleset without its rules; the one on the default branch is read whole
const defaultRuleset = (repo) => {
  const found = gh([`repos/${repo}/rulesets`]).find((r) => r.target === 'branch' && r.enforcement === 'active');
  return found && gh([`repos/${repo}/rulesets/${found.id}`]);
};
const checksRule = (ruleset) => ruleset.rules.find((r) => r.type === 'required_status_checks');

/**
 * What the repository's settings must be, each read as a value and written as the wanted one. `phase` says when:
 * `always`, or `public` for what GitHub gives only a public repository (or a paid security plan).
 */
export const WANTED = [
  // Who can contribute: a collaborator opens a pull request or an issue; nothing else is open to anyone.
  repoField('pull_request_creation_policy', 'collaborators_only'),
  repoField('has_pull_requests', true),
  repoField('has_issues', false),
  repoField('has_projects', false),
  repoField('has_wiki', false),
  repoField('has_discussions', false),
  repoField('delete_branch_on_merge', true),
  repoField('allow_auto_merge', true),
  // Secrets: scanned on every push, and refused at the gate.
  security('secret_scanning'),
  security('secret_scanning_push_protection'),
  // Actions: every action pinned to a commit, a read-only token, and a stranger's fork runs nothing unapproved.
  endpoint(
    'actions: permissions',
    'always',
    'actions/permissions',
    { enabled: true, allowed_actions: 'all', sha_pinning_required: true },
    ['enabled', 'allowed_actions', 'sha_pinning_required'],
  ),
  endpoint(
    'actions: workflow token',
    'always',
    'actions/permissions/workflow',
    { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
    ['default_workflow_permissions', 'can_approve_pull_request_reviews'],
  ),
  endpoint(
    'actions: fork pull requests need approval',
    'public',
    'actions/permissions/fork-pr-contributor-approval',
    { approval_policy: 'all_external_contributors' },
    ['approval_policy'],
  ),
  // Advisories: Dependabot's alerts and fixes, private reports, and CodeQL on each pull request and each week.
  {
    name: 'dependabot alerts',
    phase: 'always',
    want: true,
    read: (repo) => quiet(() => (gh([`repos/${repo}/vulnerability-alerts`]), true)) ?? false,
    write: (repo) => gh(['-X', 'PUT', `repos/${repo}/vulnerability-alerts`]),
  },
  endpoint('dependabot security updates', 'always', 'automated-security-fixes', { enabled: true, paused: false }, [
    'enabled',
    'paused',
  ]),
  {
    name: 'private vulnerability reporting',
    phase: 'public',
    want: { enabled: true },
    read: (repo) =>
      quiet(() => pick(gh([`repos/${repo}/private-vulnerability-reporting`]), ['enabled'])) ?? { enabled: false },
    write: (repo) => gh(['-X', 'PUT', `repos/${repo}/private-vulnerability-reporting`]),
  },
  {
    name: 'code scanning: CodeQL default setup',
    phase: 'public',
    want: { state: 'configured', languages: ['actions', 'javascript-typescript', 'python'] },
    read: (repo) => {
      const setup = quiet(() => gh([`repos/${repo}/code-scanning/default-setup`]));
      return { state: setup?.state ?? 'not-configured', languages: [...(setup?.languages ?? [])].sort() };
    },
    write: (repo) =>
      gh(['-X', 'PATCH', `repos/${repo}/code-scanning/default-setup`], {
        state: 'configured',
        query_suite: 'default',
        languages: ['actions', 'javascript-typescript', 'python'],
      }),
  },
  {
    name: 'default branch ruleset: required checks',
    phase: 'always',
    want: REQUIRED_CHECKS,
    read: (repo) => {
      const ruleset = defaultRuleset(repo);
      return ruleset ? (checksRule(ruleset)?.parameters.required_status_checks ?? []).map((c) => c.context).sort() : [];
    },
    write: (repo) => {
      const ruleset = defaultRuleset(repo);
      if (!ruleset) throw new Error('no active ruleset on a branch: make one for the default branch first');
      const rule = checksRule(ruleset);
      const have = rule.parameters.required_status_checks;
      const integration_id = have[0]?.integration_id;
      for (const context of REQUIRED_CHECKS)
        if (!have.some((c) => c.context === context)) have.push({ context, integration_id });
      const { name, target, enforcement, conditions, rules, bypass_actors } = ruleset;
      gh(['-X', 'PUT', `repos/${repo}/rulesets/${ruleset.id}`], {
        name,
        target,
        enforcement,
        conditions,
        rules,
        bypass_actors,
      });
    },
  },
];

const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? sorted(x) : x));
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/**
 * Reads each wanted setting of the repository and says which differ, setting them when `apply` is on. Returns the
 * names still differing. A `public` setting on a private repository waits, and is named as waiting.
 */
export function settingsReport(repo, { apply = false, log = console.log } = {}) {
  const isPublic = repoJSON(repo, true).visibility === 'public';
  const differing = [];
  for (const s of WANTED) {
    if (s.phase === 'public' && !isPublic) {
      log(`… ${s.name}: waits until the repository is public`);
      continue;
    }
    let current = s.read(repo);
    if (canon(current) !== canon(s.want) && apply) {
      s.write(repo);
      current = s.read(repo, true);
    }
    const same = canon(current) === canon(s.want);
    if (!same) differing.push(s.name);
    log(`${same ? '✓' : '✗'} ${s.name}: ${canon(current)}${same ? '' : ` → wanted ${canon(s.want)}`}`);
  }
  return differing;
}

// ── The command ──

function main(argv) {
  const flag = (f) => argv.includes(f);
  const problems = [];
  if (flag('--history') || flag('--make-public')) problems.push(...historyProblems());
  if (flag('--setup')) problems.push(...setupProblems(), ...freshCloneProblems(ROOT, { log: console.error }));
  for (const p of problems) console.error(`  ${p.where} — ${p.rule}${p.detail ? `\n${p.detail}` : ''}`);
  if (problems.length) {
    console.error(
      `${problems.length} problem${problems.length === 1 ? '' : 's'}: the repository is not fit to be public.`,
    );
    return 1;
  }
  if (flag('--history'))
    console.log('history: nothing confidential, personal or secret; every commit from a no-reply address');
  if (flag('--setup')) console.log("setup: the README's steps set up a fresh clone, and the documents name no machine");
  if (flag('--settings')) {
    const repo = repoOf();
    const differing = settingsReport(repo, { apply: flag('--apply') });
    if (differing.length) {
      console.error(`${differing.length} setting${differing.length === 1 ? '' : 's'} differ on ${repo}`);
      return 1;
    }
    console.log(`settings: ${repo} is set as wanted`);
  }
  if (flag('--make-public')) {
    if (!flag('--yes')) {
      console.error('Making the repository public cannot be undone in practice: add --yes to mean it.');
      return 1;
    }
    const repo = repoOf();
    gh(['-X', 'PATCH', `repos/${repo}`], { visibility: 'public' });
    console.log(`${repo} is public. Now run: node scripts/public-readiness.mjs --settings --apply`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
