// The repository's changes read from GitHub in the browser editor's server (editor spec §41, github_review_items): a
// stand-in for the user's gh, put first on the PATH, keeps every command it is given and answers as GitHub would. The
// note lives in a real git repository whose origin is on github.com. Nothing is read until the page asks; gh is asked
// for GET alone, on github.com alone, and is handed no token; a change is opened only once listed; and every file's
// text is held to the gate before it is sent.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { storeGate } from '../server/editor-gate.ts';
import { gateSettings } from '../server/editor-main.ts';
import { FILES_READ, repositoryOf } from '../server/github-reader.ts';
import { ask } from './editor-threats-support.js';
import { PLAN, PLAN_THEIRS, bearer, handWatch, served, tempVault } from './editor-store-support.js';

const BASE = 'b'.repeat(40),
  HEAD = 'c'.repeat(40),
  FORK = 'd'.repeat(40),
  COMMIT = 'e'.repeat(40),
  MERGE = 'f'.repeat(40);
const REPO = 'repos/acme/notes';
const KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const RESTRICTED = '---\nclassification: Restricted\n---\nThe board’s plan.\n';

/** What the stand-in answers, by the address it is asked for. */
const ANSWERS = {
  [`${REPO}/pulls?state=all&sort=updated&direction=desc&per_page=20`]: [
    { number: 7, title: 'Finish is Done', user: { login: 'roger' }, updated_at: '2026-10-17T03:00:00Z', html_url: 'u' },
  ],
  [`${REPO}/commits?per_page=20`]: [
    {
      sha: MERGE,
      parents: [{ sha: COMMIT }, { sha: HEAD }],
      commit: { message: 'Merge pull request #7\n\nFinish is Done', author: { name: 'Roger', date: '2026-10-17' } },
      author: { login: 'roger' },
      html_url: 'm',
    },
    { sha: COMMIT, parents: [{ sha: FORK }], commit: { message: 'Tidy', author: { name: 'Ann', date: '2026-10-16' } } },
  ],
  [`${REPO}/pulls/7`]: { base: { sha: BASE }, head: { sha: HEAD } },
  [`${REPO}/compare/${BASE}...${HEAD}`]: {
    merge_base_commit: { sha: FORK },
    files: [
      { filename: 'Notes/plan.md', status: 'modified' },
      { filename: 'keys.md', status: 'added' },
      { filename: 'board.md', status: 'added' },
      { filename: 'old.md', status: 'removed' },
      { filename: '../escape.md', status: 'added' },
    ],
  },
  [`${REPO}/commits/${COMMIT}`]: {
    parents: [{ sha: FORK }],
    files: [{ filename: 'Notes/plan.md', status: 'modified' }],
  },
  [`${REPO}/contents/Notes/plan.md?ref=${FORK}`]: PLAN,
  [`${REPO}/contents/Notes/plan.md?ref=${HEAD}`]: PLAN_THEIRS,
  [`${REPO}/contents/Notes/plan.md?ref=${COMMIT}`]: PLAN_THEIRS,
  [`${REPO}/contents/keys.md?ref=${HEAD}`]: `The key is ${KEY}\n`,
  [`${REPO}/contents/board.md?ref=${HEAD}`]: RESTRICTED,
  [`${REPO}/contents/old.md?ref=${FORK}`]: 'Gone.\n',
  [`${REPO}/contents/requirements/workstreams.json?ref=${HEAD}`]: '{"V1": {"title": "Plans", "requirements": []}}',
};

let log = '';

/** The stand-in gh, first on the PATH, with a token in the environment the server must not hand on. */
before(() => {
  const bin = mkdtempSync(join(tmpdir(), 'gh-stand-in-'));
  log = join(bin, 'asked.jsonl');
  writeFileSync(join(bin, 'answers.json'), JSON.stringify(ANSWERS));
  const script =
    `#!${process.execPath}\n` +
    `const fs = require('fs'), path = require('path');\n` +
    `const args = process.argv.slice(2);\n` +
    `fs.appendFileSync(path.join(__dirname, 'asked.jsonl'), JSON.stringify({ args, env: Object.keys(process.env) }) + '\\n');\n` +
    `const answers = JSON.parse(fs.readFileSync(path.join(__dirname, 'answers.json'), 'utf8'));\n` +
    `const a = answers[args[args.length - 1]];\n` +
    `if (a === undefined) { process.stderr.write('HTTP 404'); process.exit(1); }\n` +
    `process.stdout.write(typeof a === 'string' ? a : JSON.stringify(a));\n`;
  writeFileSync(join(bin, 'gh'), script);
  chmodSync(join(bin, 'gh'), 0o755);
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
  process.env.GH_TOKEN = 'ghp_' + 'x'.repeat(36);
  process.env.GITHUB_TOKEN = 'ghp_' + 'y'.repeat(36);
});

const asked = () =>
  existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))
    : [];

/** The test vault made a repository whose origin is on github.com, with the plan committed. */
function repoVault(remote = 'git@github.com:acme/notes.git') {
  const v = tempVault();
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { cwd: v.vault });
  git('init', '-q', '-b', 'main');
  git('add', 'Notes/plan.md');
  git('commit', '-q', '-m', 'Add the plan');
  if (remote) git('remote', 'add', 'origin', remote);
  return v;
}

