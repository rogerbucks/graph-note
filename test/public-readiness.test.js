// Fit to be public, and kept so (spec §13, Delivery): nothing confidential, personal or secret in any commit, every
// commit from a no-reply address, a stranger's fresh clone sets up from the README's steps alone, and on GitHub no one
// but a collaborator can contribute. The history check is tried on a small repository made in a temporary folder.
//
// The samples are assembled from parts, so this file never holds a line that looks like the real thing: the checks run
// over this file too.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  historyProblems,
  machineSpecific,
  readmeSteps,
  repoOf,
  setupDocs,
  setupProblems,
  MAX_BLOB_BYTES,
  REQUIRED_CHECKS,
  WANTED,
} from '../scripts/public-readiness.mjs';
import { exists, read, block, jobs, permissionValues, runCommands, usesRefs, stripComment } from './repository/repo.js';

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A small repository with one clean commit, by a no-reply address, and a way to add more. */
function repository() {
  const dir = mkdtempSync(join(tmpdir(), 'public-readiness-'));
  made.push(dir);
  const g = (args, env) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.name', 'Some One']);
  g(['config', 'user.email', '1234+someone@users.noreply.github.com']);
  g(['remote', 'add', 'origin', 'https://github.com/someone/thing.git']);
  const commit = (file, text, message = `Change ${file}`, env = {}) => {
    writeFileSync(join(dir, file), text);
    g(['add', '.']);
    g(['commit', '-q', '-m', message], env);
  };
  commit('README.md', '# Thing\n', 'Begin');
  return { dir, commit };
}
const rules = (problems) => problems.map((p) => p.rule).sort();
const where = (problems, rule) => problems.filter((p) => p.rule === rule).map((p) => p.where);

const classified = (level) => ['---', `${'classi'}${'fication'}: ${level}`, '---', '', '# A note', ''].join('\n');
const awsKey = () => `${'AK'}${'IA'}${'B'.repeat(16)}`;
const luhnComplete = (body) => {
  const digits = [...body].map(Number).reverse();
  const sum = digits.reduce((s, d, i) => s + (i % 2 === 0 ? (d * 2 > 9 ? d * 2 - 9 : d * 2) : d), 0);
  return body + ((10 - (sum % 10)) % 10);
};
const card = () => luhnComplete(['4111', '1111', '1111', '111'].join(''));

