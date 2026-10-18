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
import { isSetupInput, readmeSteps, setupInputsChangedSince } from '../scripts/fresh-clone.mjs';
import { messageProblems } from '../scripts/history-text-problems.mjs';
import {
  historyProblems,
  machineSpecific,
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

  test("Claude's no-reply address names no one, as a commit's author and committer; one like it stays a problem", () => {
    const { dir, commit } = repository();
    const claude = ['noreply', 'anthropic.com'].join('@');
    commit('a.txt', 'a\n', 'Change a', { GIT_AUTHOR_EMAIL: claude, GIT_COMMITTER_EMAIL: claude });
    assert.deepEqual(historyProblems(dir), []);
    const person = ['someone.noreply', 'anthropic.com'].join('@');
    commit('b.txt', 'b\n', 'Change b', { GIT_AUTHOR_EMAIL: person });
    assert.deepEqual(rules(historyProblems(dir)), ['author-email']);
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

  describe("GitHub's address on Dependabot's own sign-off line", () => {
    const at = (local, domain) => [local, domain].join('@');
    const bot = (address) => `Signed-off-by: dependabot[bot] <${address}>`;
    const problemsOfMessage = (...lines) => {
      const { dir, commit } = repository();
      commit('a.txt', 'a\n', ['Bump a', '', ...lines].join('\n'));
      return historyProblems(dir);
    };

    test('is no one: an address at github.com on a dependabot[bot] sign-off line is clean', () => {
      assert.deepEqual(problemsOfMessage(bot(at('somesender', 'github.com'))), []);
    });

    test('is allowed on that line alone: the same address anywhere else is a problem', () => {
      const address = at('somesender', 'github.com');
      for (const line of [
        `Signed-off-by: One <${address}>`,
        `Reviewed-by: dependabot[bot] <${address}>`,
        `Thanks to ${address} for this`,
        `${bot(address)} and more words`,
        `  ${bot(address)}`,
      ])
        assert.deepEqual(rules(problemsOfMessage(line)), ['email'], line);
    });

    test("is allowed to Dependabot alone: another bot's sign-off line is a problem", () => {
      const address = at('somesender', 'github.com');
      for (const name of ['renovate[bot]', 'dependabot', 'Dependabot[bot]', 'dependabot[bot] two'])
        assert.deepEqual(rules(problemsOfMessage(`Signed-off-by: ${name} <${address}>`)), ['email'], name);
    });

    test('is allowed at github.com alone: a dependabot sign-off line at any other domain is a problem', () => {
      for (const domain of ['mail.test', 'github.com.mail.test', 'notgithub.com', 'github.co', 'sub.github.com'])
        assert.deepEqual(rules(problemsOfMessage(bot(at('somesender', domain)))), ['email'], domain);
    });

    test('is one address: a second address on the line is a problem', () => {
      const line = `Signed-off-by: dependabot[bot] <${at('somesender', 'github.com')}>, <${at('one', 'mail.test')}>`;
      assert.deepEqual(rules(problemsOfMessage(line)), ['email']);
    });

    test('leaves the rest of the message read, each problem still on its own line', () => {
      const problems = problemsOfMessage(bot(at('somesender', 'github.com')), '', `Pay with ${card()}`);
      assert.deepEqual(
        problems.map((p) => p.rule),
        ['card'],
      );
      assert.match(problems[0].where, /^commit [0-9a-f]{8} message:5$/);
    });

    test('is a name of 1 to 32 lowercase letters: anything else before the @ is a problem', () => {
      const clean = ['a', 'somesender', 'z'.repeat(32)];
      for (const local of clean) assert.deepEqual(problemsOfMessage(bot(at(local, 'github.com'))), [], local);
      for (const local of ['z'.repeat(33), 'sender2', 'sender-two', 'sender.two', 'sender_two', 'Sender', 'x+tag'])
        assert.deepEqual(rules(problemsOfMessage(bot(at(local, 'github.com')))), ['email'], local);
    });

    test('is read for secrets too: a token or a card number as the name is found by its kind as well', () => {
      assert.deepEqual(rules(problemsOfMessage(bot(at(awsKey(), 'github.com')))), ['aws-key', 'email']);
      assert.deepEqual(rules(problemsOfMessage(bot(at(card(), 'github.com')))), ['card', 'email']);
    });

    test('is not routed elsewhere: a % in the name, which a mail server may read as another address, is a problem', () => {
      assert.deepEqual(rules(problemsOfMessage(bot(at('x%mail.test', 'github.com')))), ['email']);
    });

    test('is read exactly: a different case, a carriage return or a trailing space is a problem', () => {
      const address = at('somesender', 'github.com');
      const message = (line, eol = '\n') => ['Bump a', '', line].join(eol);
      assert.deepEqual(messageProblems(message(bot(address))), [], 'the control');
      for (const [name, text] of [
        ['a capital in the bot', message(bot(address).replace('dependabot', 'Dependabot'))],
        ['a capital in the domain', message(bot(address).replace('github', 'GitHub'))],
        ['a capital in the sign-off', message(bot(address).replace('Signed-off-by', 'signed-off-by'))],
        ['a carriage return', `${message(bot(address), '\r\n')}\r\n`],
        ['a trailing space', message(`${bot(address)} `)],
        ['a trailing tab', message(`${bot(address)}\t`)],
      ])
        assert.deepEqual(rules(messageProblems(text)), ['email'], name);
    });
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

  test('a setup input is what the README steps run that no other CI job does: the steps, what they install, the hook', () => {
    for (const f of [
      'README.md',
      'package.json',
      'package-lock.json',
      'packages/core/package.json',
      '.npmrc',
      '.githooks/pre-commit',
      '.gitignore',
      '.gitattributes',
      'python/graph_spec/pyproject.toml',
      'python/graph_spec/uv.lock',
      'python/graph_spec/.python-version',
      'scripts/public-readiness.mjs',
      'scripts/fresh-clone.mjs',
    ])
      assert.ok(isSetupInput(f), f);
    for (const f of ['packages/core/src/zoom.ts', 'test/zoom.test.js', 'CONTRIBUTING.md', 'docs/README.md.txt'])
      assert.equal(isSetupInput(f), false, f);
  });

  test('the setup inputs changed since a base are read from where the branch left it, not from its tip', () => {
    const { dir, commit } = repository();
    const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    const base = g('rev-parse', 'HEAD');
    commit('zoom.ts', 'export {};\n');
    assert.deepEqual(setupInputsChangedSince(dir, base), []);
    commit('package.json', '{}\n');
    assert.deepEqual(setupInputsChangedSince(dir, base), ['package.json']);
    // the base moving on after the branch point is not the branch's change
    g('checkout', '-q', '-b', 'later', base);
    commit('README.md', '# Thing, later\n');
    const later = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'main');
    assert.deepEqual(setupInputsChangedSince(dir, later), ['package.json']);
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

  test('only a collaborator can open a pull request or an issue; anyone may read the plan and join a discussion', () => {
    assert.equal(wanted('pull_request_creation_policy').want, 'collaborators_only');
    assert.equal(wanted('has_pull_requests').want, true);
    assert.equal(wanted('has_issues').want, true, 'issues stay on; collaborators-only creation is set by hand');
    // the public requirements project, the generated wiki and discussions are on (Roger, 18 Oct 2026)
    for (const f of ['has_projects', 'has_wiki', 'has_discussions']) assert.equal(wanted(f).want, true, f);
  });

  test('a commit made on the website is signed off too', () => {
    assert.equal(wanted('web_commit_signoff_required').want, true);
  });

  test('a stranger sees what the project is, its home page, and topics to find it by', () => {
    assert.match(wanted('description').want, /Obsidian/);
    assert.match(wanted('description').want, /app/, 'names more than the Obsidian plugin');
    assert.ok(wanted('description').want.length <= 350, 'GitHub allows 350 characters');
    assert.equal(wanted('homepage').want, 'https://thoughtknot.app/');
    const topics = wanted('topics').want;
    assert.ok(topics.length >= 1 && topics.length <= 20, 'GitHub allows 20 topics');
    assert.deepEqual(topics, [...topics].sort(), 'in order, as they are read back');
    for (const t of topics) assert.match(t, /^[a-z0-9][a-z0-9-]{0,49}$/, t);
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
    const ci = jobs(read('.github/workflows/ci.yml'));
    for (const [job, lines] of Object.entries(ci)) {
      if (!lines.some((l) => /^ {4}strategy:/.test(l))) assert.ok(REQUIRED_CHECKS.includes(job), job);
      // a job split by a matrix reports a check for each part, so it is required through the job that needs it
      else assert.ok(!REQUIRED_CHECKS.includes(job), job);
    }
    assert.match(ci.test.join('\n'), /needs: suite\n\s+if: always\(\)/);
    assert.ok(runCommands(ci.test.join('\n')).includes('test "$RESULT" = success'));
    assert.match(ci.test.join('\n'), /RESULT: \$\{\{ needs\.suite\.result \}\}/);
    // the suite in six parts, each printing only its failures and keeping the full report as a file
    const run = runCommands(ci.suite.join('\n')).find((r) => r.startsWith('npm test'));
    assert.match(run, /--test-shard="\$SHARD\/6" --test-reporter=\.\/scripts\/quiet-reporter\.mjs /);
    assert.match(
      run,
      /--test-reporter-destination=stdout --test-reporter=spec --test-reporter-destination=test-report\.txt$/,
    );
    assert.match(ci.suite.join('\n'), /shard: \[1, 2, 3, 4, 5, 6\]/);
    assert.ok(REQUIRED_CHECKS.includes('public-readiness'));
    assert.ok(REQUIRED_CHECKS.includes('dependency-review'));
    assert.deepEqual(REQUIRED_CHECKS, [...REQUIRED_CHECKS].sort(), 'sorted, so a comparison is stable');
    for (const c of REQUIRED_CHECKS) assert.match(c, /^[\w-]+$/, 'a job name, nothing else');
    assert.ok(Object.keys(jobs(read('.github/workflows/dependency-review.yml'))).includes('dependency-review'));
  });

  test('the repository is read from the origin remote', () => {
    assert.match(repoOf(), /^[\w.-]+\/thoughtknot$/);
  });
});

describe('kept so, in CI and at every release', () => {
  const COMMAND = /^node scripts\/public-readiness\.mjs --history --setup$/;

  test('CI runs the history and setup checks in a job of their own, from the whole history', () => {
    const ci = read('.github/workflows/ci.yml');
    const job = jobs(ci)['public-readiness'];
    assert.ok(job, 'a public-readiness job');
    assert.match(job.join('\n'), /fetch-depth: 0/);
    const text = job.join('\n');
    // a pull request runs the fresh clone when it changes a setup input; a push to main always runs it
    assert.match(
      text,
      /- if: github\.event_name == 'pull_request'\n\s+env:\n\s+BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+run: node scripts\/public-readiness\.mjs --history --setup-since "\$BASE"\n/,
    );
    assert.match(
      text,
      /- if: github\.event_name != 'pull_request'\n\s+run: node scripts\/public-readiness\.mjs --history --setup$/m,
    );
  });

  test("a newer push to a pull request cancels CI's run of the older commit; a run on main is never cancelled", () => {
    const concurrency = (block(read('.github/workflows/ci.yml').split('\n'), 'concurrency', 0) ?? []).join('\n');
    assert.match(concurrency, /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}\n/);
    assert.match(concurrency, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
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
