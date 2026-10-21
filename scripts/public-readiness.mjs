#!/usr/bin/env node
// Fit to be public, and kept so (spec §13, Delivery). Three checks, the same before and after it goes public:
// - --history: nothing secret, confidential or personal in this branch's history; no-reply authors; signed off.
// - --setup: a stranger's fresh clone sets up and builds from the README's steps, which name no one's machine.
// - --settings: only a collaborator may change the code or open an issue. Anyone may read the plan and discuss it.
// CI and the release run the first two. An admin runs the third with the GitHub CLI: CI's token cannot read settings.
//
// Usage:
//   node scripts/public-readiness.mjs --history            every blob and commit message of HEAD's own history.
//   node scripts/public-readiness.mjs --setup              a fresh clone runs the README's steps; no doc names a PC.
//   node scripts/public-readiness.mjs --setup-since BASE   the same, cloning only if a setup input changed since BASE.
//   node scripts/public-readiness.mjs --settings           compare GitHub's settings with the wanted ones (admin, gh).
//   node scripts/public-readiness.mjs --settings --apply   set each one that differs.
//   node scripts/public-readiness.mjs --make-public --yes  --history over every branch and tag, then make it public.
// A pull request's run uses --setup-since. Main and the release run everything.
// Exits 1 and lists each problem by place and kind. What matched is never printed, so a CI log cannot leak it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshCloneProblems, setupInputsChangedSince } from './fresh-clone.mjs';
import { messageProblems, problemsIn } from './history-text-problems.mjs';
import { privateLinkProblems } from './private-links.mjs';
import { signOffProblems } from './sign-off.mjs';
import { DESCRIPTION, HOMEPAGE, topicsSetting } from './repo-profile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (root, args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 2 ** 31 });
const dedupe = (list) => [...new Map(list.map((p) => [JSON.stringify(p), p])).values()];

// ── The history ──

/** A blob larger than this is a problem: a public repository is cloned whole, and the plugin is small. */
export const MAX_BLOB_BYTES = 1_000_000;
// An address that names no one: GitHub's no-reply addresses, Claude's (Roger, 17 Oct 2026: "Allow
// noreply@anthropic.com as a commit author"), or a documentation domain.
const NO_ONE = /(@users\.noreply\.github\.com|^noreply@github\.com|^noreply@anthropic\.com|@example\.(com|org|net))$/i;

/**
 * Every problem in the history of `refs` (the checked-out commit's own, `HEAD`, unless told otherwise), each as
 * {where, rule}. A problem is a blob that looks confidential, personal or secret, or a blob too large. It may also be a
 * commit message with the same, or a commit by an address that names a person. The place is a path and line, or a
 * commit; never the text. Other branches are not read. A bot's branch holds commits that are not this history, and a
 * pull request is judged on its own. `refs: ['--all']` reads every branch and tag, as the check before the repository
 * is made public does.
 */