/** The plan opened in a served store, gated as the shipped server is, with unlabelled notes counted Public. */
async function opened(v, options = {}) {
  const gate = storeGate({ ...gateSettings(undefined), aiUnlabelled: 'Public' }, null);
  const { store, server } = await served(v, { watch: handWatch().watch, gate, ...options });
  const o = await store.open('Notes/plan.md');
  assert.equal(o.ok, true, o.why);
  return { s: server, id: o.id };
}

const get = (s, id, tail) => ask(s.port, { path: `/api/notes/${id}${tail}`, headers: bearer(s) });
const json = (r) => JSON.parse(r.text);

describe('the repository’s changes, read from GitHub by the user’s gh', () => {
  // proves: github_review_items
  test('are read only when asked: pull requests first, then commits and merges, each named as an item', async () => {
    const v = repoVault();
    const { s, id } = await opened(v);
    const already = asked().length;
    const got = await get(s, id, '/reviews');
    assert.equal(got.status, 200);
    assert.deepEqual(
      json(got).items.map((i) => [i.kind, i.id, i.title, i.author]),
      [
        ['pull', '7', 'Finish is Done', 'roger'],
        ['merge', MERGE, 'Merge pull request #7', 'roger'],
        ['commit', COMMIT, 'Tidy', 'Ann'],
      ],
    );
    assert.equal(asked().length - already, 2);
  });

  // proves: github_review_items
  test('read only: GET on github.com alone, through gh’s own sign-in, never handed a token', async () => {
    const v = repoVault();
    const { s, id } = await opened(v);
    await get(s, id, '/reviews');
    await get(s, id, '/reviews/pull/7');
    const all = asked();
    assert.ok(all.length > 0);
    for (const { args, env } of all) {
      assert.deepEqual(args.slice(0, 5), ['api', '--method', 'GET', '--hostname', 'github.com']);
      assert.ok(args.at(-1).startsWith('repos/acme/notes/'), args.at(-1));
      assert.ok(!env.includes('GH_TOKEN') && !env.includes('GITHUB_TOKEN'), env.join(' '));
      assert.ok(env.includes('GH_PROMPT_DISABLED'));
    }
  });

  // proves: github_review_items
  test('a pull request opens with its files before and after, from where it left its base', async () => {
    const v = repoVault('https://github.com/acme/notes');
    const { s, id } = await opened(v);
    await get(s, id, '/reviews');
    const got = await get(s, id, '/reviews/pull/7');
    assert.equal(got.status, 200);
    const { files, withheld, workstreams, unread } = json(got);
    assert.deepEqual(files, [
      { path: 'Notes/plan.md', before: PLAN, after: PLAN_THEIRS },
      { path: 'old.md', before: 'Gone.\n', after: null },
      { path: '../escape.md', before: null, after: null },
    ]);
    // a credential and a classification above the ceiling are named, never sent
    assert.deepEqual(
      withheld.map((w) => w.path),
      ['keys.md', 'board.md'],
    );
    assert.match(withheld[0].why, /access key/);
    assert.doesNotMatch(got.text, new RegExp(KEY));
    assert.doesNotMatch(got.text, /board’s plan/);
    assert.match(workstreams, /Plans/);
    assert.equal(unread, 0);
    assert.equal(FILES_READ, 50);
  });

  // proves: github_review_items
  test('a commit opens against its parent; nothing is opened that was not listed, and no address is taken', async () => {
    const v = repoVault();
    const { s, id } = await opened(v);
    assert.equal((await get(s, id, `/reviews/commit/${COMMIT}`)).status, 404);
    await get(s, id, '/reviews');
    const got = await get(s, id, `/reviews/commit/${COMMIT}`);
    assert.deepEqual(json(got).files, [{ path: 'Notes/plan.md', before: PLAN, after: PLAN_THEIRS }]);
    for (const tail of ['/reviews/pull/8', `/reviews/pull/${COMMIT}`, '/reviews/issue/7', '/reviews/pull/7/files'])
      assert.equal((await get(s, id, tail)).status, 404, tail);
  });

  // proves: github_review_items
  test('a repository not on github.com, or a note held by the gate, reads nothing and says why', async () => {
    const elsewhere = repoVault('https://gitlab.com/acme/notes.git');
    const one = await opened(elsewhere);
    const before = asked().length;
    const got = await get(one.s, one.id, '/reviews');
    assert.equal(got.status, 404);
    assert.match(json(got).why, /no remote named origin on github\.com/);
    const held = await opened(repoVault(), { gate: { note: () => 'Held back.', draft: () => null } });
    assert.equal((await get(held.s, held.id, '/reviews')).status, 403);
    assert.equal(asked().length, before);
  });
});

describe('the repository named by a remote', () => {
  // proves: github_review_items
  test('is the owner and name of an address on github.com, and none for any other', () => {
    assert.equal(repositoryOf('git@github.com:acme/notes.git'), 'acme/notes');
    assert.equal(repositoryOf('https://github.com/acme/notes'), 'acme/notes');
    assert.equal(repositoryOf('https://github.com/acme/notes.git/'), 'acme/notes');
    assert.equal(repositoryOf('ssh://git@github.com/acme/notes.git'), 'acme/notes');
    for (const other of [
      'https://gitlab.com/acme/notes.git',
      'https://github.com.evil.example/acme/notes',
      'https://github.com/acme/notes/extra',
      'https://github.com/../notes',
      'https://github.com/acme/no tes',
      '/srv/notes',
    ])
      assert.equal(repositoryOf(other), null, other);
  });
});