describe('the history', () => {
  test('a clean history has no problem', () => {
    assert.deepEqual(historyProblems(repository().dir), []);
  });

  test('a blob that looks confidential or secret is found by place and kind, in any commit, even once replaced', () => {
    const { dir, commit } = repository();
    commit('note.md', classified('Own'));
    commit('note.md', '# Public now\n');
    commit('config.js', `const key = '${awsKey()}';\n`);
    const problems = historyProblems(dir);
    assert.deepEqual(rules(problems), ['aws-key', 'classification']);
    assert.deepEqual(where(problems, 'classification'), ['note.md:2']);
    assert.deepEqual(where(problems, 'aws-key'), ['config.js:1']);
  });

  test('a commit message is read too', () => {
    const { dir, commit } = repository();
    commit('a.txt', 'a\n', `Pay with ${card()}`);
    const problems = historyProblems(dir);
    assert.deepEqual(rules(problems), ['card']);
    assert.match(where(problems, 'card')[0], /^commit [0-9a-f]{8} message:1$/);
  });

  test('a commit by an address that names a person is a problem, and the report names only its domain', () => {
    const { dir, commit } = repository();
    const email = ['one', 'mail.test'].join('@');
    commit('a.txt', 'a\n', 'Change', { GIT_AUTHOR_EMAIL: email });
    const problems = historyProblems(dir);
    assert.deepEqual(rules(problems), ['author-email']);
    assert.match(where(problems, 'author-email')[0], /^commit [0-9a-f]{8} by …@mail\.test$/);
  });

  test("only the checked-out branch's own history is read: another branch's commits and blobs are not", () => {
    const { dir, commit } = repository();
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    const email = ['one', 'mail.test'].join('@');
    git('switch', '-q', '-c', 'side');
    commit('side.js', `const key = '${awsKey()}';\n`, `Written by ${email}`, { GIT_AUTHOR_EMAIL: email });
    git('tag', 'side-tag');
    git('switch', '-q', 'main');
    commit('b.txt', 'b\n');
    assert.deepEqual(historyProblems(dir), [], 'the side branch is not part of this history');
    git('switch', '-q', 'side');
    assert.deepEqual(rules(historyProblems(dir)), ['author-email', 'aws-key', 'email'], 'checked out, it is');
  });

  test('every branch and tag can still be asked for, as before a repository is made public', () => {
    const { dir, commit } = repository();
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    const email = ['one', 'mail.test'].join('@');
    git('switch', '-q', '-c', 'side');
    commit('side.txt', 'a\n', 'Side', { GIT_AUTHOR_EMAIL: email });
    git('switch', '-q', 'main');
    assert.deepEqual(rules(historyProblems(dir, { refs: ['--all'] })), ['author-email']);
  });

  test("an address at GitHub's no-reply domain names no one, in a commit message as in the author field", () => {
    const { dir, commit } = repository();
    const noReply = ['49699333+dependabot[bot]', 'users.noreply.github.com'].join('@');
    commit('a.txt', 'a\n', `Bump a\n\nSigned-off-by: dependabot[bot] <${noReply}>`, {
      GIT_AUTHOR_EMAIL: noReply,
      GIT_COMMITTER_EMAIL: noReply,
    });
    assert.deepEqual(historyProblems(dir), []);
  });

  test("any other address stays a problem, in a commit message and in the author field, GitHub's own among them", () => {
    const { dir, commit } = repository();
    const other = ['one', 'mail.test'].join('@');
    const lookalike = ['one', 'users.noreply.github.com.mail.test'].join('@');
    const github = ['person', 'github.com'].join('@');
    commit('a.txt', 'a\n', `Change a\n\nSigned-off-by: One <${other}>`);
    commit('b.txt', 'b\n', `Change b\n\nSigned-off-by: One <${lookalike}>`, { GIT_AUTHOR_EMAIL: github });
    const problems = historyProblems(dir);
    assert.deepEqual(rules(problems), ['author-email', 'email', 'email']);
    assert.match(where(problems, 'author-email')[0], /^commit [0-9a-f]{8} by …@github\.com$/);
  });

  test('a blob too large to belong in a small plugin is a problem', () => {
    const { dir, commit } = repository();
    commit('big.txt', 'a'.repeat(MAX_BLOB_BYTES + 1));
    assert.deepEqual(historyProblems(dir), [{ where: 'big.txt', rule: 'large-file' }]);
    assert.equal(MAX_BLOB_BYTES, 1_000_000);
  });

  test("this repository's own history is clean", () => {
    assert.deepEqual(historyProblems(), []);
  });
});