export function historyProblems(root = ROOT, { refs = ['HEAD'] } = {}) {
  const found = [];
  const pathOf = new Map();
  const objects = git(root, ['rev-list', '--objects', ...refs]).toString();
  for (const line of objects.split('\n')) {
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
  const log = git(root, ['log', ...refs, '--format=%H%x00%ae%x00%ce%x00%B%x01']).toString();
  for (const record of log.split('\x01')) {
    const [sha, author, committer, message] = record.trim().split('\x00');
    if (!sha) continue;
    const commit = `commit ${sha.slice(0, 8)}`;
    for (const p of messageProblems(message ?? '')) found.push({ where: `${commit} message:${p.line}`, rule: p.rule });
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
  const guides = git(root, ['ls-files', '-z', '*GUIDE.md', '*/guide/*.md']).toString().split('\0').filter(Boolean);
  return ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', ...guides];
}

/** The problems in the setup documents: each line that needs one particular machine. */
export function setupProblems(root = ROOT) {
  return setupDocs(root).flatMap((doc) =>
    machineSpecific(readFileSync(join(root, doc), 'utf8')).map((p) => ({ where: `${doc}:${p.line}`, rule: p.rule })),
  );
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

/** The repository's name now. GitHub reads an old name after a rename, but will not write to it (HTTP 307). */
export const canonicalRepo = (repo, read = repoJSON) => read(repo).full_name ?? repo;
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

/**
 * The jobs of the CI workflow, by name, read from the file so a job added there is required here too. A job split by a
 * matrix is left out. Its checks are named for each part, and the job that needs it stands for them (`test`, `suite`).
 */
export function ciJobs(root = ROOT) {
  const lines = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8').split('\n');
  const names = [];
  for (const l of lines.slice(lines.indexOf('jobs:') + 1)) {
    const name = /^ {2}([\w-]+):\s*$/.exec(l)?.[1];
    if (name) names.push({ name, matrix: false });
    else if (/^ {4}strategy:/.test(l) && names.length) names[names.length - 1].matrix = true;
  }
  return names.filter((j) => !j.matrix).map((j) => j.name);
}
/** The checks a change to the default branch must pass: every CI job, this script's among them, and the dependency review. */
export const REQUIRED_CHECKS = [...ciJobs(), 'dependency-review'].sort();

// the list gives each ruleset without its rules; the one on the default branch is read whole
const defaultRuleset = (repo) => {
  const found = gh([`repos/${repo}/rulesets`]).find((r) => r.target === 'branch' && r.enforcement === 'active');
  return found && gh([`repos/${repo}/rulesets/${found.id}`]);
};
// a member of a language group, read as the group it is set by
const asGroup = (l) => (l === 'javascript' || l === 'typescript' ? 'javascript-typescript' : l);

const checksRule = (ruleset) => ruleset.rules.find((r) => r.type === 'required_status_checks');

/**
 * What the repository's settings must be, each read as a value and written as the wanted one. `phase` says when:
 * `always`, or `public` for what GitHub gives only a public repository (or a paid security plan).
 */
export const WANTED = [
  // Who can contribute: a collaborator opens a pull request or an issue. Issues stay on, with creation set to
  // collaborators only by hand in the repository's settings. That setting has no API field (as of 11 Oct 2026). So it
  // is the one thing here the script cannot read or set. Anyone may read the plan, on the requirements project and the
  // generated wiki. Anyone may join a discussion (Roger, 18 Oct 2026). The wiki's editing is kept to collaborators by
  // hand.
  repoField('pull_request_creation_policy', 'collaborators_only'),
  repoField('has_pull_requests', true),
  repoField('has_issues', true),
  repoField('has_projects', true),
  repoField('has_wiki', true),
  repoField('has_discussions', true),
  repoField('delete_branch_on_merge', true),
  repoField('allow_auto_merge', true),
  // Every commit is signed off (the DCO), so a commit made on the website asks for it too.
  repoField('web_commit_signoff_required', true),
  // How the project shows to a stranger: what it is, where its home page is, and the topics it is found by.
  repoField('description', DESCRIPTION),
  repoField('homepage', HOMEPAGE),
  topicsSetting(gh),
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
  // GitHub reports a language group as its members too (javascript-typescript as javascript and typescript)
  {
    name: 'code scanning: CodeQL default setup',
    phase: 'public',
    want: { state: 'configured', languages: ['actions', 'javascript-typescript', 'python'] },
    read: (repo) => {
      const setup = quiet(() => gh([`repos/${repo}/code-scanning/default-setup`]));
      return {
        state: setup?.state ?? 'not-configured',
        languages: [...new Set((setup?.languages ?? []).map(asGroup))].sort(),
      };
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
  // Making the repository public publishes every branch and tag, so that gate reads them all.
  if (flag('--history') || flag('--make-public'))
    for (const check of [historyProblems, signOffProblems, privateLinkProblems])
      problems.push(...check(ROOT, { refs: flag('--make-public') ? ['--all'] : ['HEAD'] }));
  // --setup-since <base>, for a pull request: the fresh clone only when a setup input changed
  const since = argv.includes('--setup-since') ? argv[argv.indexOf('--setup-since') + 1] : undefined;
  if (argv.includes('--setup-since') && !since) {
    console.error('--setup-since needs the commit to compare with');
    return 1;
  }
  if (flag('--setup') || since) problems.push(...setupProblems());
  const changed = since && !flag('--setup') ? setupInputsChangedSince(ROOT, since) : [];
  if (flag('--setup') || changed.length) problems.push(...freshCloneProblems(ROOT, { log: console.error }));
  else if (since)
    console.error(`No setup input changed since ${since}: the fresh clone runs on main and at the release.`);
  for (const p of problems) console.error(`  ${p.where} — ${p.rule}${p.detail ? `\n${p.detail}` : ''}`);
  if (problems.length) {
    console.error(
      `${problems.length} problem${problems.length === 1 ? '' : 's'}: the repository is not fit to be public.`,
    );
    return 1;
  }
  if (flag('--history'))
    console.log('history: nothing confidential, personal or secret; each commit no-reply, signed off, no private link');
  if (flag('--setup') || changed.length)
    console.log("setup: the README's steps set up a fresh clone, and the documents name no machine");
  else if (since) console.log('setup: the documents name no machine, and no setup input changed');
  if (flag('--settings')) {
    const repo = canonicalRepo(repoOf());
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
    const repo = canonicalRepo(repoOf());
    gh(['-X', 'PATCH', `repos/${repo}`], { visibility: 'public' });
    console.log(`${repo} is public. Now run: node scripts/public-readiness.mjs --settings --apply`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
