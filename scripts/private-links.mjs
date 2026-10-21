// No private session links in a commit message (spec §13, no_private_links). `public-readiness.mjs --history` runs it on
// the branch's own history. A link to a private AI chat helps no reader of a public repository. It also leaks where
// the work was done (Roger, 21 Oct 2026).
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** From this time on, no commit carries a private session link. Older ones wait for the history clean-up. */
export const PRIVATE_LINKS_FROM = '2026-10-21T12:00:00Z';
/** A Claude session's trailer, or a link to a Claude session. A link to a public page is fine. */
export const PRIVATE_LINK = /^Claude-Session:|claude\.ai\/code\/session_/im;

/**
 * Every commit in the history of `refs` since `from` whose message holds a private session link, each as
 * {where, rule: 'private link'}. Merge commits are left out: GitHub writes their message from the pull request's title.
 */
export function privateLinkProblems(root = ROOT, { refs = ['HEAD'], from = PRIVATE_LINKS_FROM } = {}) {
  const since = new Date(from);
  const log = execFileSync('git', ['log', ...refs, '--no-merges', '--format=%H%x00%cI%x00%B%x01'], {
    cwd: root,
    maxBuffer: 2 ** 31,
  }).toString();
  const found = [];
  for (const record of log.split('\x01')) {
    const [sha, date, message = ''] = record.trim().split('\x00');
    if (!sha || new Date(date) < since) continue;
    if (PRIVATE_LINK.test(message)) found.push({ where: `commit ${sha.slice(0, 8)}`, rule: 'private link' });
  }
  return found;
}