describe('the setup', () => {
  test("the README's steps are the sh blocks of its Developing section, and only those", () => {
    const text = [
      '# Thing',
      '```sh',
      'not a step',
      '```',
      '## Developing',
      'Words.',
      '```sh',
      'npm ci',
      'npm test',
      '```',
      '### Also',
      '```sh',
      'cd python',
      'uv sync',
      '```',
      '## Licence',
      '```sh',
      'not a step either',
      '```',
    ].join('\n');
    assert.deepEqual(readmeSteps(text), ['npm ci\nnpm test', 'cd python\nuv sync']);
    assert.deepEqual(readmeSteps('# Nothing\n'), []);
  });

  test('a line that needs one particular machine is found, by kind', () => {
    const home = ['', 'Users', 'someone', 'x'].join('/');
    assert.deepEqual(machineSpecific(`cp ${home} .`), [{ line: 1, rule: 'home-folder' }]);
    assert.deepEqual(machineSpecific('cat ~/.thing'), [{ line: 1, rule: 'home-folder' }]);
    assert.deepEqual(machineSpecific('export PATH=$HOME/bin:$PATH'), [{ line: 1, rule: 'home-folder' }]);
    assert.deepEqual(machineSpecific('ls /opt/homebrew/bin\n/usr/local/bin/dot'), [
      { line: 1, rule: 'local-prefix' },
      { line: 2, rule: 'local-prefix' },
    ]);
    assert.deepEqual(machineSpecific('brew install graphviz'), [{ line: 1, rule: 'machine-tool' }]);
    assert.deepEqual(machineSpecific('npm ci\nnpm test\nuv sync --locked\nthe ~ key; a<~[b]~>c'), []);
  });

  test("this repository's README sets up with npm and uv alone, and its documents name no machine", () => {
    const steps = readmeSteps(read('README.md'));
    assert.ok(steps.length >= 2, 'the JavaScript steps and the Python steps');
    assert.match(steps[0], /^npm ci\n/);
    assert.ok(steps.some((s) => /^uv sync --locked$/m.test(s)));
    const docs = setupDocs();
    for (const d of [
      'README.md',
      'CONTRIBUTING.md',
      'AGENTS.md',
      'packages/core/GUIDE.md',
      'python/graph_spec/GUIDE.md',
    ])
      assert.ok(docs.includes(d), d);
    assert.deepEqual(setupProblems(), []);
  });
});

describe('the settings on GitHub', () => {
  const wanted = (name) => WANTED.find((s) => s.name === name) ?? assert.fail(`no setting named ${name}`);

  test('every setting has a name, a phase, what is wanted, and a way to read and to write it', () => {
    for (const s of WANTED) {
      assert.match(s.name, /\S/);
      assert.ok(['always', 'public'].includes(s.phase), s.name);
      assert.notEqual(s.want, undefined, s.name);
      assert.equal(typeof s.read, 'function', s.name);
      assert.equal(typeof s.write, 'function', s.name);
    }
    assert.equal(new Set(WANTED.map((s) => s.name)).size, WANTED.length, 'names are distinct');
  });

  test('only a collaborator can open a pull request or an issue; nothing else is open to anyone', () => {
    assert.equal(wanted('pull_request_creation_policy').want, 'collaborators_only');
    assert.equal(wanted('has_pull_requests').want, true);
    assert.equal(wanted('has_issues').want, true, 'issues stay on; collaborators-only creation is set by hand');
    for (const f of ['has_projects', 'has_wiki', 'has_discussions']) assert.equal(wanted(f).want, false, f);
  });

  test('secrets are scanned and refused at the gate, once the repository is public', () => {
    for (const f of ['security: secret_scanning', 'security: secret_scanning_push_protection']) {
      assert.equal(wanted(f).phase, 'public', f);
      assert.equal(wanted(f).want, 'enabled', f);
    }
  });

  test("actions are pinned, the token reads only, and a stranger's fork runs nothing unapproved", () => {
    assert.equal(wanted('actions: permissions').want.sha_pinning_required, true);
    assert.deepEqual(wanted('actions: workflow token').want, {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: false,
    });
    const forks = wanted('actions: fork pull requests need approval');
    assert.equal(forks.phase, 'public');
    assert.deepEqual(forks.want, { approval_policy: 'all_external_contributors' });
  });

  test('advisories are watched: Dependabot, private reports, and CodeQL for every language here', () => {
    assert.equal(wanted('dependabot alerts').want, true);
    assert.deepEqual(wanted('dependabot security updates').want, { enabled: true, paused: false });
    assert.deepEqual(wanted('private vulnerability reporting').want, { enabled: true });
    assert.deepEqual(wanted('code scanning: CodeQL default setup').want, {
      state: 'configured',
      languages: ['actions', 'javascript-typescript', 'python'],
    });
  });

  test("the default branch requires CI's jobs, this check among them, and the dependency review", () => {
    assert.deepEqual(wanted('default branch ruleset: required checks').want, REQUIRED_CHECKS);
    const ci = Object.keys(jobs(read('.github/workflows/ci.yml')));
    for (const job of ci) assert.ok(REQUIRED_CHECKS.includes(job), job);
    assert.ok(REQUIRED_CHECKS.includes('public-readiness'));
    assert.ok(REQUIRED_CHECKS.includes('dependency-review'));
    assert.deepEqual(REQUIRED_CHECKS, [...REQUIRED_CHECKS].sort(), 'sorted, so a comparison is stable');
    for (const c of REQUIRED_CHECKS) assert.match(c, /^[\w-]+$/, 'a job name, nothing else');
    assert.ok(Object.keys(jobs(read('.github/workflows/dependency-review.yml'))).includes('dependency-review'));
  });

  test('the repository is read from the origin remote', () => {
    assert.match(repoOf(), /^[\w.-]+\/graph-note$/);
  });
});

