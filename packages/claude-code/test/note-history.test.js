// A note's earlier versions in the browser editor's server (editor spec §41, changes_view): the commits that changed the
// open note and the branches, read from a real git repository made for the test, listed only when asked, and the note's
// text at one of them; never at a commit not listed for it, never past the gate, and never by running a program the
// repository names.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMITS_LISTED, GIT_HISTORY } from '../server/note-history.ts';
import { ask } from './editor-threats-support.js';
import { PLAN, PLAN_THEIRS, bearer, handWatch, served, tempVault } from './editor-store-support.js';

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

/** The test vault made a repository: the plan committed, then changed and committed again, and a branch at the first. */
function repoVault() {
  const v = tempVault();
  git(v.vault, 'init', '-q', '-b', 'main');
  git(v.vault, 'add', 'Notes/plan.md');
  git(v.vault, 'commit', '-q', '-m', 'Add the plan');
  const first = git(v.vault, 'rev-parse', 'HEAD');
  git(v.vault, 'branch', 'first-plan');
  writeFileSync(v.plan, PLAN_THEIRS);
  git(v.vault, 'commit', '-q', '-am', 'Finish is Done');
  const second = git(v.vault, 'rev-parse', 'HEAD');
  return { ...v, first, second };
}

async function opened(v, options = {}) {
  const { store, server } = await served(v, { watch: handWatch().watch, ...options });
  const o = await store.open('Notes/plan.md');
  assert.equal(o.ok, true, o.why);
  return { s: server, id: o.id };
}

const get = (s, id, tail) => ask(s.port, { path: `/api/notes/${id}${tail}`, headers: bearer(s) });
const json = (r) => JSON.parse(r.text);

describe('a note’s earlier versions', () => {
  // proves: changes_view
  test('are the commits that changed it, newest first, then the branches, each by its full commit', async () => {
    const v = repoVault();
    const { s, id } = await opened(v);
    const got = await get(s, id, '/versions');
    assert.equal(got.status, 200);
    const { versions } = json(got);
    assert.deepEqual(
      versions.map((x) => [x.kind, x.commit]),
      [
        ['commit', v.second],
        ['commit', v.first],
        ['branch', v.first],
        ['branch', v.second],
      ],
    );
    assert.match(versions[0].label, /^Last commit: Finish is Done \(\d{4}-\d\d-\d\d, [0-9a-f]{7}\)$/);
    assert.match(versions[1].label, /^Commit: Add the plan/);
    assert.deepEqual(
      versions.slice(2).map((x) => x.label),
      ['Branch first-plan', 'Branch main'],
    );
  });

  // proves: changes_view
  test('give the note’s text at a commit listed for it', async () => {
    const v = repoVault();
    const { s, id } = await opened(v);
    await get(s, id, '/versions');
    const old = await get(s, id, `/at/${v.first}`);
    assert.equal(old.status, 200);
    assert.equal(json(old).text, PLAN);
    assert.equal(json(await get(s, id, `/at/${v.second}`)).text, PLAN_THEIRS);
  });

  // proves: changes_view
  test('are read only when asked: no text at a commit before the list is asked for, or at one not on it', async () => {
    const v = repoVault();
    const { s, id } = await opened(v);
    assert.equal((await get(s, id, `/at/${v.first}`)).status, 404);
    await get(s, id, '/versions');
    // a commit of the repository that never changed this note is not one of its versions
    writeFileSync(join(v.vault, 'Notes/other.md'), 'Changed.\n');
    git(v.vault, 'add', 'Notes/other.md');
    git(v.vault, 'commit', '-q', '-m', 'Another note');
    const elsewhere = git(v.vault, 'rev-parse', 'HEAD');
    assert.equal((await get(s, id, `/at/${elsewhere}`)).status, 404);
    // and no name or path is taken where a commit goes
    for (const tail of ['/at/HEAD', `/at/${v.first}:Notes/other.md`, '/at/main', '/versions/x'])
      assert.equal((await get(s, id, tail)).status, 404, tail);
  });

  // proves: changes_view
  test('a note in no repository has none, and says why', async () => {
    const v = tempVault();
    // tempVault holds a folder named .git that is no repository
    const { s, id } = await opened(v);
    const got = await get(s, id, '/versions');
    assert.equal(got.status, 404);
    assert.match(json(got).why, /not kept in a git repository/);
  });

  // proves: changes_view
  test('are held to the gate: a held note lists nothing, and an earlier text the gate holds is not sent', async () => {
    const v = repoVault();
    const gate = { note: (text) => (text.includes('Done') ? 'Held back.' : null), draft: () => null };
    const { s, id } = await opened(v, { gate });
    const listed = await get(s, id, '/versions');
    assert.equal(listed.status, 403);
    assert.doesNotMatch(listed.text, /Finish is Done|Add the plan/);
    const later = { note: (text) => (text.includes("'Finish'") ? 'Held back.' : null), draft: () => null };
    const o = await opened(v, { gate: later });
    assert.equal((await get(o.s, o.id, '/versions')).status, 200);
    const old = await get(o.s, o.id, `/at/${v.first}`);
    assert.equal(old.status, 403);
    assert.doesNotMatch(old.text, /Start/);
  });

  // proves: changes_view
  test('run nothing the repository names: no hook and no file-system monitor', async () => {
    const v = repoVault();
    const ran = join(v.top, 'ran');
    const script = join(v.top, 'monitor.sh');
    writeFileSync(script, `#!/bin/sh\ntouch '${ran}'\n`);
    chmodSync(script, 0o755);
    git(v.vault, 'config', 'core.fsmonitor', script);
    git(v.vault, 'config', 'core.hooksPath', v.top);
    for (const hook of ['post-checkout', 'reference-transaction', 'post-index-change'])
      writeFileSync(join(v.top, hook), `#!/bin/sh\ntouch '${ran}'\n`, { mode: 0o755 });
    const listed = await GIT_HISTORY.versions(v.plan);
    assert.equal(listed.ok, true);
    assert.equal((await GIT_HISTORY.textAt(v.plan, v.first)).ok, true);
    assert.equal(existsSync(ran), false);
  });

  // proves: changes_view
  test('list at most the last commits that changed the note', async () => {
    const v = repoVault();
    for (let i = 0; i < COMMITS_LISTED + 2; i++) {
      writeFileSync(v.plan, `${PLAN}${i}\n`);
      git(v.vault, 'commit', '-q', '-am', `Change ${i}`);
    }
    const listed = await GIT_HISTORY.versions(v.plan);
    assert.equal(listed.versions.filter((x) => x.kind === 'commit').length, COMMITS_LISTED);
  });
});
