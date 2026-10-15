// What the history check reads in text, a file's or a commit message's (spec §13, Delivery): the content check's rules
// and the secret scan, each problem as {rule, line}. One allowance, for a commit message alone: GitHub's own bot signs
// off its commits with an address at github.com, which names no one.
import { findProblems } from './check-classification.mjs';
import { findSecrets } from './quality-secrets.mjs';

// The one line whose address is allowed: Dependabot's sign-off, one address of 1 to 32 lowercase letters before the
// @, at github.com and nowhere else, and nothing after it. Only the address is set aside, never the line.
const BOT_SIGN_OFF = /^(Signed-off-by: dependabot\[bot\]) <[a-z]{1,32}@github\.com>$/;

/** The problems in a text, each as {rule, line}: confidential or personal content, or a secret. */
export const problemsIn = (text) =>
  [...findProblems(text), ...findSecrets(text)].map((p) => ({ rule: p.rule, line: p.line }));

/**
 * The problems in a commit message. The address on Dependabot's own sign-off line is not read, since it names no one;
 * the rest of that line and every other line are, with their numbers unchanged, and so is that address on any other
 * line, of another sign-off, bot or domain.
 */
export const messageProblems = (message) =>
  problemsIn(
    message
      .split('\n')
      .map((line) => line.replace(BOT_SIGN_OFF, '$1 <>'))
      .join('\n'),
  );