describe('kept so, in CI and at every release', () => {
  const COMMAND = /^node scripts\/public-readiness\.mjs --history --setup$/;

  test('CI runs the history and setup checks in a job of their own, from the whole history', () => {
    const ci = read('.github/workflows/ci.yml');
    const job = jobs(ci)['public-readiness'];
    assert.ok(job, 'a public-readiness job');
    assert.match(job.join('\n'), /fetch-depth: 0/);
    assert.ok(runCommands(job.join('\n')).some((r) => COMMAND.test(r)));
  });

  test('the release waits for the same checks', () => {
    const release = read('.github/workflows/release.yml');
    const all = jobs(release);
    assert.ok(all['public-readiness'], 'a public-readiness job');
    assert.ok(runCommands(all['public-readiness'].join('\n')).some((r) => COMMAND.test(r)));
    assert.match(block(all.release, 'needs', 4).join('\n'), /public-readiness/);
  });

  test('every pull request has its dependency changes read against the published advisories', () => {
    const f = '.github/workflows/dependency-review.yml';
    assert.ok(exists(f));
    const text = read(f);
    assert.match(block(text.split('\n'), 'on', 0).join('\n'), /pull_request:/);
    assert.ok(usesRefs(text).some((r) => r.startsWith('actions/dependency-review-action@')));
    assert.match(
      jobs(text)['dependency-review'].join('\n'),
      /if: \$\{\{ !github\.event\.repository\.private \}\}/,
      'waits until public',
    );
    assert.match(text, /fail-on-severity: low/);
    assert.match(text, /comment-summary-in-pr: never/);
  });

  test("every pull request's conversation is locked when it opens, and again each hour, running no code of its own", () => {
    const f = '.github/workflows/lock-conversations.yml';
    assert.ok(exists(f));
    const text = read(f);
    const on = block(text.split('\n'), 'on', 0).join('\n');
    assert.match(on, /pull_request:/);
    assert.match(on, /schedule:/);
    assert.match(on, /cron: '\d+ \* \* \* \*'/);
    assert.deepEqual(usesRefs(text), [], 'no action, so no checkout');
    const lock = jobs(text).lock;
    assert.ok(lock, 'a lock job');
    const perms = block(lock, 'permissions', 4);
    assert.deepEqual(
      perms.slice(1).map((l) => stripComment(l).trim()),
      ['pull-requests: write'],
    );
    assert.deepEqual(permissionValues(perms), ['write']);
    assert.match(lock.join('\n'), /if: github\.actor != 'dependabot\[bot\]'/);
    assert.match(lock.join('\n'), /gh api -X PUT "repos\/\$REPO\/issues\/\$n\/lock"/);
  });

  test("the engine's advisories are re-read every week", () => {
    const on = block(read('.github/workflows/engine-advisories.yml').split('\n'), 'on', 0).join('\n');
    assert.match(on, /schedule:/);
    assert.match(on, /cron: '/);
  });

  test('the README says so, and the contributing guide lists this file', () => {
    const readme = read('README.md');
    assert.match(readme, /scripts\/public-readiness\.mjs/);
    assert.match(readme, /collaborators only/i);
    assert.match(read('CONTRIBUTING.md'), /test\/public-readiness\.test\.js/);
  });
});
