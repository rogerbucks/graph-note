// The sign-off on every commit (spec §13, dco_checked). `public-readiness.mjs --history` runs it on the branch's own
// history, and `--make-public` on every branch and tag.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (root, args) => execFileSync('git', args, { cwd: root, maxBuffer: 2 ** 31 });

/** From this time on, every commit is signed off by a person (Roger, 19 Oct 2026). Older commits stay as they are. */
export const SIGN_OFF_FROM = '2026-10-20T00:00:00Z';
// A bot or an AI: a GitHub App's no-reply address, GitHub's own, or Claude's. None of them can certify a commit.
const MACHINE = /(\[bot\]@users\.noreply\.github\.com|^noreply@github\.com|^noreply@anthropic\.com)$/i;
const BOT = /\[bot\]@users\.noreply\.github\.com$/i;
const SIGN_OFF = /^Signed-off-by: *(.+?) *<([^>]+)> *$/gm;

/**
 * Every commit in the history of `refs` since `from` whose sign-off names no person, each as {where, rule: 'sign-off'}
 * (spec §13, dco_checked). A sign-off naming only a bot or an AI does not count: a commit Claude writes carries Roger's,
 * as he directs that work. Merge commits are left out, and so is a bot's own commit, such as Dependabot's update, as no
 * person wrote it.
 */
export function signOffProblems(root = ROOT, { refs = ['HEAD'], from = SIGN_OFF_FROM } = {}) {
  const since = new Date(from);
  const log = git(root, ['log', ...refs, '--no-merges', '--format=%H%x00%ae%x00%cI%x00%B%x01']).toString();
  const found = [];
  for (const record of log.split('\x01')) {
    const [sha, author, date, message = ''] = record.trim().split('\x00');
    if (!sha || new Date(date) < since || BOT.test(author)) continue;
    const people = [...message.matchAll(SIGN_OFF)].filter(
      ([, name, email]) => !MACHINE.test(email) && name !== 'Claude',
    );
    if (!people.length) found.push({ where: `commit ${sha.slice(0, 8)}`, rule: 'sign-off' });
  }
  return found;
}
