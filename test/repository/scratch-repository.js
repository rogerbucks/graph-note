// A small git repository made for a test, in a folder of its own, for the tests of the tests-first replay and its
// records (spec §12, tests_first). Test code only — nothing here ships in the plugin.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/**
 * A repository whose branch `main` holds one commit for each set of files given, each file written then committed.
 * Gives its folder, the commit ids, `git` to run git in it, `commit` to write and commit another set of files (a file
 * given as null is removed), and `done` to take it away.
 */
export function repository(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  const commit = (files, message) => {
    for (const [file, text] of Object.entries(files)) {
      if (text === null) {
        rmSync(join(dir, file), { force: true });
        continue;
      }
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const ids = commits.map((files, i) => commit(files, `commit ${i}`));
  return { dir, ids, git, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}
