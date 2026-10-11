// The paths `.ignore` lists (the file ripgrep reads to keep generated and bulky files out of code searches), and which of
// them are missing. An entry that git ignores is build output, so a fresh checkout need not hold it; every other entry
// that names a file must exist, so a misspelt path is caught. Used by test/cheap-checks.test.js.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The paths `.ignore` lists in the repository at `root`, comments and blank lines left out. */
export function ignoreEntries(root) {
  return readFileSync(join(root, '.ignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** True when git, run in `root`, ignores the path, whether or not it exists. */
function gitIgnores(root, entry) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', entry], { cwd: root, stdio: 'ignore' });
    return true;
  } catch (e) {
    if (e.status === 1) return false;
    throw e;
  }
}

/** The entries naming a file that is neither there nor ignored by git as build output. Folders are not checked. */
export function missingIgnoreEntries(root) {
  return ignoreEntries(root).filter(
    (entry) => !entry.endsWith('/') && !existsSync(join(root, entry)) && !gitIgnores(root, entry),
  );
}
